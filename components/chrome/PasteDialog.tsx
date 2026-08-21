'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseText } from '@/lib/parse';
import { looksLikeMermaid, parseMermaid } from '@/lib/mermaid';
import type { FlowDoc } from '@/lib/types';
import s from './Chrome.module.css';

const SAMPLE = `提交报销单 @员工 1天
  填金额和事由
  上传发票照片
金额超 5000？
是：总监审批 @总监 2天
否：直接报销 @财务 1天
财务打款 @财务 3天`;

/** 粘贴一段文字生成流程图。
 *  规则是死的、可预期的 —— 先给你看「认出了几步」，你点生成才动图。 */
export function PasteDialog({ initial, onCancel, onGenerate }: {
  initial: string;
  onCancel: () => void;
  onGenerate: (doc: FlowDoc, stats: string) => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  /** 先看像不像 Mermaid。像就走 Mermaid 解析器 —— 
   *  以前不分青红皂白按行切，整段 Mermaid 会被吞成一个叫「flowchart TD」的节点。 */
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    if (looksLikeMermaid(t)) {
      const m = parseMermaid(t);
      return m && { kind: 'mermaid' as const, doc: m.doc, stats: m.stats };
    }
    const r = parseText(t);
    return r && { kind: 'text' as const, doc: r.doc, stats: r.stats };
  }, [text]);

  return (
    <div className={s.pasteWrap} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={s.pasteBox}>
        <div className={s.pasteHead}>
          <span className={s.pasteTitle}>粘贴文字，生成流程图</span>
          <span className={s.pasteHint}>Esc 取消</span>
        </div>

        <textarea
          ref={ref}
          className={s.pasteArea}
          value={text}
          placeholder={SAMPLE}
          onChange={e => setText(e.target.value)}
        />

        <div className={s.pasteRules}>
          每行一步 · 行首的 <b>1. / -</b> 会自动去掉<br />
          <b>缩进两格</b> 的行 → 变成上一步的子步骤<br />
          <b>问号结尾</b> → 判断节点 · 后面用 <b>是：</b> / <b>否：</b> 开头引出两条分支<br />
          <b>@名字</b> → 负责人 · <b>3天</b> → 工期<br />
          直接粘 <b>Mermaid</b> 也认（flowchart TD / --&gt; / 判断菱形都支持）
        </div>

        <div className={s.pasteFoot}>
          <span className={s.pasteStat}>
            {!parsed ? '还没认出内容'
              : parsed.kind === 'mermaid'
                ? <>Mermaid · <b>{parsed.stats.nodes}</b> 个节点 · <b>{parsed.stats.edges}</b> 条连线
                    {parsed.stats.decisions > 0 && <> · <b>{parsed.stats.decisions}</b> 个判断</>}</>
                : <>认出 <b>{parsed.stats.steps}</b> 步
                    {parsed.stats.decisions > 0 && <> · <b>{parsed.stats.decisions}</b> 个判断</>}
                    {parsed.stats.branches > 0 && <> · <b>{parsed.stats.branches}</b> 条分支</>}
                    {parsed.stats.substeps > 0 && <> · <b>{parsed.stats.substeps}</b> 条子步骤</>}</>}
          </span>
          <span className={s.pasteBtns}>
            <button className={s.pasteBtn} onClick={onCancel}>取消</button>
            <button className={s.pasteBtn} disabled={!parsed}
                    onClick={() => parsed && onGenerate(parsed.doc,
                      parsed.kind === 'mermaid'
                        ? `${parsed.stats.nodes} 个节点 · ${parsed.stats.edges} 条连线`
                        : `${parsed.stats.steps} 步${parsed.stats.decisions ? ` · ${parsed.stats.decisions} 个判断` : ''}`)}>
              生成
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
