import type { FlowNode } from './types';

const NODE_W = 260;

/** 估字宽：中日韩按一个字宽，拉丁按 0.55。屏幕和导出共用这一份。
 *  浏览器实际折行由 CSS 决定，这里估得足够近，几何（盒高、连线端点）就对得上；
 *  估偏了顶多行距松紧不匀，文字不会被吃 —— 盒子在浏览器里是内容撑高的。 */
const isWide = (ch: string) => /[⺀-鿿＀-￯　-〿]/.test(ch);
const textW = (s: string, size: number) =>
  [...s].reduce((a, ch) => a + (isWide(ch) ? 1 : 0.55) * size, 0);

function wrapText(text: string, maxPx: number, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const t = para.trim();
    if (!t) continue;
    // 不可拆的小块：中日韩一个字一块，拉丁整个词一块 —— 浏览器就是按词折的
    const units = t.match(/[⺀-鿿＀-￯　-〿]|[^⺀-鿿＀-￯　-〿\s]+|\s+/g) ?? [t];
    let cur = '', w = 0;
    for (const u of units) {
      const uw = textW(u, size);
      if (w + uw > maxPx && cur.trim()) {
        out.push(cur.trimEnd()); cur = ''; w = 0;
        if (/^\s+$/.test(u)) continue;   // 折行后行首不要空格
      }
      if (uw > maxPx) {
        // 一个词比整行还宽（超长网址之类），只好硬切
        for (const ch of u) {
          const cw = (isWide(ch) ? 1 : 0.55) * size;
          if (w + cw > maxPx && cur) { out.push(cur.trimEnd()); cur = ''; w = 0; }
          cur += ch; w += cw;
        }
      } else { cur += u; w += uw; }
    }
    if (cur.trim()) out.push(cur.trimEnd());
  }
  return out.length ? out : [text];
}

/** 字号档位 → 像素。菱形整体小一号。 */
export const FONT_PX = { s: 12, m: 13.5, l: 16 } as const;
const DEC_PX = { s: 10.5, m: 12, l: 14 } as const;
export const fontPx = (n: FlowNode) =>
  (n.shape === 'decision' ? DEC_PX : FONT_PX)[n.style?.size ?? 'm'];
/** 一行的高度（跟 CSS 的 line-height 1.35 对齐），屏幕和导出共用。 */
export const lineH = (n: FlowNode) => Math.round(fontPx(n) * 1.35);

/** 标题真正可用的宽度：去掉内边距、勾选框、右侧 owner/天数标签。 */
function titleAvail(n: FlowNode): { px: number; size: number } {
  const size = fontPx(n);
  if (n.shape === 'decision') return { px: 144, size };
  if (n.shape === 'terminator') return { px: 178, size };
  const meta = n.owner ? Math.min(90, n.owner.length * 11 + (n.days ? 34 : 0)) : 8;
  return { px: NODE_W - 30 - (n.muted ? 0 : 24) - meta, size };
}

/** 标题按宽度折成的行。以前只数显式换行、还封顶两行 ——
 *  长标题（没有 \n 的英文长句）就被 … 吃掉了。现在盒子跟着行数长高。 */
export function titleLineList(n: FlowNode): string[] {
  const { px, size } = titleAvail(n);
  return wrapText(n.title, px, size);
}
export const titleLines = (n: FlowNode) => titleLineList(n).length;

export const nodeH = (n: FlowNode) => {
  const extra = (titleLines(n) - 1) * lineH(n);
  // 菱形要长得更凶：越靠上下尖角越窄，行数一多不加倍就装不下
  if (n.shape === 'decision') return 64 + extra * 2;
  return (n.shape === 'terminator' ? 44 : 46) + extra;
};
export const nodeW = (n: FlowNode) => (n.shape === 'decision' ? 200 : NODE_W);

/** 节点的连接点。菱形从左右出，其余从上下出。 */
export function ports(n: FlowNode) {
  const x = n.x ?? 0, y = n.y ?? 0, w = nodeW(n), h = nodeH(n);
  return { x, y, w, h, cx: x + w / 2, top: y, bottom: y + h, left: x, right: x + w, mid: y + h / 2 };
}

/** 直角走线：主干直上直下，分支先横后竖。
 *  屏幕和导出共用这一份 —— 两边各画各的迟早对不上。 */
export function edgePath(a: FlowNode, b: FlowNode) {
  const p = ports(a), q = ports(b);
  if (Math.abs(p.cx - q.cx) < 4) return `M${p.cx} ${p.bottom} V${q.top}`;
  const from = q.cx > p.cx ? p.right : p.left;
  return `M${from} ${p.mid} H${q.cx} V${q.top}`;
}

/** 连线上「是 / 否」标签的位置 */
export function edgeLabelPos(a: FlowNode, b: FlowNode) {
  const p = ports(a), q = ports(b);
  return { x: (q.cx > p.cx ? p.right + q.cx : p.left + q.cx) / 2, y: p.mid - 10 };
}
