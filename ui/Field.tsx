/**
 * One answer, drawn according to its declared input kind.
 *
 * The engine says what shape an answer is; this decides how to ask for it. Two
 * things matter more than they look:
 *
 * `inputMode="numeric"` on every money field, because this is a phone-first tool
 * and a borrower typing a lakh figure on a full qwerty keyboard is a borrower
 * who gives up.
 *
 * The lakh echo under a money field. Indians think in lakh, the engine works in
 * rupees, and the gap between the two is where a zero goes missing — "₹80,000"
 * typed when ₹8,00,000 was meant is the single most likely input error here, and
 * an echo reading "₹80 thousand" catches it before it reaches the arithmetic.
 */

import { useState } from 'react';
import type { Answers } from '../engine/answers';
import { inLakh } from '../engine/format';
import type { InputKind } from '../engine/questions';

type Value = Answers[keyof Answers];

/** "₹8,00,000" as "₹8 lakh"; small amounts echo as thousands. */
function echo(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 100000) return inLakh(n);
  if (n >= 1000) return `₹${Math.round(n / 1000)} thousand`;
  return '';
}

/**
 * One callback, not a change/submit pair.
 *
 * The first version had `onChange` then `onSubmit`, and a choice button called
 * both in the same tick — so the parent read its `draft` state before React had
 * applied it and committed `undefined`. Passing the value straight through with
 * the commit removes the window entirely.
 */
export function Field({
  input,
  onCommit,
}: {
  readonly input: InputKind;
  readonly onCommit: (v: Value) => void;
}) {
  switch (input.kind) {
    case 'choice':
      return (
        <div className="choices">
          {input.options.map((o) => (
            <button
              type="button"
              key={o.value}
              className="choice"
              onClick={() => onCommit(o.value as Value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'boolean':
      return (
        <div className="choices">
          {[
            { v: true, label: 'Yes' },
            { v: false, label: 'No' },
          ].map((o) => (
            <button
              type="button"
              key={String(o.v)}
              className="choice"
              onClick={() => onCommit(o.v as Value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'money':
      return <MoneyField onCommit={onCommit} />;

    case 'money-range':
      return <RangeField onCommit={onCommit} />;

    case 'number':
      return (
        <NumberField unit={input.unit} max={input.max} onCommit={onCommit} />
      );

    case 'credit-score':
      return <CreditField onCommit={onCommit} />;

    default:
      return null;
  }
}

function MoneyField({ onCommit }: { readonly onCommit: (v: Value) => void }) {
  const [text, setText] = useState('');
  const n = Number.parseFloat(text);
  const ok = Number.isFinite(n) && n >= 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit(n as Value);
      }}
    >
      <div className="money-input">
        <span className="rupee">₹</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
          aria-label="Amount in rupees"
        />
      </div>
      <div className="echo">{ok ? echo(n) : ' '}</div>
      <button type="submit" className="btn primary wide" disabled={!ok}>
        Continue
      </button>
    </form>
  );
}

function RangeField({ onCommit }: { readonly onCommit: (v: Value) => void }) {
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const a = Number.parseFloat(lo);
  const b = Number.parseFloat(hi);
  // A borrower who earns the same every month should not have to type it twice,
  // so a blank upper bound means "the same as the lower one".
  const top = hi.trim() === '' ? a : b;
  const ok = Number.isFinite(a) && a >= 0 && Number.isFinite(top) && top >= a;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit({ lo: a, hi: top } as Value);
      }}
    >
      <div className="range-input">
        <label>
          <span className="muted">In a slow month</span>
          <div className="money-input">
            <span className="rupee">₹</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={lo}
              onChange={(e) => setLo(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="Lowest monthly amount"
            />
          </div>
        </label>
        <label>
          <span className="muted">In a good month</span>
          <div className="money-input">
            <span className="rupee">₹</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="same"
              value={hi}
              onChange={(e) => setHi(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="Highest monthly amount"
            />
          </div>
        </label>
      </div>
      <div className="echo">
        {ok ? (a === top ? echo(a) : `${echo(a)} to ${echo(top)}`) : ' '}
      </div>
      <p className="muted">
        Leave the second box empty if it is the same every month. A range is not a worse answer
        than a single figure — it is the truth, and the arithmetic handles it.
      </p>
      <button type="submit" className="btn primary wide" disabled={!ok}>
        Continue
      </button>
    </form>
  );
}

function NumberField({
  unit,
  max,
  onCommit,
}: {
  readonly unit: string;
  readonly max: number | undefined;
  readonly onCommit: (v: Value) => void;
}) {
  const [text, setText] = useState('');
  const n = Number.parseFloat(text);
  const ok = Number.isFinite(n) && n >= 0 && (max === undefined || n <= max);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit(n as Value);
      }}
    >
      <div className="money-input">
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
          aria-label={unit}
        />
        <span className="unit">{unit}</span>
      </div>
      <button type="submit" className="btn primary wide" disabled={!ok}>
        Continue
      </button>
    </form>
  );
}

/**
 * Three states, not a nullable number — "never borrowed" is not a low score, and
 * "don't know" must not collapse to an average. The engine models all three, so
 * the input has to offer all three.
 */
function CreditField({ onCommit }: { readonly onCommit: (v: Value) => void }) {
  const [text, setText] = useState('');
  const n = Number.parseInt(text, 10);
  const ok = Number.isFinite(n) && n >= 300 && n <= 900;

  const pick = onCommit;

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onCommit({ known: true, score: n } as Value);
        }}
      >
        <div className="money-input">
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 780"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
            aria-label="Credit score between 300 and 900"
          />
        </div>
        <button type="submit" className="btn primary wide" disabled={!ok}>
          Continue
        </button>
      </form>
      <div className="choices" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="choice"
          onClick={() => pick({ known: false, everBorrowed: true } as Value)}
        >
          I have borrowed, but I do not know my score
        </button>
        <button
          type="button"
          className="choice"
          onClick={() => pick({ known: false, everBorrowed: false } as Value)}
        >
          I have never borrowed
        </button>
      </div>
      <p className="muted">
        Checking it is free and it narrows your rate straight away. Not knowing is not treated
        as a bad score — it is treated as a range.
      </p>
    </>
  );
}
