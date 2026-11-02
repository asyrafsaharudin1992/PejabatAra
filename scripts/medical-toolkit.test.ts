import assert from 'node:assert/strict';
import { calculateDoseVolume, medicalResources } from '../src/lib/medicalToolkit';
// These are arithmetic fixtures, not prescribing recommendations.
assert.equal(calculateDoseVolume(10, 120, 5, 15), 6.25);
assert.equal(calculateDoseVolume(12.5, 125.5, 2.5, 7.25), 12.5 * 7.25 / 125.5 * 2.5);
for (let i = 0; i < 4; i++) for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
  const values = [10, 120, 5, 15]; values[i] = invalid;
  assert.equal(calculateDoseVolume(...values as [number, number, number, number]), null);
}
assert.equal(calculateDoseVolume(Number.MAX_VALUE, 1, 1, Number.MAX_VALUE), null);
assert.equal(calculateDoseVolume(1, Number.MAX_VALUE, Number.MIN_VALUE, Number.MIN_VALUE), null);
assert.equal(medicalResources.length, 5);
assert.equal(new Set(medicalResources.map((r) => r.href)).size, 5);
for (const resource of medicalResources) assert.equal(new URL(resource.href).protocol, 'https:');
console.log('Medical Toolkit: volume arithmetic, decimal precision, invalid/overflow/underflow inputs and resource links passed.');
