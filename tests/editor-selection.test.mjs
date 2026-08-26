import assert from 'node:assert/strict';
import test from 'node:test';

import { initialSelectedNode, shouldClearCanvasSelection } from '../lib/editor-selection.mjs';

test('editor starts without a selected node', () => {
  assert.equal(initialSelectedNode(), null);
});

test('left-clicking blank canvas clears the current selection', () => {
  assert.equal(shouldClearCanvasSelection({ button: 0, overInteractive: false }), true);
});

test('clicking a node, popover, or using another mouse button keeps the selection', () => {
  assert.equal(shouldClearCanvasSelection({ button: 0, overInteractive: true }), false);
  assert.equal(shouldClearCanvasSelection({ button: 1, overInteractive: false }), false);
});
