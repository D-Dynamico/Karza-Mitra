# 2026-09-08 — How unknowns work, and assumptions that decide the answer

## Scope

Closing the two unresolved items carried since phase 3, and one feature that fell out of
resolving them.

1. Delete `gstRegistered`, which nothing read.
2. Fix the `rent.owns-premises` inconsistency — the one branch where not knowing something made
   a borrower's answer better.
3. Detect assumptions whose two ends disagree about the verdict, and ask about those first.
4. Put a sensitivity table in the generated run-throughs.
5. State the principle once in RULES.md, so the two rules that were pulling against each other
   stop needing to be reconciled case by case.

The direction for 2 to 5 came from the user, in detail. It is a better fix than the one being
weighed, and the reasoning is theirs; recorded here so it is not lost.

## Changes

- `gstRegistered` deleted from `answers.ts` and `personas.ts`.
- `rent.owns-premises` now returns `[0, midpoint of the city band]` rather than a flat zero.
- New `engine/pivotal.ts` — `testedAssumptions` and `pivotalAssumptions`.
- `TraceEntry` gained an optional `field`, naming the answer that would settle an assumption.
- Results screen leads with a "Confirm this one thing" block when an assumption is pivotal.
- Generated run-throughs carry a sensitivity table under "where we guessed".
- RULES.md gained a "How a missing answer is treated" section.
- 278 tests, up from 267. Two Ravi golden tests moved.

## Decisions

### `gstRegistered` is deleted, not wired

- **Choice:** remove the field.
- **Why:** it was declared in the answer schema and set to `true` on Ravi, and **no rule, no
  question and no screen read it anywhere**. It implied the engine weighs GST registration when
  assessing a self-employed borrower. It does not, and a field that promises something the code
  never delivers is a small dishonesty in a codebase whose whole argument is that it can be
  checked.
- **Rejected:** wiring it. Registration is real evidence of turnover and there is a good rule to
  be written about it — recognising more of a self-employed borrower's stated income when it is
  corroborated. That is genuine domain work, not something to invent on the last day.
- **Would be wrong if:** a later version models evidenced turnover, at which point this comes
  back deliberately rather than as a leftover.
- Two other fields flagged alongside it turned out to be fine and were left: `vehicleIsProductive`
  is read by `products.isProductive` and gates a question; `appLoanOutstanding` is read by the
  path-to-yes option that clears app loans. Only `gstRegistered` was actually dead. Earlier
  session notes listing all three were wrong about two of them.

### Owning property widens the rent guess instead of asserting zero

- **Choice:** `rent.owns-premises` returns `[0, midpoint of the borrower's city rent band]` —
  for a tier-2 borrower, `[0, ₹7,000]` — flagged assumed, with `field: 'rentOrHomeEmi'`.
- **Why:** it was a flat zero. That made it the one place in the engine where not knowing
  something improved a borrower's answer, which is exactly the flattery the product exists to
  correct. Anita's unknown rent widened her answer downward; Ravi's improved his.
- **Rejected — and this is the important part:** giving Ravi the same city band as everybody
  else (₹4,000–10,000). It would have restored consistency by throwing away the one thing we
  actually know about him, which is that zero is the likeliest value. A shopkeeper who owns his
  premises very often lives above or beside them. Discarding real domain knowledge to satisfy a
  rule is its own kind of dishonesty.
- **Why the top end is the midpoint of the city band:** if the guess is wrong, it is wrong by
  about what renting costs there. Deriving it from `assumedRentByCity` rather than inventing a
  number means it moves when that table moves.
- **What it does to Ravi:** safe carry goes from ₹13–14 lakh to **₹8.8–14.4 lakh**, and
  `stressBreaches` becomes true, because at the top of the range a bad month does break his
  plan. Both golden tests updated deliberately.
- **Would be wrong if:** the midpoint is too generous for a borrower who owns a shop in an
  expensive metro but lives cheaply. The interval is meant to be corrected by an answer, not to
  be right on its own.

### An assumption that changes the verdict is asked first

This is the feature that fell out of the fix, and it generalises well beyond rent.

- **Choice:** `engine/pivotal.ts` re-runs the whole engine with an assumed field pinned to each
  end of its range. If the verdict differs, the assumption is *pivotal*, and the results screen
  leads with "Confirm this one thing: what do you pay for rent?" above every "tighten this".
- **Why:** at that point the answer is not resting on the arithmetic, it is resting on a guess,
  and only the borrower can settle it. All three alternatives are worse: picking the favourable
  end flatters, picking the cautious end can talk somebody out of a loan they could comfortably
  carry, and showing both without ranking buries it among everything else the page wants.
- **Why it generalises:** any rule that fills a numeric gap and tags the field it would fill
  gets this for free. Rent is the only pivotal case among the three borrowers today; household
  spending is tested and is not pivotal, and saying so is also useful.
- **Cost:** two extra `compute` calls per assumption. The engine is pure and fast, and this runs
  on a results screen, not per keystroke.
- **Assumes:** the field is numeric and the assumption's output is an interval. Point assumptions
  are skipped, correctly — Priya's household-spending default has no range to straddle, so she
  is flagged for nothing.
- **Would be wrong if:** a verdict flip is caused by something other than the assumption under
  test. It cannot be here, since only that one field changes between the two runs.

### The run-throughs carry the sensitivity table

- **Choice:** under "where we guessed", each tested assumption prints the verdict, safe amount
  and product at both ends of its range, with a line saying whether it decides the answer.
- **Why:** nobody can answer a question for a fixture borrower. Showing what the answer would
  have been either way is the strongest available evidence for the honesty row, and it costs
  nothing — the engine computes it anyway to rank the question.
- **It also records that routing is unaffected at every rent level.** Ravi is the brief's test
  of product routing, so stating that the thing being tested does not move — he is on a loan
  against property whether he pays nothing or ₹15,000 — is worth as much as the numbers that do.

### One sentence for how unknowns work

- **Choice:** a "How a missing answer is treated" section near the top of RULES.md.

  > An unknown is an interval. Its full width shows in the range, its conservative end decides
  > the verdict, and where the interval sits says what we think is likeliest.

- **Why:** two rules were being quoted against each other during the build — "unknowns never
  resolve in the borrower's favour" and "an unknown is never a penalty" — and as stated they
  genuinely conflict. They are one rule about different parts of the same interval, and once
  written that way both Ravi and Anita fall out of it with no special case.
- **One wording change from the version the user proposed.** Their third clause was "its
  likeliest value is where the interval is centred". That holds for Anita, whose band is centred
  on what a modest home costs, but not for Ravi, whose interval is deliberately *skewed* — zero
  at the end, not the middle. Written as "where the interval sits", it covers both. Flagged
  rather than quietly changed, since the sentence is the point of the section.

## Files touched

- `engine/answers.ts`, `engine/personas.ts` — `gstRegistered` gone.
- `engine/rules/rent.ts` — the interval, and the `field` tag.
- `engine/rules/expenses.ts` — `field` tag.
- `engine/trace.ts` — optional `field` on `TraceEntry`.
- `engine/pivotal.ts` — new.
- `ui/Results.tsx`, `ui/styles.css` — the "confirm this one thing" block.
- `scripts/gen-runs.ts` — sensitivity table.
- `scripts/gen-rules-md.ts` — the principle section.
- `tests/pivotal.test.ts` — new, 10 tests. `tests/personas.test.ts` — two Ravi tests updated,
  one added.

## Verification

- `npx tsc --noEmit` clean, `npm run build` succeeds, **278 tests passing**.
- `npm run gen` twice produces no diff — checked by snapshotting the output and re-running,
  not by diffing against the last commit, which proves nothing.
- Pivotal detection read by hand for all three: Ravi's rent flips borrow → borrow-less; Anita's
  rent is tested and does not flip (she is `dont` at both ends); Priya has no interval
  assumption and is flagged for nothing.
- Ravi re-run: safe ₹8.8–14.4 lakh, still routed to loan against property, `stressBreaches`
  true at the pessimistic end and false when rent is answered as zero.

### Not verified

- None of today's UI — the "confirm this one thing" block has not been seen in a browser.
- The 375px walk is still outstanding from phase 5.

## Open items

- Phase 5's exit condition (375px, no horizontal scroll) — still the last formal gate.
- `AffordabilityResult` and `StressResult.rate` remain dead since phase 1.
- The gold loan rate band is still the only `judgement` product source.
- **The box closes today (8 Sep).** Everything scored is built; what is left is checking, not
  building.
