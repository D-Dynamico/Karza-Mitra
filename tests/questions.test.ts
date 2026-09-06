import { describe, expect, it } from 'vitest';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { nextQuestions, questionsFor } from '../engine/next-questions';
import { compareOutputs, movedMaterially, OUTPUT_IDS } from '../engine/outputs';
import {
  adaptiveSet,
  allQuestions,
  cutQuestions,
  mustSet,
  unansweredApplicable,
} from '../engine/questions';
import { anita, mustSetOnly, priya, ravi } from '../engine/personas';

/**
 * The stated policy, enforced.
 *
 * "If a question never moves a number, cut it." That is only a policy if
 * something checks it, so this file re-runs the engine with real answers and
 * fails when a question cannot show its worth. Nothing is exempted. When one of
 * these fails the choice is to make the rule real or to delete the question —
 * never to loosen the assertion.
 */

const personas: Array<[string, Answers]> = [
  ['Priya', priya.answers],
  ['Ravi', ravi.answers],
  ['Anita', anita.answers],
];

/** The borrower states used for the ranking tests. */
const states: Array<[string, Answers]> = [
  ...personas,
  ...personas.map(([name, a]) => [`${name} (must set only)`, mustSetOnly(a)] as [string, Answers]),
  ['a blank slate', {}],
];

/**
 * The states a given question is worth testing against: each persona with that
 * one answer removed. Asking "does this move anything?" from a blank slate is
 * meaningless — with no income stated the engine cannot answer at all, so
 * nothing moves and every question would look worthless.
 */
function statesMissing(field: keyof Answers): Array<[string, Answers]> {
  const out: Array<[string, Answers]> = [];
  for (const [name, full] of personas) {
    for (const [label, base] of [
      [name, full],
      [`${name} (must set only)`, mustSetOnly(full)],
    ] as Array<[string, Answers]>) {
      const without = { ...base };
      delete without[field];
      out.push([`${label} without ${String(field)}`, without]);
    }
  }
  return out;
}

describe('every question earns its place', () => {
  for (const question of allQuestions) {
    it(`${question.id} moves a declared output for at least one borrower`, () => {
      const movedSomewhere = new Set<string>();

      for (const [, answers] of statesMissing(question.field)) {
        // Only test the question where it would actually be asked.
        if (!question.applies(answers)) continue;
        const baseline = compute(answers);

        for (const probe of question.probes) {
          const after = compute({ ...answers, ...probe });
          for (const change of compareOutputs(baseline, after)) {
            if (movedMaterially(change)) movedSomewhere.add(change.id);
          }
        }
      }

      expect(
        movedSomewhere.size,
        `${question.id} changed nothing for anyone — make the rule real or cut the question`,
      ).toBeGreaterThan(0);

      // And what it moved must be something it claimed to move.
      const claimed = question.moves.filter((id) => movedSomewhere.has(id));
      expect(
        claimed.length,
        `${question.id} claims ${question.moves.join(', ')} but moved ${[...movedSomewhere].join(', ')}`,
      ).toBeGreaterThan(0);
    });
  }
});

describe('questions that were cut stay cut', () => {
  it('does not quietly reinstate a cut question', () => {
    const live = new Set(allQuestions.map((q) => q.id));
    for (const cut of cutQuestions) {
      expect(live.has(cut.id), `${cut.id} was cut but is back in the registry`).toBe(false);
      expect(cut.why.length, `${cut.id} was cut without a reason`).toBeGreaterThan(40);
    }
  });
});

describe('the registry is coherent', () => {
  it('has unique ids', () => {
    const ids = allQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asks for each answer at most once', () => {
    const fields = allQuestions.map((q) => q.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('declares only real outputs', () => {
    for (const q of allQuestions) {
      expect(q.moves.length, `${q.id} declares no outputs`).toBeGreaterThan(0);
      for (const id of q.moves) expect(OUTPUT_IDS).toContain(id);
    }
  });

  it('gives every question a reason to exist and a cost to skipping', () => {
    for (const q of allQuestions) {
      expect(q.whyWeAsk.length, `${q.id} whyWeAsk`).toBeGreaterThan(30);
      expect(q.skipCost.length, `${q.id} skipCost`).toBeGreaterThan(20);
      expect(q.prompt.endsWith('?'), `${q.id} prompt should be a question`).toBe(true);
    }
  });

  it('keeps the must set inside the eight to ten the brief asks for', () => {
    // Ten. Household size was promoted from the adaptive set: it drives two
    // defaults, everyone can answer it without thinking, and leaving it out
    // meant showing a mother of three "we assumed you live alone".
    expect(mustSet).toHaveLength(10);
    for (const q of mustSet) expect(q.tier).toBe('must');
  });

  it('gives every question at least two probes to be judged on', () => {
    for (const q of allQuestions) expect(q.probes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the flow adapts', () => {
  it('never asks a salaried borrower about a filed return or business vintage', () => {
    const asked = unansweredApplicable(priya.answers).map((q) => q.id);
    expect(asked).not.toContain('itr-income');
    expect(asked).not.toContain('years-in-business');
  });

  it('never asks a shopkeeper who his employer is', () => {
    const asked = unansweredApplicable(ravi.answers).map((q) => q.id);
    expect(asked).not.toContain('employer-type');
    expect(asked).not.toContain('years-in-job');
  });

  it('does not ask about bounces or app loans when there are no loans', () => {
    const noDebt: Answers = { ...priya.answers, existingEmis: 0 };
    const asked = unansweredApplicable(noDebt).map((q) => q.id);
    expect(asked).not.toContain('bounced');
    expect(asked).not.toContain('app-loans');
  });

  it('asks a vehicle buyer about the price and what it will earn', () => {
    const asked = unansweredApplicable(mustSetOnly(anita.answers)).map((q) => q.id);
    expect(asked).toContain('vehicle-price');
    expect(asked).toContain('expected-earnings');
  });

  it('stops asking about the property once there is none', () => {
    const asked = unansweredApplicable({ ...ravi.answers, ownsProperty: false }).map((q) => q.id);
    expect(asked).not.toContain('property-value');
    expect(asked).not.toContain('property-charge');
  });

  it('gives nobody the whole registry', () => {
    for (const [name, answers] of personas) {
      const asked = unansweredApplicable(mustSetOnly(answers));
      expect(asked.length, `${name} was offered everything`).toBeLessThan(adaptiveSet.length);
    }
  });
});

describe('what to ask next', () => {
  it('offers nothing that neither moves a number nor corrects a visible guess', () => {
    for (const [name, answers] of states) {
      for (const ranked of nextQuestions(answers)) {
        if (ranked.onlyCorrectsAGuess === true) {
          // Allowed to move nothing, but only if it replaces something the
          // borrower can currently see the app guessing at.
          expect(ranked.question.corrects ?? [], `${name}/${ranked.question.id}`).not.toHaveLength(
            0,
          );
          expect(ranked.promise).toContain('guess');
        } else {
          expect(ranked.wouldMove.length, `${name}/${ranked.question.id}`).toBeGreaterThan(0);
        }
        expect(ranked.promise).not.toContain('will not change');
      }
    }
  });

  it('never offers to correct a guess the app is not actually making', () => {
    // Every question offered on those grounds must point at a rule that really
    // did fill something in for this borrower.
    for (const [name, answers] of states) {
      const guessing = new Set(
        compute(answers)
          .trace.filter((e) => e.assumption !== undefined)
          .map((e) => e.rule),
      );
      for (const r of nextQuestions(answers, 10)) {
        if (r.onlyCorrectsAGuess !== true) continue;
        const points = (r.question.corrects ?? []).some((rule) => guessing.has(rule));
        expect(points, `${name}: ${r.question.id} corrects nothing`).toBe(true);
      }
    }
  });

  it('puts an unanswered must-set question ahead of a refinement', () => {
    const missingIncome = { ...priya.answers };
    delete missingIncome.monthlyIncome;
    const ranked = nextQuestions(missingIncome);
    expect(ranked[0]!.question.tier).toBe('must');
  });

  it('offers a verdict-changing question ahead of one that only narrows a band', () => {
    // Being told the wrong decision precisely is worse than the right decision
    // vaguely, so anything that could flip "borrow less" into "don't" outranks a
    // question that shaves a point off the rate band.
    for (const [name, answers] of personas) {
      const ranked = nextQuestions(mustSetOnly(answers), 12).filter(
        (r) => r.question.tier === 'adaptive',
      );
      const firstNarrowOnly = ranked.findIndex((r) => !r.wouldMove.includes('O1.verdict'));
      const lastVerdict = ranked.map((r) => r.wouldMove.includes('O1.verdict')).lastIndexOf(true);
      if (firstNarrowOnly === -1 || lastVerdict === -1) continue;
      expect(lastVerdict, `${name}: a band question outranked a verdict question`).toBeLessThan(
        firstNarrowOnly,
      );
    }
  });

  it('surfaces the bounce question to a borrower carrying debt', () => {
    // Anita's verdict turns on it. If it stays buried under band-narrowing
    // questions she is told "borrow less" without ever being asked the thing
    // that makes the answer "don't".
    const ranked = nextQuestions(mustSetOnly(anita.answers), 6).map((r) => r.question.id);
    expect(ranked).toContain('bounced');
  });

  it('ranks the property question highly for a shopkeeper who has not mentioned one', () => {
    // Ravi's single biggest lever. If the engine does not surface it, the whole
    // routing argument depends on him volunteering it.
    const withoutProperty = mustSetOnly(ravi.answers);
    const ranked = nextQuestions(withoutProperty, 8).map((r) => r.question.id);
    expect(ranked).toContain('owns-property');
  });

  it('answers every persona with something worth asking', () => {
    for (const [name, answers] of personas) {
      const ranked = nextQuestions(mustSetOnly(answers));
      expect(ranked.length, `nothing to ask ${name}`).toBeGreaterThan(0);
    }
  });

  it('targets one output when asked to', () => {
    const ranked = questionsFor(mustSetOnly(ravi.answers), 'O3.rate');
    for (const r of ranked) expect(r.question.moves).toContain('O3.rate');
  });

  it('runs out of questions rather than repeating itself', () => {
    // Answer everything the engine offers, repeatedly, and it should terminate.
    let answers: Answers = mustSetOnly(priya.answers);
    const askedIds: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const ranked = nextQuestions(answers, 1);
      if (ranked.length === 0) break;
      const q = ranked[0]!.question;
      expect(askedIds, `asked ${q.id} twice`).not.toContain(q.id);
      askedIds.push(q.id);
      answers = { ...answers, ...q.probes[0] };
    }
    expect(nextQuestions(answers)).toHaveLength(0);
  });
});

describe('the flow can actually reach the answer', () => {
  /** Walk the flow the way a borrower would, answering only what is asked. */
  function walk(full: Answers): Answers {
    let asked: Answers = {};
    const declined = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const ranked = nextQuestions(asked, 12).filter((r) => !declined.has(r.question.id));
      if (ranked.length === 0) break;
      const q = ranked[0]!.question;
      const value = full[q.field];
      if (value === undefined) {
        declined.add(q.id);
        continue;
      }
      asked = { ...asked, [q.field]: value };
    }
    return asked;
  }

  it('reaches the same verdict through the questions as with every answer handed over', () => {
    // This is what caught the co-applicant bug: the flow asked how much a
    // partner earned but never whether that money was actually shared, so Ravi
    // silently lost his wife's ₹18,000 and came out a whole verdict worse. A
    // question that captures one field but not the companion its rule needs is
    // invisible until you walk the flow.
    for (const [name, full] of personas) {
      const viaFlow = compute(walk(full));
      const viaAll = compute(full);
      expect(viaFlow.verdict.kind, `${name} answers differently through the flow`).toBe(
        viaAll.verdict.kind,
      );
    }
  });

  it('gets within a few percent of the same amount', () => {
    for (const [name, full] of personas) {
      const viaFlow = compute(walk(full)).amounts.safe.hi;
      const viaAll = compute(full).amounts.safe.hi;
      if (viaAll === 0) {
        expect(viaFlow).toBe(0);
        continue;
      }
      expect(Math.abs(viaFlow - viaAll) / viaAll, `${name}`).toBeLessThan(0.05);
    }
  });
});

describe('skipping is always survivable', () => {
  it('still produces a verdict with any single must-set answer missing', () => {
    for (const [, answers] of personas) {
      for (const q of mustSet) {
        const without = { ...answers };
        delete without[q.field];
        const r = compute(without);
        expect(r.verdict.why.length).toBeGreaterThan(20);
        expect(Number.isFinite(r.amounts.safe.hi)).toBe(true);
      }
    }
  });

  it('still produces a verdict with the whole must set missing', () => {
    const r = compute({});
    expect(r.verdict.kind).toBe('need-more-info');
    expect(r.verdict.nextStep).toBeTruthy();
  });
});
