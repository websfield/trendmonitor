// The one screenshot per persona that a green run MUST contain — the "main
// chapter" the CI scan (scripts/scan-journey-notes.ts) checks for by suffix
// (`*-<name>.png`, because artifacts.ts prefixes every shot with a running
// number). A plain module, imported by each spec AND by the scan: a spec file
// cannot be imported outside the Playwright runner because its top-level
// `test()` throws, so the names live here rather than in the specs.
//
// Each name is taken at a point EVERY green branch of its spec reaches — a
// name pinned to the usable path alone would fail an otherwise-green run in
// which the operator's voice build was honestly refused (record-and-continue,
// owner decision 2026-09-15). No name here may be a suffix of a bootstrap
// screenshot name (`admin-bootstrap-identity-created`), or the suffix match
// would accept the bootstrap's own shot as the admin persona's.
export const MAIN_CHAPTERS = {
  "solo-creator": "own-posts-saved",
  "studio-operator": "brain-activated",
  "editor-seat": "studio-blocked-or-result",
  "platform-admin": "admin-config-read",
} as const;

export type Persona = keyof typeof MAIN_CHAPTERS;

export const PERSONAS = Object.keys(MAIN_CHAPTERS) as readonly Persona[];

/** The personas whose specs press "Build my voice brain" and therefore write consumption records. */
export const VOICE_PRESS_PERSONAS = ["solo-creator", "studio-operator"] as const satisfies readonly Persona[];
