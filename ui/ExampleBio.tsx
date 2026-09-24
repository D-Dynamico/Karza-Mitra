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
      <div className="bio-kind">Example</div>
      <p>
        <strong>{persona.name}, </strong>
        {persona.story}
      </p>
      {persona.filledIn.length > 0 ? (
        <div className="bio-filled">
          <span className="muted">Not given, so we filled in:</span>
          <ul>
            {persona.filledIn.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" className="bio-link" onClick={onSeeAnswers}>
        See or change {persona.name}&rsquo;s answers →
      </button>
    </section>
  );
}
