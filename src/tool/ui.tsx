// 界面：空状态（一张图 → 各平台一份）和单张结果（每个平台一格：缩略图、尺寸、文件大小占上限的比例）。
import { ArrowRight, TriangleAlert } from 'lucide-react';
import type { InputItem, ItemResult } from '../kit/types';
import { fileSrc } from '../kit/platform';
import { PRESETS, formatBytes } from './core';
import './tool.css';

/** 随结果带出的明细，只用来画结果，不写入文件 */
export interface ResizeOut {
  label: string;
  w: number;
  h: number;
  bytes: number;
  /** 文件大小上限（字节），0 表示不限制 */
  maxBytes: number;
  /** 质量被降低时的最终质量 */
  quality?: number;
}
export interface ResizeData {
  srcW: number;
  srcH: number;
  fit: 'pad' | 'crop';
  white: boolean;
  outs: ResizeOut[];
  upscaled: boolean;
}

const BOX = 92;
const frame = (w: number, h: number, box = BOX) => {
  const k = box / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
};

export function Empty() {
  return (
    <div className="mr-empty">
      <div className="mr-empty-hd">
        <h2>一张主图，各平台尺寸一次出齐</h2>
        <p>按平台分文件夹导出；比例不合就留白或裁切，JPG 超过大小上限会自动降质量。全部在本机完成。</p>
      </div>
      <div className="mr-flow" aria-hidden="true">
        <div className="mr-src"><span className="mr-pic" style={frame(1600, 1000, 104)} /><small>原图</small></div>
        <ArrowRight size={20} className="mr-arrow" />
        <div className="mr-tiles">
          {PRESETS.map((p) => (
            <div key={p.key} className="mr-tile">
              <span className="mr-frame" style={frame(p.w, p.h, 58)}><span className="mr-pic" /></span>
              <b>{p.key === 'taobao34' ? '淘宝天猫 3:4' : p.folder}</b>
              <small>{p.w}×{p.h}</small>
              <small className="mr-lim">{p.maxBytes ? `≤ ${formatBytes(p.maxBytes)}` : '不限大小'}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultBody({ item, result }: { item: InputItem; result: ItemResult }) {
  const d = result.data as ResizeData | undefined;
  if (!d) return <p className="mr-plain">{result.summary}</p>;
  return (
    <div className="mr-result">
      <div className="mr-head">
        <b className="k-num">原图 {d.srcW}×{d.srcH}</b>
        <span className="k-muted">导出 {d.outs.length} 个版本 · {d.fit === 'crop' ? '居中裁切' : '留白填充'}</span>
        {d.upscaled && <span className="mr-warn"><TriangleAlert size={13} />原图偏小，已放大</span>}
      </div>
      <div className="mr-outs">
        {d.outs.map((o) => {
          const ratio = o.maxBytes ? Math.min(1, o.bytes / o.maxBytes) : 0;
          return (
            <div key={`${o.label}-${o.w}x${o.h}`} className="mr-out">
              <span className="mr-frame" style={{ ...frame(o.w, o.h), background: d.white ? '#fff' : undefined }}>
                {item.path && <img src={fileSrc(item.path)} alt="" style={{ objectFit: d.fit === 'crop' ? 'cover' : 'contain' }} />}
              </span>
              <b>{o.label.replace(/ \d+×\d+$/, '')}</b>
              <small className="k-num">{o.w}×{o.h}</small>
              <span className="mr-size k-num">{formatBytes(o.bytes)}</span>
              <span className="mr-meter" title={o.maxBytes ? `上限 ${formatBytes(o.maxBytes)}` : '不限制大小'}><i style={{ width: `${Math.max(4, ratio * 100)}%` }} className={ratio > 0.9 ? 'hot' : ''} /></span>
              <small className="k-muted">{o.maxBytes ? `上限 ${formatBytes(o.maxBytes)}` : '不限大小'}{o.quality ? ` · 质量 ${o.quality}%` : ''}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
