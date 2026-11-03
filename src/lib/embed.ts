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
  v.object({ type: v.literal("MEASURE"), details: v.object({ height: v.number() }) }),
  v.transform((message) => message.details.height),
);

const EMBEDS = [
  {
    domains: ["x.com", "twitter.com"],
    path: /^\/[^/]+(?:\/web)?\/status\/(\d+)/,
    src: (id: string) => `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`,
    height: TweetHeight,
  },
  {
    domains: ["instagram.com"],
    path: /^\/(?:[^/]+\/)?(?:p|reels?|tv)\/([\w-]+)/,
    src: (code: string) => `https://www.instagram.com/p/${code}/embed/captioned/`,
    height: InstagramHeight,
  },
];

export function embedOf(url: string) {
  const host = hostOf(url);

  if (!host) {
    return null;
  }

  const embed = EMBEDS.find((entry) => entry.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
  const id = embed && new URL(url).pathname.match(embed.path)?.[1];

  if (!embed || !id) {
    return null;
  }

  return { src: embed.src(id), height: embed.height };
}
