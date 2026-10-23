// 画布部分：用页面里的画布解码、缩放、编码（兼容 macOS 11 起的系统网页引擎与 Windows WebView2，不用 OffscreenCanvas）。
// 这部分在 node 测试环境里跑不了，由 selftest.html 在浏览器里验证。
import { halvingSteps, layoutRect } from './core';

export interface Loaded {
  w: number;
  h: number;
  /** 画到 dstW×dstH，返回可反复编码的对象 */
  render(dstW: number, dstH: number, fit: 'pad' | 'crop', bg: 'white' | 'transparent'): Rendered;
  close(): void;
}
export interface Rendered {
  encode(format: 'jpg' | 'png', quality: number): Promise<Uint8Array>;
}

export async function loadImage(bytes: Uint8Array): Promise<Loaded> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('无法识别这张图片，可能已损坏或格式不受支持（支持 JPG、PNG、WebP、BMP、GIF）');
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  return {
    w,
    h,
    close: () => URL.revokeObjectURL(url),
    render(dstW, dstH, fit, bg) {
      const r = layoutRect(w, h, dstW, dstH, fit);
      // 大幅缩小时先在中间画布上逐次减半，减少锯齿
      let src: CanvasImageSource = img;
      let sx = r.sx, sy = r.sy, sw = r.sw, sh = r.sh;
      for (const stepW of halvingSteps(sw, r.dw)) {
        const stepH = Math.max(1, Math.round((sh * stepW) / sw));
        const c = document.createElement('canvas');
        c.width = stepW;
        c.height = stepH;
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, sx, sy, sw, sh, 0, 0, stepW, stepH);
        src = c;
        sx = 0; sy = 0; sw = stepW; sh = stepH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const g = canvas.getContext('2d')!;
      if (bg === 'white') {
        g.fillStyle = '#FFFFFF';
        g.fillRect(0, 0, dstW, dstH);
      }
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, sx, sy, sw, sh, r.dx, r.dy, r.dw, r.dh);
      return {
        async encode(format, quality) {
          const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, format === 'png' ? 'image/png' : 'image/jpeg', format === 'png' ? undefined : quality / 100));
          if (!blob) throw new Error('编码失败，可能是图片太大、电脑内存不够，请关掉其他程序后重试');
          return new Uint8Array(await blob.arrayBuffer());
        },
      };
    },
  };
}
