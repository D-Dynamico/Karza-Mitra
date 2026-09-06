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
import { judgement, register, tierFor, tiersAcross, type Rule, type TieredRule } from './table';

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

/**
 * The ceiling tested after the stress case, and how much of it you get depends on
 * what you have put by.
 *
 * Savings are not a nicety here; they are the whole difference between a bad
 * month and a missed payment. A household with six months banked can absorb a
 * lost quarter and carry on paying. One with nothing has to borrow again the
 * first time anything goes wrong — which is how the app-loan spiral starts. So
 * the same stressed outgo that is survivable for one borrower is not for
 * another, and the ceiling moves with it.
 */
export const stressedOutflowCeiling = register<TieredRule<Interval>>({
  id: 'affordability.stressed-outflow',
  what: 'Share of income fixed outgo may reach after a bad turn, by months of savings',
  keyedOn: 'months of expenses saved',
  source: judgement(
    'The 55% mid-point is the common line for where a household becomes fragile. Moving it with savings is my own rule, and it is the honest consequence of asking the question at all.',
  ),
  tiers: [
    {
      upTo: 1,
      value: iv(0.45, 0.45),
      why: 'With nothing put by, there is no cushion at all. The first bad month has to be met by borrowing again, so the loan has to leave more room.',
    },
    {
      upTo: 3,
      value: iv(0.5, 0.5),
      why: 'A month or two of savings absorbs a small shock but not a lost quarter.',
    },
    {
      upTo: 6,
      value: iv(0.55, 0.55),
      why: 'Three months put by is the usual line for being able to ride out a bad patch without new borrowing.',
    },
    {
      upTo: Infinity,
      value: iv(0.6, 0.6),
      why: 'With half a year banked you can carry a heavier instalment through a lean spell, because you are not one setback away from missing it.',
    },
  ],
});

/** The stressed ceiling for this borrower. Unstated savings are read as none. */
export const stressedCeilingFor = (savedMonths: number | undefined): Interval =>
  tierFor(stressedOutflowCeiling, savedMonths ?? 0).value;

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
    rent: Interval;
    existingEmis: number;
    expenses: number;
    expensesAssumed: boolean;
    emergencySavingsMonths: number | undefined;
    /** Monthly reserve against an expense the borrower already knows is coming. */
    largeExpenseReserve: number;
    stressedPlanning: Interval;
  },
  log: TraceLog,
): {
  fromOutflow: Interval;
  fromSurplus: Interval;
  fromStress: Interval;
  surplus: Interval;
} {
  // Rent may itself be a range when the borrower did not state it, so the
  // committed total is an interval and the uncertainty flows onward rather than
  // being resolved into a single flattering figure.
  const committed = add(args.rent, point(args.existingEmis));

  // 1. The outflow ceiling, counting rent.
  const outflowCap = mul(planning, safeOutflowCeiling.value);
  const fromOutflow = log.record({
    rule: 'affordability.safe-outflow',
    label: 'Room under your safe outflow ceiling',
    inputs: {
      'income you plan on': planning,
      'ceiling': safeOutflowCeiling.value,
      'rent and loans you already pay': committed,
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

  const reserved = add(setAside, point(args.largeExpenseReserve));
  const fromSurplus = log.record({
    rule: 'affordability.surplus-headroom',
    label: 'Room left after keeping something back',
    inputs: {
      'money left over': surplus,
      'held back for emergencies': setAside,
      'held back for what is coming': args.largeExpenseReserve,
    },
    output: atLeastZero(sub(surplus, reserved)),
    why: needsBuffer
      ? emergencySavingsRule.why
      : 'You already have a few months put by, so nothing extra is held back here.',
  });

  // 3. The same test after a bad turn.
  const stressCap = mul(
    args.stressedPlanning,
    stressedCeilingFor(args.emergencySavingsMonths),
  );
  const stressTier = tierFor(stressedOutflowCeiling, args.emergencySavingsMonths ?? 0);
  const fromStress = log.record({
    rule: 'affordability.stress-headroom',
    label: 'Room that still holds after a bad turn',
    inputs: {
      'income after a bad turn': args.stressedPlanning,
      'months you have put by': args.emergencySavingsMonths ?? 'you did not say',
      'ceiling then': stressTier.value,
    },
    output: atLeastZero(sub(stressCap, committed)),
    why: stressTier.why,
    assumed: args.emergencySavingsMonths === undefined,
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
export const totalOutgo = (rent: Interval, existingEmis: number, newEmi: Interval): Interval =>
  add(add(rent, point(existingEmis)), newEmi);
