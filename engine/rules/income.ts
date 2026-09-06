/**
 * Income recognition.
 *
 * Two numbers come out of here and they are deliberately different:
 *
 *   recognised — what a lender will put on the sanction letter. Paper only.
 *   planning   — what the borrower should actually budget against. Bad months only.
 *
 * The gap between them is not an error to be reconciled. For a shopkeeper with
 * thin books it is the entire story: lenders see less than he earns, which is
 * why pledging an asset is his lever rather than arguing about his income.
 */

import type { Answers } from '../answers';
import { add, iv, mul, point, scale, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, type Rule } from './table';

export interface IncomeAssessment {
  /** What a lender will count. */
  readonly recognised: Interval;
  /** What the borrower should plan against. */
  readonly planning: Interval;
  /** How much of their real income they cannot prove. */
  readonly unprovable: Interval;
}

interface Recognition {
  /** Applied to stated income to get what a lender will count. */
  readonly lenderFactor: Interval;
  /** Applied to the worst month to get what the borrower should plan on. */
  readonly planningFactor: Interval;
  /** True when the borrower should budget on their bad month, not their average. */
  readonly planOnWorstMonth: boolean;
  readonly why: string;
}

export const incomeRecognition = register<Rule<Record<string, Recognition>>>({
  id: 'income.recognition',
  what: 'How much of stated income each side counts',
  why: 'A lender lends against what it can verify; a borrower has to survive their worst month. Neither number is wrong, and they are rarely the same.',
  source: judgement(
    'Haircuts reflect common underwriting practice rather than any one lender\'s policy. Directionally standard; the exact factors are mine.',
  ),
  value: {
    salaried: {
      lenderFactor: iv(1, 1),
      planningFactor: iv(1, 1),
      planOnWorstMonth: false,
      why: 'A salary slip and a bank credit are all the proof anyone needs, and the amount is the same every month.',
    },
    'self-employed-itr': {
      lenderFactor: iv(1, 1),
      planningFactor: iv(1, 1),
      planOnWorstMonth: true,
      why: 'Lenders work from the filed return, which is usually below what the business actually brings in. You should still budget on a slow month.',
    },
    'self-employed-cash': {
      lenderFactor: iv(0.5, 0.7),
      planningFactor: iv(0.95, 0.95),
      planOnWorstMonth: true,
      why: 'With no filed return there is nothing to verify, so lenders discount hard and many decline unsecured lending outright.',
    },
    informal: {
      lenderFactor: iv(0.6, 0.8),
      planningFactor: iv(0.9, 0.9),
      planOnWorstMonth: true,
      why: 'Gig and daily-wage earnings swing month to month and cannot be evidenced, so both sides have to allow for a bad stretch.',
    },
  },
});

/**
 * Used when the borrower has not said how they earn. Spans every recognition
 * factor above, so the answer is wide rather than wrong — and narrows the moment
 * they tell us.
 */
export const unknownIncomeTypeFactor = register<Rule<Interval>>({
  id: 'income.unknown-type',
  what: 'Recognition factor when the income type is not stated',
  value: iv(0.5, 1),
  why: 'Until you say how you earn, the answer has to cover everyone from a salaried employee to a daily-wage earner.',
  source: judgement('Spans the range of the recognition factors above.'),
});

export const coApplicantRule = register<Rule<Interval>>({
  id: 'income.co-applicant',
  what: 'Share of a co-applicant\'s income counted by a lender',
  value: iv(0.5, 1),
  why: 'How much of a co-applicant a lender counts depends on the relationship and how stable their job is, so the honest answer is a range.',
  source: judgement('Common practice; banks vary between half and all of a spouse\'s income.'),
});

export const productiveEarningsShare = register<Rule<Interval>>({
  id: 'income.productive-earnings',
  what: 'Share of expected earnings from the purchase counted in the borrower budget',
  value: iv(0.5, 0.5),
  why: 'If the loan buys something that earns — a delivery vehicle, stock for the shop — that income is real and should count. But it has not happened yet, projections disappoint, and it takes time to build up, so only half of it is counted. No lender will count any of it.',
  source: judgement(
    'Halving a projection is my own line. The principle that a lender counts none of it is standard: they underwrite what you earn now.',
  ),
});

/**
 * Assess income. Returns undefined when the borrower has told us nothing about
 * what they earn — the engine says so rather than inventing a figure, because
 * every downstream number would be fiction.
 */
export function assessIncome(answers: Answers, log: TraceLog): IncomeAssessment | undefined {
  const stated = answers.monthlyIncome;
  if (!stated) return undefined;

  const type = answers.incomeType;
  const rule = type ? incomeRecognition.value[type] : undefined;

  // What the lender counts.
  let recognised: Interval;
  if (type === 'self-employed-itr' && answers.itrIncomeMonthly !== undefined) {
    recognised = log.record({
      rule: 'income.recognised',
      label: 'Income a lender will count',
      inputs: { 'filed return, per month': answers.itrIncomeMonthly },
      output: point(answers.itrIncomeMonthly),
      why: 'Lenders underwrite a self-employed borrower from the filed return, not from what the business actually takes.',
    });
  } else if (rule) {
    recognised = log.record({
      rule: 'income.recognised',
      label: 'Income a lender will count',
      inputs: { 'what you told us': stated, 'how you earn': type },
      output: mul(stated, rule.lenderFactor),
      why: rule.why,
    });
  } else {
    recognised = log.record({
      rule: 'income.recognised',
      label: 'Income a lender will count',
      inputs: { 'what you told us': stated },
      output: mul(stated, unknownIncomeTypeFactor.value),
      why: unknownIncomeTypeFactor.why,
      assumed: true,
    });
  }

  // What the borrower should plan on. Variable earners budget on a bad month,
  // which is the bottom of the range they gave us, not its middle.
  const basis = rule?.planOnWorstMonth === true ? point(stated.lo) : stated;
  const planningFactor = rule?.planningFactor ?? iv(0.9, 1);
  let planning = log.record({
    rule: 'income.planning',
    label: 'Income you should budget against',
    inputs: { 'what you told us': stated, 'basis': rule?.planOnWorstMonth === true ? 'your slow month' : 'your monthly income' },
    output: mul(basis, planningFactor),
    why:
      rule?.planOnWorstMonth === true
        ? 'Your income moves, so the safe plan is built on a slow month rather than a good one. A loan does not get smaller when the month is bad.'
        : 'Your pay is the same every month, so what you earn is what you can plan against.',
    assumed: rule === undefined,
  });

  // A co-applicant helps the lender's number straight away, and the borrower's
  // number only if that income is genuinely shared.
  if (answers.coApplicantIncome !== undefined && answers.coApplicantIncome > 0) {
    const counted = scale(coApplicantRule.value, answers.coApplicantIncome);
    recognised = log.record({
      rule: 'income.recognised.co-applicant',
      label: 'Adding your co-applicant',
      inputs: { 'their income': answers.coApplicantIncome, 'share counted': coApplicantRule.value },
      output: add(recognised, counted),
      why: coApplicantRule.why,
    });

    if (answers.coApplicantPooled === true) {
      planning = log.record({
        rule: 'income.planning.co-applicant',
        label: 'Counting your co-applicant in your budget',
        inputs: { 'their income': answers.coApplicantIncome },
        output: add(planning, point(answers.coApplicantIncome)),
        why: 'You said this income is genuinely pooled, so it is available to meet the instalment.',
      });
    } else {
      log.record({
        rule: 'income.planning.co-applicant-excluded',
        label: 'Co-applicant income left out of your budget',
        inputs: { 'their income': answers.coApplicantIncome },
        output: planning,
        why: 'A lender will count their income, but we have left it out of what you can safely carry because you have not said it is pooled. That is deliberately the cautious reading.',
      });
    }
  }

  // Earnings the purchase itself would generate. This is the borrower's side of
  // the productive-loan test: a scooter that doubles delivery runs is a
  // different proposition from a scooter that only costs money. It never touches
  // the lender's number — no bank underwrites income that does not exist yet.
  if ((answers.expectedMonthlyEarnings ?? 0) > 0) {
    planning = log.record({
      rule: 'income.productive-earnings',
      label: 'What the loan itself would earn you',
      inputs: {
        'you expect to earn': answers.expectedMonthlyEarnings,
        'counted': productiveEarningsShare.value,
      },
      output: add(planning, scale(productiveEarningsShare.value, answers.expectedMonthlyEarnings!)),
      why: productiveEarningsShare.why,
      assumed: true,
    });
  }

  const unprovable = log.record({
    rule: 'income.unprovable',
    label: 'Income you earn but cannot prove',
    inputs: { 'you plan on': planning, 'a lender counts': recognised },
    output: iv(
      Math.max(0, planning.lo - recognised.hi),
      Math.max(0, planning.hi - recognised.lo),
    ),
    why: 'The part of your income that no lender will see. It does not raise what you can borrow unsecured, but it is why pledging an asset can be worth it.',
  });

  return { recognised, planning, unprovable };
}
