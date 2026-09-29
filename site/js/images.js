// Image decoding: premultiplied ImageBitmaps whose long side fits the texture cap.

const DECODE_OPTIONS = {
  imageOrientation: 'from-image',
  premultiplyAlpha: 'premultiply',
  colorSpaceConversion: 'default',
};

/**
 * Decodes an image into a premultiplied ImageBitmap. An image whose long side
 * exceeds maxSide is downscaled to it, keeping its aspect ratio. Every
 * intermediate bitmap is closed.
 * @param {Blob} blob
 * @param {number} maxSide longest allowed side, in px
 * @returns {Promise<ImageBitmap>} rejects when the blob can't be decoded
 */
export async function decodeImage(blob, maxSide) {
  const bitmap = await decodeBlob(blob);
  const longSide = Math.max(bitmap.width, bitmap.height);
  if (longSide <= maxSide) return bitmap;
  const width = Math.max(1, Math.round(bitmap.width * maxSide / longSide));
  const height = Math.max(1, Math.round(bitmap.height * maxSide / longSide));
  try {
    return await downscale(bitmap, width, height);
  } finally {
    bitmap.close();
  }
}

async function decodeBlob(blob) {
  try {
    return await createImageBitmap(blob, DECODE_OPTIONS);
  } catch (error) {
    // A browser that doesn't know an option value rejects with a TypeError;
    // an undecodable image rejects with a DOMException instead.
    if (!(error instanceof TypeError)) throw error;
    return createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
  }
}

async function downscale(bitmap, width, height) {
  let resized = null;
  try {
    resized = await createImageBitmap(bitmap, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
      premultiplyAlpha: 'premultiply',
    });
  } catch {
    resized = null;
  }
  if (resized !== null && resized.width === width && resized.height === height) return resized;
  if (resized !== null) resized.close();

  // The resize options are unsupported here: draw into a canvas instead.
  const surface = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const context = surface.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return createImageBitmap(surface, { premultiplyAlpha: 'premultiply' });
}
