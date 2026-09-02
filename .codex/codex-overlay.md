# Codex workflow overlay

`CLAUDE.md` and `.claude/**` are read-only shared upstream canon. Generated wrappers must read the canonical source first, then this overlay.

- Orchestration: `gpt-5.6-sol` / `xhigh`; reviewers: Sol / `max`; high-risk implementation (money, tenancy, migrations, external writes): Sol / `high`.
- Ordinary implementation: `gpt-5.6-terra` / `high`; exploration: Terra / `medium`; deterministic verification: `gpt-5.6-luna` / `low`.
- No Ultra or proactive delegation by default; maximum four active agents. Use targeted context and stable review manifests.
- Run focused checks during implementation, then every applicable full CLAUDE.md gate once stable. This never reduces quality or required reviews.
- A requested nested Codex self-review is performed directly and disclosed as lacking an independent cross-model check.
