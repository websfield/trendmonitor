import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../app");
const selectedProfileFiles = [
  path.join(appRoot, "(product)/onboarding/page.tsx"),
  path.join(appRoot, "(product)/onboarding/interview/page.tsx"),
  path.join(appRoot, "(product)/brain/page.tsx"),
];

function firstProfileFallbacks(source: string): string[] {
  return source.match(/profiles\s*(?:\[\s*0\s*\]|\.at\(\s*0\s*\))/g) ?? [];
}

function rawSafetyImports(source: string): string[] {
  const forbidden = [
    "evaluateReferenceSafety",
    "loadReferenceSafetyContext",
    "workspaceWriteCapabilities",
    "writeCapabilities",
  ];
  return forbidden.filter((name) => source.includes(name));
}

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("Slice 4c app boundaries", () => {
  it("has a planted witness for the first-profile fallback scanner", () => {
    expect(firstProfileFallbacks("const profile = profiles[0]")).toEqual(["profiles[0]"]);
    expect(firstProfileFallbacks("const profile = profiles.at(0)")).toEqual(["profiles.at(0)"]);
  });

  it("does not choose the first profile in onboarding, interview, or brain", () => {
    for (const file of selectedProfileFiles) {
      expect(firstProfileFallbacks(fs.readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("has a planted witness for the raw safety primitive scanner", () => {
    expect(rawSafetyImports("evaluateReferenceSafety(candidate)")).toEqual([
      "evaluateReferenceSafety",
    ]);
  });

  it("keeps raw safety decisions and write capabilities outside app code", () => {
    const violations = sourceFiles(appRoot).flatMap((file) =>
      rawSafetyImports(fs.readFileSync(file, "utf8")).map((name) => ({ file, name })),
    );
    expect(violations).toEqual([]);
  });

  it("keeps the candidate form native, pending-aware and free of client scope", () => {
    const source = fs.readFileSync(
      path.join(
        appRoot,
        "(product)/onboarding/candidate-safety-panel.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("<textarea");
    expect(source).toContain('name="candidate"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("isPending");
    expect(source).toContain('pendingLabel="Checking this draft…"');
    expect(source).not.toMatch(/name="(?:profileId|corpusIds|previewToken)"/);
  });

  it("renders native profile switch and add forms", () => {
    const source = fs.readFileSync(
      path.join(
        appRoot,
        "(product)/onboarding/creator-profile-panel.tsx",
      ),
      "utf8",
    );
    expect(source).toContain('htmlFor="active-profile"');
    expect(source).toContain("<select");
    expect(source).toContain('name="profileId"');
    expect(source).toContain("Switch profile");
    expect(source).toContain("Add another creator");
    expect(source).toContain('name="displayName"');
  });

  it("pins rendered mutations and exports to the profile shown", () => {
    const onboarding = fs.readFileSync(selectedProfileFiles[0], "utf8");
    const interview = fs.readFileSync(selectedProfileFiles[1], "utf8");
    const brain = fs.readFileSync(selectedProfileFiles[2], "utf8");

    expect(onboarding.match(/bind\(null, selectedProfile\.id\)/g)?.length).toBe(
      4,
    );
    expect(interview.match(/bind\(null, profile\.id\)/g)?.length).toBe(3);
    expect(brain.match(/bind\(null, profile\.id,/g)?.length).toBeGreaterThan(8);
    expect(brain).toContain("encodeURIComponent(profile.id)");
  });
});
