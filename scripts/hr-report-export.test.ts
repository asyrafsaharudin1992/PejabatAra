import assert from 'node:assert/strict';
import { csvCell, reportExportSections, type ForecastReport } from '../src/lib/hrReportExport';
const report: ForecastReport = { kind: 'forecast', months: ['2026-11', '2026-12'], branches: ['KJ', 'SK'], plan: { rows: [], cells: {} }, probation: {}, subtitle: 'KJ and SK · Nov–Dec 2026', people: [
  { id: 'a', name: 'ATHIRAH', code: 'ARA0059', company: 'KJ', designation: 'CLINIC ASSISTANT', joinDate: '2026-06-03', confirmDate: '2026-09-08', resignDate: null, employmentType: 'Permanent', status: 'Active' },
  { id: 'b', name: 'LEFT CA', code: 'SK0001', company: 'SK', designation: 'CLINIC ASSISTANT', joinDate: '2026-01-01', confirmDate: '2026-04-01', resignDate: '2026-11-20', employmentType: 'Permanent', status: 'Inactive' },
] };
const sections = reportExportSections(report, false);
assert.equal(sections.length, 2);
assert.deepEqual(sections[0].headers, ['No.', '2026-11', '2026-12']);
assert.equal(sections[0].rows[0][1], 'ATHIRAH · Permanent');
assert.equal(sections[0].cellColors?.[0][1], '#f8ccb3');
assert.match(String(sections[1].rows[0][1]), /LEFT CA · Resigned/);
assert.equal(sections[1].rows[0][2], '');
assert.equal(csvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
assert.equal(csvCell('A "quoted" name'), '"A ""quoted"" name"');
console.log('HR report export passed: branch sections, monthly staff names, status colours, departure cutoff and CSV escaping.');
