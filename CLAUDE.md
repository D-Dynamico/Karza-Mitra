# Karza-Mitra — Borrower Copilot

A borrower-side loan copilot. Given a few answers, it returns two different numbers —
what a lender will sanction and what the borrower can safely carry — routes to the right
product, shows an honest all-in APR, and is willing to say "don't borrow".

## Start of session

1. Skim the newest file in `docs/sessions/` — that's what the last session changed, why,
   and what's still open.
2. Skim this file.
3. `docs/SYSTEM_DESIGN.md` is the deep architecture + workflow reference. `plan.md` is the
   original strategy doc. `phases.md` is the build order and current progress.

## What this project is judged on

Domain reasoning and explainability, not UI polish. Four things must work:

1. **Two numbers, not one** — lender sanction and borrower safe-carry computed by separate
   rulebooks, and they must diverge.
2. **"Don't borrow" fires** when the profile calls for it, with an actionable next step.
3. **Product routing** — collateral and income type pick the product (e.g. loan against
   property over an unsecured personal loan), not the user.
4. **Honest APR** — processing fee + GST folded in, shown next to the headline rate.

## Guiding rules

- **Rules are data, the engine is pure, the UI renders.** Every rule lives in a table in
  `engine/rules/` with a `why` field. Changing a ceiling is a one-line edit, not a code hunt.
- **Every quantity is an interval** `[lo, hi]`, never a point plus a fudge. Ranges narrow
  because the arithmetic narrows them.
- **Every rule emits a reason.** `compute()` returns a trace; the UI, the card, and the
  generated docs are all views of that one trace.
- `RULES.md` and `/runs/*.md` are **generated** from the rule tables — never hand-edit them.
- Stack: Vite + React, engine in plain TypeScript. No backend, no storage beyond the session.

## Conventions

- Engine code is pure: no React, no DOM, no randomness, no clock (except age → tenure).
- Golden persona tests are the safety net. If a rule changes, a golden test should move —
  that's the point, update it deliberately.
- Every question declares the outputs it `moves`; a question that moves nothing gets deleted.
- Config: `.env` / settings changes need a server restart. `get_settings()` is cached;
  `reload_settings()` exists for scripts and tests. Say this whenever config is touched.

## Working agreement

- After each successful, behaviour-changing task, update the running session note
  `docs/sessions/<YYYY-MM-DD>-<topic>.md` — create it on the first such task of the session,
  from `docs/sessions/TEMPLATE.md`. Trivial or no-op turns need no entry.
- **Every decision gets written down, not just the outcome.** A decision is any point where
  another reasonable choice existed: a rule value, a threshold, a formula, a library, a data
  shape, an ordering, something deferred, something cut. For each one record the choice, the
  alternatives rejected and why, what it assumes, and what would make it wrong. A reader six
  months out should be able to reverse the call without re-deriving the argument. Numbers
  from judgement rather than a source say so explicitly.
- At session end: make sure that note is complete (scope, changes, every decision, verification,
  open items), update any doc whose behaviour changed (`README.md`, `docs/ARCHITECTURE.md`,
  `docs/SYSTEM_DESIGN.md`), and add to the `MEMORY.md` index if something durable was learned.
- Follow `phases.md`: commit once per phase, not per substep. A phase is done only when its
  stated exit condition has actually been run and passed — record the result in the session
  note, then commit. A failing exit condition keeps the phase open; don't start the next one.

## Commit style

Short title, then a few plain lines on what changed and why. Plain language, not jargon.

```
Add safe-carry affordability rules

Borrower ceiling now counts rent, which lenders leave out. This is what
makes the two numbers diverge. Ceiling is the tighter of the base and
post-stress limits.
```
