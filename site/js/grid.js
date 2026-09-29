// The Cartesian grid background, drawn at the canvas's device-pixel size so that
// it shows at 1:1. Its palette is that of assets/backgrounds/thumbs/grid.png.

const BACKGROUND = 'rgb(5 7 13)';
const LINE = 'rgb(48 56 92)';
const MAJOR_LINE = 'rgb(104 114 180)';
const PITCH_CSS_PX = 24;
const MAJOR_EVERY = 5; // lines, counted from the centre

/**
 * Draws the grid: lines one device pixel wide every round(24 × pixelRatio) px,
 * with a vertical and a horizontal line through the centre pixel (⌊W/2⌋, ⌊H/2⌋),
 * and every fifth line from the centre brighter.
 * @param {number} width  in device px
 * @param {number} height in device px
 * @param {number} pixelRatio the window's devicePixelRatio
 * @returns {Promise<ImageBitmap>} opaque, and premultiplied as decodeImage's are
 */
export function createGridImage(width, height, pixelRatio) {
  const pitch = Math.max(1, Math.round(PITCH_CSS_PX * pixelRatio));
  const { surface, context } = createSurface(width, height);
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);
  // Minor lines first, so the major lines win where they cross.
  for (const major of [false, true]) {
    context.fillStyle = major ? MAJOR_LINE : LINE;
    for (const x of linePositions(width, pitch, major)) context.fillRect(x, 0, 1, height);
    for (const y of linePositions(height, pitch, major)) context.fillRect(0, y, width, 1);
  }
  return createImageBitmap(surface, { premultiplyAlpha: 'premultiply' });
}

// Where the lines fall along one axis: through the centre pixel and every pitch
// px either side of it. Every fifth line, counted from the centre, is major.
function linePositions(length, pitch, major) {
  const centre = Math.floor(length / 2);
  const positions = [];
  for (let k = -Math.floor(centre / pitch); centre + k * pitch < length; k += 1) {
    if ((k % MAJOR_EVERY === 0) === major) positions.push(centre + k * pitch);
  }
  return positions;
}

// Some browsers have OffscreenCanvas without its 2D context; they get a canvas.
// willReadFrequently keeps the canvas, and so the bitmap, in CPU memory: the
// renderer re-uploads that bitmap after a GPU reset, which a GPU copy won't survive.
function createSurface(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    const surface = new OffscreenCanvas(width, height);
    const context = surface.getContext('2d', { alpha: false, willReadFrequently: true });
    if (context) return { surface, context };
  }
  const surface = Object.assign(document.createElement('canvas'), { width, height });
  return { surface, context: surface.getContext('2d', { alpha: false, willReadFrequently: true }) };
}
