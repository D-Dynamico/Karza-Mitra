/**
 * The shell.
 *
 * Four views: the start, the question flow, the answer, and the Card. The Card
 * repeats every headline number by design — that is what makes it useful across
 * a desk — so rendering it below the results turned the whole page into an echo.
 * It gets its own screen.
 *
 * The three borrowers can still be loaded directly, which is how the personas
 * are checked and how a reader gets to a finished answer without typing eleven
 * answers first. That is a reviewer's door, not the front door, and it says so.
 *
 * **The opening screen carries the argument, not a paragraph about it.** The
 * whole product is one idea — what a lender will give you is not what you can
 * afford — and an earlier version stated that idea in four lines of prose above
 * a button, where it read as throat-clearing. It is now the two tiles in the
 * middle of the card, drawn in the same shapes as the answer screen's own
 * two-number panel, so the first thing a visitor sees is a preview of the thing
 * they are about to be given. Everything else on the screen was cut back to
 * make room for it.
 *
 * Those tiles then held labels, not numbers — "What they will approve", "What
 * you can actually pay" — which is a description of a comparison rather than
 * one. They are now two bars in the same style as the answer screen: a long
 * one for what a lender may offer, a short one for what you can pay. They carry
 * no figures and no person. Leading with an example's numbers was tried and
 * rejected: the first screen should be about the visitor, not about someone
 * else. The bars are a diagram, so their lengths are fixed and do not come
 * from the engine.
 */

import { useMemo, useState } from 'react';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { personas, type Persona } from '../engine/personas';
import { mustSet } from '../engine/questions';
import { Card } from './Card';
import { DontScreen } from './DontScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { ExampleBio } from './ExampleBio';
import { Flow } from './Flow';
import { Results } from './Results';
import { Verdict } from './Verdict';
import './styles.css';

type View = 'start' | 'flow' | 'review' | 'results' | 'card';

export function App() {
  const [view, setView] = useState<View>('start');
  const [answers, setAnswers] = useState<Answers>({});
  /** The example whose answers are loaded, untouched. Null once anything is edited. */
  const [example, setExample] = useState<Persona | null>(null);

  const result = useMemo(() => compute(answers), [answers]);
  const isDont = result.verdict.kind === 'dont';
  /** Whether anything has actually been answered yet. */
  const started = Object.keys(answers).length > 0;

  const loadPersona = (p: Persona): void => {
    setAnswers(p.answers);
    setExample(p);
    setView('results');
  };

  const restart = (): void => {
    setAnswers({});
    setExample(null);
    setView('flow');
  };

  return (
    <main className={view === 'start' ? 'wrap start' : 'wrap'}>
      <header className="masthead no-print">
        <h1>Karza Mitra</h1>
        {/* On the start screen the card below says this in full, so the tag
            would be the same sentence twice. */}
        {view !== 'start' ? (
          <div className="tag">What a lender offers is not always what you can afford.</div>
        ) : null}
        {view !== 'start' ? (
          <div className="pickers">
            {/* Nothing to start over from on the first question. */}
            {started ? (
              <button type="button" className="pick" onClick={() => setView('start')}>
                Start over
              </button>
            ) : null}
            <span className="muted">Try an example:</span>
            {personas.map((p) => (
              <button type="button" key={p.id} className="pick" onClick={() => loadPersona(p)}>
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <ErrorBoundary trace={result.trace}>
        {view === 'start' ? (
          <>
            {/* Centred by `.wrap.start`; see the note at the foot of styles.css. */}
            <section className="ask start">
              <h2>How much can you actually afford to borrow?</h2>
              <p>A lender tells you the most they will give. We tell you the most you can pay back.</p>

              {/* A diagram, not an answer. See the note at the top. */}
              <div className="preview bars" aria-hidden="true">
                <div className="bar theirs">
                  <div className="bar-head">
                    <span>What a lender may offer</span>
                  </div>
                  <div className="track">
                    <span className="solid" style={{ width: '88%' }} />
                  </div>
                </div>
                <div className="bar yours">
                  <div className="bar-head">
                    <span>What you can actually pay</span>
                  </div>
                  <div className="track">
                    <span className="solid" style={{ width: '42%' }} />
                  </div>
                </div>
              </div>

              <button type="button" className="btn primary go" onClick={restart}>
                Find my safe amount &rarr;
              </button>
              {/* The brief stresses no login and nothing stored. Saying it out
                  loud on the first screen is trust, and it costs a line. */}
              <p className="muted start-note">About {mustSet.length} questions. Nothing you type leaves this phone.</p>
            </section>

            {/* One tap away, because a reviewer will reach for these within ten
                seconds — but small and prefixed, because three first names in a
                row above the fold read as a sign-in, not as examples. */}
            {/* Three boxes, outside the card and quieter than it. The
                description is what makes one worth pressing — "Priya" alone says
                nothing about which example to pick — and a box gives it somewhere
                to sit that a run of text does not. Kept below the fold-line of the
                card and in a lighter weight, so three first names never read as a
                sign-in. */}
            <p className="examples-label muted">Try an example:</p>
            <div className="examples">
              {personas.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="example"
                  onClick={() => loadPersona(p)}
                >
                  <strong>{p.name}</strong>
                  <span className="muted">{p.blurb}</span>
                </button>
              ))}
            </div>
          </>
        ) : view === 'flow' || view === 'review' ? (
          <Flow
            answers={answers}
            setAnswers={(next) => {
              setAnswers(next);
              setExample(null);
            }}
            onDone={() => setView('results')}
            startOnReview={view === 'review'}
          />
        ) : view === 'card' ? (
          <>
            <button type="button" className="back no-print" onClick={() => setView('results')}>
              ← Back to the answer
            </button>
            <Card result={result} />
          </>
        ) : isDont ? (
          <>
            {example ? (
              <ExampleBio persona={example} onSeeAnswers={() => setView('review')} />
            ) : null}
            <Verdict
              result={result}
              caption="Someone will lend you this money today. That does not make it a good idea."
            />
            <DontScreen answers={answers} />
            <button type="button" className="btn wide no-print" onClick={() => setView('card')}>
              If you borrow anyway, take this with you →
            </button>
            <button type="button" className="back no-print" onClick={() => setView('review')}>
              ← See or change your answers
            </button>
          </>
        ) : (
          <>
            {example ? (
              <ExampleBio persona={example} onSeeAnswers={() => setView('review')} />
            ) : null}
            <Results
              result={result}
              answers={answers}
              onTighten={() => setView('review')}
              onOpenCard={() => setView('card')}
            />
            <button type="button" className="back no-print" onClick={() => setView('review')}>
              ← See or change your answers
            </button>
          </>
        )}
      </ErrorBoundary>
    </main>
  );
}
