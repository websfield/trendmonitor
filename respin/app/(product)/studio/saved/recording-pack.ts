// THE COPIED SCRIPT AND THE MARKDOWN RECORDING PACK (launch L4, R-153).
//
// PURE: one `SavedPackView` in, one string out — no database, no network, no
// clock — so copying and exporting cannot spend anything, and both read the
// SAME projected version the page renders (`savedPackFor`).
//
// WHAT BOTH CARRY, and where each line comes from — every one of them a value
// the server owns or product copy, never a judgement the model made about
// itself:
//   - the draft's own text, unchanged (its `[check]` marks included);
//   - the server's filming marks, through the projection's `presentedFilming` /
//     `presentedShotMap` reading (R-150 point 2);
//   - the confirmation item every version-2 draft carries (R-150 point 3);
//   - every finding the stored checks reported, outside the model's disclosure
//     section (the facade read already dropped those);
//   - the weakest point, through `whyThisPerformsView` (REQ-I04);
//   - the product's deterministic disclosure guidance, never the model's.
//
// MARKDOWN INJECTION, FIXED AT THE ONE BUILDER (R-153 amendment B1/B3). Draft
// text, a reference title and a creator's rule are text this file did not
// write; inside a Markdown file a `![x](https://…)` would load a remote image
// when the file is opened, `<img>` would be raw HTML, a `[check]: https://…`
// reference definition would turn every `[check]` in the file into a link, a
// `~~~` or a leading `#` / `>` would swallow or forge the sections after it,
// and a bare `https://…` would become a live autolink. EVERY such value goes
// through `md()`, which (1) collapses it to one line, so no value ever spans a
// line of its own; (2) escapes, anywhere in it, what can open HTML, code, an
// image, an inline link, an autolink, a reference definition (`]:`), a
// footnote (`[^`) or a table cell (`|`), and breaks bare-URL and e-mail
// autolinks (`https\://`, `http\://`, `www\.`, `name\@host`); and (3)
// neutralises the marker it
// STARTS with — a heading, quote, list, ordered list, rule, setext underline,
// fence, table or task box — because many values are placed at a line or
// list-item start (a caption, a thesis's why, a shot, a check). `[check]`
// stays literal: with no reference definition possible anywhere in the file
// it is never a link. Proved per shape, on escaped bytes, in
// `tests/studio-ui.test.tsx` (no Markdown parser is installed here).
import {
  FILMING_UNCONFIRMED_NOTE,
  PEOPLE_SENTENCES,
  PIVOT_SENTENCES,
  basisSentence,
  checkOffer,
  claimFamilyNote,
  minutesSentence,
  traceabilityFlagNote,
  whyThisPerformsView,
} from "../run-copy";
import { filmingUnconfirmed } from "../generation-outcome";
import type { CreativeLine, SavedPackView } from "../run-state";
import {
  CHECKS_UNREADABLE,
  DISCLOSURE_ADVICE_WITHHELD,
  EXPORT_FOOTER,
  REFERENCE_UNAVAILABLE,
  SOURCE_ATTRIBUTION,
  SOURCE_CHECKED_REVISED,
  SOURCE_CHECKED_SOURCE,
  SPIN_GATE_PASSED,
  formatSavedAt,
  referenceAttribution,
} from "./saved-copy";

/**
 * A line-start Markdown marker: ATX heading, block quote, bullet (`-` `+`
 * `*`), setext underline / thematic break (`=` `-` `_` `*`), table pipe,
 * fence (`~` and the backtick, which is already escaped everywhere), task-box
 * or reference bracket, and an ordered-list number followed by `.` or `)`.
 */
const LINE_START_MARKER = /^(?:[#>+*=|~_\-[]|\d{1,9}[.)])/;

/**
 * One value as safe Markdown: one line, no HTML, code, image, link, autolink,
 * reference definition, footnote or table syntax anywhere, and no block
 * marker at its start (see the header). Every value this file places in the
 * export goes through it.
 */
export function md(text: string): string {
  const inline = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/([<>`|])/g, "\\$1")
    .replace(/!\[/g, "!\\[")
    .replace(/\]\(/g, "]\\(")
    .replace(/\]:/g, "]\\:")
    .replace(/\[\^/g, "\\[^")
    .replace(/\b(https?):\/\//gi, "$1\\://")
    .replace(/\b(www)\./gi, "$1\\.")
    .replace(/(\w)@(?=\w)/g, "$1\\@");
  const marker = LINE_START_MARKER.exec(inline);
  if (marker === null) return inline;
  // A number's marker is its `.` or `)`; every other marker is its first character.
  return /^\d/.test(marker[0])
    ? `${marker[0].slice(0, -1)}\\${marker[0].slice(-1)}${inline.slice(marker[0].length)}`
    : `\\${inline}`;
}

function filmingLine(line: CreativeLine): string {
  const kit = line.filming.equipment.map((e) => e.text).join(", ");
  return [
    `${line.filming.location.text}${kit === "" ? "" : `; ${kit}`}.`,
    PEOPLE_SENTENCES[line.filming.people] ?? "",
    minutesSentence(line.filming.minutes),
  ]
    .filter((s) => s !== "")
    .join(" ");
}

/**
 * THE OPEN CHECKS of one saved version, in a fixed order — each one a sentence
 * the creator has to act on before filming. Never empty for a usable draft:
 * the weakest point is always the last line (or the sentence saying why it is
 * withheld).
 */
/** Where a finding sits: its sentence, or only its field on a refused draft (not shown). */
function where(finding: { unit: string | null; field: string }): string {
  return finding.unit === null ? `(at ${finding.field})` : `(in "${finding.unit}")`;
}

export function packChecks(pack: SavedPackView): string[] {
  const doc = pack.document;
  const out: string[] = [];
  if (doc?.creative?.eventConfirmation) out.push(doc.creative.eventConfirmation);
  // THE SCREEN'S OWN PREDICATE, so the page's legend and the export's agree.
  if (doc && filmingUnconfirmed(doc)) out.push(FILMING_UNCONFIRMED_NOTE);
  const premises: { label: string; line: CreativeLine }[] = [
    ...(doc?.creative?.script ? [{ label: "The premise", line: doc.creative.script }] : []),
    ...(doc?.ideas ?? []).flatMap((idea, i) =>
      idea.creative ? [{ label: `Concept ${i + 1}`, line: idea.creative }] : []
    ),
  ];
  for (const p of premises) out.push(`${p.label}: ${basisSentence(p.line.premise.basis)}`);
  if (pack.checks === null) {
    out.push(CHECKS_UNREADABLE);
  } else {
    for (const f of pack.checks.traceability) {
      out.push(
        f.enforcement === "hard"
          ? `Not found in your brain or in what you typed: "${f.token}" ${where(f)}. Confirm it, or use "${checkOffer(f.token)}".`
          : `Look again at "${f.token}" ${where(f)} ${traceabilityFlagNote(f.kind)}.`
      );
    }
    for (const c of pack.checks.claims) {
      out.push(`"${c.token}" ${where(c)}: ${claimFamilyNote(c.family)}.`);
    }
    // `note` is the CREATOR's rule, never the scoring model's note (A1).
    for (const v of pack.checks.verdicts) {
      if (!v.passed) out.push(`This draft did not pass ${v.note}.`);
    }
  }
  if (doc) {
    const why = whyThisPerformsView(doc.whyThisPerforms);
    out.push(why.ok ? `Weakest point: ${why.weakestPoint}` : why.note);
  }
  return out;
}

/** The spoken script as plain text, with its open checks and the disclosure. */
export function scriptText(pack: SavedPackView): string {
  const doc = pack.document;
  if (doc === null) return "";
  const lines: string[] = [`${pack.modeLabel}, saved ${formatSavedAt(pack.createdAt)}`, ""];
  const premise = doc.creative?.script?.premise;
  if (premise) {
    lines.push(`What happens: ${premise.whatHappens}`);
    lines.push(`Why it is interesting: ${premise.interest}`);
    lines.push(`The payoff: ${premise.payoff}`, "");
  }
  if (doc.thesis) lines.push(`Thesis: ${doc.thesis.statement}`, "");
  if (doc.hooks) {
    lines.push("Hooks:");
    doc.hooks.forEach((h, i) => lines.push(`${i + 1}. ${h.text}`));
    lines.push("");
  }
  if (doc.ideas) {
    lines.push("Ideas:");
    doc.ideas.forEach((idea, i) => lines.push(`${i + 1}. ${idea.hook} (${idea.thesis})`));
    lines.push("");
  }
  if (doc.beats) {
    lines.push("Script:");
    for (const b of doc.beats) {
      lines.push(`${b.atSeconds}s  ${b.vo}${b.isTurn ? `  (${PIVOT_SENTENCES[b.pivot ?? "turn"]})` : ""}`);
    }
    lines.push("");
  }
  if (doc.onScreenText) {
    lines.push("On-screen text:");
    for (const t of doc.onScreenText) lines.push(`${t.atSeconds}s  ${t.text}`);
    lines.push("");
  }
  if (doc.caption) {
    lines.push(`Caption: ${doc.caption.text}`);
    if (doc.caption.hashtags.length > 0) lines.push(doc.caption.hashtags.join(" "));
    lines.push("");
  }
  lines.push("Before you film:");
  for (const c of packChecks(pack)) lines.push(`- ${c}`);
  lines.push("", `Disclosure: ${pack.disclosureGuidance}`);
  return lines.join("\n");
}

/** The Markdown recording pack — the export file's whole content. */
export function recordingPackMarkdown(pack: SavedPackView): string {
  const doc = pack.document;
  const out: string[] = [
    `# Recording pack: ${md(pack.modeLabel)}`,
    "",
    `Saved ${formatSavedAt(pack.createdAt)}${pack.platform.trim() === "" ? "" : ` for ${md(pack.platform)}`}.`,
  ];
  if (pack.piece?.isSelected) out.push("", "This is the version its piece uses.");
  // ATTRIBUTION (R-153 amendment A2): what a Spin or a source reel was made from.
  const reference = referenceLines(pack, doc !== null);
  if (reference.length > 0) out.push("", "## What this was made from", "", ...reference);
  if (doc === null) {
    out.push("", "This version is an honest refusal: no draft was saved, so there is no script to film.");
    if (pack.disclosureAdviceWithheld) out.push("", md(DISCLOSURE_ADVICE_WITHHELD));
    return out.join("\n") + "\n";
  }

  out.push("", "## Script");
  const premise = doc.creative?.script;
  if (premise) {
    out.push(
      "",
      `**What happens:** ${md(premise.premise.whatHappens)}`,
      "",
      `**Why it is interesting:** ${md(premise.premise.interest)}`,
      "",
      `**The payoff:** ${md(premise.premise.payoff)}`
    );
  }
  if (doc.thesis) out.push("", `**Thesis:** ${md(doc.thesis.statement)}`, "", md(doc.thesis.why));
  if (doc.framework) out.push("", `**Structure:** ${md(doc.framework.name)}`);
  if (doc.hooks) {
    out.push("", "### Hooks", "");
    doc.hooks.forEach((h, i) => out.push(`${i + 1}. ${md(h.text)} (mechanic: ${md(h.mechanic)})`));
  }
  if (doc.ideas) {
    out.push("", "### Ideas", "");
    doc.ideas.forEach((idea, i) => {
      out.push(`${i + 1}. ${md(idea.hook)}`);
      out.push(`   - Thesis: ${md(idea.thesis)}`);
      out.push(`   - Structure: ${md(idea.framework)}`);
      if (idea.creative) {
        out.push(`   - What happens: ${md(idea.creative.premise.whatHappens)}`);
        out.push(`   - Filming: ${md(filmingLine(idea.creative))}`);
      }
    });
  }
  if (doc.beats) {
    out.push("", "### Beat by beat", "");
    for (const b of doc.beats) {
      out.push(
        `- **${b.atSeconds}s** ${md(b.vo)}${b.isTurn ? ` _(${md(PIVOT_SENTENCES[b.pivot ?? "turn"])})_` : ""}`
      );
    }
  }
  if (doc.onScreenText) {
    out.push("", "### On-screen text", "");
    for (const t of doc.onScreenText) out.push(`- **${t.atSeconds}s** ${md(t.text)}`);
  }
  if (doc.caption) {
    out.push("", "### Caption", "", md(doc.caption.text));
    if (doc.caption.hashtags.length > 0) out.push("", md(doc.caption.hashtags.join(" ")));
  }

  out.push("", "## Shooting plan");
  const plan = doc.creative?.script;
  if (!plan && !doc.shotMap) {
    out.push("", "This draft has no shooting plan: the kind of draft it is does not produce one.");
  }
  if (plan) out.push("", `**What filming it needs:** ${md(filmingLine(plan))}`);
  if (doc.shotMap) {
    out.push("", "### Shot checklist", "");
    for (const s of doc.shotMap) {
      out.push(`- [ ] Beat ${s.beatIndex + 1}: ${md(s.shot)} (${md(s.note)})`);
    }
  }

  out.push("", "## Checks before you film", "");
  for (const c of packChecks(pack)) out.push(`- ${md(c)}`);
  const why = whyThisPerformsView(doc.whyThisPerforms);
  if (why.ok) out.push("", "### Why this performs", "", md(why.reasoning));

  out.push("", "## Disclosure", "", md(pack.disclosureGuidance));
  out.push("", "---", "", md(EXPORT_FOOTER));
  return out.join("\n") + "\n";
}

/** The attribution paragraphs, each one line through `md()`; empty for other modes. */
function referenceLines(pack: SavedPackView, hasDraft: boolean): string[] {
  const ref = pack.reference;
  if (ref === null) return [];
  if (ref.kind === "spin") {
    if (ref.summary === null) return [md(REFERENCE_UNAVAILABLE)];
    return [
      md(referenceAttribution(ref.summary)),
      ...(hasDraft ? ["", md(SPIN_GATE_PASSED)] : []),
    ];
  }
  return [
    md(SOURCE_ATTRIBUTION),
    ...(hasDraft
      ? ["", md(ref.checkedAgainst === "source" ? SOURCE_CHECKED_SOURCE : SOURCE_CHECKED_REVISED)]
      : []),
  ];
}

/** The export's file name: the attempt id, reduced to safe characters. */
export function packFileName(pack: SavedPackView): string {
  const safe = pack.attemptId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || "draft";
  return `respin-recording-pack-${safe}.md`;
}
