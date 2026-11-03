import * as v from "valibot";

import { hostOf } from "@/lib/rules";

const TweetHeight = v.pipe(
  v.object({
    "twttr.embed": v.object({
      method: v.literal("twttr.private.resize"),
      params: v.tuple([v.object({ height: v.number() })]),
    }),
  }),
  v.transform((message) => message["twttr.embed"].params[0].height),
);

const InstagramHeight = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({ type: v.literal("MEASURE"), details: v.object({ height: v.pipe(v.number(), v.minValue(1)) }) }),
  v.transform((message) => message.details.height),
);

const EMBEDS = [
  {
    domains: ["x.com", "twitter.com"],
    kind: "post",
    path: /^\/[^/]+(?:\/web)?\/status\/(\d+)/,
    src: (id: string) => `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`,
    height: TweetHeight,
  },
  {
    domains: ["instagram.com"],
    kind: "post",
    path: /^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([\w-]+)/,
    src: (code: string) => `https://www.instagram.com/p/${code}/embed/captioned/`,
    height: InstagramHeight,
  },
  {
    domains: ["instagram.com"],
    kind: "profile",
    path: /^\/([\w.]+)\/?$/,
    src: (user: string) => `https://www.instagram.com/${user}/embed/`,
    height: InstagramHeight,
  },
] as const;

export function embedOf(url: string) {
  const host = hostOf(url);

  if (!host) {
    return null;
  }

  const { pathname } = new URL(url);

  for (const embed of EMBEDS) {
    const id = pathname.match(embed.path)?.[1];

    if (id && embed.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return { src: embed.src(id), height: embed.height, kind: embed.kind };
    }
  }

  return null;
}
