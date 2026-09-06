import { z } from 'zod';
import type { Interval } from './interval';

/**
 * What the borrower has told us. Everything is optional: skip is always
 * available in the flow, and the engine's job is to widen its ranges when an
 * answer is missing rather than refuse to answer. A field being absent is a
 * real state the rules read, so it is never defaulted here — the expense
 * default in phase 2 is applied by a rule that marks the value "assumed".
 */

const rupees = z.number().finite().nonnegative();

/**
 * A stated quantity the borrower may know exactly or only within a range. Same
 * shape as the engine's Interval, so an answer flows into the arithmetic without
 * a translation step where a lo and a hi could get swapped.
 */
export const statedRange = z
  .object({ lo: rupees, hi: rupees })
  .refine((r) => r.lo <= r.hi, { message: 'lo must not exceed hi' });

export type StatedRange = Interval;

/** A single figure is just a range of zero width, so the rules see one shape. */
export const exact = (value: number): StatedRange => ({ lo: value, hi: value });

export const loanPurpose = z.enum([
  'wedding',
  'medical',
  'education',
  'business-stock',
  'vehicle',
  'home',
  'debt-consolidation',
  'other',
]);

export type LoanPurpose = z.infer<typeof loanPurpose>;

export const incomeType = z.enum([
  'salaried',
  'self-employed-itr',
  'self-employed-cash',
  'informal',
]);

export type IncomeType = z.infer<typeof incomeType>;

/**
 * Three states, not a nullable number. "Never borrowed" is not a low score —
 * banks are cautious on unsecured but relaxed on secured — and "don't know"
 * becomes a wide interval, never an average.
 */
export const creditScore = z.union([
  z.object({ known: z.literal(true), score: z.number().int().min(300).max(900) }),
  z.object({ known: z.literal(false), everBorrowed: z.boolean() }),
]);

export const answersSchema = z.object({
  // The must set of nine.
  purpose: loanPurpose.optional(),
  amountAsked: rupees.optional(),
  incomeType: incomeType.optional(),
  monthlyIncome: statedRange.optional(),
  existingEmis: rupees.optional(),
  rentOrHomeEmi: rupees.optional(),
  householdExpenses: rupees.optional(),
  age: z.number().int().min(18).max(100).optional(),
  /** People the income supports. Feeds the household-spending default. */
  householdSize: z.number().int().min(1).max(20).optional(),
  /** Where they live. Feeds the rent and household-spending defaults. */
  cityTier: z.enum(['metro', 'tier-2', 'tier-3']).optional(),
  creditScore: creditScore.optional(),

  // Adaptive branches. Each only applies for some profiles; the question
  // registry in phase 2 decides when to ask, the rules decide what to do with
  // a blank.
  /** Months left on the existing loans — what makes "wait for it to end" concrete. */
  existingEmiMonthsLeft: z.number().int().min(0).max(600).optional(),
  employerType: z.enum(['mnc', 'psu-govt', 'small-firm', 'other']).optional(),
  yearsInJob: z.number().nonnegative().optional(),
  itrIncomeMonthly: rupees.optional(),
  yearsInBusiness: z.number().nonnegative().optional(),
  ownsProperty: z.boolean().optional(),
  propertyValue: rupees.optional(),
  propertyHasCharge: z.boolean().optional(),
  gstRegistered: z.boolean().optional(),
  goldValue: rupees.optional(),
  bouncedInLast6Months: z.boolean().optional(),
  appOrBnplLoans: z.boolean().optional(),
  appLoanOutstanding: rupees.optional(),
  vehicleOnRoadPrice: rupees.optional(),
  vehicleIsProductive: z.boolean().optional(),
  expectedMonthlyEarnings: rupees.optional(),
  emergencySavingsMonths: z.number().nonnegative().optional(),
  largeExpenseNext12Months: rupees.optional(),
  coApplicantIncome: rupees.optional(),
  coApplicantPooled: z.boolean().optional(),

  // A quote the borrower has already been given, placed on the fair band by
  // the Card in phase 4.
  quotedRatePercent: z.number().nonnegative().max(100).optional(),
  quotedFeePercent: z.number().nonnegative().max(100).optional(),
});

export type Answers = z.infer<typeof answersSchema>;

/** Nothing answered yet — the starting state of the flow. */
export const emptyAnswers: Answers = {};

/**
 * Validate untrusted input (a restored URL hash, a test fixture). Returns the
 * parsed answers or the list of problems, so callers can show a friendly
 * correction instead of crashing.
 */
export function parseAnswers(
  input: unknown,
): { ok: true; answers: Answers } | { ok: false; problems: string[] } {
  const result = answersSchema.safeParse(input);
  if (result.success) return { ok: true, answers: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`),
  };
}
