/**
 * The flow's own ordering logic, tested without a browser.
 *
 * `ui/Flow.tsx` decides what to ask next: the must set in order, then whatever
 * `nextQuestions` ranks highest, skipping anything already declined. That logic
 * is small but it is the spine of the whole screen, and two things about it can
 * go wrong silently — it can loop forever, offering a question that never gets
 * recorded; and it can arrive somewhere different from the verdict you get by
 * handing the engine every answer at once.
 *
 * The second is the one that matters. If walking the questions produces a
 * different answer from the same facts entered together, the flow is not a way
 * of collecting answers, it is a way of changing them.
 */

import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { nextQuestions } from '../engine/next-questions';
import { personas } from '../engine/personas';
import { allQuestions, mustSet, type Question } from '../engine/questions';

/** Exactly the selection `ui/Flow.tsx` performs, kept in step by hand. */
function nextToAsk(answers: Answers, skipped: ReadonlySet<string>): Question | undefined {
  const pendingMust = mustSet.find(
    (q) => answers[q.field] === undefined && !skipped.has(q.id) && q.applies(answers),
  );
  if (pendingMust) return pendingMust;
  return nextQuestions(answers, 10).find((r) => !skipped.has(r.question.id))?.question;
}

/** Walk the flow as the borrower would, answering from their known facts. */
function walk(full: Answers): { answers: Answers; steps: number; asked: string[] } {
  let answers: Answers = {};
  const skipped = new Set<string>();
  const asked: string[] = [];

  for (let step = 0; step < 200; step += 1) {
    const q = nextToAsk(answers, skipped);
    if (!q) return { answers, steps: step, asked };
    asked.push(q.id);
    const value = full[q.field];
    if (value === undefined) {
      // The borrower has nothing to say to this one, so they skip it. That is a
      // real outcome: the engine assumes and says so.
      skipped.add(q.id);
    } else {
      answers = { ...answers, [q.field]: value };
    }
  }
  throw new Error('the flow did not terminate within 200 questions');
}

describe('walking the questions gets to the same place as answering them all at once', () => {
  for (const persona of personas) {
    it(`${persona.id} reaches the same verdict either way`, () => {
      const walked = walk(persona.answers);
      const atOnce = compute(persona.answers);
      const stepByStep = compute(walked.answers);

      expect(stepByStep.verdict.kind, persona.id).toBe(atOnce.verdict.kind);
    });

    it(`${persona.id} is routed to the same product either way`, () => {
      const walked = walk(persona.answers);
      expect(compute(walked.answers).routing?.product.id).toBe(
        compute(persona.answers).routing?.product.id,
      );
    });

    it(`${persona.id}'s flow terminates and never repeats a question`, () => {
      const { asked, steps } = walk(persona.answers);
      expect(steps).toBeGreaterThan(0);
      expect(new Set(asked).size, `repeated: ${asked.join(', ')}`).toBe(asked.length);
    });
  }

  it('asks the must set before anything optional', () => {
    const { asked } = walk(personas[0]!.answers);
    const mustIds = new Set(mustSet.map((q) => q.id));
    const lastMust = asked.reduce((last, id, i) => (mustIds.has(id) ? i : last), -1);
    const firstOptional = asked.findIndex((id) => !mustIds.has(id));
    if (firstOptional !== -1) expect(firstOptional).toBeGreaterThan(lastMust);
  });

  it('answers something for a borrower who skips every single question', () => {
    // The engine widens rather than refusing. It must still produce a verdict.
    const skipped = new Set<string>();
    let q = nextToAsk({}, skipped);
    let guard = 0;
    while (q && guard < 200) {
      skipped.add(q.id);
      q = nextToAsk({}, skipped);
      guard += 1;
    }
    expect(guard).toBeLessThan(200);
    const r = compute({});
    expect(r.verdict.kind).toBe('need-more-info');
    expect(r.verdict.nextStep).toBeTruthy();
  });
});

describe('the screen never reports a number it does not have', () => {
  it('has no safe amount to show until an income is given', () => {
    // The confidence meter under every question printed "safe to carry nothing"
    // for the first four screens, because a missing answer and a real zero are
    // the same value. They are not the same statement: one means "we do not
    // know yet" and the other means "you can carry nothing". A borrower who
    // reads the second on question one has been told something false.
    const partial: Answers[] = [
      {},
      { purpose: 'wedding' },
      { purpose: 'wedding', amountAsked: 300000 },
      { purpose: 'wedding', amountAsked: 300000, incomeType: 'salaried' },
    ];
    for (const answers of partial) {
      const r = compute(answers);
      expect(r.verdict.kind, JSON.stringify(answers)).toBe('need-more-info');
      // Whatever the screen says here, it must not be a figure. The verdict
      // carries the sentence to show instead, and a next step to act on.
      expect(r.verdict.why.length).toBeGreaterThan(10);
      expect(r.verdict.nextStep).toBeTruthy();
    }
  });

  it('starts reporting an amount as soon as there is an income to report it from', () => {
    const r = compute({
      purpose: 'wedding',
      amountAsked: 300000,
      incomeType: 'salaried',
      monthlyIncome: { lo: 50000, hi: 50000 },
    });
    expect(r.verdict.kind).not.toBe('need-more-info');
    expect(r.amounts.safe.hi).toBeGreaterThan(0);
  });
});

describe('changing an answer puts the question back in the queue', () => {
  it('re-asks a must question whose answer was cleared', () => {
    // "Change" on the review screen deletes the answer rather than opening a
    // separate edit screen, so a question is only ever asked one way.
    const full = personas[0]!.answers;
    const answered: Answers = { ...full };
    const target = mustSet.find((q) => answered[q.field] !== undefined)!;

    const { [target.field]: _cleared, ...without } = answered;
    const asked = nextToAsk(without as Answers, new Set());

    expect(asked?.id).toBe(target.id);
  });

  it('never offers a question that is already answered', () => {
    // The real claim. Priya does not answer every must field, so something may
    // still be pending — but it must never be one she has already given.
    for (const persona of personas) {
      const asked = nextToAsk(persona.answers, new Set());
      if (asked) {
        expect(persona.answers[asked.field], `${persona.id} re-asked ${asked.id}`).toBeUndefined();
      }
    }
  });
});

describe('an amount whose usual answer is none', () => {
  it('lets "nobody else earns" be a real answer, not a blank', () => {
    // Zero here is an answer: it says there is no second earner. Skipping is a
    // different thing, and the engine treats them differently — so the screen
    // has to offer both.
    const q = allQuestions.find((x) => x.field === 'coApplicantIncome')!;
    expect(q.input.kind).toBe('money-optional');

    const none = compute({ ...personas[0]!.answers, coApplicantIncome: 0 });
    expect(none.verdict.kind).toBeTruthy();
    expect(none.amounts.safe.hi).toBeGreaterThanOrEqual(0);
  });

  it('counts a second earner when there is one', () => {
    const base: Answers = { ...personas[0]!.answers, coApplicantIncome: 0 };
    const withEarner: Answers = {
      ...personas[0]!.answers,
      coApplicantIncome: 25000,
      coApplicantPooled: true,
    };
    expect(compute(withEarner).amounts.lender.hi).toBeGreaterThan(
      compute(base).amounts.lender.hi,
    );
  });
});

describe('terms a borrower may not know carry an explanation', () => {
  it('explains on-road price', () => {
    const q = allQuestions.find((x) => x.field === 'vehicleOnRoadPrice')!;
    expect(q.hint).toBeTruthy();
    expect(q.hint!.toLowerCase()).toContain('registration');
  });
});
