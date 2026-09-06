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

  // Owning the premises is the one honest zero. A shopkeeper who owns his shop
  // very often lives above or beside it.
  if (answers.ownsProperty === true) {
    log.record({
      rule: 'rent.owns-premises',
      label: 'Rent (assumed nil)',
      inputs: { 'you own property': true },
      output: point(0),
      why: 'You own property and did not tell us about rent, so we have assumed you are not paying any. Say so if you rent the home you live in — it lowers what you can safely carry.',
      assumed: true,
    });
    return { value: point(0), assumed: true };
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
  });

  return { value: band, assumed: true };
}
