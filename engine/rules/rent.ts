/**
 * Rent, when the borrower has not told us.
 *
 * "Unknown is never zero" is stated in the brief about credit scores, but it is
 * a principle rather than a rule about one field. A blank rent read as zero is
 * the same mistake wearing different clothes, and it is worse than the credit
 * one because it silently *improves* the answer: it hands the borrower a surplus
 * they may not have.
 *
 * The direction matters. This product exists because lenders have been
 * flattering borrowers for years — quoting what will be sanctioned rather than
 * what can be carried. An engine that resolves its own unknowns in the
 * borrower's favour is doing the same thing more politely. So an unanswered rent
 * becomes a conservative interval, flagged as assumed, and it widens the answer
 * instead of quietly raising it.
 *
 * Owning the premises is the one case where zero is the honest reading.
 */

import type { Answers } from '../answers';
import { iv, point, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, type Rule } from './table';

export const assumedRentByCity = register<Rule<Record<string, Interval>>>({
  id: 'rent.assumed-by-city',
  what: 'Rent assumed when it is not stated, by city tier',
  value: {
    metro: iv(8000, 20000),
    'tier-2': iv(4000, 10000),
    'tier-3': iv(3000, 7000),
    unknown: iv(3000, 20000),
  },
  why: 'Somebody has to be paying for the roof. Assuming nothing would hand you a surplus you may not have, so we assume a range for your city and widen the answer rather than narrow it.',
  source: judgement(
    'Rough rental bands for a modest home in each tier. Not survey data, and deliberately wide — the borrower is meant to correct it.',
  ),
});

export interface RentEstimate {
  readonly value: Interval;
  readonly assumed: boolean;
}

export function assumedRent(answers: Answers, log: TraceLog): RentEstimate {
  if (answers.rentOrHomeEmi !== undefined) {
    return { value: point(answers.rentOrHomeEmi), assumed: false };
  }

  // Owning property is real evidence about rent — a shopkeeper who owns his
  // premises very often lives above or beside them — but it is evidence, not a
  // fact, and it used to be recorded as a flat zero. That was the one place in
  // this engine where not knowing something made a borrower's answer *better*,
  // which is precisely the flattery the product exists to correct.
  //
  // The honest form is the one already used everywhere else: an interval. Zero
  // sits at the likely end, because that is what ownership tells us; the other
  // end is the midpoint of what renting would cost in their city, because if
  // the guess is wrong it is wrong by about that much. The width is the doubt,
  // and the top of it — not the bottom — is what the verdict is decided on.
  if (answers.ownsProperty === true) {
    const tierBand =
      assumedRentByCity.value[answers.cityTier ?? 'unknown'] ??
      assumedRentByCity.value['unknown']!;
    const ifWrong = Math.round((tierBand.lo + tierBand.hi) / 2);
    const band = iv(0, ifWrong);

    log.record({
      rule: 'rent.owns-premises',
      label: 'Rent (assumed low)',
      inputs: { 'you own property': true, 'if you do rent': tierBand },
      output: band,
      why: `You own property and did not tell us about rent, so we have assumed you most likely pay none. We have not assumed it outright — if you rent the home you live in, it would be nearer ₹${ifWrong.toLocaleString('en-IN')} a month, and the lower end of every figure below reflects that.`,
      assumed: true,
      field: 'rentOrHomeEmi',
      assumption: `Rent: we assumed you probably pay none, because you own property — but allowed up to ₹${ifWrong.toLocaleString('en-IN')} a month in case you rent where you live. Telling us settles it.`,
    });
    return { value: band, assumed: true };
  }

  const tier = answers.cityTier ?? 'unknown';
  const band = assumedRentByCity.value[tier] ?? assumedRentByCity.value['unknown']!;

  log.record({
    rule: 'rent.assumed-by-city',
    label: 'Rent (assumed)',
    inputs: { 'you did not say': true, 'your city': tier, 'assumed': band },
    output: band,
    why: `${assumedRentByCity.why} Telling us the real figure will narrow every number below.`,
    assumed: true,
    field: 'rentOrHomeEmi',
    assumption: `Rent: we assumed ₹${band.lo.toLocaleString('en-IN')} to ₹${band.hi.toLocaleString('en-IN')} a month${tier === 'unknown' ? ', not knowing your city' : ` for your city`}. Your real figure narrows every number here.`,
  });

  return { value: band, assumed: true };
}
