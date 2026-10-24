// 纯函数：不依赖界面和本机能力，便于单元测试。

/** 平台主图预设。尺寸和大小上限只写我们有把握的，没把握的大小上限留空（不限制）。以平台最新规则为准。 */
export interface Preset {
  key: string;
  /** 界面上的名字 */
  label: string;
  /** 界面上的说明 */
  help: string;
  /** 输出子文件夹名（不能含 / 等字符） */
  folder: string;
  w: number;
  h: number;
  /** 文件大小上限（字节），0 表示没有核实到上限、不限制 */
  maxBytes: number;
  /** 强制白底（例如亚马逊主图要求纯白背景） */
  whiteOnly?: boolean;
  /** 默认是否勾选 */
  on: boolean;
}

const MB = 1024 * 1024;
export const PRESETS: Preset[] = [
  { key: 'taobao', label: '淘宝/天猫 800×800', help: '1:1 主图，3MB 内', folder: '淘宝天猫', w: 800, h: 800, maxBytes: 3 * MB, on: true },
  { key: 'pdd', label: '拼多多 800×800', help: '1:1 轮播图，1MB 内', folder: '拼多多', w: 800, h: 800, maxBytes: 1 * MB, on: true },
  { key: 'jd', label: '京东 800×800', help: '1:1 主图，大小上限未核实，不做限制', folder: '京东', w: 800, h: 800, maxBytes: 0, on: true },
  { key: 'taobao34', label: '淘宝/天猫 3:4 750×1000', help: '3:4 主图（服饰等类目），3MB 内', folder: '淘宝天猫', w: 750, h: 1000, maxBytes: 3 * MB, on: false },
  { key: 'shopee', label: 'Shopee 1024×1024', help: '1:1 商品图，2MB 内', folder: 'Shopee', w: 1024, h: 1024, maxBytes: 2 * MB, on: false },
  { key: 'amazon', label: '亚马逊 2000×2000', help: '主图要求纯白背景，固定白底，10MB 内', folder: '亚马逊', w: 2000, h: 2000, maxBytes: 10 * MB, whiteOnly: true, on: false },
];

export interface Size {
  w: number;
  h: number;
}

/** 解析自定义尺寸：「1200x1200, 750×1000」→ [{1200,1200},{750,1000}] */
export function parseCustomSizes(text: string): Size[] {
  const parts = text.split(/[,，;；、\s]+/).map((s) => s.trim()).filter(Boolean);
  const out: Size[] = [];
  for (const p of parts) {
    const m = /^(\d{2,5})\s*[x×X*]\s*(\d{2,5})$/.exec(p);
    if (!m) throw new Error(`自定义尺寸「${p}」看不懂，请写成 宽x高，例如 1200×1200，多个用逗号隔开`);
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w < 50 || h < 50 || w > 8000 || h > 8000) throw new Error(`自定义尺寸「${p}」超出范围，宽和高需要在 50 到 8000 像素之间`);
    if (!out.some((s) => s.w === w && s.h === h)) out.push({ w, h });
  }
  return out;
}

/** 一个要导出的版本 */
export interface OutputPlan {
  folder: string;
  /** 结果说明里用的名字 */
  label: string;
  w: number;
  h: number;
  maxBytes: number;
  whiteOnly: boolean;
  /** 同一文件夹里有多个尺寸时，文件名后面加 _宽x高 */
  suffix: string;
}

/**
 * 根据勾选的平台和自定义尺寸，列出要导出的版本。
 * limit：'preset' 按平台要求（自定义尺寸不限制）；'0' 不限制；其他数字为统一上限（KB）。
 */
export function planOutputs(selected: string[], custom: Size[], limit: string): OutputPlan[] {
  const plans: OutputPlan[] = [];
  const uniform = limit === 'preset' ? null : Number(limit) * 1024;
  for (const p of PRESETS) {
    if (!selected.includes(p.key)) continue;
    plans.push({ folder: p.folder, label: `${p.folder} ${p.w}×${p.h}`, w: p.w, h: p.h, maxBytes: uniform ?? p.maxBytes, whiteOnly: !!p.whiteOnly, suffix: '' });
  }
  for (const s of custom) {
    plans.push({ folder: '自定义尺寸', label: `自定义 ${s.w}×${s.h}`, w: s.w, h: s.h, maxBytes: uniform ?? 0, whiteOnly: false, suffix: '' });
  }
  // 同一文件夹里有多个尺寸（或自定义尺寸）就加尺寸后缀，避免同名覆盖
  for (const pl of plans) {
    const same = plans.filter((x) => x.folder === pl.folder);
    if (same.length > 1 || pl.folder === '自定义尺寸') pl.suffix = `_${pl.w}x${pl.h}`;
  }
  return plans;
}

/** 文件名里不能出现的字符换成下划线 */
export function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '图片';
}

export function baseName(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function outputFileName(srcName: string, plan: OutputPlan, ext: 'jpg' | 'png') {
  return `${safeName(baseName(srcName))}${plan.suffix}.${ext}`;
}

export interface Rect {
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
}

/**
 * 把 srcW×srcH 的图放进 dstW×dstH：
 * pad 留白填充（整张图都在，四周留白）；crop 居中裁切（铺满画面，多出的部分裁掉）。
 */
export function layoutRect(srcW: number, srcH: number, dstW: number, dstH: number, mode: 'pad' | 'crop'): Rect {
  if (mode === 'pad') {
    const k = Math.min(dstW / srcW, dstH / srcH);
    const dw = Math.max(1, Math.round(srcW * k));
    const dh = Math.max(1, Math.round(srcH * k));
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: Math.round((dstW - dw) / 2), dy: Math.round((dstH - dh) / 2), dw, dh };
  }
  const k = Math.max(dstW / srcW, dstH / srcH);
  const sw = Math.min(srcW, dstW / k);
  const sh = Math.min(srcH, dstH / k);
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
}

/** 大幅缩小时分几次减半，画质比一步缩到位好。返回每一步的目标宽度（不含最后一步） */
export function halvingSteps(srcW: number, dstW: number): number[] {
  const steps: number[] = [];
  let w = srcW;
  while (w / 2 >= dstW) {
    w = Math.round(w / 2);
    steps.push(w);
  }
  return steps;
}

/** JPG 逐步降低质量的阶梯（%） */
export const QUALITY_STEPS = [92, 86, 80, 74, 68, 62, 56, 50, 44, 38];

/**
 * 按质量阶梯编码，直到不超过上限。maxBytes=0 只编码一次（第一档质量）。
 * 返回最后一次的结果；ok=false 表示降到最低质量也超过上限。
 */
export async function fitToLimit(encode: (quality: number) => Promise<Uint8Array>, maxBytes: number, startQuality: number, lossless: boolean) {
  const steps = lossless ? [100] : [startQuality, ...QUALITY_STEPS.filter((q) => q < startQuality)];
  let data: Uint8Array = new Uint8Array();
  let quality = steps[0];
  for (const q of steps) {
    quality = q;
    data = await encode(q);
    if (!maxBytes || data.length <= maxBytes) return { data, quality, ok: true };
  }
  return { data, quality, ok: false };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
