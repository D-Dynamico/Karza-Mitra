import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { money, moneyRange, perMonth, rate } from '../engine/format';
import { iv } from '../engine/interval';
import { nothingUnlocksIt, pathToYes, smallestUnlockingCombination } from '../engine/path-to-yes';
import { anita, priya } from '../engine/personas';
import { products } from '../engine/rules/products';
import { STRESS_CEILING_CAP, stressedCeilingFor } from '../engine/rules/affordability';

/**
 * The ways this engine could quietly mislead somebody, each pinned by a test.
 *
 * Every one of these started as a real defect found by reading an output rather
 * than by a failing assertion, which is why they are gathered here rather than
 * scattered: they are a list of the mistakes this product is most likely to make
 * again.
 */

describe('bad news widens the answer, it never sharpens it', () => {
  it('does not narrow the rate band when a payment has bounced', () => {
    // The bug this catches: clamping the top of the band at the product's
    // ceiling meant a bounce pushed the range against the cap and it collapsed,
    // so the engine looked *more* confident about a borrower it knew was riskier.
    const clean: Answers = { ...anita.answers, bouncedInLast6Months: false };
    const bounced: Answers = { ...anita.answers, bouncedInLast6Months: true };

    const a = compute(clean).pricing!.rateBand;
    const b = compute(bounced).pricing!.rateBand;

    expect(b.hi).toBeGreaterThan(a.hi);
    expect(b.hi - b.lo).toBeGreaterThanOrEqual(a.hi - a.lo - 1e-9);
  });

  it('lets an adverse file be priced above the product band, because lenders do', () => {
    const r = compute(anita.answers);
    expect(r.pricing!.rateBand.hi).toBeGreaterThan(products.value['nbfc-vehicle-loan'].rateBand.hi);
  });
});

describe('the product quoted is one the borrower could actually get', () => {
  it('does not quote a bank two-wheeler rate to someone a bank will not lend to', () => {
    const r = compute(anita.answers);
    expect(r.routing!.product.id).toBe('nbfc-vehicle-loan');
    // A bank rate would be somewhere near 9-14%. Hers must be far above it.
    expect(r.pricing!.rateBand.lo).toBeGreaterThan(15);
  });

  it('still shows her the bank rate as the thing to aim at', () => {
    const r = compute(anita.answers);
    expect(r.routing!.alternative!.product.id).toBe('vehicle-loan');
    expect(r.routing!.alternative!.why).toContain('bank');
  });

  it('does quote the bank rate to a salaried borrower buying the same vehicle', () => {
    const salaried: Answers = {
      ...anita.answers,
      incomeType: 'salaried',
      bouncedInLast6Months: false,
      creditScore: { known: true, score: 760 },
    };
    expect(compute(salaried).routing!.product.id).toBe('vehicle-loan');
  });
});

describe('a loan too small to exist is not a smaller loan', () => {
  it('refuses rather than offering an amount below the product minimum', () => {
    const barely: Answers = {
      purpose: 'vehicle',
      amountAsked: 150000,
      incomeType: 'salaried',
      monthlyIncome: { lo: 31500, hi: 31500 },
      existingEmis: 0,
      rentOrHomeEmi: 10000,
      householdExpenses: 18000,
      age: 30,
      creditScore: { known: true, score: 750 },
      emergencySavingsMonths: 0,
    };
    const r = compute(barely);
    // She can afford something — but far less than anyone writes a loan for.
    expect(r.amounts.safeOnAffordabilityAlone.hi).toBeGreaterThan(0);
    expect(r.amounts.safeOnAffordabilityAlone.hi).toBeLessThan(r.routing!.product.minTicket);
    expect(r.verdict.kind).toBe('dont');
    expect(r.verdict.headline.toLowerCase()).toContain('any amount');
    expect(r.verdict.why).toContain('no lender writes');
  });

  it('gives every product a minimum ticket with a reason', () => {
    for (const p of Object.values(products.value)) {
      expect(p.minTicket, `${p.id} has no minimum`).toBeGreaterThan(0);
      expect(p.why.length).toBeGreaterThan(30);
    }
  });

  it('never reports borrow-less with an amount no lender would write', () => {
    const r = compute(anita.answers);
    if (r.verdict.kind === 'borrow-less') {
      expect(r.amounts.safe.hi).toBeGreaterThanOrEqual(r.routing!.product.minTicket);
    }
  });
});

describe('what the loan would earn counts for the borrower, never for the lender', () => {
  const withEarnings: Answers = { ...anita.answers, expectedMonthlyEarnings: 12000 };
  const without: Answers = { ...anita.answers, expectedMonthlyEarnings: undefined };

  it('raises what the borrower can plan on', () => {
    expect(compute(withEarnings).income!.planning.hi).toBeGreaterThan(
      compute(without).income!.planning.hi,
    );
  });

  it('leaves the lender number completely untouched', () => {
    // No bank underwrites income that does not exist yet.
    expect(compute(withEarnings).amounts.lender).toEqual(compute(without).amounts.lender);
  });

  it('counts only part of it, because a projection is not a payslip', () => {
    const gain =
      compute(withEarnings).income!.planning.hi - compute(without).income!.planning.hi;
    expect(gain).toBeLessThan(12000);
    expect(gain).toBeGreaterThan(0);
  });
});

describe('the stress case does not lean on money that has not arrived', () => {
  const withEarnings: Answers = { ...anita.answers, expectedMonthlyEarnings: 12000 };
  const without: Answers = { ...anita.answers, expectedMonthlyEarnings: undefined };

  it('strips the productive uplift out of the stressed income entirely', () => {
    // The bad turn being modelled largely *is* the scooter failing to double
    // her runs. A stress test propped up by the thing under test is no test.
    const stressed = (a: Answers): number => {
      const e = compute(a).trace.find((t) => t.rule === 'stress.income');
      return (e!.output as { hi: number }).hi;
    };
    expect(stressed(withEarnings)).toBeCloseTo(stressed(without), 6);
  });

  it('still counts the uplift in the everyday budget', () => {
    expect(compute(withEarnings).income!.planning.hi).toBeGreaterThan(
      compute(without).income!.planning.hi,
    );
  });

  it('reports the uplift separately so it can be stripped out', () => {
    expect(compute(withEarnings).income!.productiveUplift.hi).toBeGreaterThan(0);
    expect(compute(without).income!.productiveUplift.hi).toBe(0);
  });
});

describe('savings decide how much of a shock you can take', () => {
  it('never lets a declared fortune push the ceiling past the cap', () => {
    const huge = compute({ ...priya.answers, emergencySavingsMonths: 600 });
    const plenty = compute({ ...priya.answers, emergencySavingsMonths: 6 });
    expect(stressedCeilingFor(600).hi).toBe(STRESS_CEILING_CAP);
    expect(huge.amounts.safe.hi).toBeCloseTo(plenty.amounts.safe.hi, 0);
  });

  it('allows a larger instalment to someone with money put by', () => {
    const none = compute({ ...priya.answers, emergencySavingsMonths: 0 });
    const plenty = compute({ ...priya.answers, emergencySavingsMonths: 12 });
    expect(plenty.amounts.safe.hi).toBeGreaterThan(none.amounts.safe.hi);
  });

  it('treats an unanswered savings question as having none', () => {
    const blank = { ...priya.answers };
    delete blank.emergencySavingsMonths;
    const none = compute({ ...priya.answers, emergencySavingsMonths: 0 });
    expect(compute(blank).amounts.safe.hi).toBeCloseTo(none.amounts.safe.hi, 0);
  });
});

describe('the way out is shown, and only if it is real', () => {
  it('finds no single change that gets Anita to a yes', () => {
    expect(nothingUnlocksIt(pathToYes(anita.answers))).toBe(true);
  });

  it('finds the combination that does, rather than leaving her with nothing', () => {
    const combo = smallestUnlockingCombination(anita.answers);
    expect(combo).toBeDefined();
    expect(combo!.options.length).toBeLessThanOrEqual(3);
    const ids = combo!.options.map((o) => o.id);
    expect(ids).toContain('clear-app-loans');
  });

  it('says how to close the gap when the unlocked amount is still short', () => {
    // "Borrow less, ₹1 lakh" against a ₹1.5 lakh scooter reads as "still not
    // enough" unless the last fifty thousand is accounted for.
    const combo = smallestUnlockingCombination(anita.answers)!;
    if (combo.stillShortBy > 0) {
      expect(combo.waysToCloseTheGap.length).toBeGreaterThan(0);
      expect(combo.waysToCloseTheGap.join(' ')).toMatch(/subsidy|down|used|up front/i);
    }
  });

  it('stays bounded however many options apply', () => {
    // A phone should not be asked to walk 2^n combinations.
    const start = Date.now();
    smallestUnlockingCombination(anita.answers);
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it('offers nothing to a borrower who does not need a way out', () => {
    // Priya can already borrow; a list of things to fix would be noise.
    const opts = pathToYes(priya.answers);
    expect(opts.every((o) => o.unlocks)).toBe(true);
  });
});

describe('numbers are shown as honestly as they are known', () => {
  it('rounds outward so a displayed range always contains the real one', () => {
    expect(money(iv(10314, 142500))).not.toContain('10,314');
    expect(money(iv(10314, 142500))).not.toContain('42,500');
  });

  it('describes a lender range in words when the bottom is effectively nothing', () => {
    const text = moneyRange(iv(6830, 114264), { asLender: true });
    expect(text.bottomIsNothing).toBe(true);
    expect(text.text).toContain('close to nothing at a bank');
    expect(text.text).toContain('NBFC');
  });

  it('quotes rates in the half points lenders actually use', () => {
    expect(rate(iv(22.03, 28.47))).toBe('22% to 28.5%');
    expect(rate(iv(10.5, 11.5))).toBe('10.5% to 11.5%');
  });

  it('rounds an instalment up, so nobody plans against too small a figure', () => {
    expect(perMonth(iv(23150, 23150))).toContain('23,200');
  });

  it('speaks in lakh for anything a borrower would call a lakh', () => {
    expect(money(iv(1500000, 1500000))).toBe('₹15 lakh');
    expect(money(iv(88897, 88897))).toContain('₹');
  });
});
