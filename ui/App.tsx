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
 * `two-up` panel, so the first thing a visitor sees is a preview of the thing
 * they are about to be given. Everything else on the screen was cut back to
 * make room for it.
 */

import { useMemo, useState } from 'react';
import type { Answers } from '../engine/answers';
import { compute } from '../engine/compute';
import { personas, type Persona } from '../engine/personas';
import { Card } from './Card';
import { DontScreen } from './DontScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { Flow } from './Flow';
import { Results } from './Results';
import './styles.css';

type View = 'start' | 'flow' | 'review' | 'results' | 'card';

export function App() {
  const [view, setView] = useState<View>('start');
  const [answers, setAnswers] = useState<Answers>({});

  const result = useMemo(() => compute(answers), [answers]);
  const isDont = result.verdict.kind === 'dont';

  const loadPersona = (p: Persona): void => {
    setAnswers(p.answers);
    setView('results');
  };

  const restart = (): void => {
    setAnswers({});
    setView('flow');
  };

  return (
    <main className={view === 'start' ? 'wrap start' : 'wrap'}>
      <header className="masthead no-print">
        <h1>Karza Mitra</h1>
        <div className="tag">
          What a lender offers isn&rsquo;t always what you can safely afford.
        </div>
        {view !== 'start' ? (
          <div className="pickers">
            <button type="button" className="pick" onClick={() => setView('start')}>
              Start over
            </button>
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
              <p>Answer a few questions and you get two numbers.</p>

              {/* The same shapes the answer screen uses for the real figures, so
                  this reads as a preview rather than an illustration. */}
              <div className="two-up preview">
                <div className="theirs">
                  <span className="muted">A lender may offer</span>
                  <strong>What they will approve</strong>
                </div>
                <div className="yours">
                  <span className="muted">Safe for you</span>
                  <strong>What you can actually pay</strong>
                </div>
              </div>

              <p className="muted">
                Then it shows how it got there — and says so plainly when the honest answer
                is not to borrow at all.
              </p>

              <button type="button" className="btn primary go" onClick={restart}>
                Start assessment &rarr;
              </button>
            </section>

            <p className="privacy">🔒 Private. Nothing leaves your device.</p>

            <div className="orline">
              <span>Want to see how it works?</span>
            </div>

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
            setAnswers={setAnswers}
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
            <section className="verdict stop">
              <div className="kind">{result.verdict.kind}</div>
              <h2>{result.verdict.headline}</h2>
              <p>{result.verdict.why}</p>
              {result.verdict.nextStep ? (
                <div className="next">{result.verdict.nextStep}</div>
              ) : null}
            </section>
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
