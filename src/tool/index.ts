// 工具声明：主图多平台尺寸导出（在本机用网页引擎完成，不联网）。
import { Scaling as ScalingAsIcon } from 'lucide-react';
import type { BatchTool, Field, Params, RunContext } from '../kit/types';
import { ensureDir } from '../kit/platform';
import { loadImage } from './canvas';
import { Empty, ResultBody, type ResizeData, type ResizeOut } from './ui';
import { PRESETS, fitToLimit, formatBytes, outputFileName, parseCustomSizes, planOutputs } from './core';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

const presetFields: Field[] = PRESETS.map((p) => ({ key: `p_${p.key}`, label: p.label, type: 'toggle', default: p.on, help: p.help }));
const fitField: Field = { key: 'fit', label: '比例不一致时', type: 'segment', options: [['pad', '留白填充'], ['crop', '居中裁切']], default: 'pad', help: '留白：整张图都保留，四周补白；裁切：铺满画面，超出的边缘裁掉' };

export function selectedPresets(params: Params) {
  return PRESETS.filter((p) => params[`p_${p.key}`] === true).map((p) => p.key);
}

const tool: BatchTool = {
  id: 'e07',
  name: '主图多平台尺寸导出',
  tagline: '一张或一批商品图，按淘宝、拼多多、京东、Shopee、亚马逊等平台的主图尺寸一键导出，可留白或裁切，超过大小上限自动降低质量。各平台规则以平台最新规则为准。',
  icon: ScalingAsIcon,
  category: '电商运营',
  type: 'media',
  mode: 'batch',
  resultView: 'list',
  Empty,
  ResultBody,
  concurrency: 2,
  accept: { label: '商品图', extensions: IMAGE_EXT },
  params: [
    // 极简布局只露出前 4 项：三个最常用平台 + 适配方式
    ...presetFields.slice(0, 3),
    fitField,
    ...presetFields.slice(3),
    { key: 'custom', label: '自定义尺寸', type: 'text', default: '', placeholder: '例如 1200×1200, 750×1000，不需要就留空', help: '多个尺寸用逗号隔开，导出到「自定义尺寸」文件夹' },
    { key: 'format', label: '输出格式', type: 'segment', options: [['jpg', 'JPG'], ['png', 'PNG']], default: 'jpg', help: '各平台主图一般都收 JPG，文件也更小' },
    { key: 'bg', label: '空白处', type: 'segment', options: [['white', '白色'], ['transparent', '透明']], default: 'white', when: (p) => p.format === 'png', help: '亚马逊主图始终用白底' },
    { key: 'limit', label: '文件大小上限', type: 'select', options: [['preset', '按平台要求'], ['0', '不限制'], ['500', '500 KB'], ['1024', '1 MB'], ['2048', '2 MB'], ['3072', '3 MB']], default: 'preset', help: '超过上限会逐步降低 JPG 质量；「按平台要求」时自定义尺寸不限制' },
    { key: 'quality', label: '起始质量', type: 'number', default: 90, min: 50, max: 100, unit: '%', help: '先用这个质量导出，超过上限再往下降' },
    { key: 'out', label: '保存到', type: 'folder', default: '' },
  ],
  check: (item) => (item.size != null && item.size > 100 * 1024 * 1024 ? '图片超过 100 MB，请先缩小后再导出' : null),

  async run(item, ctx: RunContext) {
    const p = ctx.params;
    const plans = planOutputs(selectedPresets(p), parseCustomSizes(String(p.custom ?? '')), String(p.limit));
    if (!plans.length) throw new Error('还没有选平台：请至少打开一个平台开关，或填写自定义尺寸');
    const format = p.format === 'png' ? 'png' : 'jpg';
    const src = await ctx.readFile(item.path!);
    const img = await loadImage(src);
    try {
      if (Math.min(img.w, img.h) < 100) throw new Error(`原图只有 ${img.w}×${img.h}，太小了，放大后会很模糊，请换一张清晰的原图`);
      ctx.progress(0.1);
      const done: string[] = [];
      const outs: ResizeOut[] = [];
      const failed: string[] = [];
      let first = '';
      let upscaled = false;
      for (let i = 0; i < plans.length; i++) {
        if (ctx.signal.aborted) break;
        const pl = plans[i];
        const bg = format === 'jpg' || pl.whiteOnly || p.bg !== 'transparent' ? 'white' : 'transparent';
        const rendered = img.render(pl.w, pl.h, p.fit === 'crop' ? 'crop' : 'pad', bg);
        // 留白时按较小的缩放比，裁切时按较大的缩放比；大于 1 就是放大了
        const scale = p.fit === 'crop' ? Math.max(pl.w / img.w, pl.h / img.h) : Math.min(pl.w / img.w, pl.h / img.h);
        if (scale > 1.05) upscaled = true;
        const r = await fitToLimit((q) => rendered.encode(format, q), pl.maxBytes, Number(p.quality) || 90, format === 'png');
        if (!r.ok) {
          failed.push(
            format === 'png'
              ? `${pl.label} 的 PNG 有 ${formatBytes(r.data.length)}，超过 ${formatBytes(pl.maxBytes)} 上限；PNG 不能降质量，请把输出格式改成 JPG`
              : `${pl.label} 降到最低质量仍有 ${formatBytes(r.data.length)}，超过 ${formatBytes(pl.maxBytes)} 上限，请换一张细节少一些的图或改用「居中裁切」`,
          );
          continue;
        }
        const dir = await ctx.join(ctx.outputDir, pl.folder);
        await ensureDir(dir); // RunContext 没有建文件夹的能力，直接用 kit 的本机封装建平台子文件夹
        const path = await ctx.join(dir, outputFileName(item.name, pl, format));
        await ctx.writeFile(path, r.data);
        first ||= path;
        outs.push({ label: pl.label, w: pl.w, h: pl.h, bytes: r.data.length, maxBytes: pl.maxBytes, quality: format === 'jpg' && r.quality < (Number(p.quality) || 90) ? r.quality : undefined });
        done.push(`${pl.label} ${formatBytes(r.data.length)}${format === 'jpg' && r.quality < (Number(p.quality) || 90) ? `（质量降到 ${r.quality}%）` : ''}`);
        ctx.progress(0.1 + (0.9 * (i + 1)) / plans.length);
      }
      if (failed.length) throw new Error(`${done.length ? `已导出 ${done.length} 个；` : ''}${failed.join('；')}`);
      const tail = upscaled ? '。注意：原图比部分目标尺寸小，已放大，可能不够清晰' : '';
      const data: ResizeData = { srcW: img.w, srcH: img.h, fit: p.fit === 'crop' ? 'crop' : 'pad', white: format === 'jpg' || p.bg !== 'transparent', outs, upscaled };
      return { outputPath: first, preview: first, summary: `原图 ${img.w}×${img.h}，导出 ${done.length} 个：${done.join('、')}${tail}`, data };
    } finally {
      img.close();
    }
  },
};

export default tool;
