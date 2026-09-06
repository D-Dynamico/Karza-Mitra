# Build phases

Work top to bottom. **Commit once per phase**, when the phase is done — short title, a few
plain lines on what changed and why. Tick each substep as it lands.

**A phase is not done until its exit condition passes.** Every phase ends with one, stated
as things to actually run or look at, not as a feeling. Run it, paste what it printed into
the session note under Verification, then commit. If the exit condition fails, the phase
stays open — do not start the next one and do not tick the remaining boxes.

Detail for any substep lives in `docs/SYSTEM_DESIGN.md`; `plan.md` has the reasoning behind
the ordering. Phase 1 comes before everything: wrong numbers for the personas cannot be
saved by any UI.

---

## Phase 0 — Scaffold

- [x] 0.1 Vite + React + TypeScript project, folder skeleton (`engine/`, `ui/`, `scripts/`, `tests/`)
- [x] 0.2 Vitest wired up, one trivial passing test, `npm test` green
- [x] 0.3 zod added, `Answers` type and schema stubbed
- [x] 0.4 README with install/run/test/gen commands

**Exit condition** — passed 2026-09-07:

- `npm run typecheck` clean, `npm test` green, `npm run build` succeeds
- `npm run dev` serves the placeholder screen
- `npm audit` reports no vulnerabilities
- A stranger could follow README.md from a clean clone and get the app running

## Phase 1 — Engine core

- [ ] 1.1 `interval.ts` — `[lo, hi]` add, subtract, multiply, divide, min/max, clamp. Never NaN, never inverted
- [ ] 1.2 `interval.test.ts` — algebra and invariants, including division by an interval spanning zero
- [ ] 1.3 `finance.ts` — EMI, tenure tables, APR as IRR of net disbursal vs EMI stream
- [ ] 1.4 `finance.test.ts` — EMI against three known bank calculator values, APR against a committed spreadsheet XIRR
- [ ] 1.5 Trace type — every rule returns `{ rule, inputs, output, why }`
- [ ] 1.6 `rules/income.ts` — recognition per income type, lender vs planning income
- [ ] 1.7 `rules/affordability.ts` — lender FOIR tiers and borrower safe-outflow tiers, as separate tables
- [ ] 1.8 `rules/credit.ts` — score bands, unknown-score interval, bounce penalty
- [ ] 1.9 `rules/products.ts` — product bands and routing signals
- [ ] 1.10 `rules/stress.ts` — income drop and rate rise, post-stress FOIR
- [ ] 1.11 `rules/verdict.ts` — don't / borrow less / borrow, each branch with its reason
- [ ] 1.12 `compute.ts` — answers to outputs, trace and confidence
- [ ] 1.13 `scripts/run-personas.ts` — run Priya, Ravi, Anita and print the numbers; eyeball before any UI
- [ ] 1.14 `tests/personas.test.ts` — golden verdicts and range endpoints locked
- [ ] 1.15 `tests/properties.test.ts` — monotonicity and widening invariants
- [ ] 1.16 Degenerate inputs — zero income, income below expenses, ask of ₹0, age 70

**Exit condition** — the hard gate of the project. Nothing in phases 3+ can rescue a miss here:

- `npx tsx scripts/run-personas.ts` prints, and the golden tests lock:
  - **Priya** — verdict `borrow less`, and the lender number and the safe number visibly
    diverge (lender comfortably above her ₹8L ask, safe number well below it)
  - **Anita** — verdict `don't`, with the bounce and the app loans named in the reason
  - **Ravi** — routed to a secured product, not an unsecured personal loan
- Every number in those three outputs can be traced to a rule with a `why` — nothing appears
  from a hardcoded constant in `compute.ts`
- Property tests pass: more answers never widen a range, an extra EMI never raises either
  amount, stress FOIR is never below base FOIR
- The four degenerate inputs each return a verdict with a reason, not a crash or a blank
- `npm test` green, `npm run typecheck` clean

If a persona's numbers look wrong, fix the rules before ticking anything. Eyeball them
against `docs/SYSTEM_DESIGN.md` §2.2 by hand at least once.

## Phase 2 — Questions and adaptivity

- [ ] 2.1 Question registry — id, tier, `applies(state)`, `moves[]`, why-we-ask copy
- [ ] 2.2 The must set of nine
- [ ] 2.3 Adaptive branches (salaried, self-employed, informal, existing EMIs, vehicle, business, cross-cutting)
- [ ] 2.4 Household expense defaults by household size and city tier, flagged "assumed"
- [ ] 2.5 `nextQuestions` — rank by which output range a question would tighten most
- [ ] 2.6 Moves test — every question must change a declared output for at least one persona; delete those that don't

**Exit condition:**

- The nine must-set answers alone produce a verdict for all three personas, with a rate band
  around 4 points wide — wide is correct here, blank is not
- The moves test passes for every question in the registry, with none exempted. Any question
  that could not earn its place is deleted, and the session note says which and why
- `nextQuestions` returns a sensibly ordered list for each persona — eyeball it: the question
  at the top should be the one you would actually ask that person next
- Skipping any single question still yields a verdict, never a crash
- `npm test` green, `npm run typecheck` clean

## Phase 3 — Flow UI

- [ ] 3.1 One question per screen, mobile layout, numeric keypad, lakh echo
- [ ] 3.2 Skip, always visible, with its one-line consequence
- [ ] 3.3 "What moved" banner after each answer
- [ ] 3.4 Confidence meter derived from range width, with the copy that explains it
- [ ] 3.5 "Why are you asking?" on every question
- [ ] 3.6 Review screen before results — every answer, assumed defaults marked, blanks tap-to-fill

**Exit condition:**

- Walk Priya's flow end to end in the browser at a phone width, by hand, and reach results
- The "what moved" banner shows a real change after every answer that should move something,
  and stays silent when nothing moved
- Skip works on every screen and states its consequence in one line
- The review screen shows every answer, with assumed values labelled and blanks tappable
- No horizontal scrolling at 375px; number fields raise a numeric keypad
- `npm run build` succeeds, `npm test` green

## Phase 4 — Results and the Card

- [ ] 4.1 O1–O4 panels — headline range, why generated from the trace, "show working" drawer
- [ ] 4.2 "Tighten this" buttons per panel, driven by `nextQuestions`
- [ ] 4.3 Negotiation Card, KFS row order and vocabulary
- [ ] 4.4 Lender quote input — places the quote on the band, computes its all-in rate
- [ ] 4.5 Nudge on out-of-band quote or over-ceiling EMI — one red line, "proceed anyway", never a modal
- [ ] 4.6 "Don't" screen — surplus anchor with working, debt-first ordering, consolidation option
- [ ] 4.7 Path-to-yes toggles, on "don't" and "borrow less", ranked, time vs action today
- [ ] 4.8 Alternatives to borrowing, one line each on why it beats the loan for this profile
- [ ] 4.9 Unsecured vs secured cost comparison (Ravi's routing made legible)
- [ ] 4.10 Card save as image and print stylesheet, A4 and phone
- [ ] 4.11 Error boundary around results that still shows the trace

**Exit condition** — this is what the judges actually look at:

- All three personas reach a results screen that reads correctly to a human, checked by hand:
  Priya's two numbers side by side, Ravi's secured routing with the unsecured cost next to it,
  Anita's "don't" screen anchored on her surplus
- Every "why" line is generated from the trace. Grep the UI for hand-written per-case copy —
  there should be none
- Every panel's "show working" drawer opens and the numbers in it add up to the headline
- Typing a lender quote places it on the band and computes an all-in rate that differs from
  the headline rate by roughly the fee plus its GST
- An out-of-band quote fires the nudge, and "proceed anyway" still works
- The Card prints to one A4 page and saves as an image
- `npm run build` succeeds, `npm test` green

## Phase 5 — Generators and docs

- [ ] 5.1 `scripts/gen-rules-md.ts` — walks the rule tables, emits RULES.md with what · value · why · source · date
- [ ] 5.2 RULES.md "What I do not know" section and the question-inclusion policy
- [ ] 5.3 `/runs/priya.md`, `ravi.md`, `anita.md` generated end to end
- [ ] 5.4 WALKTHROUGH.md — one borrower end to end, then "what's next" and "what I cut"
- [ ] 5.5 README final — clean-clone install timed under five minutes

**Exit condition:**

- `npm run gen` regenerates RULES.md and all three run-throughs, and a second run produces no
  diff — the generators are deterministic
- Every row in RULES.md carries what · value · why · source or "my judgement" · date checked.
  No row has a blank source, and the market rates have been verified against live pages, not
  copied from the plan
- Delete RULES.md, run `npm run gen`, and git reports the file unchanged
- The "What I do not know" section is honest and specific, not a formality
- WALKTHROUGH.md takes a reader through one borrower end to end without needing the app open

## Phase 6 — Buffer, then the nice-to-haves

- [ ] 6.1 Clean-clone smoke test in a temp dir: `npm i`, `npm run dev`, `npm test`, `npm run gen`
- [ ] 6.2 Rehearse changing one rule live — edit value and why, `npm test` shows which golden moved, `npm run gen` updates the docs
- [ ] 6.3 EMI slider with the ceiling drawn on the track (only if time remains)
- [ ] 6.4 Acceptance odds in words per product (only if time remains)
- [ ] 6.5 Shareable state in the URL hash (only if time remains)

**Exit condition** — the project is shippable:

- Fresh clone into a temp directory: `npm i`, `npm test`, `npm run gen`, `npm run dev` all
  work, timed and under five minutes total
- The live rule change is rehearsed once, start to finish: edit a value and its `why`,
  `npm test` names which golden moved, `npm run gen` updates RULES.md and the run-throughs
- Anything from 6.3–6.5 that was not built is written down as deliberately cut, not left
  looking unfinished

**Cut, deliberately:** bureau integration, ML, extra products, animation, a design system.
