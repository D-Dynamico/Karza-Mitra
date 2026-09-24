# 2026-09-24 — example backgrounds

## Scope

A visitor who has not read the brief could press "Anita" and land on "don't borrow" with
no idea who Anita is. The only way to see her profile was the review screen, which lists
form fields rather than a person. This session adds a short "who this is" box above the
answer whenever an example is loaded. UI polish after phase 5; no phase exit condition
involved.

## Changes

- Each persona now has a `story` (two or three plain sentences: age, city, work, income,
  what they owe, what they want) and `filledIn` (what the brief did not say, in the
  visitor's words).
- New `ExampleBio` box above the verdict on both the answer screen and the "don't borrow"
  screen, with a link to see or change that example's answers.
- `App` tracks which example is loaded, and clears it on any answer edit or restart.
- `copy.test.ts` now runs the banned-vocabulary check over `blurb`, `story` and `filledIn`.
- `personas.test.ts` checks that each story's opening age and "Wants ₹X lakh" match the
  persona's answers.

## Decisions

### Story is hand-written data on the persona, not generated from answers

- **Choice:** a `story` string next to `blurb` in `engine/personas.ts`.
- **Why:** a generated sentence from `Answers` reads like a form ("Income: ₹26,000–₹30,000,
  household size: 4"). The point of the box is that it reads like a person. Keeping it on
  the persona keeps it next to the numbers it describes.
- **Rejected:** generating it from answers (reads as a form; also tempts re-rendering the
  review screen); a separate content file (drifts further from the data).
- **Assumes:** the personas change rarely.
- **Would be wrong if:** personas start changing often or there are many of them. At that
  point, generate the story. The drift test only guards age and amount asked.
- **Source:** my judgement, 2026-09-24.

### `filledIn` is separate from `derived`

- **Choice:** a new visitor-facing list, and `derived` stays as it is.
- **Why:** `derived` is written for a reviewer and explains the reasoning ("Assumed thin,
  which is the cautious reading"). The visitor needs the fact in plain words. It also lists
  engine-side assumptions `derived` does not cover (Ravi's and Anita's rent), because those
  came from the engine's defaults and not from the persona file.
- **Rejected:** rendering `derived.from` directly (reviewer language, fails the copy
  standard); showing nothing about what was filled in (hides the most honest part).
- **Would be wrong if:** the two lists drift. They are maintained by hand, side by side.

### The box disappears as soon as any answer is edited

- **Choice:** `App` wraps the `setAnswers` it passes to `Flow` so that any edit clears the
  example. `Flow` only calls `setAnswers` on commit, back and change, never just from
  viewing, so opening the review screen keeps the box.
- **Why:** once a field changes, the answers are no longer Priya's. A story that no longer
  matches the numbers under it is exactly the kind of screen-says-something-false defect
  `copy.test.ts` exists for.
- **Rejected:** keeping the box with an "edited" tag (more copy, and the story would still
  be wrong).

### Accent tint, not a verdict colour

- **Choice:** `.bio` uses `--accent-soft` and `--accent-line`.
- **Why:** it is context about the person. Green, amber or red would make it read as part
  of the answer.

## Files touched

- `engine/personas.ts`: `story` and `filledIn` fields, filled in for all four personas.
- `ui/ExampleBio.tsx`: new component.
- `ui/App.tsx`: tracks the loaded example and renders the box above both answer views.
- `ui/styles.css`: `.bio` styles.
- `tests/copy.test.ts`: examples added to the vocabulary guard.
- `tests/personas.test.ts`: story-matches-answers guard.

## Verification

- `tsc --noEmit` is clean. `vitest run`: 13 files, 327 tests, all passing.
- In the browser, loaded Anita from the start screen. The box shows above the "don't
  borrow" verdict with her story, three filled-in items, and the answers link.
- Did not test the clear-on-edit path by clicking through. It was checked by reading
  `Flow.tsx`.

## Open items

- `README.md` and `WALKTHROUGH.md` still point reviewers to `runs/*.md` for persona
  backgrounds. That is still right for reviewers, and the box covers visitors.
- The "Not given, so we filled in:" label is shared by all personas. If a persona with no
  filled-in items is ever shown, the list hides itself, which is already handled.
