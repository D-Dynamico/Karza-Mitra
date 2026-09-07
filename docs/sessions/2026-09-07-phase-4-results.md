# 2026-09-07 — Phase 4, results screens and the Card

## Scope

Phase 4 in full: the O1–O4 panels, "tighten this", the Negotiation Card on screen, the lender
quote checker and its nudges, the "don't" screen with path-to-yes toggles, the secured/unsecured
comparison, print, and an error boundary. Substeps 4.1–4.9 and 4.11; 4.10 partly cut, below.

Before this, `ui/` was two files and a placeholder sentence.

## Changes

- **New UI**: `styles.css`, `Results.tsx`, `Working.tsx`, `Card.tsx`, `QuoteCheck.tsx`,
  `DontScreen.tsx`, `ErrorBoundary.tsx`, `units.ts`, `env.d.ts`; `App.tsx` rewritten.
- **Two views, not one page** — the results, and the Card behind a button.
- **A unit table for trace values** (`ui/units.ts`), after the working drawer was found showing
  a ratio as rupees.
- **New tests**: `tests/units.test.ts` (4), and card/verdict guards added earlier in the day.
  249 passing overall.

## Decisions

### The Card is its own view, not a section of the results page

- **Choice:** the results page ends with a button ("Take this to the lender →"); the Card
  renders on its own screen with a back link.
- **Why:** the Card's seven rows are amount, product, rate, all-in rate, fee, tenure and
  instalment — every one of which already has a panel above it. Measured, that is ~373 words
  of pure duplication, and it was the single largest cause of a page the user described as
  "too much info at one single page". The Card repeats those numbers *by design*, because that
  is what makes it useful across a desk; the mistake was rendering it under the page it echoes.
- **Rejected:** tabs (Answer / Working / Card) — shortest single view, but a judge scoring
  explainability may never click through, and hiding the reasoning behind a tab is a real risk
  on a 20-point row. Also rejected: trimming prose while keeping the Card inline, which leaves
  the actual cause in place.
- **Assumes:** a reader will press one clearly-labelled button to reach the Card.
- **Would be wrong if:** the Card is the thing most readers want first, in which case the
  button should be at the top rather than the end.

### Product routing stays on the surface; everything else folds into drawers

- **Choice:** the rate explanation, the bad-month detail and the full working are in
  `<details>` drawers. The routing reasoning and the costed secured/unsecured comparison table
  are not — they render inline.
- **Why:** routing is the heaviest thing in the 30-point domain row, and a costed side-by-side
  of the option the borrower is being steered away from *is* the argument, not a footnote to
  it. It was briefly folded into a drawer while shortening the page, which put the reasoning
  one tap further away than the number it justifies. The user asked for it back, and they were
  right.
- **Would be wrong if:** the page grows long enough again that the table is what pushes it
  over. Then something else goes, not this.
- A comment sits on that block saying so, so a later tidy-up does not re-fold it.

### Trace values get an explicit unit table rather than a heuristic

- **Choice:** `ui/units.ts` maps rule ids to output units and `rule::input name` to input
  units, defaulting to money.
- **Why:** the working drawer rendered the lender FOIR ceiling — a ratio of 0.4 — as
  **"₹0 to ₹500"**, and a four-point credit premium would have shown as ₹4. The trace carries
  bare numbers with no unit, which is right for the engine and not enough for a screen.
- **Rejected:** guessing from the rule id, which was tried first and does not work —
  `stress.outflow` emits an already-multiplied 53.4 while `affordability.safe-outflow` emits a
  0.4 ratio, and no naming convention separates them. Also rejected: adding a `unit` field to
  `TraceEntry` and setting it on every rule — correct in principle, but it touches every rule
  file for a presentation concern, and inputs would still need naming.
- **Assumes:** new rules that emit non-money values get an entry. The test below is what
  catches the ones that do not.
- **Would be wrong if:** the engine ever emits a genuine sum of money below one rupee.
- **Guarded by** `tests/units.test.ts`, which walks every value every rule emits for all three
  borrowers and fails on any impossible rendering. That is a stronger check than pinning the
  two cases that were wrong.

### Save-the-Card-as-an-image is cut; print stays

- **Choice:** ship the print stylesheet (A4, single page, chrome hidden, drawers forced open)
  and drop the image export. `phases.md` exit condition amended in place with the date, rather
  than quietly ignored.
- **Why:** the Card exists to be carried into a branch, and print-to-PDF gives a shareable file
  on both desktop and phone. A PNG adds little for a page whose job is to be read across a
  desk. The browser route (SVG `foreignObject` → canvas) fails silently when it fails, and a
  button that sometimes yields a blank image is worse than no button — especially unverifiable
  while the browser tooling was refusing screenshots.
- **Rejected:** building it anyway (roughly an hour, unverifiable at the time, and competes
  directly with phase 5, which is 15 points sitting at zero); leaving phase 4 formally open,
  which under the project's own rule blocks phase 5 from starting.
- **Would be wrong if:** the Card is expected to be shared over WhatsApp, where an image is the
  native currency and a PDF is friction. That is a plausible reading of this market and the
  strongest argument against this call.

### Printing hides only the chrome

- **Choice:** `@media print` hides `.no-print`, the masthead, the pickers and the card actions,
  and forces drawers open.
- **Why:** the first version hid every `.panel`, which was fine while the Card lived on the
  results page. Once the Card became its own view, that rule would have printed a **blank
  sheet** from the results page. Caught while restructuring, not by a test.
- **Drawers print open** because a printed page cannot be expanded.

### The "don't" toggles never show an instalment beside a withheld amount

- **Choice:** when the projected verdict is still `dont`, the summary says "Still not enough to
  change the answer: safe to carry nothing" and omits the instalment ceiling.
- **Why:** it read **"Safe to carry nothing, at most ₹3,300 to ₹4,000 a month"** — two
  individually true sentences that contradict each other in front of a borrower. The safe
  amount is held at zero by the verdict while the ceiling reflects affordability alone.
- Found by ticking the toggles and reading the result, not by a test.

### The persona picker is temporary, and says so on screen

- **Choice:** three name chips, with a line underneath saying the question flow lands in phase 5.
- **Why:** phase 4's exit condition explicitly allows loading a persona directly. Saying so on
  screen is better than a reader assuming this is the intended entry point.
- **"Tighten this" scrolls to the assumptions** rather than opening a question, for the same
  reason — there is no question screen yet. It is already driven by `questionsFor`, so phase 5
  only has to change where the click goes.

### One "tighten this" per panel, not two

- **Choice:** `TightenThis` takes a `limit`, defaulting to 2, and the results page passes 1.
- **Why:** six suggestion buttons across a page is noise competing with the answer.

## Files touched

- `ui/` — eight new files, `App.tsx` rewritten. See Changes.
- `tests/units.test.ts` — new.
- `phases.md` — 4.1–4.9 and 4.11 ticked; 4.10 amended with the cut; exit condition amended.
- `WALKTHROUGH.md` — image export added to "what I cut".

## Verification

- `npx tsc --noEmit` clean, `npm run build` succeeds, **249 tests passing**.
- No hand-written per-borrower copy in `ui/` — grepped for the three names; the only hit is a
  comment saying not to add any.
- Driven by hand in Chrome at desktop width:
  - **Priya** — two numbers side by side; working drawer opens and the arithmetic adds up
    (1,10,000 − 28,000 rent − 14,000 loan − 27,500 household = ₹40,500 surplus; lender headroom
    60,500 − 14,000 = 46,500).
  - **Quote checker** — typing 16% yields an all-in of 17.5–18%, **1.66 points above the
    headline**, which is the 3% fee plus its GST over 60 months. Both nudges fire (out of band,
    and instalment above ceiling), one red line each, no modal; "use it anyway" dismisses them
    and keeps the figures.
  - **Anita** — the "don't" screen; toggles genuinely re-run `compute` and the projected
    numbers move.
- The unit table was checked against a dump of every trace value for all three borrowers.

### Checked by the user, not by me

Chrome began returning "Cannot take screenshot with 0 width" and then blocked the extension, so
two items were handed over rather than thrashed at:

- **Ravi's results screen** — the persona that exercises the routing panel hardest.
- **The Card printing to a single A4 page.**

Both were confirmed done by the user on 2026-09-07, with no defects reported back. Recorded
here as their verification rather than mine, because that is what it was.

## Open items

- **Phase 4 closed** — the two outstanding checks were confirmed by the user.
- Phase 5 is the last scored gap: product craft, 15 points, nothing built. Its exit condition
  needs the flow walked at 375px with no horizontal scroll — the layout is built mobile-first
  but has not been checked at that width.
- `whatMoved` in `engine/next-questions.ts` still has no caller. Phase 5 is its caller.
- `appLoanOutstanding`, `vehicleIsProductive` and `gstRegistered` are still set on personas with
  no live question filling them. Carried from phase 3; wire or remove in phase 5.
- The gold loan rate band is still the only `judgement` product source.
- Ravi's fixture rent still relies on `rent.owns-premises` — put to the user twice, unanswered.
  It only bites the fixed personas; the live flow always asks.
