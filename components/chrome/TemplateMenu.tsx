'use client';

import { useState } from 'react';
import { TEMPLATES } from '@/lib/templates';
import type { FlowDoc } from '@/lib/types';
import s from './Chrome.module.css';

/** 模板下拉。默认开的是空白桌布，想要现成的从这里挑。 */
export function TemplateMenu({ onPick, up }: { onPick: (doc: FlowDoc, name: string) => void; up?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <span className={s.exportWrap}>
      <button className={up ? s.tbBtn : s.btn} onClick={() => setOpen(o => !o)}>模板</button>
      {open && (
        <div className={`${s.menu} ${up ? s.menuUp : ''}`}>
          {TEMPLATES.map(t => (
            <button key={t.id} className={s.menuRow}
                    onClick={() => { onPick(t.build(), t.name); setOpen(false); }}>
              <span className={s.menuDesc} style={{ flexGrow: 1 }}>
                <b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--rf-ink)', marginBottom: 4 }}>
                  {t.name}
                </b>
                {t.desc}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
