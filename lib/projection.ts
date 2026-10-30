// Projection maths for assets (earnings) and debts (payoff). Pure functions, no database access.
//
// Assets: money is deposited at the START of each month. Earnings accrue monthly at rate/12 and are
//   credited once a year ('yearly', how MP2 pays) or every month ('monthly').
// Debts: interest is added every month at rate/12, then the monthly payment is taken off.
// Year numbers count from today: Year 1 = the next 12 months.

export type Compounding = 'yearly' | 'monthly';

export type ProjectionInput = {
  kind: 'asset' | 'liability';
  start: number;
  monthly: number; // deposit (asset) or payment (debt) per month
  rate: number; // default rate, percent per year
  overrides?: Record<string, number> | null; // { "2": 6.5 } = year 2 uses 6.5%
  years: number;
  compounding: Compounding;
};

export type ProjectionRow = {
  year: number;
  rate: number;
  start: number;
  flow: number; // deposits (asset) or payments (debt) made during the year
  earned: number; // earnings (asset) or interest charged (debt)
  end: number;
};

export type ProjectionResult = {
  rows: ProjectionRow[];
  totalFlow: number;
  totalEarned: number;
  end: number;
  payoffMonths: number | null; // debts only: months until paid off (null = not within 50 years)
  payoffInterest: number | null; // debts only: total interest until paid off
  neverPaidOff: boolean;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'semimonthly':
      return amount * 2;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

export function rateForYear(year: number, rate: number, overrides?: Record<string, number> | null): number {
  const o = overrides?.[String(year)];
  return typeof o === 'number' && Number.isFinite(o) ? o : rate;
}

function payoff(inp: ProjectionInput): { months: number; interest: number } | null {
  let bal = Math.max(inp.start, 0);
  if (bal <= 0.005) return { months: 0, interest: 0 };
  if (inp.monthly <= 0) return null;
  let interest = 0;
  for (let m = 1; m <= 600; m++) {
    const r = rateForYear(Math.ceil(m / 12), inp.rate, inp.overrides) / 100;
    const i = (bal * r) / 12;
    interest += i;
    bal += i;
    bal -= Math.min(inp.monthly, bal);
    if (bal <= 0.005) return { months: m, interest };
  }
  return null;
}

export function project(inp: ProjectionInput): ProjectionResult {
  const years = Math.min(30, Math.max(1, Math.floor(inp.years) || 1));
  const monthly = Math.max(inp.monthly || 0, 0);
  const rows: ProjectionRow[] = [];
  let bal = Math.max(inp.start || 0, 0);

  for (let y = 1; y <= years; y++) {
    const rate = rateForYear(y, inp.rate, inp.overrides);
    const r = rate / 100;
    const start = bal;
    let flow = 0;
    let earned = 0;
    let pending = 0;

    for (let m = 0; m < 12; m++) {
      if (inp.kind === 'asset') {
        bal += monthly;
        flow += monthly;
        const e = (bal * r) / 12;
        earned += e;
        if (inp.compounding === 'monthly') bal += e;
        else pending += e;
      } else {
        const i = (bal * r) / 12;
        earned += i;
        bal += i;
        const pay = Math.min(monthly, bal);
        bal -= pay;
        flow += pay;
      }
    }
    if (inp.kind === 'asset' && inp.compounding === 'yearly') bal += pending;
    if (bal < 0.005) bal = 0;
    rows.push({ year: y, rate, start: r2(start), flow: r2(flow), earned: r2(earned), end: r2(bal) });
  }

  let payoffMonths: number | null = null;
  let payoffInterest: number | null = null;
  let neverPaidOff = false;
  if (inp.kind === 'liability') {
    const p = payoff({ ...inp, monthly });
    if (p) {
      payoffMonths = p.months;
      payoffInterest = r2(p.interest);
    } else if ((inp.start || 0) > 0) {
      neverPaidOff = true;
    }
  }

  return {
    rows,
    totalFlow: r2(rows.reduce((a, x) => a + x.flow, 0)),
    totalEarned: r2(rows.reduce((a, x) => a + x.earned, 0)),
    end: rows[rows.length - 1]?.end ?? r2(bal),
    payoffMonths,
    payoffInterest,
    neverPaidOff,
  };
}