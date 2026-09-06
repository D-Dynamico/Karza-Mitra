import { z } from 'zod';

/**
 * What the borrower has told us. Everything is optional: skip is always
 * available in the flow, and the engine's job is to widen its ranges when an
 * answer is missing rather than refuse to answer. A field being absent is a
 * real state the rules read, so it is never defaulted here — the expense
 * default in phase 2 is applied by a rule that marks the value "assumed".
 */

const rupees = z.number().finite().nonnegative();

/** A stated quantity the borrower may know exactly or only within a range. */
export const statedRange = z
  .object({ low: rupees, high: rupees })
  .refine((r) => r.low <= r.high, { message: 'low must not exceed high' });

export type StatedRange = z.infer<typeof statedRange>;

/** A single figure is just a range of zero width, so the rules see one shape. */
export const exact = (value: number): StatedRange => ({ low: value, high: value });

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

export const incomeType = z.enum([
  'salaried',
  'self-employed-itr',
  'self-employed-cash',
  'informal',
]);

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
  creditScore: creditScore.optional(),

  // Adaptive branches. Each only applies for some profiles; the question
  // registry in phase 2 decides when to ask, the rules decide what to do with
  // a blank.
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
