import type { ReportSection } from './lib/hrReportExport';
import { newCode } from './lib/shiftCodes';

// The pieces of the OT claim report that are drawn both on screen and on the printed page. The layout follows Infotech's
// "Attendance Request Status Report (Individual)": Original Details, Requested Details and Approved Details side by side.
export type Claim = { kind: string; late: number; early: number; original: Record<string, number>; requested: Record<string, number>; typedIn: string; typedOut: string; date: string; day: string; shift: string; shiftStart: string; shiftEnd: string; clockIn: string; clockOut: string; askedMinutes: number; approved: Record<string, number>; approvedMinutes: number; status: string; pendingWith: string; approvedBy: string; remarks: string; comments: string; applied: string; decided: string; pay: string; source: string };
export type Staff = { id: string; company: string; code: string; name: string; designation: string; group: string; claims: Claim[] };

export const RATES = ['1', '1.5', '2', '3'];
export const dmy = (iso: string) => iso ? iso.split('-').reverse().join('-') : '';
// Infotech writes a time as 8.59 and hours as decimals (3.02): the same here, so the two reports read alike.
const time = (value: string) => { const match = /^(\d{1,2}):(\d{2})/.exec(value || ''); return match ? `${Number(match[1])}.${match[2]}` : ''; };
const num = (minutes: number) => (minutes / 60).toFixed(2);
const KIND_CODE: Record<string, string> = { ph: 'PH', rest: 'RES', off: 'OFF', normal: '' };
const sum = (claims: Claim[], pick: (claim: Claim) => Record<string, number>, only?: string) => RATES.map((rate) => claims.reduce((total, claim) => total + (!only || claim.status === only ? pick(claim)[rate] || 0 : 0), 0));

const cells = (values: Record<string, number>) => RATES.map((rate) => <td key={rate} className="n">{num(values[rate] || 0)}</td>);

function ClaimRow({ claim }: { key?: string | number; claim: Claim }) {
  const approved = claim.status === 'Approved';
  const code = KIND_CODE[claim.kind] ?? '';
  const tone = approved ? '#047857' : claim.status === 'Pending' ? '#b45309' : '#64748b';
  const reqIn = claim.typedIn || claim.clockIn, reqOut = claim.typedOut || claim.clockOut;
  return <tr>
    <td className="d">{dmy(claim.date)}</td><td>{claim.day}</td>
    <td className="n">{time(claim.clockIn)}</td><td className="n">{time(claim.clockOut)}</td><td>{code}</td><td className="n">{num(claim.late)}</td><td className="n">{num(claim.early)}</td>{cells(claim.original)}<td className="n">0.00</td>
    <td className="n">{time(reqIn)}</td><td className="n">{time(reqOut)}</td><td>{code}</td>{cells(claim.requested)}<td className="n">0.00</td>
    <td className="n">{approved ? time(reqIn) : ''}</td><td className="n">{approved ? time(reqOut) : ''}</td><td>{approved ? code : ''}</td>{cells(approved ? claim.approved : {})}<td className="n">0.00</td>
    <td style={{ color: tone, fontWeight: 700 }}>{claim.status.toUpperCase()}</td><td>{claim.pendingWith}</td><td>{claim.approvedBy}</td>
    <td>{claim.remarks}{claim.pay && approved ? <span className="pay">Pay: {claim.pay}</span> : null}</td><td>{claim.comments}</td><td className="d">{dmy(claim.applied)}</td><td className="d">{dmy(claim.decided)}</td>
  </tr>;
}

export function Block({ person, claims }: { key?: string | number; person: Staff; claims: Claim[] }) {
  const original = sum(claims, (claim) => claim.original), requested = sum(claims, (claim) => claim.requested), approved = sum(claims, (claim) => claim.approved, 'Approved');
  const total = (values: number[]) => <>{values.map((value, index) => <td key={index} className="n b">{num(value)}</td>)}<td className="n b">0.00</td></>;
  return <div className="otc-block">
    <p className="otc-who"><span>Emp Code :</span> <b>{person.code}</b> &nbsp; <span>Name :</span> <b style={{ color: '#1d4ed8' }}>{person.name}</b> &nbsp; <span>Designation :</span> <b>{person.designation}</b> &nbsp; <i>{person.company}</i></p>
    <table className="otc-table">
      <colgroup>{WIDTHS.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
      <thead>
        <tr><th rowSpan={3}>Claim Date</th><th rowSpan={3}>Day</th><th colSpan={10} className="g">Original Details</th><th colSpan={8} className="g">Requested Details</th><th colSpan={8} className="g">Approved Details</th><th rowSpan={3}>Status</th><th rowSpan={3}>Pending With</th><th rowSpan={3}>Approved By</th><th rowSpan={3}>Req Remarks</th><th rowSpan={3}>Officer Comments</th><th rowSpan={3}>Applied Date</th><th rowSpan={3}>Approved Date</th></tr>
        <tr><th rowSpan={2}>In</th><th rowSpan={2}>Out</th><th rowSpan={2}>Reason</th><th rowSpan={2}>Late</th><th rowSpan={2}>E.Out</th><th colSpan={5} className="g">Original OT</th><th rowSpan={2}>In</th><th rowSpan={2}>Out</th><th rowSpan={2}>Reason</th><th colSpan={5} className="g">Requested OT</th><th rowSpan={2}>In</th><th rowSpan={2}>Out</th><th rowSpan={2}>Reason</th><th colSpan={5} className="g">Approved OT</th></tr>
        <tr className="sub">{[0, 1, 2].map((group) => <FragmentRates key={group} />)}</tr>
      </thead>
      <tbody>{claims.map((claim, index) => <ClaimRow key={`${claim.date}-${index}`} claim={claim} />)}</tbody>
      <tfoot><tr><td colSpan={7}><b>Total :</b></td>{total(original)}<td colSpan={3} />{total(requested)}<td colSpan={3} />{total(approved)}<td colSpan={7} /></tr></tfoot>
    </table>
  </div>;
}

const FragmentRates = () => <>{['1.0', '1.5', '2.0', '3.0', 'FLAT'].map((label) => <th key={label}>{label}</th>)}</>;
// Column widths of the 35 columns (made to add up to 100 per cent).
const RAW_WIDTHS = [4.6, 2.2, 2.4, 2.4, 3, 2.4, 2.4, 2.7, 2.7, 2.7, 2.7, 2.7, 2.4, 2.4, 3, 2.7, 2.7, 2.7, 2.7, 2.7, 2.4, 2.4, 3, 2.7, 2.7, 2.7, 2.7, 2.7, 5.4, 6.4, 7.2, 11, 4.5, 4.6, 4.6];
const WIDTHS = RAW_WIDTHS.map((width) => Math.round((width / RAW_WIDTHS.reduce((a, b) => a + b, 0)) * 1000) / 10);
export const TABLE_CSS = `.otc-block{margin-bottom:4mm}.otc-who{margin:0;padding:1mm 0;border-bottom:0.3mm solid #1e3a8a;font-size:9px;color:#b45309}.otc-who b{color:#000;font-weight:700}.otc-who i{color:#64748b;font-style:normal}.otc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7px;line-height:1.25}.otc-table th{border:1px solid #cbd5e1;background:#f1f5f9;padding:2px 1px;text-align:center;font-weight:700;color:#7f1d1d;overflow-wrap:anywhere}.otc-table th.g{background:#e2e8f0;color:#1e3a8a}.otc-table tr.sub th{font-size:6.5px;padding:1px 0;background:#f8fafc;border-top:0}.otc-table td{border:1px solid #e2e8f0;padding:2px 2px;vertical-align:top;overflow-wrap:anywhere}.otc-table td.n{text-align:right;white-space:nowrap}.otc-table td.d{white-space:nowrap}.otc-table td.b{font-weight:700;color:#7f1d1d}.otc-table .pay{display:block;color:#0b587b}.otc-table tfoot td{background:#f8fafc;color:#7f1d1d}`;

// The first page of the printed report (and the top of the screen): everyone in one table.
export function Summary({ staff, offset = 0 }: { staff: Staff[]; offset?: number }) {
  const rows = staff.map((person) => {
    const claims = person.claims, approved = claims.filter((claim) => claim.status === 'Approved'), pending = claims.filter((claim) => claim.status === 'Pending');
    const at = RATES.map((rate) => approved.reduce((total, claim) => total + (claim.approved[rate] || 0), 0));
    return { person, count: claims.length, approvedCount: approved.length, pendingCount: pending.length, other: claims.length - approved.length - pending.length, at, worked: approved.reduce((total, claim) => total + claim.approvedMinutes, 0), paid: RATES.reduce((total, rate, index) => total + (at[index] / 60) * Number(rate), 0), waiting: pending.reduce((total, claim) => total + claim.askedMinutes, 0) };
  });
  const total = rows.reduce((t, row) => ({ count: t.count + row.count, approvedCount: t.approvedCount + row.approvedCount, pendingCount: t.pendingCount + row.pendingCount, other: t.other + row.other, at: t.at.map((value, index) => value + row.at[index]), worked: t.worked + row.worked, paid: t.paid + row.paid, waiting: t.waiting + row.waiting }), { count: 0, approvedCount: 0, pendingCount: 0, other: 0, at: [0, 0, 0, 0], worked: 0, paid: 0, waiting: 0 });
  const widths = [3, 8, 24, 15, 4, 5, 6, 6, 7, 7, 5, 5, 5, 5, 6, 6];
  const widthTotal = widths.reduce((a, b) => a + b, 0);
  return <table className="otc-table otc-summary">
    <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${Math.round((width / widthTotal) * 1000) / 10}%` }} />)}</colgroup>
    <thead><tr><th>No.</th><th>Emp Code</th><th>Name</th><th>Designation</th><th>Loc.</th><th>Claims</th><th>Approved</th><th>Pending</th><th>Rejected / cancelled</th><th>Worked (approved)</th><th>1.0x</th><th>1.5x</th><th>2.0x</th><th>3.0x</th><th>Paid hrs</th><th>Waiting</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.person.id}><td className="n">{offset + index + 1}</td><td>{row.person.code}</td><td style={{ fontWeight: 600 }}>{row.person.name}</td><td>{row.person.designation}</td><td>{row.person.company}</td><td className="n">{row.count}</td><td className="n">{row.approvedCount}</td><td className="n">{row.pendingCount}</td><td className="n">{row.other}</td><td className="n">{num(row.worked)}</td>{row.at.map((value, at) => <td key={at} className="n">{num(value)}</td>)}<td className="n b">{row.paid.toFixed(2)}</td><td className="n">{num(row.waiting)}</td></tr>)}</tbody>
    <tfoot><tr><td colSpan={5}><b>Total</b></td><td className="n b">{total.count}</td><td className="n b">{total.approvedCount}</td><td className="n b">{total.pendingCount}</td><td className="n b">{total.other}</td><td className="n b">{num(total.worked)}</td>{total.at.map((value, at) => <td key={at} className="n b">{num(value)}</td>)}<td className="n b">{total.paid.toFixed(2)}</td><td className="n b">{num(total.waiting)}</td></tr></tfoot>
  </table>;
}
export const SUMMARY_CSS = '.otc-summary{font-size:9px}.otc-summary th{white-space:normal}.otc-summary td{padding:3px 4px}';

// ---- the report as pages (used by the OT tab and by Reports): the summary first, then one page for each staff member ----
export type OtClaimSheet = { company: string; summary?: Staff[]; offset?: number; person?: Staff };
const SUMMARY_PER_PAGE = 24;
export function buildOtClaimPages(shown: Staff[], place: string): OtClaimSheet[] {
  const summaryPages = Array.from({ length: Math.ceil(shown.length / SUMMARY_PER_PAGE) }, (_, index) => shown.slice(index * SUMMARY_PER_PAGE, (index + 1) * SUMMARY_PER_PAGE));
  return [...summaryPages.map((list, index) => ({ company: place, summary: list, offset: index * SUMMARY_PER_PAGE })), ...shown.map((person) => ({ company: person.company, person }))];
}
const COMPANY_NAME: Record<string, string> = { KJ: 'KJ- HSO HEALTHCARE SDN BHD', SK: 'SK- HSO HEALTHCARE SDN. BHD.' };
export const generatedAt = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }).replace(',', '');
export function OtClaimPage({ sheet, index, count, from, to, filterText, generated }: { sheet: OtClaimSheet; index: number; count: number; from: string; to: string; filterText: string; generated: string }) {
  return <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#000' }}>
    <style>{TABLE_CSS + SUMMARY_CSS}</style>
    <div style={{ display: 'flex', alignItems: 'center', gap: '3mm' }}><img src="/ara-logo.png" alt="" style={{ width: '11mm', height: '11mm', objectFit: 'contain' }} /><div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '13pt', fontWeight: 700, color: '#7f1d1d' }}>{COMPANY_NAME[sheet.company] || 'HSO HEALTHCARE SDN BHD (KJ and SK)'}</div><div style={{ fontSize: '11pt', fontWeight: 700, color: '#1e3a8a' }}>{sheet.summary ? 'OT Claim Status Report · Summary' : 'Attendance Request Status Report (Individual)'}</div></div><div style={{ width: '11mm' }} /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '0.3mm solid #1e3a8a', margin: '1.5mm 0 2mm', paddingBottom: '1mm', fontSize: '7.5pt' }}><span><b>Date :</b> {generated}</span><span><b>Period :</b> <span style={{ color: '#7f1d1d', fontWeight: 700 }}>Period: {dmy(from)} To {dmy(to)}</span> · {filterText}</span><span><b>Page :</b> {index + 1} of {count}</span></div>
    {sheet.summary ? <Summary staff={sheet.summary} offset={sheet.offset} /> : sheet.person ? <Block person={sheet.person} claims={sheet.person.claims} /> : null}
  </div>;
}
// For CSV and Excel: the summary, then every claim in one table.
export function otClaimSections(shown: Staff[]): ReportSection[] {
  const summary = shown.map((person, index) => {
    const approved = person.claims.filter((claim) => claim.status === 'Approved');
    const at = RATES.map((rate) => approved.reduce((total, claim) => total + (claim.approved[rate] || 0), 0));
    return [index + 1, person.code, person.name, person.company, person.claims.length, approved.length, person.claims.filter((claim) => claim.status === 'Pending').length, Number(num(approved.reduce((total, claim) => total + claim.approvedMinutes, 0))), ...at.map((value) => Number(num(value))), Number(RATES.reduce((total, rate, i) => total + (at[i] / 60) * Number(rate), 0).toFixed(2))];
  });
  const claims = shown.flatMap((person) => person.claims.map((claim) => [person.code, person.name, person.company, dmy(claim.date), claim.day, claim.shift ? `${newCode(claim.shift)} ${claim.shiftStart}-${claim.shiftEnd}` : 'No shift', claim.clockIn, claim.clockOut, Number(num(claim.askedMinutes)), ...RATES.map((rate) => claim.status === 'Approved' ? Number(num(claim.approved[rate] || 0)) : 0), claim.status, claim.pendingWith, claim.approvedBy, claim.remarks, claim.comments, dmy(claim.applied), dmy(claim.decided), claim.pay]));
  return [
    { title: 'Summary', note: 'OT claims per staff member', headers: ['No.', 'Code', 'Staff', 'Location', 'Claims', 'Approved', 'Pending', 'Worked (h)', '1.0x (h)', '1.5x (h)', '2.0x (h)', '3.0x (h)', 'Paid hrs'], rows: summary },
    { title: 'Claims', headers: ['Code', 'Staff', 'Location', 'Date', 'Day', 'Shift', 'Clock in', 'Clock out', 'OT asked (h)', 'Approved 1.0x (h)', 'Approved 1.5x (h)', 'Approved 2.0x (h)', 'Approved 3.0x (h)', 'Status', 'Pending with', 'Approved by', 'Remarks', 'Officer comments', 'Applied', 'Approved on', 'Pay'], rows: claims },
  ] as ReportSection[];
}
