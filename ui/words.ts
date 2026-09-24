/**
 * The verdict, as a borrower would say it.
 *
 * The engine's verdict kinds are identifiers — `borrow-less`, `dont` — and they
 * were reaching the screen as-is: "DONT" above the red box, and "With what you
 * have ticked: dont." under the toggles. One map, used everywhere a kind is
 * shown, so an identifier cannot leak onto the page again.
 */

import type { VerdictKind } from '../engine/rules/verdict';

export const VERDICT_WORD: Record<VerdictKind, string> = {
  borrow: 'Go ahead',
  'borrow-less': 'Borrow less',
  dont: 'Don’t borrow now',
  'need-more-info': 'Need your income',
};

/** The colour class a verdict is drawn in. */
export const VERDICT_TONE: Record<VerdictKind, 'go' | 'less' | 'stop'> = {
  borrow: 'go',
  'borrow-less': 'less',
  dont: 'stop',
  'need-more-info': 'less',
};

export const verdictWord = (kind: string): string =>
  VERDICT_WORD[kind as VerdictKind] ?? kind;
