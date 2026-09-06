/**
 * Credit standing.
 *
 * The rule that matters most here is what happens when the borrower does not
 * know their score. It becomes a band, and the band widens everything downstream
 * — it never becomes 300, and it never becomes the average of the band. An
 * average would quietly promise a rate nobody has offered.
 *
 * Never having borrowed is a third state, not a low score. Banks are wary of
 * lending unsecured to someone with no record, and entirely relaxed about
 * lending against a property. Collapsing that into "bad credit" is how a
 * shopkeeper with an unencumbered shop gets pushed into a 22% personal loan.
 */

import type { Answers } from '../answers';
import { add, iv, type Interval } from '../interval';
import type { TraceLog } from '../trace';
import { judgement, register, tierFor, type Rule, type TieredRule } from './table';

/** Points added to the bottom of a product's rate band, by score. */
export const scoreRatePremium = register<TieredRule<Interval>>({
  id: 'credit.score-premium',
  what: 'Rate premium over the best available, by credit score',
  keyedOn: 'credit score',
  source: judgement(
    'Directionally how risk-based pricing works in Indian retail lending. Exact steps vary by lender and are not published.',
  ),
  tiers: [
    {
      upTo: 650,
      value: iv(5, 9),
      why: 'Below 650 most banks decline unsecured lending outright, and the lenders who do say yes price it steeply.',
    },
    {
      upTo: 700,
      value: iv(3, 5),
      why: 'In the 650s and 690s you will be quoted several points over the best rate, and plenty of banks will still decline.',
    },
    {
      upTo: 750,
      value: iv(1, 2),
      why: 'A point or two over the best rate. Worth pushing back on, since you are close to the top band.',
    },
    {
      upTo: Infinity,
      value: iv(0, 0),
      why: 'At 750 and above you qualify for the bottom of the band. If you are quoted more, ask why.',
    },
  ],
});

export const unknownScoreBand = register<Rule<Interval>>({
  id: 'credit.unknown-score',
  what: 'Score assumed when the borrower has borrowed before but does not know it',
  value: iv(650, 780),
  why: 'Someone repaying loans now is unlikely to be at either extreme, but the honest answer spans from "banks will hesitate" to "you qualify for the best rate". Checking it is free and narrows this immediately.',
  source: judgement('A deliberately wide band. Narrowing it without evidence would be inventing a score.'),
});

export const neverBorrowedRule = register<Rule<Interval>>({
  id: 'credit.never-borrowed',
  what: 'Rate premium for a borrower with no credit history',
  value: iv(1, 3),
  why: 'With no record, banks have nothing to price against, so unsecured lending comes at a premium or is declined. Lending against an asset is barely affected — the asset is the evidence.',
  source: judgement('New-to-credit borrowers are treated cautiously on unsecured lending, generously on secured.'),
});

export const bounceRule = register<Rule<{ premium: Interval; monthsCounted: number }>>({
  id: 'credit.recent-bounce',
  what: 'Effect of a missed or bounced instalment in the recent past',
  value: { premium: iv(4, 4), monthsCounted: 6 },
  why: 'A bounce in the last six months is the single loudest signal in the file. Most lenders will decline unsecured lending, and it is the clearest sign that another instalment is not the answer right now.',
  source: judgement('Bureau records show a bounce for years; lenders weigh a recent one heavily.'),
});

export const lenderSpread = register<Rule<number>>({
  id: 'credit.lender-spread',
  what: 'Points of variation between lenders for the same borrower',
  value: 1.5,
  why: 'Two lenders looking at the same file will still quote differently, so the band stays a band even when everything about you is known. It is also roughly what shopping around is worth.',
  source: judgement('Observed spread between banks and NBFCs on comparable profiles.'),
});

export const predatoryRateFloor = register<Rule<number>>({
  id: 'credit.predatory-rate',
  what: 'Rate at which a loan is flagged as predatory',
  value: 30,
  why: 'Above about 30% a year, an instalment loan costs more than it can realistically earn for the borrower, and clearing it comes before anything else.',
  source: judgement('App-based lenders commonly price at these levels; the threshold is my own line.'),
});

export interface CreditAssessment {
  /** The score, or the band we are working within when it is not known. */
  readonly band: Interval;
  readonly known: boolean;
  readonly neverBorrowed: boolean;
  readonly recentBounce: boolean;
  /** Points to add to a product's base rate band. */
  readonly ratePremium: Interval;
  /** True when unsecured lending is likely to be refused outright. */
  readonly unsecuredLikelyDeclined: boolean;
}

export function assessCredit(answers: Answers, log: TraceLog): CreditAssessment {
  const score = answers.creditScore;
  const recentBounce = answers.bouncedInLast6Months === true;

  let band: Interval;
  let known = false;
  let neverBorrowed = false;
  let premium: Interval;

  if (score?.known === true) {
    known = true;
    band = iv(score.score, score.score);
    premium = log.record({
      rule: 'credit.score-premium',
      label: 'What your score does to your rate',
      inputs: { 'your score': score.score },
      output: tierFor(scoreRatePremium, score.score).value,
      why: tierFor(scoreRatePremium, score.score).why,
    });
  } else if (score?.known === false && score.everBorrowed === false) {
    neverBorrowed = true;
    band = unknownScoreBand.value;
    premium = log.record({
      rule: 'credit.never-borrowed',
      label: 'You have never borrowed before',
      inputs: { 'credit history': 'none' },
      output: neverBorrowedRule.value,
      why: neverBorrowedRule.why,
    });
  } else {
    // Either they said they don't know, or they skipped the question entirely.
    band = unknownScoreBand.value;
    // The premium spans the whole band: best case the premium at the top of the
    // band, worst case the premium at the bottom. Never the middle of the two —
    // an average here would quote a rate that nobody has actually offered.
    const atBest = tierFor(scoreRatePremium, band.hi).value;
    const atWorst = tierFor(scoreRatePremium, band.lo).value;
    premium = log.record({
      rule: 'credit.unknown-score',
      label: 'Your score is not known yet',
      inputs: { 'assumed range': unknownScoreBand.value },
      output: iv(atBest.lo, atWorst.hi),
      why: `${unknownScoreBand.why} Your rate band stays wide until you do.`,
      assumed: true,
      assumption:
        'Credit score: not known, so we worked across 650 to 780 rather than guessing a number. Checking it is free and narrows your rate straight away.',
    });
  }

  if (recentBounce) {
    premium = log.record({
      rule: 'credit.recent-bounce',
      label: 'A payment bounced recently',
      inputs: { 'in the last': `${bounceRule.value.monthsCounted} months`, 'adds': bounceRule.value.premium },
      output: add(premium, bounceRule.value.premium),
      why: bounceRule.why,
    });
  }

  const unsecuredLikelyDeclined = recentBounce || (known && band.hi < 650);
  if (unsecuredLikelyDeclined) {
    log.record({
      rule: 'credit.unsecured-declined',
      label: 'Unsecured lending is unlikely right now',
      inputs: { 'recent bounce': recentBounce, 'score': known ? band.lo : 'not known' },
      output: true,
      why: recentBounce
        ? 'With a bounce this recent, most banks and NBFCs will decline a loan that has nothing behind it.'
        : 'Below 650 a loan with nothing pledged against it is usually refused.',
    });
  }

  return { band, known, neverBorrowed, recentBounce, ratePremium: premium, unsecuredLikelyDeclined };
}
