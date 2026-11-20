import assert from 'node:assert/strict';
import { emptyTaxDetails, validateTaxProfile, taxPayrollPatch } from '../src/lib/hrTaxDetails';

assert.deepEqual(validateTaxProfile(emptyTaxDetails()), { disabled: null, spouseDisabled: null, childExemptions: [] });
const details = { disabled: true, spouseDisabled: false, childExemptions: [{ category: 'Studying', percentage: 50 }, { category: 'NONE', percentage: null }] };
assert.deepEqual(validateTaxProfile(details), details);
assert.deepEqual(validateTaxProfile({ ...details, childExemptions: [] }).childExemptions, []); // All rows can be deleted.
for (const child of [{ category: '', percentage: 100 }, { category: 'NONE', percentage: 100 }, { category: 'Studying', percentage: null }, { category: 'Studying', percentage: 200 }, { category: 'Studying', percentage: '50' }]) {
  assert.throws(() => validateTaxProfile({ ...details, childExemptions: [child] }));
}
assert.throws(() => validateTaxProfile({ ...details, disabled: 'false' }));
assert.throws(() => validateTaxProfile({ ...details, childExemptions: Array(21).fill({ category: 'NONE', percentage: null }) }));
const existing = { epfRate: 11, taxResident: true, pcbApplied: true, taxType: 'Normal Remuneration', retirementDate: '2070-12-31', taxDetails: details };
const incoming = { taxResident: false, pcbApplied: false, taxType: 'Additional Remuneration', epfRate: 0, eis: false };
const merged = { ...existing, ...taxPayrollPatch(incoming) };
assert.equal(merged.epfRate, 11); // Editing tax must preserve unrelated statutory settings.
assert.equal(merged.retirementDate, '2070-12-31');
assert.equal(merged.taxResident, false);
assert.equal(merged.pcbApplied, false);
assert.equal(merged.taxType, 'Additional Remuneration');
assert.deepEqual(merged.taxDetails, details);
assert.deepEqual(taxPayrollPatch({}), {}); // Older profile requests keep current tax flags.
assert.deepEqual(taxPayrollPatch({ taxType: '' }), { taxType: '' });
assert.throws(() => taxPayrollPatch({ pcbApplied: 'false' }));
console.log('HR tax details validation and payroll preservation passed.');
