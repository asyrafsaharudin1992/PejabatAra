import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { downloadBlob } from './lib/downloadBlob';

// The printed Borang EA (one page for each staff member) and the CP8D list for the year, made from the yearly figures in hr_ea_annual.
// HR only. They are printouts of AraOffice's records; the LHDN submission itself is still done in e-Data Praisi / e-CP8D.
export type FormRow = { id: string; code: string; name: string; company: string; status: string; ic: string; tin: string; dob: string | null; marital: string; spouseWorking: boolean | null; childCount: number; designation: string; employmentType: string; joined: string | null; left: string | null; epfNo: string; socsoNo: string; gross: number; fees: number; allowances: number; pcb: number; childRelief: number; kwsp: number; socso: number; eis: number; details: { name: string; exemption: string; cp58: string; amount: number; eaAmount: number }[] };
export type Employer = { eNo: string; regNo: string } | null;

const COMPANY: Record<string, { name: string; address: string }> = {
  KJ: { name: 'KJ- HSO Healthcare Sdn Bhd', address: 'D-13-GA Jalan Prima Saujana 2/F, Taman Prima Saujana, 43000 Kajang, Selangor' },
  SK: { name: 'SK- HSO Healthcare Sdn Bhd', address: 'No. F-1-G, Blok F Putra Walk, Jalan PP25, Taman Pinggiran Putra, 43300 Seri Kembangan, Selangor' },
};
const money = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (value: number) => value ? money(value) : '-';
const dmy = (value: string | null) => value ? value.split('-').reverse().join('/') : '';
const whole = (value: number) => Math.floor(value + 1e-9);

// Tax category used on the CP8D: 1 single, 2 married and the spouse is not working, 3 married and the spouse works, divorced or widowed.
// A married person whose spouse's work is not recorded stays at 1, as in Infotech.
const category = (row: FormRow) => row.marital === 'Married' ? (row.spouseWorking === false ? 2 : row.spouseWorking === true ? 3 : 1) : row.marital === 'Divorced' || row.marital === 'Widowed' ? 3 : 1;
const status = (row: FormRow) => /director|ceo|coo|cfo|chro/i.test(row.designation) ? 'Management' : row.employmentType === 'Part-time' ? 'Part time' : row.employmentType === 'Intern' ? 'Interns' : row.employmentType === 'Contract' || row.employmentType === 'Locum' ? 'Contract' : 'Permanent';
// Date of retirement / end of contract: the day the person left when that was in or before the year, otherwise the 60th birthday worked out from the date of birth.
const leftBy = (row: FormRow, year: number) => row.left && Number(row.left.slice(0, 4)) <= year ? row.left : null;
const endDate = (row: FormRow, year: number) => { const left = leftBy(row, year); if (left) return left.split('-').reverse().join('-'); if (!row.dob) return ''; const [born, month, day] = row.dob.split('-'); return `${day}-${month}-${Number(born) + 60}`; };

export function usePrintDocument(active: boolean, title: string, onDone: () => void) {
  useEffect(() => {
    if (!active) return;
    const previous = document.title;
    document.title = title.replace(/[\\/:*?"<>|]/g, '');
    document.body.classList.add('tax-printing');
    const done = () => { document.body.classList.remove('tax-printing'); document.title = previous; onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    const timer = window.setTimeout(() => window.print(), 80);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('tax-printing'); document.title = previous; };
  }, [active]);
}

const STYLE = (landscape: boolean) => `
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
.tax-preview { display: block !important; }
.tax-print { display: none; font: 9pt/1.35 Arial, Helvetica, sans-serif; color: #000; }
body.tax-printing > *:not(.tax-print) { display: none !important; }
body.tax-printing .tax-print { display: block; }
html:has(body.tax-printing), body.tax-printing { background: #fff !important; }
.tax-print table { width: 100%; border-collapse: collapse; }
.tax-print td, .tax-print th { border: 0.6pt solid #444; padding: 1.2mm 1.8mm; vertical-align: top; }
.tax-print th { background: #eef2f6; text-align: left; }
.tax-print .num { text-align: right; white-space: nowrap; }
.tax-print .ea-page { break-after: page; }
.tax-print .ea-page:last-child { break-after: auto; }
.tax-print .sub td { border-top: 0; border-bottom: 0; padding-top: 0; padding-bottom: 0; font-size: 8pt; color: #333; }
.tax-print h1 { font-size: 13pt; margin: 0; }
.tax-print h2 { font-size: 10pt; margin: 3mm 0 1mm; }
.tax-print thead { display: table-header-group; }
.tax-print tr { break-inside: avoid; }
`;

function Line({ code, label, value, bold }: { code?: string; label: string; value?: number | string; bold?: boolean }) {
  return <tr style={bold ? { fontWeight: 'bold' } : undefined}><td style={{ width: '14mm' }}>{code}</td><td>{label}</td><td className="num" style={{ width: '38mm' }}>{typeof value === 'number' ? dash(value) : value ?? ''}</td></tr>;
}
function Sub({ lines }: { lines: FormRow['details'] }) {
  return <>{lines.map((item, index) => <tr key={index} className="sub"><td /><td>· {item.name.replace(/\s+/g, ' ').trim()}{item.cp58 && item.cp58 !== 'NONE' ? ` (${item.cp58})` : ''}</td><td className="num">{money(item.amount || item.eaAmount)}</td></tr>)}</>;
}

// One Borang EA, A4 portrait.
function EaPage({ row, year, employer }: { key?: string; row: FormRow; year: number; employer: Employer }) {
  const company = COMPANY[row.company] || COMPANY.KJ;
  const wages = row.details.filter((item) => /^(GROSSWAGES|OVERTIME)$/i.test(item.name.trim()));
  const fees = row.details.filter((item) => /^(DIRECTOR|BONUS|COMMISSION|FEE)/i.test(item.name.trim()));
  const other = row.details.filter((item) => !/^(GROSSWAGES|OVERTIME|TOTAL AMOUNT|EMP\. )/i.test(item.name.trim()) && !fees.includes(item));
  const social = row.details.filter((item) => /^EMP\. /i.test(item.name.trim()));
  const total = row.gross + row.fees + row.allowances;
  return <section className="ea-page">
    <h1>BORANG EA / FORM EA</h1>
    <p style={{ margin: '1mm 0 3mm' }}>Penyata Saraan daripada Pekerjaan / Statement of Remuneration from Employment for the year ended 31 December {year}</p>
    <h2>Employer</h2>
    <table><tbody>
      <Line code="" label="Name of employer" value={company.name} />
      <Line code="" label="Address" value={company.address} />
      <Line code="" label="Employer's tax reference (E) no." value={employer?.eNo || ''} />
      {employer?.regNo && <Line code="" label="Company registration no." value={employer.regNo} />}
    </tbody></table>
    <h2>Part A · Employee</h2>
    <table><tbody>
      <Line code="A1" label="Full name" value={row.name} />
      <Line code="A2" label="Designation" value={row.designation} />
      <Line code="A3" label="Staff no. / payroll no." value={row.code} />
      <Line code="A4" label="NRIC / passport no." value={row.ic} />
      <Line code="A5" label="Income tax reference no. (TIN)" value={row.tin} />
      <Line code="A6" label="EPF no." value={row.epfNo} />
      <Line code="A7" label="SOCSO no." value={row.socsoNo} />
      <Line code="A8" label="Date joined / date left" value={`${dmy(row.joined) || '-'} / ${dmy(leftBy(row, year)) || '-'}`} />
    </tbody></table>
    <h2>Part B · Income</h2>
    <table><tbody>
      <Line code="B1(a)" label="Gross salary, wages or leave pay (including overtime pay)" value={row.gross} bold /><Sub lines={wages} />
      <Line code="B1(b)" label="Fees (including director's fees), commission or bonus" value={row.fees} bold /><Sub lines={fees} />
      <Line code="B1(c)" label="Gross tips, perquisites, awards or other allowances" value={row.allowances} bold /><Sub lines={other} />
      <Line code="B1(d)–(f)" label="Income tax borne by employer, ESOS benefit, gratuity" value="-" />
      <Line code="B2–B6" label="Arrears, benefits in kind, living accommodation, refunds, compensation" value="-" />
      <Line code="" label="Total remuneration" value={total} bold />
    </tbody></table>
    <h2>Part D · Deductions</h2>
    <table><tbody>
      <Line code="D1" label="Monthly tax deduction (MTD / PCB) remitted to LHDNM" value={row.pcb} bold />
      <Line code="D2" label="CP38 deductions remitted to LHDNM" value="-" />
      <Line code="D3" label="Zakat paid via salary deduction" value="-" />
      <Line code="D4" label="Approved donations, gifts or contributions via salary deduction" value="-" />
      <Line code="D6" label="Total qualifying child relief" value={row.childRelief} />
    </tbody></table>
    <h2>Part E · Contributions</h2>
    <table><tbody>
      <Line code="E1" label="Kumpulan Wang Simpanan Pekerja (employee's EPF contribution)" value={row.kwsp} bold />
      <Line code="E2" label="SOCSO and EIS: employee's contribution only" value={row.socso + row.eis} bold /><Sub lines={social} />
      <Line code="F" label="Total tax exempt allowances, perquisites, gifts or benefits" value="-" />
    </tbody></table>
    <table style={{ marginTop: '8mm' }}><tbody><tr><td style={{ height: '16mm', width: '60%' }}>Employer's signature and company stamp</td><td>Date</td></tr></tbody></table>
    <p style={{ marginTop: '2mm', fontSize: '7.5pt', color: '#444' }}>Printed from AraOffice records ({row.company} · {row.code}).</p>
  </section>;
}

export function EaPrint({ rows, year, employer }: { rows: FormRow[]; year: number; employer: Employer }) {
  return createPortal(<div className="tax-print"><style>{STYLE(false)}</style>{rows.map((row) => <EaPage key={row.id} row={row} year={year} employer={employer} />)}</div>, document.body);
}

// The CP8D list: one line for each employee, laid out like the sheet Infotech makes for e-Data Praisi / e-CP8D.
export const cp8dLine = (row: FormRow, year: number) => ({ name: row.name, tin: row.tin, ic: row.ic, category: category(row), status: status(row), end: endDate(row, year), relief: row.childRelief > 0 ? 2 : 1, children: row.childCount, childRelief: row.childRelief, total: whole(row.gross + row.fees + row.allowances), kwsp: whole(row.kwsp), mtd: row.pcb, socso: whole(row.socso + row.eis) });

export function Cp8dPrint({ rows, year, employer }: { rows: FormRow[]; year: number; employer: Employer }) {
  return createPortal(<div className="tax-print"><style>{STYLE(true)}</style><Cp8dBody rows={rows} year={year} employer={employer} /></div>, document.body);
}
function Cp8dBody({ rows, year, employer }: { rows: FormRow[]; year: number; employer: Employer }) {
  const lines = rows.map((row) => cp8dLine(row, year));
  const sum = (pick: (line: ReturnType<typeof cp8dLine>) => number) => lines.reduce((total, line) => total + pick(line), 0);
  const names = [...new Set(rows.map((row) => (COMPANY[row.company] || COMPANY.KJ).name))].join(' / ');
  return <>
    <h1>C.P.8D · Return on remuneration from employment for the year ended 31 December {year}</h1>
    <p style={{ margin: '1mm 0 3mm' }}>Employer: <strong>{names}</strong> · Employer's TIN (E): <strong>{employer?.eNo || '-'}</strong> · {lines.length} employees</p>
    <table><thead><tr><th>No.</th><th>Name of employee</th><th>TIN</th><th>ID / passport no.</th><th>Cat.</th><th>Status</th><th>Retirement / end of contract</th><th>Child relief</th><th className="num">Children</th><th className="num">Relief (RM)</th><th className="num">Total gross (RM)</th><th className="num">EPF (RM)</th><th className="num">MTD (RM)</th><th className="num">SOCSO + EIS (RM)</th></tr></thead>
      <tbody>{lines.map((line, index) => <tr key={index}><td>{index + 1}</td><td>{line.name}</td><td>{line.tin}</td><td>{line.ic}</td><td>{line.category}</td><td>{line.status}</td><td>{line.end}</td><td>{line.relief}</td><td className="num">{line.children || ''}</td><td className="num">{line.childRelief ? money(line.childRelief) : ''}</td><td className="num">{line.total}</td><td className="num">{line.kwsp || ''}</td><td className="num">{line.mtd ? money(line.mtd) : ''}</td><td className="num">{line.socso || ''}</td></tr>)}</tbody>
      <tfoot><tr style={{ fontWeight: 'bold' }}><td colSpan={9}>Total</td><td className="num">{money(sum((line) => line.childRelief))}</td><td className="num">{sum((line) => line.total)}</td><td className="num">{sum((line) => line.kwsp)}</td><td className="num">{money(sum((line) => line.mtd))}</td><td className="num">{sum((line) => line.socso)}</td></tr></tfoot></table>
    <p style={{ marginTop: '3mm', fontSize: '7.5pt', color: '#444' }}>Category: 1 single · 2 married, spouse not working · 3 married with a working spouse, divorced or widowed. Child relief column follows Infotech: 2 when child relief is claimed, 1 when not. Amounts in whole ringgit as on the LHDN sheet. Retirement date is the date left, or the 60th birthday when the person has not left. Printed from AraOffice records.</p>
  </>;
}

// The same lines as a sheet to upload through e-Data Praisi / e-CP8D.
export function cp8dCsv(rows: FormRow[], year: number) {
  const cell = (value: string | number) => { const raw = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value); return /[",\n']/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; };
  const head = ['Name of employee', 'TIN', 'ID / passport no.', 'Category of employee', 'Employee status', 'Date of retirement / end of contract', 'Child relief column (2 claimed, 1 not)', 'No. of children', 'Child relief (RM)', 'Total gross remuneration (RM)', 'Benefit in kind (RM)', 'Living accommodation (RM)', 'ESOS benefit (RM)', 'Tax exempt allowances (RM)', 'TP1 relief (RM)', 'TP1 zakat (RM)', 'EPF (RM)', 'Zakat via salary (RM)', 'MTD (RM)', 'CP38 (RM)', 'Medical insurance (RM)', 'SOCSO + EIS (RM)'];
  const lines = rows.map((row) => cp8dLine(row, year)).map((line) => [line.name, line.tin, line.ic, line.category, line.status, line.end, line.relief, line.children, line.childRelief.toFixed(2), line.total, 0, 0, 0, 0, 0, 0, line.kwsp, 0, line.mtd.toFixed(2), 0, 0, line.socso]);
  downloadBlob([[head, ...lines].map((line) => line.map(cell).join(',')).join('\r\n')], `CP8D_${year}.csv`, 'text/csv');
}

// The same documents on screen, for a look at the layout before anything is printed.
export function EaPreview({ row, year, employer }: { row: FormRow; year: number; employer: Employer }) {
  return <div className="tax-print tax-preview"><style>{STYLE(false)}</style><EaPage row={row} year={year} employer={employer} /></div>;
}
export function Cp8dPreview({ rows, year, employer }: { rows: FormRow[]; year: number; employer: Employer }) {
  return <div className="tax-print tax-preview" style={{ overflowX: 'auto' }}><style>{STYLE(true)}</style><Cp8dBody rows={rows} year={year} employer={employer} /></div>;
}
