import assert from 'node:assert/strict';
import { lockedPayslipPdf, payslipMessage, payslipPassword, sendThroughBrevo, PAYSLIP_SENDER } from '../api/_payslip-email.ts';

assert.equal(payslipPassword({ ic_no: '900101-10-1234' })!.password, '900101101234');
assert.equal(payslipPassword({ ic_no: '', passport_no: 'a 1234567' })!.password, 'A1234567');
assert.equal(payslipPassword({ ic_no: '1234', passport_no: '' }), null);
// The smallest JPEG picture there is, to make a locked file of.
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const pdf = (await lockedPayslipPdf(jpeg, '900101101234', 'Test')).toString('latin1');
assert.match(pdf, /\/Encrypt/); assert.match(pdf, /\/CFM \/AESV3/); assert.match(pdf, /\/V 5/);
assert.ok(!pdf.includes('900101101234'));
const message = payslipMessage('TEST PERSON', 11, 2026, payslipPassword({ ic_no: '900101101234' })!.hint);
assert.equal(message.subject, 'Payslip of the Month - November 2026'); assert.ok(!message.text.includes('900101101234'));
let sentBody: any, sentKey = '';
await sendThroughBrevo('test-key', { email: 'a@example.com', name: 'A' }, message, { name: 'p.pdf', content: Buffer.from('x') }, (async (url: any, init: any) => { assert.equal(url, 'https://api.brevo.com/v3/smtp/email'); sentKey = init.headers['api-key']; sentBody = JSON.parse(init.body); return new Response('{}', { status: 201 }); }) as typeof fetch);
assert.deepEqual([sentKey, sentBody.sender, sentBody.to, sentBody.attachment[0].content], ['test-key', PAYSLIP_SENDER, [{ email: 'a@example.com', name: 'A' }], 'eA==']);
await assert.rejects(sendThroughBrevo('k', { email: 'a@example.com', name: 'A' }, message, { name: 'p.pdf', content: Buffer.from('x') }, (async () => new Response('{"message":"Key not found"}', { status: 401 })) as typeof fetch), /Key not found/);
console.log('Payslip email checks passed.');
