// Files for the statutory portals, laid out as Infotech writes them (each checked byte for byte against an October 2026 file).
// Amounts come in as ringgit and go out as sen with leading zeros.

const sen = (ringgit: number, width: number) => String(Math.round(ringgit * 100)).padStart(width, '0');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const pad = (text: string, width: number) => text.slice(0, width).padEnd(width, ' ');

export type EpfRow = { memberNo: string; ic: string; name: string; code: string; employer: number; employee: number; wages: number };

// KWSP "EPF Monthly Form A" text file: 129 characters a line, CRLF. One header, one batch line, one line a member, one footer.
// `generated` is the day the file is made (YYYYMMDD); `contributionMonth` is shown as MMYYYY in the batch line.
export function epfFormA(input: { employerEpfNo: string; generated: string; contributionMonth: string; rows: EpfRow[] }) {
  const employerNo = digits(input.employerEpfNo);
  const rows = [...input.rows].sort((a, b) => a.code.localeCompare(b.code));
  const employerTotal = rows.reduce((sum, row) => sum + Math.round(row.employer * 100), 0) / 100;
  const employeeTotal = rows.reduce((sum, row) => sum + Math.round(row.employee * 100), 0) / 100;
  const memberSum = rows.reduce((sum, row) => sum + Number(digits(row.memberNo)), 0);
  const line = (text: string) => pad(text, 129);
  const out = [
    line(`00EPF MONTHLY FORM A${input.generated}00001${sen(employerTotal, 15)}${sen(employeeTotal, 15)}${'0'.repeat(13)}${employerNo.replace(/^0/, '').padStart(8, '0')}`),
    line(`01${employerNo.padStart(19, '0')}${input.contributionMonth}DSK0000100000000`),
    ...rows.map((row) => line(`02${'0'.repeat(11)}${digits(row.memberNo).padStart(8, '0')}${digits(row.ic).padStart(12, '0')}   ${pad(row.name, 40)}${pad(row.code, 20)}${sen(row.employer, 9)}${sen(row.employee, 9)}${sen(row.wages, 15)}`)),
    line(`99${String(rows.length).padStart(7, '0')}${sen(employerTotal, 15)}${sen(employeeTotal, 15)}${String(memberSum).padStart(21, '0')}`),
  ];
  return out.join('\r\n') + '\r\n';
}
