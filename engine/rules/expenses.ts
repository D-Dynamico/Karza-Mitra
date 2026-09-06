/**
 * Household expenses.
 *
 * This is the only answer the engine fills in on the borrower's behalf, and it
 * does so because leaving it blank is not neutral — it would silently claim the
 * household spends nothing, and every safe amount would come out too high. An
 * assumption that is shown, labelled and editable is safer than a zero that
 * looks like a fact.
 */

import type { Answers } from '../answers';
import type { TraceLog } from '../trace';
import { judgement, register, type Rule } from './table';

export const expenseDefaults = register<Rule<{ base: number; perExtraPerson: number }>>({
  id: 'expenses.default',
  what: 'Assumed monthly household spending when it is not stated',
  value: { base: 9000, perExtraPerson: 3500 },
  why: 'A working figure for food, power, transport, phone and school costs, rising with each extra person the income has to cover, so that a blank answer does not read as "spends nothing".',
  source: judgement(
    'A round starting figure, not survey data. It is shown to the borrower as an assumption and is meant to be corrected. Known simplification: it charges the same for a child as for an adult, and ignores that a larger household shares costs.',
  ),
});

export const expenseCityMultiplier = register<Rule<Record<string, number>>>({
  id: 'expenses.city-multiplier',
  what: 'Household spending adjustment by city tier',
  value: { metro: 1.25, 'tier-2': 1, 'tier-3': 0.85, unknown: 1 },
  why: 'The same shopping list costs noticeably more in Bengaluru than in Hubballi. Tier 2 is the baseline because two of the three borrowers live there.',
  source: judgement(
    'Rough relative cost of living. The direction is not in doubt; the exact multipliers are mine.',
  ),
});

/** Share of income used as a floor, when income is high enough that a flat figure would understate. */
export const expenseFloorShare = register<Rule<number>>({
  id: 'expenses.floor-share',
  what: 'Minimum assumed spending as a share of income',
  value: 0.25,
  why: 'A household earning more generally spends more. Assuming a flat figure for everyone would flatter higher earners and overstate what they can carry.',
  source: judgement('A conservative floor; the intent is not to under-assume for a higher income.'),
});

export interface ExpenseEstimate {
  readonly value: number;
  readonly assumed: boolean;
}

export function assumedExpenses(answers: Answers, log: TraceLog): ExpenseEstimate {
  if (answers.householdExpenses !== undefined) {
    return { value: answers.householdExpenses, assumed: false };
  }

  const income = answers.monthlyIncome?.lo ?? 0;
  const people = answers.householdSize ?? 1;
  const tier = answers.cityTier ?? 'unknown';
  const multiplier =
    expenseCityMultiplier.value[tier] ?? expenseCityMultiplier.value['unknown']!;

  const perHead =
    expenseDefaults.value.base + expenseDefaults.value.perExtraPerson * Math.max(0, people - 1);
  const flat = perHead * multiplier;
  const share = income * expenseFloorShare.value;
  const value = Math.round(Math.max(flat, share));

  log.record({
    rule: 'expenses.default',
    label: 'Household spending (assumed)',
    inputs: {
      'you did not say': true,
      'people in the household': people,
      'your city': tier,
      'assumed': value,
    },
    output: value,
    why: `${expenseDefaults.why} Correct it if it is wrong — it moves your safe amount directly.`,
    assumed: true,
    assumption: `Household spending: we assumed ₹${value.toLocaleString('en-IN')} a month for ${people} ${people === 1 ? 'person' : 'people'}. Your own figure would be better.`,
  });

  return { value, assumed: true };
}
