'use client';

import { Fragment } from 'react';
import {
  addField, addLink, addStep, emptyNote, isEmptyNote,
  removeField, removeLink, removeStep, setFieldAt, setLinkAt, setStep,
} from '@/lib/note';
import type { Note } from '@/lib/types';
import s from './Note.module.css';

/** 极简 markdown：只认 **粗体** 和 `代码`。够写操作说明了，不够用再上库。 */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <b key={i} style={{ fontWeight: 600, color: 'var(--rf-ink)' }}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function SecHead({ label, tools }: { label: string; tools?: React.ReactNode }) {
  return (
    <div className={s.secHead}>
      <span className={s.secLabel}>{label}</span>
      {tools && <span className={s.secTools}>{tools}</span>}
    </div>
  );
}

export function NoteSections({ note, onChange, onRemoveNote }: {
  note?: Note;
  onChange: (n: Note) => void;
  onRemoveNote: () => void;
}) {
  if (!note) {
    return (
      <div className={s.createRow}>
        <button className={s.createBtn} onClick={() => onChange(emptyNote())}>写附注</button>
        <span className={s.createNote}>
          操作步骤、要填的单号、相关链接、找谁 —— 写在这里，节点上只留一个编号。
        </span>
      </div>
    );
  }

  const steps = note.steps ?? [];
  const fields = note.fields ?? [];
  const links = note.links ?? [];
  const doneCount = steps.filter(st => st.done).length;

  return (
    <>
      <div className={s.sec}>
        <SecHead label="怎么做" tools={
          <button className={s.tool} onClick={() => onChange(addStep(note))}>＋ 加一步</button>} />
        {steps.length > 0 && (
          <div className={s.secHead} style={{ marginTop: -4 }}>
            <div className={s.track}><div className={s.fill} style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
            <span className={s.count}>{doneCount} / {steps.length}</span>
          </div>
        )}
        {steps.map((st, i) => (
          <div key={i} className={`${s.step} ${st.done ? s.stepDone : ''}`}>
            <span className={`${s.box} ${st.done ? s.boxDone : s.boxTodo}`} role="checkbox" aria-checked={st.done}
                  onClick={() => onChange(setStep(note, i, { done: !st.done }))}>
              {st.done && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--rf-on-gold)"
                     strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              )}
            </span>
            <span className={s.stepIdx}>{i + 1}</span>
            <input className={s.rowInput} value={st.text} placeholder="这一步要做什么"
                   onChange={e => onChange(setStep(note, i, { text: e.target.value }))} />
            <button className={s.del} onClick={() => onChange(removeStep(note, i))} aria-label="删掉这一步">×</button>
          </div>
        ))}
        {steps.length > 0 && <div className={s.hint}>节点进度由这 {steps.length} 条自动汇总</div>}
      </div>

      <div className={s.sec}>
        <SecHead label="要填的" tools={
          <button className={s.tool} onClick={() => onChange(addField(note))}>＋ 加一格</button>} />
        {fields.map((f, i) => (
          <div key={i} className={s.field}>
            <input className={`${s.rowInput} ${s.fieldLabel}`} value={f.label} placeholder="名称"
                   onChange={e => onChange(setFieldAt(note, i, { label: e.target.value }))} />
            <input className={`${s.rowInput} ${s.rowMono}`} value={f.value ?? ''} placeholder="待填"
                   onChange={e => onChange(setFieldAt(note, i, { value: e.target.value }))} />
            <button className={s.del} onClick={() => onChange(removeField(note, i))} aria-label="删掉这一格">×</button>
          </div>
        ))}
        {fields.length > 0 && <div className={s.hint}>填了内容之后，导出时会问你要不要一起带走</div>}
      </div>

      <div className={s.sec}>
        <SecHead label="相关" tools={
          <button className={s.tool} onClick={() => onChange(addLink(note))}>＋ 加一条</button>} />
        {links.map((l, i) => (
          <div key={i} className={s.field}>
            <input className={`${s.rowInput} ${s.fieldLabel}`} value={l.label} placeholder="名称"
                   onChange={e => onChange(setLinkAt(note, i, { label: e.target.value }))} />
            <input className={`${s.rowInput} ${s.rowMono}`} value={l.url} placeholder="链接"
                   onChange={e => onChange(setLinkAt(note, i, { url: e.target.value }))} />
            <button className={s.del} onClick={() => onChange(removeLink(note, i))} aria-label="删掉这条">×</button>
          </div>
        ))}
      </div>

      <div className={s.sec} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className={s.secLabel}>问谁</span>
        <input className={s.rowInput} value={note.contact ?? ''} placeholder="卡住了找谁"
               onChange={e => onChange({ ...note, contact: e.target.value })} />
      </div>

      <div className={s.sec}>
        <SecHead label="说明" />
        <textarea className={s.area} value={note.text ?? ''}
                  placeholder="补充说明。支持 **粗体** 和 `代码`。"
                  onChange={e => onChange({ ...note, text: e.target.value })} />
        {note.text?.trim() && <div className={s.prose} style={{ marginTop: 10 }}>{inline(note.text)}</div>}
      </div>

      <div className={s.sec} style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className={s.danger} onClick={onRemoveNote}>
          {isEmptyNote(note) ? '这条附注是空的 · 删掉' : '删掉整条附注'}
        </button>
      </div>
    </>
  );
}
