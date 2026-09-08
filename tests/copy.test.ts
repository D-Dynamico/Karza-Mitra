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
import { negotiationCard } from '../engine/card';
import { compute, type Result } from '../engine/compute';
import { rupees } from '../engine/format';
import { nextQuestions } from '../engine/next-questions';
import { OUTPUT_LABELS } from '../engine/outputs';
import { pathToYes } from '../engine/path-to-yes';
import { allQuestions } from '../engine/questions';
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
    // a ₹75L ask and a ₹30–42L lender figure. The sentence now reads "will
    // likely approve the full ₹X"; the guard tracks the claim, not the draft.
    for (const { answers, result } of everyone) {
      const asked = answers.amountAsked ?? 0;
      if (asked <= 0 || result.amounts.lender.hi >= asked) continue;
      for (const s of sentences(result)) {
        expect(s, `full approval promised — ${describeCase(answers)}`).not.toMatch(
          /(say yes to|approve) the full/i,
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

/**
 * Everything a borrower reads, wherever it is generated: the verdict block, the
 * assumptions, and every row of the Negotiation Card. The card is included
 * because it is the page that leaves the building.
 */
const everySentence = (r: Result): string[] => {
  const card = negotiationCard(r);
  return [
    ...sentences(r),
    card.title,
    card.ask,
    card.walkAway ?? '',
    ...card.rows.flatMap((row) => [row.label, row.value, row.note]),
    ...card.redLines,
    // The routing prose is the heaviest reading on the answer screen and sits
    // on the surface rather than in a drawer, so it is held to the same bar.
    r.routing?.why ?? '',
    r.routing?.alternative?.why ?? '',
  ].filter((s) => s.length > 0);
};

/**
 * The vocabulary guard.
 *
 * The defect these catch is not a wrong number. It is a right number described
 * in a register the borrower does not read in: "without the plan getting
 * fragile", "two rulebooks", "several points more", "sanction". Each of those
 * shipped, and none of the tests above could see it, because every one of them
 * was arithmetically true.
 *
 * A word goes on this list when there is a plainer word that means the same
 * thing to the person reading it — not because it is long. `replacement` is
 * what the failure tells you to use, so the fix is obvious from the message.
 */
const BANNED: ReadonlyArray<{ word: RegExp; replacement: string }> = [
  { word: /\binstal?ments?\b/i, replacement: 'EMI' },
  { word: /\bsanction(ed|s|ing)?\b/i, replacement: 'approve, or give' },
  { word: /\brulebooks?\b/i, replacement: 'say the thing itself' },
  { word: /\bfragile\b/i, replacement: 'say what actually breaks' },
  { word: /\b(\d+|several|a few) points?\b/i, replacement: 'a rupee figure over the term' },
  { word: /\bbands?\b/i, replacement: 'rate, or range' },
  { word: /\bun(secured|pledged)\b/i, replacement: 'with nothing behind it' },
  { word: /\blevers?\b/i, replacement: 'name the thing itself' },
  { word: /\bceilings?\b/i, replacement: 'limit, or the most you should pay' },
  { word: /\bdearer\b/i, replacement: 'costlier, or "costs more"' },
  { word: /\bvintage\b/i, replacement: 'how long you have been running it' },
  { word: /\bunpledged\b/i, replacement: 'with no loan against it' },
  { word: /\bFOIR\b/i, replacement: 'the share of income they allow' },
  { word: /\boutflow\b/i, replacement: 'what goes out each month' },
  { word: /\bunderwrit(e|ten|ing)\b/i, replacement: 'what the lender decides on' },
  { word: /\bevidenced\b/i, replacement: 'shown on paper' },
];

describe('the borrower is written to in her own words', () => {
  it('uses no term that has a plainer equivalent', () => {
    for (const { answers, result } of everyone) {
      for (const s of everySentence(result)) {
        for (const { word, replacement } of BANNED) {
          expect(
            s,
            `"${s}" — say ${replacement} instead. ${describeCase(answers)}`,
          ).not.toMatch(word);
        }
      }
    }
  });

  it('uses no such term in the questions, the labels or the promises', () => {
    // The jargon does not only live in the verdict. "Sharpens what a lender
    // will sanction, what you can safely carry, your rate band" was printed
    // under every amount on the answer screen, built from `OUTPUT_LABELS`.
    const registry = allQuestions.flatMap((q) => [
      q.prompt,
      q.whyWeAsk,
      q.skipCost,
      q.hint ?? '',
      q.promptFor?.({ purpose: 'vehicle' }) ?? '',
      ...(q.input.kind === 'choice' ? q.input.options.map((o) => o.label) : []),
      ...(q.input.kind === 'money-optional' ? [q.input.noLabel, q.input.yesLabel] : []),
    ]);
    const promises = everyone.flatMap(({ answers }) =>
      nextQuestions(answers, 10).map((r) => r.promise),
    );
    // The what-if list is the whole of the "don't borrow" screen below the
    // reason, so it is read as closely as the verdict is.
    const whatIfs = everyone.flatMap(({ answers }) =>
      pathToYes(answers).flatMap((r) => [r.option.label, r.option.assumes ?? '']),
    );
    for (const s of [...registry, ...Object.values(OUTPUT_LABELS), ...promises, ...whatIfs]) {
      if (s.length === 0) continue;
      for (const { word, replacement } of BANNED) {
        expect(s, `"${s}" — say ${replacement} instead`).not.toMatch(word);
      }
    }
  });

  it('states a term in years once it runs past two of them', () => {
    // "60 months" is a spreadsheet's way of writing five years, and a borrower
    // comparing two offers at a counter is thinking in years.
    for (const { answers, result } of everyone) {
      for (const s of everySentence(result)) {
        const months = [...s.matchAll(/(\d+)\s+months\b/g)].map((m) => Number(m[1]));
        for (const n of months) {
          expect(n, `"${s}" gives a term in months — ${describeCase(answers)}`).toBeLessThan(24);
        }
      }
    }
  });

  it('never prints a range whose two ends are the same figure', () => {
    // "₹7,500 to ₹7,600 a month" invites the reader to work out what separates
    // the ends. Nothing does. `format.ts` collapses these to one "about" figure.
    for (const { answers, result } of everyone) {
      for (const s of everySentence(result)) {
        for (const m of s.matchAll(/₹([\d,.]+)( lakh)? to ₹([\d,.]+)( lakh)?/g)) {
          // "₹99,000 to ₹1.5 lakh" mixes units, so each end carries its own.
          const scale = (digits: string, lakh: string | undefined): number =>
            Number(digits.replace(/,/g, '')) * (lakh === undefined ? 1 : 100000);
          const lo = scale(m[1]!, m[2]);
          const hi = scale(m[3]!, m[4]);
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= 0) continue;
          expect(
            (hi - lo) / hi,
            `"${s}" prints a range that is not one — ${describeCase(answers)}`,
          ).toBeGreaterThanOrEqual(0.05);
        }
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
