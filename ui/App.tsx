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
    <main className="wrap">
      <header className="masthead no-print">
        <h1>Karza Mitra</h1>
        <div className="tag">
          Two numbers, not one — what a lender will sanction, and what you can safely carry.
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
          <section className="ask">
            <h2>What can you actually afford to borrow?</h2>
            <p>
              Not what a lender will approve — that is a different number, and it is usually
              much larger. Answer a few questions and this will tell you both, show its
              working, and tell you plainly if the answer is that you should not borrow.
            </p>
            <p className="muted">
              Nothing leaves your device. There is no account and no saving.
            </p>
            <button type="button" className="btn primary wide" onClick={restart}>
              Start
            </button>
            <div className="skip">
              <span className="muted">
                Or load one of the three borrowers from the brief, to see a finished answer
                without answering anything:
              </span>
              <div className="pickers">
                {personas.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="pick"
                    onClick={() => loadPersona(p)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </section>
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
