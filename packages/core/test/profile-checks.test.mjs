import assert from 'node:assert/strict';
import test from 'node:test';
import { quotePresent, highlightUrl, evaluatePassive } from '../src/profile-checks.ts';

test('a quote matches across HTML tags, entities, markdown emphasis and line wraps', () => {
  const html = '<p>You add <strong>credits</strong> to your&nbsp;account,\n and Console keeps them.</p>';
  assert.equal(quotePresent(html, 'text/html', 'You add credits to your account, and Console keeps them.'), true);
  assert.equal(quotePresent('**Each IO Credit is equivalent to 1 USD**', 'text/markdown', 'Each IO Credit is equivalent to 1 USD'), true);
});

test('a quote that is not on the page, or only partly there, does not match', () => {
  assert.equal(quotePresent('<p>Fees are 2%.</p>', 'text/html', 'Fees are 3%.'), false);
  assert.equal(quotePresent('<p>Fees are</p>', 'text/html', 'Fees are 2%.'), false);
});

test('a quote that normalizes to nothing never matches', () => {
  assert.equal(quotePresent('<p>Anything at all.</p>', 'text/html', '***'), false);
  assert.equal(quotePresent('Anything at all.', 'text/markdown', '  `_` '), false);
});

test('numeric entities decode and tags before punctuation do not leave a stray space', () => {
  assert.equal(quotePresent('<p>It&#8217;s billed hourly.</p>', 'text/html', "It's billed hourly."), true);
  assert.equal(quotePresent('<p>It&#x27;s billed hourly.</p>', 'text/html', "It's billed hourly."), true);
  assert.equal(quotePresent('<p>You add <strong>credits</strong>, then pay.</p>', 'text/html', 'You add credits, then pay.'), true);
});

test('highlight links use a text fragment of the first words of the quote', () => {
  assert.equal(
    highlightUrl('https://docs.example/fees', 'Buyers pay a 2% fee on every lease, billed monthly in arrears.'),
    'https://docs.example/fees#:~:text=Buyers%20pay%20a%202%25%20fee%20on%20every%20lease%2C%20billed%20monthly',
  );
});

test('highlight links keep the quote text as written, only collapsing whitespace', () => {
  assert.equal(
    highlightUrl('https://docs.example/fees#top', 'It’s  **free**\nfor buyers'),
    'https://docs.example/fees#:~:text=It%E2%80%99s%20**free**%20for%20buyers',
  );
});

const now = new Date('2026-11-22T00:00:00Z');
const observation = (over = {}) => ({
  url: 'https://docs.example/',
  tls: { authorized: true, validTo: '2027-01-01T00:00:00Z', subjectAltNames: ['DNS:docs.example'] },
  headers: { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff' },
  securityTxt: true,
  ...over,
});

test('passive evaluation passes a valid matching certificate, HSTS headers and security.txt', () => {
  assert.deepEqual(evaluatePassive(observation(), now), { 'https-certificate': 'pass', 'security-headers': 'pass', 'security-contact': 'pass' });
});

test('wildcard certificates match one label; expired or mismatched certificates fail', () => {
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: '2027-01-01T00:00:00Z', subjectAltNames: ['DNS:*.example'] } }), now)['https-certificate'], 'pass');
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: '2026-01-01T00:00:00Z', subjectAltNames: ['DNS:docs.example'] } }), now)['https-certificate'], 'fail');
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: '2027-01-01T00:00:00Z', subjectAltNames: ['DNS:other.example'] } }), now)['https-certificate'], 'fail');
});

test('missing observations stay unknown; absent security.txt is unknown, not a fail', () => {
  const r = evaluatePassive(observation({ tls: null, headers: null, securityTxt: false }), now);
  assert.deepEqual(r, { 'https-certificate': 'unknown', 'security-headers': 'unknown', 'security-contact': 'unknown' });
});

test('HSTS without another baseline header fails the header check', () => {
  assert.equal(evaluatePassive(observation({ headers: { 'strict-transport-security': 'max-age=1' } }), now)['security-headers'], 'fail');
});

test('an unparseable certificate expiry is unknown; a trailing dot in the host still matches', () => {
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: 'not a date', subjectAltNames: ['DNS:docs.example'] } }), now)['https-certificate'], 'unknown');
  assert.equal(evaluatePassive(observation({ url: 'https://docs.example./' }), now)['https-certificate'], 'pass');
});
