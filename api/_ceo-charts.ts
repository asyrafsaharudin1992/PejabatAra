import { buildDaysFrom, fetchData, loadRules, recordsFromFor, type Employee } from './_attendance.js';
import { approvedTotal, claimTotal } from '../src/lib/incentiveCodes.js';
import { locationGroup } from '../src/lib/staffGroup.js';
import { branchId } from './_office-db.js';

// The numbers behind the CEO's Charts tab: twelve months of leave, lateness and OT, incentives, turnover, pay, and reviews, and the people of the
// company by length of service and kind of job, and the yearly tax totals. Everything is read-only and worked out here, then cached for a few
// minutes so opening the tab twice does not read the same tables again.
const CLINICS = ['KJ', 'SK'] as const;
type Clinic = (typeof CLINICS)[number];
type ByClinic<T> = Record<Clinic, T>;
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const malaysiaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
const shiftMonth = (month: string, by: number) => { const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by; return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; };
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);
const empty = <T,>(make: () => T): ByClinic<T> => ({ KJ: make(), SK: make() });

let cache: { at: number; data: unknown } | null = null;

// How many people there are: all active staff, doctors (directors included, as in Staff Profiles), Clinical Assistants and admins, by clinic.
export async function headcount(db: any) {
  const { data, error } = await db.from('hr_employees').select('employee_code,company,designation').eq('status', 'Active').limit(1000);
  if (error) throw error;
  const tally = (keep: (group: string) => boolean) => { const list = (data || []).filter((row: any) => keep(locationGroup({ designation: row.designation || '', employeeCode: row.employee_code, company: row.company }))); return { all: list.length, KJ: list.filter((row: any) => row.company === 'KJ').length, SK: list.filter((row: any) => row.company === 'SK').length }; };
  return { team: tally(() => true), doctors: tally((group) => group === 'Doctors' || group === 'Directors'), assistants: tally((group) => group === 'CAs'), admins: tally((group) => group === 'Admins' || group === 'Admin Klinikal') };
}

// `money` false leaves out pay and tax (what the COO sees): the figures are worked out the same, but only sent to those who see pay.
export async function ceoCharts(db: any, refresh = false, money = true) {
  const data: any = await chartsData(db, refresh);
  return money ? data : { ...data, pay: null, tax: null };
}

// The figures are worked out once a day (or when someone presses Refresh) and kept in the database, so opening the Charts tab reads one small record
// instead of the clocks, rosters, payslips and claims again. The same record serves the CEO, the COO and HR.
const CACHE_KEY = 'ceo_charts_cache', CACHE_BRANCH = 'AraOffice Charts Cache', DAY = 24 * 3600 * 1000;
async function chartsData(db: any, refresh: boolean) {
  if (!refresh && cache && Date.now() - cache.at < DAY) return cache.data;
  let stored: any = null;
  try {
    const branch = await branchId(db, CACHE_BRANCH, false);
    if (branch) { const { data: row } = await db.from('portal_state').select('payload').eq('branch_id', branch).eq('state_key', CACHE_KEY).maybeSingle(); stored = row?.payload || null; }
  } catch { /* no saved copy: work it out */ }
  if (!refresh && stored?.data && Date.now() - Date.parse(stored.data.generatedAt || '') < DAY) { cache = { at: Date.parse(stored.data.generatedAt), data: stored.data }; return stored.data; }
  const fresh = await computeCharts(db);
  try {
    const branch = await branchId(db, CACHE_BRANCH, true);
    const row = { branch_id: branch, state_key: CACHE_KEY, payload: { data: fresh }, updated_at: new Date().toISOString() };
    if (stored) await db.from('portal_state').update(row).eq('branch_id', branch).eq('state_key', CACHE_KEY); else await db.from('portal_state').insert(row);
  } catch { /* the figures are still returned; they are just not kept */ }
  return fresh;
}

async function computeCharts(db: any) {
  const today = malaysiaToday();
  const thisMonth = today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, index) => shiftMonth(thisMonth, index - 11));
  const first = `${months[0]}-01`;
  const slot = (month: string) => months.indexOf(month);

  const read = async (query: any) => { const { data, error } = await query; if (error) { if (['42P01', 'PGRST205', '42703'].includes(error.code)) return []; throw error; } return data || []; };
  const [staff, leave, claims, care, slips, ea, reviews] = await Promise.all([
    read(db.from('hr_employees').select('id,company,employee_code,full_name,designation,work_days,holiday_group,default_shift,clock_required,join_date,resign_date,status,employment_type').limit(2000)),
    read(db.from('hr_leave_requests').select('employee_id,start_date,end_date,days').eq('status', 'approved').lte('start_date', monthEnd(thisMonth)).gte('end_date', first).limit(8000)),
    read(db.from('incentive_claims').select('month,entries,status').in('status', ['submitted', 'approved']).gte('month', months[0]).limit(5000)),
    read(db.from('care_claims').select('month,amount,status').eq('status', 'approved').gte('month', months[0]).limit(2000)),
    read(db.from('hr_payslips').select('employee_id,year,month,result').eq('status', 'locked').limit(10000)),
    read(db.from('hr_ea_annual').select('year,gross_wages,fees_bonus,allowances,mtd,kwsp').limit(5000)),
    read(db.from('hr_reviews').select('status,created_at').gte('created_at', `${first}T00:00:00Z`).limit(5000)),
  ]);
  const clinicOf = new Map<string, Clinic>(staff.map((row: any) => [row.id, row.company as Clinic]));

  // --- Leave days a month, by clinic: each approved request is spread over the days it covers.
  const leaveDays = empty(() => months.map(() => 0));
  for (const request of leave) {
    const clinic = clinicOf.get(request.employee_id); if (!clinic) continue;
    const startDay = dayNumber(request.start_date), endDay = dayNumber(request.end_date), span = endDay - startDay + 1;
    for (const month of months) {
      const overlap = Math.min(endDay, dayNumber(monthEnd(month))) - Math.max(startDay, dayNumber(`${month}-01`)) + 1;
      if (overlap > 0) leaveDays[clinic][slot(month)] += Number(request.days || 0) * overlap / span;
    }
  }

  // --- Late days and OT hours recorded (before HR approves them), from the clocks and the roster, for the months AraOffice holds attendance for.
  const activeStaff = staff.filter((row: any) => row.status === 'Active') as (Employee & { status: string; employment_type: string })[];
  const late = empty(() => months.map((): number | null => null)), ot = empty(() => months.map((): number | null => null));
  const recordMonths = months.filter((month) => CLINICS.some((clinic) => monthEnd(month) >= recordsFromFor(clinic)));
  if (recordMonths.length && activeStaff.length) {
    const rules = await loadRules(db);
    // One month and one clinic at a time: a single read returns at most 1,000 rows, and a whole year of clocks is far more.
    for (const month of recordMonths) {
      const lastDay = monthEnd(month) > today ? today : monthEnd(month);
      await Promise.all(CLINICS.map(async (clinic) => {
        if (monthEnd(month) < recordsFromFor(clinic)) return;
        const people = activeStaff.filter((row) => row.company === clinic);
        if (!people.length) return;
        const days = buildDaysFrom(await fetchData(db, `${month}-01`, lastDay, people.map((row) => row.id)), people, `${month}-01`, lastDay, rules);
        let lateDays = 0, otMinutes = 0;
        for (const person of people) for (const day of days.get(person.id) || []) { if (day.lateCounted > 0) lateDays++; otMinutes += day.otCounted; }
        late[clinic][slot(month)] = lateDays; ot[clinic][slot(month)] = round(otMinutes / 60);
      }));
    }
  }

  // --- Incentives and AraCare, by claim month.
  const incentives = { claimed: months.map(() => 0), approved: months.map(() => 0), care: months.map(() => 0) };
  for (const claim of claims) { const index = slot(claim.month); if (index < 0) continue; const entries = Array.isArray(claim.entries) ? claim.entries : []; incentives.claimed[index] += claimTotal(entries); if (claim.status === 'approved') incentives.approved[index] += approvedTotal(entries); }
  for (const claim of care) { const index = slot(claim.month); if (index >= 0) incentives.care[index] += Number(claim.amount || 0); }

  // --- Turnover: people who left in the twelve months to each month end, as a share of the average head count in that time.
  const stood = (row: any, date: string) => (!row.join_date || row.join_date <= date) && (!row.resign_date || row.resign_date > date);
  const turnover = empty(() => months.map((): number | null => null));
  for (const clinic of CLINICS) {
    const people = staff.filter((row: any) => row.company === clinic);
    months.forEach((month, index) => {
      const end = monthEnd(month), begin = monthEnd(shiftMonth(month, -12));
      const leavers = people.filter((row: any) => row.resign_date && row.resign_date > begin && row.resign_date <= end).length;
      const average = (people.filter((row: any) => stood(row, begin)).length + people.filter((row: any) => stood(row, end)).length) / 2;
      turnover[clinic][index] = average > 0 ? round(leavers / average * 100) : null;
    });
  }

  // --- Length of service and kind of job, of the people working today.
  const bands = ['Under 1 year', '1 to 2 years', '2 to 3 years', '3 years or more'];
  const tenure = empty(() => bands.map(() => 0));
  for (const row of activeStaff) { if (!row.join_date) continue; const years = (dayNumber(today) - dayNumber(row.join_date)) / 365.25; tenure[row.company as Clinic][years < 1 ? 0 : years < 2 ? 1 : years < 3 ? 2 : 3]++; }
  const types = ['Permanent', 'Contract', 'Part-time', 'Locum', 'Intern'];
  const employment = empty(() => types.map(() => 0));
  for (const row of activeStaff) { const index = types.indexOf(row.employment_type); if (index >= 0) employment[row.company as Clinic][index]++; }

  // --- Pay from the locked payslips: gross pay for each person paid, and OT as a share of gross.
  const grossSum = empty(() => months.map(() => 0)), otSum = empty(() => months.map(() => 0)), paid = empty(() => months.map(() => 0));
  for (const slip of slips) {
    const clinic = clinicOf.get(slip.employee_id), index = slot(`${slip.year}-${String(slip.month).padStart(2, '0')}`);
    if (!clinic || index < 0) continue;
    grossSum[clinic][index] += Number(slip.result?.gross || 0); otSum[clinic][index] += Number(slip.result?.ot || 0); paid[clinic][index]++;
  }
  const perHead = empty(() => months.map((): number | null => null)), otShare = empty(() => months.map((): number | null => null));
  for (const clinic of CLINICS) months.forEach((_, index) => { if (!paid[clinic][index]) return; perHead[clinic][index] = round(grossSum[clinic][index] / paid[clinic][index], 0); otShare[clinic][index] = grossSum[clinic][index] ? round(otSum[clinic][index] / grossSum[clinic][index] * 100) : 0; });

  // --- Tax by year: the Borang EA for the years brought over, and this year added up from the payslips so far.
  const tax = new Map<number, { gross: number; pcb: number; kwsp: number; partial: boolean }>();
  for (const row of ea) { const year = Number(row.year), item = tax.get(year) || { gross: 0, pcb: 0, kwsp: 0, partial: false }; item.gross += Number(row.gross_wages) + Number(row.fees_bonus) + Number(row.allowances); item.pcb += Number(row.mtd); item.kwsp += Number(row.kwsp); tax.set(year, item); }
  for (const slip of slips) { const year = Number(slip.year); if (ea.some((row: any) => Number(row.year) === year)) continue; const item = tax.get(year) || { gross: 0, pcb: 0, kwsp: 0, partial: true }; item.gross += Number(slip.result?.gross || 0); item.pcb += Number(slip.result?.pcb || 0); item.kwsp += Number(slip.result?.kwspEmployee || 0); tax.set(year, item); }
  const years = [...tax.keys()].sort();

  // --- Performance reviews given each month: how many are done and how many are still waiting.
  const reviewed = { submitted: months.map(() => 0), pending: months.map(() => 0) };
  for (const row of reviews) { const index = slot(String(row.created_at).slice(0, 7)); if (index < 0) continue; if (row.status === 'pending') reviewed.pending[index]++; else reviewed.submitted[index]++; }

  const data = {
    generatedAt: new Date().toISOString(), months, headcount: await headcount(db),
    leave: { KJ: leaveDays.KJ.map((v) => round(v)), SK: leaveDays.SK.map((v) => round(v)) },
    late, ot,
    recordsFrom: { KJ: recordsFromFor('KJ').slice(0, 7), SK: recordsFromFor('SK').slice(0, 7) },
    incentives: { claimed: incentives.claimed.map((v) => round(v, 0)), approved: incentives.approved.map((v) => round(v, 0)), care: incentives.care.map((v) => round(v, 0)) },
    turnover, tenure: { bands, ...tenure }, employment: { types, ...employment },
    pay: { perHead, otShare },
    tax: { years, gross: years.map((year) => round(tax.get(year)!.gross, 0)), pcb: years.map((year) => round(tax.get(year)!.pcb, 0)), kwsp: years.map((year) => round(tax.get(year)!.kwsp, 0)), partial: years.map((year) => tax.get(year)!.partial) },
    reviews: reviewed,
  };
  cache = { at: Date.now(), data };
  return data;
}
