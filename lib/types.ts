/** 流程图数据模型。
 *  一份 doc 同时喂四个视图：流程图 / 泳道 / 时间条 / 清单。
 *  owner / days / done / note 全部可选 —— 缺了就退回一张普通流程图。 */

export type Shape = 'process' | 'terminator' | 'decision';

export interface NoteStep  { text: string; done: boolean }
export interface NoteField { label: string; value?: string }
export interface NoteLink  { label: string; url: string }

/** 原来的 detail（一坨 HTML 字符串）已废弃，换成结构化的 note。
 *  只有 text 是自由格式，且只收 markdown，不收 HTML。 */
export interface Note {
  steps?:   NoteStep[];
  fields?:  NoteField[];
  links?:   NoteLink[];
  contact?: string;
  text?:    string;
}

/** 节点外观。全部可选 —— 一个不填就是默认的黑白纸面。
 *  size 只存 s/l，中号是默认不落盘。 */
export interface NodeStyle {
  fill?:      string;        // 填充色 #rrggbb
  border?:    string;        // 边框色 #rrggbb
  dashed?:    boolean;       // 边框虚线
  size?:      's' | 'l';     // 字号 小/大（中是默认）
  bold?:      boolean;
  italic?:    boolean;
  underline?: boolean;
  color?:     string;        // 文字颜色 #rrggbb
}

export interface FlowNode {
  id:      string;
  title:   string;
  shape?:  Shape;          // 默认 process
  owner?:  string;         // 泳道视图用
  days?:   number;         // 时间条视图用
  done?:   boolean;        // 清单视图 + 进度条用
  note?:   Note;           // 有 note 才会显示脚注编号
  muted?:  boolean;        // 弱化分支（失败/终止）—— 虚线灰框
  style?:  NodeStyle;      // 头顶工具条改的外观都在这
  href?:   string;         // 节点挂的链接，标题旁出 ↗
  locked?: boolean;        // 锁位置：拖不动，防手滑
  x?:      number;
  y?:      number;
}

export interface FlowEdge {
  source:  string;
  target:  string;
  label?:  string;
  dashed?: boolean;
}

export interface FlowDoc {
  title:      string;
  subtitle?:  string;
  direction?: 'TB' | 'LR';
  nodes:      FlowNode[];
  edges:      FlowEdge[];
}

/** 节点进度：有子步骤就按子步骤算，否则看 done。 */
export function nodeProgress(n: FlowNode): number {
  const steps = n.note?.steps;
  if (steps?.length) return steps.filter(s => s.done).length / steps.length;
  return n.done ? 1 : 0;
}

/** 整份流程完成了几步 —— 顶栏进度条用。 */
export function docProgress(doc: FlowDoc) {
  // 只数真正要干的活：判断、起止、失败分支都不算
  const countable = doc.nodes.filter(
    n => n.shape !== 'decision' && n.shape !== 'terminator' && !n.muted,
  );
  const done = countable.filter(n => nodeProgress(n) === 1).length;
  return { done, total: countable.length, ratio: countable.length ? done / countable.length : 0 };
}

/** 按流程顺序给带 note 的节点排脚注号。插一步删一步会自动重排。 */
export function footnoteIndex(doc: FlowDoc): Map<string, number> {
  const map = new Map<string, number>();
  let i = 0;
  for (const n of doc.nodes) if (n.note) map.set(n.id, ++i);
  return map;
}

/** 总工期：这一版按串行累加，分支合并留到接 dagre 时再算。 */
export function totalDays(doc: FlowDoc): number {
  return doc.nodes.reduce((s, n) => s + (n.days ?? 0), 0);
}

/** 清单视图里真正要干的活（判断、起止、失败分支都不算）。 */
export function workNodes(doc: FlowDoc): FlowNode[] {
  return doc.nodes.filter(
    n => n.shape !== 'decision' && n.shape !== 'terminator' && !n.muted,
  );
}

/** 还剩几天：没干完的活加起来。已经干完的不算，干了一半的按剩余比例折算。 */
export function remainingDays(doc: FlowDoc): number {
  return Math.ceil(
    workNodes(doc).reduce((sum, n) => sum + (n.days ?? 0) * (1 - nodeProgress(n)), 0),
  );
}

/** 勾/取消某个节点的第 i 条子步骤。纯函数，返回新的 doc。 */
export function toggleStep(doc: FlowDoc, nodeId: string, stepIndex: number): FlowDoc {
  return {
    ...doc,
    nodes: doc.nodes.map(n => {
      if (n.id !== nodeId || !n.note?.steps) return n;
      const steps = n.note.steps.map((st, i) => i === stepIndex ? { ...st, done: !st.done } : st);
      return { ...n, note: { ...n.note, steps }, done: steps.every(st => st.done) };
    }),
  };
}


