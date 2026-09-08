# System design

The deep reference: architecture, domain rules, workflow. `plan.md` holds the original
strategy and time budget; `CLAUDE.md` is the short orientation. Where they disagree, this
file and the rule tables in code win — and the rule tables win over this file.

## 1. Architecture

```
/engine                    pure, no React, no DOM, unit tested
  /rules
    products.ts            bands per loan type: rate, tenure, LTV, fee, eligibility
    affordability.ts       FOIR tiers (lender) and safe-outflow tiers (borrower)
    income.ts              recognition rules per income type
    credit.ts              score bands, unknown handling, bounce penalties
    verdict.ts             borrow / borrow less / don't, with reason
    stress.ts              income drop, rate rise scenarios
  interval.ts              [lo, hi] arithmetic, never NaN, never inverted
  finance.ts               EMI, APR (IRR of net disbursal vs EMIs), tenure tables
  questions.ts             registry: id, tier, applies(state), moves[]
  compute.ts               state -> outputs + trace + confidence
  index.ts
/ui
  /flow                    one question per screen, skip always available
  /results                 O1-O4 panels, each with a why line and trace drawer
  /card                    Negotiation Card, print and image export
/scripts
  gen-rules-md.ts          walks rule tables, emits RULES.md
  run-personas.ts          runs Priya/Ravi/Anita, emits /runs/*.md
/tests                     interval, finance, personas (golden), properties
RULES.md                   generated — never hand-edit
/runs                      generated — never hand-edit
```

The engine API is deliberately one function:

```ts
compute(answers: Answers): Result
// Result = { verdict, amounts, rate, emi, card, confidence, trace, nextQuestions }
```

`nextQuestions` is where adaptivity lives: the engine picks what to ask next based on which
output ranges are widest and which questions would tighten them. The UI never decides.

## 2. Domain rules

### 2.1 Income recognition

| Income type | Lender recognises | Borrower plans on | Why |
|---|---|---|---|
| Salaried | Net salary, full | Net salary | Verifiable |
| Self-employed, ITR | ITR ÷ 12, optionally uplifted to bank-statement average | Lower bound of stated range | Lender needs paper; borrower must survive a bad month |
| Informal / gig | Stated × 0.6–0.8 (many lenders won't lend unsecured at all) | Lower bound − 10% | Volatility, no proof |
| Co-applicant | 50–100% of their net, by relationship and stability | Only if reliably pooled | Default conservative |

The gap between the two columns is itself an output: "lenders treat you as earning ₹35k;
you earn more but can't prove it, which is why secured lending is your lever."

### 2.2 Affordability — two separate rulebooks

**Lender FOIR** on recognised income. Obligations = existing EMIs + proposed EMI. Rent is
normally *not* counted. That omission is the whole reason the two numbers differ.

| Net income band | Max FOIR |
|---|---|
| under ₹30k | 40% |
| ₹30k–₹1L | 50% |
| over ₹1L | 55–60% |

**Borrower safe outflow**: rent + all EMIs + proposed EMI under 40% of *planning* income,
and under 55% after the stress case. Whichever binds is the ceiling. Then subtract stated
household expenses and require a positive surplus, with at least one month's outflow going
to emergency savings if savings are under three months.

### 2.3 Product routing

| Signal | Route to | Indicative band (verify before locking RULES.md) |
|---|---|---|
| Consumption, no collateral | Personal loan | 10.5–24%, fee 1–3%, 1–5 yrs |
| Unencumbered property, ≥ ₹10L or thin ITR | Loan against property | 9–12%, LTV 50–65%, fee 0.5–1%, to 15 yrs |
| Vehicle purchase | Vehicle / two-wheeler / EV | 9–14%, LTV 80–95%, 3–5 yrs |
| Business, small ticket, weak paper | MUDRA / CGTMSE / bank business | 9–14% MUDRA; 14–24% unsecured NBFC |
| Gold in household, urgent, short | Gold loan | 8.5–14%, LTV to 75% |
| Informal income, no collateral | MFI / SHG, or **no loan** | 20–26% MFI; app loans 30%+ flagged predatory |

Always show the alternative that was rejected and its cost, so routing is legible rather
than asserted.

### 2.4 Credit score

| Score | Effect |
|---|---|
| 750+ | bottom of band |
| 700–749 | +1–2 pts |
| 650–699 | +3–5 pts, many banks decline |
| under 650 | unsecured likely declined; route to secured or don't |
| unknown, has loans | model as `[650, 780]`, band width doubles, prompt a free check — never a number |
| unknown, never borrowed | cautious on unsecured, fine on secured |
| bounce in last 6 months | unsecured decline likely; +4 pts if approved; pressure toward "don't" |

### 2.5 Rate and APR

Fair band = product base band narrowed by score, income type, employer type and existing
relationship. Show three numbers: headline band, processing fee assumption, and effective
APR as the IRR of (disbursal − fee − 18% GST on fee) against the EMI stream. The user can
type a lender's quote and see it placed on the band with its true APR — that input is the
Card's teeth.

### 2.6 Stress and tenure

Stress case is always shown: income drops 20% (or to the stated lower bound, whichever is
worse) and floating rate rises 2 pts. Report post-stress FOIR; crossing 55% downgrades the
verdict one step. Tenure trade-off is one EMI slider with a hard stop drawn at the safe
ceiling — dragging past it is allowed but fires a nudge and greys the "safe" badge. The
static 3/5/7-year table stays in the generated run-throughs, since a slider doesn't print.

### 2.7 Verdict

```
DON'T        if any: bounce in last 6m; obligations already > 50% of planning income;
                     surplus after proposed EMI < 0; informal income, no collateral,
                     purpose not clearly productive
BORROW LESS  if safe amount < 80% of asked amount
BORROW       otherwise, with safe amount, product, band, ceiling
```

Every branch emits its reason. "Don't" is a full screen, not a dead end:

- **Debt-first sequencing** — anchor on the surplus figure with its working, then an ordered
  list of what to clear first (highest rate first), what that frees per month, and how many
  months until the surplus supports the ask. No shame words, no "unfortunately"; every line
  is a next action.
- **Path to yes** — up to five toggles ("app loans closed", "three clean months", "ask
  reduced to ₹Y"), each a `compute({...answers, ...change})` call, ranked by how much they
  move the safe amount, marked as needing time versus action today. Offered on "borrow less"
  too.
- **Alternatives to borrowing** below the toggles: lease or rent-to-own, subsidy schemes,
  SHG/MFI after app loans close, employer advance, deferring the date.

## 3. Question design

Purpose splits buying a home from repairing one, because they route to completely different
products — a home loan against the property being bought, versus a personal loan or a loan
against property already owned. Merged, routing was decided wrongly on the first answer.

Must set (10): purpose · amount · how they earn · net monthly income (range allowed) ·
whether there are any loans running, and what they cost · rent or home EMI · household
expenses (defaulted from a table by household size and city tier if skipped, shown and
flagged "assumed") · household size · age · credit score.

The loans question asks whether there is a loan **before** asking what it costs, so that a
borrower with none answers with a button rather than by typing a zero. Household size was
promoted here from the adaptive set; it drives two defaults, and leaving it out meant
telling a mother of three "we assumed you live alone".

These nine alone must produce a verdict and a rate band roughly 4 pts wide — wide ranges are
a feature, not a failure.

Adaptive branches by income type (employer and tenure for salaried; ITR, business age,
property and charge for self-employed; low/good month, other earners, gold for informal),
plus branches for existing EMIs (bounces, app/BNPL loans), vehicle asks (on-road price,
productive use), business asks (what it earns per month), and cross-cutting ones (savings
in months, upcoming large expense, co-applicant, quotes received).

**Inclusion rule:** each question declares `moves: ['O2.lender', 'O3']`, and the test suite
asserts that for at least one persona, answering it changes a declared output. A question
that fails gets deleted. This policy is stated in RULES.md.

The opening screen is a preview of the answer, not a description of it: the two-number idea
is drawn in the same `two-up` tiles the results panel uses for the real figures, with one
sentence above and the CTA below. The three personas sit under it as example cards with a
one-line description each, so a visitor can choose between them.

Progress is counted — "Question 3 of 10" — because the number tells the borrower how long
this takes and promises that figures arrive after the tenth. The confidence meter and the
"what moved" banner share one box below the card: a promise while the essentials are being
collected, then what actually changed from the second answer on.

Flow rules: one question per screen; skip always visible with a one-line consequence
("keeps your rate a wider range"), and skipping one of the ten essentials asks for
confirmation once, in red, before going through; a "what moved" banner after every answer; a
confidence meter derived from range width, not question count; a "why are you asking?" line
on every question; results reachable after the must set, with further questions offered as
"tighten this" buttons on the panel they affect; a review screen before results showing
every answer, with assumed defaults marked and blanks tap-to-fill. A question whose prompt
would otherwise have to say "it" names the thing instead, through `promptFor` on the
question — "Once you have the vehicle, how much more would you earn each month?".

Nothing is asked that the borrower has already answered by implication: someone whose
income supports one person is never asked whether anyone else in the household earns.

## 4. Outputs and the Negotiation Card

Each output panel is: headline range, one-sentence why generated *from the trace*, and a
"show working" drawer. Never hand-write the why per case — it breaks the moment a rule
changes live.

**The register is the borrower's, not the lender's.** EMI, not instalment. Approve or give,
not sanction. A rate difference is said in rupees over the term, never in points. Numbers
first, reason second, one sentence each; no metaphors; each thing said once. A range whose
two ends are within 5% prints as a single "about" figure, terms print in years, and a
computed amount is rounded before it reaches a sentence. `tests/copy.test.ts` enforces all
of this over the verdict, the assumptions, the Negotiation Card, the routing prose, the
question registry, the output labels and the what-if list. The rule `why` fields shown in
the working drawer are deliberately outside that surface: they are the explainability
register, one tap away.

The Card mirrors the RBI Key Facts Statement, same rows in the same order and vocabulary,
so the borrower compares line by line against the document the lender must hand over:
profile (name-free) · loan amount (safe, and lender-likely if different) · product · rate
and type · fees (with "decline bundled insurance unless priced separately") · APR ·
EMI and tenure · prepayment · acceptance odds · lender quote input.

Behaviour: a quote above the fair band or an EMI above the ceiling fires one red nudge line
with the reason and a "proceed anyway" link — never a blocking modal. Acceptance odds are
words (unlikely / possible / likely / near-certain), never a fake percentage, with the trace
explaining what drove them. Save as image and print, fitting both A4 and a phone. Nothing
leaves the device.

## 5. Reliability

- **Interval invariants**: `lo ≤ hi` always; intervals spanning zero handled explicitly in
  multiply and divide; never NaN or Infinity. Test the algebra before anything else.
- **Property tests** over a few dozen random borrowers: adding an EMI never increases either
  amount; answering more never widens a range; removing an answer never narrows one; unknown
  score lands strictly between the score-650 and score-780 outputs; stress FOIR ≥ base FOIR.
- **Golden persona tests**: exact verdict and range endpoints, committed. When a rule changes
  live, the failing test names what moved.
- **Schema validation** with zod on every answer — friendly correction, never a crash.
- **Finance sanity**: EMI against three known bank calculator values; APR against a
  spreadsheet XIRR, sheet committed.
- **Degenerate inputs** — zero income, income below expenses, ask of ₹0, age 70 — all
  produce a verdict with a reason, not a blank screen.
- **Error boundary** around results that still shows the trace if a renderer throws.
- **Deterministic**: no randomness, no clock except age → tenure.
- **Smoke test**: `npm i && npm run dev` on a clean clone, plus `npm test` and `npm run gen`.

## 6. Sources

RBI Key Facts Statement circular (Card layout, APR method) · StepChange budget tool (expense
defaults, debt-first ordering) · credit-score simulators, OneScore and ClearScore (toggle
interaction) · Australia's comparison rate (all-in vocabulary) · Zerodha Nudge (warning
style). Also record what was deliberately *not* copied: aggregators never say "don't", and
that is the gap this product fills.

Every rule row in RULES.md carries: what · value · why · source or "my judgement" · date
checked. RULES.md ends with a "What I do not know" section.

## 7. Config note

`.env` and settings changes don't take effect until the servers restart — `get_settings()`
is cached, and `reload_settings()` exists for scripts and tests.
