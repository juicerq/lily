import { $ } from "bun";
import * as v from "valibot";

const REPO = "juicerq/lily";
const ADDON_ID = "lily@juicerq";
const BUMPS = ["patch", "minor", "major"] as const;

type Bump = (typeof BUMPS)[number];

const UpdateEntry = v.object({
  version: v.string(),
  update_link: v.pipe(v.string(), v.url()),
  update_hash: v.pipe(v.string(), v.startsWith("sha256:")),
});

const UpdatesFile = v.object({
  addons: v.object({ [ADDON_ID]: v.object({ updates: v.array(UpdateEntry) }) }),
});

type UpdateEntry = v.InferOutput<typeof UpdateEntry>;

function parseBump(input: string | undefined): Bump {
  const bump = input ?? "patch";
  const known = BUMPS.find((name) => name === bump);

  if (!known) {
    throw new Error(`bump inválido: ${bump}. Use ${BUMPS.join(", ")}.`);
  }

  return known;
}

function nextVersion(current: string, bump: Bump) {
  const [major = 0, minor = 0, patch = 0] = current.split(".").map(Number);

  if (bump === "major") {
    return `${major + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

async function readUpdates(): Promise<UpdateEntry[]> {
  const file = Bun.file("updates.json");

  if (!(await file.exists())) {
    return [];
  }

  const parsed = v.parse(UpdatesFile, await file.json());

  return parsed.addons[ADDON_ID].updates;
}

async function ensureCleanMain() {
  const branch = (await $`git branch --show-current`.text()).trim();

  if (branch !== "main") {
    throw new Error(`release só sai do main, branch atual: ${branch}`);
  }

  const status = (await $`git status --porcelain`.text()).trim();

  if (status) {
    throw new Error(`há mudanças sem commit:\n${status}`);
  }
}

const bump = parseBump(Bun.argv[2]);

await ensureCleanMain();

const pkg = await Bun.file("package.json").json();
const version = nextVersion(pkg.version, bump);
const tag = `v${version}`;
const previousTag = (await $`git describe --tags --abbrev=0`.nothrow().text()).trim();

pkg.version = version;
await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

await $`bun run check`;
await $`bun run lint`;
await $`bunx wxt zip -b firefox --mv3`;

const zip = `.output/lily-${version}-firefox.zip`;
const xpi = `.output/lily-${version}.xpi`;

await $`cp ${zip} ${xpi}`;
await $`cp ${zip} .output/lily.xpi`;

const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(xpi).arrayBuffer()).digest("hex");
const entry: UpdateEntry = {
  version,
  update_link: `https://github.com/${REPO}/releases/download/${tag}/lily-${version}.xpi`,
  update_hash: `sha256:${hash}`,
};
const updates = [...(await readUpdates()), entry];

await Bun.write("updates.json", `${JSON.stringify({ addons: { [ADDON_ID]: { updates } } }, null, 2)}\n`);

const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
const notes = (await $`git log ${range} --pretty=format:- %s`.text()).trim() || "- Sem mudanças listadas";

await $`git add package.json updates.json`;
await $`git commit -q -m ${`Release ${tag}`}`;
await $`git tag ${tag}`;
await $`git push origin ${tag}`;
await $`gh release create ${tag} ${xpi} --repo ${REPO} --title ${tag} --notes ${notes}`;
await $`git push origin main`;

console.log(`lily ${tag} publicada. O Zen instala na próxima checagem de atualizações.`);
