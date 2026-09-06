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

/**
 * What the borrower should let their total fixed outgo reach.
 *
 * Tiered by income, in the same direction as the lender table above and for the
 * same reason: what protects a household is what is left in rupees, not the
 * ratio. Forty per cent of ₹25,000 leaves ₹15,000 for everything else, which is
 * tight. Forty per cent of ₹1,10,000 leaves ₹66,000, which is not — and holding
 * a metro renter on a good salary to the same share as someone on ₹25,000 tells
 * her she can afford almost nothing while she watches ₹40,000 a month go
 * unspent. A ceiling that produces an obviously wrong answer is not cautious,
 * it is just wrong, and a borrower will stop believing the rest of the page.
 *
 * Still tighter than any lender ceiling at every tier, and unlike theirs it
 * counts rent.
 */
export const safeOutflowCeiling = register<TieredRule<Interval>>({
  id: 'affordability.safe-outflow',
  what: 'Share of planning income that should go to rent plus all instalments',
  keyedOn: 'planning monthly income',
  source: judgement(
    'Mirrors the shape of the FOIR banding lenders use, set a few points tighter at each tier and counting rent, which they do not.',
  ),
  tiers: [
    {
      upTo: 30000,
      value: iv(0.35, 0.35),
      why: 'On a smaller income, food, power and school take most of what is left, so very little can be committed to a loan before an ordinary bad month becomes a missed payment.',
    },
    {
      upTo: 100000,
      value: iv(0.4, 0.4),
      why: 'Beyond about 40% on rent and loans together, an ordinary setback — a medical bill, a slow fortnight — has to be met by borrowing again.',
    },
    {
      upTo: Infinity,
      value: iv(0.5, 0.5),
      why: 'Above a lakh a month, half your income still leaves enough to absorb a bad month, so a higher share is genuinely survivable rather than merely permitted.',
    },
  ],
});

export const safeCeilingFor = (planningIncome: Interval): Interval =>
  tiersAcross(safeOutflowCeiling, planningIncome)
    .map((t) => t.value)
    .reduce(union);

/**
 * The ceiling tested after the stress case, scaled by how long the household
 * could survive without income.
 *
 * The stress case models an income drop lasting some months. Savings are exactly
 * the thing that decides how long a household can absorb such a drop before it
 * has to borrow again — so the post-stress outgo that is tolerable is not a
 * single number for everybody. Six months of expenses banked means a lost
 * quarter is survivable and the instalment keeps being paid. Nothing banked
 * means the first bad month becomes another loan, which is how the app-loan
 * spiral starts. The ceiling scales with the buffer because the buffer is what
 * the ceiling is protecting.
 *
 * It is expressed as extra points ON TOP of that borrower's everyday ceiling
 * rather than as a figure of its own, so it inherits the income tiering above.
 * A flat post-stress percentage had the same defect the flat everyday one did:
 * it bound hardest on the borrowers with the most room to absorb a shock.
 *
 * Two bounds, both deliberate:
 *
 *  - The savings allowance stops at twenty points, and the ceiling never passes
 *    65% of income whatever is declared. Savings are self-reported and
 *    unverifiable, and past a point more of them does not make a heavier
 *    instalment wise — it just means you could survive making a bad decision.
 *  - An unanswered savings question is read as zero months, not as unknown.
 *    "Unknown is never zero" is about not *penalising* a borrower for what they
 *    cannot prove — a credit score they have never seen. Here the zero is the
 *    protective reading, not the punitive one: assuming a cushion nobody
 *    mentioned would hand out a larger loan on the strength of a guess.
 */
export const stressedOutflowCeiling = register<TieredRule<number>>({
  id: 'affordability.stressed-outflow',
  what: 'Extra percentage points of outgo tolerated after a bad turn, by months of savings',
  keyedOn: 'months of expenses saved',
  source: judgement(
    'The 55% mid-point is the common line for where a household becomes fragile. Scaling it by savings is my own rule: the stress case models an income drop, and savings are what determine how long one can be absorbed. Capped at 60% because savings are self-reported.',
  ),
  tiers: [
    {
      upTo: 1,
      value: 0.05,
      why: 'With nothing put by there is no cushion at all, so almost no extra strain is survivable — the first bad month has to be met by borrowing again.',
    },
    {
      upTo: 3,
      value: 0.1,
      why: 'A month or two of savings absorbs a small shock but not a lost quarter.',
    },
    {
      upTo: 6,
      value: 0.15,
      why: 'Three months put by is the usual line for riding out a bad patch without new borrowing.',
    },
    {
      upTo: Infinity,
      value: 0.2,
      why: 'With half a year banked you can carry a heavier instalment through a lean spell, because you are not one setback away from missing it.',
    },
  ],
});

/**
 * The stressed ceiling for this borrower: their everyday ceiling plus whatever
 * their savings buy them. Unstated savings are read as none, and the result
 * never passes 65% of income however much is declared.
 */
export const STRESS_CEILING_CAP = 0.65;

export const stressedCeilingFor = (
  savedMonths: number | undefined,
  everyday: Interval,
): Interval => {
  const allowance = tierFor(stressedOutflowCeiling, savedMonths ?? 0).value;
  return iv(
    Math.min(everyday.lo + allowance, STRESS_CEILING_CAP),
    Math.min(everyday.hi + allowance, STRESS_CEILING_CAP),
  );
};

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
  const everydayCeiling = safeCeilingFor(planning);
  const outflowCap = mul(planning, everydayCeiling);
  const fromOutflow = log.record({
    rule: 'affordability.safe-outflow',
    label: 'Room under your safe outflow ceiling',
    inputs: {
      'income you plan on': planning,
      'ceiling': everydayCeiling,
      'rent and loans you already pay': committed,
    },
    output: atLeastZero(sub(outflowCap, committed)),
    why: `${tiersAcross(safeOutflowCeiling, planning)[0]!.why} Unlike a lender, this counts your rent.`,
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
    stressedCeilingFor(args.emergencySavingsMonths, everydayCeiling),
  );
  const stressTier = tierFor(stressedOutflowCeiling, args.emergencySavingsMonths ?? 0);
  const fromStress = log.record({
    rule: 'affordability.stress-headroom',
    label: 'Room that still holds after a bad turn',
    inputs: {
      'income after a bad turn': args.stressedPlanning,
      'months you have put by': args.emergencySavingsMonths ?? 'you did not say',
      'ceiling then': stressedCeilingFor(args.emergencySavingsMonths, everydayCeiling),
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
