/**
 * The "show working" drawer, and the "tighten this" buttons beside it.
 *
 * Both are views of the trace and the question ranking — there is no
 * hand-written per-case copy anywhere in here, and there must not be. If a
 * panel needs a sentence, the sentence comes from a rule.
 */

import type { Answers } from '../engine/answers';
import { questionsFor } from '../engine/next-questions';
import type { OutputId } from '../engine/outputs';
import type { TraceEntry } from '../engine/trace';
import { renderValue, unitForInput, unitForOutput } from './units';

export function WorkingDrawer({
  trace,
  rules,
  summary = 'Show the working',
}: {
  readonly trace: readonly TraceEntry[];
  /** Which rules belong to this panel. Prefix match, so `affordability.` works. */
  readonly rules: readonly string[];
  readonly summary?: string;
}) {
  const shown = trace.filter((e) => rules.some((r) => e.rule.startsWith(r)));
  if (shown.length === 0) return null;

  return (
    <details>
      <summary>{summary}</summary>
      <ul className="working">
        {shown.map((e, i) => (
          <li key={`${e.rule}-${i}`}>
            <div className="row">
              <span className="rule-name">
                {e.label}
                {e.assumed ? <span className="assumed-flag">assumed</span> : null}
              </span>
              <span className="out">{renderValue(e.output, unitForOutput(e.rule), e.rule)}</span>
            </div>
            <div className="why">{e.why}</div>
            {Object.entries(e.inputs).filter(([, v]) => v !== undefined).length > 0 ? (
              <div className="ins">
                from{' '}
                {Object.entries(e.inputs)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => `${k} ${renderValue(v, unitForInput(e.rule, k))}`)
                  .join(', ')}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * "One more answer would sharpen this" — the questions that would actually
 * narrow these outputs, ranked by the engine rather than by a list written here.
 *
 * This used to appear under every panel as "Tighten this:", which is form
 * language, and the answer page ended up with two of them asking about
 * different things in the same voice. One block at the foot of the answer,
 * drawn from every output it covers and de-duplicated, says the same with less.
 */
export function TightenThis({
  answers,
  outputs,
  onAnswer,
  limit = 2,
  exclude = [],
}: {
  readonly answers: Answers;
  readonly outputs: readonly OutputId[];
  readonly onAnswer: (field: keyof Answers) => void;
  /** Two at most. Six of these across a page is noise, not help. */
  readonly limit?: number;
  /** Fields already asked elsewhere on the page, such as the pivotal one. */
  readonly exclude?: readonly (keyof Answers)[];
}) {
  const seen = new Set<string>();
  const ranked = outputs
    .flatMap((o) => questionsFor(answers, o, limit))
    .filter((r) => !exclude.includes(r.question.field))
    .filter((r) => (seen.has(r.question.id) ? false : (seen.add(r.question.id), true)))
    .slice(0, limit);
  if (ranked.length === 0) return null;

  return (
    <section className="panel tighten no-print">
      <span className="label">Make this answer more exact</span>
      <p className="muted">
        {ranked.length === 1 ? 'One question' : 'Questions'} we have not asked yet. Answering
        narrows the numbers above.
      </p>
      {ranked.map((r) => (
        <button
          type="button"
          className="q"
          key={r.question.id}
          onClick={() => onAnswer(r.question.field)}
        >
          {r.question.promptFor?.(answers) ?? r.question.prompt}
          <span className="promise">{r.promise}</span>
        </button>
      ))}
    </section>
  );
}
