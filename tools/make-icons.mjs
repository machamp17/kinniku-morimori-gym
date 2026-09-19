// ホーム画面用アイコン（192/512px）を作る: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

class FakeCtx {
  constructor(c) { this.c = c; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(img) { this.c.data = img.data; }
}
globalThis.document = { createElement: () => { const c = { width: 0, height: 0, data: null }; c.getContext = () => new FakeCtx(c); return c; } };
const { drawCharacter, DEFAULT_LOOK } = await import('../js/art/character.js');

const look = { ...DEFAULT_LOOK, face: 'joy', stages: { chest: 1, back: 1, shoulder: 8, arm: 1, leg: 1, abs: 1 } };
const ch = drawCharacter(look, 'detail');

function png(W, H, px) {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 顔〜胸を切り出して整数倍で拡大。背景は濃いチャコール、下にティールの床
for (const size of [192, 512]) {
  const crop = [36, 14, 156, 134]; // 120x120
  const k = Math.floor((size * 0.92) / 120);
  const off = Math.floor((size - 120 * k) / 2);
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / size;
      px[i] = 0x1b + t * 8; px[i + 1] = 0x1f + t * 20; px[i + 2] = 0x24 + t * 18; px[i + 3] = 255;
    }
  const d = ch.canvas.data;
  for (let y = 0; y < 120 * k; y++)
    for (let x = 0; x < 120 * k; x++) {
      const sx = crop[0] + Math.floor(x / k), sy = crop[1] + Math.floor(y / k);
      const si = (sy * 192 + sx) * 4;
      if (!d[si + 3]) continue;
      const di = ((off + y) * size + off + x) * 4;
      px[di] = d[si]; px[di + 1] = d[si + 1]; px[di + 2] = d[si + 2];
    }
  writeFileSync(`assets/icon-${size}.png`, png(size, size, px));
  console.log('icon', size);
}
