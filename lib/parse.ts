import { autoLayout } from './layout';
import type { FlowDoc, FlowEdge, FlowNode } from './types';

export interface ParseStats { steps: number; decisions: number; substeps: number; branches: number }
export interface Parsed { doc: FlowDoc; stats: ParseStats }

/** 行首的编号/项目符号：1. 1、 1) - * • ・ 等，去掉不影响内容 */
const BULLET = /^\s*(?:\d+[.)、．]|[-*•·–—])\s*/;
/** 缩进：两个空格或一个 Tab 算一级 */
const INDENT = /^(\s*)/;
/** 分支前缀：是：/ 否: / yes: / no: */
const BRANCH = /^(是|否|yes|no)\s*[:：]\s*/i;

function takeOwner(text: string) {
  const m = text.match(/@([^\s@，,、]{1,12})/);
  return m ? { text: text.replace(m[0], '').trim(), owner: m[1] } : { text, owner: undefined };
}

function takeDays(text: string) {
  const m = text.match(/(\d+)\s*(?:天|d\b|D\b)/);
  return m ? { text: text.replace(m[0], '').trim(), days: Number(m[1]) } : { text, days: undefined };
}

/** 把一段粘贴进来的文字变成流程图。
 *  规则是死的，不猜：每行一步、缩进变子步骤、问号结尾是判断、是/否开头是分支。
 *  看不懂的部分宁可原样当一步，也不瞎改用户的字。 */
export function parseText(text: string, title = '粘贴的流程'): Parsed | null {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const stats: ParseStats = { steps: 0, decisions: 0, substeps: 0, branches: 0 };

  let seq = 0;
  let tail: string | null = null;        // 主干末梢，下一步接在它后面
  let lastDecision: string | null = null; // 最近的判断节点，是/否 接在它后面
  let lastTop: FlowNode | null = null;    // 最近的顶层节点，缩进行归给它

  for (const line of raw) {
    if (!line.trim()) continue;
    const indent = (line.match(INDENT)?.[1] ?? '').replace(/\t/g, '  ').length;
    let body = line.replace(BULLET, '').trim();
    if (!body) continue;

    // 缩进行 → 上一步的子步骤，不单独成节点
    if (indent >= 2 && lastTop) {
      const note = lastTop.note ?? {};
      lastTop.note = { ...note, steps: [...(note.steps ?? []), { text: body, done: false }] };
      stats.substeps++;
      continue;
    }

    const br = body.match(BRANCH);
    const label = br ? (/是|yes/i.test(br[1]) ? '是' : '否') : null;
    if (br) body = body.slice(br[0].length).trim();

    const a = takeOwner(body);
    const b = takeDays(a.text);
    const isDecision = /[?？]\s*$/.test(b.text);

    const id = `n${++seq}`;
    const node: FlowNode = {
      id,
      title: b.text || '未命名',
      shape: isDecision ? 'decision' : undefined,
      owner: a.owner,
      days: b.days,
    };
    nodes.push(node);
    lastTop = node;

    if (label && lastDecision) {
      // 是/否 都从判断节点引出；否 走虚线（失败/驳回分支）
      edges.push({ source: lastDecision, target: id, label, dashed: label === '否' });
      stats.branches++;
      if (label === '是') tail = id;          // 主干沿「是」继续
      if (label === '否') node.muted = true;
    } else {
      if (tail) edges.push({ source: tail, target: id });
      tail = id;
    }

    if (isDecision) { lastDecision = id; stats.decisions++; }
    else stats.steps++;
  }

  if (!nodes.length) return null;
  return { doc: autoLayout({ title, direction: 'TB', nodes, edges }), stats };
}
