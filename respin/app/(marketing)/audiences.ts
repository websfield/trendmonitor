// Audience landing variants (/for/<slug>): same page shape as the main
// landing, different hero copy, hero photo, and illustrative demo. Pricing,
// steps, refusals, and the closing card are the shared sections — every
// number stays in ./pricing-copy.ts under its landing-pricing.test.ts pin.
// Demo copy is illustrative output SHAPE, like the main page's, and renders
// only while the real Sample Spin (REQ-H02, Phase 10a) is closed by its
// rollout flag; unverifiable specifics in the shot lines render as [check]
// tokens, per REQ-I03.

export type DemoCopy = {
  slop: [string, string];
  critique: string;
  hook: { tc: string; text: string };
  turn: { tc: string; text: string };
  shot: string;
};

export type Audience = {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  heroClass: string;
  h1Lead: string;
  h1Turn: string;
  sub: string;
  demo: DemoCopy;
};

export const AUDIENCES: Audience[] = [
  {
    slug: "women",
    navLabel: "For women creators",
    metaTitle: "Respin for women creators",
    metaDescription:
      "Scripts that sound like you, mapped to shots you can film solo. Respin builds your voice rules from your own posts and nothing activates until you confirm it.",
    heroClass: "hero-women",
    h1Lead: "A script that sounds like you,",
    h1Turn: "not like the feed.",
    sub: "Respin builds your voice rules from your own posts and turns every idea into shots you can film solo. Nothing activates until you confirm it.",
    demo: {
      slop: [
        "“Hey besties! Today I’m spilling my number one glow-up secret that will literally change your life…”",
        "“Make sure you follow for more girl talk! Okay so basically…”",
      ],
      critique:
        "No timestamps. No shots. Nothing in it could only have come from you.",
      hook: {
        tc: "00:00",
        text: "The product that finally cleared my skin is the one nobody films.",
      },
      turn: {
        tc: "00:12",
        text: "The active ingredient was never the serum. It was the boring routine.",
      },
      shot: "Your clip [check]: the shelf pan in morning light. Empties on screen at 00:18.",
    },
  },
  {
    slug: "business",
    navLabel: "For small business",
    metaTitle: "Respin for small business",
    metaDescription:
      "Turn what happened at work into a shot-mapped script in your voice. Film it on your phone before close. No marketing team.",
    heroClass: "hero-business",
    h1Lead: "Content from your workday,",
    h1Turn: "not a content calendar.",
    sub: "Respin turns what happened at the shop into a shot-mapped script in your voice. Film it on your phone before close. No marketing team.",
    demo: {
      slop: [
        "“Welcome back to our small business journey! Today we’re sharing 5 tips every entrepreneur needs to know…”",
        "“Smash that follow button and let’s grow together! First up…”",
      ],
      critique:
        "No timestamps. No shots. Nothing in it could only have come from you.",
      hook: {
        tc: "00:00",
        text: "We bin every croissant left at 4pm. On purpose.",
      },
      turn: {
        tc: "00:10",
        text: "Freshness is not a sign on the wall. It is what you refuse to sell.",
      },
      shot: "Your clip [check]: the 6am tray pull, counter angle. Timer on screen at 00:15.",
    },
  },
  {
    slug: "coaches",
    navLabel: "For coaches",
    metaTitle: "Respin for coaches",
    metaDescription:
      "Scripts built from what you already know works with clients, in your voice, with every number, date and name checked for where it came from.",
    heroClass: "hero-coaches",
    h1Lead: "Turn what you coach into content,",
    h1Turn: "without sounding like an ad.",
    sub: "Respin builds scripts from what you already know works with clients, in your voice. It checks where every number, date and name came from, and offers a [check] marker instead of changing your words.",
    demo: {
      slop: [
        "“What’s up team! Today we’re covering the top 5 mistakes beginners make that are killing your progress…”",
        "“Drop a comment if you’re ready to level up! Number one…”",
      ],
      critique:
        "No timestamps. No shots. Nothing in it could only have come from you.",
      hook: {
        tc: "00:00",
        text: "My most consistent client ate more, not less.",
      },
      turn: {
        tc: "00:13",
        text: "The deficit was never the problem. The weekend was.",
      },
      shot: "Your clip [check]: the whiteboard check-in sheet, desk angle. Chart on screen at 00:20.",
    },
  },
];

export function getAudience(slug: string): Audience | undefined {
  return AUDIENCES.find((a) => a.slug === slug);
}
