/**
 * The bad turn.
 *
 * A loan is not judged on the month it is taken. It is judged on the worst month
 * during its life, and for most households that month is coming: work slows, a
 * floating rate moves, someone falls ill. Testing for it is the difference
 * between a plan and a hope.
 */

import { iv, mul, point, scale, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, type Rule } from './table';

export const stressScenario = register<Rule<{ incomeDrop: number; rateRise: number }>>({
  id: 'stress.scenario',
  what: 'The bad turn every plan is tested against',
  value: { incomeDrop: 0.2, rateRise: 2 },
  why: 'A fifth off your income and two points on the rate is an ordinary bad year, not a disaster. If the plan only works while nothing goes wrong, it is not a plan.',
  source: judgement(
    'A 20% drop is roughly a slow quarter for a self-employed borrower or a lost increment for a salaried one; two points is well within the range floating rates have moved in recent cycles.',
  ),
});

export interface StressResult {
  /** Planning income after the drop. */
  readonly income: Interval;
  /** Fixed outgo as a share of income, after the bad turn. */
  readonly outflowRatio: Interval;
  /** True when the plan stops holding under the stress case. */
  readonly breaches: boolean;
}

/**
 * Income after the bad turn. For someone who gave us a range, the bottom of that
 * range may already be worse than a 20% cut — in which case we use theirs, since
 * they know their trade better than the rule does.
 */
export function stressedIncome(planning: Interval, log: TraceLog): Interval {
  const cut = scale(planning, 1 - stressScenario.value.incomeDrop);
  const theirWorstMonth = point(planning.lo);
  const worse = cut.lo <= theirWorstMonth.lo ? cut : theirWorstMonth;

  return log.record({
    rule: 'stress.income',
    label: 'Your income after a bad turn',
    inputs: {
      'income you plan on': planning,
      'drop tested': `${stressScenario.value.incomeDrop * 100}%`,
    },
    output: worse,
    why:
      worse === cut
        ? stressScenario.why
        : 'Your own slow month is worse than the standard test, so we have used yours.',
  });
}

/** The rate band after the rise, for floating-rate products. */
export const stressedRate = (rate: Interval): Interval =>
  iv(rate.lo + stressScenario.value.rateRise, rate.hi + stressScenario.value.rateRise);

/** Where fixed outgo lands as a share of income once the bad turn happens. */
export function stressTest(
  outgoAfterNewEmi: Interval,
  stressedPlanning: Interval,
  ceiling: Interval,
  log: TraceLog,
): StressResult {
  const ratio =
    stressedPlanning.lo <= 0
      ? iv(1, 1)
      : iv(
          outgoAfterNewEmi.lo / stressedPlanning.hi,
          outgoAfterNewEmi.hi / Math.max(stressedPlanning.lo, 1),
        );

  const breaches = ratio.hi > ceiling.hi;

  log.record({
    rule: 'stress.outflow',
    label: 'Your outgo after a bad turn',
    inputs: {
      'everything fixed you would pay': outgoAfterNewEmi,
      'income then': stressedPlanning,
      'ceiling': ceiling,
    },
    output: mul(ratio, point(100)),
    why: breaches
      ? 'After a bad turn this loan would take more of your income than is safe. That is why the answer below is smaller than what a lender would offer.'
      : 'Even after a bad turn this stays inside a manageable share of your income.',
  });

  return { income: stressedPlanning, outflowRatio: ratio, breaches };
}
