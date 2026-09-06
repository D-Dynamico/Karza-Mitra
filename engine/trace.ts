/**
 * The trace.
 *
 * Every rule records what it was given, what it produced, and one sentence on
 * why. The results screens, the "show working" drawers, the negotiation card and
 * the generated run-through documents are all views of this one structure — so
 * an explanation can never drift from the number it explains, because there is
 * only ever one of each.
 */

import type { Interval } from './interval';

export type TraceValue = Interval | number | string | boolean | undefined;

export interface TraceEntry {
  /** Stable identifier, e.g. `affordability.lender-foir`. Safe to key UI off. */
  readonly rule: string;
  /** Short human title for the working drawer. */
  readonly label: string;
  /** What the rule read. Keys are shown to the borrower, so name them plainly. */
  readonly inputs: Readonly<Record<string, TraceValue>>;
  /** What it produced. */
  readonly output: TraceValue;
  /** One sentence, in the borrower's terms, on why this rule did what it did. */
  readonly why: string;
  /** Set when the rule leaned on an assumption rather than a stated answer. */
  readonly assumed?: boolean;
  /**
   * The assumption in the borrower's words, with the value we used — "Rent:
   * ₹4,000 to ₹10,000 a month, guessed from your city". Only rules that filled
   * something in on the borrower's behalf set this, so the list shown on screen
   * is what they could correct, not everything downstream that inherited it.
   */
  readonly assumption?: string;
}

/** A value carrying the reasoning that produced it. */
export interface Traced<T> {
  readonly value: T;
  readonly trace: readonly TraceEntry[];
}

/**
 * Collects entries as a rule runs. Rules take one of these, record into it, and
 * return a plain value — so the reasoning is gathered without every function
 * having to thread a trace through its return type.
 */
export class TraceLog {
  private readonly entries: TraceEntry[] = [];

  record<T extends TraceValue>(entry: Omit<TraceEntry, 'output'> & { output: T }): T {
    this.entries.push(entry);
    return entry.output;
  }

  /** Fold in the reasoning from a nested computation. */
  absorb(entries: readonly TraceEntry[]): void {
    this.entries.push(...entries);
  }

  all(): readonly TraceEntry[] {
    return this.entries;
  }

  /** The entries for one rule area, e.g. everything under `affordability.`. */
  forPrefix(prefix: string): readonly TraceEntry[] {
    return this.entries.filter((e) => e.rule.startsWith(prefix));
  }

  find(rule: string): TraceEntry | undefined {
    return this.entries.find((e) => e.rule === rule);
  }
}

/** True when any rule that fed this result was working from an assumption. */
export const usedAssumptions = (trace: readonly TraceEntry[]): boolean =>
  trace.some((e) => e.assumed === true);
