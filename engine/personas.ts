/**
 * The three borrowers the engine is judged on.
 *
 * Every figure here is taken verbatim from the brief. Where the brief is silent
 * the answer is left OUT rather than invented, so the engine's own defaults fire
 * and are marked "assumed" in the output — which is what a real borrower who
 * skipped the question would see, and is the behaviour worth showing.
 *
 * Household spending is the clearest case: the brief gives it for nobody, so
 * nobody has it, and all three run-throughs will carry a visible assumption.
 *
 * A `TODO(lokta)` marks something the brief genuinely does not settle and that
 * is worth asking about.
 */

import type { Answers } from './answers';

export interface Persona {
  readonly id: 'priya' | 'ravi' | 'anita';
  readonly name: string;
  /** What this persona is in the set to catch. */
  readonly tests: string;
  readonly answers: Answers;
  /**
   * Answers the brief implies but does not state, and how they were arrived at.
   * Printed in the run-throughs so a reader can tell what came from Lokta and
   * what came from me.
   */
  readonly derived?: ReadonlyArray<{ field: keyof Answers; from: string }>;
}

export const priya: Persona = {
  id: 'priya',
  name: 'Priya',
  tests:
    'Two numbers, not one. A lender would sanction her ask several times over; what she can carry is far less, because her rent does not appear in their arithmetic.',
  answers: {
    purpose: 'wedding',
    amountAsked: 800000,
    incomeType: 'salaried',
    monthlyIncome: { lo: 110000, hi: 110000 },
    existingEmis: 14000, // car loan
    existingEmiMonthsLeft: 24, // "2 years left" — her strongest path-to-yes lever
    rentOrHomeEmi: 28000,
    age: 29,
    cityTier: 'metro', // Bengaluru
    creditScore: { known: true, score: 780 },
    employerType: 'mnc',
    yearsInJob: 5,
    emergencySavingsMonths: 2,
  },
  derived: [
    {
      field: 'existingEmiMonthsLeft',
      from: '"one car loan, EMI ₹14,000, 2 years left" — 24 months.',
    },
    { field: 'cityTier', from: 'Bengaluru, so a metro for rent and cost of living.' },
    { field: 'emergencySavingsMonths', from: 'Not stated. Assumed thin, which is the cautious reading.' },
  ],
};

export const ravi: Persona = {
  id: 'ravi',
  name: 'Ravi',
  tests:
    'Product routing. On his filed return alone he is a thin-file borrower facing an expensive unsecured loan. He owns an unencumbered shop, and the engine has to reach that on its own.',
  answers: {
    purpose: 'business-stock',
    amountAsked: 1500000,
    incomeType: 'self-employed-itr',
    monthlyIncome: { lo: 40000, hi: 80000 },
    itrIncomeMonthly: 35000,
    existingEmis: 0,
    // TODO(lokta): the brief says he owns the shop premises, but not whether he
    // owns the home he lives in. Left unanswered, so the engine's own rule
    // applies — a shopkeeper who owns his premises usually lives above or beside
    // them, so it assumes no rent and flags the assumption.
    age: 42,
    cityTier: 'tier-2', // Mysuru
    creditScore: { known: false, everBorrowed: false },
    yearsInBusiness: 14,
    ownsProperty: true,
    propertyValue: 4500000,
    propertyHasCharge: false,
    gstRegistered: true,
    coApplicantIncome: 18000, // wife
    coApplicantPooled: true,
    emergencySavingsMonths: 3,
  },
  derived: [
    { field: 'itrIncomeMonthly', from: '"ITR shows ₹4,20,000/year" — ₹35,000 a month.' },
    { field: 'cityTier', from: 'Mysuru, so tier 2.' },
    {
      field: 'coApplicantPooled',
      from: 'Not stated. Assumed pooled, since he is borrowing for the family business.',
    },
    { field: 'emergencySavingsMonths', from: 'Not stated. Assumed three months for an established trader.' },
  ],
};

export const anita: Persona = {
  id: 'anita',
  name: 'Anita',
  tests:
    'Whether "don\'t borrow" fires. A bounce last month, app loans above 30%, and a household that depends on her. Any answer that ends in "borrow ₹1.5L" is a failure.',
  answers: {
    purpose: 'vehicle',
    amountAsked: 150000,
    incomeType: 'informal',
    monthlyIncome: { lo: 26000, hi: 30000 },
    // The brief gives the outstanding balance but not the instalment. Three app
    // loans totalling ₹35,000 at 30%+ over the short tenures those carry works
    // out near ₹6,000 a month.
    existingEmis: 6000,
    // TODO(lokta): the brief does not say whether she rents. Left unanswered, so
    // the engine assumes a range for her city and widens the answer rather than
    // handing her a surplus she may not have.
    age: 35,
    cityTier: 'tier-2', // Hubballi
    householdSize: 4, // two children and a husband out of work for eight months
    creditScore: { known: false, everBorrowed: true },
    bouncedInLast6Months: true,
    appOrBnplLoans: true,
    appLoanOutstanding: 35000,
    vehicleOnRoadPrice: 150000,
    vehicleIsProductive: true,
    // "to double delivery runs". The brief gives the intent but not the figure,
    // so this is derived: her delivery work is roughly half of ₹26,000–₹30,000,
    // and doubling those runs adds something like ₹12,000 a month. Deliberately
    // on the optimistic side — if the answer is still "don't" with a generous
    // uplift counted, that is a far stronger refusal than one that ignored it.
    expectedMonthlyEarnings: 12000,
    emergencySavingsMonths: 0,
    coApplicantIncome: 0, // husband unemployed eight months
  },
  derived: [
    {
      field: 'existingEmis',
      from: '"three app loans, ₹35,000 outstanding at 30%+". The instalment is not given; ₹6,000 a month is what that balance costs over the short tenures those loans run.',
    },
    { field: 'householdSize', from: '"two children, husband unemployed" — four people.' },
    { field: 'cityTier', from: 'Hubballi, so tier 2.' },
    {
      field: 'expectedMonthlyEarnings',
      from: '"to double delivery runs". Derived at ₹12,000 a month, deliberately generous.',
    },
  ],
};

export const personas: readonly Persona[] = [priya, ravi, anita];

/**
 * The must set of nine only. Used to prove the engine still answers before any
 * of the adaptive branches have been asked.
 */
export function mustSetOnly(answers: Answers): Answers {
  return {
    purpose: answers.purpose,
    amountAsked: answers.amountAsked,
    incomeType: answers.incomeType,
    monthlyIncome: answers.monthlyIncome,
    existingEmis: answers.existingEmis,
    rentOrHomeEmi: answers.rentOrHomeEmi,
    householdExpenses: answers.householdExpenses,
    age: answers.age,
    creditScore: answers.creditScore,
  };
}
