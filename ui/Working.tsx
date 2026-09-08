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
 * "Tighten this" — the questions that would actually narrow this specific
 * output, ranked by the engine rather than by a list written here.
 */
export function TightenThis({
  answers,
  output,
  onAnswer,
  limit = 2,
}: {
  readonly answers: Answers;
  readonly output: OutputId;
  readonly onAnswer: (field: keyof Answers) => void;
  /** One is usually enough. Six of these across a page is noise, not help. */
  readonly limit?: number;
}) {
  const ranked = questionsFor(answers, output, limit);
  if (ranked.length === 0) return null;

  return (
    <div className="tighten">
      <span className="muted">Tighten this:</span>
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
    </div>
  );
}
