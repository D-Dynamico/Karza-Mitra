# 2026-09-08 — four verified defects in copy and tenure

## Scope

Not a phase. Four defects found by the user reading the output of a borrower they entered
by hand — education, ₹75L ask, salaried ₹2.2L/month, existing EMI ₹25,000 with 18 months
left, rent ₹0, household ₹60,000, age 59, metro, owns property worth ₹60L, credit unknown.

All four were reproduced against the engine before anything was changed. Three of them are
the same defect class as the five before: **the engine's number was right and the screen
said something false about it.**

Phase 5's outstanding exit check (375px walk-through) is untouched and still open.

## Changes

- The "wait for your existing loan to end" line no longer claims the wait changes the
  answer. It re-runs the engine with the instalment cleared and only makes the claim when
  the verdict actually moves; otherwise it says the money comes back but the answer does
  not change.
- The `borrow-less` explanation stopped asserting three things it had never checked: that a
  lender would fund the full ask, that rent is why our number is smaller, and that income is
  the constraint at all. Each is now read off the numbers.
- A loan whose term is forced past retirement by the product's minimum tenure now says so
  as an assumption, rather than quoting the term silently.
- The two rate bands on the results page are labelled — "Your rate" for the borrower's
  adjusted band, "Typical rate" for the product's published band, with a line saying which
  is which.

## Decisions

### The counterfactual runs in `compute`, and `decide` receives the resulting verdict kind

- **Choice:** `compute` re-runs itself once with `existingEmis: 0, existingEmiMonthsLeft: 0`
  and passes the resulting `VerdictKind` into `VerdictInputs.verdictIfExistingEmisCleared`.
  `waitingNote` became a function of the branch's own kind so it can compare the two. A
  private `ComputeOptions.insideCounterfactual` stops the re-run re-running itself, so the
  recursion is exactly one deep.
- **Why:** `decide` cannot call `compute` — `compute` imports `decide`, so that is a cycle.
  The comparison needs both the baseline kind and the counterfactual kind, and the baseline
  kind is only known inside the branch that emits it. Passing the kind in and comparing at
  the branch is the only shape that gets both without calling `decide` twice, which would
  emit the verdict trace entry twice and corrupt the working drawer.
- **Rejected:** *Calling `decide` twice and discarding the first* — double trace entries.
  *Rewriting the string in `compute` after `decide` returns* — puts copy in the engine's
  orchestration layer and separates a sentence from the branch that justifies it.
  *Reusing `pathToYes`'s `existing-loan-ends` option* — the handoff suggested this, and it
  is the same counterfactual, but `pathToYes` returns a ranked list built for a different
  purpose and runs every applicable option; wiring the verdict to one entry of it couples
  the copy to that list's ordering and filters. The change itself is one line either way.
- **Assumes:** one extra `compute` per call is affordable. `pathToYes` already calls
  `compute` once per option, so this multiplies its work by two, not by the option count.
  Test suite runtime did not move (2.0s).
- **Would be wrong if:** another counterfactual is added later and someone reaches for the
  same flag — `insideCounterfactual` is a single boolean, so a second use would silently
  disable the first. If a second one appears, make it a set of names.
- **Source:** my judgement, 2026-09-08.

### Collateral binding is detected by whether the cap actually bit, not by equality

- **Choice:** `collateralBindsBoth` is true when `securedCap.hi` is strictly below *both*
  the pre-cap safe amount and the pre-cap lender amount. `compute` keeps `safeBeforeCap` and
  `lenderBeforeCap` to test it.
- **Why:** the question the copy needs answered is "was income ever the constraint?", and
  that is a statement about what the cap displaced, not about the final figures. Comparing
  the two final numbers to the cap cannot distinguish a cap that bit from a coincidence.
- **Rejected:** *Testing `lenderAmount` equals `securedCap`* — true whenever the cap bit on
  the lender side alone, which is the common case for a property-backed loan and would have
  blamed collateral for every one of them. *Non-strict `<=`* — an income limit landing
  exactly on the cap is not a case where collateral is the story.
- **Assumes:** the pledged asset is the only cap of this kind. True today; a second secured
  cap would need the same treatment.
- **Would be wrong if:** the LTV rule starts producing a cap wider than affordability ever
  reaches, at which point this never fires and the branch is dead.
- **Source:** my judgement, 2026-09-08.

### The retirement overrun is disclosed, not engineered away

- **Choice:** `headlineTenure` keeps `Math.max(band.lo, …)`, so a 59-year-old on a loan
  against property still gets the product's 60-month minimum. It now records
  `pricing.tenure-past-retirement` with `assumed: true` and an assumption in the borrower's
  words, naming the overrun in years and saying no post-retirement income is modelled.
- **Why:** the floor is not a bug. A lender does not write a 12-month loan against property;
  shortening the term to fit would quote a loan nobody offers, which is a worse lie than the
  one being fixed. The defect was silence about the consequence, not the number.
- **Rejected:** *Dropping the floor* — quotes an unavailable product. *Refusing to route to
  LAP over a certain age* — pushes a 59-year-old with ₹60L of property onto an unsecured
  personal loan at 12 months, which is materially worse advice. *Asking a new question about
  post-retirement income* — the right long-term answer and it is on the deferred list, but it
  is a question-set change on submission day.
- **Assumes:** `retirementAge: 60` is a reasonable default. It is already flagged as
  judgement in `products.tenure-policy`. A pensioner, or a self-employed borrower who never
  retires, makes it wrong — which is exactly what the deferred "when do you stop working?"
  branch would fix.
- **Would be wrong if:** the overrun turns out to be common rather than an edge case, in
  which case an assumption line is too quiet and it should affect the amount.
- **Source:** my judgement, 2026-09-08. Retirement age from the existing rule table.

### The "a lender will say yes to the full amount" claim was fixed alongside the rent leak

- **Choice:** the `borrow-less` lead sentence now checks `lenderAmount.hi >= asked` and says
  where the lender's own arithmetic stops when it does not.
- **Why:** this was not on the list of four. It is in the same sentence as the rent leak and
  false for the same borrower — a ₹75L ask against a ₹30–42L lender figure — and it is the
  more damaging of the two, since it tells someone a lender will fund something they will
  not. Leaving a known-false clause inside a sentence being edited for a different falsehood
  was not defensible.
- **Rejected:** *Leaving it and reporting it* — the fix is three lines and the scope was
  already this sentence.
- **Assumes:** `lenderAmount.hi` is the right comparison. Using `.lo` would be more cautious
  but would deny a full sanction whenever the range merely straddles the ask.
- **Would be wrong if:** borrowers read the top of the lender range as a promise. The
  surrounding copy shows both ends, so the range is not hidden.
- **Source:** my judgement, 2026-09-08.

### Labelling the two rate bands rather than removing one

- **Choice:** "Your rate" in the spec list, "Typical rate" in the comparison table, plus one
  muted line saying the table's bands are pre-adjustment and repeating the borrower's own.
- **Why:** the comparison table's job is product against product, which is the 30-point
  routing argument. Adjusting both columns for this borrower's credit would make the columns
  incomparable in a different way, and dropping the table loses the routing evidence.
- **Rejected:** *Dropping the table's rate row* — the row is the whole reason the table
  persuades. *Showing the adjusted band in both places* — the alternative product's adjusted
  band is not computed, so one column would be adjusted and the other not.
- **Assumes:** a reader understands "typical" as "before anything about you". The extra line
  is there because that assumption is thin on its own.
- **Would be wrong if:** users read the two bands as two offers. Worth watching in the
  walk-through.
- **Source:** my judgement, 2026-09-08.

### The trace input key for the tenure rule is static text

- **Choice:** the input reads `months until you stop earning` rather than being built from
  `policy.retirementAge`.
- **Why:** `ui/units.ts` keys units off `rule::input name`. A computed key means changing
  `retirementAge` silently drops the unit mapping and renders a month count as rupees —
  precisely the failure `tests/units.test.ts` exists to catch, but that test only walks the
  three personas and none of them is near retirement, so it would not have caught it.
- **Rejected:** *Interpolating the age into the key and adding every variant to the unit
  table* — unbounded. *Adding a persona near retirement* — worth doing, but it changes the
  golden set, which is a deliberate act and not part of this fix.
- **Assumes:** the age is still visible to the reader. It is, in the `why` sentence.
- **Would be wrong if:** the unit table gains a fallback that infers from the value's
  magnitude, making static keys unnecessary.
- **Source:** my judgement, 2026-09-08.

## Files touched

- `engine/rules/verdict.ts` — three new `VerdictInputs` fields; `waitingNote` became a
  function of the verdict kind; the `borrow-less` explanation rebuilt from checked facts.
- `engine/compute.ts` — private `ComputeOptions` with the recursion guard; the counterfactual
  run; `safeBeforeCap` / `lenderBeforeCap`; `headlineTenure` now takes the log and records
  the retirement overrun.
- `ui/Results.tsx` — the two rate bands labelled, plus the explanatory line.
- `ui/units.ts` — units for `pricing.tenure-past-retirement` and its three inputs.

## Verification

- `npx tsc --noEmit` — clean.
- `npm test` — 278 passing, 11 files. **No golden moved**, which is correct here: none of the
  three personas is near retirement, pays zero rent while pledging property, or is capped by
  collateral, so none of them exercises a changed path. This is also the finding — see below.
- `npm run build` — succeeds.
- `npm run gen` twice, the second run diffed against a snapshot of the first: no diff. The
  generated documents are unchanged by these fixes, for the same reason the goldens are.
- The reproduction borrower, before and after, plus four variants run through the engine:
  - baseline: was *"…because your rent counts against you…"* at rent ₹0, and *"a lender will
    likely say yes to the full amount"* against a ₹30–42L lender figure. Now names the
    lender's actual stopping point and attributes the gap to household spending and the bad
    month. Tenure 60 months, now carrying *"Repayment past retirement: this loan runs roughly
    4 years beyond age 60."*
  - rent ₹20,000: the rent clause returns, correctly.
  - no property, age 59: routes to a personal loan at **12 months** — the retirement cap
    still works where the product allows it, and no overrun assumption appears.
  - existing EMI cleared: safe and lender both land exactly on the ₹30–42L cap, and the copy
    switches to *"Both figures are held down by what the asset you would pledge is worth."*
  - age 35 on the same profile: 84 months, no overrun assumption.
- The waiting claim was checked in **both** directions. A separate borrower (₹40,000/month,
  ₹22,000 EMI with 10 months left) is `dont` today and `borrow` with the instalment gone, and
  there the line still reads *"and that alone changes this answer"*.

Not verified: anything in a browser. Phase 5's 375px walk-through remains outstanding and is
the user's to run.

## Open items

- **Phase 5 exit condition still open** — walk Priya's flow at 375px, confirm no horizontal
  scroll and a numeric keypad on money fields. Phase 6 should not start until it passes.
- **The goldens did not move, and that is the problem.** Four real defects, none touched by
  278 tests. The persona set has no borrower near retirement, none pledging property while
  paying no rent, none capped by collateral. Adding one such persona would have caught three
  of these four. It changes the golden set deliberately, so it is a decision to take rather
  than a chore to squeeze in.
- **Still no DOM test in `ui/`.** Nine defects now share the shape "engine right, screen
  wrong". Three of today's four were caught only by reading output by hand.
- `rentOrHomeEmi` is still one field, so a home-loan EMI is excluded from the lender ceiling
  and overstates what a lender would sanction. Unchanged, and still the largest known
  correctness issue.
- `AffordabilityResult` and `StressResult.rate` remain dead.
