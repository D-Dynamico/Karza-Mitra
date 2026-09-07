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

---

# Addendum — the real brief arrived

The actual Lokta brief and scoring table were supplied after phase 1 was committed. Two
corrections follow, both material.

## Decision: the rubric in `plan.md` was wrong, and the phase order built on it

- **Choice:** rebuilt the scoring table in `phases.md` from the brief itself.
- **What was wrong:** `plan.md` read the rubric as 30 domain / 20 questions / 20
  explainability / 10 engineering, and stated "UI polish is explicitly not scored". The real
  table is 30 / 20 / 20 / **15 product craft** / 10 engineering / **5 honesty about limits**.
  Only *pixel perfection* is unscored. Product craft explicitly covers flow, copy, ranges shown
  as ranges, confidence shown honestly, and working on a phone.
- **Consequence:** I had recommended building the flow UI last as the cuttable item, on the
  basis that it was worth nothing. It is worth 15 points. The phase order stays as reordered —
  generated docs before UI is still right, because they carry 25 points and depend only on the
  engine — but phase 5 is no longer optional, and `phases.md` now says so.
- **Also relocated:** the Negotiation Card is named inside the *explainability* row, not
  product craft. It is worth more than assumed.
- **Source:** the brief, supplied 2026-09-07.

## Decision: personas now match the brief verbatim; silence is left as silence

- **Choice:** corrected every persona figure against the brief, and **removed** the household
  spending figures I had invented for all three.
- **What was wrong:** Anita's income was ₹14,000–22,000 against the brief's **₹26,000–30,000**,
  nearly 2× off. Her age was 29, not 35. Priya was 31, not 29. Ravi had 12 years in business,
  not 14.
- **Why the removals:** the brief gives household spending for nobody. Inventing it hid the
  behaviour that is actually scored — "sensible defaults for the unanswered" under question
  design, and "the app says where it is guessing" under honesty. All three run-throughs now
  carry a visible assumption, which is the honest and the higher-scoring outcome.
- **Assumes:** the defaults are defensible. Anita's is now ₹24,000 for a household of four,
  which is at least arguable; ₹12,000 flat was not.
- **Source:** the brief.

## Two engine problems the corrected personas exposed

Both were invisible with the wrong figures, and both are the kind of thing the domain row is
looking for.

### A "don't" verdict was being shown beside a safe amount

With her real income, Anita came out `dont` — correctly, on the bounce — while O2 still
reported a safe amount of **₹1,20,000–₹1,34,487**. A results screen would have put "do not
borrow" and "you can safely carry ₹1.3 lakh" side by side, and a borrower would believe the
number. `compute` now zeroes the safe amount whenever the verdict is `dont`, with its own
trace entry explaining that the arithmetic alone would have allowed something. A property test
enforces it for every generated borrower.

### The household-spending default ignored household size

The rule table has always carried `perExtraPerson: 4000` and nothing read it. Anita — two
children and a husband out of work eight months — was assumed to spend ₹12,000, the same as
someone living alone. With household size wired in she is assumed at ₹24,000, and her surplus
moves from **+₹5,400 to −₹6,600**, which is both more realistic and a second independent
reason for the `dont`. Added `householdSize` to the schema for this. Phase 2.4 still owes the
city-tier half of the default.

## Also added

- `existingEmiMonthsLeft` on the schema, and 24 months on Priya's car loan. The brief calls
  out "2 years left" and it is her strongest path-to-yes lever — the thing she could act on.
- `TODO(lokta)` markers on the two things the brief genuinely does not settle: whether Ravi
  rents the home he lives in, and whether Anita pays rent. Both currently read as zero rent,
  which flatters them; the second is a real engine gap, since a blank rent is silently
  treated as nothing owed.

## Verification of the addendum

- `npm test` — **146 tests**, all passing. Priya's and Ravi's golden endpoints did not move,
  because both are bound by the outflow ceiling rather than the surplus, so removing their
  invented expenses changed the surplus without changing the answer.
- Personas re-run: Priya `borrow-less`, surplus ₹40,500. Ravi `borrow`, surplus ₹46,000, still
  routed to loan against property. Anita `dont`, surplus **−₹6,600**, safe amount **₹0**.

## Open items added

- **The four-day box has expired.** Issued 2 Sep 2026, so it closed around 6 Sep; today is
  7 Sep. The brief says asking for more time is not held against you, and that good questions
  about the brief are part of the evaluation. Both should go in one message, soon.
  **Corrected 7 Sep:** wrong. The 2 Sep issue date was inferred, not known. The user confirms
  the brief reached them on 4 Sep, so the box closes on the **8th** and is still open. No
  extension is needed; the questions still need to go out early enough to be answered.
- **A blank rent is read as zero.** Unlike household spending, rent has no default, so a
  borrower who skips it is silently treated as paying nothing. That is the wrong direction to
  be wrong in. Needs either a default or a forced answer in phase 2.
- **Deliverables must sit at the repo root**: README, RULES.md, the three run-throughs and the
  walkthrough. Currently only README exists; check the runs directory placement in phase 3.
- The brief names two-wheeler as its own product band. Anita's scooter currently routes to the
  generic vehicle loan. Worth splitting, since breadth beyond the three borrowers is not
  scored but *their* products are.

---

# Addendum 2 — review corrections

Three corrections raised on review, all accepted.

## Decision: withhold the safe-carry figure, not the whole answer

- **Choice:** on a `dont`, `amounts.safe` goes to zero and `amounts.lender` stays. The
  affordability arithmetic is preserved as `amounts.safeOnAffordabilityAlone`.
- **Why:** my first fix zeroed the amount at compute level, which was too blunt on two counts.
  The brief asks O2 for *two* numbers, and on a "don't" the lender-side one is the more useful
  of the pair — "an NBFC will still hand you ₹1.4 lakh, and that is the problem" is the
  sentence that protects Anita from the next app loan. Discarding the arithmetic would also
  have left the path-to-yes toggles in phase 4.7 with no number to move, since every toggle is
  a re-run whose whole point is watching the safe amount change.
- **Rejected:** withholding at display level only, which would put the responsibility on every
  renderer to remember. The engine now returns both, clearly named, and the recommendation is
  the one that carries the verdict.
- **Would be wrong if:** a caller reads `safeOnAffordabilityAlone` and presents it as a
  recommendation. The field name and its doc comment are the guard.
- **Source:** review feedback.

## Decision: an unanswered rent is a conservative range, not zero

- **Choice:** new `engine/rules/rent.ts`. An unstated rent becomes a band by city tier — metro
  ₹8,000–20,000, tier-2 ₹4,000–10,000, tier-3 ₹3,000–7,000, unknown city ₹3,000–20,000 —
  flagged assumed. Owning property is the one honest zero, also flagged.
- **Why:** "unknown is never zero" is stated in the brief about credit scores but it is a
  principle, and a blank rent read as zero was the same mistake in a different field — worse,
  because it resolved in the borrower's favour. A product whose entire pitch is that lenders
  have been flattering borrowers for years cannot flatter them itself. Unknowns now resolve
  conservatively, show the assumption, and widen the range.
- **Rejected:** requiring rent as a must-set answer with no skip. Skip has to stay available.
- **Assumes:** the city bands are roughly right for a modest home. They are wide on purpose.
- **Consequence:** rent had to become an `Interval` through `borrowerCeiling` and `totalOutgo`.
  Anita's surplus is now a range, −₹16,600 to −₹10,600, rather than a single −₹6,600 — the
  uncertainty is visible instead of hidden.
- **Source:** review feedback.

## Added: verdict thresholds pinned to the numbers

Two property tests, matching the shape of the "don't" one:

- `borrow-less` ⇒ safe amount strictly below the asked amount.
- `borrow` ⇒ safe amount at or above 80% of the asked amount.

Plus two more on the withholding: the lender amount survives a `dont`, and
`safeOnAffordabilityAlone` is never below the recommended figure.

## Also

- Removed `repayment.emiAtSafeAmount`, which had become an exact duplicate of `emiCeiling`
  once the correlated pairing landed.
- City tiers set on all three personas: Bengaluru metro, Mysuru and Hubballi tier-2.
- Drafted `docs/questions-to-lokta.md` — extension request plus the six questions, each
  stating what was assumed pending an answer, with a table pointing at where each one bites in
  the code. **Deleted 7 Sep:** the premise was wrong. The open points are questions to put to
  the user, who decides them, not to a company. Nothing is sent to anyone. The substance moved
  into the session note as decisions to resolve.

## Verification

- `npm test` — **149 tests**, all passing. `npm run typecheck` clean.
- Personas: Priya `borrow-less` (unchanged endpoints). Ravi `borrow`, rent assumed nil and
  flagged. Anita `dont`, safe carry **₹0**, lender still **₹10,314–₹1,42,500**, surplus
  **−₹16,600 to −₹10,600**, four assumptions listed on screen.
