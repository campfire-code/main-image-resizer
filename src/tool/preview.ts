// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';

const img = (n: string) => new URL(`../../samples/${n}`, import.meta.url).href;
const files: [string, string, number, Row['status'], string?][] = [
  ['保温杯-横图.png', '保温杯-横图.png', 312_000, 'ok', '原图 1600×1000，导出 4 个：淘宝天猫 800×800 86 KB、拼多多 800×800 86 KB、京东 800×800 86 KB、亚马逊 2000×2000 420 KB'],
  ['帆布包-透明底.png', '帆布包-透明底.png', 268_000, 'ok', '原图 1200×1200，导出 4 个：淘宝天猫 800×800 74 KB、拼多多 800×800 74 KB、京东 800×800 74 KB、亚马逊 2000×2000 380 KB'],
  ['台灯-竖图.jpg', '台灯-竖图.jpg', 540_000, 'run'],
  ['连衣裙-正面.jpg', '台灯-竖图.jpg', 1_820_000, 'wait'],
  ['蓝牙耳机-盒.jpg', '保温杯-横图.png', 960_000, 'wait'],
  ['小图-300.png', '小图-300.png', 2_300, 'ok', '原图 300×300，导出 4 个：淘宝天猫 800×800 31 KB、拼多多 800×800 31 KB、京东 800×800 31 KB、亚马逊 2000×2000 120 KB。注意：原图比部分目标尺寸小，已放大，可能不够清晰'],
  ['损坏的图.jpg', '小图-300.png', 21, 'err', '无法识别这张图片，可能已损坏或格式不受支持（支持 JPG、PNG、WebP、BMP、GIF）'],
];

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : files.map(([name, sample, size, status, text], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `p${i}`, name, path: img(sample), size },
      status: st,
      progress: st === 'run' ? 0.5 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? text : undefined,
      result: st === 'ok' ? { summary: text ?? '原图 1000×1500，导出 4 个', outputPath: '/示例/输出/淘宝天猫', preview: img(sample) } : undefined,
    };
  });

export const params = { p_amazon: true };
