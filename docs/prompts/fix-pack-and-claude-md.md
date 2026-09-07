# Prompt: repair the pack and CLAUDE.md against the substrate-and-review-spiral failure mode

*Paste the block below into any project that uses this Claude pack. It is written to be portable — it tells the agent how to DETECT each failure mode from evidence, not to assume it is present.*

---

Audit this project's Claude pack (`.claude/`) and `CLAUDE.md` against a specific, expensive failure mode, and repair what you find. Work from evidence in this repo — do not assume any of it applies until you have measured it.

## The failure mode

A milestone budgeted at 1–2 sessions consumed eight days, eleven review rounds and ~80 blocking findings, and shipped ~3,000 lines of source and ~2,200 lines of tests with **zero product callers and zero user-reachable routes**. The code was not merely uncalled — it was unreachable in principle: nothing in product code could create the row its entry point required, and the app layer was denied the write surface by its own import boundary. Nothing ever forced the question *"how does a request reach this?"*

With no consumer there is no forcing function, so the only available feedback is review — and adversarial review of a large unconsumed substrate produces findings faster than anyone can close them, with no shipped behaviour to calibrate severity against. The project's own record showed a prose-only review round moving blocks **7 → 11**.

## Step 1 — measure before diagnosing

Report actual numbers. Skip any check that does not apply here.

1. **Reachability.** For each package/module built in the last two milestones: how many callers in routes, jobs, server actions or CLI entry points — excluding tests? List anything at zero.
2. **Path completeness.** Can a signed-in user reach each new capability? Trace one concrete path from an entry point to the code. If a required row, scope or token can only be produced by tests or seeds, say so.
3. **Plan-to-code ratio.** Plan document lines vs shipped source lines; task/criteria/decision counts vs the milestone's stated session budget.
4. **Review rounds.** How many per milestone? For the last two, how many findings were introduced by the *previous* round's fix rather than pre-existing?
5. **Claim accuracy.** Take 5–10 factual claims from the decision log, progress files and source comments — "withdrawn in X", "N of N red", "closed", "asserted in Y" — and verify each against the file or command it names. Report the hit rate.
6. **CLAUDE.md health.** Line count vs its own stated budget; lines that would not change an agent's behaviour; rules governing frozen or inactive codebases.

## Step 2 — repair, structurally

Prefer changing a **template, trigger or default** over adding an exhortation. *Do not fix process cost with more process.* Every addition must displace something or change what an agent is forced to answer.

Apply only what the evidence supports:

- **The slice rule.** Make the planning command require, per unit of work, a single sentence of the form *"A \<user\> can \<do this thing\>"* — and a named caller shipping in that same unit. A package with no caller in its own unit is not done. If the plan template has no field for this, add one and delete a field that has not changed a decision.
- **Gate on reachability.** If the review-gate table triggers on file paths, add a precondition: when no user path reaches the change, findings are a **backlog ordered by reachability**, not a blocker. Gates run on the shipped slice. Record which findings become live in which future slice.
- **A convergence stop-rule.** If a review round's findings are mostly defects the previous round's fix introduced, stop revising the artifact and ship the thinnest reachable slice instead. Put a round budget in the review command.
- **Just-in-time detail.** Detailed phase plans for the current unit and the next one only. Give plan documents a size budget.
- **Isolate parallel reviewers.** If reviewers mutate the working tree, run them in separate worktrees. Shared-tree runs produce contaminated results and findings nobody can localise.
- **Claims are re-read before they are recorded.** Any statement about another file's contents is verified against that file in the same action that records it. If the Lessons section lacks this, offer it.
- **Coverage numbers name their population.** "N of N passed" must be accompanied by what was *not* covered. Mutation testing perturbs code that exists and is structurally blind to a control nobody wrote.
- **Prune.** Retire or merge CLAUDE.md lines that do not change behaviour, and rules that govern code no longer under active change.

## Constraints

- **Read before you write.** Never state a fact about a file you have not opened.
- **Offer, never append silently,** for anything the project's own conventions require a human to approve — Lessons entries, decision-log lines, retiring a rule at a cap.
- Keep `CLAUDE.md` inside its stated budget. If you add, say what you removed.
- Do not invent failure modes this repo does not exhibit. A clean result is a valid result — say so plainly and stop.
- Do not start feature work.

## Output

1. **Measurements** — the numbers from Step 1, as a table.
2. **Which failure modes are present here**, each with file:line evidence, and which are absent.
3. **A diff-level change list** for `.claude/**` and `CLAUDE.md`, showing what each change displaces.
4. **Anything needing my approval**, as a numbered list I can answer with yes/no.
5. **The single highest-leverage change**, named — and why it beats the others.
