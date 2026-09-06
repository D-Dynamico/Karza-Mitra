# Build phases

Work top to bottom. **Commit after every substep** — small title, few plain lines on what
changed and why. Tick the box when the substep is committed.

Detail for any substep lives in `docs/SYSTEM_DESIGN.md`; `plan.md` has the reasoning behind
the ordering. Phase 1 comes before everything: wrong numbers for the personas cannot be
saved by any UI.

---

## Phase 0 — Scaffold

- [ ] 0.1 Vite + React + TypeScript project, folder skeleton (`engine/`, `ui/`, `scripts/`, `tests/`)
- [ ] 0.2 Vitest wired up, one trivial passing test, `npm test` green
- [ ] 0.3 zod added, `Answers` type and schema stubbed
- [ ] 0.4 README with install/run/test/gen commands

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

**Gate:** all three personas produce the right verdict and the two numbers diverge for Priya.
Do not start Phase 3 until this holds.

## Phase 2 — Questions and adaptivity

- [ ] 2.1 Question registry — id, tier, `applies(state)`, `moves[]`, why-we-ask copy
- [ ] 2.2 The must set of nine
- [ ] 2.3 Adaptive branches (salaried, self-employed, informal, existing EMIs, vehicle, business, cross-cutting)
- [ ] 2.4 Household expense defaults by household size and city tier, flagged "assumed"
- [ ] 2.5 `nextQuestions` — rank by which output range a question would tighten most
- [ ] 2.6 Moves test — every question must change a declared output for at least one persona; delete those that don't

## Phase 3 — Flow UI

- [ ] 3.1 One question per screen, mobile layout, numeric keypad, lakh echo
- [ ] 3.2 Skip, always visible, with its one-line consequence
- [ ] 3.3 "What moved" banner after each answer
- [ ] 3.4 Confidence meter derived from range width, with the copy that explains it
- [ ] 3.5 "Why are you asking?" on every question
- [ ] 3.6 Review screen before results — every answer, assumed defaults marked, blanks tap-to-fill

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

## Phase 5 — Generators and docs

- [ ] 5.1 `scripts/gen-rules-md.ts` — walks the rule tables, emits RULES.md with what · value · why · source · date
- [ ] 5.2 RULES.md "What I do not know" section and the question-inclusion policy
- [ ] 5.3 `/runs/priya.md`, `ravi.md`, `anita.md` generated end to end
- [ ] 5.4 WALKTHROUGH.md — one borrower end to end, then "what's next" and "what I cut"
- [ ] 5.5 README final — clean-clone install timed under five minutes

## Phase 6 — Buffer, then the nice-to-haves

- [ ] 6.1 Clean-clone smoke test in a temp dir: `npm i`, `npm run dev`, `npm test`, `npm run gen`
- [ ] 6.2 Rehearse changing one rule live — edit value and why, `npm test` shows which golden moved, `npm run gen` updates the docs
- [ ] 6.3 EMI slider with the ceiling drawn on the track (only if time remains)
- [ ] 6.4 Acceptance odds in words per product (only if time remains)
- [ ] 6.5 Shareable state in the URL hash (only if time remains)

**Cut, deliberately:** bureau integration, ML, extra products, animation, a design system.
