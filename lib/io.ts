import { autoLayout } from './layout';
import type { FlowDoc, FlowEdge, FlowNode, Shape } from './types';

type ParseResult =
  | { ok: true; doc: FlowDoc; warnings: string[] }
  | { ok: false; error: string };

const SHAPES: Shape[] = ['process', 'decision', 'terminator'];
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** 解析别人给的 JSON。外来文件一律当不可信处理：
 *  该丢的丢、该补的补，绝不让一个坏字段把整个应用带崩。 */
export function parseDoc(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { return { ok: false, error: '这不是合法的 JSON —— 文件可能损坏了，或者选错了文件。' }; }

  if (!raw || typeof raw !== 'object') return { ok: false, error: '文件内容不是一个对象。' };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.nodes)) return { ok: false, error: '缺少 nodes —— 这不像是 Runflow 导出的流程图。' };

  const warnings: string[] = [];
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];

  for (const [i, item] of (o.nodes as unknown[]).entries()) {
    if (!item || typeof item !== 'object') { warnings.push(`第 ${i + 1} 个节点不是对象，已跳过`); continue; }
    const n = item as Record<string, unknown>;
    let id = str(n.id);
    if (!id) { warnings.push(`第 ${i + 1} 个节点没有 id，已跳过`); continue; }
    if (seen.has(id)) { const fresh = `${id}-${i}`; warnings.push(`id 重复：${id} → 改成 ${fresh}`); id = fresh; }
    seen.add(id);

    const shape = str(n.shape) as Shape | undefined;
    nodes.push({
      id,
      title: str(n.title) ?? '未命名',
      shape: shape && SHAPES.includes(shape) ? shape : undefined,
      owner: str(n.owner),
      days: num(n.days),
      done: n.done === true,
      muted: n.muted === true,
      note: n.note && typeof n.note === 'object' ? (n.note as FlowNode['note']) : undefined,
      x: num(n.x), y: num(n.y),
    });
  }

  if (!nodes.length) return { ok: false, error: '一个有效节点都没有。' };

  const ids = new Set(nodes.map(n => n.id));
  const edges: FlowEdge[] = [];
  let dangling = 0;
  for (const item of Array.isArray(o.edges) ? (o.edges as unknown[]) : []) {
    if (!item || typeof item !== 'object') { dangling++; continue; }
    const e = item as Record<string, unknown>;
    const source = str(e.source), target = str(e.target);
    if (!source || !target || !ids.has(source) || !ids.has(target)) { dangling++; continue; }
    edges.push({ source, target, label: str(e.label), dashed: e.dashed === true });
  }
  if (dangling) warnings.push(`${dangling} 条连线指向不存在的节点，已丢弃`);

  const doc: FlowDoc = {
    title: str(o.title) ?? '导入的流程',
    subtitle: str(o.subtitle),
    direction: o.direction === 'LR' ? 'LR' : 'TB',
    nodes, edges,
  };

  // 坐标不全就重排一次，不然导进来会叠在一起
  const needLayout = nodes.some(n => n.x === undefined || n.y === undefined);
  return { ok: true, doc: needLayout ? autoLayout(doc) : doc, warnings };
}
