# 2026-09-07 — Phase 1, engine core

## Scope

The whole lending engine: interval arithmetic, loan maths, the six rule modules, `compute()`,
the three personas and four test suites. Covers phases 1.1–1.16. The hard gate passed.

Nothing in the UI exists yet beyond the phase 0 placeholder.

## Changes

- `engine/interval.ts` — interval algebra with enforced invariants, plus the tests.
- `engine/finance.ts` — EMI, its inverse, and the all-in rate as a real IRR solved by bisection.
- `engine/trace.ts` and `engine/rules/table.ts` — the trace structure and the rule-row types
  that make a `why` and a `source` mandatory on every rule.
- Six rule modules: `income`, `affordability`, `credit`, `products`, `stress`, `verdict`,
  plus `expenses` for the one assumed answer. 23 rules registered.
- `engine/compute.ts` — the single public entry point, returning four outputs, a trace, a
  confidence and the list of assumptions used.
- `engine/personas.ts` and `scripts/run-personas.ts` — the three borrowers and a readable
  report of what the engine says about each.
- Four test suites: interval algebra, finance, golden personas, invariant properties, and
  degenerate inputs. 144 tests.

## Decisions

### Verdict has a fourth value, `need-more-info`

- **Choice:** added alongside `borrow` / `borrow-less` / `dont`.
- **Why:** with no income stated there is no honest answer. Every downstream number would be
  invented, and inventing one is exactly the failure this product exists to avoid.
- **Rejected:** assuming an income band and answering anyway — it would make the widest,
  least reliable output look like the other three. Also rejected: refusing to return a
  result, which would give the UI a blank screen to render.
- **Assumes:** the flow will ask for income early enough that this is rare.
- **Would be wrong if:** it fires for borrowers who did state an income, which would mean a
  guard is too aggressive.
- **Source:** my judgement; the plan lists three verdicts.

### The stress cap is converted to an amount at the *risen* rate

- **Choice:** the three borrower-side caps are returned as separate instalment ceilings, and
  `compute` converts each to an amount at the rate that cap actually applies to — today's
  rate for the outflow and surplus caps, the risen rate for the stress cap.
- **Why:** found by running Ravi. He came out `borrow` while the report showed his stressed
  outgo at 56%, past the 55% ceiling. The cause was converting all three caps at today's
  rate, so the stress constraint was satisfied on paper and breached in practice.
- **Rejected:** the plan's approach of downgrading the verdict one step when the stress test
  breaches. That treats the symptom — it would tell Ravi "borrow less" without the safe
  amount ever having been reduced to something that actually survives the stress.
- **Assumes:** the rate rise applies to the whole loan, i.e. it is floating. For a fixed-rate
  loan this is conservative.
- **Would be wrong if:** a product is genuinely fixed-rate, where only the income drop should
  bite. Not yet modelled — see open items.
- **Source:** discovered in this session by eyeballing Ravi's output against the rule.

### Amount and rate are correlated, and the EMI range must pair them consistently

- **Choice:** added `emiRangeCorrelated`, which pairs the largest amount with the *lowest*
  rate and vice versa.
- **Why:** the second half of the same Ravi bug. `principalFromEmiRange` crosses its ends —
  the biggest loan comes from the cheapest rate — so afterwards the two are inversely
  correlated. The ordinary `emiRange` then priced the biggest loan at the highest rate, a
  combination that cannot occur, and overstated the instalment enough to fake a breach.
- **Rejected:** widening the ceiling to absorb the error, which would have hidden a real
  modelling mistake behind a looser rule.
- **Assumes:** the amount always came from the rate. True everywhere it is currently used;
  a future caller with an independent amount would need plain `emiRange`.
- **Would be wrong if:** someone applies it to an amount the borrower typed in, where the two
  are genuinely independent.
- **Note:** a good sign the fix is right — the instalment now collapses to a single figure
  rather than a range, which is correct. The instalment *is* the ceiling; the rate only
  decides how much loan that ceiling buys.
- **Source:** discovered in this session.

### Credit standing places the borrower within the product band, rather than raising its floor

- **Choice:** rate band = `[base.lo + premium.lo, base.lo + premium.hi + lender spread]`,
  clamped to the product's top.
- **Why:** the first implementation added the premium to the floor and left the ceiling at
  the product's, so Priya — a 780 score, five years at an MNC — was quoted "10.5% to 24%".
  That is true of the product and useless to her. She now sees 10.5–12%.
- **Rejected:** narrowing by score as a separate post-step, which needed its own rule table
  saying much the same thing twice.
- **Assumes:** a borrower at the top of the range can actually reach the bottom of a
  product's band, and that lenders differ by around 1.5 points on identical files.
- **Would be wrong if:** the band saturates for too many borrowers — see the open item on
  premium saturation, which is already happening for Anita.
- **Source:** my judgement, prompted by reading Priya's first output.

### Confidence is derived from range width, never from question count

- **Choice:** thresholds on rate-band width and on the safe amount's width relative to its
  top, registered as a rule.
- **Why:** the product's promise is that questions earn their place. If answering a question
  that changes nothing raised confidence, the meter would be measuring effort rather than
  certainty.
- **Rejected:** counting answered questions, which is what most flows do and is exactly the
  dishonest version.
- **Assumes:** the widths chosen (1.5 points for high, 3.5 for medium) match what a borrower
  would call a useful answer.
- **Would be wrong if:** most borrowers end up on "low" even after answering everything.
- **Source:** the plan's §4 requirement, thresholds are my own.

### Household expenses is the only answer the engine fills in

- **Choice:** when not stated, assume the greater of ₹12,000 and 25% of income, mark it
  assumed, and surface it in `result.assumptions`.
- **Why:** a blank here is not neutral. Treating it as zero would claim the household spends
  nothing and would inflate every safe amount — the single most dangerous direction to be
  wrong in.
- **Rejected:** leaving it blank and excluding the surplus test, which would silently drop
  one of the three affordability constraints for anyone who skipped the question.
- **Assumes:** a household spends at least a quarter of income, and at least ₹12,000.
- **Would be wrong if:** the figure is high enough to make skipping feel punitive. The plan
  wants defaults keyed by household size and city tier; that lands in phase 2.4.
- **Source:** judgement, following the StepChange pattern named in the plan.

### The generated borrowers in the property tests are a fixed grid, not random

- **Choice:** 45 borrowers from a deterministic grid, plus the three personas.
- **Why:** a failing property test has to be reproducible. A random seed that fails once in
  twenty runs is worse than no test, because it teaches you to re-run rather than look.
- **Rejected:** a property-testing library with random generation and shrinking. Better
  coverage, but the plan's determinism requirement matters more here.
- **Would be wrong if:** the grid is too regular to hit an edge the engine actually has.
- **Source:** the plan's determinism requirement in §6.

### Two property assertions I wrote turned out to be false, and were corrected rather than forced

Both are worth recording because the engine was right and the assertion was wrong:

- **"The safe amount never exceeds the lender amount."** False in general. Where income
  cannot be evidenced, a lender recognises 60–80% of what the borrower actually earns, so
  someone with little rent can genuinely afford more than a lender will advance. That gap is
  Ravi's whole situation. The test is now scoped to salaried borrowers, where recognition is
  full, plus a second test asserting that the reverse case only ever happens when there is
  unprovable income.
- **"An unknown score always produces a strictly wider band than a known good one."** False
  when the premium has already pushed the band against the top of the product's range, where
  both saturate. Changed to "never narrower".

### The three reference EMI values

- **Choice:** kept the closed-form EMI, corrected my third reference figure from ₹10,379.12
  to ₹10,379.18.
- **Why:** the independent amortisation check — run the loan month by month and see whether
  the balance lands on zero — passed for every case, so the formula was right and my recalled
  figure was wrong.
- **Note:** the amortisation test is the one that actually protects this, since it does not
  share a formula with the code under test. The three published figures are a secondary check
  and are **from memory, not verified against a live bank calculator**. See open items.

## Files touched

- `engine/interval.ts`, `engine/finance.ts`, `engine/trace.ts` — new; algebra, loan maths, trace.
- `engine/rules/table.ts` — new; `Rule`/`TieredRule` types, source provenance, the registry.
- `engine/rules/{income,affordability,credit,products,stress,verdict,expenses}.ts` — new; the rules.
- `engine/compute.ts` — new; the single entry point.
- `engine/personas.ts` — new; Priya, Ravi, Anita and the must-set filter.
- `engine/answers.ts` — `StatedRange` unified onto the engine's `{lo, hi}` shape; `LoanPurpose`
  and `IncomeType` exported.
- `scripts/run-personas.ts` — new; the readable report.
- `tests/{interval,finance,personas,properties,degenerate}.test.ts` — new. `tests/smoke.test.ts`
  deleted, as planned.

## Verification

Exit condition run in full and passed:

- `npx tsx scripts/run-personas.ts`:
  - **Priya** — `borrow-less`. Lender ₹20,90,409–₹24,19,291 against a safe ₹89,910–₹93,050
    on an ₹8L ask. The two numbers differ by more than 20×. Rate 10.5–12%, confidence high.
  - **Ravi** — routed to **loan against property** at 10–12%, with the personal loan shown
    alongside at 11–24% and the reason it lost. Safe ₹13,14,244–₹13,97,491, capped by the
    ₹22.5L the shop supports. Stressed outgo 53%, no breach.
  - **Anita** — `dont`. Safe amount ₹0, surplus **−₹7,400**, reason names both the bounce and
    the app loans, next step is debt-first.
- Hand-checked against `docs/SYSTEM_DESIGN.md` §2.2 and §2.3, and they agree exactly:
  Priya's lender headroom ₹46.5k–₹52k (design says "~₹46k"), her safe outflow
  ₹1.1L × 40% − ₹28k − ₹14k = **₹2,000** (design says the same), Ravi's property headroom
  ₹45L × 50% = **₹22.5L** (design says the same).
- Must set of nine alone still answers for all three: Priya `borrow-less`, Ravi `borrow-less`
  at ₹4.78–5.18L with a 3.5-point band, Anita `dont`. Wider ranges, no blanks.
- `npm test` — 6 files, **144 tests**, all passing.
- `npm run typecheck` — clean.
- No number reaches the borrower from a constant in `compute.ts`: 23 rules registered, and
  the retirement age, preferred tenures, confidence thresholds and notional pricing amount
  were all moved into rule tables during this phase for exactly this reason. The only
  literals left in `compute.ts` are the 12 that converts years to months.

## Open items

- **The rate, fee and LTV bands are still unverified.** They carry a source note saying so.
  They must be checked against current lender pages, with dates, before RULES.md is generated
  in phase 5. This is the largest outstanding risk to the domain-reasoning score.
- **The three published EMI reference values are from memory.** The amortisation check makes
  the formula safe regardless, but the figures should be confirmed against a real bank
  calculator. The plan also wants the APR checked against a committed spreadsheet; it is
  currently verified by discounting the instalment stream instead, which is a genuine
  independent check but is not the spreadsheet the plan asked for.
- **Premium saturation.** When the credit premium pushes past a product's top rate, the band
  clamps there, so a borrower with a recent bounce and one with a clean file can be quoted the
  same vehicle-loan band of 13–14%. It does not affect any persona's verdict — Anita is
  refused for other reasons — but it makes the rate band less informative at the bad end.
  Consider letting the band exceed the product ceiling, or widening the product bands.
- **The stress case assumes a floating rate for every product.** Conservative, but a fixed-rate
  loan should only face the income drop. Not modelled.
- **`AffordabilityResult` is now partly unused** — `borrowerCeiling` returns the three caps
  directly and `compute` assembles the result. The interface should be tidied or removed.
- **`stress.ts` returns `rate: iv(0, 0)`** in `StressResult`, a leftover field nothing reads.
- `outflowRatio` and `percentOf` are exported but only lightly used; check they still earn
  their place after phase 2.
- Phase 2 (questions and adaptivity) is next. Its exit condition wants the must-set rate band
  around 4 points wide — Ravi's is currently 3.5 and Priya's 1.5, so that expectation may need
  restating as "wide enough to be honest" rather than a fixed number.
