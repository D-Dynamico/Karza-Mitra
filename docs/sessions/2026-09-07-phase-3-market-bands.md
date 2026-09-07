# 2026-09-07 — Phase 3, generators and docs

## Scope

All of phase 3 — 3.1 through 3.5 — plus one bug fix carried in from reading the output. The
body below covers 3.1; the addendum at the end covers the rest.

3.1: replace every `judgement(...)` rate, fee, tenure and loan-to-value figure in
`engine/rules/products.ts` with a checked market or regulatory source, and update the golden
tests that move as a result. 3.2 to 3.5: the generators, RULES.md, the three run-throughs and
WALKTHROUGH.md.

Also, before any of that: two corrections to the record about the submission deadline, and
the deletion of a document written on a false premise.

## Changes

- **Corrected the deadline.** The repo recorded the brief as issued 2 Sep with the four-day
  box closing on the 6th, and treated it as expired. That issue date was inferred, never
  known. The user confirms the brief reached them on **4 Sep**, so the box closes on the
  **8th** and was open the whole time. Fixed in `plan.md`, and added as a dated correction
  under the original open item in the phase 1 session note rather than rewriting it.
- **Deleted `docs/questions-to-lokta.md`.** It drafted an extension request and six questions
  addressed to the company. The premise was wrong: these are open points for the *user* to
  decide, not correspondence to send. Nothing goes to anyone.
- **Every product band now carries its own source.** `Product` gained a `source: Source`
  field, and the table-level source now points at the rows rather than making one claim for
  all seven.
- **Bands verified and moved** — see the table under Decisions.
- **Gold loan-to-value moved out of the product and became a regulated tiered rule**,
  `products.gold-ltv`, keyed on the amount borrowed.
- **Four golden persona tests updated**, and six new tests added.

## Decisions

### Each product gets its own `source`, rather than one note for the whole table

- **Choice:** add `source: Source` to `Product`; the `products.bands` rule-level source now
  just says provenance lives per row.
- **Why:** the seven products are priced by different lenders in different markets. A single
  note was guaranteed to be wrong about at least one of them, and phase 3's exit condition
  requires every RULES.md row to carry its own source and date.
- **Rejected:** keeping one source and listing all seven citations inside it — the generated
  RULES.md could then not put the right citation next to the right row, which is the whole
  point of the document.
- **Assumes:** `gen-rules-md.ts` (3.2, not yet written) will walk products row by row.
- **Would be wrong if:** the generator emits one row for the whole products table, in which
  case the per-row sources have nowhere to go.
- **Source:** my judgement, 2026-09-07.

### The verified bands

All checked 2026-09-07. "Was" is the unverified figure from the build plan.

| Product | Field | Was | Now | Source |
|---|---|---|---|---|
| Personal loan | rate | 10.5–24 | **9.99–24** | Paisabazaar/BankBazaar Sep 2026; 9.99% at HDFC, ICICI, Axis, IndusInd for CIBIL 780+ |
| Loan against property | rate | 9–12 | **8.75–14** | SBI 8.95–10.50, HDFC 9.00–11.00, Axis 9.25–10.95, ICICI 10.60–12.25; NBFC/HFC to 14 |
| Loan against property | fee | 0.5–1 | **0.35–2** | SBI from 0.35%, private banks 1–2% |
| Loan against property | LTV | 0.5–0.65 | **0.5–0.7** | commercial premises 60–70%, residential 75–80% |
| Vehicle loan (bank) | rate | 9–14 | **8.5–15** | BankBazaar table updated 07 Sep 2026: BoI 7.60, SBI 8.50, HDFC 14.50 onwards |
| Vehicle loan (bank) | fee / tenure / LTV | 0.5–2 / 36–60 / 0.8–0.95 | **0.5–2.5 / 12–60 / 0.75–0.9** | same page; banks require a larger down payment than NBFCs |
| NBFC two-wheeler | rate | 18–26 | **18–28** | market reaches 36%; Bajaj Auto Finance to 24% |
| NBFC two-wheeler | fee | 2–4 | **2–6** | NBFC processing fees 4–7% |
| NBFC two-wheeler | tenure / LTV | 18–48 / 0.7–0.85 | **18–60 / 0.7–0.95** | NBFCs finance to 95% of on-road price, tenures to 60 months |
| Business loan | rate | 9–24 | **8.4–24** | MUDRA/PMMY: public sector banks 8.40–12% |
| Microfinance | rate | 20–26 | **18–26** | sector band 18–26%; ICICI max 21.50% Q4 FY2026 |
| Gold loan | rate | 8.5–14 | unchanged, still judgement | no rate table found worth citing |

- **Assumes:** aggregator rate tables reflect what a branch actually writes. Several are
  "onwards" figures, which are marketing floors, not offers.
- **Would be wrong if:** the RBI moves the repo rate — every one of these bands shifts with
  it, and the `checked` date is what tells a reader how stale they are.

### The personal loan floor is 9.99%, not 8.75%

- **Choice:** set the floor at 9.99% even though public sector banks advertise from 8.75%.
- **Why:** 8.75% is a teaser quoted by Union Bank and Bank of Maharashtra for the narrowest
  possible profile. 9.99% is quoted by four large banks for a well-defined one — CIBIL 780+
  at a category-A employer — which is a profile a borrower can check about themselves.
- **Rejected:** 8.75%, which would have made every unsecured answer marginally rosier on the
  strength of a rate almost nobody is written at. That is the exact failure this product
  exists to correct.
- **Assumes:** Priya's 780 score and five years at a large employer put her in that bracket.
  She now prices at exactly the floor, which is the intended reading, not a coincidence.
- **Would be wrong if:** the category-A employer condition is stricter than it appears, in
  which case her floor should sit a point higher.

### Gold loan-to-value becomes a tiered regulatory rule, at 75% to the RBI ceiling

- **Choice:** a new `TieredRule<Interval>` keyed on the amount borrowed — `[0.75, 0.85]` up
  to ₹2.5L, `[0.75, 0.80]` to ₹5L, `[0.75, 0.75]` above — replacing the flat `iv(0.7, 0.75)`
  on the product. `loanToValue` is now absent for gold, so there is one source of truth.
- **Why:** this is not a market figure at all, it is regulation. RBI directions effective
  1 April 2026 replaced the flat 75% cap with a tiered one. The old value was also simply
  wrong at the bottom — 0.70 was never the rule.
- **Why the low end is 75% and not the ceiling:** lenders have been slow to move and most
  still write to the old cap (IIFL, Sep 2026). Quoting only 85% promises money a branch may
  not hand over; quoting only 75% is the punitive reading, not the protective one — it can
  push a borrower towards microfinance at three times the rate when gold would have covered
  the amount. This is the counter-case to "resolve conservatively": here the conservative
  number hurts the borrower, so the interval says both ends and the arithmetic narrows it.
- **Rejected:** keeping a flat 75% (ignores a real relaxation aimed exactly at small
  borrowers); using the ceiling alone (flatters); tiering inside `Product.loanToValue` by
  changing its type (would force every other product to carry a tier structure it does not
  need).
- **Assumes:** tiering on `amountAsked` is not circular — the amount asked is an input, not
  something the engine derives.
- **Would be wrong if:** lenders converge on the new ceilings, at which point the low end
  should rise to meet them; or if a lender applies the tier to the sanctioned rather than the
  requested amount, which would matter near the ₹2.5L and ₹5L boundaries.
- **Source:** RBI gold loan directions effective 1 Apr 2026, confirmed against two lender
  explainers (Ujjivan SFB, Muthoot) and one dissenting reading (IIFL, which says 75% remains
  the practical benchmark). No circular number was found, so the citation names the direction
  and its effective date rather than a number that could not be verified.

### Ravi's rate test stops asserting a hardcoded 12%

- **Choice:** replace `expect(secured.hi).toBeLessThanOrEqual(12)` with
  `toBeLessThanOrEqual(unsecured.hi * 0.6)`.
- **Why:** the 12 was pinned to the old, too-narrow 9–12% band. With the band verified out to
  14%, a thin-file borrower prices at 13.25% and the literal failed without anything being
  wrong. The claim the routing copy actually makes is that pledging property "roughly halves
  the rate" — so assert that, and it stops needing re-pinning every time a band moves.
- **Rejected:** raising the literal to 13.5, which defers the same problem; deleting the
  assertion, which would lose the check that secured is *materially* cheaper rather than
  cheaper by a hair.
- **Would be wrong if:** the unsecured band ever widens so far that 60% of its top is a bad
  rate in absolute terms.

### Ravi's confidence dropped to 'low', and that is left standing

- **Choice:** accept it rather than narrow the band to restore it.
- **Why:** confidence is defined as how narrow the answer is. The loan-against-property market
  genuinely spans 8.75–14%, and Ravi is genuinely thin-file, so the honest answer is wide. A
  'high' confidence bought by understating the market is exactly the false precision the rest
  of the engine is built to avoid.
- **Would be wrong if:** the results screen presents low confidence as a failure rather than
  as information, which would make an honest answer feel like a broken one.

## Files touched

- `engine/rules/products.ts` — per-product `source`; all bands above; new `goldLoanToValue`
  tiered rule and `goldLtvFor` helper; three routing call sites now use it.
- `tests/personas.test.ts` — four golden endpoints/assertions updated, each with a comment
  saying what moved them.
- `tests/honesty.test.ts` — six new tests (provenance guards and gold LTV tiers).
- `plan.md`, `docs/sessions/2026-09-07-phase-1-engine.md` — deadline corrections.
- `docs/questions-to-lokta.md` — deleted.

## Verification

- `npx tsc --noEmit` clean; `npm run build` succeeds; **240 tests passing** (was 234).
- Four golden tests failed on the band changes, as phase 3.1 predicted. Each was read and
  updated deliberately, not loosened.
- All three personas re-run and read in full:
  - **Priya** `borrow-less`, rate now **9.99–10.99%** (was 10.5–11.5), lender ₹21.4–24.5L,
    safe ₹4.75–4.86L, confidence high. The two numbers still diverge by roughly 4.5x.
  - **Ravi** `borrow`, still routed to loan against property, rate **9.0–13.25%**,
    safe ₹12.66–14.42L, confidence now **low**.
  - **Anita** `dont`, safe ₹0, rate 22–28.5% unchanged, but all-in APR moved
    **28.5% → 32.4%** once real NBFC fee levels (2–6%, was 2–4%) folded in.
- The new provenance guard was mutation-tested: reintroducing a "NOT yet verified" note into
  a source makes it fail, and removing it makes it pass again.

## Open items

- **Ravi's verdict copy is wrong.** He asks ₹15L; his safe ceiling is ₹14.42L; the verdict
  reads `borrow` with the line "The amount fits under all three affordability tests." It does
  not — it exceeds safe-carry by about ₹58,000. The *threshold* is defensible (`borrow-less`
  fires only below 80% of the ask, and he is at 96%), so the bug is the copy asserting a fit
  that was never tested, not the routing. Pre-existing, not caused by this session's changes.
  This is the kind of obviously-wrong sentence the project treats as worse than a quietly
  wrong number. Fix in phase 4 at the latest.
- **The gold loan rate band is still `judgement`.** Bank and NBFC gold lenders differ sharply
  and no table was found worth citing. It is now the only unsourced band, and it says so.
- **Ravi's fixture rent is still unresolved.** `rent.owns-premises` treats owning property as
  an honest zero, and Ravi's persona relies on it; Anita, who owns nothing, gets a range. It
  is the one branch where an unknown improves a borrower's number. The live flow always asks
  a `must`-tier rent question, so this only bites the fixed personas. Put to the user; not yet
  answered.
- Several rate figures are "onwards" marketing floors. Worth a line in RULES.md's "What I do
  not know" section (3.3).
- Phase 3 continues at **3.2** (`gen-rules-md.ts`). The exit condition for the phase is
  unchanged and has not yet been run.

---

# Addendum — 3.2 to 3.5, and Ravi's verdict copy

## Ravi's verdict said something false, and now does not

Carried over from 3.1's open items. He asks ₹15L against a safe ceiling of ₹14.42L, and the
verdict read `borrow` with the line "The amount fits under all three affordability tests."
It did not fit, by ₹58,028.

- **Choice:** keep the threshold, rewrite the copy so it reads the numbers. The `borrow`
  branch now distinguishes three cases — the ask is below the whole safe range, inside it, or
  just above it — and in the last case names the gap and gives a trimmed figure to ask for.
- **Why:** the threshold is defensible (`borrow-less` fires below four fifths of the ask; he
  is at 96%, which really is close enough to trim rather than a different verdict). The defect
  was a sentence asserting a fit that was never tested. One obviously wrong line costs more
  trust than a number that is quietly off.
- **Rejected:** lowering `borrow-less-threshold` so he tips into `borrow-less` — that would
  fire "you cannot have what you asked for" at anyone within 4% of their ceiling, which is
  worse advice; and leaving it alone, which the project's own standard does not allow.
- **Now reads:** "You asked for ₹15,00,000, which is ₹58,028 above the most you can safely
  carry, ₹13 lakh to ₹14 lakh. It is close enough to be worth doing — trim the ask by that
  much and it holds under every test." Next step: "Ask for ₹14,41,000 rather than ₹15,00,000."
- **Would be wrong if:** a borrower reads the trimmed figure as a rejection rather than a
  small adjustment. The headline is deliberately "This works, with the amount trimmed a
  little" rather than anything that sounds like a no.

## The Negotiation Card became engine code, not generator code

- **Choice:** `engine/card.ts` — a pure `negotiationCard(result)` returning rows, red lines and
  a walk-away, plus `cardAsMarkdown` for the generated files.
- **Why:** 3.4 needs a card in the run-throughs and phase 4.3 needs the same card on screen.
  Building it in the generator would have meant writing it twice and letting the two drift.
- **Rejected:** card content in the generator (duplicated in phase 4); card content in the UI
  (the generator cannot reach it, and it stops being testable as pure code).
- **Assumes:** phase 4 renders these rows rather than inventing its own.

## The card contradicted itself on a "don't"

Found by reading Anita's generated file, not by a test.

- **What was wrong:** her card told her not to borrow, then immediately offered "Product to
  ask for" and "Rate to hold them to" — reading as instructions to go and borrow. Her reason
  for not borrowing was also labelled "Walk away if:", which is a condition, not a reason.
- **Choice:** an `advisesAgainst` flag on the card. When set, the rows are introduced with a
  line saying the answer above stands and these are only the terms to insist on if she goes
  ahead regardless, and the reason is labelled "Why not now:".
- **Rejected:** dropping the pricing rows entirely on a "don't". A borrower who is going to
  borrow anyway is exactly the person most in need of knowing the fair rate; hiding it would
  be a purer verdict and a worse outcome.
- **Also:** the amount and instalment rows are omitted on a "don't", because unlike a rate
  they have no honest reading. Guarded by a test.

## RULES.md generation

- **Choice:** rules sorted by id inside a fixed section order, rather than emitted in registry
  order.
- **Why:** registry order is import order, which is an accident of the module graph. The exit
  condition requires two runs to produce no diff, and sorting makes that true by construction
  rather than by luck.
- **Products get a dedicated table**, separate from the generic rule renderer, because each
  product carries its own source and a generic renderer buried seven citations in one cell.
- **Gold's loan-to-value renders as a pointer** to `products.gold-ltv` rather than "n/a". It
  said "n/a" at first, which was worse than the old flat number — it implied gold had no
  loan-to-value at all.
- **The "which numbers are my judgement" list is generated**, not hand-written, so it cannot
  go stale.

## What "What I do not know" says

Written by hand in the generator, because no table can state what it fails to model. Seven
specific admissions: bands are not offers and several low ends are marketing floors; nothing
is underwritten; rates move with the repo rate and nothing here refreshes them; regional
lenders are absent entirely; the stress test is one scenario rather than a distribution;
household spending is a default and is the largest error source for anyone who skips it; tax
is not modelled, which is optimistic for a self-employed borrower quoting a filed return.

## A stale hardcode found on the way

`scripts/show-flow.ts` printed "everyone answers these nine" and "After nine questions". The
must set is ten. Both now read `mustSet.length`. The phase 2 session note records the design
intent as nine, so the set grew and the prose did not follow.

## Files touched (addendum)

- `engine/card.ts` — new.
- `engine/rules/verdict.ts` — the `borrow` branch copy.
- `scripts/gen-rules-md.ts`, `scripts/gen-runs.ts` — new.
- `scripts/show-flow.ts` — the hardcoded count.
- `package.json` — `gen:runs` now points at `gen-runs.ts` rather than `run-personas.ts`.
- `RULES.md`, `runs/*.md`, `WALKTHROUGH.md` — generated / written.
- `README.md` — the new deliverables, and a corrected status line.
- `tests/honesty.test.ts` — verdict copy and card tests.

## Verification — the phase 3 exit condition, actually run

1. **`npm run gen` twice produces no diff** — ran, then ran again; `git diff` reports nothing
   for `RULES.md` or `runs/`. **Pass.**
2. **Delete RULES.md, regenerate, git reports it unchanged** — deleted, regenerated, git shows
   the staged file with no modification. **Pass.**
3. **Every row carries what · value · why · source · date; no blank source; no market figure
   still says "not verified"** — enforced by a test added in 3.1, and mutation-tested. **Pass.**
4. **"What I do not know" is specific, not a formality** — seven concrete admissions, listed
   above. **Pass**, by judgement.
5. **WALKTHROUGH.md works without the app open** — Priya end to end, with the two numbers, the
   rent that explains the gap, the rate and its provenance, and the card. **Pass**, by
   judgement.

Full gate: `npx tsc --noEmit` clean, `npm run build` succeeds, **245 tests passing**.

## Open items (revised)

- **Resolved:** Ravi's verdict copy.
- **Still open:** the gold loan rate band is the only `judgement` product source. Ravi's
  fixture rent still relies on `rent.owns-premises`, the one branch where an unknown improves
  a borrower's number — put to the user, unanswered.
- `AffordabilityResult` and `StressResult.rate` remain dead. `whatMoved` still has no caller;
  phase 5 is its caller.
- `appLoanOutstanding`, `vehicleIsProductive` and `gstRegistered` are set on personas with no
  live question filling them. Phase 3 was the nominated place to wire or remove them and it
  did not happen — carry into phase 4.
- Phase 4 next. Its exit condition needs the app running, so the `run` and `claude-in-chrome`
  skills come into play.
