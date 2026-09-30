// Plural filename: icon.tsx is a Next metadata-route convention.
const ICONS = {
  studio: "film-slate", references: "article", brain: "brain", results: "chart-line-up",
  onboarding: "user-focus", usage: "coins", billing: "credit-card", account: "user-circle",
  idea: "lightbulb", material: "file-text", check: "check-circle", arrow: "arrow-right",
  menu: "menu", sun: "sun", moon: "moon",
} as const;

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="icon" aria-hidden="true" focusable="false">
    <use href={`/illustrations/studio.svg#icon-${ICONS[name]}`} />
  </svg>;
}

export function Brand() {
  return <span className="brand">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    Respin
  </span>;
}
