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
  varies = false,
}: {
  readonly input: InputKind;
  readonly onCommit: (v: Value) => void;
  /** Whether a range field should start out expecting two figures. */
  readonly varies?: boolean;
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
      return <RangeField onCommit={onCommit} varies={varies} />;

    case 'number':
      return (
        <NumberField unit={input.unit} max={input.max} onCommit={onCommit} />
      );

    case 'money-optional':
      return (
        <OptionalMoneyField
          noLabel={input.noLabel}
          yesLabel={input.yesLabel}
          onCommit={onCommit}
        />
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

/**
 * One box, unless the income actually varies.
 *
 * This started as two boxes with a sentence explaining that the second could be
 * left blank. Almost nobody reads that sentence — a salaried borrower met two
 * empty fields and a paragraph where one number was wanted. So the default is a
 * single box, and the second appears only when they tick that their income
 * moves, which is a fact about them rather than a form instruction.
 *
 * It starts ticked for anyone whose income is not a salary, because for them the
 * range is the whole point: the engine budgets a self-employed borrower against
 * their slow month, and collapsing that to one figure throws away the caution
 * that makes their answer safe.
 */
function RangeField({
  onCommit,
  varies: initial,
}: {
  readonly onCommit: (v: Value) => void;
  readonly varies: boolean;
}) {
  const [varies, setVaries] = useState(initial);
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const a = Number.parseFloat(lo);
  const b = Number.parseFloat(hi);
  const top = !varies || hi.trim() === '' ? a : b;
  const ok = Number.isFinite(a) && a >= 0 && Number.isFinite(top) && top >= a;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit({ lo: a, hi: top } as Value);
      }}
    >
      <div className={varies ? 'range-input' : ''}>
        <label>
          {varies ? <span className="muted">In a slow month</span> : null}
          <div className="money-input">
            <span className="rupee">₹</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={lo}
              onChange={(e) => setLo(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label={varies ? 'Lowest monthly amount' : 'Monthly amount'}
            />
          </div>
        </label>
        {varies ? (
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
        ) : null}
      </div>
      <div className="echo">
        {ok ? (a === top ? echo(a) : `${echo(a)} to ${echo(top)}`) : ' '}
      </div>
      <label className="tick">
        <input type="checkbox" checked={varies} onChange={() => setVaries((v) => !v)} />
        <span>It changes from month to month</span>
      </label>
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

/**
 * An amount whose commonest answer is "none".
 *
 * "Does anyone else in the household earn?" met a bare rupee box, which makes
 * the ordinary answer the awkward one — the borrower has to decide that zero is
 * what we want and type it. The "no" is a button now, and the box only appears
 * if they say yes.
 */
function OptionalMoneyField({
  noLabel,
  yesLabel,
  onCommit,
}: {
  readonly noLabel: string;
  readonly yesLabel: string;
  readonly onCommit: (v: Value) => void;
}) {
  const [yes, setYes] = useState(false);
  const [text, setText] = useState('');
  const n = Number.parseFloat(text);
  const ok = Number.isFinite(n) && n > 0;

  if (!yes) {
    return (
      <div className="choices">
        <button type="button" className="choice" onClick={() => onCommit(0 as Value)}>
          {noLabel}
        </button>
        <button type="button" className="choice" onClick={() => setYes(true)}>
          Yes
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit(n as Value);
      }}
    >
      <label>
        <span className="muted">{yesLabel}</span>
        <div className="money-input">
          <span className="rupee">₹</span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            placeholder="0"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Their monthly take-home"
          />
        </div>
      </label>
      <div className="echo">{ok ? echo(n) : ' '}</div>
      <button type="submit" className="btn primary wide" disabled={!ok}>
        Continue
      </button>
      <button type="button" className="skipbtn" onClick={() => setYes(false)}>
        Actually, no one else earns
      </button>
    </form>
  );
}
