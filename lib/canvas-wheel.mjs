/**
 * Translate a wheel event into a canvas gesture.
 * Plain two-finger/wheel movement pans naturally; pinch and modifier-wheel zoom.
 * @param {{ ctrlKey: boolean, metaKey: boolean, deltaX: number, deltaY: number }} event
 * @returns {{ kind: 'pan', x: number, y: number } | { kind: 'zoom', factor: number }}
 */
export function canvasWheelGesture(event) {
  if (event.ctrlKey || event.metaKey) {
    return { kind: 'zoom', factor: event.deltaY < 0 ? 1.12 : 1 / 1.12 };
  }
  return {
    kind: 'pan',
    x: event.deltaX === 0 ? 0 : -event.deltaX,
    y: event.deltaY === 0 ? 0 : -event.deltaY,
  };
}
