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
import { mustSet, type Question } from '../engine/questions';

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
