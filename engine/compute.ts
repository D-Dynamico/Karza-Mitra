/**
 * The engine's one public function.
 *
 * Answers in, four outputs plus the reasoning out. Pure: no clock, no
 * randomness, no I/O — so a persona is reproducible, a golden test means
 * something, and the "path to yes" toggles in the UI are nothing more exotic
 * than calling this again with one answer changed.
 */

import type { Answers } from './answers';
import {
  add,
  atLeastZero,
  iv,
  minOf,
  mul,
  point,
  scale,
  sub,
  width,
  type Interval,
} from './interval';
import {
  aprRange,
  emiRangeCorrelated,
  principalFromEmiRange,
  totalInterest,
} from './finance';
import {
  bindingConstraint,
  borrowerCeiling,
  lenderCeiling,
  outflowRatio,
  stressedOutflowCeiling,
  totalOutgo,
} from './rules/affordability';
import {
  assessCredit,
  lenderSpread,
  predatoryRateFloor,
  type CreditAssessment,
} from './rules/credit';
import { assessIncome, type IncomeAssessment } from './rules/income';
import {
  isProductive,
  notionalPricingAmount,
  route,
  tenurePolicy,
  type Routing,
} from './rules/products';
import { stressedIncome, stressedRate, stressTest } from './rules/stress';
import { decide, type Verdict } from './rules/verdict';
import { TraceLog, type TraceEntry } from './trace';
import { confidenceThresholds } from './rules/table';
import { assumedExpenses } from './rules/expenses';
import { assumedRent } from './rules/rent';

export type Confidence = 'low' | 'medium' | 'high';

export interface Result {
  readonly verdict: Verdict;
  /** O1: what a lender will likely sanction, and what is actually safe. */
  readonly amounts: {
    /** What a lender will likely sanction. Shown even on a "don't" — the fact
     *  that someone will still lend is part of what the borrower is up against. */
    readonly lender: Interval;
    /** What the borrower should act on. Zero when the verdict is "don't". */
    readonly safe: Interval;
    /** What affordability alone allows, before the verdict is applied. Kept so
     *  the path-to-yes toggles have a number to move, and so the working stays
     *  readable on a "don't". */
    readonly safeOnAffordabilityAlone: Interval;
    readonly asked: number | undefined;
  };
  /** O2: the product this borrower should be asking for. */
  readonly routing: Routing | undefined;
  /** O3: the rate band and the honest all-in rate. */
  readonly pricing:
    | {
        readonly rateBand: Interval;
        readonly feeBand: Interval;
        readonly aprBand: Interval;
        readonly tenureMonths: number;
      }
    | undefined;
  /** O4: what it costs each month, and what the bad turn does to that. */
  readonly repayment:
    | {
        /** The instalment the affordability ceiling allows. */
        readonly emiCeiling: Interval;
        readonly totalInterest: Interval;
        readonly outflowRatioNow: Interval;
        readonly outflowRatioStressed: Interval;
        readonly stressBreaches: boolean;
      }
    | undefined;
  readonly income: IncomeAssessment | undefined;
  readonly credit: CreditAssessment;
  readonly surplus: Interval;
  readonly confidence: Confidence;
  readonly trace: readonly TraceEntry[];
  /** Answers that were filled in for the borrower rather than given by them. */
  readonly assumptions: readonly string[];
}

/** Tenure used for the headline figures, before the borrower moves the slider. */
function headlineTenure(routing: Routing, answers: Answers): number {
  const band = routing.product.tenureMonths;
  const policy = tenurePolicy.value;
  const monthsToRetirement =
    answers.age !== undefined
      ? Math.max(12, (policy.retirementAge - answers.age) * 12)
      : band.hi;
  const preferred = routing.product.secured
    ? Math.min(band.hi, policy.securedPreferredMonths)
    : policy.unsecuredPreferredMonths;
  return Math.max(band.lo, Math.min(preferred, monthsToRetirement));
}

/**
 * Confidence is a statement about how wide the answer is, not how many questions
 * were asked. Answering ten questions that change nothing should not make anyone
 * feel more certain.
 */
function confidenceFrom(safe: Interval, rateBand: Interval | undefined): Confidence {
  const t = confidenceThresholds.value;
  // No rate band at all means we could not price the loan, which is the least
  // certain state there is.
  const rateWidth = rateBand ? width(rateBand) : Infinity;
  const relativeAmountWidth = safe.hi > 0 ? width(safe) / safe.hi : 1;
  if (rateWidth <= t.highRatePoints && relativeAmountWidth <= t.highAmountShare) return 'high';
  if (rateWidth <= t.mediumRatePoints && relativeAmountWidth <= t.mediumAmountShare) {
    return 'medium';
  }
  return 'low';
}

export function compute(answers: Answers): Result {
  const log = new TraceLog();

  const credit = assessCredit(answers, log);
  const income = assessIncome(answers, log);
  const existingEmis = answers.existingEmis ?? 0;
  // Never a bare `?? 0`. An unanswered rent becomes a conservative range that
  // widens the answer, not a zero that quietly improves it.
  const rentEstimate = assumedRent(answers, log);
  const rent = rentEstimate.value;

  // Household expenses are the one answer we will fill in for the borrower,
  // because leaving it blank silently overstates what they can afford. It is
  // marked as assumed everywhere it appears.
  const expenses = assumedExpenses(answers, log);

  if (!income) {
    const verdict = decide(
      {
        answers,
        safeAmount: point(0),
        lenderAmount: point(0),
        surplus: point(0),
        planning: point(0),
        existingEmis,
        recentBounce: credit.recentBounce,
        unsecuredLikelyDeclined: credit.unsecuredLikelyDeclined,
        securedAvailable: false,
        productive: isProductive(answers),
        informalIncome: false,
        hasAppLoans: answers.appOrBnplLoans === true,
        stressBreaches: false,
      },
      log,
    );
    return {
      verdict,
      amounts: {
        lender: point(0),
        safe: point(0),
        safeOnAffordabilityAlone: point(0),
        asked: answers.amountAsked,
      },
      routing: undefined,
      pricing: undefined,
      repayment: undefined,
      income: undefined,
      credit,
      surplus: point(0),
      confidence: 'low',
      trace: log.all(),
      assumptions: collectAssumptions(log.all()),
    };
  }

  // Affordability, both rulebooks.
  const stressed = stressedIncome(income.planning, log);
  const lenderEmiHeadroom = lenderCeiling(income.recognised, existingEmis, log);
  const borrower = borrowerCeiling(income.planning, {
    rent,
    existingEmis,
    expenses: expenses.value,
    expensesAssumed: expenses.assumed,
    emergencySavingsMonths: answers.emergencySavingsMonths,
    stressedPlanning: stressed,
  }, log);

  // Product, then price, then amount — in that order, because the product sets
  // the rate band and the rate band sets what an instalment will support.
  const routing = route(answers, credit, log);
  const tenure = headlineTenure(routing, answers);

  // Credit standing places the borrower *within* the product's band rather than
  // merely raising its floor. A clean file at the top of the range should see a
  // narrow band near the bottom, not the whole product range — quoting someone
  // with a 780 score "10.5% to 24%" is useless to them.
  const base = routing.product.rateBand;
  const rateBand = log.record({
    rule: 'pricing.rate-band',
    label: 'The rate band you should expect',
    inputs: {
      'base band for this product': base,
      'added for your credit standing': credit.ratePremium,
      'spread between lenders': lenderSpread.value,
    },
    output: iv(
      Math.min(base.lo + credit.ratePremium.lo, base.hi),
      Math.min(base.lo + credit.ratePremium.hi + lenderSpread.value, base.hi),
    ),
    why: `${routing.product.why} Your credit standing places you within that band, and lenders differ by a point or so on top of that.`,
  });

  const feeBand = routing.product.feeBand;

  // What each side's instalment ceiling will actually buy. The first two caps
  // limit an instalment at today's rate; the stress cap limits the instalment
  // the borrower would face *after* rates rise, so it is converted at the risen
  // rate. Using today's rate for all three would let a loan pass the stress test
  // on paper and breach it the moment the rate moved.
  let lenderAmount = principalFromEmiRange(lenderEmiHeadroom, rateBand, tenure);

  const amountFromOutflow = principalFromEmiRange(borrower.fromOutflow, rateBand, tenure);
  const amountFromSurplus = principalFromEmiRange(borrower.fromSurplus, rateBand, tenure);
  const amountFromStress = principalFromEmiRange(
    borrower.fromStress,
    stressedRate(rateBand),
    tenure,
  );
  const binding = bindingConstraint({
    fromOutflow: amountFromOutflow,
    fromSurplus: amountFromSurplus,
    fromStress: amountFromStress,
  });

  let safeAmount = minOf(minOf(amountFromOutflow, amountFromSurplus), amountFromStress);

  log.record({
    rule: 'affordability.safe-amount',
    label: 'The most you can safely take on',
    inputs: {
      'under your outflow ceiling': amountFromOutflow,
      'from what is left over': amountFromSurplus,
      'still holding after a bad turn': amountFromStress,
    },
    output: safeAmount,
    why: `The tightest of the three is what counts, and here that is ${binding}.`,
  });

  // A secured product cannot exceed what the asset supports.
  if (routing.securedCap) {
    lenderAmount = minOf(lenderAmount, routing.securedCap);
    safeAmount = minOf(safeAmount, routing.securedCap);
    log.record({
      rule: 'pricing.secured-cap',
      label: 'Limit set by what you are pledging',
      inputs: { 'what it is worth': routing.securedCap },
      output: routing.securedCap,
      why: 'Lenders advance only part of an asset\'s value, so this caps the loan regardless of what your income would support.',
    });
  }

  log.record({
    rule: 'amounts.lender',
    label: 'What a lender will likely sanction',
    inputs: { 'instalment they allow': lenderEmiHeadroom, 'over': `${tenure} months` },
    output: lenderAmount,
    why: 'Their ceiling applied to your recognised income, turned into an amount at the rate band above. Rent is not in this number, because they do not count it.',
  });

  // What the safe amount actually costs each month, and under stress.
  const emiAtSafe = emiRangeCorrelated(safeAmount, rateBand, tenure);

  log.record({
    rule: 'amounts.safe',
    label: 'What you can safely carry',
    inputs: { 'instalment you can carry': emiAtSafe, 'over': `${tenure} months` },
    output: safeAmount,
    why: `The same arithmetic on your own ceiling instead of theirs. The gap between the two numbers is mostly your rent, plus what a bad month would do.`,
  });
  const outgoNow = totalOutgo(rent, existingEmis, emiAtSafe);

  // The bad turn is both halves at once: less coming in, and a bigger instalment
  // going out. Testing them separately would understate it.
  const emiAfterRateRise = emiRangeCorrelated(safeAmount, stressedRate(rateBand), tenure);
  const outgoStressed = totalOutgo(rent, existingEmis, emiAfterRateRise);
  const stress = stressTest(outgoStressed, stressed, stressedOutflowCeiling.value, log);

  // The all-in rate barely moves with the size of the loan, but it needs some
  // amount to be computed on. Where nothing is safe to borrow we price what they
  // asked for instead, so the figure still answers "what would this have cost?"
  const amountToPrice =
    safeAmount.hi > 0
      ? safeAmount
      : point(answers.amountAsked && answers.amountAsked > 0 ? answers.amountAsked : notionalPricingAmount.value);
  const aprBand = aprRange(amountToPrice, rateBand, tenure, feeBand);

  log.record({
    rule: 'pricing.apr',
    label: 'The rate once fees are counted',
    inputs: { 'quoted rate': rateBand, 'processing fee': feeBand, 'GST on the fee': '18%' },
    output: aprBand,
    why: 'The fee and the tax on it never reach your account, but you repay as though they did. This is the number to compare between lenders.',
  });

  if (rateBand.hi >= predatoryRateFloor.value) {
    log.record({
      rule: 'pricing.predatory',
      label: 'This is expensive money',
      inputs: { 'top of your band': rateBand.hi },
      output: true,
      why: predatoryRateFloor.why,
    });
  }

  const verdict = decide(
    {
      answers,
      safeAmount,
      lenderAmount,
      surplus: borrower.surplus,
      planning: income.planning,
      existingEmis,
      recentBounce: credit.recentBounce,
      unsecuredLikelyDeclined: credit.unsecuredLikelyDeclined,
      securedAvailable: routing.product.secured,
      productive: isProductive(answers),
      informalIncome:
        answers.incomeType === 'informal' || answers.incomeType === 'self-employed-cash',
      hasAppLoans: answers.appOrBnplLoans === true,
      stressBreaches: stress.breaches,
    },
    log,
  );

  // A "don't" verdict has to mean it, so the safe-carry figure goes to zero.
  // The lender-likely figure stays, because on a "don't" it is the more useful
  // of the two: somebody will still lend Anita this money, and knowing that is
  // what protects her from taking it.
  //
  // The affordability arithmetic is kept intact alongside, not discarded — the
  // path-to-yes toggles need a number to move, and the working drawer needs
  // something to show.
  const recommended = verdict.kind === 'dont' ? point(0) : safeAmount;
  if (verdict.kind === 'dont') {
    log.record({
      rule: 'amounts.safe.withheld',
      label: 'Nothing here is safe to take on',
      inputs: {
        'what affordability alone would allow': safeAmount,
        'what a lender might still offer': lenderAmount,
      },
      output: point(0),
      why: 'The sums on their own would stretch to something, and a lender may well offer it. That is the danger rather than the opportunity: the reason above has not gone away, and borrowing into it makes it worse.',
    });
  }

  const interestRange = iv(
    totalInterest(safeAmount.lo, emiAtSafe.lo, tenure),
    totalInterest(safeAmount.hi, emiAtSafe.hi, tenure),
  );

  return {
    verdict,
    amounts: {
      lender: lenderAmount,
      safe: recommended,
      safeOnAffordabilityAlone: safeAmount,
      asked: answers.amountAsked,
    },
    routing,
    pricing: { rateBand, feeBand, aprBand, tenureMonths: tenure },
    repayment: {
      emiCeiling: emiAtSafe,
      totalInterest: interestRange,
      outflowRatioNow: outflowRatio(outgoNow, income.planning),
      outflowRatioStressed: stress.outflowRatio,
      stressBreaches: stress.breaches,
    },
    income,
    credit,
    surplus: borrower.surplus,
    confidence: confidenceFrom(safeAmount, rateBand),
    trace: log.all(),
    assumptions: collectAssumptions(log.all()),
  };
}

const collectAssumptions = (trace: readonly TraceEntry[]): readonly string[] =>
  trace.filter((e) => e.assumed === true).map((e) => e.label);

/** Re-run with one answer changed. The whole "path to yes" feature, in one line. */
export const computeWith = (answers: Answers, change: Partial<Answers>): Result =>
  compute({ ...answers, ...change });

// Re-exported so callers need only this module.
export { add, atLeastZero, mul, scale, sub };
export type { Interval };
