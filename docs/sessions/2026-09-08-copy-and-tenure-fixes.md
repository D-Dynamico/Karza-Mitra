# 2026-09-08 — four verified defects in copy and tenure

## Scope

Not a phase. Four defects found by the user reading the output of a borrower they entered
by hand — education, ₹75L ask, salaried ₹2.2L/month, existing EMI ₹25,000 with 18 months
left, rent ₹0, household ₹60,000, age 59, metro, owns property worth ₹60L, credit unknown.

All four were reproduced against the engine before anything was changed. Three of them are
the same defect class as the five before: **the engine's number was right and the screen
said something false about it.**

Then three more, from the user reading further: an invented co-applicant income ranked first
in Anita's "what would change the answer"; the expected-earnings question phrased so "this"
had no referent; and — found while regenerating — two rules that had never reached RULES.md
at all.

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
- The co-applicant what-if now prints the income it assumes, is phrased as a condition rather
  than an event, and no longer outranks something the borrower could do this week.
- The expected-earnings question asks "Once you have it, how much more would you earn in a
  month?", with a hint on what counts and a note that only half of it is used.
- `RULES.md` gained the two rules registered in `path-to-yes.ts`, which the generator had
  never imported. 31 rules → 33.

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

Not verified by me: anything in a browser. Phase 5's 375px walk-through was run by the user
and reported clean on 2026-09-08; it is recorded as their check, not mine.

**Phase 6, run 2026-09-08 in a throwaway clone of the local repo at `d38e666`:**

- 6.1 — `git clone` + `npm i` **9s**, `npm test` **6s** (278 passing), `npm run gen` **4s**,
  `npm run dev` ready in **6s** and `curl` returned **HTTP 200**, `npm run build` **419ms**.
  About **25 seconds** in total against a five-minute budget.
- 6.2 — edited `verdict.borrow-less-threshold` from `0.8` to `0.6` and rewrote its `why`.
  `npm test` failed **5 tests across 3 files** and named them: Priya's *"says borrow less"* and
  *"explains the gap by naming her rent"*, two pivotal-assumption tests on Ravi's rent, and the
  property test that pins each verdict to its numbers. `npm run gen` then updated the
  `RULES.md` row — both the value and the reworded `why` — plus `runs/priya.md` and
  `runs/ravi.md`. Reverting the one file and re-running returned 278 passing and the docs to
  their committed state.

### An invented co-applicant income was ranked first for Anita

- **Choice:** the ₹15,000 literal in `path-to-yes.ts` became a registered rule,
  `path.assumed-co-applicant-income`; the option's label prints the figure ("If someone else
  in the household earned ₹15,000 a month") instead of hiding it; its `kind` moved from
  *takes time* to *if it is true*; and options carrying a number the borrower never supplied
  now sort **below** anything that actually moves the arithmetic and above the ones that move
  nothing.
- **Why:** the user asked how the engine could offer +₹1 lakh from a household earner when
  nobody had said anyone earns. Reproduced: for Anita it ranked **first** at **+₹1,32,926**,
  ahead of "clear the app loans" at **+₹1,07,173** — which is real and actionable this week.
  The option's `applies` predicate fires when `coApplicantIncome` is 0, so it appears
  *precisely because* she answered that nobody else earns. An invented figure outranking a
  real action, on the strength of an answer that said the opposite, is the exact failure this
  tool exists to avoid.
- **Rejected:** *Deleting the option* — a second wage genuinely is a way out for Anita, and
  removing it would leave her a worse list. *Keeping it unlabelled but demoted* — the
  ranking would be fixed and the invented number still invisible. *Demoting it below every
  other option* — tried first, and it pushed a ₹1.3L option below three zero-delta ones and
  off the five-item list entirely, which is the opposite error.
- **Assumes:** ₹15,000 is a defensible illustration of part-time or entry-level pay in these
  cities. It is now a rule with a `why` and a `judgement` source, so it appears in RULES.md
  and can be argued with rather than found by reading the code.
- **Would be wrong if:** borrowers read the option as a suggestion that someone in their house
  ought to go and earn. The conditional phrasing is doing that work and is worth watching.
- **Source:** my judgement, 2026-09-08.

### The expected-earnings question said "because of this"

- **Choice:** *"How much more do you expect to earn each month because of this?"* became
  *"Once you have it, how much more would you earn in a month?"*, with a new hint saying it
  means money kept after fuel, stock or repairs rather than extra business done, and the
  `whyWeAsk` now discloses that only half of the figure is counted.
- **Why:** "because of this" has no referent on a one-question-per-screen flow — the loan, the
  purchase, the answer before it. "Once you have it" anchors it to the thing being bought,
  which is what the rule actually models. The engine halves the answer
  (`income.productive-earnings`), and a borrower who is told that gives a straighter number
  than one who suspects it.
- **Rejected:** *Naming the purchase in the prompt* — the question applies to vehicles, shop
  stock and any purpose flagged productive, so it would need three variants for a small gain.
  *Leaving the halving undisclosed* — it is exactly the kind of quiet discount the honesty row
  is about.
- **Assumes:** borrowers can separate takings from earnings. The hint is there because that
  assumption is thin.
- **Would be wrong if:** answers come back looking like revenue rather than profit, which
  would show up as implausibly large uplifts.
- **Source:** my judgement, 2026-09-08.

### Rules registered in `path-to-yes.ts` were missing from RULES.md entirely

- **Choice:** `scripts/gen-rules-md.ts` now imports `../engine/path-to-yes` alongside
  `../engine/compute`, and `path` has a named section, "What would change the answer".
- **Why:** the generator's comment claimed importing the engine "pulls in every module that
  registers a rule". It does not: `path-to-yes` imports `compute`, not the reverse, so nothing
  in the generator's import graph ever loaded it. `path.gap-closers` has been missing from
  RULES.md since it was written, and the new co-applicant rule would have been too. RULES.md
  went from 31 rules to 33.
- **Rejected:** *Relying on the leftover-prefix catch-all at the end of `main()`* — it is
  already there and did not help, because the rules were never registered at all; the guard
  protects against an unnamed prefix, not an unimported module. *Auto-importing every file
  under `engine/`* — a glob import in a generator is a worse trade than one explicit line.
- **Assumes:** someone adding a rule in a new file outside `engine/rules/` will notice the
  rule count in the generator's output line. That is thin, and is the real open item.
- **Would be wrong if:** a third such file appears and nobody counts. A test asserting every
  `register()` call site is reachable from the generator would close it properly.
- **Source:** found while regenerating, 2026-09-08.

### The run-throughs gained a third category, and a total that reconciles

- **Choice:** `scripts/gen-runs.ts` now tracks every question the document mentions and adds
  **"Applies, but never worth asking"** for those that pass `applies()` yet are never ranked.
  The footer was replaced with a breakdown that adds up: *"28 questions exist. Anita is asked
  17, 2 more are offered and skipped, 1 applies but is never worth raising, 8 do not apply."*
- **Why:** `large-expense` applies to Anita and appeared nowhere — "Never asked" is built from
  `applies() === false`, so a question that applies but is never surfaced fell through both
  lists. The old footer said "Anita sees 17 of them" against a total of 28, and nothing in the
  document accounted for the rest. A judge who counts is the reader this file is written for.
- **Rejected:** *Forcing the question to be asked* — it moves nothing for her, and asking it
  would break the rule that earns the question-design row. *Listing it under "Never asked"*
  — false; it does apply. *Leaving the footer as one number* — the count was the tell.
- **Assumes:** the reason holds for every borrower who lands in this category, so one blurb
  covers it. True today, because the ranking has exactly two admission tests.
- **Would be wrong if:** a third admission test is added and the blurb stops describing why
  something was left out.
- **Source:** found by the user asking what a manual run of Anita would show, 2026-09-08.

### Options now disclose what they assume, and disclosure is separate from demotion

- **Choice:** `Option` gained an optional `assumes` string, rendered under the option in
  `ui/DontScreen.tsx`. `clear-app-loans` carries "the whole of what you pay each month is app
  loans — if some of it is a bank loan that carries on, the gain is smaller". It is **not**
  marked `assumesAnInput`.
- **Why:** the option zeroes `existingEmis` entirely, because one field holds every loan and
  nothing says which part is the app loans. For Anita that is defensible — ₹6,000 total, app
  loans present — but for a borrower with a car loan running alongside it overstates the gain,
  in the one direction this tool exists to prevent. Saying so is the half of the fix that does
  not need a new question.
- **Rejected:** *Clearing only the app-loan flag and leaving the instalment* — measured: the
  option drops to +₹0 for Anita, which strips the number from advice the verdict already
  gives her ("clear the app loans first"). Understating is not automatically honest.
  *Marking it `assumesAnInput`* — tried, and it put the invented co-applicant income back on
  top, because both would tier together and the co-applicant delta is larger. The two are not
  the same thing: one option's premise is invented, the other's premise is real and only its
  size is uncertain. `assumesAnInput` demotes; `assumes` discloses.
- **Assumes:** a borrower reads a one-line caveat under the figure. It is the same weight of
  disclosure as the assumption list on the results screen.
- **Would be wrong if:** the field is ever split, at which point the caveat should go and the
  arithmetic should just be right.
- **Source:** my judgement, 2026-09-08.

### `appLoanOutstanding` deleted rather than wired up

- **Choice:** removed from `engine/answers.ts`, `engine/personas.ts` and the `clear-app-loans`
  change.
- **Why:** dead since phase 1 — no question collected it, no rule read it, and only
  `path-to-yes` wrote to it. It has been listed as an open item every session without ever
  doing anything.
- **Rejected:** *Adding a question for it* — that is the proper fix for the overstatement
  above, and it is a question-set change, which is the deferred bucket. *Leaving it as a
  placeholder for that fix* — a schema field is trivial to reintroduce, and a field nothing
  reads is a standing invitation to assume it works.
- **Assumes:** whoever splits the loan question later will add the field back deliberately.
- **Would be wrong if:** something outside this repo depends on the answer shape. Nothing does.
- **Source:** my judgement, 2026-09-08.

### Two limits added to RULES.md's "What I do not know"

- **Choice:** paragraphs on post-retirement income and on existing loans being one number with
  no rate or breakdown, both written into the prose in `scripts/gen-rules-md.ts`.
- **Why:** both are limits established while fixing something else this session, and that
  section exists precisely so a limit is admitted rather than left to be discovered. The
  loans paragraph also names the two places the limit shows: "clear the dearest loan first"
  is advice the engine cannot check, and the app-loan what-if has to treat the whole
  instalment as app loans.
- **Rejected:** *Leaving them to the per-borrower assumption lines* — those are shown only to
  a borrower who hits them; the honesty row is read by someone who runs nothing.
- **Assumes:** the section stays prose. It is not generated from the rule tables, so nothing
  keeps it in step with them automatically.
- **Would be wrong if:** the prose drifts from the rules. It already has no mechanism against
  that, which is worth a note of its own.
- **Source:** my judgement, 2026-09-08.

### Phase 6: 6.1 and 6.2 run, 6.3–6.5 cut

- **Choice:** ran the clean-clone smoke test and the live rule-change rehearsal; cut all three
  optional items and wrote each one's reason into `WALKTHROUGH.md`'s "What I cut, and why".
- **Why:** the phase itself marks 6.3–6.5 "only if time remains" and its exit condition asks
  for anything unbuilt to be recorded as a deliberate cut rather than left looking unfinished.
  Each cut has a reason of its own, not just "no time": the **EMI slider** adds feel rather
  than a fact the screen does not already give; **acceptance odds** would be a confident
  number with no bureau data, no lender policy and no outcomes behind it, which is the exact
  thing this tool argues against; **URL-hash state** quietly reverses the "nothing leaves your
  device" promise made on the first screen, by putting someone's income in a link that ends up
  in a chat log.
- **Rejected:** *Building the slider* — the cheapest of the three, but the same screen space
  spent on the routing argument is worth more against the scoring. *Building acceptance odds
  half-calibrated* — worse than nothing here. *Shipping the URL hash without a deliberate
  "copy a shareable link" action* — the privacy default matters more than the convenience.
- **Assumes:** the reader of `WALKTHROUGH.md` treats a stated cut as a decision rather than a
  gap. That is what the section is for and it already carries six others.
- **Would be wrong if:** any of the three turns out to be what a judge looks for first. The
  odds one is the strongest candidate, and it is the one with the honest-data problem.
- **Source:** my judgement, 2026-09-08.

### The clean clone reports modified generated docs on Windows, and it is a false alarm

- **Choice:** recorded rather than "fixed".
- **Why:** in the fresh clone, `npm run gen` leaves `git status` showing RULES.md and all three
  run-throughs as modified. `git diff` shows **no content change** — git checks the files out
  with CRLF under the repo's line-ending setting and the generators write LF, so only the line
  endings differ. Anyone running this check will see the same thing and could reasonably
  conclude the docs are stale when they are not. `git diff --ignore-cr-at-eol` is the way to
  tell the two apart.
- **Rejected:** *Adding a `.gitattributes` pinning these files to LF* — the right fix, but it
  rewrites line endings across the working tree on submission day for a cosmetic reporting
  issue. *Making the generators emit CRLF on Windows* — makes the output platform-dependent,
  which is worse than the symptom.
- **Assumes:** the repo keeps its current autocrlf behaviour.
- **Would be wrong if:** CI ever gates on `git status` being clean after `gen`, which would
  fail on Windows for no real reason.
- **Source:** observed during the 6.1 smoke test, 2026-09-08.

### The home loan moved to the loans question, not to a new one

- **Choice:** `rentOrHomeEmi` was renamed `rent` and means rent only. A home-loan instalment
  is collected by the **existing loans** question, which already reaches both ceilings. Both
  questions carry a hint saying which box a mortgage goes in.
- **Why:** the bug was that a lender ignores rent in its ratios and counts a mortgage in full,
  while the engine excluded the whole field from `lenderCeiling`. Measured on a borrower
  earning ₹1.5L with a ₹35,000 housing cost: the lender figure was **₹33,56,500–₹42,36,864**
  when that ₹35,000 was called rent and **₹19,32,530–₹25,89,195** when it was counted as an
  obligation. A **₹14 lakh** overstatement, in the tool whose only promise is that it will not
  flatter you.
- **Rejected:** *A separate `homeLoanEmi` must question* — built first, and it fails the brief:
  the must set is capped at eight to ten and `tests/questions.test.ts` asserts exactly ten. It
  would have been eleven. *Making that question adaptive instead* — worse than the bug. An
  adaptive question can go unasked or be skipped, and then the mortgage reaches **neither**
  ceiling, where today it at least reaches the borrower's. A fix whose failure mode is losing
  the obligation entirely is not a fix. *Leaving one field and splitting it in the rules* —
  nothing in the data says which half is which.
- **Assumes:** a borrower puts a mortgage with their loans when both screens tell them to. That
  assumption is now a test: `personas.test.ts` asserts the rent prompt does **not** say "home
  loan", its hint does, and the loans hint does. The routing is a sentence, so the sentence is
  pinned like any other behaviour.
- **Would be wrong if:** borrowers ignore hints. The next step would be a yes/no follow-up on
  the housing cost, defaulting to "obligation" when unanswered — conservative, because that is
  the direction that does not flatter.
- **Source:** measured against the engine, 2026-09-08.

### Priya is the control, and she did not move

- **Choice:** kept the persona lender figures as explicit golden assertions across the change.
- **Why:** her ₹28,000 is rent, so if the split were wired to the wrong side her lender number
  would move. It did not — all three of the brief's borrowers came out identical on both
  amounts, and the only change in the three run-throughs is the question's wording. That is
  the difference between fixing the routing and moving the whole housing cost across.
- **Rejected:** *Trusting the suite to notice* — it would have, but the assertion says why it
  matters rather than leaving a future reader to work it out from a number.
- **Source:** run before and after, 2026-09-08.

### Mohan: a fourth persona, mine, deliberately outside `personas`

- **Choice:** added `mohan` — 59, salaried ₹2.2L, ₹75L education ask, ₹25,000 instalment with
  18 months left, **rent explicitly 0**, owns ₹60L property — exported on his own and **not**
  added to the `personas` array, so `npm run gen` still writes exactly three run-throughs.
- **Why:** seven real defects were fixed in this project without one golden moving. That is not
  a weak suite; it is a fixture set the brief designed to test routing, the two numbers and the
  refusal, and none of those three borrowers is near retirement, pledges property, or pays no
  rent. Mohan closes all three holes at once, and his eight goldens are the assertions that
  would have failed: secured routing, the loan-to-value cap binding instead of income, the
  sixty-month term kept, the retirement overrun disclosed, the term still shortening to twelve
  months where the product allows it, no rent blamed, no full-sanction promise, and no claim
  that waiting changes his answer.
- **Rejected:** *Adding him to `personas`* — it would generate a fourth run-through and change
  the deliverable set the brief asked for. *Deriving him from the brief* — he is not in it, and
  labelling him as though he were would be the same dishonesty this tool is built against. His
  `tests` field and the comment above him say he is mine.
- **Assumes:** `retirementAge: 60`. If that rule moves, his tenure golden moves with it, which
  is the intended behaviour.
- **Would be wrong if:** the three from the brief are ever taken as the whole fixture set again.
- **Source:** the borrower the user pasted, promoted to a fixture, 2026-09-08.

### Copy guards live next to the engine, not in a browser

- **Choice:** new `tests/copy.test.ts` — eight guards over a 108-borrower grid plus the three
  personas, asserting the **relationship** between a claim and the numbers behind it: rent
  never blamed at zero rent; no full-sanction promise where the lender ceiling falls short of
  the ask; no "alone changes this answer" unless a recompute moves the verdict; no ordering of
  loans claimed; collateral named where the cap binds; the bad month mentioned when it breaches
  **and an amount was quoted**; the retirement overrun disclosed whenever the term outruns
  working life; any what-if resting on a supplied number prints it. Plus a precision guard: no
  raw computed endpoint may appear in a sentence.
- **Why:** nine defects share the shape "number right, sentence wrong", and every sentence is
  generated from the trace by pure functions — so the guard is testable at engine level with no
  jsdom, and it runs in the existing suite. Golden strings would break on every reword; these
  break only when the link between claim and number breaks.
- **Rejected:** *A jsdom DOM suite* — heavier, slower, and it tests the renderer rather than
  the copy. Label duplication is the one case that genuinely needs the DOM, because those
  strings live in React; not built, and listed below. *Asserting exact sentences* — brittle
  against rewording, which is the thing that happens most often here.
- **Assumes:** copy stays generated from pure functions. The moment a sentence is assembled in
  a component, these guards stop covering it.
- **Would be wrong if:** a guard's regex drifts from the copy and silently passes. Each guard
  names the original defect in a comment so the intent survives a reword.
- **Note:** the first version asserted the bad month is always mentioned when stress breaches.
  It failed on a ₹12,000 income with a ₹20,000 instalment — correctly. That borrower gets a
  "don't" for a louder reason that fires first, and burying it under the stress case would be
  the wrong sentence rather than a missing one. The guard was narrowed to cases where an amount
  was actually quoted. A guard that fires on correct behaviour is a bug in the guard.
- **Source:** the user's design, 2026-09-08.

### "Clear the dearest loan first" removed

- **Choice:** replaced with "clear the app loans first" where the app-loan flag is set, and
  "paying down what you already owe does more for you here than a new loan would" otherwise.
- **Why:** the engine holds one instalment total. It cannot rank loans by cost, so a sentence
  telling a borrower which is dearest claims knowledge that does not exist. The app-loan version
  is a claim about a **category** — app and BNPL lending is the dearest money in this market —
  and that one is defensible without knowing anything about their particular loans.
- **Rejected:** *Keeping it as generic advice* — it reads as advice about your loans, and a
  guard now fails on the word.
- **Source:** the user's instruction, 2026-09-08.

### `format.ts` audited, and the finding is a guard rather than a change

- **Choice:** no code change. Seven sites interpolate rupees outside `format.ts`; all seven
  print a **stated answer or a rule constant** — the borrower's own instalment, the assumed
  co-applicant income, the product's minimum ticket, the assumed-rent band, the household
  spending default. Not one prints a computed interval endpoint, which is what `format.ts`
  exists to round outward.
- **Why:** the distinction that makes those seven safe was undefended. The precision guard in
  `copy.test.ts` now asserts no computed endpoint appears in a sentence, so the first person to
  interpolate one gets a failure rather than a screen reading "₹29,52,538".
- **Rejected:** *Routing the seven through `format.ts`* — `rupees()` renders them identically,
  so it would be churn. *Rounding stated answers* — actively wrong: a borrower who says ₹6,000
  should be shown ₹6,000.
- **Source:** the user's question, audited 2026-09-08.

## Open items


- **Phase 5 exit condition passed 2026-09-08, checked by the user, not by me.** They walked
  the flow at a phone width and reported no horizontal scroll. Recorded as their verification
  rather than mine, because every automated attempt here failed — detail kept below, since
  the next session will hit the same extension.
- Superseded by the line above, kept for the failure mode: The remaining bullet
  is: walk Priya's flow at 375px, confirm no horizontal scroll and a numeric keypad on money
  fields. Attempted through the Chrome extension and abandoned after it failed the same way
  the previous session recorded: `resize_window` returned success twice while `window.innerWidth`
  stayed at 1536 and `window.outerWidth` read **0**, and clicks by both element ref and
  coordinate did not reach the app (the landing screen rendered, "Start" never advanced).
  Half of the bullet is settled anyway — every money field carries `inputMode="numeric"`
  (`ui/Field.tsx`, six of them, plus `inputMode="decimal"` on the two quote fields in
  `ui/QuoteCheck.tsx`) — so what is genuinely unverified is the 375px layout. That needs a
  human at a phone width. **Phase 5 stays open and phase 6 stays unstarted.**
- ~~The goldens did not move, and that is the problem.~~ **Closed by Mohan**, who covers age,
  the collateral cap and zero rent, with eight goldens. Original reasoning: Four real defects, none touched by
  278 tests. The persona set has no borrower near retirement, none pledging property while
  paying no rent, none capped by collateral. Adding one such persona would have caught three
  of these four. It changes the golden set deliberately, so it is a decision to take rather
  than a chore to squeeze in.
- **One DOM test still worth having: duplicate labels on a screen.** Those strings live in
  React, so `copy.test.ts` cannot reach them — it was two rate bands both labelled "Rate" that
  produced one of the nine. Everything else of that shape is now guarded at engine level.
- ~~`rentOrHomeEmi` is one field, overstating sanction for a home-loan borrower.~~ **Fixed** —
  measured at ₹14 lakh on a ₹1.5L income. The home loan now rides with the other loans.
- ~~`AffordabilityResult` and `StressResult.rate` remain dead.~~ **Deleted.** `rate` had
  always been a placeholder `iv(0, 0)`.
- ~~`runs/anita.md` never mentions the `large-expense` question.~~ **Fixed** — third category
  added and all three footers now reconcile to 28.
- ~~`appLoanOutstanding` is asked by nothing.~~ **Deleted.**
- ~~RULES.md is missing the post-retirement and existing-loan limits.~~ **Added.**
- ~~`clear-app-loans` overstates what clearing app loans frees.~~ **Disclosed**, not fixed —
  the arithmetic is still whole-instalment; only a split question can make it right.
- **Existing loans are still one number, with no rate and no split.** Correct for both
  ceilings — FOIR and surplus each count the instalment, not its rate, and a home loan now
  belongs in that total. What it still costs is the app-loan share: `clear-app-loans` clears
  the whole instalment, which overstates the gain for anyone with a bank loan running
  alongside. Disclosed in the option and in RULES.md rather than silent, and guarded by a copy
  test that no ordering of loans may be claimed. The real fix is a follow-up question on how
  much of the total is app or BNPL — which is where the deleted `appLoanOutstanding` field
  would come back, deliberately.
- **Phase 5 and 6 both closed before this batch landed**, so these commits sit on top of a
  finished build rather than inside a phase. If the entry was submitted from `0bc9260`, that
  commit is still reachable and can be tagged retrospectively; nothing here rewrites it.
