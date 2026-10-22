'use client';

import { useState } from 'react';
import { toSvg } from '@/lib/export/svg';
import { toMermaid } from '@/lib/export/mermaid';
import { download, slug, svgToPng } from '@/lib/export/download';
import type { FlowDoc } from '@/lib/types';
import { ToastStackProvider, useToastStack } from '@/components/arc/toast-stack/toast-stack';
import { ExportToastViewport } from './ExportToastViewport';
import s from './Chrome.module.css';

type Fmt = 'svg' | 'png' | 'json' | 'mmd';

const ROWS: { fmt: Fmt; key: string; desc: string }[] = [
  { fmt: 'png',  key: 'PNG',  desc: '图 + 附注表，发群里最快' },
  { fmt: 'svg',  key: 'SVG',  desc: '矢量，进 PPT 投大屏不糊' },
  { fmt: 'json', key: 'JSON', desc: '存档，改完能原样导回来' },
  { fmt: 'mmd',  key: 'MMD',  desc: 'Mermaid，贴进 GitHub / 飞书' },
];

interface Props {
  doc: FlowDoc; onDone?: (msg: string) => void; up?: boolean;
  /** The editor owns a persistent notification host across all four views. */
  sharedNotifications?: boolean;
}

export function ExportMenu(props: Props) {
  if (props.sharedNotifications) return <ExportMenuBody {...props} />;
  return <ToastStackProvider><ExportMenuBody {...props} /><ExportToastViewport /></ToastStackProvider>;
}

function ExportMenuBody({ doc, onDone, up }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Fmt | null>(null);
  const { toast, update } = useToastStack();

  // 附注里「要填的」如果已经填了东西，那这份文件就带着业务数据了
  const filled = doc.nodes.flatMap(n => n.note?.fields ?? []).filter(f => f.value?.trim()).length;
  const noteCount = doc.nodes.filter(n => n.note).length;

  async function run(fmt: Fmt, redact: boolean) {
    const format = fmt === 'mmd' ? 'Mermaid' : fmt.toUpperCase();
    const id = toast({ type: 'loading', title: `正在生成 ${format}…`, description: '正在准备文件，尚未交给浏览器下载。' });
    setOpen(false); setPending(null);
    const name = slug(doc.title);
    const tail = redact ? '（已清空填写内容）' : '';
    let completion: string;
    try {
      if (fmt === 'svg' || fmt === 'png') {
        const svg = toSvg(doc, { redactFields: redact });
        if (fmt === 'svg') download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
        else download(await svgToPng(svg), `${name}.png`);
        completion = `已导出 ${fmt.toUpperCase()} · 含 ${noteCount} 条附注${tail}`;
      } else if (fmt === 'json') {
        const data = redact
          ? { ...doc, nodes: doc.nodes.map(n => n.note?.fields
              ? { ...n, note: { ...n.note, fields: n.note.fields.map(f => ({ ...f, value: '' })) } } : n) }
          : doc;
        download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${name}.json`);
        completion = `已导出 JSON${tail}`;
      } else {
        download(new Blob([toMermaid(doc, { redactFields: redact })], { type: 'text/plain' }), `${name}.mmd`);
        completion = `已导出 Mermaid · 附注在注释里${tail}`;
      }
    } catch (error) {
      update(id, { type: 'error', title: `${format} 导出失败`, description: error instanceof Error ? error.message : '文件生成或下载启动失败，请重试。' });
      return;
    }
    update(id, { type: 'success', title: `${format} 文件已生成`,
      description: `已交给浏览器下载${fmt === 'svg' || fmt === 'png' ? ` · 含 ${noteCount} 条附注` : fmt === 'mmd' ? ' · 附注在注释里' : ''}${tail}。请在下载列表确认。` });
    onDone?.(completion);
  }

  return (
    <span className={s.exportWrap}>
      <button className={up ? s.tbBtn : s.btn} onClick={() => { setOpen(o => !o); setPending(null); }}>导出</button>

      {open && (
        <div className={`${s.menu} ${up ? s.menuUp : ''}`}>
          {pending ? (
            <div className={s.guard}>
              <div className={s.guardLabel}>带走之前</div>
              <div className={s.guardText}>
                这份文件的附注里有 <b style={{ fontWeight: 600 }}>{filled} 项填写内容</b>（单号、经办人这类）。
                转发出去就带走了，确认吗？
              </div>
              <div className={s.guardBtns}>
                <button className={s.guardBtn} onClick={() => run(pending, true)}>清空后导出</button>
                <button className={s.guardBtn} onClick={() => run(pending, false)}>一起带走</button>
              </div>
            </div>
          ) : (
            ROWS.map(r => (
              <button key={r.fmt} className={s.menuRow}
                      onClick={() => (filled > 0 ? setPending(r.fmt) : run(r.fmt, false))}>
                <span className={`${s.menuKey} ${r.fmt === 'png' ? s.menuKeyMuted : ''}`}>{r.key}</span>
                <span className={s.menuDesc}>{r.desc}</span>
              </button>
            ))
          )}
        </div>
      )}
    </span>
  );
}
