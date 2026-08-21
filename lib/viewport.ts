import { nodeH, nodeW } from './edges';
import type { FlowNode } from './types';

/** 视口：把画布坐标搬到屏幕上的那层变换。
 *  之前是「算一个居中偏移 + 拖动时冻结」，打补丁打出来的；
 *  缩放一进来就不够用了，索性把平移和缩放合成一个状态。 */
export interface View { x: number; y: number; z: number }

export const MIN_Z = 0.2, MAX_Z = 2.5;
export const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

export function bounds(nodes: FlowNode[]) {
  if (!nodes.length) return { minX: 0, minY: 0, w: 0, h: 0 };
  const minX = Math.min(...nodes.map(n => n.x ?? 0));
  const minY = Math.min(...nodes.map(n => n.y ?? 0));
  const maxX = Math.max(...nodes.map(n => (n.x ?? 0) + nodeW(n)));
  const maxY = Math.max(...nodes.map(n => (n.y ?? 0) + nodeH(n)));
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

/** 让整张图正好落进画布。小图不放大（z 封顶 1），不然三个节点会撑满屏幕。 */
export function fitView(nodes: FlowNode[], cw: number, ch: number, pad = 56): View {
  const b = bounds(nodes);
  if (!nodes.length || cw <= 0 || ch <= 0) return { x: 0, y: 0, z: 1 };
  const z = clampZ(Math.min(1, (cw - pad * 2) / Math.max(b.w, 1), (ch - pad * 2) / Math.max(b.h, 1)));
  return {
    x: (cw - b.w * z) / 2 - b.minX * z,
    y: (ch - b.h * z) / 2 - b.minY * z,
    z,
  };
}

/** 以光标为锚点缩放 —— 光标底下那个点必须保持不动，否则手感像在甩图。 */
export function zoomAt(v: View, cx: number, cy: number, factor: number): View {
  const z = clampZ(v.z * factor);
  const k = z / v.z;
  return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, z };
}

/** 屏幕坐标 → 画布坐标 */
export const toCanvas = (v: View, sx: number, sy: number) => ({ x: (sx - v.x) / v.z, y: (sy - v.y) / v.z });
