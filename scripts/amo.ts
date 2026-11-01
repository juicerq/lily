import { $ } from "bun";
import * as v from "valibot";

const Credentials = v.object({
  WEB_EXT_API_KEY: v.pipe(v.string(), v.minLength(1)),
  WEB_EXT_API_SECRET: v.pipe(v.string(), v.minLength(1)),
});

const credentials = v.safeParse(Credentials, process.env);

if (!credentials.success) {
  throw new Error("faltam WEB_EXT_API_KEY e WEB_EXT_API_SECRET no .env");
}

const { version } = await Bun.file("package.json").json();
const sources = `.output/lily-${version}-sources.zip`;

await $`bunx wxt zip -b firefox --mv3`.env({ ...process.env, LILY_AMO: "1" });
await $`bunx web-ext sign --channel listed --source-dir .output/firefox-mv3 --upload-source-code ${sources} --amo-metadata amo/metadata.json --approval-timeout 0 --artifacts-dir .output/amo`;

console.log(`lily ${version} enviada ao AMO. A revisão da Mozilla decide quando ela aparece na loja.`);
