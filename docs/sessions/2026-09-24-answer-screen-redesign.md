# 2026-09-24 — answer screen redesign

## Scope

The user said the UI "feels bit generic and at times too much info and bit unclear language
and less interesting experience". This session is a UI and copy pass after phase 5, with no
phase exit condition and no rule values changed. Before changing anything I read all three
examples through as page text. What I found:

- Engine identifiers on screen: "DONT" above Anita's verdict, "With what you have ticked:
  dont.", and "borrow less" in lower case in the pivotal box and the "what moved" banner.
- The same fact said several times. Priya's page gave both amounts in the verdict and again
  in the "How much" panel, and gave the rent reason twice. Anita's page printed "Clear the
  app loans first…" in the verdict, again as item 1 of "Clear these first", and again as a
  toggle.
- Broken sentences: "safe for you nothing.", "You clear the app loans, and Three months…",
  "at most ₹0 to ₹3,000 a month".
- Form language: "Tighten this:" twice on one page, "band" in the offer checker, "Start
  assessment", "You can evidence your income".
- Nothing visual. The central claim of the product, that the two numbers are far apart,
  was only ever written down, never drawn.

## Changes

- **One verdict box** (`ui/Verdict.tsx`) on both the answer and "don't borrow" screens. It
  holds the verdict as a coloured word (`Borrow less`, `Don’t borrow now`), the headline,
  both amounts as **bars on one scale** with the ask marked on each, the why, and a set-apart
  "What to do" step. It replaces the old verdict box and the separate "How much" panel.
- **Start screen** shows two bars in the answer's style, in place of two tiles of
  placeholder labels: a long bar for "What a lender may offer" and a short one for "What
  you can actually pay". They carry no figures (see the decision below). The CTA is now "Find my safe amount →", with "About 10 questions.
  Nothing you type leaves this phone." under it. The masthead tagline is hidden on this
  screen only, because the card says the same thing.
- **`ui/words.ts`** holds one map from verdict kind to a plain word. It is used in the
  verdict box, the pivotal box, the what-if box and the flow's "what moved" banner.
- **"Tighten this" ×2 → one "Make this answer more exact" panel** at the foot of the answer.
  It holds at most two questions, de-duplicated across outputs, and leaves out the pivotal
  question because that already has its own box.
- **Offer checker folds away** behind "Got a rate from a lender? Check it here". "Band" is
  replaced with "a fair rate for you".
- **Example box made smaller:** the "Example" tag sits inline with the story, and the
  filled-in list is behind "N things we filled in for X".
- **"Don't borrow" screen:** the "Clear these first" panel is cut, since everything in it
  was already on the screen. The "What a lender would still give you" panel is cut too;
  that figure is now the first bar, with its caption. The toggle kinds read "You can do this
  now / Takes a few months / Only if it is true for you". The result of the ticked options is
  **pinned to the bottom of the screen** and takes the colour of the verdict it lands on, so
  ticking the right pair visibly turns it from red to amber. Joined labels are lower-cased
  after the first, and an EMI limit that starts at zero reads "an EMI of up to ₹3,000".
- Two option labels in `engine/path-to-yes.ts` are reworded: "Counting what the loan would
  earn you" and "You can show your income on paper — …".

## Decisions

### Draw the two numbers as bars, not only as figures

- **Choice:** horizontal bars on one shared scale, max(lender hi, safe hi, ask). Solid to
  the low end, pale from low to high, and a thin mark at the ask.
- **Why:** "the lender will give far more than you can carry" is the product's whole
  argument. Seen as a length it reads in half a second, before any sentence does. The
  solid/pale split keeps the rule that every quantity is an interval. It draws the range and
  does not smooth it away.
- **Rejected:** a gauge or dial (it shows one quantity, not two against each other);
  keeping the side-by-side tiles (numbers alone do not show the size of the gap); a chart
  library (not worth a dependency for two bars).
- **Assumes:** the lender figure is a meaningful length. When it is "close to nothing at a
  bank, up to ₹1.3 lakh from an NBFC", the bar is drawn from the interval as usual. Only the
  label is long.
- **Would be wrong if:** a user reads the bar length as a recommendation to borrow up to the
  lender's figure. Watch for this in testing with real users.
- **Source:** my judgement, 2026-09-24.

### Hide the "why they differ" caption on borrow-less

- **Choice:** the caption under the bars is `amounts.whyTheyDiffer`, except on
  `borrow-less`, where it is left off.
- **Why:** the borrow-less `why` already gives the same reason, and with the same checks
  behind it (`rentCounted`, `collateralBindsBoth`). Showing both put the rent sentence on
  screen twice, which breaks rule 4 in `verdict.ts`.
- **Rejected:** deleting the rent reason from the verdict text (that is engine copy, guarded
  by `copy.test.ts`, and it is the more carefully checked of the two).
- **Would be wrong if:** a future borrow-less `why` stops giving a reason for the gap.

### On "don't borrow", the lender figure moves into the bars and the lender panel is cut

- **Choice:** the lender bar carries the figure. The caption "Someone will lend you this
  money today. That does not make it a good idea." carries the warning. The dropped sentence
  was "This number exists here because…", which is about the screen, not about her money.
- **Why:** the lender figure only means something next to the safe figure. It used to be
  at the very bottom of the page, far from the safe figure it has to be compared with.

### Entry card is a figure-free diagram, not an example's answer

- **Choice:** two fixed-length bars (88% and 42%), labelled only, with no numbers or person.
- **Why:** the first version put Priya's live figures on the entry card. The user rejected
  it: "i didn't like starting with example". The first screen should be about the visitor.
  Examples stay one tap away underneath.
- **Rejected:** Priya's live bars (the user rejected them); the old text tiles (they
  describe the comparison without showing it).
- **Assumes:** the lengths are illustrative, and nobody reads the diagram as data. That is
  why there are no figures and the bars are `aria-hidden`.
- **Source:** user feedback, 2026-09-24. The 88/42 lengths are my judgement.

### Pin the what-if result to the bottom of the screen

- **Choice:** `position: sticky; bottom: 8px` on `.projected`.
- **Why:** with five toggles, the result box sat off-screen while you ticked, so a tick and
  its effect were never visible together. The re-run is the honest part of that screen and
  should be seen as it happens.
- **Rejected:** moving the box above the list (it would then scroll away as you go down the
  list).
- **Would be wrong if:** on a very short phone it covers the last toggle. The page scrolls
  past it, but check at 360×640.

### Verdict words live in the UI, not the engine

- **Choice:** `ui/words.ts` maps each kind to a word, and the engine kinds stay identifiers.
- **Why:** the kinds are used as keys in tests, runs and pivotal logic. Renaming them would
  touch everything for a display change. A `Record<VerdictKind, string>` makes TypeScript
  refuse a new kind that has no word.
- **Would be wrong if:** the generated `runs/*.md` start showing kinds to readers. Those
  are for reviewers today.

### Offer checker starts folded

- **Choice:** a `<details>` panel with the use case as its summary.
- **Why:** most readers have no quote yet, and two empty inputs in the middle of the answer
  read as another form.
- **Would be wrong if:** the tool is used mostly at the counter with a quote in hand. Then
  open it by default.

### Continue always takes the tap, and says what is missing

- **Choice:** Continue buttons in `ui/Field.tsx` are no longer disabled. Tapping one with
  an empty or impossible answer puts one amber line where the lakh echo goes, for example
  "Type an amount to continue, or skip below if you are not sure." The line clears on the
  next keystroke. The credit score box says "Type your score, or pick one of the answers
  below", or "A credit score is between 300 and 900". The income range says so when the
  good month is below the slow month.
- **Why:** the user reported that tapping Continue on an empty box did nothing. A disabled
  button looks broken and does not say what is missing. The line points to the skip,
  because skipping is always allowed.
- **Rejected:** keeping the button disabled with a note under it (the note would show
  before anyone did anything wrong); a red error style (this is a prompt, not a mistake);
  submitting an empty box as a skip (that would skip without the one confirmation that
  essential questions get).
- **Source:** user feedback, 2026-09-24.

## Files touched

- `ui/Verdict.tsx`: new. Verdict box and `AmountBars`.
- `ui/words.ts`: new. Verdict kind → word and tone.
- `ui/App.tsx`: start screen diagram and CTA, "don't borrow" screen uses `Verdict`, tagline
  hidden on start.
- `ui/Results.tsx`: "How much" panel folded into `Verdict`, one tighten block, plain verdict
  words in the pivotal box.
- `ui/Working.tsx`: `TightenThis` takes several outputs plus `exclude`, and renders as a
  panel.
- `ui/DontScreen.tsx`: two panels cut, plain toggle kinds, pinned coloured projection,
  sentence fixes.
- `ui/QuoteCheck.tsx`: folded, "band" removed.
- `ui/ExampleBio.tsx`: compact layout.
- `ui/Flow.tsx`: verdict word in "what moved".
- `ui/Field.tsx`: Continue always enabled, and a `Line` helper shows the echo or the
  type-or-skip prompt.
- `ui/styles.css`: dead `.two-up` and `.gap-note` rules removed. Added the pill, bars,
  projection, fold panel and compact bio.
- `engine/path-to-yes.ts`: two option labels.
- `docs/SYSTEM_DESIGN.md`: opening screen, verdict box, tighten block.

## Verification

- `tsc --noEmit` clean. `vitest run`: 13 files, 327 tests passing. `vite build` succeeds.
  `npm run gen` rewrote `runs/*.md` with no diff, because the option labels do not appear in
  them.
- In the browser, on a desktop-width window:
  - The start screen shows the two-bar diagram with no figures. (A first version with
    Priya's live bars was replaced after the user's feedback.)
  - Priya: "Borrow less" pill, bars with the ₹8 lakh mark, one tighten panel, offer checker
    folded.
  - Anita: "Don’t borrow now" pill, an empty safe bar. Ticking "clear the app loans" and
    "three months on time" turns the pinned box amber: "If you did this: Borrow less …, an
    EMI of up to ₹3,000 a month."
  - Ravi: the rent question now appears only in the pivotal box.
  - The first question screen is unchanged.
- Not checked at phone width. The window resize had no effect in this session.

## Open items

- Check at 360px: the bar headings with the long NBFC lender text, and the pinned what-if
  box on a short screen.
- Ravi's caption says "The difference is your rent", but his rent is an assumed 0–₹7,000
  range with "probably none". This is from the engine (`rent.hi > 0`) and predates this
  session. The wording should allow for an assumed rent.
- The "almost nothing, and at most ₹1.2 lakh" format (`format.ts`) is still clumsy inside a
  sentence.
- Toggle "Assumes…" lines are still long. They could fold away like the example's
  filled-in list.
