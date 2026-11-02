import { rosterShiftColor } from './rosterColors';
import type { CareerEntry, Employee } from '../HRProfiles';
import type { Claim } from '../ClinicalIncentives';
import { AREAS, ReviewFull, percentLabel } from './performanceReview';
import { approvedTotal, claimTotal } from './incentiveCodes';
import { displayedCell, projectionColors, projectionRows } from '../HRProjectionDocument';
import { projectionLabels, type ProjectionPerson, type ProjectionPlan } from './hrProjection';
import type { ProbationState } from './hrCalendar';

export type ReportSection = { roster?: boolean; title?: string; note?: string; headers: string[]; rows: (string | number)[][]; cellColors?: string[][] };
export type ForecastReport = { kind: 'forecast'; people: ProjectionPerson[]; plan: ProjectionPlan; probation: Record<string, ProbationState>; months: string[]; branches: string[]; subtitle: string };
export type PreparedReport = { kind: 'table'; sections: ReportSection[]; subtitle: string } | { kind: 'profile'; employee: Employee; career: CareerEntry[] } | { kind: 'review'; review: ReviewFull } | { kind: 'incentives'; claims: Claim[]; subtitle: string } | ForecastReport;

export function reportExportSections(report: PreparedReport, reveal: boolean): ReportSection[] {
  if (report.kind === 'table') return report.sections;
  if (report.kind === 'forecast') return report.branches.map((branch) => {
    const people = projectionRows(report.people, report.plan, report.months, branch);
    const columns = report.months.map((month) => people.map((row) => ({ row, cell: displayedCell(row, month, report.plan, report.probation) })).filter((entry) => entry.cell?.company === branch));
    const lines = Math.max(11, ...columns.map((column) => column.length));
    return { title: `${branch} Forecast`, note: report.subtitle, headers: ['No.', ...report.months], rows: Array.from({ length: lines }, (_, index) => [index + 1, ...columns.map((column) => { const entry = column[index]; return entry?.cell ? `${entry.row.name} · ${projectionLabels[entry.cell.status]}${entry.cell.notes.length ? ` · ${entry.cell.notes.join('; ')}` : ''}` : ''; })]), cellColors: Array.from({ length: lines }, (_, index) => ['', ...columns.map((column) => column[index]?.cell ? projectionColors[column[index].cell!.status] : '')]) };
  });
  if (report.kind === 'profile') {
    const e = report.employee;
    const hidden = (value: string | number | null) => value == null || value === '' ? '—' : reveal ? String(value) : '••••';
    const keys: [keyof Employee, string][] = [['fullName', 'Full name'], ['employeeCode', 'Staff code'], ['company', 'Company'], ['status', 'Status'], ['icNo', 'IC no.'], ['passportNo', 'Passport no.'], ['foreignIdNo', 'Foreign ID no.'], ['nationality', 'Nationality'], ['gender', 'Gender'], ['dateOfBirth', 'Date of birth'], ['religion', 'Religion'], ['race', 'Race'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address'], ['branch', 'Branch'], ['department', 'Department'], ['designation', 'Designation'], ['employmentType', 'Employment type'], ['joinDate', 'Joined'], ['confirmDate', 'Confirmed'], ['resignDate', 'Left'], ['leaveGroup', 'Leave group'], ['basicSalary', 'Basic salary (RM)'], ['bankName', 'Bank'], ['bankAccount', 'Bank account'], ['epfNo', 'KWSP no.'], ['socsoNo', 'PERKESO no.'], ['taxNo', 'Income tax no.'], ['maritalStatus', 'Marital status'], ['spouseName', 'Spouse'], ['spouseIc', 'Spouse IC no.'], ['spouseEmployer', 'Spouse occupation'], ['spousePhone', 'Spouse phone'], ['emergencyName', 'Emergency contact'], ['emergencyRelation', 'Emergency relationship'], ['emergencyPhone', 'Emergency phone'], ['remarks', 'Remarks']];
    const secret = new Set<keyof Employee>(['icNo', 'passportNo', 'foreignIdNo', 'phone', 'email', 'basicSalary', 'bankAccount', 'epfNo', 'socsoNo', 'taxNo', 'spouseIc', 'spousePhone', 'emergencyPhone']);
    const rows = keys.map(([key, label]) => [label, secret.has(key) ? hidden(e[key] as string | number | null) : String(e[key] ?? '—')]);
    rows.push(['Fixed allowances', reveal ? e.fixedAllowances.map((item) => `${item.name}: RM ${item.amount.toFixed(2)}`).join('; ') || 'None' : '••••']);
    rows.push(['Spouse working', e.spouseWorking == null ? '—' : e.spouseWorking ? 'Yes' : 'No']);
    rows.push(['Children', e.children.map((child) => `${child.name}; DOB: ${child.dateOfBirth || '—'}; Studying: ${child.studying ? 'Yes' : 'No'}; OKU: ${child.disabled ? 'Yes' : 'No'}`).join('\n') || 'None']);
    rows.push(['Education', e.education.map((item) => [item.level, item.course, item.institution, item.year].filter(Boolean).join(' · ')).join('\n') || '—']);
    return [{ title: 'Staff Profile', headers: ['Field', 'Value'], rows }, { title: 'Employment History', headers: ['Date', 'Event', 'Detail', 'From', 'To', 'Amount (RM)'], rows: report.career.map((entry) => {
      const pay = /increment|salary|hourly|bonus/i.test(`${entry.kind} ${entry.detail}`);
      return [entry.date || '—', entry.kind, entry.detail, pay ? hidden(entry.from) : entry.from, pay ? hidden(entry.to) : entry.to, hidden(entry.amount)];
    }) }];
  }
  if (report.kind === 'review') {
    const r = report.review;
    return [{ title: 'Performance Review', headers: ['Field', 'Value'], rows: [['Staff', r.staffName], ['Code', r.employeeCode], ['Position', r.position], ['Department', r.department], ['Assessor', r.assessorName], ['Period', r.periodLabel], ['From', r.periodStart || '—'], ['To', r.periodEnd || '—'], ['Score', r.totalScore ?? '—'], ['Percentage', percentLabel(r.totalScore)], ['Overall', r.overall || '—'], ['Improvement', r.improvement], ['Training', r.training], ['Employee comments', r.employeeComments], ['PIP', r.pip], ['PIP start', r.pipStart || '—'], ['PIP remarks', r.pipRemarks], ['HR received on', r.hrReceivedOn || '—'], ['HR received by', r.hrReceivedBy], ['HR remarks', r.hrRemarks]] }, { title: 'Ratings', headers: ['Area', 'Weight (%)', 'Criterion', 'Rating (1–4)'], rows: AREAS.flatMap((area) => area.criteria.map((criterion, index) => [area.label, area.weight, criterion, r.ratings[area.key]?.[index] ?? '—'])) }];
  }
  return [{ title: 'Incentive Summary', headers: ['Staff', 'Code', 'Branch', 'Month', 'Entries', 'Claimed (RM)', 'Approved (RM)', 'Approved by', 'HR received on', 'HR received by'], rows: report.claims.map((claim) => [claim.staffName, claim.staffCode, claim.branch, claim.month, claim.entries.length, claimTotal(claim.entries), approvedTotal(claim.entries), claim.approvedBy, claim.hrReceivedAt || '—', claim.hrReceivedBy || '—']) }, { title: 'Incentive Entries', headers: ['Staff', 'Code', 'Branch', 'Month', 'Date', 'Patient', 'Incentive code', 'Amount (RM)', 'Clinic check'], rows: report.claims.flatMap((claim) => claim.entries.map((entry) => [claim.staffName, claim.staffCode, claim.branch, claim.month, entry.date, entry.patient || '—', entry.code, entry.rm, entry.review || '—'])) }];
}

// CSV cells that look like formulas remain text when opened in a spreadsheet.
export const csvCell = (value: string | number) => `"${String(typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
export function downloadReportCsv(sections: ReportSection[], name: string) {
  const lines = sections.flatMap((section, index) => [...(index ? [[]] : []), ...(section.title ? [[section.title]] : []), ...(section.note ? [[section.note]] : []), section.headers, ...section.rows]);
  const blob = new Blob(['\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${name}.csv`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadReportExcel(sections: ReportSection[], name: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const header = { fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#0B3D59', wrap: true };
  const sheets = sections.map((section, index) => ({
    sheet: `${index + 1} ${section.title || 'Report'}`.replace(/[\\/?*\[\]:]/g, '').slice(0, 31),
    data: [...(section.note ? [section.headers.map((_, column) => ({ value: column === 0 ? section.note || '' : '', wrap: true }))] : []), section.headers.map((value) => ({ ...header, value })), ...section.rows.map((row, rowIndex) => row.map((value, column) => { const color = section.roster && column > 0 ? rosterShiftColor(value) : undefined; const backgroundColor = section.cellColors?.[rowIndex]?.[column]; return { value, wrap: true, ...(color ? { backgroundColor: color.backgroundColor, textColor: color.textColor, fontWeight: 'bold' as const } : {}), ...(backgroundColor ? { backgroundColor } : {}) }; }))],
    columns: section.headers.map((_, column) => ({ width: column === 0 ? 34 : 24 })), stickyRowsCount: section.note ? 2 : 1,
  }));
  await writeExcelFile(sheets, { fontFamily: 'Arial', fontSize: 10 }).toFile(`${name}.xlsx`);
}
