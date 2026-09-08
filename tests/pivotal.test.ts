/**
 * Assumptions that decide the answer.
 *
 * The engine fills gaps with intervals. Most only widen the range. A few
 * change what the borrower is told to do, and the difference between those two
 * cases is not something a reader can see by looking at the numbers — so the
 * engine works it out and the screen asks about it first.
 */

import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { anita, priya, ravi } from '../engine/personas';
import { pivotalAssumptions, testedAssumptions } from '../engine/pivotal';
import { allQuestions } from '../engine/questions';

describe('an assumption is pivotal when its two ends disagree', () => {
  it("finds Ravi's rent, because it decides whether he should borrow", () => {
    const pivotal = pivotalAssumptions(ravi.answers);
    expect(pivotal.map((p) => p.field)).toContain('rent');

    const rent = pivotal.find((p) => p.field === 'rent')!;
    expect(rent.atLow.verdict).toBe('borrow');
    expect(rent.atHigh.verdict).toBe('borrow-less');
    expect(rent.flipsVerdict).toBe(true);
  });

  it("does not flag Anita's rent, because she is told the same thing either way", () => {
    // Hers is assumed across a wider band than his, and it matters less. Width
    // is not the test; whether the answer changes is.
    const tested = testedAssumptions(anita.answers);
    const rent = tested.find((p) => p.field === 'rent');
    expect(rent, 'her rent should still be tested').toBeDefined();
    expect(rent!.range.hi - rent!.range.lo).toBeGreaterThan(0);
    expect(rent!.atLow.verdict).toBe('dont');
    expect(rent!.atHigh.verdict).toBe('dont');
    expect(pivotalAssumptions(anita.answers)).toHaveLength(0);
  });

  it('flags nothing for a borrower who answered everything that matters', () => {
    expect(pivotalAssumptions(priya.answers)).toHaveLength(0);
  });

  it('goes quiet once the question is actually answered', () => {
    for (const rent of [0, 7000]) {
      const answered: Answers = { ...ravi.answers, rent: rent };
      expect(pivotalAssumptions(answered), `rent ${rent}`).toHaveLength(0);
    }
  });

  it('names a field the flow can actually ask about', () => {
    // The screen turns this into a question, so there has to be one.
    for (const p of pivotalAssumptions(ravi.answers)) {
      expect(allQuestions.some((q) => q.field === p.field), String(p.field)).toBe(true);
    }
  });

  it('reports the range it actually tested, and both ends of it', () => {
    const rent = pivotalAssumptions(ravi.answers).find((p) => p.field === 'rent')!;
    expect(rent.range.lo).toBe(0);
    expect(rent.range.hi).toBeGreaterThan(0);
    expect(rent.atLow.value).toBe(rent.range.lo);
    expect(rent.atHigh.value).toBe(rent.range.hi);
    // Paying more rent cannot let you carry more.
    expect(rent.atHigh.safe.hi).toBeLessThan(rent.atLow.safe.hi);
  });
});

describe('owning property is evidence about rent, not proof of it', () => {
  it('puts zero at the likely end rather than asserting it', () => {
    const r = compute(ravi.answers);
    const entry = r.trace.find((e) => e.rule === 'rent.owns-premises')!;
    expect(entry).toBeDefined();
    const band = entry.output as { lo: number; hi: number };
    expect(band.lo).toBe(0);
    expect(band.hi).toBeGreaterThan(0);
    expect(entry.assumed).toBe(true);
    expect(entry.field).toBe('rent');
  });

  it('never resolves an unknown in the borrower\'s favour', () => {
    // The rule this restores. A borrower who says nothing must never end up
    // better off than the same borrower who says the favourable thing.
    const silent = compute(ravi.answers);
    const saysNoRent = compute({ ...ravi.answers, rent: 0 });
    expect(silent.amounts.safe.lo).toBeLessThanOrEqual(saysNoRent.amounts.safe.lo);
    expect(silent.amounts.safe.hi).toBeLessThanOrEqual(saysNoRent.amounts.safe.hi);
  });

  it('still knows that owning property means less rent than renting', () => {
    // The domain knowledge that a flat city range would have thrown away.
    const owner = compute(ravi.answers);
    const renter = compute({ ...ravi.answers, ownsProperty: false, propertyValue: undefined });
    const ownerRent = owner.trace.find((e) => e.rule === 'rent.owns-premises')!
      .output as { lo: number; hi: number };
    const renterRent = renter.trace.find((e) => e.rule === 'rent.assumed-by-city')!
      .output as { lo: number; hi: number };
    expect(ownerRent.lo).toBeLessThan(renterRent.lo);
    expect(ownerRent.hi).toBeLessThan(renterRent.hi);
  });

  it('leaves the product alone at every rent level', () => {
    // What the brief tests with Ravi is routing. Rent moves the amount, and it
    // must not move the answer to "which loan".
    for (const rent of [0, 5000, 10000, 15000, 25000]) {
      const r = compute({ ...ravi.answers, rent: rent });
      expect(r.routing?.product.id, `rent ${rent}`).toBe('loan-against-property');
    }
  });
});
