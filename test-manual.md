# Test Manual — UGC Intelligence

A hands-on guide to running every local check yourself, plus manually driving the UI to
eyeball the three fixes made on 2026-07-15. Written for a Windows box using **PowerShell**
(the repo's primary shell); the commands also work in Git Bash.

> **Status after this session:** the full entry gate is green — schemas parse, `ruff`
> clean, `dotnet build` 0/0, `pytest` 261 passed, `dotnet test` 454 passed, frontend
> `typecheck` clean, frontend `vitest` **86/86 passed**.

---

## 0. Prerequisites (verified present on this machine)

| Tool | Version seen | Used for |
|---|---|---|
| Node | v20.9.0 | frontend + schema-parse gate |
| .NET SDK | 10.0.203 | control plane (C2/C3/C4) build + tests |
| uv | 0.9.28 | Python intelligence plane |
| npm | 10.1.0 | frontend deps + scripts |

Run everything from the repo root: `c:\projects\ai.playground\trendMonitor`.

**One-time repair (already done this session):** the frontend `node_modules` shipped
incomplete — `tsc` was missing, so `typecheck`/`test` failed with *"'tsc' is not
recognized"*. If you hit that again, repair it:

```powershell
npm --prefix src/Frontend install     # or: npm --prefix src/Frontend ci
```

---

## 1. Run the whole gate (fastest path)

Paste this block into **PowerShell** at the repo root. Each line is one gate from
`CLAUDE.md`; expected result is in the comment.

```powershell
# Entry gate: the three contract schemas parse
node -e "['docs/initial/schemas/rubric-v1.json','docs/initial/schemas/events-v1.json','docs/initial/schemas/mechanisms-v1.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f,'utf8')))"
#   -> no output = OK

dotnet build UgcIntelligence.slnx           #   -> Build succeeded. 0 Warning(s) 0 Error(s)
dotnet test tests/Architecture              #   -> Passed! Failed: 0, Passed: 454
uv run --with pytest pytest tests/Architecture          #   -> 261 passed
uv run --with ruff ruff check src/IntelligencePlane tests/Architecture   #   -> All checks passed!
npm --prefix src/Frontend run typecheck     #   -> gen:types then tsc, no errors
npm --prefix src/Frontend test              #   -> Test Files 10 passed | Tests 86 passed
```

> **Gotcha (Git Bash only):** the Bash tool's working directory persists between
> commands. If you `cd src/Frontend` and then run `npm --prefix src/Frontend ...`, the
> path doubles (`src/Frontend/src/Frontend`) and npm errors with *ENOENT ... package.json*.
> Use the `--prefix` form from the repo root (as above) or an absolute prefix. PowerShell
> users are unaffected.
>
> The `/c/Users/FredWang/.bashrc: line 1: ...export: command not found` line in Git Bash
> is harmless shell-profile noise — ignore it.

---

## 2. Run each suite individually

### 2a. Contract schemas (entry gate)
```powershell
node -e "['docs/initial/schemas/rubric-v1.json','docs/initial/schemas/events-v1.json','docs/initial/schemas/mechanisms-v1.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f,'utf8')))"
```
Silent exit = all three JSON contracts parse.

### 2b. Control plane — .NET (C2 / C3 / C4 + shared libs)
```powershell
dotnet build UgcIntelligence.slnx      # .NET 10 emits .slnx, not .sln
dotnet test tests/Architecture         # architecture assertions, not the model
```
Expect **454 passed, 0 failed**.

### 2c. Intelligence plane — Python (C1 + extraction)
```powershell
uv run --with pytest pytest tests/Architecture
uv run --with ruff ruff check src/IntelligencePlane tests/Architecture
```
Expect **261 passed** and **All checks passed!**. (Casing matters on Linux — the folder
is `tests/Architecture`.)

### 2d. Frontend — manager UI (React/TS)
```powershell
npm --prefix src/Frontend run typecheck   # regenerates types from schemas, then tsc --noEmit
npm --prefix src/Frontend test            # vitest run
npm --prefix src/Frontend run test:watch  # optional: interactive watch mode
```
Expect **10 files / 86 tests passed**. The three tests fixed this session live in:
- `src/Frontend/src/components/Provenance.test.tsx` — *A5* (1 test)
- `src/Frontend/src/__tests__/honesty.test.tsx` — *H2* and *H7* (2 tests)

---

## 3. Manually drive the UI (no backend needed)

The React app defaults to an in-memory **fixture client** (`App.tsx` → `createFixtureClient()`),
so you can click through every surface with **no .NET hosts running**.

```powershell
npm --prefix src/Frontend run dev
```
Vite prints a local URL (default **http://localhost:5173**). Open it. Use the top nav to
switch surfaces. Walk these to confirm the fixes and the core honesty guarantees:

### The three fixes — what to look for

1. **A5 · Provenance (any number carries its label + date).**
   Go to a submission from the **Review queue** (open `@ava.routine` → verdict panel).
   The **VPS** and **BAS** now read as one line — e.g. `VPS (Viral Potential Score): 74
   Estimated as of 2026-07-11`. The number is never shown without its provenance chip and
   date. Same on the **Amplification** screen for AWS and Total budget.

2. **H2 · Model never decides (Review queue).**
   In the queue, find **@deals.dan** (`sub-v1-disclosure`). Its "Why it needs attention"
   cell shows the deterministic reason *and*, inline in the same cell,
   **"Model-raised suspicion (not acted on): V3."** The model's suspicion is flagged, never
   acted on. There is **no** approve button and **no** select-all checkbox anywhere in the
   queue — the only row action is **Open**.

3. **H7 · Knowledge serves prose, never a causal claim (Knowledge).**
   Open the **Knowledge** surface. Read the mechanism card end to end — statement,
   warrant (`contrasted`), falsifier, provenance (`Proxy-selected, Measured-evaluated`),
   and the human ratification note. No causal verb (causes / lifts / drives / predicts, or
   the "causal" family) appears anywhere. The prevalence ratio (2.48) appears **only**
   inside its descriptive caveat ("descriptive only — not a multiplier … does not forecast
   any score").

### Other honesty checks worth a look
- **Degraded / tripped breaker:** the tripped submission (`@nate.grws`) hides the stored
  VPS entirely — you see a "withheld" note, never the number.
- **Operator dashboard:** a cohort with n=45 shows **no** ρ (below the n≥60 floor); a high
  out-of-sample ρ renders as a **warning, not a win**; C3-down shows breaker **UNKNOWN**.
- **Amplification sign-off:** the Submit stays disabled until you type a reviewer name —
  nothing reaches a client without a named human sign-off.

Stop the dev server with `Ctrl-C`.

---

## 4. (Optional) Run the real .NET hosts

Only needed if you want to exercise the live HTTP surfaces (the UI does **not** require
them). Each is a separate process — use separate terminals. Ports are examples.

```powershell
# C2 — scoring / compliance / verdict (sole OutcomeEvent writer; no auto-approval endpoint)
$env:ASPNETCORE_URLS="http://localhost:5211"; dotnet run --project src/ControlPlane/UgcIntelligence.C2.Host
#   GET /health

# C3 — calibration / breaker authority (reader-only over the event log)
$env:ASPNETCORE_URLS="http://localhost:5311"; dotnet run --project src/ControlPlane/UgcIntelligence.C3.Host
#   GET /health ; GET /api/calibration/{vertical}/{platform}  -> cold for an unknown cohort

# C4 — Knowledge API (read-only, one artefact-store prefix)
$env:ASPNETCORE_URLS="http://localhost:5411"; dotnet run --project src/KnowledgeApi/UgcIntelligence.KnowledgeApi.Host
#   GET /health ; GET /api/knowledge/mechanisms?vertical=&platform=&warrant=  -> 200 + coverage.state
```

Smoke-test health, e.g.:
```powershell
Invoke-RestMethod http://localhost:5211/health
```
Unconfigured, each host runs individually correct and **fail-closed** (C3 unreachable →
breaker `cold`/advisory; C4 empty cohort → 200 with a coverage state, never a 500). See
`RUNBOOK.md` for the full cross-process story.

---

## 5. What changed this session (for review)

Three first-run frontend failures, each a real defect against a Critical-Path invariant,
fixed at the cause:

| Test | File touched | Root cause → fix |
|---|---|---|
| A5 Provenance | `src/Frontend/src/components/Provenance.tsx` | The label sat in its own `<span>`, so a text query resolved to the label alone (no number). Made the label a direct text child so number + provenance are one queryable unit. |
| H2 TriageQueue | `src/Frontend/src/queue/TriageQueue.tsx` | The "model-raised suspicion" flag was a **sibling** of the reason cell. Moved it **inside** the reason element so the cell carries both the deterministic reason and the flag. |
| H7 KnowledgePanel | `src/Frontend/src/api/fixtures.ts` | The fixture ratification note literally said "avoids **causal** verbs" — the word "causal" trips the forbidden-verb lexicon. Reworded the human note descriptively; the guard regex was left untouched. |

> **Docs note:** `RUNBOOK.md` line ~40 still says the frontend `npm test` is "blocked by a
> corrupted local npm install." That's now stale — the install was repaired and all 86
> tests pass. Worth updating on the next `/sync-docs`.
