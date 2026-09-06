/**
 * The three borrowers the engine is judged on.
 *
 * Each is here to expose a different failure. Priya catches an app that reports
 * only the lender's number. Anita catches one that cannot say no. Ravi catches
 * one that prices a loan well but offers the wrong loan.
 *
 * Figures not fixed by the brief are filled in with plausible values and marked
 * below, so that a golden test failing means a rule moved, not that someone
 * quietly edited a persona.
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
    existingEmis: 14000, // car loan, 24 months left
    rentOrHomeEmi: 28000,
    householdExpenses: 30000, // assumed for the persona, not given in the brief
    age: 31,
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
    rentOrHomeEmi: 0, // owns the premises he lives above
    householdExpenses: 25000,
    age: 42,
    creditScore: { known: false, everBorrowed: false },
    yearsInBusiness: 12,
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
    monthlyIncome: { lo: 14000, hi: 22000 },
    existingEmis: 6000, // three app loans
    rentOrHomeEmi: 5000,
    householdExpenses: 9000,
    age: 29,
    creditScore: { known: false, everBorrowed: true },
    bouncedInLast6Months: true,
    appOrBnplLoans: true,
    appLoanOutstanding: 35000,
    vehicleOnRoadPrice: 150000,
    vehicleIsProductive: true,
    emergencySavingsMonths: 0,
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
