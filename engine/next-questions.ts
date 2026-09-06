/**
 * What to ask next.
 *
 * The engine decides, not the interface. It does it by actually asking: for each
 * question still open, it answers it a few plausible ways, re-runs, and measures
 * what happened to the outputs. A question that narrows a range earns its place
 * ahead of one that does not, and a question that turns out to move nothing is
 * not offered at all.
 *
 * This is a few dozen extra `compute` calls. The engine is pure and fast enough
 * that it does not matter, and the alternative — a hand-ranked list of question
 * importance — would be a second opinion to keep in step with the rules.
 */

import type { Answers } from './answers';
import { compute, type Result } from './compute';
import { compareOutputs, movedMaterially, OUTPUT_LABELS, type OutputId } from './outputs';
import { unansweredApplicable, type Question } from './questions';

export interface RankedQuestion {
  readonly question: Question;
  /** How much this would move or narrow the outputs. Higher is more useful. */
  readonly worth: number;
  /** The outputs it actually moved on this borrower's answers. */
  readonly wouldMove: readonly OutputId[];
  /** One line for the "tighten this" button. */
  readonly promise: string;
}

/**
 * What a question is worth to *this* borrower, right now.
 *
 * Narrowing counts for more than shifting. A borrower is not looking for a
 * different answer; they are looking for a tighter one, and a question that
 * halves the width of the rate band has done more for them than one that moves
 * the midpoint slightly.
 */
const NARROWING_WEIGHT = 2;

function scoreQuestion(baseline: Result, answers: Answers, question: Question): RankedQuestion {
  let worth = 0;
  const moved = new Set<OutputId>();

  for (const probe of question.probes) {
    const after = compute({ ...answers, ...probe });
    for (const change of compareOutputs(baseline, after)) {
      // Only credit a question for the outputs it claimed. A question that moves
      // something it never declared is a bug in the registry, and the moves test
      // is where that gets caught — not here, quietly.
      if (!question.moves.includes(change.id)) continue;
      if (movedMaterially(change)) moved.add(change.id);
      worth += Math.max(0, change.narrowed) * NARROWING_WEIGHT + change.shifted;
    }
  }

  const perProbe = question.probes.length > 0 ? worth / question.probes.length : 0;
  const names = [...moved].map((id) => OUTPUT_LABELS[id]);

  return {
    question,
    worth: perProbe,
    wouldMove: [...moved],
    promise:
      names.length === 0
        ? 'This will not change your answer.'
        : names.length === 1
          ? `Sharpens ${names[0]}.`
          : `Sharpens ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`,
  };
}

/**
 * Order of precedence, and it is not simply "biggest number first".
 *
 * 1. Unanswered must-set questions. The engine needs these to say anything, and
 *    a borrower who skipped one should be offered it again before being offered
 *    a refinement.
 * 2. Anything that can change whether they should borrow at all. A question that
 *    could turn "borrow less" into "don't" matters more than one that narrows a
 *    rate band by a point, however large the measured movement — being told the
 *    wrong decision precisely is worse than the right decision vaguely.
 * 3. Then by how much it would tighten the answer.
 */
function byPriority(a: RankedQuestion, b: RankedQuestion): number {
  const tier = Number(b.question.tier === 'must') - Number(a.question.tier === 'must');
  if (tier !== 0) return tier;

  const verdict =
    Number(b.wouldMove.includes('O1.verdict')) - Number(a.wouldMove.includes('O1.verdict'));
  if (verdict !== 0) return verdict;

  return b.worth - a.worth;
}

/**
 * The questions worth asking next, best first. Questions that move nothing for
 * this borrower are dropped rather than ranked last — offering them would be
 * asking for time in exchange for nothing.
 */
export function nextQuestions(answers: Answers, limit = 5): RankedQuestion[] {
  const baseline = compute(answers);

  return unansweredApplicable(answers)
    .map((question) => scoreQuestion(baseline, answers, question))
    .filter((ranked) => ranked.wouldMove.length > 0)
    .sort(byPriority)
    .slice(0, limit);
}

/**
 * The questions that would most tighten one particular output. Drives the
 * "tighten this" button on each results panel, so the borrower chooses which
 * range they care about instead of being handed a wall of questions.
 */
export function questionsFor(answers: Answers, output: OutputId, limit = 3): RankedQuestion[] {
  const baseline = compute(answers);

  return unansweredApplicable(answers)
    .filter((q) => q.moves.includes(output))
    .map((question) => scoreQuestion(baseline, answers, question))
    .filter((ranked) => ranked.wouldMove.includes(output))
    .sort((a, b) => b.worth - a.worth)
    .slice(0, limit);
}

/**
 * What actually changed when an answer was given. Drives the banner that appears
 * after each question, which is the visible proof that the question was worth
 * asking — and stays silent when it was not.
 */
export interface Movement {
  readonly id: OutputId;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly narrowed: boolean;
}

export function whatMoved(
  before: Result,
  after: Result,
  format: (id: OutputId, r: Result) => string,
): Movement[] {
  return compareOutputs(before, after)
    .filter(movedMaterially)
    .map((change) => ({
      id: change.id,
      label: OUTPUT_LABELS[change.id],
      before: format(change.id, before),
      after: format(change.id, after),
      narrowed: change.narrowed > 0,
    }));
}
