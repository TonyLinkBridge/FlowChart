import { edgeLabelPos, edgePath, nodeH, nodeW, ports, titleLineList } from '../edges';
import { docProgress, footnoteIndex, nodeProgress, totalDays, type FlowDoc, type FlowNode } from '../types';

const C = {
  paper: '#F4F2ED', surface: '#FFFFFF', ink: '#101010',
  ink3: '#6B6862', ink4: '#9C988F',
  ruleMid: '#C7C2B6', ruleFaint: '#E3DFD5', gold: '#9A6B12', onGold: '#F4F2ED',
};
const FONT = "Archivo, 'PingFang SC', 'Microsoft YaHei', sans-serif";
const MONO = "'IBM Plex Mono', 'SF Mono', Consolas, monospace";
const PAD = 44;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 估字宽：中日韩字符按一个字宽算，拉丁按 0.55。
 *  SVG 没有自动折行，只能自己数 —— 估得不准最多是行末松紧不匀，不会溢出。 */
const isWide = (ch: string) => /[⺀-鿿＀-￯　-〿]/.test(ch);
function wrapOne(text: string, maxPx: number, size: number): string[] {
  const lines: string[] = [];
  let cur = '', w = 0;
  for (const ch of text) {
    const cw = (isWide(ch) ? 1 : 0.55) * size;
    if (w + cw > maxPx && cur) { lines.push(cur); cur = ''; w = 0; }
    cur += ch; w += cw;
  }
  if (cur) lines.push(cur);
  return lines;
}
/** 先按 \n 分段，段内再按宽度折行 —— 不然粘贴的多段邮件在导出里黏成一坨。
 *  连续空行压成一个空行当段间距。 */
function wrap(text: string, maxPx: number, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const t = para.trim();
    if (!t) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    out.push(...wrapOne(t, maxPx, size));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/** 把一条结构化附注压成一段可读的话 —— 导出的图下面要印这个。 */
function noteToProse(n: FlowNode, redact: boolean): string {
  const note = n.note!;
  const bits: string[] = [];
  const head = [n.owner, n.days ? `${n.days} 天` : null].filter(Boolean).join(' · ');
  if (note.steps?.length) {
    const done = note.steps.filter(s => s.done).length;
    bits.push(`进度 ${done}/${note.steps.length}`);
  }
  const meta = [head, ...bits].filter(Boolean).join(' · ');

  const parts: string[] = [];
  if (note.steps?.length)
    parts.push('怎么做：' + note.steps.map((s, i) => `${i + 1} ${s.text}`).join('；'));
  if (note.fields?.length)
    parts.push('要填：' + note.fields
      .map(f => `${f.label} ${f.value ? (redact ? '（已清空）' : f.value) : '（待填）'}`).join('；'));
  if (note.links?.length) parts.push('相关：' + note.links.map(l => l.label).join('、'));
  if (note.contact) parts.push('问谁：' + note.contact);
  if (note.text) parts.push('说明：\n' + note.text.replace(/\*\*|`/g, '').trim());

  return `${meta ? meta + '。' : ''}${parts.join('。')}${parts.length ? '。' : ''}`;
}

/** SVG 里没有自动换行，得自己按行画。 */
function multiline(n: FlowNode, x: number, midY: number, attrs: string, tail = '') {
  // 跟屏幕同一份折行 —— 屏幕能显示全的，导出也一个字不少
  const lines = titleLineList(n);
  const step = 17;
  const startY = midY + 5 - ((lines.length - 1) * step) / 2;
  return lines.map((ln, i) =>
    `<text x="${x}" y="${startY + i * step}" ${attrs}>${esc(ln)}${i === lines.length - 1 ? tail : ''}</text>`
  ).join('');
}

function drawNode(n: FlowNode, fnIdx?: number): string {
  const p = ports(n), w = nodeW(n), h = nodeH(n);
  const t = (x: number, y: number, str: string, attrs: string) =>
    `<text x="${x}" y="${y}" ${attrs}>${esc(str)}</text>`;

  if (n.shape === 'decision') {
    return `<polygon points="${p.cx},${p.y + 1} ${p.right - 1},${p.mid} ${p.cx},${p.bottom - 1} ${p.left + 1},${p.mid}"
      fill="${C.paper}" stroke="${C.ink}" stroke-width="1" stroke-linejoin="miter"/>
      ${multiline(n, p.cx, p.mid, `font-family="${FONT}" font-size="12" fill="${C.ink}" text-anchor="middle"`)}`;
  }
  if (n.shape === 'terminator') {
    const tag = n.id === 'offer' ? 'START' : 'END';
    return `<rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" fill="${C.ink}"/>
      ${multiline(n, p.x + 15, p.mid, `font-family="${FONT}" font-size="13.5" font-weight="600" fill="${C.onGold}"`)}
      ${t(p.right - 15, p.mid + 4, tag, `font-family="${MONO}" font-size="9" letter-spacing="1.2" fill="${C.ink4}" text-anchor="end"`)}`;
  }

  const prog = nodeProgress(n);
  const border = n.muted ? C.ruleMid : prog > 0 && prog < 1 ? C.ink : C.ruleMid;
  const sw = !n.muted && prog > 0 && prog < 1 ? 2 : 1;
  const fill = n.muted ? 'none' : prog > 0 && prog < 1 ? C.surface : C.paper;

  let out = `<rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" fill="${fill}"
    stroke="${border}" stroke-width="${sw}"${n.muted ? ' stroke-dasharray="4 4"' : ''}/>`;

  if (!n.muted) {
    const bx = p.x + 15, by = p.mid - 7;
    out += prog === 1
      ? `<rect x="${bx}" y="${by}" width="14" height="14" fill="${C.gold}"/>
         <path d="M${bx + 3.2} ${by + 7.3} l3 3 l5.2 -6" stroke="${C.onGold}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : prog > 0
        ? `<rect x="${bx}" y="${by}" width="14" height="14" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
           <rect x="${bx + 4}" y="${by + 4}" width="6" height="6" fill="${C.ink}"/>`
        : `<rect x="${bx}" y="${by}" width="14" height="14" fill="none" stroke="${C.ruleMid}" stroke-width="1"/>`;
  }

  const tx = n.muted ? p.x + 15 : p.x + 39;
  const titleFill = prog === 1 || n.muted ? C.ink4 : C.ink;
  const attrs = `font-family="${FONT}" font-size="13.5" font-weight="${prog > 0 && prog < 1 ? 600 : 500}" fill="${titleFill}"${prog === 1 ? ` text-decoration="line-through"` : ''}`;
  const fn = fnIdx === undefined ? ''
    : `<tspan font-family="${MONO}" font-size="8.5" fill="${C.gold}" dy="-5" dx="3">${String(fnIdx).padStart(2, '0')}</tspan>`;
  out += multiline(n, tx, p.mid, attrs, fn);

  if (prog > 0 && prog < 1) {
    out += `<rect x="${p.right - 46}" y="${p.mid - 8}" width="34" height="15" fill="${C.ink}"/>
      <text x="${p.right - 29}" y="${p.mid + 3}" font-family="${MONO}" font-size="9" font-weight="500" letter-spacing="0.8" fill="${C.onGold}" text-anchor="middle">NOW</text>`;
  } else if (n.owner) {
    out += `<text x="${p.right - 15}" y="${p.mid + 4}" font-family="${MONO}" font-size="10" fill="${C.ink4}" text-anchor="end">${esc(n.owner + (n.days ? ` | ${n.days}D` : ''))}</text>`;
  }
  return out;
}

/** 导出成 SVG：图在上，附注表在下 —— 这是整套「脚注」方案的落脚点。
 *  原版 flowmaker 导出时把详情整个隐藏，内容一个字带不走，我们才改的方案。 */
export function toSvg(doc: FlowDoc, opts: { redactFields?: boolean } = {}): string {
  const redact = !!opts.redactFields;
  const notes = footnoteIndex(doc);
  const noted = doc.nodes.filter(n => n.note);
  const byId = new Map(doc.nodes.map(n => [n.id, n]));

  const xs = doc.nodes.map(n => ports(n));
  const minX = Math.min(...xs.map(p => p.left)), maxX = Math.max(...xs.map(p => p.right));
  const minY = Math.min(...xs.map(p => p.top)),  maxY = Math.max(...xs.map(p => p.bottom));
  const chartW = maxX - minX, chartH = maxY - minY;

  const W = Math.max(chartW, 760) + PAD * 2;
  const inner = W - PAD * 2;

  // 头部
  const prog = docProgress(doc);
  let y = PAD + 22;
  let head = `<text x="${PAD}" y="${y}" font-family="${FONT}" font-size="9.5" font-weight="600" letter-spacing="2.4" fill="${C.gold}">RUNFLOW</text>`;
  y += 26;
  head += `<text x="${PAD}" y="${y}" font-family="${FONT}" font-size="22" font-weight="600" letter-spacing="-0.6" fill="${C.ink}">${esc(doc.title)}</text>`;
  y += 18;
  head += `<text x="${PAD}" y="${y}" font-family="${MONO}" font-size="10" letter-spacing="0.4" fill="${C.ink3}">${esc(
    `${prog.done}/${prog.total} DONE · ${totalDays(doc)} DAYS · ${noted.length} NOTES`)}</text>`;
  y += 14;
  head += `<rect x="${PAD}" y="${y}" width="${inner}" height="2" fill="${C.ink}"/>`;

  // 图
  const chartTop = y + 28;
  const dx = PAD - minX, dy = chartTop - minY;
  let chart = `<g transform="translate(${dx} ${dy})">`;
  for (const e of doc.edges) {
    const a = byId.get(e.source), b = byId.get(e.target);
    if (!a || !b) continue;
    chart += `<path d="${edgePath(a, b)}" fill="none" stroke="${e.dashed ? C.ink4 : C.ink}" stroke-width="1"${e.dashed ? ' stroke-dasharray="4 4"' : ''}/>`;
  }
  for (const e of doc.edges.filter(e => e.label)) {
    const a = byId.get(e.source), b = byId.get(e.target);
    if (!a || !b) continue;
    const { x, y: ly } = edgeLabelPos(a, b);
    chart += `<rect x="${x - 10}" y="${ly - 8}" width="20" height="13" fill="${C.paper}"/>
      <text x="${x}" y="${ly + 2}" font-family="${MONO}" font-size="10" fill="${e.dashed ? C.ink4 : C.ink}" text-anchor="middle">${esc(e.label!)}</text>`;
  }
  for (const n of doc.nodes) chart += drawNode(n, notes.get(n.id));
  chart += `</g>`;

  // 附注表
  let ny = chartTop + chartH + 40;
  let table = `<rect x="${PAD}" y="${ny}" width="${inner}" height="2" fill="${C.ink}"/>`;
  ny += 22;
  table += `<text x="${PAD}" y="${ny}" font-family="${MONO}" font-size="9" font-weight="500" letter-spacing="1.6" fill="${C.ink4}">附注 · NOTES</text>`;
  ny += 8;

  const idxW = 32, bodyW = inner - idxW;
  for (const n of noted) {
    ny += 14;
    table += `<rect x="${PAD}" y="${ny - 4}" width="${inner}" height="1" fill="${C.ruleFaint}"/>`;
    ny += 16;
    table += `<text x="${PAD}" y="${ny}" font-family="${MONO}" font-size="10" font-weight="500" fill="${C.gold}">${String(notes.get(n.id)).padStart(2, '0')}</text>`;
    table += `<text x="${PAD + idxW}" y="${ny}" font-family="${FONT}" font-size="12" font-weight="600" fill="${C.ink}">${esc(n.title)}</text>`;
    for (const line of wrap(noteToProse(n, redact), bodyW, 11.5)) {
      ny += 18;
      table += `<text x="${PAD + idxW}" y="${ny}" font-family="${FONT}" font-size="11.5" fill="${C.ink3}">${esc(line)}</text>`;
    }
  }
  const H = ny + PAD;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${C.paper}"/>
${head}
${chart}
${table}
</svg>`;
}
