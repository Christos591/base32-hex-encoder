/**
 * RFC 4648 Base32 with extended hex alphabet.
 *
 * The hex alphabet (0-9A-V) is case-insensitive and sorts in the same order as
 * the bytes it represents when viewed byte-by-byte from the left. That property
 * is why a database of short opaque tokens might prefer it over the A-Z2-7
 * alphabet: tokens stay lexicographically comparable without decoding.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

// Precomputed lookup for a single base32-hex character to its 5-bit value.
// Accepts both ASCII cases. -1 marks invalid characters so decode can report
// the precise failure that a `NaN` coercion would hide.
const DECODE_TABLE = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    const upper = ALPHABET.charCodeAt(i);
    t[upper] = i;
    if (upper >= 65 && upper <= 90) t[upper + 32] = i; // lowercase mirror
  }
  return t;
})();

/**
 * Minimum number of base32-hex symbols needed to hold n bytes.
 */
const symbolsForBytes = (n) => (n === 0 ? 0 : 8 * n % 5 === 0 ? 8 * n / 5 : Math.ceil(8 * n / 5));

/**
 * Number of padding '=' symbols produced when encoding n bytes.
 */
const paddingForBytes = (n) => {
  if (n === 0) return 0;
  const s = symbolsForBytes(n);
  const mod = (8 * n) % 5;
  // The alphabet holds 5 bits per symbol; trailing zero bits that fall outside
  // any full byte must be padded so the symbol count is a multiple of 8.
  return mod === 0 ? 0 : 8 - (s % 8 === 0 ? 8 : s % 8);
};

/**
 * Throw on a condition that should never occur in a correct caller.
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Encode a Uint8Array into RFC 4648 base32-hex, with '=' padding to the next
 * multiple of eight symbols. An empty input yields the empty string.
 *
 * We build symbols one at a time rather than unrolling a 5-byte / 8-symbol
 * block: the bit-packing at the tail is the only genuinely tricky part of
 * base32, and a single streaming loop keeps it in one visible place.
 */
export function encode(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('encode: expected Uint8Array');
  if (bytes.length === 0) return '';

  const symbolCount = symbolsForBytes(bytes.length);
  const out = new Array(symbolCount);
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let outPos = 0;

  for (let i = 0; i < bytes.length; i++) {
    bitBuffer = (bitBuffer << 8) | bytes[i];
    bitsInBuffer += 8;
    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      const idx = (bitBuffer >>> bitsInBuffer) & 0x1f;
      out[outPos++] = ALPHABET[idx];
    }
  }

  // Flush the remaining 1-4 bits, zero-padded on the right.
  if (bitsInBuffer > 0) {
    const idx = (bitBuffer << (5 - bitsInBuffer)) & 0x1f;
    out[outPos++] = ALPHABET[idx];
  }

  assert(outPos === symbolCount, 'encode: symbol count mismatch');

  let s = out.join('');
  const pad = paddingForBytes(bytes.length);
  if (pad > 0) s += '='.repeat(pad);
  return s;
}

/**
 * Decode a base32-hex string into a Uint8Array.
 *
 * Decoding is case-insensitive. '=' padding is optional in length but, when
 * present, must be the canonical amount for a correct encoding; a stray '='
 * in the middle is rejected as malformed. Trailing whitespace is tolerated
 * because tokens are routinely copy-pasted and frequently acquire it; any
 * other non-alphabet character is an error.
 */
export function decode(str) {
  if (typeof str !== 'string') throw new TypeError('decode: expected string');

  const len = str.length;
  let end = len;
  while (end > 0) {
    const c = str.charCodeAt(end - 1);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) end--;
    else break;
  }
  if (end === 0) return new Uint8Array(0);

  let dataLen = end;
  let padCount = 0;
  while (dataLen > 0 && str.charCodeAt(dataLen - 1) === 0x3d) {
    padCount++;
    dataLen--;
  }

  if (padCount > 0 && padCount !== 6 && padCount !== 4 && padCount !== 3 && padCount !== 1) {
    throw new Error('decode: invalid padding length ' + padCount);
  }

  // The canonical symbol block size is 8. We validate the whole input's
  // length is a multiple of 8 once, here, rather than per-symbol in the loop.
  if ((dataLen + padCount) % 8 !== 0) {
    throw new Error('decode: symbol count ' + (dataLen + padCount) + ' is not a multiple of 8');
  }

  const maxBytes = Math.floor((dataLen * 5) / 8);
  const out = new Uint8Array(maxBytes);
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let outPos = 0;

  for (let i = 0; i < dataLen; i++) {
    const c = str.charCodeAt(i);
    if (c >= 128) throw new Error('decode: non-ASCII character at index ' + i);
    const v = DECODE_TABLE[c];
    if (v < 0) throw new Error('decode: invalid character at index ' + i);

    bitBuffer = (bitBuffer << 5) | v;
    bitsInBuffer += 5;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      out[outPos++] = (bitBuffer >>> bitsInBuffer) & 0xff;
    }
  }

  // Leftover bits must be zero, else the input is not canonical.
  if (bitsInBuffer > 0) {
    const leftover = (bitBuffer & ((1 << bitsInBuffer) - 1)) << (8 - bitsInBuffer);
    if (leftover !== 0) throw new Error('decode: non-zero leftover bits');
  }

  if (padCount > 0) {
    const expectedSymbols = symbolsForBytes(outPos);
    if (expectedSymbols !== dataLen) {
      throw new Error('decode: padding does not match data length');
    }
  }

  if (outPos === out.length) return out;
  return out.subarray(0, outPos);
}
