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
import { inLakh } from '../format';
import type { TraceLog } from '../trace';
import { judgement, register, tierFor, type Rule, type Source, type TieredRule } from './table';

export type ProductId =
  | 'personal-loan'
  | 'loan-against-property'
  | 'vehicle-loan'
  | 'gold-loan'
  | 'business-loan'
  | 'mfi-loan'
  | 'nbfc-vehicle-loan';

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
  /**
   * The smallest loan anybody actually writes in this product. Below it there is
   * no loan to be had, however the affordability arithmetic comes out.
   */
  readonly minTicket: number;
  readonly why: string;
  /**
   * Provenance for this product's bands specifically. Products are priced by
   * different lenders in different markets, so a single source note across the
   * whole table would be wrong about at least one of them.
   */
  readonly source: Source;
}

export const products = register<Rule<Record<ProductId, Product>>>({
  id: 'products.bands',
  what: 'Rate, fee, tenure and loan-to-value band per product',
  why: 'Each product prices differently because the lender\'s risk differs. What is pledged matters far more than how well you negotiate.',
  source: {
    kind: 'reference',
    cite:
      'Each product carries its own source, because each is priced by a different set of lenders. See the `source` on the individual rows. Gold loan-to-value is regulated and sits in `products.gold-ltv`.',
    checked: '2026-09-07',
  },
  value: {
    'personal-loan': {
      id: 'personal-loan',
      minTicket: 50000,
      name: 'Personal loan',
      secured: false,
      rateBand: iv(9.99, 24),
      feeBand: iv(1, 3),
      tenureMonths: iv(12, 60),
      why: 'Nothing is pledged, so the lender prices for the risk that you simply stop paying.',
      source: {
        kind: 'market',
        cite:
          'Paisabazaar and BankBazaar personal-loan rate tables, Sep 2026. Floor of 9.99% quoted by HDFC, ICICI, Axis and IndusInd for CIBIL 780+ at category-A employers; public sector teaser rates from 8.75%, which are not what an ordinary applicant is written at. Top of band 24%.',
        checked: '2026-09-07',
      },
    },
    'loan-against-property': {
      id: 'loan-against-property',
      minTicket: 500000,
      name: 'Loan against property',
      secured: true,
      rateBand: iv(8.75, 14),
      feeBand: iv(0.35, 2),
      tenureMonths: iv(60, 180),
      loanToValue: iv(0.5, 0.7),
      why: 'The property stands behind the loan, so the rate drops sharply and the tenure can stretch. The risk you take is real: the asset is on the line.',
      source: {
        kind: 'market',
        cite:
          'Bank loan-against-property rate cards, Sep 2026: SBI 8.95-10.50%, HDFC 9.00-11.00%, Axis 9.25-10.95%, ICICI 10.60-12.25%; NBFCs and housing finance companies run to 14%. Processing fees 0.35% (SBI) to 2% (private banks). Loan-to-value is 60-70% on commercial premises against 75-80% residential, so a shop sits at the lower end of this band.',
        checked: '2026-09-07',
      },
    },
    'vehicle-loan': {
      id: 'vehicle-loan',
      minTicket: 30000,
      name: 'Vehicle loan',
      secured: true,
      rateBand: iv(8.5, 15),
      feeBand: iv(0.5, 2.5),
      tenureMonths: iv(12, 60),
      loanToValue: iv(0.75, 0.9),
      why: 'The vehicle itself is the security, so it is far cheaper than borrowing the same amount unsecured to buy one.',
      source: {
        kind: 'market',
        cite:
          'BankBazaar two-wheeler loan rate table, page updated 07 Sep 2026: bank rates from 7.60% (Bank of India) to 14.50% onwards (HDFC), SBI from 8.50%, ICICI 10.25-26.10%. Bank processing fees 0.5-2.5%. Banks ask a larger down payment than NBFCs, so loan-to-value is lower.',
        checked: '2026-09-07',
      },
    },
    'gold-loan': {
      id: 'gold-loan',
      minTicket: 10000,
      name: 'Gold loan',
      secured: true,
      rateBand: iv(8.5, 14),
      feeBand: iv(0.25, 1),
      tenureMonths: iv(6, 36),
      // Loan-to-value is set by the RBI and varies with the size of the loan, so
      // it lives in `goldLoanToValue` rather than here. See that rule.
      why: 'Quick, cheap and short. Good for an urgent gap, poor for anything you will still be repaying in three years.',
      source: judgement(
        'The rate band is still my own working figure: bank gold loans sit near the bottom and NBFC gold lenders well above it, but I did not find a rate table I was willing to cite. The loan-to-value beside it is regulated and is sourced separately.',
      ),
    },
    'business-loan': {
      id: 'business-loan',
      minTicket: 50000,
      name: 'Business loan',
      secured: false,
      rateBand: iv(8.4, 24),
      feeBand: iv(1, 2),
      tenureMonths: iv(12, 60),
      why: 'Government-backed schemes sit at the bottom of this band and unsecured lenders at the top, so which door you walk through matters more than the product name.',
      source: {
        kind: 'market',
        cite:
          'MUDRA / PMMY lender rate tables, Sep 2026: public sector banks roughly 8.40-12%, private banks and NBFCs 10-15% and above, scheme band overall about 9-24%. Each lending institution prices within its own policy, which is why the band is this wide. The MUDRA ceiling rose from 10 to 20 lakh in 2024.',
        checked: '2026-09-07',
      },
    },
    'nbfc-vehicle-loan': {
      id: 'nbfc-vehicle-loan',
      name: 'Two-wheeler loan from an NBFC or platform financier',
      secured: true,
      rateBand: iv(18, 28),
      feeBand: iv(2, 6),
      tenureMonths: iv(18, 60),
      loanToValue: iv(0.7, 0.95),
      minTicket: 25000,
      why: 'A bank will not write this loan for someone whose income cannot be evidenced, whatever the vehicle is worth. The lenders who will — NBFCs and the finance arms attached to delivery platforms — charge a great deal more for taking the risk a bank would not.',
      source: {
        kind: 'market',
        cite:
          'BankBazaar two-wheeler loan rate table, page updated 07 Sep 2026: NBFC lenders from 9.47% up to 24% (Bajaj Auto Finance), with the two-wheeler market as a whole reaching 36%; NBFC processing fees 4-7%; NBFCs finance up to 95% of on-road price and write tenures to 60 months. The band starts at 18% rather than 9.47% because the low NBFC quotes go to borrowers a bank would also accept, and this product exists for the ones a bank would not.',
        checked: '2026-09-07',
      },
    },
    'mfi-loan': {
      id: 'mfi-loan',
      minTicket: 15000,
      name: 'Microfinance or SHG loan',
      secured: false,
      rateBand: iv(18, 26),
      feeBand: iv(0, 1),
      tenureMonths: iv(12, 24),
      why: 'Expensive, but honest about it and built for incomes that cannot be evidenced. Cheaper than any app loan.',
      source: {
        kind: 'market',
        cite:
          'NBFC-MFI effective lending rates, Sep 2026: sector band roughly 18-26%. ICICI reports a maximum of 21.50% to microfinance borrowers for Q4 FY2026; Tata Capital microfinance starts at 24.25%. RBI removed the margin cap on NBFC-MFI pricing in 2022, so the band is set by the market rather than by a formula.',
        checked: '2026-09-07',
      },
    },
  },
});

/**
 * Gold loan-to-value, which the RBI sets rather than the lender.
 *
 * The old flat 75% cap was replaced from 1 April 2026 by a tiered one that is
 * deliberately generous to small borrowers. That direction matters here: a
 * borrower with a little gold and a bad file can now raise more against it, and
 * a gold loan is very often the cheapest door still open to them.
 *
 * The low end of each band is 75%, not the ceiling, because lenders have been
 * slow to move and most still write to the old cap. The high end is what the
 * regulation now permits. Quoting only the ceiling would promise money a branch
 * may not actually hand over; quoting only 75% would push a borrower towards a
 * microfinance loan at three times the rate when gold would have covered it.
 * The interval says both, which is the honest answer.
 */
export const goldLoanToValue = register<TieredRule<Interval>>({
  id: 'products.gold-ltv',
  what: 'Share of pledged gold that can be borrowed, by size of loan',
  keyedOn: 'amount being borrowed, in rupees',
  tiers: [
    {
      upTo: 250000,
      value: iv(0.75, 0.85),
      why: 'Small gold loans get the most generous treatment: the RBI allows up to 85% from April 2026, against the 75% most lenders still write to.',
    },
    {
      upTo: 500000,
      value: iv(0.75, 0.8),
      why: 'Between two and a half and five lakh the ceiling steps down to 80%.',
    },
    {
      upTo: Infinity,
      value: iv(0.75, 0.75),
      why: 'Above five lakh the old 75% cap still applies, so there is no spread to quote.',
    },
  ],
  source: {
    kind: 'regulation',
    cite:
      'RBI gold loan directions effective 1 April 2026: tiered loan-to-value of 85% for loans up to 2.5 lakh, 80% from 2.5 to 5 lakh, 75% above. Limits must hold through the life of the loan, not only at sanction; bullet-repayment gold loans must clear within 12 months; only jewellery, ornaments and specially minted coins are eligible collateral, not bars, bullion or gold ETFs.',
    checked: '2026-09-07',
  },
});

/** The loan-to-value band that applies to a gold loan of this size. */
export const goldLtvFor = (amount: number): Interval => tierFor(goldLoanToValue, amount).value;

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

  const goldCovers =
    (answers.goldValue ?? 0) > 0 &&
    asked > 0 &&
    asked <= (answers.goldValue ?? 0) * goldLtvFor(asked).hi;

  // Gold first when the file itself is the obstacle. A lender writing a vehicle
  // loan still underwrites the borrower, and a recent bounce or unevidenced
  // income gets that application declined however good the security is. A gold
  // loan sidesteps the file entirely — the metal is in their vault — which makes
  // it the route that is actually available rather than the one that looks best
  // on paper.
  if (goldCovers && credit.unsecuredLikelyDeclined) {
    const ltv = goldLtvFor(asked);
    return record({
      product: all['gold-loan'],
      securedCap: iv(answers.goldValue! * ltv.lo, answers.goldValue! * ltv.hi),
      alternative: {
        product: answers.purpose === 'vehicle' ? all['vehicle-loan'] : all['personal-loan'],
        why: 'On paper this would be the usual route, but the lender still has to approve you, and right now your file is what is standing in the way. Gold does not need approving.',
      },
      why: 'Household gold covers what you need, and it is the one kind of borrowing your credit history does not stand in the way of. It is also cheap. Repay it and the gold comes back.',
    });
  }

  // A vehicle, bought with a vehicle loan. But *which* vehicle loan depends on
  // who will actually write it. A bank prices a two-wheeler cheaply because it
  // is lending to a salaried borrower it can verify; the security is only half
  // the story. Where the income cannot be evidenced, the bank is not an option
  // at any price, and quoting a bank's rate to someone who cannot get it is the
  // most misleading thing this app could do.
  if (answers.purpose === 'vehicle') {
    const bankWillNotWriteIt =
      answers.incomeType === 'informal' ||
      answers.incomeType === 'self-employed-cash' ||
      credit.unsecuredLikelyDeclined;
    const product = bankWillNotWriteIt ? all['nbfc-vehicle-loan'] : all['vehicle-loan'];
    const ltv = product.loanToValue!;
    const cap =
      answers.vehicleOnRoadPrice !== undefined
        ? iv(answers.vehicleOnRoadPrice * ltv.lo, answers.vehicleOnRoadPrice * ltv.hi)
        : undefined;

    return record({
      product,
      securedCap: cap,
      alternative: bankWillNotWriteIt
        ? {
            product: all['vehicle-loan'],
            why: 'This is what a bank charges for the same loan, and it is what you should be aiming at. Getting there means evidenced income and a clean twelve months — it is not available to you today, at any branch.',
          }
        : {
            product: all['personal-loan'],
            why: 'A personal loan would leave the vehicle unpledged, but costs several points more for the same money. Not worth it unless a lender refuses the vehicle loan.',
          },
      why: bankWillNotWriteIt
        ? 'The vehicle secures the loan, but the lender still has to accept you, and a bank will not on income it cannot verify. This is the rate the lenders who will say yes actually charge. It is high because they are taking a risk a bank declined.'
        : 'The vehicle secures the loan, which is what makes it cheap. Borrowing the same amount unsecured to buy it would cost you several points more.',
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
      why: `You own property worth ${inLakh(value)} with nothing charged against it. Pledging it roughly halves the rate on an amount this size — that is the single biggest lever you have.`,
    });
  }

  // Gold, for something urgent and short.
  if (goldCovers) {
    const ltv = goldLtvFor(asked);
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
