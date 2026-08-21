import type { Note, NoteField, NoteLink, NoteStep } from './types';

/** 附注的增删改。全是纯函数：进去一个 note，出来一个新 note。
 *  面板上所有编辑都收敛到一个 onChange，不用往下传十个回调。 */

export const emptyNote = (): Note => ({ steps: [], fields: [], links: [], contact: '', text: '' });

/** 一条附注是不是空的 —— 全空就该整条删掉，别在节点上留个没内容的脚注号 */
export function isEmptyNote(n?: Note): boolean {
  if (!n) return true;
  return !n.steps?.length && !n.fields?.length && !n.links?.length
      && !n.contact?.trim() && !n.text?.trim();
}

const replaceAt = <T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));
const removeAt  = <T,>(arr: T[], i: number) => arr.filter((_, j) => j !== i);

export const addStep    = (n: Note, text = ''): Note => ({ ...n, steps: [...(n.steps ?? []), { text, done: false }] });
export const setStep    = (n: Note, i: number, p: Partial<NoteStep>): Note =>
  ({ ...n, steps: replaceAt(n.steps ?? [], i, { ...(n.steps ?? [])[i], ...p }) });
export const removeStep = (n: Note, i: number): Note => ({ ...n, steps: removeAt(n.steps ?? [], i) });

export const addField    = (n: Note, label = ''): Note => ({ ...n, fields: [...(n.fields ?? []), { label }] });
export const setFieldAt  = (n: Note, i: number, p: Partial<NoteField>): Note =>
  ({ ...n, fields: replaceAt(n.fields ?? [], i, { ...(n.fields ?? [])[i], ...p }) });
export const removeField = (n: Note, i: number): Note => ({ ...n, fields: removeAt(n.fields ?? [], i) });

export const addLink    = (n: Note, label = ''): Note => ({ ...n, links: [...(n.links ?? []), { label, url: '' }] });
export const setLinkAt  = (n: Note, i: number, p: Partial<NoteLink>): Note =>
  ({ ...n, links: replaceAt(n.links ?? [], i, { ...(n.links ?? [])[i], ...p }) });
export const removeLink = (n: Note, i: number): Note => ({ ...n, links: removeAt(n.links ?? [], i) });
