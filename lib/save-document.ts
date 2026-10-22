import { mergeDocs } from './merge';
import type { FlowDoc } from './types';

/** Publish refs before React's async render, so a waiting restore never resaves pre-merge data. */
export function publishMergedSave(
  submitted: FlowDoc,
  saved: FlowDoc,
  current: { current: FlowDoc },
  loaded: { current: FlowDoc | null },
  render: (doc: FlowDoc) => void,
): void {
  const next = current.current === submitted ? saved : mergeDocs(submitted, current.current, saved).doc;
  if (current.current === submitted) loaded.current = next;
  current.current = next;
  render(next);
}

/** Apply only a response for the still-open flow; publish all refs before rendering. */
export function acceptRestoredDocument(
  id: string,
  result: { doc: FlowDoc; version: number },
  openId: string | null,
  sync: { current: { id: string | null; doc: FlowDoc | null; version: number } },
  current: { current: FlowDoc },
  loaded: { current: FlowDoc | null },
  render: (doc: FlowDoc) => void,
): boolean {
  if (openId !== id || sync.current.id !== id || sync.current.version > result.version) return false;
  sync.current = { id, doc: result.doc, version: result.version };
  current.current = result.doc;
  loaded.current = result.doc;
  render(result.doc);
  return true;
}
