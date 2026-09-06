/**
 * How steady the income is.
 *
 * Two borrowers on the same salary are not the same risk. Five years at a large
 * employer is close to the safest file a bank sees; four months at a small firm
 * is not, whatever the payslip says. Lenders price this, so the borrower should
 * know it is being priced and roughly by how much.
 *
 * These rules exist so that the stability questions in the registry earn their
 * place. A question that changes nothing gets deleted, and the honest way to
 * keep one is to make the rule real, not to loosen the test.
 */

import type { Answers } from '../answers';
import { iv, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, tierFor, type Rule, type TieredRule } from './table';

export const employerDiscount = register<Rule<Record<string, Interval>>>({
  id: 'stability.employer',
  what: 'Rate adjustment for the kind of employer',
  value: {
    mnc: iv(-1, -0.5),
    'psu-govt': iv(-1.5, -0.75),
    'small-firm': iv(0, 0.75),
    other: iv(0, 0),
  },
  why: 'A government or large-company payslip is the strongest evidence of a steady income a lender can see, and several will shave the rate for it. A small employer carries the risk that the job goes before the loan does.',
  source: judgement(
    'Employer categories are a standard underwriting input. The sizes of the adjustments are mine.',
  ),
});

export const tenureAtWorkDiscount = register<TieredRule<Interval>>({
  id: 'stability.years-in-work',
  what: 'Rate adjustment for time in the job or the business',
  keyedOn: 'years in the current job or business',
  source: judgement('Reflects the probation and vintage rules most lenders apply.'),
  tiers: [
    {
      upTo: 1,
      value: iv(1, 2.5),
      why: 'Under a year, many lenders decline outright and the rest price for the chance you do not stay.',
    },
    {
      upTo: 3,
      value: iv(0, 1),
      why: 'Past the first year the file reads normally, but you are not yet getting the best of the band.',
    },
    {
      upTo: Infinity,
      value: iv(-0.75, 0),
      why: 'Several years in the same work is exactly what a lender wants to see, and it is worth asking for a better rate on the strength of it.',
    },
  ],
});

/**
 * The rate adjustment for how steady this borrower's income is. Returns zero
 * when neither question has been answered, so silence costs nothing here — it
 * simply forgoes a discount that had to be evidenced.
 */
export function stabilityAdjustment(answers: Answers, log: TraceLog): Interval {
  let total = iv(0, 0);
  let said = false;

  if (answers.employerType !== undefined) {
    const adj = employerDiscount.value[answers.employerType] ?? iv(0, 0);
    total = iv(total.lo + adj.lo, total.hi + adj.hi);
    said = true;
    log.record({
      rule: 'stability.employer',
      label: 'Who you work for',
      inputs: { employer: answers.employerType },
      output: adj,
      why: employerDiscount.why,
    });
  }

  const years = answers.yearsInJob ?? answers.yearsInBusiness;
  if (years !== undefined) {
    const tier = tierFor(tenureAtWorkDiscount, years);
    total = iv(total.lo + tier.value.lo, total.hi + tier.value.hi);
    said = true;
    log.record({
      rule: 'stability.years-in-work',
      label: 'How long you have been doing this',
      inputs: { years },
      output: tier.value,
      why: tier.why,
    });
  }

  if (!said) {
    log.record({
      rule: 'stability.not-stated',
      label: 'How steady your income is',
      inputs: { 'you have not said': true },
      output: total,
      why: 'Telling us who you work for and how long you have been there can pull your rate down by up to a point and a half, but only if you can evidence it. Left out, it neither helps nor hurts.',
      assumed: true,
    });
  }

  return total;
}

export const largeExpenseRule = register<Rule<number>>({
  id: 'affordability.large-expense',
  what: 'Months over which a known upcoming expense is set aside',
  value: 12,
  why: 'A school admission or a wedding you already know about is not a surprise, and an instalment that only works if it does not happen is not affordable. It is spread across the year rather than deducted all at once.',
  source: judgement('A year is the horizon the question asks about, so it is the horizon it is spread over.'),
});

/** Monthly amount reserved against an expense the borrower already knows is coming. */
export function largeExpenseReserve(answers: Answers, log: TraceLog): number {
  const expense = answers.largeExpenseNext12Months;
  if (expense === undefined || expense <= 0) return 0;

  const monthly = Math.round(expense / largeExpenseRule.value);
  log.record({
    rule: 'affordability.large-expense',
    label: 'Set aside for what you know is coming',
    inputs: { 'expense in the next year': expense, 'spread over': `${largeExpenseRule.value} months` },
    output: monthly,
    why: largeExpenseRule.why,
  });
  return monthly;
}

export const productiveCoverageRule = register<Rule<number>>({
  id: 'verdict.productive-coverage',
  what: 'How much of the instalment a productive loan should earn back',
  value: 1,
  why: 'If the thing you are borrowing for earns more each month than the instalment costs, the loan pays for itself and the usual caution about borrowing does not apply in the same way.',
  source: judgement('Covering the instalment is the minimum bar for calling a loan productive.'),
});

/** Whether stated earnings from the purchase cover the instalment it requires. */
export function productiveEarningsCover(
  expectedMonthlyEarnings: number | undefined,
  instalment: Interval,
  log: TraceLog,
): boolean | undefined {
  if (expectedMonthlyEarnings === undefined || instalment.hi <= 0) return undefined;

  const covers = expectedMonthlyEarnings >= instalment.hi * productiveCoverageRule.value;
  log.record({
    rule: 'verdict.productive-coverage',
    label: 'Does it pay for itself?',
    inputs: { 'you expect to earn': expectedMonthlyEarnings, 'the instalment': instalment },
    output: covers,
    why: covers
      ? 'What you expect this to earn covers the instalment, so the loan largely pays for itself. That is the strongest case there is for borrowing.'
      : 'What you expect this to earn does not cover the instalment, so the shortfall has to come out of the rest of your income every month.',
  });
  return covers;
}
