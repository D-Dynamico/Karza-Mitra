# Karza Mitra: build plan

Received 4 Sep, four-day box, so the clock runs out on 8 Sep. Ask the brief questions in time to be answered; the questions themselves are scored, and the brief says asking is not held against you. Only ask for an extension if the 8th is genuinely out of reach.

## 0. What the brief is actually testing

Read the scoring table backwards. 30 points on domain reasoning, 20 on question design, 20 on explainability. That is 70 of 100 on *the rules and how they are surfaced*. Engineering is 10. UI polish is explicitly not scored.

Four things they will check first, in this order, because the persona set is built to expose them:

1. **Two numbers, not one.** Lender sanction and borrower safe-carry must be computed by different rules and must diverge. Priya is the test: a lender will happily sanction ₹8L, the safe number is lower.
2. **"Don't borrow" fires.** Anita is the test. A bounced EMI last month plus three app loans at 30%+ plus a dependent household means any app that says "borrow ₹1.5L" fails the round.
3. **Product routing.** Ravi is the test. On ITR income alone he gets a small unsecured loan at 16%+. He owns an unencumbered ₹45L shop. The right answer is a secured product (loan against property, possibly split with a vehicle loan), and the app must get there by itself.
4. **Honest APR.** Processing fee plus GST folded into the effective rate, shown next to the headline rate.

Everything else is supporting cast. Build these four first, prove them with the three personas, then widen.

## 1. Guiding decisions

**Rules are data, engine is pure, UI is a renderer.** The follow-up asks you to change a rule live. If the FOIR ceiling is a number in a table with a `why` field next to it, that is a thirty-second edit and a visible re-run. If it is buried in a React component, you lose the interview. RULES.md should be *generated* from the same rule tables the engine reads, so the document and the code cannot drift.

**Every quantity is an interval.** Not a point plus a fudge factor. Income is `[40000, 80000]` for Ravi. Unknown credit score is a band `[650, 780]` with a flag, not 300 and not the average. Intervals propagate through the arithmetic, so range width falls out of the maths instead of being bolted on. This is what makes "confidence widens with silence" a property of the engine rather than a UI trick.

**Every rule fires with a reason string.** The engine returns not just numbers but a trace: which rule, what inputs, what it produced, one sentence why. The UI renders the trace. The Card is a filtered trace. The three run-through documents are a serialised trace. One data structure, four deliverables.

**Stack.** Vite plus React, engine in TypeScript with deliberately plain types (interfaces and unions, no generics gymnastics). You are more fluent in JavaScript, so keep the type surface small; the point of TS here is that a rule table with a missing `why` field fails to compile. Zero backend, zero storage beyond the browser session. If the TS friction is slowing you down on day one, drop to JS with JSDoc and zod, but keep the rules-as-data structure.

## 2. Architecture

```
/engine                    pure, no React, no DOM, 100% unit tested
  /rules
    products.ts            bands per loan type: rate, tenure, LTV, fee, eligibility
    affordability.ts       FOIR tiers (lender) and safe-outflow tiers (borrower)
    income.ts              recognition rules per income type
    credit.ts              score bands, unknown handling, bounce penalties
    verdict.ts             borrow / borrow less / don't, with reason
    stress.ts              income drop, rate rise scenarios
  interval.ts              [lo, hi] arithmetic, never NaN, never inverted
  finance.ts               EMI, APR (IRR of net disbursal vs EMIs), tenure tables
  questions.ts             question registry: id, tier, applies(state), moves[]
  compute.ts               state -> outputs + trace + confidence
  index.ts
/ui
  /flow                    one question per screen, skip always available
  /results                 O1-O4 panels, each with "why" line and trace drawer
  /card                    Negotiation Card, print and image export
/scripts
  gen-rules-md.ts          walks rule tables, emits RULES.md
  run-personas.ts          runs Priya/Ravi/Anita, emits /runs/*.md
/tests
  interval.test.ts         algebra
  finance.test.ts          EMI against known values, APR against a spreadsheet
  personas.test.ts         golden outputs for the three borrowers
  properties.test.ts       monotonicity and widening invariants (see §7)
RULES.md                   generated
/runs                      generated
WALKTHROUGH.md
README.md
```

Engine API, deliberately small:

```ts
compute(answers: Answers): Result
// Result = { verdict, amounts, rate, emi, card, confidence, trace, nextQuestions }
```

`nextQuestions` is how adaptivity works: the engine, not the UI, decides what to ask next, based on which output ranges are widest and which questions would tighten them.

## 3. Domain model

Numbers below are starting points labelled by source type. Verify the market ones against two or three current bank rate pages before you lock RULES.md; put the date you checked in the `source` column.

### 3.1 Income recognition

| Income type | Lender recognises | Borrower plans on | Why |
|---|---|---|---|
| Salaried | Net salary, full | Net salary | Verifiable |
| Self-employed, ITR available | ITR ÷ 12, optionally uplifted to bank-statement average if provided | Lower bound of stated cash range | Lender needs paper; borrower must survive a bad month |
| Informal / gig | Stated × 0.6 to 0.8 (most lenders will not lend unsecured at all) | Lower bound of stated range minus 10% | Volatility, no proof |
| Co-applicant | Add 50 to 100% of their net depending on relationship and stability | Add only if borrower says it is reliably pooled | Default conservative |

Ravi: lender sees ₹35,000/month (ITR). Borrower plans on ₹40,000 plus wife's ₹18,000 if pooled. This gap is itself an output: "lenders will treat you as earning ₹35k; you actually earn more but cannot prove it, which is why secured lending is your lever."

### 3.2 Affordability, two separate rulebooks

**Lender FOIR (fixed obligation to income ratio) ceilings**, on recognised income:

| Net income band | Max FOIR |
|---|---|
| under ₹30k | 40% |
| ₹30k to ₹1L | 50% |
| over ₹1L | 55 to 60% |

Obligations = existing EMIs + proposed EMI. Rent is usually *not* counted by lenders. That omission is the entire reason the borrower number differs.

**Borrower safe outflow**: total fixed outgo (rent + all EMIs + proposed EMI) should stay under 40% of *planning* income, and under 55% after the stress case (§3.6). Whichever binds is the ceiling. Then subtract stated household expenses and require a positive surplus of at least one month's outflow going into emergency savings if savings are under 3 months.

Priya, quick pass: lender allows roughly ₹60k in EMIs, minus ₹14k car, leaves ~₹46k, which at 11 to 12% over 5 years supports ₹20L+. She could get ₹8L trivially. Borrower rule: ₹1.1L × 40% = ₹44k fixed outgo, minus ₹28k rent, minus ₹14k car, leaves ~₹2k. Even at 45% it is ~₹7.5k, roughly ₹3.5L. Verdict should be **borrow less**, with a strong side note: her car loan ends in 24 months, and a wedding date is negotiable in a way an EMI is not. That is exactly the "something they could act on tomorrow" the brief wants.

### 3.3 Product routing

| Signal | Route to | Band (indicative, verify) |
|---|---|---|
| Purpose consumption, no collateral | Personal loan | 10.5 to 24%, fee 1 to 3%, 1 to 5 yrs |
| Owns unencumbered property, wants ≥ ₹10L or is self-employed with thin ITR | Loan against property | 9 to 12%, LTV 50 to 65%, fee 0.5 to 1%, up to 15 yrs |
| Vehicle purchase | Vehicle / two-wheeler / EV loan | 9 to 14%, LTV 80 to 95%, 3 to 5 yrs |
| Business purpose, small ticket, weak paper | MUDRA / CGTMSE-backed / bank business loan | 9 to 14% for MUDRA tiers, 14 to 24% for unsecured NBFC |
| Any gold in household, urgent, short | Gold loan | 8.5 to 14%, LTV up to 75% |
| Informal income, no collateral | MFI / SHG / platform financing, or **no loan** | 20 to 26% MFI; app loans 30%+ flagged as predatory |

Ravi: route to LAP for the stock line (₹45L × 50% = ₹22.5L headroom, well over the ask) plus a vehicle loan for the delivery vehicle since it is cheaper to secure the asset itself. Show him the unsecured alternative too, so he understands *why* he is being told to pledge the shop: 9 to 11.5% versus 16 to 22%, on ₹15L over 7 years, is roughly ₹5L of interest.

Anita: no route to a formal loan she should take right now. Show alternatives: platform EV lease or rent-to-own, PM E-DRIVE subsidy on the scooter price, SHG or MFI *after* the app loans are closed, and a consolidation path for the ₹35k.

### 3.4 Credit score

| Score | Personal loan rate effect | Notes |
|---|---|---|
| 750+ | bottom of band | |
| 700 to 749 | +1 to 2 pts | |
| 650 to 699 | +3 to 5 pts, many banks decline | |
| under 650 | unsecured likely declined | route to secured or don't |
| **unknown, has loans** | model as [650, 780], band width doubles, prompt to check for free | never a number |
| **unknown, never borrowed (NTC)** | banks cautious on unsecured, fine on secured | Ravi |
| bounce in last 6 months | unsecured decline likely; +4 pts if approved; verdict pressure toward "don't" | Anita |

### 3.5 Rate and APR

Fair band = product base band, narrowed by score, income type, employer type (MNC salaried pulls toward the bottom), and relationship (existing bank customer). Show three numbers: headline rate band, processing fee assumption, and effective APR computed as the IRR of (disbursal minus fee minus 18% GST on fee) against the EMI stream. Let the user type a lender's quote (rate and fee) and see it placed on the band with its true APR. That single input is the Card's teeth.

### 3.6 EMI ceiling, tenure trade-off, stress

EMI ceiling comes from §3.2. Show a small table: 3 / 5 / 7 years, EMI and total interest for the safe amount, so the trade-off is visible. Stress case, always shown: income drops 20% (or the lower bound of a stated range, whichever is worse) and floating rate rises 2 pts. Report the post-stress FOIR and whether it crosses 55%. If it does, the verdict downgrades one step.

### 3.7 Verdict logic

```
DON'T   if any: bounce in last 6m, existing obligations already > 50% of planning income,
                surplus after proposed EMI < 0, informal income with no collateral and
                purpose is not clearly productive
BORROW LESS  if safe amount < 80% of asked amount
BORROW  otherwise, with the safe amount, product, band, ceiling
```

Every branch emits its reason. "Don't" is a full screen, not a dead end, built on two borrowed patterns:

**Debt-first sequencing (StepChange pattern).** The Don't screen anchors on the surplus number: planning income minus rent, EMIs and expenses, shown as one figure with its working. Then an ordered list: what to clear first (highest rate first, so the 30%+ app loans), what that frees per month, and how many months until the surplus supports the loan they asked for. Tone rules for this screen go in the copy guide: no shame words, no "unfortunately", every line is a next action. If the plan has a consolidation option (a formal lender at 16 to 20% replacing app loans at 30%+), show it as the first move, with the monthly saving.

**Path to yes (score-simulator pattern, as in OneScore and ClearScore).** A short list of toggles: "app loans closed", "three months with no bounce", "husband earning ₹X", "co-applicant added", "ask reduced to ₹Y". Each toggle re-runs the engine and shows the verdict and safe amount under that change. Implementation is trivial since the engine is pure: `compute({...answers, ...change})` per toggle. Show at most five, ranked by how much each moves the safe amount, and mark the ones that need time ("three clean months") versus the ones that need action today. Also offer the same toggles on a "Borrow less" verdict, since Priya's toggle is "car loan ends in 24 months" and that is the useful sentence for her.

Alternatives to a loan sit below the toggles when relevant: platform EV lease or rent-to-own, PM E-DRIVE subsidy on the scooter price, SHG or MFI after the app loans are closed, employer advance for salaried, deferring the wedding date. Each with one line on why it beats the loan for this profile.

### 3.8 Tenure and EMI control

Replace the static 3 / 5 / 7 table on the O4 panel with one control (Apple Card payment-wheel pattern): a range slider for EMI from a floor up to a hard stop at the safe ceiling, with tenure, total interest, and post-stress FOIR updating live as it moves. The ceiling is drawn on the track. Dragging past it is allowed, but fires the nudge from §5 and greys the "safe" badge. The static table stays in the generated run-through documents, since a slider does not print.

## 4. Question design

### Must set (9)

| # | Question | Moves |
|---|---|---|
| 1 | What is the loan for? (dropdown: wedding, medical, education, business stock, vehicle, home, debt consolidation, other) | routing, productive flag, verdict |
| 2 | How much do you want? | all |
| 3 | How do you earn? (salaried / self-employed with ITR / self-employed cash only / gig or informal) | branch selector, income recognition |
| 4 | Net monthly income (range input, single value allowed) | all |
| 5 | Existing EMIs per month (0 allowed, "not sure" allowed) | both amounts, verdict |
| 6 | Rent or home EMI | borrower amount |
| 7 | Monthly household expenses excluding the above. If skipped, fill a default from a small table keyed by household size and city tier (StepChange-style trigger figures), show it, flag it as "assumed", and let them override | borrower amount, verdict |
| 8 | Age | max tenure |
| 9 | Credit score (number / don't know / never borrowed) | rate band, verdict |

With only these, Priya gets a verdict and a band about 4 pts wide. That is the "still works, wide ranges" requirement.

### Adaptive branches

- Salaried: employer type (MNC/PSU/govt vs small firm), years in job. Skip everything about ITR, collateral, cash.
- Self-employed: ITR income, years in business, do you own premises or property, approximate value, any existing charge on it, GST registered.
- Informal / gig: income range low month vs good month, other household earners, any gold or vehicle owned.
- Anyone with existing EMIs: any bounce in last 6 months, any app or BNPL loans, outstanding on those.
- Anyone asking for a vehicle: on-road price, is it productive (delivery), expected earnings uplift.
- Anyone with purpose = business: what will the money earn per month (productive-loan test).
- Anyone: emergency savings in months, large expense in next 12 months, co-applicant, quotes already received.

Rule for inclusion: each question object declares `moves: ['O2.lender', 'O3']`. The test suite asserts that for at least one persona, answering the question changes at least one of the declared outputs. A question that fails that test gets deleted. Put this test in RULES.md as a stated policy; it is a direct answer to the 20-point question-design row.

### UX on the flow

- One question per screen, big tap targets, numeric keypad on phone, amounts in lakh with live "₹8,00,000 = ₹8 lakh" echo.
- Skip is always visible. Skipping shows a one-line consequence: "Skipping this keeps your rate band 2 points wider."
- After every answer, a thin banner: "Your safe amount moved from ₹3 to 6L → ₹4.5 to 5.5L". This is the proof that questions earn their place, made visible.
- A confidence meter (Low / Medium / High) derived from range width, not from question count. The copy says what it means: "Medium: your rate band is 2.5 points wide."
- "Why are you asking?" link on every question, one sentence, pulled from the question's `moves` and the rule it feeds.
- Results are reachable after the must set. Additional questions are offered as "Tighten this" buttons on each output panel, not as a wall. The borrower chooses which range they care about.
- A review screen before results (TurboTax pattern): every answer on one page, assumed defaults marked "assumed", unanswered questions greyed with tap-to-fill. The borrower must be able to see exactly what the engine was told.

## 5. Outputs and the Card

Each of O1 to O4 is a panel: headline range, one-sentence why, and a "show working" drawer with the trace. The why is generated from the trace, not hand-written per case, or you will have a template that breaks the moment they change a rule live.

Negotiation Card, one screen, built for a phone held up across a desk. **Lay it out as a mirror of the RBI Key Facts Statement.** Every retail lender must hand the borrower a KFS with the same rows, so if the Card uses the same rows in the same order and the same vocabulary, the borrower compares line by line instead of translating. Cite the RBI KFS circular in RULES.md as the source for the layout.

| Card row | What it shows | KFS counterpart |
|---|---|---|
| Profile | "Salaried, MNC, 5 yrs, score 780, FOIR after this loan 41%" (name-free) | none |
| Loan amount | safe amount, and lender-likely amount if different | Loan amount |
| Product | the routed product, e.g. LAP not personal loan | Type of loan |
| Rate of interest | fair band for this profile, fixed or floating noted | Rate of interest, type |
| Fees | assumed processing fee, insurance (mark "decline bundled insurance unless priced separately"), other charges | Fees payable |
| Annual percentage rate | all-in band, computed by IRR | APR |
| EMI and tenure | the ceiling and the tenure at which it fits | Instalment, tenure |
| Prepayment | "ask for nil on floating; RBI bars foreclosure charges on floating-rate loans to individuals for non-business purposes" (verify current wording) | Prepayment and foreclosure charges |
| Acceptance odds | "high at a bank, near-certain at an NBFC" per product, derived from confidence and score band | none |
| Lender quote | they type rate and fee from the lender's KFS; the Card computes the all-in rate and places it on the band | filled from the actual KFS |

Behaviour on the Card:

- Lender quote above the fair band, or EMI above the ceiling, triggers a Zerodha-style nudge: one red line with the reason and a "proceed anyway" link, never a blocking modal.
- Acceptance odds are shown as words (unlikely / possible / likely / near-certain), never a fake percentage, and the trace explains what drove them.
- Save as image, print stylesheet, both fit A4 and a phone screen. No login, nothing leaves the device.

## 6. Reliability

This is where a rules product wins or loses trust, and it is cheap to get right.

- **Interval invariants**: lo ≤ hi always; multiplication and division by intervals containing zero are handled explicitly; nothing ever yields NaN or Infinity. Unit test the algebra before anything else.
- **Property tests** (a few dozen random borrowers each):
  - Adding an existing EMI never increases either amount.
  - Answering more questions never widens any range (monotone tightening).
  - Removing an answer never narrows a range.
  - Unknown credit score produces output strictly between "score 650" and "score 780" outputs, never equal to the low end.
  - Stress case FOIR ≥ base FOIR always.
- **Golden persona tests**: exact verdict and range endpoints for Priya, Ravi, Anita, committed. When you change a rule live in the follow-up, the failing test tells you what moved. Say this out loud in the interview.
- **Schema validation** on every answer with zod. Out-of-range or nonsense input gets a friendly correction, never a crash.
- **Finance sanity**: EMI formula checked against three known bank calculator values. APR checked against an XIRR in a spreadsheet, commit the sheet.
- **Degenerate inputs**: zero income, income below expenses, ask of ₹0, age 70. All produce a verdict with a reason, not a blank screen.
- **Error boundary** around the results view that shows the trace even if a renderer throws.
- **Deterministic**: no randomness, no time-dependence except age-to-tenure, which is explicit.
- **README smoke test**: `npm i && npm run dev` on a clean clone, timed. Also `npm test` and `npm run gen` (RULES.md and runs).

## 7. Beyond the brief, ranked

Do in this order, stop when the clock says so.

| Feature | Value | Effort | Verdict |
|---|---|---|---|
| KFS-shaped Card with lender quote input and all-in rate | Very high, the Card becomes a line-by-line comparison against the document the lender must hand over | Low | Must |
| Debt-first Don't screen with surplus anchor and expense defaults by household | Very high, Anita becomes actionable and the verdict has a defensible base | Low | Must |
| Path to yes toggles (simulator pattern) on Don't and Borrow less | Very high, one call per toggle on a pure engine | Low | Must |
| "What moved" banner after each answer | High, proves question design | Low | Must |
| Generated RULES.md from rule tables | High, drift-proof and impresses engineering row | Medium | Must |
| Unsecured vs secured cost comparison for Ravi | High, makes routing legible | Low | Must |
| Review screen before results | High for trust, cheap | Low | Should |
| EMI wheel with ceiling stop and nudge | Medium, best way to show the O4 trade-off | Low | Should |
| Acceptance odds in words per product | Medium, honest home for the lender-side confidence | Low | Should |
| Alternatives to borrowing (lease, subsidy, SHG, wait N months) | High for Anita and Priya | Low | Should |
| Shareable state in URL hash (resume on another phone, no server) | Medium | Low | Should |
| Kannada / Hindi labels for the must set only | Medium for realism, judges are in India | Medium | Only if hours remain |
| Bureau integration, ML, more products | Explicitly unscored | High | Cut |
| Fancy animation, design system | Unscored | Medium | Cut |

## 8. Time plan, 14 to 16 hours

| Block | Hours | Output |
|---|---|---|
| A. Engine core | 4 | interval.ts, finance.ts, income + affordability + credit rules, verdict, compute(). Tests for algebra and EMI/APR. Run all three personas in a script and eyeball the numbers before touching UI. |
| B. Questions and adaptivity | 2 | question registry, applies() and moves, nextQuestions, moves-test. |
| C. Flow UI | 3 | one-question screens, skip, what-moved banner, confidence meter, mobile layout. |
| D. Results and Card | 3.5 | four panels with why and trace drawer, KFS-shaped Card with quote input and nudge, Don't screen with surplus anchor and path-to-yes toggles, print/image. |
| E. Generators and docs | 2 | gen-rules-md, run-personas, README, WALKTHROUGH.md, golden tests locked. |
| F. Buffer and rehearsal | 1 to 2 | clean-clone install test, rehearse changing one rule live and re-running. EMI wheel and review screen live here; ship them only if F still has time. |

Block A before anything else. If A produces wrong numbers for Priya or Anita, no UI saves you.

The added patterns cost about half an hour of engine work (path-to-yes is a loop over `compute`) and an hour of UI. Pull the hour from block C by keeping the question screens plain.

Sources to name in RULES.md and the walkthrough, so the judges see where each pattern came from: RBI Key Facts Statement circular for the Card layout and APR method; StepChange budget tool for expense defaults and debt-first ordering; credit-score simulators (OneScore, ClearScore) for the toggle interaction; Australia's comparison rate for the all-in vocabulary; Zerodha Nudge for the warning style. Also say what you deliberately did not copy: aggregators never say "don't", and that is the gap this product fills.

## 9. Deliverables checklist

- App runs from README in under 5 minutes on a clean machine (test it on a different laptop or a fresh clone in a temp dir).
- RULES.md: generated, one row per rule: what · value · why · source or "my judgement" · date checked. Add a final section "What I do not know" (state-wise stamp duty on LAP, actual NBFC risk pricing, whether a given lender counts rent, MFI eligibility specifics).
- /runs/priya.md, ravi.md, anita.md: questions asked in order, answers, four outputs with why lines, Card. Generated by script so they cannot go stale.
- WALKTHROUGH.md or a 5-minute recording: one borrower end to end, then "next" and "cut". Written is fine; a recording of a phone screen is better for the product-craft row.
- Questions back to Lokta, sent early: Do lenders in their view count rent in FOIR? Should informal income ever be recognised for unsecured? Do they want the Card in local language? Is a "path to yes" in scope for the Don't verdict? These are good questions and they are scored.

## 10. What to say in the follow-up

Pick Ravi to walk through, since routing is the hardest thing to show and the most interesting. When they change an assumption, go to the rule table, edit the number and the why, run `npm test`, show which golden test moved and why, then `npm run gen` and show RULES.md and the run-through updating. That sequence is the whole pitch: lending judgement as rules a borrower can see and a machine can run.
