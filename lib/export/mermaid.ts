import { footnoteIndex, type FlowDoc } from '../types';

const safe = (s: string) => s.replace(/["\n]/g, ' ').trim();

/** 导出 Mermaid：图能贴进 GitHub / 飞书 / Notion。
 *  Mermaid 画不出附注表，所以附注跟在 %% 注释里 —— 内容照样带走，不会丢。 */
export function toMermaid(doc: FlowDoc, opts: { redactFields?: boolean } = {}): string {
  const notes = footnoteIndex(doc);
  const lines = [`%% ${safe(doc.title)} · 由 Runflow 导出`, 'flowchart TD'];

  for (const n of doc.nodes) {
    const fn = notes.get(n.id);
    const label = safe(n.title) + (fn ? ` [${String(fn).padStart(2, '0')}]` : '');
    const shape =
      n.shape === 'decision' ? `{"${label}"}` :
      n.shape === 'terminator' ? `(["${label}"])` : `["${label}"]`;
    lines.push(`  ${n.id}${shape}`);
  }

  for (const e of doc.edges) {
    const arrow = e.dashed ? '-.->' : '-->';
    lines.push(`  ${e.source} ${arrow}${e.label ? `|${safe(e.label)}|` : ''} ${e.target}`);
  }

  const noted = doc.nodes.filter(n => n.note);
  if (noted.length) {
    lines.push('', '%% ---- 附注 ----');
    for (const n of noted) {
      const i = String(notes.get(n.id)).padStart(2, '0');
      lines.push(`%% ${i} ${safe(n.title)}`);
      for (const st of n.note!.steps ?? []) lines.push(`%%    - ${st.done ? '[x]' : '[ ]'} ${safe(st.text)}`);
      for (const f of n.note!.fields ?? [])
        lines.push(`%%    ${f.label}: ${f.value ? (opts.redactFields ? '(已清空)' : safe(f.value)) : '(待填)'}`);
      for (const l of n.note!.links ?? []) lines.push(`%%    → ${safe(l.label)} ${l.url}`);
      if (n.note!.contact) lines.push(`%%    问谁: ${safe(n.note!.contact)}`);
      if (n.note!.text) lines.push(`%%    ${safe(n.note!.text.replace(/\*\*|`/g, ''))}`);
    }
  }
  return lines.join('\n');
}
