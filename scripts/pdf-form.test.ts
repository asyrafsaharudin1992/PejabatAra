import assert from 'node:assert/strict';
import { choiceRow, DEFAULT_ROLES, keyOf, missing, place, type Field } from '../src/pdfForm/model.ts';

const row = choiceRow({ page: 0, x: 0.4, y: 0.5 }, { x: 0.8, y: 0.5 }, ['1', '2', '3', '4', '5'], 'staff', 'Gaji');
assert.equal(row.length, 5);
assert.equal(new Set(row.map(keyOf)).size, 1, 'A row shares one answer');
assert.ok(Math.abs((row[2].x + row[2].w / 2) - 0.6) < 1e-9, 'Choices are spread evenly');
const text: Field = { id: 't', type: 'text', page: 0, x: 0, y: 0, w: 0.25, h: 0.02, who: 'staff', label: 'Name', required: true };
const moved = place(text, 2, -1); assert.deepEqual([moved.x, moved.y], [0.75, 0], 'A field stays on the page');
const form = { title: 'x', roles: DEFAULT_ROLES, fields: [...row, text, { ...text, id: 'h', who: 'hr' }] };
assert.equal(missing(form, 'staff', {}).length, 2);
assert.equal(missing(form, 'staff', { [keyOf(row[0])]: '3', t: 'Ali' }).length, 0);
console.log('PDF form checks passed.');

import { activeRoles, allDone, cleanAnswers, cleanLayout } from '../src/pdfForm/model.ts';
const roles = [...DEFAULT_ROLES, { id: 'dir', label: 'Director' }];
const fields = [...row, text, { ...text, id: 's', type: 'signature' as const, who: 'dir' }];
assert.deepEqual(activeRoles({ roles, fields }).map((role) => role.id), ['staff', 'dir']);
assert.equal(allDone({ roles, fields }, { staff: { at: '', by: '' } }), false);
assert.equal(allDone({ roles, fields }, { staff: { at: '', by: '' }, dir: { at: '', by: '' } }), true);
const saved = cleanAnswers(fields, 'staff', { [keyOf(row[0])]: '9', t: 'Ali', s: 'data:image/png;base64,AAAA' });
assert.deepEqual(saved, { t: 'Ali' }, 'A choice that is not offered and another person\'s field are not saved');
assert.deepEqual(cleanAnswers(fields, 'dir', { s: 'javascript:alert(1)' }), {});
assert.equal(cleanLayout(roles, [{ ...text, who: 'nobody' }, text]).fields.length, 1);
console.log('PDF form sending checks passed.');

import { detectFields } from '../src/pdfForm/detect.ts';
const w = (text: string, x: number, y: number, width = text.length * 0.008) => ({ text, x, y, w: width, h: 0.012 });
const found = detectFields([
  w('Nama : ______________', 0.1, 0.1, 0.3),
  w('Beban kerja', 0.1, 0.2), w('1', 0.4, 0.2), w('2', 0.5, 0.2), w('3', 0.6, 0.2), w('4', 0.7, 0.2), w('9', 0.8, 0.2),
  w('Pulangan harta:', 0.1, 0.3), w('◻ Laptop', 0.1, 0.32),
  w('Adakah anda akan kembali?', 0.1, 0.4), w('YA / TIDAK', 0.15, 0.42),
  w('Apa pendapat anda?', 0.1, 0.5), w('Tandatangan pekerja:', 0.1, 0.7),
], 0);
const of = (type: string) => found.filter((field) => field.type === type);
assert.deepEqual(of('text').map((field) => [field.label, field.source]), [['Nama', 'name']]);
assert.equal(of('check').length, 1);
assert.deepEqual([...new Set(of('choice').map((field) => field.group))].length, 2);
assert.deepEqual(of('choice').slice(0, 5).map((field) => field.value), ['1', '2', '3', '4', '9']);
assert.equal(of('choice')[0].label, 'Beban kerja');
assert.equal(of('paragraph').length, 1);
assert.equal(of('signature').length, 1);
console.log('Automatic box placement checks passed.');

const table = detectFields([
  w('Sangat', 0.38, 0.16, 0.05), w('Memuaskan', 0.37, 0.172, 0.07), w('Tidak', 0.48, 0.17, 0.05), w('Sila beri pandangan anda mengenai perkara berikut dengan membulatkan nombor yang sesuai', 0.1, 0.14, 0.75),
  w('Gaji', 0.1, 0.2), w('1', 0.4, 0.2), w('2', 0.5, 0.2), w('3', 0.6, 0.2), w('4', 0.7, 0.2),
  w('Faedah', 0.1, 0.24), w('1', 0.4, 0.24), w('2', 0.5, 0.24), w('3', 0.6, 0.24), w('4', 0.7, 0.24),
], 0);
assert.deepEqual(table.slice(0, 2).map((field) => field.hint), ['Sangat Memuaskan', 'Tidak']);
assert.equal(table[4].hint, 'Sangat Memuaskan', 'Every row of a table has the same meanings');
assert.equal(cleanLayout(roles, table).fields[0].hint, 'Sangat Memuaskan');
console.log('Rating meanings checks passed.');
