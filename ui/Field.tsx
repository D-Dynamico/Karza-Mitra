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
 * The line under a box: the lakh echo while typing, or — once Continue has been
 * tapped with nothing usable in the box — what to do instead.
 *
 * Continue used to be disabled until the answer was valid, so tapping it on an
 * empty box did nothing at all. A button that ignores a tap reads as broken, and
 * a greyed-out one does not say what is missing. Continue now always takes the
 * tap, and an empty or impossible answer gets one line saying what to type and
 * that skipping is allowed. It clears on the next keystroke.
 */
function Line({ prompt, children }: { readonly prompt?: string; readonly children?: string }) {
  return (
    <div className={prompt ? 'echo missing' : 'echo'} role="status">
      {prompt ?? (children || '\u00a0')}
    </div>
  );
}

const TYPE_OR_SKIP = 'Type an amount to continue, or skip below if you are not sure.';

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
        <NumberField
          unit={input.unit}
          min={input.min}
          max={input.max}
          onCommit={onCommit}
        />
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
  const [tried, setTried] = useState(false);
  const n = Number.parseFloat(text);
  const ok = Number.isFinite(n) && n >= 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit(n as Value);
        else setTried(true);
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
          onChange={(e) => {
            setText(e.target.value.replace(/[^0-9.]/g, ''));
            setTried(false);
          }}
          aria-label="Amount in rupees"
        />
      </div>
      <Line prompt={tried && !ok ? TYPE_OR_SKIP : undefined}>{ok ? echo(n) : ''}</Line>
      <button type="submit" className="btn primary wide">
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
  const [tried, setTried] = useState(false);
  const a = Number.parseFloat(lo);
  const b = Number.parseFloat(hi);
  const top = !varies || hi.trim() === '' ? a : b;
  const ok = Number.isFinite(a) && a >= 0 && Number.isFinite(top) && top >= a;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit({ lo: a, hi: top } as Value);
        else setTried(true);
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
              onChange={(e) => {
                setLo(e.target.value.replace(/[^0-9.]/g, ''));
                setTried(false);
              }}
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
              onChange={(e) => {
                setHi(e.target.value.replace(/[^0-9.]/g, ''));
                setTried(false);
              }}
              aria-label="Highest monthly amount"
            />
          </div>
          </label>
        ) : null}
      </div>
      <Line
        prompt={
          !tried || ok
            ? undefined
            : Number.isFinite(a) && Number.isFinite(top) && top < a
              ? 'The good month cannot be less than the slow month.'
              : TYPE_OR_SKIP
        }
      >
        {ok ? (a === top ? echo(a) : `${echo(a)} to ${echo(top)}`) : ''}
      </Line>
      <label className="tick">
        <input type="checkbox" checked={varies} onChange={() => setVaries((v) => !v)} />
        <span>It changes from month to month</span>
      </label>
      <button type="submit" className="btn primary wide">
        Continue
      </button>
    </form>
  );
}

/**
 * A count, with the floor the question declares.
 *
 * The floor matters more than it looks. "How many people does your income
 * support?" accepted zero, which is not a household anyone lives in and which
 * the answers schema rejects outright — so a borrower could type a figure the
 * engine would refuse. The bound belongs on the input, where it can be said
 * before the answer is given rather than after.
 */
function NumberField({
  unit,
  min,
  max,
  onCommit,
}: {
  readonly unit: string;
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly onCommit: (v: Value) => void;
}) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const n = Number.parseFloat(text);
  const floor = min ?? 0;
  const typed = text.trim() !== '';
  const tooLow = typed && Number.isFinite(n) && n < floor;
  const tooHigh = typed && Number.isFinite(n) && max !== undefined && n > max;
  const ok = Number.isFinite(n) && n >= floor && (max === undefined || n <= max);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCommit(n as Value);
        else setTried(true);
      }}
    >
      <div className="money-input">
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(/[^0-9.]/g, ''));
            setTried(false);
          }}
          aria-label={unit}
        />
        <span className="unit">{unit}</span>
      </div>
      <Line
        prompt={
          tooLow
            ? `That has to be at least ${floor} ${unit}.`
            : tooHigh
              ? `That cannot be more than ${max} ${unit}.`
              : tried && !ok
                ? 'Type a number to continue, or skip below if you are not sure.'
                : undefined
        }
      />
      <button type="submit" className="btn primary wide">
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
  const [tried, setTried] = useState(false);
  const n = Number.parseInt(text, 10);
  const ok = Number.isFinite(n) && n >= 300 && n <= 900;

  const pick = onCommit;

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onCommit({ known: true, score: n } as Value);
          else setTried(true);
        }}
      >
        <div className="money-input">
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 780"
            value={text}
            onChange={(e) => {
              setText(e.target.value.replace(/[^0-9]/g, ''));
              setTried(false);
            }}
            aria-label="Credit score between 300 and 900"
          />
        </div>
        <Line
          prompt={
            !tried || ok
              ? undefined
              : text.trim() === ''
                ? 'Type your score, or pick one of the answers below.'
                : 'A credit score is between 300 and 900.'
          }
        />
        <button type="submit" className="btn primary wide">
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
  const [tried, setTried] = useState(false);
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
        else setTried(true);
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
            onChange={(e) => {
              setText(e.target.value.replace(/[^0-9.]/g, ''));
              setTried(false);
            }}
            aria-label="Their monthly take-home"
          />
        </div>
      </label>
      <Line
        prompt={tried && !ok ? `Type an amount to continue, or tap “${noLabel}” below.` : undefined}
      >
        {ok ? echo(n) : ''}
      </Line>
      <button type="submit" className="btn primary wide">
        Continue
      </button>
      {/* Written as "Actually, no one else earns" when this field served one
          question. It now serves the loans question too, so the way back is the
          question's own "no" — which is also the answer, so it commits. */}
      <button type="button" className="skipbtn" onClick={() => onCommit(0 as Value)}>
        {noLabel}
      </button>
    </form>
  );
}
