// Run: npx tsx scripts/review-template.test.ts
import assert from 'node:assert/strict';
import { customPercent, customScore, gradeFor, isChoice, resolveAnswers, templateMax, validateTemplate } from '../src/lib/reviewTemplate';

const rubric = validateTemplate({
  name: 'Borang Penilaian Temuduga', subject: 'candidate', outcomes: ['Ambil', 'Tolak', 'KIV'],
  items: [
    { name: 'Penampilan Fizikal', options: [{ label: 'Tidak menyenangkan', score: 1 }, { label: 'Tidak bermaya', score: 2 }, { label: 'Baik', score: 4 }, { label: 'Sesuai', score: 5 }, { label: 'Sangat baik', score: 6 }] },
    { name: 'Pengalaman', options: [{ label: '0 tahun', score: 1 }, { label: '1-2 tahun', score: 3 }, { label: '4 tahun', score: 5 }] },
    { name: 'Komunikasi', max: 4 },
  ],
  grades: [{ min: 27, label: 'Gred B (RM1,800.00)' }, { min: 36, label: 'Gred A (RM1,900.00)' }, { min: 45, label: 'Gred AA (RM2,000.00)' }, { min: 5, label: '  ' }],
});
assert.equal(rubric.subject, 'candidate');
assert.equal(rubric.items[0].max, 6); assert.equal(rubric.items[1].max, 5); assert.equal(rubric.items[2].max, 4);   // a choose-one item's full mark is its highest score
assert.ok(isChoice(rubric.items[0]) && !isChoice(rubric.items[2]));
assert.equal(templateMax(rubric.items), 15);
assert.equal(rubric.grades.length, 3);                                                                              // a grade without a name is dropped
assert.equal(validateTemplate({ name: 'x', items: [{ name: 'a', max: 1 }] }).subject, 'staff');

// Answers: a choice index for a choose-one item, a typed mark for a marked one
assert.deepEqual(resolveAnswers(rubric.items, [null, null, 3.5], [4, 1, null]), { marks: [6, 3, 3.5], choices: [4, 1, null] });
assert.match((resolveAnswers(rubric.items, [null, null, 3.5], [null, 1, null]) as { error: string }).error, /item 1/i);   // an item left unanswered
assert.match((resolveAnswers(rubric.items, [null, null, 3.5], [9, 1, null]) as { error: string }).error, /item 1/i);      // a choice that does not exist
assert.match((resolveAnswers(rubric.items, [null, null, 5], [0, 0, null]) as { error: string }).error, /item 3/i);        // above the full mark
assert.match((resolveAnswers(rubric.items, [null, null, ''], [0, 0, null]) as { error: string }).error, /item 3/i);       // a marked item left empty
assert.match((resolveAnswers(rubric.items, [null, null, 3.3], [0, 0, null]) as { error: string }).error, /item 3/i);      // not a half step

// Totals and grades
assert.equal(customScore([6, 5, 4], rubric.items), 4); assert.equal(customPercent([6, 5, 4], rubric.items), 100);
assert.equal(customScore([3, 2.5, 2], rubric.items), 2);
assert.equal(gradeFor(48, rubric.grades), 'Gred AA (RM2,000.00)'); assert.equal(gradeFor(45, rubric.grades), 'Gred AA (RM2,000.00)');
assert.equal(gradeFor(40, rubric.grades), 'Gred A (RM1,900.00)'); assert.equal(gradeFor(27, rubric.grades), 'Gred B (RM1,800.00)'); assert.equal(gradeFor(20, rubric.grades), '');

// What HR can get wrong
for (const [bad, why] of [
  [{ name: 'x', items: [{ name: 'a', options: [{ label: 'only one', score: 1 }] }] }, /2 to 8 choices/],
  [{ name: 'x', items: [{ name: 'a', options: [{ label: '', score: 1 }, { label: 'b', score: 2 }] }] }, /choice text/],
  [{ name: 'x', items: [{ name: 'a', options: [{ label: 'a', score: 0 }, { label: 'b', score: 0 }] }] }, /more than 0/],
  [{ name: 'x', items: [{ name: 'a', options: [{ label: 'a', score: 1.3 }, { label: 'b', score: 2 }] }] }, /steps of 0.5/],
  [{ name: 'x', items: [{ name: 'a', max: 5 }], grades: [{ min: -1, label: 'g' }] }, /minimum score/],
] as const) assert.throws(() => validateTemplate(bad), why);
console.log('review-template: all checks passed.');
