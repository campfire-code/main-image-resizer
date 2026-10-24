import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputItem, Params, RunContext } from '../kit/types';

// 画布在 node 里跑不了：用假的解码 / 编码代替。假图片的内容是「IMG 宽x高 k=系数」，
// 编码结果的字节数 = 宽×高×质量/100×系数，开头写明格式和尺寸，便于断言。
vi.mock('./canvas', () => ({
  loadImage: async (bytes: Uint8Array) => {
    const m = /^IMG (\d+)x(\d+) k=([\d.]+)/.exec(new TextDecoder().decode(bytes));
    if (!m) throw new Error('无法识别这张图片，可能已损坏或格式不受支持（支持 JPG、PNG、WebP、BMP、GIF）');
    const [w, h, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return {
      w, h, close: () => {},
      render: (dw: number, dh: number, fit: string, bg: string) => ({
        encode: async (format: string, q: number) => {
          const head = new TextEncoder().encode(`${format} ${dw}x${dh} ${fit} ${bg} q${q}`);
          const out = new Uint8Array(Math.max(head.length, Math.round(dw * dh * (format === 'png' ? 100 : q) / 100 * k)));
          out.set(head);
          return out;
        },
      }),
    };
  },
}));
const dirs: string[] = [];
vi.mock('../kit/platform', () => ({ ensureDir: async (p: string) => void dirs.push(p) }));

const { default: tool } = await import('./index');

function fakeCtx(files: Map<string, Uint8Array>, params: Params): RunContext {
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => files.get(p)!,
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, new TextEncoder().encode(t)),
    mkdir: async () => {},
    join: async (...parts) => parts.join('/'),
    llm: async () => '', sidecar: async () => '', ffmpeg: async () => {}, duration: async () => 0,
  };
}
const defaults = (over: Params): Params => ({ ...Object.fromEntries(tool.params.map((f) => [f.key, f.default])), ...over });
const item = (name: string): InputItem => ({ id: name, name, path: '/in/' + name });
const head = (d: Uint8Array) => new TextDecoder().decode(d.slice(0, 40)).replace(/\0.*$/s, '');
const img = (w: number, h: number, k = 0.2) => new TextEncoder().encode(`IMG ${w}x${h} k=${k}`);

beforeEach(() => void (dirs.length = 0));

describe('导出流程', () => {
  it('默认勾选的平台各导出一份，按「平台/原文件名」分文件夹', async () => {
    const files = new Map([['/in/保温杯.png', img(1600, 1200)]]);
    const r = await tool.run(item('保温杯.png'), fakeCtx(files, defaults({})));
    expect([...files.keys()].filter((k) => k.startsWith('/out')).sort()).toEqual(['/out/京东/保温杯.jpg', '/out/拼多多/保温杯.jpg', '/out/淘宝天猫/保温杯.jpg']);
    expect(head(files.get('/out/拼多多/保温杯.jpg')!)).toBe('jpg 800x800 pad white q90');
    expect(dirs).toContain('/out/拼多多');
    expect(r.summary).toContain('原图 1600×1200，导出 3 个');
    expect(r.outputPath).toBe('/out/淘宝天猫/保温杯.jpg');
  });

  it('超过拼多多 1MB 上限时自动降低质量', async () => {
    const files = new Map([['/in/a.jpg', img(2000, 2000, 2.5)]]);
    const r = await tool.run(item('a.jpg'), fakeCtx(files, defaults({ p_taobao: false, p_jd: false })));
    const out = files.get('/out/拼多多/a.jpg')!;
    expect(out.length).toBeLessThanOrEqual(1024 * 1024);
    expect(head(out)).toBe('jpg 800x800 pad white q62');
    expect(r.summary).toContain('质量降到 62%');
  });

  it('自定义尺寸 + 居中裁切 + PNG 透明', async () => {
    const files = new Map([['/in/鞋.png', img(1000, 1000)]]);
    await tool.run(item('鞋.png'), fakeCtx(files, defaults({ p_taobao: false, p_pdd: false, p_jd: false, custom: '750x1000', fit: 'crop', format: 'png', bg: 'transparent' })));
    expect(head(files.get('/out/自定义尺寸/鞋_750x1000.png')!)).toBe('png 750x1000 crop transparent q100');
  });

  it('亚马逊即使选了透明也用白底', async () => {
    const files = new Map([['/in/x.png', img(3000, 3000)]]);
    await tool.run(item('x.png'), fakeCtx(files, defaults({ p_taobao: false, p_pdd: false, p_jd: false, p_amazon: true, format: 'png', bg: 'transparent' })));
    expect(head(files.get('/out/亚马逊/x.png')!)).toBe('png 2000x2000 pad white q100');
  });

  it('原图比目标小时提示可能不清晰', async () => {
    const files = new Map([['/in/s.jpg', img(400, 400)]]);
    const r = await tool.run(item('s.jpg'), fakeCtx(files, defaults({})));
    expect(r.summary).toContain('已放大，可能不够清晰');
  });

  it('PNG 超过上限时说明原因与办法，其他尺寸照常导出', async () => {
    const files = new Map([['/in/b.png', img(2000, 2000, 2.5)]]);
    await expect(tool.run(item('b.png'), fakeCtx(files, defaults({ format: 'png' })))).rejects.toThrow('已导出 2 个；拼多多 800×800 的 PNG 有 1.5 MB，超过 1.0 MB 上限；PNG 不能降质量，请把输出格式改成 JPG');
    expect(files.has('/out/京东/b.png')).toBe(true);
    expect(files.has('/out/拼多多/b.png')).toBe(false);
  });

  it('一个平台都没选时提示', async () => {
    const files = new Map([['/in/a.jpg', img(800, 800)]]);
    await expect(tool.run(item('a.jpg'), fakeCtx(files, defaults({ p_taobao: false, p_pdd: false, p_jd: false })))).rejects.toThrow('还没有选平台');
  });

  it('图片太小或损坏时提示', async () => {
    const files = new Map([['/in/t.jpg', img(60, 60)], ['/in/bad.jpg', new Uint8Array([1, 2, 3])]]);
    await expect(tool.run(item('t.jpg'), fakeCtx(files, defaults({})))).rejects.toThrow('太小了');
    await expect(tool.run(item('bad.jpg'), fakeCtx(files, defaults({})))).rejects.toThrow('无法识别');
  });
});
