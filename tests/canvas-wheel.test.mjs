import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasWheelGesture } from '../lib/canvas-wheel.mjs';

test('plain vertical wheel pans the canvas instead of zooming', () => {
  assert.deepEqual(
    canvasWheelGesture({ ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 120 }),
    { kind: 'pan', x: 0, y: -120 },
  );
  assert.deepEqual(
    canvasWheelGesture({ ctrlKey: false, metaKey: false, deltaX: 0, deltaY: -80 }),
    { kind: 'pan', x: 0, y: 80 },
  );
});

test('plain horizontal wheel pans the canvas sideways', () => {
  assert.deepEqual(
    canvasWheelGesture({ ctrlKey: false, metaKey: false, deltaX: 40, deltaY: 0 }),
    { kind: 'pan', x: -40, y: 0 },
  );
});

test('control or command wheel remains a zoom gesture', () => {
  assert.deepEqual(
    canvasWheelGesture({ ctrlKey: true, metaKey: false, deltaX: 0, deltaY: -10 }),
    { kind: 'zoom', factor: 1.12 },
  );
  assert.deepEqual(
    canvasWheelGesture({ ctrlKey: false, metaKey: true, deltaX: 0, deltaY: 10 }),
    { kind: 'zoom', factor: 1 / 1.12 },
  );
});
