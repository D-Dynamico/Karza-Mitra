/**
 * Guards on the sentences, not on the numbers.
 *
 * Nine defects in this project have had the same shape: the engine's number was
 * right and the screen said something false about it. The rent clause fired for
 * a borrower paying no rent. "A lender will likely say yes to the full amount"
 * ran against a lender figure less than half the ask. Two different rate bands
 * appeared on one screen, both labelled "Rate". None was caught by testing the
 * engine harder, because the arithmetic was never wrong.
 *
 * The copy layer is therefore the untested module, and it does not need a
 * browser to test. Every user-facing sentence here is generated from the trace
 * by pure functions, so each template's guard can be asserted directly: run the
 * grid of borrowers, and for every one, check that a sentence only appears when
 * the condition it claims is actually true.
 *
 * These are guards, not golden strings. They assert the relationship between a
 * claim and the numbers behind it, so rewording the copy does not break them —
 * only breaking the link does.
 */

import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute, type Result } from '../engine/compute';
import { rupees } from '../engine/format';
import { pathToYes } from '../engine/path-to-yes';
import { anita, priya, ravi } from '../engine/personas';

/**
 * The same fixed grid the property tests use, widened at the housing end. Rent
 * of exactly zero is the case that produced two of the nine, so it is in here
 * deliberately rather than by luck.
 */
function* borrowers(): Generator<Answers> {
  const incomes = [12000, 28000, 45000, 90000, 150000, 220000];
  const rents = [0, 8000, 25000];
  const emis = [0, 5000, 20000];
  const types = ['salaried', 'self-employed-itr', 'informal'] as const;
  const purposes = ['wedding', 'business-stock', 'vehicle', 'education'] as const;
  const asks = [500000, 7500000];

  let i = 0;
  for (const income of incomes) {
    for (const rent of rents) {
      for (const emi of emis) {
        for (const asked of asks) {
          i += 1;
          yield {
            purpose: purposes[i % purposes.length],
            amountAsked: asked,
            incomeType: types[i % types.length],
            monthlyIncome: { lo: income, hi: income },
            existingEmis: emi,
            rent,
            householdExpenses: Math.round(income * 0.3),
            age: i % 5 === 0 ? 59 : 35,
            householdSize: 3,
            cityTier: 'metro',
            // Every fifth borrower pledges property, which is what puts the
            // collateral cap and the retirement overrun into the grid at all.
            ...(i % 5 === 0 ? { ownsProperty: true, propertyValue: 6000000 } : {}),
          };
        }
      }
    }
  }
}

const grid: { answers: Answers; result: Result }[] = [...borrowers()].map((answers) => ({
  answers,
  result: compute(answers),
}));

const personaGrid = [priya, ravi, anita].map((p) => ({
  answers: p.answers,
  result: compute(p.answers),
}));

const everyone = [...grid, ...personaGrid];

/** Every sentence a borrower actually reads, for one result. */
const sentences = (r: Result): string[] =>
  [r.verdict.headline, r.verdict.why, r.verdict.nextStep ?? '', ...r.assumptions].filter(
    (s) => s.length > 0,
  );

const describeCase = (a: Answers): string =>
  `income ${a.monthlyIncome?.lo} rent ${a.rent} emi ${a.existingEmis} asked ${a.amountAsked} age ${a.age}`;

describe('a sentence only appears when what it claims is true', () => {
  it('never blames rent for a borrower who pays none', () => {
    // The original: "because your rent counts against you even though lenders
    // leave it out", printed verbatim to a borrower with rent of ₹0.
    for (const { answers, result } of everyone) {
      if ((answers.rent ?? 1) !== 0) continue;
      for (const s of sentences(result)) {
        expect(s, `rent blamed at rent=0 — ${describeCase(answers)}`).not.toMatch(/your rent/i);
      }
    }
  });

  it('never promises a full sanction the lender ceiling does not reach', () => {
    // The original: "A lender will likely say yes to the full amount", against
    // a ₹75L ask and a ₹30–42L lender figure.
    for (const { answers, result } of everyone) {
      const asked = answers.amountAsked ?? 0;
      if (asked <= 0 || result.amounts.lender.hi >= asked) continue;
      for (const s of sentences(result)) {
        expect(s, `full sanction promised — ${describeCase(answers)}`).not.toMatch(
          /say yes to the full amount/i,
        );
      }
    }
  });

  it('never claims a wait changes the answer without the answer changing', () => {
    for (const { answers, result } of everyone) {
      const claims = sentences(result).some((s) => /alone changes this answer/i.test(s));
      if (!claims) continue;
      const cleared = compute({ ...answers, existingEmis: 0, existingEmiMonthsLeft: 0 });
      expect(cleared.verdict.kind, `wait claimed but verdict held — ${describeCase(answers)}`).not.toBe(
        result.verdict.kind,
      );
    }
  });

  it('never names an order of loans to clear without knowing one', () => {
    // The engine holds one instalment total, so it cannot rank loans by cost.
    // "Clear the app loans first" is a claim about a category and is allowed;
    // "clear the dearest loan first" is a claim about this borrower's loans.
    for (const { answers, result } of everyone) {
      for (const s of sentences(result)) {
        expect(s, `ranking claimed — ${describeCase(answers)}`).not.toMatch(/dearest loan/i);
      }
    }
  });

  it('never blames income where the pledged asset is what caps both numbers', () => {
    for (const { answers, result } of everyone) {
      const cap = result.routing?.securedCap;
      if (!cap) continue;
      const capBinds = cap.hi <= result.amounts.lender.hi && cap.hi <= result.amounts.safe.hi;
      if (!capBinds || result.verdict.kind !== 'borrow-less') continue;
      expect(result.verdict.why, `income blamed under a collateral cap — ${describeCase(answers)}`)
        .toMatch(/pledge|asset|property/i);
    }
  });
});

describe('a sentence appears when the thing it explains is present', () => {
  it('says something about the bad month whenever the stress case is what binds', () => {
    // Only where an amount was actually quoted. On a "don't" the reason is a
    // louder one that fired first — a bounce, or half the income already
    // committed — and burying that under the stress case would be the wrong
    // sentence, not a missing one.
    for (const { answers, result } of everyone) {
      if (result.repayment?.stressBreaches !== true) continue;
      if (result.verdict.kind !== 'borrow' && result.verdict.kind !== 'borrow-less') continue;
      const said = sentences(result).some((s) => /bad month|bad turn|after a bad/i.test(s));
      expect(said, `stress breached but never mentioned — ${describeCase(answers)}`).toBe(true);
    }
  });

  it('discloses the overrun whenever the term runs past the retirement age', () => {
    for (const { answers, result } of everyone) {
      if (answers.age === undefined || result.pricing === undefined) continue;
      const monthsLeftOfWork = Math.max(12, (60 - answers.age) * 12);
      if (result.pricing.tenureMonths <= monthsLeftOfWork) continue;
      const said = result.assumptions.some((s) => /retirement|stop working/i.test(s));
      expect(said, `term runs past 60 in silence — ${describeCase(answers)}`).toBe(true);
    }
  });

  it('prints the figure behind any what-if that supplies one', () => {
    // A what-if resting on a number the borrower never gave has to show it, or
    // the borrower reads our assumption as their situation.
    for (const { answers } of everyone) {
      for (const r of pathToYes(answers)) {
        if (r.option.assumesAnInput !== true) continue;
        expect(
          `${r.option.label} ${r.option.assumes ?? ''}`,
          `${r.option.id} hides the number it assumes`,
        ).toMatch(/₹[\d,]+|nobody|no one/i);
      }
    }
  });
});

describe('precision never leaks into a sentence', () => {
  it('never prints a computed amount to the rupee', () => {
    // `format.ts` rounds outward for display precisely because "₹29,52,538" is
    // a lie of precision about a figure resting on an assumed rent. Nothing in
    // the copy interpolates a raw endpoint today; this fails the moment one does.
    for (const { answers, result } of everyone) {
      const computed = [
        result.amounts.safe.lo,
        result.amounts.safe.hi,
        result.amounts.lender.lo,
        result.amounts.lender.hi,
      ].filter((n) => n > 0 && Math.round(n) % 100 !== 0);

      for (const s of sentences(result)) {
        for (const n of computed) {
          expect(s, `raw endpoint in copy — ${describeCase(answers)}`).not.toContain(rupees(n));
        }
      }
    }
  });
});

describe('the grid is wide enough to be worth running', () => {
  it('covers the states these guards are about', () => {
    expect(everyone.length).toBeGreaterThan(100);
    expect(everyone.some((c) => (c.answers.rent ?? 1) === 0)).toBe(true);
    expect(everyone.some((c) => c.result.verdict.kind === 'dont')).toBe(true);
    expect(everyone.some((c) => c.result.verdict.kind === 'borrow-less')).toBe(true);
    expect(everyone.some((c) => c.result.verdict.kind === 'borrow')).toBe(true);
    expect(everyone.some((c) => c.result.routing?.securedCap !== undefined)).toBe(true);
  });
});
