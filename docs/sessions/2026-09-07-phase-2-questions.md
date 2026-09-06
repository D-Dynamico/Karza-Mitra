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
