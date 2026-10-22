import type { FlowDoc } from './types';
import type { DocumentDiff } from './version-diff';

export interface VersionSnapshot {
  id: string;
  version: number;
  savedBy: string;
  savedName: string | null;
  note: string | null;
  createdAt: number;
}

export interface RestorePreview {
  flowId: string;
  currentVersion: number;
  /** Preserve the database's microseconds; converting through Date would lose precision. */
  currentUpdatedAt: string;
  snapshot: VersionSnapshot;
  diff: DocumentDiff;
}

export interface RestoreRequest {
  snapshotId: string;
  expectedVersion: number;
  expectedUpdatedAt: string;
}

export interface RestoreResult {
  doc: FlowDoc;
  version: number;
  restoredSnapshotId: string;
  restoredFrom: { id: string; version: number };
  backup: { id: string; version: number; createdAt: string };
}
