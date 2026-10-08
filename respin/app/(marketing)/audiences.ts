// Audience landing variants (/for/<slug>): same page shape as the main
// landing, different hero copy, hero photo, and illustrative demo. Pricing,
// steps, refusals, and the closing card are the shared sections — every
// number stays in ./pricing-copy.ts under its landing-pricing.test.ts pin.
// Demo copy is illustrative output SHAPE, like the main page's, and renders
// only while the real Sample Spin (REQ-H02, Phase 10a) is closed by its
// rollout flag; unverifiable specifics in the shot lines render as [check]
// tokens, per REQ-I03.
//
// THE SOLO-FILMING PROMISE IS SCOPED (audit P6-A2, register item 33). The
// women's variant said every idea becomes "shots you can film solo". What
// ships is narrower: concept and script drafts (the two modes whose checks
// include `filming_limits`) are checked against the limits a creator declares,
// and that check has recorded misses (`mode-checks.ts`: `shot-map-kit-not-in-list`,
// `kit-named-in-narrative`). The copy says so; `tests/landing-pricing.test.ts`
// pins "concept and script drafts" to the modes that run the check.

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
      "Scripts that sound like you, with the shots each one suggests to check against how you film. Respin builds your voice rules from your own posts and nothing activates until you confirm it.",
    heroClass: "hero-women",
    h1Lead: "A script that sounds like you,",
    h1Turn: "not like the feed.",
    sub: "Respin builds your voice rules from your own posts. Tell it you film alone and your concept and script drafts are checked against that before you see them; the check can miss things, so read the suggested shots before you film. Nothing activates until you confirm it.",
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
      "Turn what happened at work into a timed script in your voice, with suggested shots. Film it on your phone before close. No marketing team.",
    heroClass: "hero-business",
    h1Lead: "Content from your workday,",
    h1Turn: "not a content calendar.",
    sub: "Respin turns what happened at the shop into a timed script in your voice, with suggested shots. Film it on your phone before close. No marketing team.",
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
