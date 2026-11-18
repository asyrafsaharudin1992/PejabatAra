// The KWSP, PERKESO / EIS and ePCB text files, read back as tables so HR can check them on screen before uploading. The positions are the ones the files are written with
// (see payrollFiles.ts); nothing is changed, this only reads the file that would be downloaded.
export type FilePreview = { summary: [string, string][]; head: string[]; rows: string[][]; money: number[]; secret: number[] };
const sen = (text: string) => (Number(text.trim() || 0) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const text = (value: string) => value.trim();

export function previewStatutory(kind: 'epf' | 'socso' | 'epcb', content: string): FilePreview {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (kind === 'epf') {
    const header = lines.find((line) => line.startsWith('00')) || '', batch = lines.find((line) => line.startsWith('01')) || '', footer = lines.find((line) => line.startsWith('99')) || '';
    const members = lines.filter((line) => line.startsWith('02'));
    return {
      summary: [['File', text(header.slice(2, 21))], ['Date made', header.slice(21, 29)], ['Contribution month (MMYYYY)', batch.slice(21, 27)], ['Members', String(Number(footer.slice(2, 9) || members.length))], ['Employer total (RM)', sen(footer.slice(9, 24))], ['Employee total (RM)', sen(footer.slice(24, 39))]],
      head: ['Member no.', 'IC no.', 'Name', 'Staff code', 'Employer (RM)', 'Employee (RM)', 'Wages (RM)'],
      rows: members.map((line) => [line.slice(13, 21), line.slice(21, 33), text(line.slice(36, 76)), text(line.slice(76, 96)), sen(line.slice(96, 105)), sen(line.slice(105, 114)), sen(line.slice(114, 129))]),
      money: [4, 5, 6], secret: [1],
    };
  }
  if (kind === 'socso') {
    const rows = lines.map((line) => [line.slice(32, 44), text(line.slice(44, 194)), line.slice(194, 200), sen(line.slice(208, 214)), sen(line.slice(214, 220)), sen(line.slice(220, 226)), sen(line.slice(226, 232)), sen(line.slice(232, 238)), text(line.slice(238, 244)) ? sen(line.slice(238, 244)) : '']);
    const sum = (at: number) => rows.reduce((total, row) => total + Number((row[at] || '0').replace(/,/g, '')), 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      summary: [['Employer PERKESO no.', text(lines[0]?.slice(0, 12) || '')], ['Wage month (MMYYYY)', lines[0]?.slice(194, 200) || ''], ['Members', String(rows.length)], ['PERKESO employer + employee (RM)', (Number(sum(4).replace(/,/g, '')) + Number(sum(5).replace(/,/g, ''))).toLocaleString('en-MY', { minimumFractionDigits: 2 })], ['EIS employer + employee (RM)', (Number(sum(6).replace(/,/g, '')) + Number(sum(7).replace(/,/g, ''))).toLocaleString('en-MY', { minimumFractionDigits: 2 })], ['SKBBK (RM)', sum(8)]],
      head: ['IC no.', 'Name', 'Wage month', 'Wages (RM)', 'PERKESO employer', 'PERKESO employee', 'EIS employer', 'EIS employee', 'SKBBK'],
      rows, money: [3, 4, 5, 6, 7, 8], secret: [0],
    };
  }
  const header = lines.find((line) => line.startsWith('H')) || '';
  const details = lines.filter((line) => line.startsWith('D'));
  return {
    summary: [['Employer E no.', header.slice(1, 11)], ['Pay month', `${header.slice(31, 35)}-${header.slice(35, 37)}`], ['Total PCB (RM)', sen(header.slice(37, 47))], ['Staff with PCB', String(Number(header.slice(47, 52) || 0))], ['Staff listed', String(details.length)]],
    head: ['Tax no.', 'Name', 'IC no.', 'PCB (RM)', 'CP38 (RM)', 'Code'],
    rows: details.map((line) => [line.slice(1, 12), text(line.slice(12, 84)), line.slice(84, 96), sen(line.slice(110, 118)), sen(line.slice(118, 126)), text(line.slice(126))]),
    money: [3, 4], secret: [0, 2],
  };
}
