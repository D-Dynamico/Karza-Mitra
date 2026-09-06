/**
 * Products and routing.
 *
 * The borrower asks for "a loan". Which loan is a judgement about what they own,
 * how they earn and what the money is for — and getting it wrong is expensive in
 * a way that is invisible from inside a single product. A shopkeeper with an
 * unencumbered shop offered a personal loan at 18% is being quietly overcharged
 * by nine points, and no amount of negotiating within that product fixes it.
 *
 * So routing runs before pricing, and the rejected option is kept and costed, so
 * the borrower can see why they are being told to pledge something.
 */

import type { Answers, LoanPurpose } from '../answers';
import { iv, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, type Rule } from './table';

export type ProductId =
  | 'personal-loan'
  | 'loan-against-property'
  | 'vehicle-loan'
  | 'gold-loan'
  | 'business-loan'
  | 'mfi-loan';

export interface Product {
  readonly id: ProductId;
  readonly name: string;
  readonly secured: boolean;
  /** Base annual rate band before any adjustment for the borrower. */
  readonly rateBand: Interval;
  /** Processing fee as a percentage of the amount. */
  readonly feeBand: Interval;
  /** Tenure the product is written over, in months. */
  readonly tenureMonths: Interval;
  /** Share of the pledged asset's value that can be borrowed. */
  readonly loanToValue?: Interval;
  readonly why: string;
}

export const products = register<Rule<Record<ProductId, Product>>>({
  id: 'products.bands',
  what: 'Rate, fee, tenure and loan-to-value band per product',
  why: 'Each product prices differently because the lender\'s risk differs. What is pledged matters far more than how well you negotiate.',
  source: judgement(
    'Indicative bands taken from the build plan and NOT yet verified against current lender pages. Must be checked, with dates, before RULES.md is published.',
  ),
  value: {
    'personal-loan': {
      id: 'personal-loan',
      name: 'Personal loan',
      secured: false,
      rateBand: iv(10.5, 24),
      feeBand: iv(1, 3),
      tenureMonths: iv(12, 60),
      why: 'Nothing is pledged, so the lender prices for the risk that you simply stop paying.',
    },
    'loan-against-property': {
      id: 'loan-against-property',
      name: 'Loan against property',
      secured: true,
      rateBand: iv(9, 12),
      feeBand: iv(0.5, 1),
      tenureMonths: iv(60, 180),
      loanToValue: iv(0.5, 0.65),
      why: 'The property stands behind the loan, so the rate drops sharply and the tenure can stretch. The risk you take is real: the asset is on the line.',
    },
    'vehicle-loan': {
      id: 'vehicle-loan',
      name: 'Vehicle loan',
      secured: true,
      rateBand: iv(9, 14),
      feeBand: iv(0.5, 2),
      tenureMonths: iv(36, 60),
      loanToValue: iv(0.8, 0.95),
      why: 'The vehicle itself is the security, so it is far cheaper than borrowing the same amount unsecured to buy one.',
    },
    'gold-loan': {
      id: 'gold-loan',
      name: 'Gold loan',
      secured: true,
      rateBand: iv(8.5, 14),
      feeBand: iv(0.25, 1),
      tenureMonths: iv(6, 36),
      loanToValue: iv(0.7, 0.75),
      why: 'Quick, cheap and short. Good for an urgent gap, poor for anything you will still be repaying in three years.',
    },
    'business-loan': {
      id: 'business-loan',
      name: 'Business loan',
      secured: false,
      rateBand: iv(9, 24),
      feeBand: iv(1, 2),
      tenureMonths: iv(12, 60),
      why: 'Government-backed schemes sit at the bottom of this band and unsecured lenders at the top, so which door you walk through matters more than the product name.',
    },
    'mfi-loan': {
      id: 'mfi-loan',
      name: 'Microfinance or SHG loan',
      secured: false,
      rateBand: iv(20, 26),
      feeBand: iv(0, 1),
      tenureMonths: iv(12, 24),
      why: 'Expensive, but honest about it and built for incomes that cannot be evidenced. Cheaper than any app loan.',
    },
  },
});

export const lapThreshold = register<Rule<number>>({
  id: 'products.lap-threshold',
  what: 'Amount above which pledging property is worth the trouble',
  value: 500000,
  why: 'Below about five lakh the paperwork, valuation and time involved in a property loan outweigh what you save on the rate.',
  source: judgement('My own line, balancing the rate saving against the effort and the risk to the asset.'),
});

export const tenurePolicy = register<Rule<{
  retirementAge: number;
  unsecuredPreferredMonths: number;
  securedPreferredMonths: number;
}>>({
  id: 'products.tenure-policy',
  what: 'Tenure used for the headline figures, and the age it is capped at',
  value: { retirementAge: 60, unsecuredPreferredMonths: 60, securedPreferredMonths: 84 },
  why: 'Lenders rarely write a loan that runs past working life, so age caps the tenure. Five years is the usual shape of an unsecured loan; a secured one can stretch further, which lowers the instalment at the cost of more interest.',
  source: judgement('Standard practice. The preferred tenures are a starting point the borrower can move.'),
});

export const notionalPricingAmount = register<Rule<number>>({
  id: 'products.notional-amount',
  what: 'Amount the all-in rate is illustrated on when no other amount is available',
  value: 100000,
  why: 'The all-in rate barely changes with the size of the loan, but it has to be worked out on some amount. A lakh is used only when nothing is safe to borrow and no amount was asked for.',
  source: judgement('A round illustrative figure; it affects the displayed rate only marginally.'),
});

export interface Routing {
  readonly product: Product;
  /** What else was considered, and why it lost. Shown so routing is legible. */
  readonly alternative?: { readonly product: Product; readonly why: string };
  /** Cap imposed by what is being pledged, where one applies. */
  readonly securedCap?: Interval;
  readonly why: string;
}

const productivePurposes: readonly LoanPurpose[] = ['business-stock', 'education'];

/** Whether the money is expected to earn or save more than it costs. */
export const isProductive = (answers: Answers): boolean =>
  (answers.purpose !== undefined && productivePurposes.includes(answers.purpose)) ||
  answers.vehicleIsProductive === true;

/**
 * Choose the product. Ordered by how strong the signal is, most decisive first,
 * so a borrower who owns something useful is never quietly left on an unsecured
 * rate because the code checked purpose before collateral.
 */
export function route(
  answers: Answers,
  credit: { unsecuredLikelyDeclined: boolean; neverBorrowed: boolean },
  log: TraceLog,
): Routing {
  const all = products.value;
  const asked = answers.amountAsked ?? 0;
  const usableProperty =
    answers.ownsProperty === true &&
    answers.propertyHasCharge !== true &&
    (answers.propertyValue ?? 0) > 0;

  const record = (routing: Routing): Routing => {
    log.record({
      rule: 'products.routing',
      label: 'The right kind of loan for you',
      inputs: {
        'what it is for': answers.purpose,
        'property you could pledge': usableProperty ? answers.propertyValue : undefined,
        'amount asked': answers.amountAsked,
      },
      output: routing.product.name,
      why: routing.why,
    });
    if (routing.alternative) {
      log.record({
        rule: 'products.routing.alternative',
        label: `Why not a ${routing.alternative.product.name.toLowerCase()}`,
        inputs: { considered: routing.alternative.product.name },
        output: routing.alternative.product.rateBand,
        why: routing.alternative.why,
      });
    }
    return routing;
  };

  // A vehicle, bought with a vehicle loan. Securing the asset being purchased is
  // almost always cheaper than borrowing the money unsecured to buy it.
  if (answers.purpose === 'vehicle') {
    const cap = answers.vehicleOnRoadPrice !== undefined
      ? iv(
          answers.vehicleOnRoadPrice * all['vehicle-loan'].loanToValue!.lo,
          answers.vehicleOnRoadPrice * all['vehicle-loan'].loanToValue!.hi,
        )
      : undefined;
    return record({
      product: all['vehicle-loan'],
      securedCap: cap,
      alternative: {
        product: all['personal-loan'],
        why: 'A personal loan would leave the vehicle unpledged, but costs several points more for the same money. Not worth it unless a lender refuses the vehicle loan.',
      },
      why: 'The vehicle secures the loan, which is what makes it cheap. Borrowing the same amount unsecured to buy it would cost you several points more.',
    });
  }

  // Property that could be pledged, and an amount large enough to be worth it.
  if (usableProperty && asked >= lapThreshold.value) {
    const value = answers.propertyValue!;
    const ltv = all['loan-against-property'].loanToValue!;
    const cap = iv(value * ltv.lo, value * ltv.hi);
    const unsecuredBlocked = credit.unsecuredLikelyDeclined || credit.neverBorrowed;
    return record({
      product: all['loan-against-property'],
      securedCap: cap,
      alternative: {
        product: all['personal-loan'],
        why: unsecuredBlocked
          ? 'Without a credit record, an unsecured loan of this size would be declined or priced near the top of its band. The property changes that entirely, because the lender is no longer relying on your file.'
          : 'An unsecured loan would leave the property untouched, but costs roughly double in interest over the life of the loan.',
      },
      why: `You own property worth ${value.toLocaleString('en-IN')} with nothing charged against it. Pledging it roughly halves the rate on an amount this size — that is the single biggest lever you have.`,
    });
  }

  // Gold, for something urgent and short.
  if ((answers.goldValue ?? 0) > 0 && asked > 0 && asked <= (answers.goldValue ?? 0) * 0.75) {
    const ltv = all['gold-loan'].loanToValue!;
    return record({
      product: all['gold-loan'],
      securedCap: iv(answers.goldValue! * ltv.lo, answers.goldValue! * ltv.hi),
      alternative: {
        product: all['personal-loan'],
        why: 'Slower to arrange and several points dearer, with nothing gained.',
      },
      why: 'Household gold covers the amount you need. It is the cheapest and fastest money available to you, provided you can clear it inside a couple of years.',
    });
  }

  // Business purpose, where scheme lending is the door to try first.
  if (answers.purpose === 'business-stock' || answers.purpose === 'home') {
    return record({
      product: all['business-loan'],
      alternative: {
        product: all['personal-loan'],
        why: 'Available, but priced for consumption. A business purpose opens cheaper doors, so use them first.',
      },
      why: 'The money is going into the business, which qualifies you for scheme-backed lending priced well below a consumer loan. Ask at a bank branch before an app.',
    });
  }

  // Income that cannot be evidenced and nothing to pledge. This is the profile
  // formal unsecured lending is not built for.
  if (
    (answers.incomeType === 'informal' || answers.incomeType === 'self-employed-cash') &&
    !usableProperty
  ) {
    return record({
      product: all['mfi-loan'],
      alternative: {
        product: all['personal-loan'],
        why: 'Banks and NBFCs will almost certainly decline, since there is neither a salary slip nor an asset to price against.',
      },
      why: 'With income that cannot be evidenced and nothing to pledge, group and microfinance lending is the honest option. It is dear, but it is a fraction of what an app charges.',
    });
  }

  return record({
    product: all['personal-loan'],
    why: 'Nothing to pledge and a personal purpose, so this is the product you will be offered. The rate is what it is because the lender has only your record to go on.',
  });
}
