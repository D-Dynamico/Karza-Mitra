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
    creditScore: { known: true, score: 780 },
    employerType: 'mnc',
    yearsInJob: 5,
    emergencySavingsMonths: 2,
  },
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
    // owns the home he lives in. Treated as no rent, which is the generous
    // reading; if he rents, his safe amount falls.
    rentOrHomeEmi: 0,
    age: 42,
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
    // TODO(lokta): the brief does not say whether she rents. Left blank rather
    // than guessed — but note a blank rent is read as zero, which flatters her.
    age: 35,
    householdSize: 4, // two children and a husband out of work for eight months
    creditScore: { known: false, everBorrowed: true },
    bouncedInLast6Months: true,
    appOrBnplLoans: true,
    appLoanOutstanding: 35000,
    vehicleOnRoadPrice: 150000,
    vehicleIsProductive: true,
    emergencySavingsMonths: 0,
    coApplicantIncome: 0, // husband unemployed eight months
  },
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
