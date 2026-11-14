import assert from 'node:assert/strict';
import { OnDemandCache } from '../src/lib/onDemandCache';

const cache = new OnDemandCache<number>();
let reads = 0;
const load = async () => ++reads;
assert.equal(await cache.read('ceo', load), 1);
for (let tab = 0; tab < 20; tab++) assert.equal(await cache.read('ceo', load), 1);
assert.equal(reads, 1); // Returning to the same summary never repeats its request.
assert.equal(await cache.read('clinical:KJ', load), 2);
assert.equal(await cache.read('clinical:SK', load), 3);
assert.equal(await cache.read('clinical:KJ', load), 2);
cache.invalidate('ceo');
assert.deepEqual(await Promise.all([cache.read('ceo', load), cache.read('ceo', load)]), [4, 4]);
assert.equal(reads, 4); // Concurrent subscribers share the same explicit refresh.
assert.equal(cache.get('clinical:SK'), 3);
await assert.rejects(cache.read('failed', async () => { throw new Error('offline'); }), /offline/);
assert.equal(cache.get('failed'), undefined);
assert.equal(await cache.read('failed', load), 5); // A failed read can be retried explicitly.
console.log('On-demand summaries passed: one read per key, navigation reuse, separate branches, explicit invalidation, shared in-flight requests and retry after failure.');
