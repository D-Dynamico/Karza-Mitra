/**
 * Assumptions that decide the answer.
 *
 * Every default in this engine is an interval, and most of them only make the
 * range a little wider. Some do more than that: pinned to one end of the
 * assumed range the verdict is "borrow", pinned to the other it is "borrow
 * less". When that happens the answer does not really rest on the arithmetic,
 * it rests on a guess — and the borrower is the only person who can settle it.
 *
 * Silently picking an end would be the worst of the three options. Picking the
 * favourable end flatters; picking the cautious end can talk somebody out of a
 * loan they could comfortably carry. Asking one question does neither.
 *
 * So: for each assumption that names the answer which would settle it, re-run
 * the whole engine with that answer pinned low and pinned high. If the verdict
 * differs, the assumption is pivotal, and the screen should raise it above
 * everything else it might ask.
 *
 * This generalises past rent. Any rule that fills a numeric gap and tags the
 * field it would fill gets the same treatment for free.
 */

import type { Answers } from './answers';
import { compute, type Result } from './compute';
import type { Interval } from './interval';
import type { VerdictKind } from './rules/verdict';

export interface Pivotal {
  /** The answer that would settle it. */
  readonly field: keyof Answers;
  /** The assumption in the borrower's words, as already shown on screen. */
  readonly assumption: string;
  /** The range that was assumed. */
  readonly range: Interval;
  /** What the answer becomes at each end of that range. */
  readonly atLow: { readonly value: number; readonly verdict: VerdictKind; readonly safe: Interval };
  readonly atHigh: { readonly value: number; readonly verdict: VerdictKind; readonly safe: Interval };
  /** True when the two ends disagree about what to do. */
  readonly flipsVerdict: boolean;
  /** True when the two ends disagree about which product to ask for. */
  readonly flipsProduct: boolean;
}

const isInterval = (v: unknown): v is Interval =>
  typeof v === 'object' && v !== null && 'lo' in v && 'hi' in v;

const at = (answers: Answers, field: keyof Answers, value: number): Result =>
  compute({ ...answers, [field]: value });

/**
 * Every assumption whose range was tested, pivotal or not. Callers filter;
 * returning all of them lets the run-throughs print a sensitivity table for the
 * ones that turn out not to matter, which is itself worth saying.
 */
export function testedAssumptions(answers: Answers): Pivotal[] {
  const base = compute(answers);
  const out: Pivotal[] = [];
  const seen = new Set<string>();

  for (const entry of base.trace) {
    if (entry.assumption === undefined || entry.field === undefined) continue;
    if (!isInterval(entry.output)) continue;
    if (entry.output.lo === entry.output.hi) continue;
    if (seen.has(entry.field)) continue;
    seen.add(entry.field);

    const low = at(answers, entry.field, entry.output.lo);
    const high = at(answers, entry.field, entry.output.hi);

    out.push({
      field: entry.field,
      assumption: entry.assumption,
      range: entry.output,
      atLow: { value: entry.output.lo, verdict: low.verdict.kind, safe: low.amounts.safe },
      atHigh: { value: entry.output.hi, verdict: high.verdict.kind, safe: high.amounts.safe },
      flipsVerdict: low.verdict.kind !== high.verdict.kind,
      flipsProduct: low.routing?.product.id !== high.routing?.product.id,
    });
  }

  return out;
}

/** Only the ones that change the answer, worst first. */
export const pivotalAssumptions = (answers: Answers): Pivotal[] =>
  testedAssumptions(answers)
    .filter((p) => p.flipsVerdict || p.flipsProduct)
    .sort((a, b) => Number(b.flipsProduct) - Number(a.flipsProduct));
