// 生成 samples/ 里的示例图片（只在设置了 MAKE_SAMPLES=1 时运行；JPG 用 macOS 自带的 sips 转换）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** 画一张示例商品图：浅色背景 + 圆角「杯子」 */
function png(w: number, h: number, hue: [number, number, number], alpha = false) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cw = Math.min(w, h) * 0.32, ch = Math.min(w, h) * 0.62, cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const inside = Math.abs(x - cx) < cw / 2 && Math.abs(y - cy) < ch / 2;
      const band = inside && Math.abs(y - (cy - ch * 0.25)) < ch * 0.06;
      const bg = 236 - Math.round((y / h) * 20);
      const [r, g, b] = inside ? (band ? [250, 250, 250] : hue) : [bg, bg, bg + 6];
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = inside || !alpha ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例图片', () => {
  writeFileSync('samples/保温杯-横图.png', png(1600, 1000, [40, 110, 170]));
  writeFileSync('samples/帆布包-透明底.png', png(1200, 1200, [170, 120, 60], true));
  writeFileSync('samples/台灯-竖图.png', png(1000, 1500, [60, 140, 90]));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', 'samples/台灯-竖图.png', '--out', 'samples/台灯-竖图.jpg']);
  execFileSync('rm', ['samples/台灯-竖图.png']);
  writeFileSync('samples/小图-300.png', png(300, 300, [190, 60, 60]));
  writeFileSync('samples/损坏的图.jpg', Buffer.from('这不是一张图片'));
});
