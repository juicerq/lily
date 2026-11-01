import * as v from "valibot";

import { dayKey, startOfDay } from "@/lib/time";

export const Usage = v.object({
  day: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  seconds: v.record(v.string(), v.number()),
  escapes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  allow: v.record(v.string(), v.number()),
});

export const Session = v.object({
  domain: v.pipe(v.string(), v.minLength(1)),
  start: v.number(),
});

export type Usage = v.InferOutput<typeof Usage>;
export type Session = v.InferOutput<typeof Session>;

export const MAX_ESCAPES = 2;
export const ESCAPE_SECONDS = 5 * 60;

function emptyUsage(now: Date): Usage {
  return { day: dayKey(now), seconds: {}, escapes: 0, allow: {} };
}

export function parseUsage(raw: unknown, now: Date) {
  if (raw === undefined) {
    return emptyUsage(now);
  }

  const parsed = v.safeParse(Usage, raw);

  if (!parsed.success) {
    console.error("lily: uso inválido", v.summarize(parsed.issues));
    return emptyUsage(now);
  }

  if (parsed.output.day !== dayKey(now)) {
    return emptyUsage(now);
  }

  return parsed.output;
}

export function parseSession(raw: unknown) {
  if (raw === undefined || raw === null) {
    return null;
  }

  const parsed = v.safeParse(Session, raw);

  if (!parsed.success) {
    console.error("lily: sessão inválida", v.summarize(parsed.issues));
    return null;
  }

  return parsed.output;
}

export function sessionSeconds(session: Session, now: Date) {
  const from = Math.max(session.start, startOfDay(now).getTime());

  return Math.max(0, (now.getTime() - from) / 1000);
}

export function usedSeconds(input: { usage: Usage; session: Session | null; domain: string; now: Date }) {
  const stored = input.usage.seconds[input.domain] ?? 0;

  if (input.session?.domain !== input.domain) {
    return stored;
  }

  return stored + sessionSeconds(input.session, input.now);
}
