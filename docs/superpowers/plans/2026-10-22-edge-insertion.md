# Connection insertion implementation plan

> Execute inline, without subagents or commits, as requested by the user.

**Goal:** Insert a step on one chosen connection, preserve its data, and undo it in one action.

**Architecture:** A pure document operation replaces one exact edge and makes only local vertical room. An unscaled button overlay delegates to the editor's existing history and save path, without refitting the viewport.

**Tech stack:** Existing React, TypeScript, CSS modules, Vitest. No new dependency.

**Spec:** User-approved design in this conversation: connection “＋插入”, automatic reconnection, minimal movement, preserve notes/mail/labels, undo, local branched fake-data tests only.

## Constraints

- No real flow, database, version-restore, export, or existing add-node behavior changes.
- No GitHub push; preserve prior dirty worktree changes.
- Keep branch label on the upstream half; preserve dashed styling on both halves.
- Leave all nodes still when space permits. Otherwise shift only the target and its reachable successors by the minimum required gap.
- Refuse safely if a back edge, locked descendant, missing coordinates, or collision prevents that placement.

## Review focus

- Parallel edges must be selected by exact array index.
- Joins and cycles must not shift the source or unrelated branches.
- Complete note objects and existing footnote order must survive insertion.
- Button pointer/Space/Delete events must not trigger canvas dragging or deletion.
- Undo/redo and autosave must preserve both this flow and another untouched fake flow.

## Tasks

- [x] Add failing pure-operation tests for rewiring, labels, note preservation, sufficient space, local shifts, joins, parallel edges, invalid/cyclic/locked/collision cases.
- [x] Implement `insertNodeOnEdge(doc, index)` in `lib/doc.ts`, returning success `{doc,id}` or `{error}` without mutating inputs; run tests green.
- [x] Add failing editor integration tests for insertion, persisted one-step undo/redo, unchanged other flow and viewport; implement overlay controls plus optional no-refit commit.
- [x] Add keyboard/pointer and screen-position tests for the overlay, then verify full tests, types, build, targeted lint, and diff scope.
- [x] Exercise real editor locally against a branched fake API fixture: insert trunk and yes/no branch, undo/redo, inspect notes/labels/positions and untouched B; check keyboard and mobile hit targets.

## Acceptance notes

- Real editor used with external identity/realtime and API boundaries replaced by local fake data; no real business calls.
- Main chain: new step inserted between notice and waiting; only reachable successors shifted 76 units, unrelated locked node unchanged; viewport transform unchanged.
- Yes branch: upstream label and dashed styling retained, court and join moved only 22 units; sibling execution branch unchanged. All original note objects and full mail template retained.
- No branch: Space activation inserted on the correct branch, did not enter canvas-pan mode, and left court branch unchanged. Ctrl+Z worked while insertion button retained focus.
- Undo restored the exact original document; redo restored the exact inserted document. Autosave wrote only fake flow A, never B.
- At 390 CSS pixels / 24% fit, always-visible buttons overlapped. Controls now reveal on edge hover/selection or keyboard focus; merging edges use their individual horizontal legs when needed. No new animation.
- One initially inconsistent browser run included concurrent manual insertions; user confirmed they were clicking the same preview. Isolated reruns matched exactly.
- Production build and type check passed. New/changed standalone modules pass lint; editor retains the same pre-existing lint rule counts as HEAD, without a broad cleanup.
- Scope baseline: only editor wiring, connection presentation, insertion helper, associated tests/fixture and this plan changed during this task. No package, database, restore or deployment changes; no commit or push.
- Deliberate limitation: backward/horizontal/cyclic connections, required movement of locked descendants, or unsafe node collisions are refused with a message, not force-rearranged.
