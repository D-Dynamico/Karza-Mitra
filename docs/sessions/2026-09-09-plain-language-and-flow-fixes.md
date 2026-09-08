# 2026-09-09 — plain language, and six fixes to the flow

## Scope

A review pass on the UI, from a list of specific complaints. Not a phase in `phases.md` —
this is remedial work on what phases 4 and 5 shipped.

The central complaint: the copy was written for the judge, not for Anita. Phrases like
"without the plan getting fragile", "two rulebooks, not one number with a margin of error"
and "several points more" are clever sentences about lending where a rider in Hubballi
reading English as a second language needs plain sentences about her money. The brief's
test is "could a borrower use this at a branch", and the verdict block — the one part
everyone reads — failed it.

Alongside that, five smaller flow and layout fixes.

## Changes

- **The opening screen was centred**, then rebuilt around the two-number idea — see the
  second half of this note.
- **Skipping an essential asks once**, in red, with the cost restated. The second press
  always goes through; adaptive questions still skip on one press as before.
- **The loans question asks whether there is a loan at all** — "Do you have any loans
  running now?" with a "No, I have no loans" button — instead of putting a rupee box in
  front of a borrower who has none. The three follow-ups were already gated on the answer
  being above zero.
- **"Once you have it" now names the thing** — the vehicle, the stock — through a new
  optional `promptFor` on a question.
- **Nobody who says their income supports one person is asked whether anyone else earns.**
  Household size will no longer accept zero, and age will no longer accept under eighteen;
  both bounds were already in the answers schema and were simply not on the input.
- **"How many months of expenses do you have saved?"** replaces "If your income stopped,
  how many months could you cover?", which asked the same thing while making the borrower
  picture losing her job.
- **A full copy pass** over the verdict, the amounts panel, the product section, the
  Negotiation Card, the don't-borrow screen and the question registry, against five rules
  now written down at the top of `engine/rules/verdict.ts`.
- **The rejected product is costed in rupees**: "The same ₹11.6 lakh as a personal loan
  would cost you about ₹2 lakh more in interest over 5 years", computed by the engine and
  traced, replacing "several points more".
- **Numbers read the way people say them**: a range whose ends are within 5% collapses to
  one "about" figure, terms are in years, computed amounts are rounded before they reach a
  sentence, and lakh keeps a decimal below ₹20 lakh.

### Second pass — the opening screen carries the argument

The centring landed, but the screen still read as a generic form card: four lines of prose
above a wide button, with everything at the same visual weight. The product's one idea —
what a lender will give you is not what you can afford — was stated in a paragraph rather
than shown. Rebuilt:

- The masthead promise is now **"What a lender offers isn't always what you can safely
  afford."**
- The card's centrepiece is **two tiles**, drawn with the same `two-up`/`theirs`/`yours`
  classes the answer screen uses for the real figures: "A lender may offer / What they will
  approve" beside "Safe for you / What you can actually pay". The opening screen is a
  preview of the answer screen, in the same shapes.
- Intro copy cut from three sentences to one, with the "don't borrow" promise moved below
  the tiles where it reads as a third thing you get rather than a caveat.
- The CTA is **"Start assessment →"**, sized to its words instead of the full card width.
- Privacy moved outside the card as a quiet line: **🔒 Private. Nothing leaves your device.**
- The demo borrowers became **example cards under a "Want to see how it works?" divider**,
  each with a one-line description, replacing "load one of the three borrowers from the
  brief" — which told a stranger nothing about which one to press.

## Decisions

### A displayed range narrower than 5% collapses to one figure

- **Choice:** `moneyRange` returns `about ₹4.8 lakh` rather than `₹4.7 lakh to ₹4.9 lakh`
  once `(hi − lo) / hi < 0.05`. `perMonth` does the same, but collapses to the top of the
  range rather than the middle.
- **Why:** the two ends of a 4% range are not two situations the borrower can act on
  differently. Printing both invites the reader to work out what separates them, and
  nothing does. This is the only place in `format.ts` that narrows a range, which the
  module's own rules forbid — the justification is that the word "about" gives back the
  width the digits lost, and a range nobody can use is worse than a rounded figure
  everybody can.
- **Rejected:** leaving it alone (the complaint stands); collapsing to the lower end
  everywhere (an EMI read light is a worse error than one read heavy, which is why the
  monthly figure alone goes to the top).
- **Assumes:** 5% is below the width at which a borrower would behave differently at the
  two ends. Judgement, not measured.
- **Would be wrong if:** a real range sat just under 5% and its ends genuinely implied
  different products or lenders. None does today; the lender ranges that mean two kinds of
  lender are far wider, and the "almost nothing at a bank" branch fires before this one.
- **Source:** my judgement, 2026-09-09.

### `perMonth` collapses upward, against the illustration in the request

- **Choice:** "₹7,500 to ₹7,600 a month" becomes "about ₹7,600 a month", not "about
  ₹7,500" as the request illustrated.
- **Why:** `format.ts` already carries a written rule that an EMI is always rounded up, so
  nobody plans against a figure that is too low. The request's point was that the range
  should collapse; which end it collapses to is a separate call, and the existing rule
  already answers it.
- **Rejected:** following the illustration exactly — it would silently reverse a decision
  this codebase had already made and recorded.
- **Would be wrong if:** the figure is read as a quote to compare rather than a limit to
  stay under. It is labelled "Most you should pay", so it is a limit.
- **Source:** my judgement, 2026-09-09.

### Lakh keeps one decimal below ₹20 lakh and drops it above

- **Choice:** `inLakh` switches from one decimal to none at 20 lakh, where it used to
  switch at 10.
- **Why:** at ten, ₹14,41,000 printed as "₹14 lakh" in the same sentence as "about ₹58,000
  more than is safe for you" — the reader subtracts and it does not come out. At thirty,
  the decimal is the opposite error: "₹29.5 lakh to ₹33.2 lakh" claims a tenth of a lakh
  matters on a figure resting on an assumed rent.
- **Rejected:** one decimal everywhere (noise at crore scale); none everywhere (the
  arithmetic contradiction above).
- **Assumes:** twenty lakh is roughly where a tenth of a lakh stops being a fact the
  borrower would act on. Judgement.
- **Source:** my judgement, 2026-09-09.

### The rejected product is costed at the midpoint of each band, over one shared term

- **Choice:** `costOfTheAlternative` in `compute.ts` prices both products on the same
  amount over the same term, each at the **midpoint** of its own published rate band. The
  term is the chosen product's, clamped into the alternative's band. It returns nothing
  when the alternative is the cheaper of the two.
- **Why:** "several points more" is true and unusable. A rupee figure is what the borrower
  can repeat at the counter, and the pledge argument is the heaviest thing this engine is
  judged on. Midpoints because pairing one product's floor against the other's ceiling
  would manufacture whichever answer we wanted. Clamped term because a personal loan is
  not written over fifteen years, and costing one there would be inventing a product to
  lose the argument to.
- **Rejected:** an interval of extra interest (the ends cross and can go negative, which
  reads as nonsense); comparing each product over its own preferred term (two variables at
  once, so the number no longer isolates the rate); putting the sentence in `Results.tsx`
  (it is a claim about this borrower, so a rule computes it).
- **Assumes:** the borrower would be offered something near the middle of each published
  band. For a borrower priced at an extreme, the figure understates or overstates the gap.
- **Would be wrong if:** the two products' terms are so far apart that a same-term
  comparison stops resembling either real offer. Watch the gold loan, whose band tops out
  at 36 months.
- **Source:** my judgement, 2026-09-09. Rate bands unchanged, from `products.bands`.

### The sentence explaining why the two numbers differ moved into the engine

- **Choice:** `Result.amounts.whyTheyDiffer`, set from whether rent is actually counted,
  and used both as the `amounts.safe` trace reason and as the line under the two figures.
- **Why:** it was fixed text in `Results.tsx` and in the trace, and both blamed rent
  whether or not the borrower paid any — the same defect the copy tests were written for,
  sitting in the one place they did not look. A claim about a borrower is a rule's to make.
- **Rejected:** branching in the component (the file's own rule forbids it, for this
  reason); reading the trace entry back out by rule id in the UI (fragile coupling to a
  string).
- **Source:** my judgement, 2026-09-09.

### The loans question became "do you have any?", rather than adding a second question

- **Choice:** `existing-emis` switched from `money` to `money-optional`, reusing the field
  that already served "does anyone else earn?".
- **Why:** it makes the common answer the easy one and asks the plainer sentence, without
  adding a question that moves no number on its own — which the registry policy would
  reject.
- **Rejected:** a separate yes/no question before the amount (two questions expressing one
  fact, and the yes/no alone moves nothing); leaving it (the complaint stands).
- **Source:** my judgement, 2026-09-09.

### A skip confirmation on essentials only, and only once

- **Choice:** `tier === 'must'` questions need two presses; the second always goes through.
- **Why:** the cost of skipping an essential is not a wider range but an answer built on a
  guess about the borrower's own money. That is worth one interruption. It is deliberately
  not a block: skip has always been unconditional here, and an app that argues with a
  borrower is the thing this project is built against.
- **Rejected:** confirming every skip (noise, and adaptive skips genuinely only widen the
  answer); refusing the skip (breaks the stated design).
- **Source:** my judgement, 2026-09-09.

### A vocabulary guard, over a named surface rather than everything

- **Choice:** `tests/copy.test.ts` gains a `BANNED` list — instalment, sanction, band,
  unsecured, lever, ceiling, points, dearer, vintage, evidenced, underwrite, rulebook,
  fragile, FOIR, outflow — checked against the verdict, the assumptions, every row of the
  Negotiation Card, the routing prose, the whole question registry, the output labels, the
  "tighten this" promises and the what-if list.
- **Why:** none of the existing guards could see this class of defect, because every
  sentence they were checking was arithmetically true. The list is the fix and the ratchet.
- **Rejected:** including the rule `why` fields in the working drawer. Those are the "show
  the working" register, one tap away, and rewriting thirty of them was not what was asked.
  Deliberately deferred — see Open items.
- **Would be wrong if:** a banned word is genuinely the clearest available term for
  something. Then the entry comes off the list with a note, rather than the sentence being
  contorted around it.
- **Source:** my judgement, 2026-09-09, from the five copy rules in the request.

### Golden strings in `honesty.test.ts` were moved, not loosened

- **Choice:** three assertions that matched old wording — `'any amount'`,
  `'fits under all three'`, `'All-in rate, fees included'` — were retargeted at the new
  wording rather than relaxed into regexes.
- **Why:** they are the intended failures of a copy change. Each still asserts the same
  relationship between a claim and the numbers behind it.
- **Source:** the working agreement — if a rule changes, a golden test should move.

### The opening screen reuses the answer screen's own two-number shapes

- **Choice:** the landing tiles are `.two-up` with `.theirs` and `.yours`, the same classes
  and the same grey/blue left borders the results panel uses for the real figures.
- **Why:** the request's strongest point was that "lender approval vs safe amount" is the
  product and was buried in paragraphs. Drawing the promise in the shapes the answer
  actually arrives in makes the first screen a preview rather than an advertisement, and
  costs no new visual vocabulary.
- **Rejected:** a tick-list of three things the tool does — it makes the two-number idea one
  bullet among three, which is the flattening being complained about; icons on the tiles —
  the rest of the app is typographic, and a card and shield emoji would be the only
  illustration in the product.
- **Would be wrong if:** the results panel's two-up styling changes for reasons of its own.
  The landing page would follow it silently, which is the intent, but worth knowing.
- **Source:** the user's own mock, 2026-09-09.

### The example blurbs describe the borrowers, not the labels in the request

- **Choice:** "Salaried, has a car loan" (Priya) · "Shopkeeper, owns his shop" (Ravi) ·
  "Missed a payment recently" (Anita), stored as a new `blurb` on `Persona`.
- **Why:** the request suggested "Ravi — Existing EMIs", but Ravi's `existingEmis` is 0 and
  Priya's is ₹14,000 a month. A wrong label on the front door is worse than no label. The
  blurbs now name what each borrower is actually there to show: the two numbers diverging,
  product routing, and "don't borrow".
- **Rejected:** reusing `Persona.tests` — that sentence is written for someone reviewing the
  engine ("Whether 'don't borrow' fires…") and is not a choice a visitor can make; hardcoding
  the strings in `App.tsx` — they are facts about the personas.
- **Source:** the persona data itself, checked against `engine/personas.ts`.

### "Start assessment", despite being a shade more formal than the rest

- **Choice:** kept the request's wording rather than substituting something plainer.
- **Why:** it is a common word, it says what happens next, and "Start" alone was the generic
  label being complained about. It sits slightly outside the plain-language register set
  earlier in this session, which is worth noting rather than hiding.
- **Rejected:** "Find my safe borrowing amount →" (long, and it promises one number where
  the screen has just promised two); "Start" (the original complaint).
- **Would be wrong if:** the word tests badly with borrowers reading English as a second
  language. It is one string, in `App.tsx`.
- **Source:** the user's recommended copy, 2026-09-09.

## Files touched

- `engine/format.ts` — narrow-range collapse, `approx`, `tenure`, lakh decimal threshold.
- `engine/rules/verdict.ts` — the five copy rules written down; every branch rewritten.
- `engine/compute.ts` — `costOfTheAlternative`, `amounts.whyTheyDiffer`.
- `engine/questions.ts` — `promptFor`, `min` on number inputs, the loans and savings
  questions, co-applicant gating, copy throughout.
- `engine/outputs.ts` — plain-language output labels.
- `engine/rules/products.ts`, `engine/card.ts`, `engine/path-to-yes.ts` — copy.
- `ui/App.tsx`, `ui/styles.css` — the rebuilt opening screen (two-tile centrepiece,
  narrower CTA, privacy line, example cards under a divider), skip-confirm styling.
- `engine/personas.ts` — a `blurb` per persona for the example cards.
- `ui/Flow.tsx` — skip confirmation, contextual prompts in the flow and the review list.
- `ui/Field.tsx` — `min` with a message, generic "no" escape on the optional-money field.
- `ui/Results.tsx`, `ui/DontScreen.tsx`, `ui/Card.tsx` (via `card.ts`), `ui/Confidence.tsx`,
  `ui/QuoteCheck.tsx`, `ui/Working.tsx`, `ui/units.ts` — copy, years, the costed
  alternative.
- `scripts/gen-runs.ts` — the generated run-throughs follow the same words.
- `tests/format.test.ts` (new), `tests/copy.test.ts`, `tests/questions.test.ts`,
  `tests/honesty.test.ts`.
- `RULES.md`, `runs/*.md` — regenerated.

## Verification

- `npx vitest run` — 322 passed, 13 files. Was 301 before; 21 new.
- `npx tsc --noEmit` clean. `npm run build` clean.
- `npm run gen` regenerated `RULES.md` and the three run-throughs.
- Driven in the browser at `localhost:5176`: the centred opening screen; the skip
  confirmation on the purpose question, both buttons; the loans question showing "No, I
  have no loans" / "Yes" and the amount box behind the yes; Priya's answer screen; Ravi's
  product section with the costed alternative; Anita's don't-borrow screen.
- Failures seen and fixed along the way: three golden strings in `honesty.test.ts`; nine
  separate jargon leaks the new guard found in `products.ts`, `questions.ts` and
  `path-to-yes.ts` that the manual pass had missed; a range-guard bug that compared
  "₹99,000" against "1.5" without scaling the lakh.
- The opening screen's divider rules rendered at **0px wide** and were invisible while
  looking correct in the stylesheet: as a flex item with auto inline margins, `.orline`
  shrink-wrapped to its own text, so the `flex: 1` pseudo-elements had no free space.
  Caught by reading the computed style in the browser, not by looking at the CSS. Fixed
  with `width: 100%`, and the reason is in a comment above the rule.
- `justify-content: safe center` on `.wrap.start`, so the taller opening screen cannot
  push its own top off a short phone.

## Open items

- **The card placement question is unanswered.** The request included "This card is what to
  do instead — not sure if it fits well here" and there are four candidates: "Clear these
  first, in this order" on the don't screen; the "Take this to the lender" button; the
  "Tighten this" chips; the "What would change the answer" toggles. Asked and left open at
  the user's direction. Nothing in this session moved any of them.
- **The working drawer still speaks the old language.** Roughly thirty rule `why` fields
  say instalment, band, unsecured, FOIR. They are one tap away and are the explainability
  register rather than the borrower's, so they were left alone deliberately. If they are
  brought in, extend `everySentence` in `tests/copy.test.ts` to cover the trace and expect
  a large but mechanical diff.
- **The verdict kind is still printed raw** as the chip above the headline — "DONT" rather
  than "Don't". Cosmetic, untouched.
- **Only the opening screen got the design pass.** The answer screen, the flow and the
  don't-borrow screen are unchanged in layout; the same "everything at one visual weight"
  criticism may apply to them.
- **The opening screen is not covered by the copy guard**, because its strings live in
  `App.tsx` JSX rather than in the engine. They were written to the same rules by hand.
- `Field.tsx`'s `min` message is not covered by a test; there is no DOM harness in this
  project and adding one for this was not worth it. The bound itself is tested through the
  registry.
