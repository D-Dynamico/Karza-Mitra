# 2026-09-07 — Phase 2, questions and adaptivity

## Scope

The question registry, the adaptive gating, the ranking of what to ask next, and the test
that enforces the "every question moves a number" policy. Phases 2.1–2.6. Also the rule work
that had to happen to keep several questions honest.

Scored row: question design, 20 points. "Sensible defaults for the unanswered" also counts
here, which is why the expense and rent defaults are part of this phase.

## Changes

- `engine/questions.ts` — 27 questions: 9 must, 18 adaptive, each declaring the outputs it
  moves, when it applies, what skipping costs, and two or three probe answers.
- `engine/outputs.ts` — one agreed list of outputs and one way to read each off a result, so
  the moves claim can be checked mechanically.
- `engine/next-questions.ts` — the engine decides what to ask next by trying each open
  question and measuring what moves. Also `questionsFor` (per-panel "tighten this") and
  `whatMoved` (the banner after each answer).
- `engine/rules/stability.ts` — employer type, years in work, upcoming large expense, and
  whether a productive loan covers its own instalment.
- `engine/rules/expenses.ts` — city-tier multiplier added alongside household size.
- `engine/rules/products.ts` — gold routing when the borrower's file, not the security, is
  the obstacle.
- `engine/rules/verdict.ts` — the reason now names months left on an existing loan and
  whether the loan pays for itself.
- `tests/questions.test.ts` — 48 tests enforcing the policy.
- `scripts/show-questions.ts` — prints the ranking per borrower, for eyeballing.

## Decisions

### Five questions were cut, and the cuts are in the code

- **Choice:** `cutQuestions` in `engine/questions.ts` lists each one with its reason, and a
  test fails if a cut question reappears in the live registry.
- **Why:** the policy is only real if it has removed something. Listing what went, and why,
  is also the clearest evidence for the question-design row — it shows the test has teeth
  rather than being a rule everything happened to pass.
- **What went:**
  - `gst-registered` — changes which door you walk through, not the number. A business
    purpose already routes to scheme lending.
  - `card-utilisation` — a real bureau signal, but we do not pull a bureau. It could only act
    through a credit score we already ask for directly.
  - `offers-received` — belongs on the Card, where a quote is placed against the fair band.
    It does not change what you can afford.
  - `variable-income-share` — duplicates the low-to-high income range. Two questions
    competing to express the same uncertainty is worse than one.
  - `vehicle-productive` — merged into "how much more will you earn each month". A yes/no and
    a number were competing; only the number moves an output. Knowing a scooter earns is
    worth nothing next to knowing it earns ₹12,000 against a ₹4,000 instalment.
- **Source:** the moves test, run against all three borrowers.

### Two questions were kept by making their rules real, not by loosening the test

- **Choice:** `employer-type` and `years-in-job`/`years-in-business` failed the moves test
  because nothing in the engine read those fields. Rather than cut them, I added
  `stability.ts`: a large or public-sector employer takes up to 1.5 points off, under a year
  in the job adds up to 2.5.
- **Why:** they *should* move the rate — lenders price employment stability, and the plan
  said so ("MNC salaried pulls toward the bottom") without it ever being implemented. The
  test found real missing behaviour rather than a redundant question.
- **Consequence:** Priya's band narrowed from 10.5–12% to **10.5–11.5%**, which is a more
  useful thing to hand someone with a 780 score and five years at a large employer. Her
  golden endpoints moved and were updated deliberately.
- **Would be wrong if:** the discount is generous enough that most borrowers hit the product
  floor and the band saturates.
- **Source:** the moves test; sizes are my judgement.

### Routing now asks whether the borrower can actually get the product

- **Choice:** where household gold covers the amount and unsecured lending is likely to be
  declined, route to a gold loan ahead of anything else — including a vehicle loan for a
  vehicle purchase.
- **Why:** found through the `gold` question failing the moves test. Chasing why exposed a
  real gap: Anita was being pointed at a vehicle loan on the reasoning that the vehicle
  secures it, but a lender writing that loan still underwrites *her*, and a bounce last month
  plus unevidenced income gets the application declined however good the security is. A gold
  loan needs no approval — the metal is in their vault. It is also cheaper.
- **Rejected:** cutting the gold question. The brief lists gold as a product band and it is
  one of the most-used forms of credit in India; cutting it would have been dodging.
- **Assumes:** a lender will decline a two-wheeler loan on a file with a recent bounce. I
  believe this is right but it is a judgement, and question 2 to Lokta is close to it.
- **Would be wrong if:** vehicle financiers are in practice far more relaxed than banks about
  a recent bounce, which some captive financiers are.
- **Source:** my judgement, prompted by the moves test.

### O1's output includes its reasoning, not just the word

- **Choice:** `compareOutputs` treats a change in the verdict's `why` or `nextStep` as a
  change to O1, not only a change of `kind`.
- **Why:** the brief asks O1 for "a verdict with a reason". A borrower told something
  different about why has been given a different answer even when the word is the same. It
  also lets questions like "how many months are left on your existing loan" earn their place
  honestly — that answer does not flip the decision, it changes what the borrower should do
  about it, which is the more useful half.
- **Rejected:** comparing only the verdict kind, which would have forced me to cut questions
  whose whole value is making the advice concrete.
- **Would be wrong if:** it lets a question in on a cosmetic rewording. The guard is that the
  text only varies where a rule made it vary.

### What to ask next is ordered by consequence, not by size of movement

- **Choice:** unanswered must-set questions first; then anything that can change whether to
  borrow at all; then by measured tightening.
- **Why:** the first version sorted purely by measured worth, and Anita's ranking put
  "what is your rent" and "what do you spend" above "has a payment bounced" — because those
  move large rupee amounts while a bounce moves a categorical. But being told the wrong
  decision precisely is worse than the right decision vaguely. She was on course to be told
  "borrow less" without ever being asked the thing that makes the answer "don't".
- **Rejected:** promoting `bounced` into the must set. It only applies to borrowers already
  carrying debt, and the must set should be nine questions everyone answers.
- **Source:** eyeballing `scripts/show-questions.ts`, which is exactly what the exit
  condition asked for.

### The moves test builds its states by deleting one answer from a persona

- **Choice:** for each question, test against each persona with that single field removed.
- **Why:** my first version tested against personas and a blank slate. Must-set questions are
  answered in every persona, so the only state where they were unanswered was the blank slate
  — where no income is known, the engine cannot answer at all, and therefore nothing moves.
  Six perfectly good questions failed for that reason alone.
- **Would be wrong if:** a question only matters for a borrower unlike all three, in which
  case it would fail here and be cut. That is the intended behaviour, not a flaw.

## Files touched

- `engine/questions.ts`, `engine/outputs.ts`, `engine/next-questions.ts` — new.
- `engine/rules/stability.ts` — new.
- `engine/rules/expenses.ts` — city multiplier.
- `engine/rules/products.ts` — gold-first routing, `tenurePolicy` unchanged.
- `engine/rules/verdict.ts` — months-left and pays-for-itself in the reasoning.
- `engine/rules/affordability.ts` — large-expense reserve in the surplus headroom.
- `engine/compute.ts` — stability into the rate band, reserve into the ceiling.
- `engine/answers.ts` — `cityTier`.
- `tests/questions.test.ts` — new, 48 tests. `tests/personas.test.ts` — goldens updated.
- `scripts/show-questions.ts` — new.

## Verification

Exit condition run in full and passed:

- **Must set alone answers all three.** Priya `borrow-less`, high confidence, 10.5–11.5%.
  Ravi `borrow-less`, low confidence. Anita `borrow-less` with a safe amount of ₹0–₹2,890 —
  not the "borrow ₹1.5L" the brief warns about, and correctly low confidence.
- **The moves test passes for all 27 questions, none exempted.** Five were cut; the cuts and
  their reasons are in `cutQuestions` and guarded by a test.
- **Ranking eyeballed** with `npx tsx scripts/show-questions.ts`. Ravi is asked for rent, then
  spending, then whether he owns property — which is the order a person would use. Anita is
  asked rent, spending, then what the scooter will earn and whether anything has bounced.
- **Adaptivity checked**: nobody is offered the whole registry. Priya sees 12 of 18 adaptive
  questions, Ravi 11, Anita 13. Salaried borrowers are never asked about filed returns;
  shopkeepers are never asked who their employer is.
- **Skipping any single must-set answer still yields a verdict** for all three, tested
  exhaustively.
- `npm test` — 7 files, **200 tests**, all passing. `npm run typecheck` clean, `npm run build`
  succeeds.

## Open items

- **Anita's must-set-only verdict is `borrow-less`, not `dont`.** Honest — the bounce has not
  been asked about yet — and her safe amount is ₹2,890 rather than anything she could act on.
  But her surplus range spans zero (−₹14,600 to +₹2,400), and a range that straddles zero
  arguably deserves its own sentence rather than being averaged into a verdict. Worth
  revisiting in phase 4 when the "don't" screen is built.
- The rate bands are still unverified. Phase 3.1.
- `whatMoved` is written but nothing calls it until phase 5.
- `AffordabilityResult` is still partly unused, and `StressResult.rate` is still a dead field
  returning `iv(0, 0)`. Both flagged in phase 1 and still outstanding.
- The gold-first routing means a borrower with gold and a bad file never sees the vehicle
  loan option at all. It appears as the rejected alternative, which is probably right, but
  worth a second look when the results panels are built.

---

# Addendum — review round two

Four items raised on review, all accepted and done.

## The stress case was leaning on income that has not arrived

- **What was wrong:** half of Anita's expected scooter earnings were counted in planning
  income, and the stress case ran on planning income. So the bad-turn test was propped up by
  ₹6,000 a month from the very thing being stressed — the scenario is largely "the scooter
  does not double her runs".
- **Fix:** `IncomeAssessment` now reports `productiveUplift` separately, and `compute` strips
  it out before calling `stressedIncome`. Verified directly: planning income is ₹29,400 with
  the uplift and ₹23,400 without, while stressed income is **₹18,720 either way**.
- **Test:** `tests/honesty.test.ts` — "strips the productive uplift out of the stressed income
  entirely", plus one asserting it still counts in the everyday budget.

## The unlocking search is bounded, and the shortfall is now explained

- **Bounded:** options are capped at eight before combining, and the walk is pairs then
  triples only. Worst case is 28 + 56 `compute` calls, and a test asserts it finishes well
  inside three seconds.
- **The gap:** unlocking gets Anita to ₹1,00,766 against a ₹1,50,000 scooter — short by
  ₹49,234. Left there it reads as "still not enough". A `gapClosers` rule now supplies ways to
  close it that are not more borrowing: a down payment of 15–25% (which platform financiers
  expect anyway and which lowers the rate), the electric two-wheeler subsidy applied at the
  dealer, or a model one step down. Per purpose, so a wedding gets "the date is negotiable in
  a way an instalment is not" and a stock line gets supplier credit.

## Household size promoted to the must set

- Now ten must questions, inside the brief's eight-to-ten. It drives two defaults, everyone
  can answer it without thinking, and leaving it adaptive meant showing a woman supporting
  three other people "we assumed you live alone".
- The always-offerable rule for assumption-correcting questions is kept, because it is still
  right for rent.

## The savings rule, defended on its own terms

The reviewer's point stands: making a rule so a question survives is a smell. The
justification is now written out in `engine/rules/affordability.ts` and will go into RULES.md
verbatim:

> The stress case models an income drop lasting some months. Savings are exactly the thing
> that decides how long a household can absorb such a drop before it has to borrow again — so
> the post-stress outgo that is tolerable is not a single number for everybody.

Two bounds added:

- **Capped at 60%** however much is declared. Savings are self-reported and unverifiable, and
  past a point more of them does not make a heavier instalment wise. `STRESS_CEILING_CAP`,
  with a test that 600 months declared behaves exactly like 6.
- **Unanswered savings read as zero months.** "Unknown is never zero" is about not
  *penalising* a borrower for what they cannot prove; here zero is the protective reading, not
  the punitive one, since assuming a cushion nobody mentioned hands out a bigger loan on a
  guess. Stated in the rule's own comment so the distinction is on the record.

## Verification

- `npm test` — **228 tests**, all passing. `npm run typecheck` clean, `npm run build` succeeds.
- Anita's unlock: clear the app loans + three clean months → borrow-less at ₹1,00,766, short
  by ₹49,234, with three ways to close it.

## Still open

- Ravi and Priya have not been re-read since the NBFC routing, minimum-ticket and savings
  rules landed. Their goldens pass, but the outputs have not been eyeballed the way Anita's
  have. Do that before phase 3.
- `AffordabilityResult` and `StressResult.rate` are still dead. Third session running.
- `whatMoved` still has no caller until the UI.

---

# Addendum — reading Ravi and Priya

Done before phase 3, at the user's prompting. Both had passing golden tests and neither had
been eyeballed since NBFC routing, minimum tickets and the savings rule landed. Reading the
output found two things the tests could not.

## Priya's safe amount was arithmetically right and obviously wrong

She has **₹40,500 spare every month** and was being told her instalment ceiling was **₹1,911**,
giving a safe amount of ₹87,000 against an ₹8 lakh ask. Every rule fired correctly; the answer
was still not one a borrower would believe.

The cause was a flat 40% ceiling on rent plus instalments. Her rent alone is 25% of income —
ordinary for a metro — so almost nothing was left under the cap, while ₹40,500 a month sat
unspent. A ceiling that produces an obviously wrong answer is not cautious; the borrower stops
believing the rest of the page.

- **Fix:** `safeOutflowCeiling` is now tiered by income the way the lender table already was,
  and for the same reason — what protects a household is what is left in rupees, not the
  ratio. 35% under ₹30k, 40% to ₹1 lakh, 50% above. Still tighter than any lender tier, and
  unlike theirs it counts rent.
- **The stressed ceiling** became a tolerance *on top of* the everyday one (+5 to +20 points by
  savings) rather than a figure of its own, so it inherits the tiering. The flat version had
  the same defect: it bound hardest on the borrowers with the most room to absorb a shock. Hard
  cap raised to 65%, with the savings allowance capped at twenty points.
- **Priya now:** safe **₹4.69–4.80 lakh**, instalment ceiling ₹10,318, outgo 48% today and 60%
  after a bad turn. Lender ₹21.1 lakh against safe ₹4.7 lakh is still a 4.4× divergence — the
  story survives, and the number is now one she could act on.
- **Ravi and Anita are unchanged** by the tiering, which is what a targeted fix should look
  like. Ravi sits in the ₹30k–₹1 lakh tier at 40%; Anita's surplus is negative either way.
- Added a test asserting her ceiling exceeds ₹5,000 and stays below her surplus.

## The flow could not reach Ravi's own answer

Walking his questions gave `borrow-less` at ₹9.1 lakh; his full answers give `borrow` at
₹13.1 lakh. The co-applicant question asked how much his wife earns but never whether that
money is actually shared — and `coApplicantPooled` is what decides whether it counts on the
borrower's side. A flow user could never say yes, so ₹18,000 a month vanished.

- **Fix:** new `co-applicant-pooled` question, gated on a co-applicant income being present.
- **Test:** walking the flow must reach the same verdict, and within 5% of the same amount, as
  handing over every answer at once. This is the general form of the bug — a question that
  captures one field but not the companion its rule needs is invisible until you walk the flow.

## Smaller

- Ravi's routing said "property worth 45,00,000". Now "₹45 lakh", through `inLakh`.
- `householdSize` set on all three with derived notes: Priya 1, Ravi 2 (a wife, no children
  mentioned), Anita 4.
- `scripts/show-flow.ts` called every borrower "she".

## Verification

- `npm test` — **234 tests**. Typecheck clean, build succeeds.
- Priya `borrow-less` ₹4.69–4.80L · Ravi `borrow` ₹13.14–14.31L · Anita `dont` ₹0.
- Ravi's flow and his full answers now agree.

## Still open

- `AffordabilityResult`, `StressResult.rate` — dead, fourth session running.
- `appLoanOutstanding`, `vehicleIsProductive` and `gstRegistered` are set on personas but no
  live question fills them and no rule reads the last one. Either wire or remove in phase 3.
