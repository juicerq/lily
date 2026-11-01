import * as v from "valibot";

export const EscapeRequest = v.object({
  type: v.literal("escape"),
  domain: v.pipe(v.string(), v.minLength(1)),
});

export const EscapeResult = v.object({
  ok: v.boolean(),
});

export type EscapeRequest = v.InferOutput<typeof EscapeRequest>;
export type EscapeResult = v.InferOutput<typeof EscapeResult>;
