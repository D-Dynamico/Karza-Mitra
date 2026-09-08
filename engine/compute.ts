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
  emi,
  emiRangeCorrelated,
  principalFromEmiRange,
  totalInterest,
} from './finance';
import {
  bindingConstraint,
  borrowerCeiling,
  lenderCeiling,
  outflowRatio,
  safeCeilingFor,
  stressedCeilingFor,
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
import {
  largeExpenseReserve,
  productiveEarningsCover,
  stabilityAdjustment,
} from './rules/stability';

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
    /**
     * One sentence on why the two figures differ, for the panel that shows them
     * side by side. It lives here rather than in the UI because it is a claim
     * about this borrower — it named rent whether or not she paid any — and a
     * claim about a borrower is a rule's to make, not a branch in a component's.
     */
    readonly whyTheyDiffer: string;
  };
  /** O2: the product this borrower should be asking for. */
  readonly routing: Routing | undefined;
  /**
   * What the rejected product would actually cost, in rupees.
   *
   * "Several points more" is a true sentence that no borrower can act on. The
   * same fact as "about ₹4.2 lakh more in interest over 5 years" is one she can
   * repeat at the counter, and it is the argument for pledging something rather
   * than a footnote to it. Undefined where there is no alternative, or where the
   * alternative is the cheaper of the two — which happens, and where the copy
   * already says the borrower is on the dearer product.
   */
  readonly alternativeCost:
    | {
        /** Extra interest over the term, at the midpoint of each product's band. */
        readonly extraInterest: number;
        /** The amount both were costed on. */
        readonly amount: number;
        readonly months: number;
      }
    | undefined;
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

/**
 * Tenure used for the headline figures, before the borrower moves the slider.
 *
 * The retirement cap and the product's minimum term can disagree, and the
 * minimum wins — deliberately. A lender does not write a twelve-month loan
 * against property, so shortening the term to fit a 59-year-old's working life
 * would quote a loan nobody offers. The honest move is to keep the term the
 * product is actually written for and say plainly that it runs past the age we
 * assumed they stop earning, because nothing here models income after that.
 */
function headlineTenure(routing: Routing, answers: Answers, log: TraceLog): number {
  const band = routing.product.tenureMonths;
  const policy = tenurePolicy.value;
  const monthsToRetirement =
    answers.age !== undefined
      ? Math.max(12, (policy.retirementAge - answers.age) * 12)
      : band.hi;
  const preferred = routing.product.secured
    ? Math.min(band.hi, policy.securedPreferredMonths)
    : policy.unsecuredPreferredMonths;
  const capped = Math.min(preferred, monthsToRetirement);
  const tenure = Math.max(band.lo, capped);

  if (answers.age !== undefined && tenure > capped) {
    const overrunYears = Math.round(((tenure - monthsToRetirement) / 12) * 10) / 10;
    log.record({
      rule: 'pricing.tenure-past-retirement',
      label: 'This loan runs past the age we assumed you stop earning',
      inputs: {
        'your age now': answers.age,
        'shortest term this product is written for': band.lo,
        'months until you stop earning': monthsToRetirement,
      },
      output: tenure,
      why: `A ${routing.product.name.toLowerCase()} is not written for less than ${band.lo} months, so the term cannot be shortened to end at ${policy.retirementAge}. It runs about ${overrunYears} years past that, and nothing here models what you earn after you stop working.`,
      assumed: true,
      assumption: `Repayment past retirement: this loan runs roughly ${overrunYears} years beyond age ${policy.retirementAge}, and we have assumed you can still meet it. If your income drops when you stop working, ask about a shorter term or a co-applicant who will still be earning.`,
    });
  }

  return tenure;
}

/**
 * What the rejected product would cost, over and above the chosen one.
 *
 * Both loans are costed on the same amount over the same term, so the comparison
 * is one variable wide — the rate. Each is taken at the midpoint of its own
 * published band rather than at an end, because pairing one product's floor with
 * the other's ceiling would manufacture whichever answer we wanted. The term is
 * the chosen product's, clamped into the alternative's own band: a personal loan
 * is not written over fifteen years, so costing one there would be inventing a
 * product to lose the argument to.
 */
function costOfTheAlternative(
  routing: Routing,
  amount: Interval,
  chosenTenure: number,
  log: TraceLog,
): Result['alternativeCost'] {
  const alt = routing.alternative?.product;
  if (alt === undefined) return undefined;

  const principal = Math.round((amount.lo + amount.hi) / 2);
  if (principal <= 0) return undefined;

  const months = Math.round(
    Math.min(Math.max(chosenTenure, alt.tenureMonths.lo), alt.tenureMonths.hi),
  );
  const mid = (band: Interval): number => (band.lo + band.hi) / 2;
  const interestAt = (rate: number): number =>
    totalInterest(principal, emi(principal, rate, months), months);

  const here = interestAt(mid(routing.product.rateBand));
  const there = interestAt(mid(alt.rateBand));
  const extraInterest = Math.round(there - here);

  // The alternative is sometimes the cheaper loan — a borrower on an NBFC
  // two-wheeler rate is being compared against the bank loan she cannot get.
  // There is no extra cost to report there, and inventing one would be a lie.
  if (extraInterest <= 0) return undefined;

  log.record({
    rule: 'products.routing.alternative-cost',
    label: `What a ${alt.name.toLowerCase()} would cost you instead`,
    // Fixed key names, not the product names: `ui/units.ts` maps units by
    // `rule::input`, and a key built from a product name cannot be in a table.
    inputs: {
      'costed on': principal,
      'over': `${months} months`,
      'rate on the loan we suggest': mid(routing.product.rateBand),
      'rate on the other loan': mid(alt.rateBand),
    },
    output: extraInterest,
    why: `Both loans at the middle of their published rates, on the same amount over the same term. The difference is what the pledge is worth to you in rupees.`,
  });

  return { extraInterest, amount: principal, months };
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

/**
 * Internal switches. Not part of the public shape: a caller asks for a result,
 * not for a mode. The one flag stops a counterfactual from running its own
 * counterfactual, which is what keeps the re-run below at depth one.
 */
interface ComputeOptions {
  readonly insideCounterfactual?: boolean;
}

export function compute(answers: Answers, options: ComputeOptions = {}): Result {
  const log = new TraceLog();

  const credit = assessCredit(answers, log);
  const income = assessIncome(answers, log);
  const existingEmis = answers.existingEmis ?? 0;
  // A home-loan instalment is an obligation, not a housing preference: a lender
  // ignores rent in its ratios and counts a mortgage in full. It is collected
  // with the other loans rather than with rent, so it reaches both ceilings
  // here without any special case — see the hint on both questions, which is
  // what actually routes it.
  const obligations = existingEmis;
  // Never a bare `?? 0`. An unanswered rent becomes a conservative range that
  // widens the answer, not a zero that quietly improves it.
  const rentEstimate = assumedRent(answers, log);
  const rent = rentEstimate.value;

  // Household expenses are one of the few answers we fill in for the borrower,
  // because leaving it blank silently overstates what they can afford. It is
  // marked as assumed everywhere it appears.
  const expenses = assumedExpenses(answers, log);

  // Routing and the budgeting basis do not need an income figure, and they are
  // the two things the first questions actually settle. Working them out before
  // the income guard means the app can already say "you should be asking for a
  // two-wheeler loan, and we will budget on your slow month" after two answers,
  // instead of reporting that nothing has changed.
  const routing = route(answers, credit, log);
  if (answers.incomeType !== undefined) {
    const worstMonth =
      answers.incomeType !== 'salaried' ? 'your slow month' : 'your monthly income';
    log.record({
      rule: 'income.basis',
      label: 'What we will budget against',
      inputs: { 'how you earn': answers.incomeType },
      output: worstMonth,
      why:
        worstMonth === 'your slow month'
          ? 'Your income moves, so the safe plan is built on a bad month rather than a good one.'
          : 'Your pay is the same every month, so what you earn is what you can plan against.',
    });
  }

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
        obligations: existingEmis,
        rentCounted: false,
        collateralBindsBoth: false,
        verdictIfExistingEmisCleared: undefined,
        paysForItself: undefined,
        minTicket: 0,
        productName: 'loan',
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
        whyTheyDiffer: 'Neither figure can be worked out until you tell us what you earn.',
      },
      routing,
      // Nothing has been priced, so there is nothing to compare against.
      alternativeCost: undefined,
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
  //
  // The stress case runs on income WITHOUT the productive uplift. Counting money
  // the purchase has not earned yet as part of a bad-times scenario would be
  // self-defeating: the bad turn being modelled is largely the purchase failing
  // to deliver. A stress test flattered by the thing under test is not a test.
  const incomeWithoutUplift = atLeastZero(sub(income.planning, income.productiveUplift));
  const stressed = stressedIncome(incomeWithoutUplift, log);
  const lenderEmiHeadroom = lenderCeiling(income.recognised, obligations, log);
  const borrower = borrowerCeiling(income.planning, {
    rent,
    existingEmis: obligations,
    expenses: expenses.value,
    expensesAssumed: expenses.assumed,
    emergencySavingsMonths: answers.emergencySavingsMonths,
    largeExpenseReserve: largeExpenseReserve(answers, log),
    stressedPlanning: stressed,
  }, log);

  // Price, then amount — the product is already chosen above, and it is what
  // sets the rate band, which in turn sets what an instalment will support.
  const tenure = headlineTenure(routing, answers, log);

  // Credit standing places the borrower *within* the product's band rather than
  // merely raising its floor. A clean file at the top of the range should see a
  // narrow band near the bottom, not the whole product range — quoting someone
  // with a 780 score "10.5% to 24%" is useless to them.
  const base = routing.product.rateBand;
  const stability = stabilityAdjustment(answers, log);
  const pricedOutsideTheBand = credit.recentBounce || credit.unsecuredLikelyDeclined;
  const rateBand = log.record({
    rule: 'pricing.rate-band',
    label: 'The rate band you should expect',
    inputs: {
      'base band for this product': base,
      'added for your credit standing': credit.ratePremium,
      'adjusted for how steady your income is': stability,
      'spread between lenders': lenderSpread.value,
    },
    // The floor is the product's own: a discount can move you to the bottom of
    // the band but never below what the product is written at.
    //
    // The ceiling is NOT capped for a borrower with adverse credit. Capping it
    // was making bad news *narrow* the band — a bounce pushed the top against
    // the product's ceiling and the range collapsed, so the engine looked more
    // confident about someone it knew less about. That is backwards. A borrower
    // outside the mainstream is priced outside the mainstream band, by lenders
    // who specialise in exactly that, and the honest thing is to let the range
    // widen upward and say so.
    output: iv(
      Math.min(Math.max(base.lo + credit.ratePremium.lo + stability.lo, base.lo), base.hi),
      pricedOutsideTheBand
        ? Math.max(base.lo + credit.ratePremium.hi + stability.hi + lenderSpread.value, base.hi)
        : Math.min(
            Math.max(base.lo + credit.ratePremium.hi + stability.hi + lenderSpread.value, base.lo),
            base.hi,
          ),
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
  //
  // Whether the cap actually bit is worth keeping, not just the capped figure:
  // when it holds down both numbers, income was never the constraint, and any
  // copy that blames income is describing a different borrower.
  const safeBeforeCap = safeAmount;
  const lenderBeforeCap = lenderAmount;
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
  // Said once, used twice: as the reason on the trace entry, and as the line
  // under the two figures on screen.
  const whyTheyDiffer =
    rent.hi > 0
      ? 'The difference is your rent. Lenders leave it out. Your budget cannot.'
      : 'The difference is what your house spends, and what a bad month would do. Lenders leave both out. You cannot.';

  const emiAtSafe = emiRangeCorrelated(safeAmount, rateBand, tenure);

  log.record({
    rule: 'amounts.safe',
    label: 'What you can safely carry',
    inputs: { 'instalment you can carry': emiAtSafe, 'over': `${tenure} months` },
    output: safeAmount,
    why: whyTheyDiffer,
  });
  const outgoNow = totalOutgo(rent, obligations, emiAtSafe);

  // The bad turn is both halves at once: less coming in, and a bigger instalment
  // going out. Testing them separately would understate it.
  const emiAfterRateRise = emiRangeCorrelated(safeAmount, stressedRate(rateBand), tenure);
  const outgoStressed = totalOutgo(rent, obligations, emiAfterRateRise);
  const stress = stressTest(
    outgoStressed,
    stressed,
    stressedCeilingFor(answers.emergencySavingsMonths, safeCeilingFor(income.planning)),
    log,
  );

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

  const alternativeCost = costOfTheAlternative(routing, amountToPrice, tenure, log);

  const paysForItself = productiveEarningsCover(
    answers.expectedMonthlyEarnings,
    emiAtSafe,
    log,
  );

  const collateralBindsBoth =
    routing.securedCap !== undefined &&
    routing.securedCap.hi < safeBeforeCap.hi &&
    routing.securedCap.hi < lenderBeforeCap.hi;

  // Verified rather than asserted. The "wait for your loan to end" line used to
  // claim the wait changes the answer without ever running it — and for a
  // borrower held down by collateral it does not. One more pass of the engine
  // settles it; `insideCounterfactual` stops that pass doing the same again, so
  // the recursion is one deep and no more.
  const verdictIfExistingEmisCleared =
    options.insideCounterfactual || existingEmis <= 0
      ? undefined
      : compute(
          { ...answers, existingEmis: 0, existingEmiMonthsLeft: 0 },
          { insideCounterfactual: true },
        ).verdict.kind;

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
      productive: paysForItself ?? isProductive(answers),
      paysForItself,
      informalIncome:
        answers.incomeType === 'informal' || answers.incomeType === 'self-employed-cash',
      hasAppLoans: answers.appOrBnplLoans === true,
      stressBreaches: stress.breaches,
      obligations,
      rentCounted: rent.hi > 0,
      collateralBindsBoth,
      verdictIfExistingEmisCleared,
      minTicket: routing.product.minTicket,
      productName: routing.product.name,
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
      whyTheyDiffer,
    },
    routing,
    alternativeCost,
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

/**
 * What the engine filled in for itself, in words the borrower could act on.
 *
 * Only rules that actually guessed something appear. Figures that merely
 * inherited an assumption — a surplus computed from a guessed rent — are not
 * listed: they are consequences, and listing them makes the app look like it is
 * guessing at everything rather than at three specific things.
 */
const collectAssumptions = (trace: readonly TraceEntry[]): readonly string[] =>
  trace.filter((e) => e.assumption !== undefined).map((e) => e.assumption!);

/** Re-run with one answer changed. The whole "path to yes" feature, in one line. */
export const computeWith = (answers: Answers, change: Partial<Answers>): Result =>
  compute({ ...answers, ...change });

// Re-exported so callers need only this module.
export { add, atLeastZero, mul, scale, sub };
export type { Interval };
