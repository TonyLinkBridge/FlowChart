'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { RichTextEditor, htmlToNoteMarkdown, noteMarkdownToHtml, type RichTextValue } from '@/components/arc/rich-text-editor/rich-text-editor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import s from './NoteRichTextEditor.module.css';

const subscribe = () => () => {};
const client = () => true;
const server = () => false;
const normalized = (text: string) => text.replace(/\r\n?/g, '\n');

/** External replacements start a fresh session; typing echoes do not reset caret/history. */
export function NoteRichTextEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [seen, setSeen] = useState({ value, revision: 0 });
  if (value !== seen.value) setSeen({ value, revision: seen.revision + 1 });
  return <NoteEditorSession key={seen.revision} initialValue={value} onChange={next => {
    setSeen(current => ({ ...current, value: next }));
    onChange(next);
  }} />;
}

function NoteEditorSession({ initialValue, onChange }: { initialValue: string; onChange: (text: string) => void }) {
  const mounted = useSyncExternalStore(subscribe, client, server);
  const [state, setState] = useState(() => ({ text: initialValue, html: noteMarkdownToHtml(initialValue) }));
  const [mode, setMode] = useState<'rich' | 'source'>('rich');
  const ready = useRef(false);
  const originals = useRef(new Map<string, string>());
  const endings = state.text.match(/\r\n|\r|\n/g) ?? [];
  const mixedEndings = endings.some(ending => ending !== endings[0]);
  // Refuse lossy conversion (unsupported syntax, unusual numbering, invisible data, etc.).
  const supported = mounted && !mixedEndings && htmlToNoteMarkdown(noteMarkdownToHtml(state.text)) === normalized(state.text);
  const rich = supported && mode === 'rich';

  function changeRich(value: RichTextValue) {
    if (!ready.current) {
      // Arc emits during mount/load. Reading or changing mode must never auto-save.
      ready.current = true;
      originals.current.set(value.html, state.text);
      return;
    }
    let next = originals.current.get(value.html);
    if (next === undefined) {
      const newline = endings[0] ?? '\n';
      next = htmlToNoteMarkdown(value.html).replace(/\n/g, newline);
      originals.current.set(value.html, next);
      if (originals.current.size > 300) originals.current.delete(originals.current.keys().next().value!);
    }
    setState({ text: next, html: value.html });
    if (next !== state.text) onChange(next);
  }

  return <div className={s.root} data-note-rich data-pop
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}
    onPaste={event => event.stopPropagation()}>
    <Tabs className={s.tabs} value={rich ? 'rich' : 'source'} onValueChange={next => {
      if (next === 'rich' && supported) { ready.current = false; setMode('rich'); }
      else if (next === 'source') setMode('source');
    }}>
      <TabsList className={s.modes} aria-label="附注编辑方式">
        <TabsTrigger value="rich" disabled={!supported}>格式编辑</TabsTrigger>
        <TabsTrigger value="source">原文编辑</TabsTrigger>
      </TabsList>
      {/* Keep panel semantics, but mount only the active editor. No overlapping editable exit copy. */}
      <TabsContent value="rich" forceMount hidden={!rich} className={s.modePanel}>
        {rich && <RichTextEditor className={s.surface} value={state.html} aria-label="附注／邮件模板格式编辑"
          placeholder="补充说明或邮件模板" blockHint="输入 / 选择段落格式" onChange={changeRich} />}
      </TabsContent>
      <TabsContent value="source" forceMount hidden={rich} className={s.modePanel}>
        {!rich && <textarea className={s.source} value={state.text} aria-label="附注／邮件模板原文"
          placeholder="补充说明。支持 **粗体** 和 `代码`。" onChange={event => {
            const text = event.target.value;
            ready.current = false;
            setMode('source');
            setState({ text, html: noteMarkdownToHtml(text) });
            onChange(text);
          }} />}
      </TabsContent>
    </Tabs>
    <p className={s.hint}>{mounted && !supported
      ? '为保留原始格式，这段内容使用原文编辑，不自动转换。'
      : '选中文字可设置格式；原文随时可查看。小预览与导出沿用原有显示。'}</p>
  </div>;
}
