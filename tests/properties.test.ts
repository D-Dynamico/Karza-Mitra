import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { width } from '../engine/interval';
import { anita, priya, ravi } from '../engine/personas';

/**
 * Properties that must hold for every borrower, not just the three we designed
 * against. These are the invariants that make the product's promises true:
 * telling us more never makes us less certain, and taking on more debt never
 * makes us say you can afford more.
 *
 * The borrowers below are generated from a fixed grid rather than at random, so
 * a failure is reproducible and the suite stays deterministic.
 */

function* generatedBorrowers(): Generator<Answers> {
  const incomes = [12000, 28000, 45000, 90000, 150000];
  const rents = [0, 8000, 25000];
  const emis = [0, 5000, 20000];
  const types = ['salaried', 'self-employed-itr', 'informal'] as const;
  const purposes = ['wedding', 'business-stock', 'vehicle', 'medical'] as const;

  for (const income of incomes) {
    for (const rent of rents) {
      for (const emi of emis) {
        for (let i = 0; i < types.length; i += 1) {
          yield {
            purpose: purposes[i % purposes.length],
            amountAsked: 500000,
            incomeType: types[i],
            monthlyIncome: { lo: income, hi: income },
            existingEmis: emi,
            rentOrHomeEmi: rent,
            householdExpenses: Math.round(income * 0.3),
            age: 35,
            creditScore: { known: true, score: 720 },
          };
        }
      }
    }
  }
}

const borrowers = [...generatedBorrowers()];
const personas = [priya.answers, ravi.answers, anita.answers];
const all = [...borrowers, ...personas];

describe('taking on more debt never helps', () => {
  it('never raises either amount when an existing instalment is added', () => {
    for (const a of all) {
      const before = compute(a);
      const after = compute({ ...a, existingEmis: (a.existingEmis ?? 0) + 5000 });
      expect(after.amounts.safe.hi).toBeLessThanOrEqual(before.amounts.safe.hi + 1e-6);
      expect(after.amounts.lender.hi).toBeLessThanOrEqual(before.amounts.lender.hi + 1e-6);
    }
  });

  it('never raises the safe amount when rent goes up', () => {
    for (const a of all) {
      const before = compute(a);
      const after = compute({ ...a, rentOrHomeEmi: (a.rentOrHomeEmi ?? 0) + 5000 });
      expect(after.amounts.safe.hi).toBeLessThanOrEqual(before.amounts.safe.hi + 1e-6);
    }
  });

  it('leaves the lender amount untouched by rent, since lenders ignore it', () => {
    // This is the asymmetry the whole product exists to show. If it ever stops
    // being true, either a rule is wrong or the product's premise has changed.
    for (const a of all) {
      const before = compute(a);
      const after = compute({ ...a, rentOrHomeEmi: (a.rentOrHomeEmi ?? 0) + 5000 });
      expect(after.amounts.lender.lo).toBeCloseTo(before.amounts.lender.lo, 6);
      expect(after.amounts.lender.hi).toBeCloseTo(before.amounts.lender.hi, 6);
    }
  });

  it('never raises the safe amount when household spending goes up', () => {
    for (const a of all) {
      const before = compute(a);
      const after = compute({
        ...a,
        householdExpenses: (a.householdExpenses ?? 0) + 5000,
      });
      expect(after.amounts.safe.hi).toBeLessThanOrEqual(before.amounts.safe.hi + 1e-6);
    }
  });
});

describe('answering more never makes us less certain', () => {
  it('does not widen the rate band when a score inside the assumed range is supplied', () => {
    // Scoped to scores within the band we assume when nobody knows theirs,
    // [650, 780]. Inside it, telling us can only ever narrow the answer.
    //
    // A score BELOW that band is a different thing: the assumption itself was
    // wrong, and pricing under 650 is genuinely more variable — some lenders
    // decline, the rest charge five to nine points over. The band there can
    // legitimately be wider than the one we showed while guessing. The test
    // below pins what must hold in that case instead.
    for (const a of all) {
      const unknown = compute({ ...a, creditScore: { known: false, everBorrowed: true } });
      for (const score of [660, 700, 730, 800]) {
        const known = compute({ ...a, creditScore: { known: true, score } });
        if (!unknown.pricing || !known.pricing) continue;
        expect(
          width(known.pricing.rateBand),
          `score ${score} widened the band`,
        ).toBeLessThanOrEqual(width(unknown.pricing.rateBand) + 1e-9);
      }
    }
  });

  it('shifts the band upward when the score is worse than we had assumed', () => {
    for (const a of all) {
      const unknown = compute({ ...a, creditScore: { known: false, everBorrowed: true } });
      const poor = compute({ ...a, creditScore: { known: true, score: 610 } });
      if (!unknown.pricing || !poor.pricing) continue;
      expect(poor.pricing.rateBand.lo).toBeGreaterThanOrEqual(unknown.pricing.rateBand.lo - 1e-9);
      expect(poor.pricing.rateBand.hi).toBeGreaterThanOrEqual(unknown.pricing.rateBand.hi - 1e-9);
    }
  });

  it('does not widen the safe amount when household spending is stated', () => {
    for (const a of all) {
      const withoutExpenses = { ...a };
      delete withoutExpenses.householdExpenses;
      const assumed = compute(withoutExpenses);
      const stated = compute({ ...withoutExpenses, householdExpenses: 20000 });
      expect(width(stated.amounts.safe)).toBeLessThanOrEqual(
        width(assumed.amounts.safe) + 1e-6,
      );
    }
  });

  it('marks an answer as assumed only when it was not given, and says what it assumed', () => {
    const mentions = (r: { assumptions: readonly string[] }, label: string): string | undefined =>
      r.assumptions.find((s) => s.startsWith(label));

    for (const a of all) {
      const stated = compute({ ...a, householdExpenses: 15000 });
      expect(mentions(stated, 'Household spending')).toBeUndefined();

      const blank = { ...a };
      delete blank.householdExpenses;
      const assumed = mentions(compute(blank), 'Household spending');
      expect(assumed).toBeDefined();
      // Naming the assumption is not enough — a borrower can only correct a
      // figure they can see.
      expect(assumed).toContain('₹');
    }
  });
});

describe('an unknown score sits strictly between the two known cases', () => {
  it('never matches either end, and never beats the good end', () => {
    for (const a of all) {
      const unknown = compute({ ...a, creditScore: { known: false, everBorrowed: true } });
      const good = compute({ ...a, creditScore: { known: true, score: 780 } });
      const poor = compute({ ...a, creditScore: { known: true, score: 650 } });
      if (!unknown.pricing || !good.pricing || !poor.pricing) continue;

      // Not knowing can never earn a better rate than a good score would.
      expect(unknown.pricing.rateBand.hi).toBeGreaterThanOrEqual(good.pricing.rateBand.hi - 1e-9);
      // And it is never treated as though the score were the poor end.
      expect(unknown.pricing.rateBand.lo).toBeLessThanOrEqual(poor.pricing.rateBand.lo + 1e-9);
      // The band spans both cases rather than collapsing to an average. It can
      // equal the good case's width rather than exceed it, but only when the
      // premium has already pushed the band against the top of the product's
      // range and both saturate there.
      expect(width(unknown.pricing.rateBand)).toBeGreaterThanOrEqual(
        width(good.pricing.rateBand) - 1e-9,
      );
    }
  });
});

describe('the bad turn is always at least as bad as today', () => {
  it('never reports a stressed outgo below the current one', () => {
    for (const a of all) {
      const r = compute(a);
      if (!r.repayment) continue;
      expect(r.repayment.outflowRatioStressed.hi).toBeGreaterThanOrEqual(
        r.repayment.outflowRatioNow.hi - 1e-9,
      );
    }
  });
});

describe('nothing ever produces a broken number', () => {
  it('keeps every reported range finite and the right way round', () => {
    for (const a of all) {
      const r = compute(a);
      const ranges = [r.amounts.safe, r.amounts.lender, r.surplus];
      if (r.pricing) ranges.push(r.pricing.rateBand, r.pricing.aprBand, r.pricing.feeBand);
      if (r.repayment) ranges.push(r.repayment.emiCeiling, r.repayment.totalInterest);
      for (const range of ranges) {
        expect(Number.isFinite(range.lo)).toBe(true);
        expect(Number.isFinite(range.hi)).toBe(true);
        expect(range.lo).toBeLessThanOrEqual(range.hi);
      }
      expect(r.amounts.safe.lo).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the safe amount below the lender amount for a salaried borrower', () => {
    // Scoped to salaried on purpose. There the lender recognises the whole
    // income, so their looser ceiling always wins and the safe number is the
    // smaller of the two — the case the product is built to show.
    //
    // It does NOT hold in general, and that is not a bug: where income cannot be
    // evidenced, a lender recognises only part of what the borrower actually
    // earns, so someone with little rent can genuinely afford more than a lender
    // will advance. That gap is Ravi's whole situation and is worth surfacing,
    // not asserting away.
    for (const a of all) {
      if (a.incomeType !== 'salaried') continue;
      const r = compute(a);
      expect(r.amounts.safe.hi).toBeLessThanOrEqual(r.amounts.lender.hi + 1e-6);
    }
  });

  it('reports a safe amount above the lender amount only when income is unprovable', () => {
    for (const a of all) {
      const r = compute(a);
      if (r.amounts.safe.hi <= r.amounts.lender.hi + 1e-6) continue;
      // The only legitimate reason to be able to afford more than you can borrow.
      expect(r.income!.unprovable.hi).toBeGreaterThan(0);
    }
  });

  it('sets safe carry to zero on a do-not-borrow verdict', () => {
    // The two would contradict each other on the same screen, and a borrower
    // would believe the number over the sentence.
    for (const a of all) {
      const r = compute(a);
      if (r.verdict.kind !== 'dont') continue;
      expect(r.amounts.safe.hi).toBe(0);
    }
  });

  it('still reports the lender-likely amount on a do-not-borrow verdict', () => {
    // Knowing somebody will still lend it to you is the point, not a detail.
    // It is also what the next app loan is counting on you not knowing.
    for (const a of all) {
      const r = compute(a);
      if (r.verdict.kind !== 'dont') continue;
      expect(r.amounts.lender.hi).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.amounts.lender.hi)).toBe(true);
    }
  });

  it('keeps the affordability arithmetic alive behind a withheld amount', () => {
    // The path-to-yes toggles need a number to move. Discarding it at compute
    // time would leave them nothing to work with.
    for (const a of all) {
      const r = compute(a);
      expect(r.amounts.safeOnAffordabilityAlone.hi).toBeGreaterThanOrEqual(r.amounts.safe.hi);
    }
  });

  it('raises assumed household spending as the household grows', () => {
    const base: Answers = {
      amountAsked: 200000,
      incomeType: 'salaried',
      monthlyIncome: { lo: 40000, hi: 40000 },
      existingEmis: 0,
      rentOrHomeEmi: 5000,
      age: 35,
      creditScore: { known: true, score: 750 },
    };
    const alone = compute({ ...base, householdSize: 1 });
    const family = compute({ ...base, householdSize: 5 });
    expect(family.surplus.hi).toBeLessThan(alone.surplus.hi);
    expect(family.amounts.safe.hi).toBeLessThanOrEqual(alone.amounts.safe.hi);
  });

  it('pins each verdict to the numbers it claims', () => {
    // The thresholds are only meaningful if the amounts actually respect them.
    for (const a of all) {
      const r = compute(a);
      const asked = r.amounts.asked;
      if (asked === undefined || asked <= 0) continue;

      if (r.verdict.kind === 'borrow-less') {
        expect(r.amounts.safe.hi, 'borrow less must mean less').toBeLessThan(asked);
      }
      if (r.verdict.kind === 'borrow') {
        expect(
          r.amounts.safe.hi,
          'borrow must mean most of what was asked for',
        ).toBeGreaterThanOrEqual(asked * 0.8 - 1e-6);
      }
    }
  });

  it('is deterministic', () => {
    for (const a of all) {
      expect(compute(a).amounts.safe).toEqual(compute(a).amounts.safe);
    }
  });
});
