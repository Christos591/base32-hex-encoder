# Base32 Hex Encoder

Encodes and decodes RFC 4648 Base32 with the extended hex alphabet (`0-9A-V`), case-insensitive, with canonical `=` padding.

```js
import { encode, decode } from './src/index.js';

const bytes = new Uint8Array([0x66, 0x6f, 0x6f]);
const text = encode(bytes);        // 'CPNMU==='
const back  = decode(text);       // Uint8Array [0x66, 0x6f, 0x6f]
```

## Why

The standard Base32 alphabet (`A-Z2-7`) reorders digits and letters so that encoded text does not sort in byte order. The hex variant keeps the natural `0-9A-V` ordering, which matters when the encoded string is used as a key or token that must compare lexicographically the same way the underlying bytes do. The trade-off is lower human legibility for digits above 9 — `A` through `V` are not as obvious as decimal — in exchange for that ordering guarantee.

## Edge cases

- Decode is case-insensitive and ignores trailing whitespace, because tokens are routinely copy-pasted and pick up stray characters.
- Padding is validated for canonical length: a string that decodes to a 1-byte value must have exactly 6 `=` symbols. Inputs with non-canonical leftover bits (where the trailing zero bits implied by padding are not actually zero) are rejected.
- Empty input is a valid, supported case: `encode(new Uint8Array(0))` returns `''`, and `decode('')` returns an empty `Uint8Array`.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

