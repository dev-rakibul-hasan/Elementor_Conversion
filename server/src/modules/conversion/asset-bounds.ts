import type { DIRRect } from '../dir/types.js';

/** Validate screenshot coordinates without inferring, scaling or clamping a crop. */
export function isValidAssetRect(
  rect: unknown,
  image: { width: number; height: number }
): rect is DIRRect {
  if (!rect || typeof rect !== 'object') return false;
  const { x, y, width, height } = rect as DIRRect;
  return [x, y, width, height].every(Number.isFinite) &&
    x >= 0 && y >= 0 && width >= 1 && height >= 1 &&
    x + width <= image.width && y + height <= image.height;
}
