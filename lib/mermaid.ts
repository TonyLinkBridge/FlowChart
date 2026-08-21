import { autoLayout } from './layout';
import type { FlowDoc, FlowEdge, FlowNode, Shape } from './types';

/** 一行里连接两个节点的箭头。虚线用 -.-> ，实线用 --> 。
 *  标签写在箭头中间：A -->|"是"| B */
const ARROW = /\s*(-\.->|-\.-|-{2,3}>|={2,3}>|-{3})\s*(?:\|\s*"?([^|"]*?)"?\s*\|)?\s*/;

/** 节点声明：id + 形状括号 + 文字。
 *  A["文字"] 矩形 / A(["文字"]) 起止 / A{"文字"} 判断 / A("文字") 圆角 */
const NODE = /^([A-Za-z0-9_-]+)\s*(\(\[[\s\S]*\]\)|\[\([\s\S]*\)\]|\{\{[\s\S]*\}\}|\[\[[\s\S]*\]\]|\{[\s\S]*\}|\[[\s\S]*\]|\(\([\s\S]*\)\)|\([\s\S]*\))?\s*$/;

function shapeOf(bracket: string | undefined): Shape | undefined {
  if (!bracket) return undefined;
  if (bracket.startsWith('([') || bracket.startsWith('((')) return 'terminator';
  if (bracket.startsWith('{')) return 'decision';
  return undefined;   // 其余一律当普通步骤
}

/** 去掉包裹的括号和引号，把 <br> 换成真正的换行。 */
function labelOf(bracket: string | undefined, id: string) {
  if (!bracket) return id;
  let t = bracket
    .replace(/^\(\[|\]\)$/g, '').replace(/^\[\(|\)\]$/g, '')
    .replace(/^\{\{|\}\}$/g, '').replace(/^\[\[|\]\]$/g, '')
    .replace(/^\(\(|\)\)$/g, '')
    .replace(/^[[{(]|[\]})]$/g, '')
    .trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
  return t.replace(/<br\s*\/?>/gi, '\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() || id;
}

/** 看着像不像 Mermaid —— 用来决定粘贴时走哪个解析器。 */
export function looksLikeMermaid(text: string) {
  return /^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im.test(text) || /-->|-\.->/.test(text);
}

export interface MermaidStats { nodes: number; edges: number; decisions: number }

/** 解析 Mermaid 流程图。认不出的行直接跳过，不猜、不报错、不把整段吞成一个节点。 */
export function parseMermaid(text: string, title = '导入的流程'): { doc: FlowDoc; stats: MermaidStats } | null {
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  let direction: 'TB' | 'LR' = 'TB';

  const touch = (raw: string): string | null => {
    const m = raw.trim().match(NODE);
    if (!m) return null;
    const [, id, bracket] = m;
    const existing = nodes.get(id);
    // 后面再次提到同一个 id 时只带 id、不带文字，别把已有的标题覆盖掉
    if (!existing) {
      nodes.set(id, { id, title: labelOf(bracket, id), shape: shapeOf(bracket) });
    } else if (bracket) {
      nodes.set(id, { ...existing, title: labelOf(bracket, id), shape: shapeOf(bracket) ?? existing.shape });
    }
    return id;
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    const head = line.match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i);
    if (head) { direction = /LR|RL/i.test(head[1]) ? 'LR' : 'TB'; continue; }
    if (/^(subgraph|end|classDef|class|style|click|linkStyle)\b/i.test(line)) continue;

    if (!ARROW.test(line)) { touch(line); continue; }

    // 按箭头切开：[节点, 箭头, 标签, 节点, 箭头, 标签, 节点…]
    const parts = line.split(new RegExp(ARROW.source, 'g'));
    let prev: string | null = null;
    for (let i = 0; i < parts.length; i += 3) {
      const id = touch(parts[i] ?? '');
      // 连接「上一个 → 当前」的箭头在当前节点的**前面**：parts[i-2] 是箭头，parts[i-1] 是标签
      const arrow = parts[i - 2];
      const label = parts[i - 1];
      if (prev && id) {
        edges.push({
          source: prev, target: id,
          label: label?.trim() || undefined,
          dashed: !!arrow && arrow.includes('.'),
        });
      }
      if (id) prev = id;
    }
  }

  if (!nodes.size) return null;
  const list = [...nodes.values()];
  return {
    doc: autoLayout({ title, direction, nodes: list, edges }),
    stats: { nodes: list.length, edges: edges.length, decisions: list.filter(n => n.shape === 'decision').length },
  };
}
