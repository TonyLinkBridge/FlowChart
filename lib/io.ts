import { autoLayout } from './layout';
import type { FlowDoc, FlowEdge, FlowNode, Note, Shape } from './types';

type ParseResult =
  | { ok: true; doc: FlowDoc; warnings: string[] }
  | { ok: false; error: string };

const SHAPES: Shape[] = ['process', 'decision', 'terminator'];
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** 超长就掐短 —— 没有哪个字段该装得下一本书。 */
const capped = (v: unknown, max: number) => {
  const s = str(v);
  return s === undefined ? undefined : s.slice(0, max);
};

/** 各字段的上限。浏览器导入和服务端接口用同一份数字。 */
export const LIMITS = {
  nodes: 800, noteItems: 200,
  title: 160, owner: 80, label: 120, stepText: 500, noteText: 10_000, contact: 300, url: 2_000,
} as const;

/** 附注逐字段过筛：类型不对的丢，超长的掐。
 *  附注是外来数据里最自由的一块，以前整个原样放行 —— 一条怪形状的
 *  steps 就能把气泡和导出一起带崩，现在进不来了。 */
function parseNote(raw: unknown): Note | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const note: Note = {};

  if (Array.isArray(o.steps)) {
    const steps = o.steps.slice(0, LIMITS.noteItems).flatMap(it => {
      if (!it || typeof it !== 'object') return [];
      const s = it as Record<string, unknown>;
      const text = capped(s.text, LIMITS.stepText);
      return text ? [{ text, done: s.done === true }] : [];
    });
    if (steps.length) note.steps = steps;
  }
  if (Array.isArray(o.fields)) {
    const fields = o.fields.slice(0, LIMITS.noteItems).flatMap(it => {
      if (!it || typeof it !== 'object') return [];
      const f = it as Record<string, unknown>;
      const label = capped(f.label, LIMITS.label);
      return label ? [{ label, value: capped(f.value, LIMITS.stepText) }] : [];
    });
    if (fields.length) note.fields = fields;
  }
  if (Array.isArray(o.links)) {
    const links = o.links.slice(0, LIMITS.noteItems).flatMap(it => {
      if (!it || typeof it !== 'object') return [];
      const l = it as Record<string, unknown>;
      const url = capped(l.url, LIMITS.url);
      return url ? [{ label: capped(l.label, LIMITS.label) || url, url }] : [];
    });
    if (links.length) note.links = links;
  }
  const contact = capped(o.contact, LIMITS.contact);
  if (contact) note.contact = contact;
  const text = capped(o.text, LIMITS.noteText);
  if (text) note.text = text;

  return Object.keys(note).length ? note : undefined;
}

/** 校验一个已经 parse 出来的值。外来数据一律当不可信处理：
 *  该丢的丢、该补的补，绝不让一个坏字段把整个应用带崩。
 *  浏览器导入和服务端接口共用这一份 —— 规则只写一遍，两边不会各说各话。
 *  allowEmpty：服务端存「节点删光」的图是合法的；导入一张空图则该报错。 */
export function parseDocValue(raw: unknown, opts?: { allowEmpty?: boolean }): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '文件内容不是一个对象。' };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.nodes)) return { ok: false, error: '缺少 nodes —— 这不像是 Runflow 导出的流程图。' };
  if (o.nodes.length > LIMITS.nodes) return { ok: false, error: `节点太多（${o.nodes.length} 个，上限 ${LIMITS.nodes}）。` };

  const warnings: string[] = [];
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];

  for (const [i, item] of (o.nodes as unknown[]).entries()) {
    if (!item || typeof item !== 'object') { warnings.push(`第 ${i + 1} 个节点不是对象，已跳过`); continue; }
    const n = item as Record<string, unknown>;
    let id = capped(n.id, 80);
    if (!id) { warnings.push(`第 ${i + 1} 个节点没有 id，已跳过`); continue; }
    if (seen.has(id)) { const fresh = `${id}-${i}`; warnings.push(`id 重复：${id} → 改成 ${fresh}`); id = fresh; }
    seen.add(id);

    const shape = str(n.shape) as Shape | undefined;
    nodes.push({
      id,
      title: capped(n.title, LIMITS.title) ?? '未命名',
      shape: shape && SHAPES.includes(shape) ? shape : undefined,
      owner: capped(n.owner, LIMITS.owner),
      days: num(n.days),
      done: n.done === true,
      muted: n.muted === true,
      note: parseNote(n.note),
      x: num(n.x), y: num(n.y),
    });
  }

  if (!nodes.length && !opts?.allowEmpty) return { ok: false, error: '一个有效节点都没有。' };

  const ids = new Set(nodes.map(n => n.id));
  const edges: FlowEdge[] = [];
  let dangling = 0;
  for (const item of Array.isArray(o.edges) ? (o.edges as unknown[]) : []) {
    if (!item || typeof item !== 'object') { dangling++; continue; }
    const e = item as Record<string, unknown>;
    const source = str(e.source), target = str(e.target);
    if (!source || !target || !ids.has(source) || !ids.has(target)) { dangling++; continue; }
    edges.push({ source, target, label: capped(e.label, LIMITS.label), dashed: e.dashed === true });
  }
  if (dangling) warnings.push(`${dangling} 条连线指向不存在的节点，已丢弃`);

  const doc: FlowDoc = {
    title: capped(o.title, LIMITS.title) ?? '导入的流程',
    subtitle: capped(o.subtitle, 300),
    direction: o.direction === 'LR' ? 'LR' : 'TB',
    nodes, edges,
  };

  // 坐标不全就重排一次，不然导进来会叠在一起
  const needLayout = nodes.length > 0 && nodes.some(n => n.x === undefined || n.y === undefined);
  return { ok: true, doc: needLayout ? autoLayout(doc) : doc, warnings };
}

/** 解析别人给的 JSON 文本（导入文件走这里）。 */
export function parseDoc(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { return { ok: false, error: '这不是合法的 JSON —— 文件可能损坏了，或者选错了文件。' }; }
  return parseDocValue(raw);
}
