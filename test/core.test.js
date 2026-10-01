import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../src/core.js';

function toBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

test('empty input round-trips', () => {
  assert.equal(encode(new Uint8Array(0)), '');
  assert.deepEqual(decode(''), new Uint8Array(0));
});

test('RFC 4648 section 10 test vectors', () => {
  const cases = [
    ['', ''],
    ['66', 'CO======'],
    ['666f', 'CPNG===='],
    ['666f6f', 'CPNMU==='],
    ['666f6f62', 'CPNMUOG='],
    ['666f6f6261', 'CPNMUOJ1'],
  ];
  for (const [hex, expected] of cases) {
    const bytes = toBytes(hex);
    assert.equal(encode(bytes), expected, 'encode ' + hex);
    assert.deepEqual(decode(expected), bytes, 'decode ' + expected);
  }
});

test('lowercase input decodes to the same bytes as uppercase', () => {
  assert.deepEqual(decode('cpnmuoj1'), toBytes('666f6f6261'));
  assert.deepEqual(decode('CpNmUoJ1'), toBytes('666f6f6261'));
});

test('decode rejects non-canonical leftover bits', () => {
  // 'C0======' would mean symbol '0' (value 0) with 3 leftover bits that are 0,
  // which is canonical for a 0-byte output... actually it's not a valid length.
  // Instead: 'C1======' -> symbol '1' = 0b00001, leftover 3 bits = 0b001, non-zero.
  assert.throws(() => decode('C1======'), /leftover/);
});

test('decode rejects invalid padding length', () => {
  assert.throws(() => decode('CO==='), /multiple of 8|invalid padding/);
  assert.throws(() => decode('CO====='), /multiple of 8|invalid padding/);
});

test('decode rejects wrong padding for data length', () => {
  // 'CPNMUOJ1' is a full 5-byte block with no padding; tacking on '=' is wrong.
  assert.throws(() => decode('CPNMUOJ1='), /multiple of 8|padding/);
});

test('decode rejects non-alphabet characters', () => {
  assert.throws(() => decode('CPNM!OJ1'), /invalid character/);
  assert.throws(() => decode('CPNM OJ1'), /invalid character/);
});

test('decode tolerates trailing whitespace', () => {
  assert.deepEqual(decode('CPNMUOJ1  \n'), toBytes('666f6f6261'));
});

test('encode rejects non-Uint8Array input', () => {
  assert.throws(() => encode([]), /Uint8Array/);
  assert.throws(() => encode('foo'), /Uint8Array/);
});

test('decode rejects non-string input', () => {
  assert.throws(() => decode(42), /string/);
  assert.throws(() => decode(null), /string/);
});

test('all 256 byte values survive a round trip', () => {
  const input = new Uint8Array(256);
  for (let i = 0; i < 256; i++) input[i] = i;
  const encoded = encode(input);
  assert.deepEqual(decode(encoded), input);
});

test('single byte encodes and decodes', () => {
  const b = new Uint8Array([0xff]);
  assert.equal(encode(b), 'VS======');
  assert.deepEqual(decode('VS======'), b);
});
