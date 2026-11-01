import * as v from "valibot";
import { browser } from "wxt/browser";

import { SLOTS_PER_DAY } from "@/lib/time";

const DaySlots = v.pipe(v.string(), v.regex(/^[01]{48}$/));

export const SiteRule = v.object({
  domain: v.pipe(v.string(), v.minLength(1)),
  quotaMinutes: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  followSchedule: v.boolean(),
});

export const Config = v.object({
  schedule: v.pipe(v.array(DaySlots), v.length(7)),
  sites: v.array(SiteRule),
  escape: v.boolean(),
  warn: v.boolean(),
});

export type SiteRule = v.InferOutput<typeof SiteRule>;
export type Config = v.InferOutput<typeof Config>;

function workdays() {
  const day = Array.from({ length: SLOTS_PER_DAY }, (_, slot) =>
    (slot >= 18 && slot < 24) || (slot >= 28 && slot < 36) ? "1" : "0",
  ).join("");
  const off = "0".repeat(SLOTS_PER_DAY);

  return [day, day, day, day, day, off, off];
}

export const defaultConfig: Config = {
  schedule: workdays(),
  sites: [],
  escape: true,
  warn: true,
};

export function parseConfig(raw: unknown) {
  if (raw === undefined) {
    return defaultConfig;
  }

  const parsed = v.safeParse(Config, raw);

  if (!parsed.success) {
    console.error("lily: config inválida", v.summarize(parsed.issues));
    return defaultConfig;
  }

  return parsed.output;
}

export async function loadConfig() {
  const { config } = await browser.storage.local.get("config");

  return parseConfig(config);
}

export async function saveConfig(config: Config) {
  const plain: Config = JSON.parse(JSON.stringify(config));

  await browser.storage.local.set({ config: plain });
}
