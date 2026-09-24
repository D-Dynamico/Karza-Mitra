/**
 * Who the loaded example is.
 *
 * Pressing "Anita" jumps straight to the answer, and a visitor who has not read
 * the brief then meets "don't borrow" for a stranger. This box sits above the
 * answer and says who she is and what she asked for, so the verdict can be
 * checked against the person rather than taken on trust.
 *
 * It is only ever shown for an example. `App` drops it the moment an answer is
 * edited, because once one field changes the answers are no longer hers.
 *
 * It was pushing the answer below the fold: a labelled box, the story, a
 * bulleted list of what was filled in, then a link. The story stays, since
 * it is what makes the verdict checkable. The filled-in list folds away behind
 * a count, because it matters to someone checking the example and not to
 * someone reading it.
 */

import type { Persona } from '../engine/personas';

export function ExampleBio({
  persona,
  onSeeAnswers,
}: {
  readonly persona: Persona;
  readonly onSeeAnswers: () => void;
}) {
  return (
    <section className="bio no-print" aria-label={`About ${persona.name}`}>
      <p>
        <span className="bio-kind">Example</span>
        <strong>{persona.name}, </strong>
        {persona.story}
      </p>
      <div className="bio-foot">
        {persona.filledIn.length > 0 ? (
          <details className="bio-filled">
            <summary>
              {persona.filledIn.length} thing{persona.filledIn.length === 1 ? '' : 's'} we
              filled in for {persona.name}
            </summary>
            <ul>
              {persona.filledIn.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <button type="button" className="bio-link" onClick={onSeeAnswers}>
          Change {persona.name}&rsquo;s answers →
        </button>
      </div>
    </section>
  );
}
