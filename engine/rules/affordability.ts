/**
 * Two rulebooks, kept apart on purpose.
 *
 * The lender's book asks one question: what share of verified income is already
 * committed to loans, and how much more will fit? It does not count rent.
 *
 * The borrower's book asks a different one: after the roof, the existing loans,
 * the shopping and a bad month, is there still money left? It counts everything.
 *
 * That single difference — rent — is most of why the two numbers diverge, and it
 * is why an app that reports only the lender's figure is quietly unhelpful.
 */

import { add, atLeastZero, iv, maxOf, mul, point, sub, union, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, tiersAcross, type Rule, type TieredRule } from './table';

/** Lender ceilings on the share of verified income that may go to instalments. */
export const lenderFoirCeiling = register<TieredRule<Interval>>({
  id: 'affordability.lender-foir',
  what: 'Share of recognised income a lender will let go to loan instalments',
  keyedOn: 'recognised monthly income',
  source: judgement(
    'Standard FOIR banding. Individual lenders differ by a few points and stretch for salaried borrowers at large employers.',
  ),
  tiers: [
    {
      upTo: 30000,
      value: iv(0.4, 0.4),
      why: 'On a smaller income the fixed costs of living take a bigger share, so lenders leave more room.',
    },
    {
      upTo: 100000,
      value: iv(0.5, 0.5),
      why: 'The standard band most retail lending is written in.',
    },
    {
      upTo: Infinity,
      value: iv(0.55, 0.6),
      why: 'Above a lakh a month there is more slack after essentials, and lenders will stretch further.',
    },
  ],
});

/** What the borrower should let their total fixed outgo reach. */
export const safeOutflowCeiling = register<Rule<Interval>>({
  id: 'affordability.safe-outflow',
  what: 'Share of planning income that should go to rent plus all instalments',
  value: iv(0.4, 0.4),
  why: 'Beyond about 40% on rent and loans together, an ordinary bad month — a medical bill, a slow fortnight — has to be met by borrowing again.',
  source: judgement(
    'Deliberately tighter than any lender ceiling, and it counts rent, which lenders do not.',
  ),
});

/** The same ceiling, tested after the stress case in stress.ts. */
export const stressedOutflowCeiling = register<Rule<Interval>>({
  id: 'affordability.stressed-outflow',
  what: 'Share of income that fixed outgo may reach after a bad turn',
  value: iv(0.55, 0.55),
  why: 'A loan has to survive a lean patch, not just today. Crossing this after a 20% income drop means the plan only works while nothing goes wrong.',
  source: judgement('Chosen as the point where a household is one setback from missing a payment.'),
});

export const emergencySavingsRule = register<Rule<{ months: number; setAside: Interval }>>({
  id: 'affordability.emergency-savings',
  what: 'Monthly saving reserved when the household has little put by',
  value: { months: 3, setAside: iv(0.1, 0.1) },
  why: 'With less than three months of expenses saved, the next emergency becomes another loan. A tenth of income is held back so the instalment does not consume the whole surplus.',
  source: judgement('Three months is the common rule of thumb for an emergency fund.'),
});

export interface AffordabilityResult {
  /** The most a lender will allow towards a new instalment. */
  readonly lenderMaxEmi: Interval;
  /** The most the borrower can carry without the plan getting fragile. */
  readonly safeEmi: Interval;
  /** Which of the borrower-side constraints actually bound the answer. */
  readonly binding: 'outflow ceiling' | 'money left over' | 'a bad month';
  /** Money left each month once everything, including the new instalment, is paid. */
  readonly surplusBeforeNewEmi: Interval;
}

/**
 * The lender's side. Obligations are existing instalments plus the proposed one;
 * rent does not appear, which is exactly the omission that makes their number
 * larger than the safe one.
 */
export function lenderCeiling(
  recognised: Interval,
  existingEmis: number,
  log: TraceLog,
): Interval {
  const tiers = tiersAcross(lenderFoirCeiling, recognised);
  const ceiling = tiers.map((t) => t.value).reduce(union);
  const straddles = tiers.length > 1;

  const allowedTotal = log.record({
    rule: 'affordability.lender-foir',
    label: 'What a lender will allow towards instalments',
    inputs: { 'income they recognise': recognised, 'their ceiling': ceiling },
    output: mul(recognised, ceiling),
    why: straddles
      ? 'Your income sits across two of the bands lenders use, so the ceiling covers both. Lenders count loan instalments against income and ignore rent entirely.'
      : `${tiers[0]!.why} Note that this counts loan instalments only — lenders do not count your rent.`,
  });

  return log.record({
    rule: 'affordability.lender-headroom',
    label: 'Room left for a new instalment',
    inputs: { 'they allow in total': allowedTotal, 'you already pay': existingEmis },
    output: atLeastZero(sub(allowedTotal, point(existingEmis))),
    why: 'What is left of the lender ceiling once the loans you already have are taken off.',
  });
}

/**
 * The borrower's side. Three constraints, and the tightest one wins: the outflow
 * ceiling, what is genuinely left over after living costs, and whether the plan
 * still holds after a bad turn.
 */
export function borrowerCeiling(
  planning: Interval,
  args: {
    rent: number;
    existingEmis: number;
    expenses: number;
    expensesAssumed: boolean;
    emergencySavingsMonths: number | undefined;
    stressedPlanning: Interval;
  },
  log: TraceLog,
): {
  fromOutflow: Interval;
  fromSurplus: Interval;
  fromStress: Interval;
  surplus: Interval;
} {
  const committed = point(args.rent + args.existingEmis);

  // 1. The outflow ceiling, counting rent.
  const outflowCap = mul(planning, safeOutflowCeiling.value);
  const fromOutflow = log.record({
    rule: 'affordability.safe-outflow',
    label: 'Room under your safe outflow ceiling',
    inputs: {
      'income you plan on': planning,
      'ceiling': safeOutflowCeiling.value,
      'rent and loans you already pay': args.rent + args.existingEmis,
    },
    output: atLeastZero(sub(outflowCap, committed)),
    why: `${safeOutflowCeiling.why} Unlike a lender, this counts your rent.`,
  });

  // 2. What is actually left after living costs, and after putting something by.
  const savingsMonths = args.emergencySavingsMonths;
  const needsBuffer = savingsMonths === undefined || savingsMonths < emergencySavingsRule.value.months;
  const setAside = needsBuffer
    ? mul(planning, emergencySavingsRule.value.setAside)
    : point(0);

  const surplus = log.record({
    rule: 'affordability.surplus',
    label: 'Money left each month before any new instalment',
    inputs: {
      'income you plan on': planning,
      'rent': args.rent,
      'loans you already pay': args.existingEmis,
      'household expenses': args.expenses,
    },
    output: sub(sub(planning, committed), point(args.expenses)),
    why: 'Everything you earn in a slow month, less the roof, the loans you already have and what the household spends. This is the number every other number here rests on.',
    assumed: args.expensesAssumed,
  });

  const fromSurplus = log.record({
    rule: 'affordability.surplus-headroom',
    label: 'Room left after keeping something back for emergencies',
    inputs: { 'money left over': surplus, 'held back for emergencies': setAside },
    output: atLeastZero(sub(surplus, setAside)),
    why: needsBuffer
      ? emergencySavingsRule.why
      : 'You already have a few months put by, so nothing extra is held back here.',
  });

  // 3. The same test after a bad turn.
  const stressCap = mul(args.stressedPlanning, stressedOutflowCeiling.value);
  const fromStress = log.record({
    rule: 'affordability.stress-headroom',
    label: 'Room that still holds after a bad turn',
    inputs: { 'income after a bad turn': args.stressedPlanning, 'ceiling then': stressedOutflowCeiling.value },
    output: atLeastZero(sub(stressCap, committed)),
    why: stressedOutflowCeiling.why,
  });

  // The three caps are deliberately returned separately rather than combined
  // here. The first two limit an instalment at today's rate; the third limits an
  // instalment at the risen rate, and turning them into amounts at the same rate
  // would let a loan pass the stress test on paper and fail it in practice.
  return { fromOutflow, fromSurplus, fromStress, surplus };
}

/** Which constraint actually bound, once the caps are amounts rather than instalments. */
export function bindingConstraint(amounts: {
  fromOutflow: Interval;
  fromSurplus: Interval;
  fromStress: Interval;
}): AffordabilityResult['binding'] {
  const { fromOutflow, fromSurplus, fromStress } = amounts;
  if (fromSurplus.hi <= fromOutflow.hi && fromSurplus.hi <= fromStress.hi) return 'money left over';
  if (fromStress.hi <= fromOutflow.hi) return 'a bad month';
  return 'outflow ceiling';
}

/** Fixed outgo as a share of income — the ratio both sides talk in. */
export const outflowRatio = (outgo: Interval, income: Interval): Interval =>
  income.lo <= 0
    ? iv(1, 1)
    : maxOf(point(0), iv(outgo.lo / income.hi, outgo.hi / Math.max(income.lo, 1)));

/** Total fixed outgo once a new instalment is added. */
export const totalOutgo = (rent: number, existingEmis: number, newEmi: Interval): Interval =>
  add(point(rent + existingEmis), newEmi);
