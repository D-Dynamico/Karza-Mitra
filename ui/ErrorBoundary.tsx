/**
 * If the results screen throws, the trace is still the most useful thing on the
 * page — it is what says how far the engine got and which rule it was in. So the
 * boundary shows it rather than a blank apology.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { TraceEntry } from '../engine/trace';

interface Props {
  readonly children: ReactNode;
  /** Shown when rendering fails, so a crash still explains the reasoning. */
  readonly trace?: readonly TraceEntry[];
}

interface State {
  readonly error: Error | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No logging service here, and nothing leaves the device. The console is the
    // only honest place for this.
    console.error('Results failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const trace = this.props.trace ?? [];
    return (
      <div className="crash">
        <h2>The results screen failed to draw.</h2>
        <p>
          The arithmetic below still ran. This is where it got to, which is usually enough to
          see what went wrong.
        </p>
        <pre>{error.message}</pre>
        {trace.length > 0 ? (
          <details open>
            <summary>The working, as far as it got ({trace.length} rules)</summary>
            <ul className="working">
              {trace.map((e, i) => (
                <li key={`${e.rule}-${i}`}>
                  <div className="row">
                    <span className="rule-name">{e.rule}</span>
                    <span className="out">{String(e.output)}</span>
                  </div>
                  <div className="why">{e.why}</div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    );
  }
}
