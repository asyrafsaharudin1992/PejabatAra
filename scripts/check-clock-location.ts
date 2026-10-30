import assert from 'node:assert/strict';
import { ClockLocationError, requestClockLocation } from '../src/lib/clockLocation.js';

async function main() {
  let requested = false;
  const allowed: Pick<Geolocation, 'getCurrentPosition'> = {
    getCurrentPosition(success, _failure, options) {
      requested = true;
      assert.deepEqual(options, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      success({ coords: { latitude: 2.99, longitude: 101.67, accuracy: 12 } } as GeolocationPosition);
    },
  };
  const pending = requestClockLocation(true, allowed);
  assert(requested, 'The location request must start in the original click, without a prior async permission check.');
  assert.deepEqual(await pending, { lat: 2.99, lng: 101.67, accuracy: 12 });
  for (const [code, reason] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const) {
    const failed: Pick<Geolocation, 'getCurrentPosition'> = { getCurrentPosition(_success, failure) { failure?.({ code } as GeolocationPositionError); } };
    await assert.rejects(requestClockLocation(true, failed), cause => cause instanceof ClockLocationError && cause.reason === reason);
    assert.equal(await requestClockLocation(false, failed), null, 'Optional location must keep existing anywhere-clock behavior.');
  }
  await assert.rejects(requestClockLocation(true, null), cause => cause instanceof ClockLocationError && cause.reason === 'unavailable');
  assert.equal(await requestClockLocation(false, null), null);
  assert.deepEqual(await requestClockLocation(true, allowed), { lat: 2.99, lng: 101.67, accuracy: 12 }, 'A retry must make a fresh browser request after permission changes.');
  const point = (accuracy: number) => ({ coords: { latitude: 2.99, longitude: 101.67, accuracy } } as GeolocationPosition);
  const watcher = () => {
    let report: PositionCallback = () => {}, fail: PositionErrorCallback = () => {};
    const cleared: number[] = [];
    const provider = {
      getCurrentPosition: allowed.getCurrentPosition,
      watchPosition(success: PositionCallback, failure?: PositionErrorCallback | null) { report = success; fail = failure || (() => {}); return 7; },
      clearWatch(id: number) { cleared.push(id); },
    };
    return { provider, cleared, report: (accuracy: number) => report(point(accuracy)), fail: (code: number) => fail({ code } as GeolocationPositionError) };
  };
  const improved = watcher();
  let settled = false;
  const improving = requestClockLocation(true, improved.provider).then(value => { settled = true; return value; });
  improved.report(1800); await Promise.resolve();
  assert(!settled, 'Do not immediately reject the first weak fix.');
  improved.report(25);
  assert.equal((await improving)?.accuracy, 25);
  assert.deepEqual(improved.cleared, [7], 'Stop tracking immediately after an accurate fix.');
  const weak = watcher();
  const weakResult = requestClockLocation(true, weak.provider, { timeoutMs: 10 });
  weak.report(1500); weak.report(900); weak.report(1300);
  await assert.rejects(weakResult, cause => cause instanceof ClockLocationError && cause.reason === 'inaccurate' && cause.message.includes('900'));
  assert.deepEqual(weak.cleared, [7]);
  const denied = watcher();
  const deniedResult = requestClockLocation(true, denied.provider);
  denied.fail(1);
  await assert.rejects(deniedResult, cause => cause instanceof ClockLocationError && cause.reason === 'denied');
  assert.deepEqual(denied.cleared, [7]);
  const cancelled = watcher(), controller = new AbortController();
  const cancelledResult = requestClockLocation(true, cancelled.provider, { signal: controller.signal });
  controller.abort(); cancelled.report(5);
  await assert.rejects(cancelledResult, cause => cause instanceof ClockLocationError && cause.reason === 'cancelled');
  assert.deepEqual(cancelled.cleared, [7]);
  const immediate = { ...allowed, watchPosition(success: PositionCallback) { success(point(8)); return 9; }, clearWatch(id: number) { assert.equal(id, 9); } };
  assert.equal((await requestClockLocation(true, immediate))?.accuracy, 8);
  console.log('Clock location checks passed: immediate request, improving GPS, weak-fix deadline, permission denial, timeout, optional location, cancellation and watch cleanup.');
}
void main();
