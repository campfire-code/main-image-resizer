import { describe, expect, it } from 'vitest';
import { PRESETS, fitToLimit, halvingSteps, layoutRect, outputFileName, parseCustomSizes, planOutputs, safeName } from './core';

describe('平台预设', () => {
  it('每个预设都有合法尺寸和不含斜杠的文件夹名', () => {
    for (const p of PRESETS) {
      expect(p.w).toBeGreaterThan(0);
      expect(p.h).toBeGreaterThan(0);
      expect(p.folder).not.toMatch(/[\\/:*?"<>|]/);
    }
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(PRESETS.length);
  });
});

describe('自定义尺寸', () => {
  it('支持 x、×、* 和中文逗号，自动去重', () => {
    expect(parseCustomSizes('1200x1200， 750×1000;750*1000')).toEqual([{ w: 1200, h: 1200 }, { w: 750, h: 1000 }]);
  });
  it('留空表示没有自定义尺寸', () => {
    expect(parseCustomSizes('  ')).toEqual([]);
  });
  it('写错时说明正确写法', () => {
    expect(() => parseCustomSizes('1200')).toThrow('请写成 宽x高');
    expect(() => parseCustomSizes('20x20')).toThrow('50 到 8000');
  });
});

describe('导出计划', () => {
  it('按平台要求取各自的大小上限，同文件夹多个尺寸加后缀', () => {
    const plans = planOutputs(['taobao', 'taobao34', 'pdd', 'jd'], [], 'preset');
    expect(plans.map((p) => [p.folder, p.w, p.h, p.maxBytes, p.suffix])).toEqual([
      ['淘宝天猫', 800, 800, 3 * 1024 * 1024, '_800x800'],
      ['拼多多', 800, 800, 1024 * 1024, ''],
      ['京东', 800, 800, 0, ''],
      ['淘宝天猫', 750, 1000, 3 * 1024 * 1024, '_750x1000'],
    ]);
  });
  it('统一上限覆盖平台要求，自定义尺寸进「自定义尺寸」文件夹', () => {
    const plans = planOutputs(['amazon'], [{ w: 1200, h: 1200 }], '500');
    expect(plans[0]).toMatchObject({ folder: '亚马逊', maxBytes: 500 * 1024, whiteOnly: true });
    expect(plans[1]).toMatchObject({ folder: '自定义尺寸', maxBytes: 500 * 1024, suffix: '_1200x1200' });
  });
  it('不限制时上限为 0', () => {
    expect(planOutputs(['pdd'], [], '0')[0].maxBytes).toBe(0);
  });
});

describe('文件名', () => {
  it('保留原文件名，换扩展名，替换非法字符', () => {
    const [pl] = planOutputs(['pdd'], [], 'preset');
    expect(outputFileName('保温杯:主图.PNG', pl, 'jpg')).toBe('保温杯_主图.jpg');
    expect(safeName('  ')).toBe('图片');
  });
});

describe('适配方式', () => {
  it('留白：横图放进正方形，上下留白居中', () => {
    expect(layoutRect(1600, 800, 800, 800, 'pad')).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 800, dx: 0, dy: 200, dw: 800, dh: 400 });
  });
  it('裁切：横图裁掉左右，铺满画面', () => {
    expect(layoutRect(1600, 800, 800, 800, 'crop')).toEqual({ sx: 400, sy: 0, sw: 800, sh: 800, dx: 0, dy: 0, dw: 800, dh: 800 });
  });
  it('裁切：竖图放进 3:4，裁掉上下', () => {
    const r = layoutRect(1000, 2000, 750, 1000, 'crop');
    expect(r.sw).toBe(1000);
    expect(r.sh).toBeCloseTo(1333.33, 1);
    expect(r.sy).toBeCloseTo(333.33, 1);
  });
  it('同比例时不留白不裁切', () => {
    expect(layoutRect(2000, 2000, 800, 800, 'pad')).toMatchObject({ dx: 0, dy: 0, dw: 800, dh: 800 });
  });
});

describe('逐次减半缩小', () => {
  it('4000 缩到 800 先减半两次', () => {
    expect(halvingSteps(4000, 800)).toEqual([2000, 1000]);
  });
  it('缩小不到一半或放大时不分步', () => {
    expect(halvingSteps(1200, 800)).toEqual([]);
    expect(halvingSteps(500, 800)).toEqual([]);
  });
});

describe('大小上限', () => {
  const fake = (bytesAt: (q: number) => number) => {
    const calls: number[] = [];
    return { calls, encode: async (q: number) => (calls.push(q), new Uint8Array(bytesAt(q))) };
  };
  it('不超过上限时只编码一次', async () => {
    const f = fake(() => 100);
    const r = await fitToLimit(f.encode, 1000, 90, false);
    expect(r).toMatchObject({ ok: true, quality: 90 });
    expect(f.calls).toEqual([90]);
  });
  it('超过上限时逐步降低质量直到达标', async () => {
    const f = fake((q) => q * 100);
    const r = await fitToLimit(f.encode, 6500, 90, false);
    expect(r).toMatchObject({ ok: true, quality: 62 });
    expect(f.calls).toEqual([90, 86, 80, 74, 68, 62]);
  });
  it('降到最低质量仍超过时返回 ok=false', async () => {
    const f = fake(() => 99999);
    const r = await fitToLimit(f.encode, 1000, 90, false);
    expect(r.ok).toBe(false);
    expect(r.quality).toBe(38);
  });
  it('PNG 只编码一次，不降质量', async () => {
    const f = fake(() => 99999);
    const r = await fitToLimit(f.encode, 1000, 90, true);
    expect(r.ok).toBe(false);
    expect(f.calls).toEqual([100]);
  });
});
