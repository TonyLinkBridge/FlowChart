/** @returns {string | null} Initial node id before the user clicks anything. */
export function initialSelectedNode() {
  return null;
}

/**
 * @param {{ button: number, overInteractive: boolean }} input
 * @returns {boolean} Whether this canvas pointer-down should clear selection.
 */
export function shouldClearCanvasSelection({ button, overInteractive }) {
  return button === 0 && !overInteractive;
}
