// WebGL2 renderer for the notebook's per-pixel backward map. It touches no DOM
// beyond its canvas and works without main.js.

const FAILURE_MESSAGE = "This page needs WebGL2, which this browser doesn't provide.";

// An attribute-less full-screen triangle: (-1,-1), (3,-1), (-1,3).
const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// The notebook's backward map for one device pixel: black inside the shadow or
// when the source point q falls outside [0, W−1]×[0, H−1], else a bilinear sample.
const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform highp sampler2D uImage;
uniform vec2  uImageSize;     // W, H in image px
uniform float uCanvasHeight;  // drawing-buffer height in device px
uniform vec2  uOffset;        // o, in device px
uniform float uScale;         // device px per image px
uniform float uLod;           // max(0, log2(1/scale))
uniform vec2  uLens;          // lens centre in image px
uniform float uK;             // kPx2
uniform float uShadowR2;      // rShadowPx²
out vec4 outColor;
void main() {
  vec2 e = vec2(gl_FragCoord.x, uCanvasHeight - gl_FragCoord.y); // pixel centre, device-px edge coords, y down
  vec2 p = (e - uOffset) / uScale - 0.5;                           // image px
  vec2 d = p - uLens;
  float r2 = dot(d, d);
  vec3 rgb = vec3(0.0);
  if (r2 > uShadowR2) {
    vec2 q = p - d * (uK / r2);
    if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThanEqual(q, uImageSize - 1.0))) {
      rgb = textureLod(uImage, (q + 0.5) / uImageSize, uLod).rgb;
    }
  }
  outColor = vec4(rgb, 1.0);
}
`;

/**
 * @typedef {object} Renderer
 * @property {number} maxTextureSize   gl.MAX_TEXTURE_SIZE
 * @property {number} imageWidth       0 until the first setImage (getter)
 * @property {number} imageHeight      0 until the first setImage (getter)
 * @property {(bitmap: ImageBitmap) => void} setImage
 *   Takes ownership of the bitmap and closes the one it held before. Uploads RGBA8 with
 *   mipmaps and keeps the bitmap for context restore. Recomputes fit and lod. Does not
 *   move the lens.
 * @property {(x: number, y: number) => void} setLens
 *   Lens centre, in image px.
 * @property {(xEdge: number, yEdge: number) => void} setLensFromDevice
 *   Device-px edge coordinates, y down, measured from the canvas's top-left.
 *   Sets lens = (E − o)/scale − 0.5. Must not allocate.
 * @property {(s: {kPx2: number, rShadowPx: number}) => void} setScalars
 * @property {(width: number, height: number) => void} resize
 *   Drawing-buffer size in device px. Sets canvas.width and canvas.height, the viewport,
 *   the fit (scale, o) and lod.
 * @property {() => void} render
 *   Exactly one gl.drawArrays(TRIANGLES, 0, 3). Does nothing while the context is lost
 *   or before any image is set. Must not allocate.
 */

/**
 * Creates the lens renderer on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ onRestored?: () => void }} [options] onRestored runs after a lost context
 *        is restored and every resource has been rebuilt
 * @returns {Renderer}
 * @throws {Error} with a message fit for users when WebGL2 is unavailable or the shaders
 *         fail to compile or link; the log goes to console.error
 */
export function createRenderer(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error(FAILURE_MESSAGE);

  const onRestored = options.onRestored;
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  // Inputs, in image px unless noted.
  let bitmap = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let canvasWidth = canvas.width;   // device px
  let canvasHeight = canvas.height; // device px
  let scale = 1;                    // device px per image px
  let offsetX = 0;                  // device px
  let offsetY = 0;                  // device px
  let lod = 0;
  let lensX = 0;
  let lensY = 0;
  let k = 0;
  let shadowR2 = 0;

  // GL state.
  let lost = false;
  let program = null;
  let texture = null;
  let textureWidth = 0;
  let textureHeight = 0;
  let uImageSize = null;
  let uCanvasHeight = null;
  let uOffset = null;
  let uScale = null;
  let uLod = null;
  let uLens = null;
  let uK = null;
  let uShadowR2 = null;

  // The value each uniform last received; NaN forces the next write.
  let sentImageWidth = NaN;
  let sentImageHeight = NaN;
  let sentCanvasHeight = NaN;
  let sentOffsetX = NaN;
  let sentOffsetY = NaN;
  let sentScale = NaN;
  let sentLod = NaN;
  let sentLensX = NaN;
  let sentLensY = NaN;
  let sentK = NaN;
  let sentShadowR2 = NaN;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function buildProgram() {
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    const linked = gl.createProgram();
    gl.attachShader(linked, vertex);
    gl.attachShader(linked, fragment);
    gl.linkProgram(linked);
    if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
      console.error('The lens shaders failed to compile or link.',
        '\nVertex shader:', gl.getShaderInfoLog(vertex),
        '\nFragment shader:', gl.getShaderInfoLog(fragment),
        '\nProgram:', gl.getProgramInfoLog(linked));
      gl.deleteProgram(linked);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      throw new Error(FAILURE_MESSAGE);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    program = linked;
    gl.useProgram(program);
    uImageSize = gl.getUniformLocation(program, 'uImageSize');
    uCanvasHeight = gl.getUniformLocation(program, 'uCanvasHeight');
    uOffset = gl.getUniformLocation(program, 'uOffset');
    uScale = gl.getUniformLocation(program, 'uScale');
    uLod = gl.getUniformLocation(program, 'uLod');
    uLens = gl.getUniformLocation(program, 'uLens');
    uK = gl.getUniformLocation(program, 'uK');
    uShadowR2 = gl.getUniformLocation(program, 'uShadowR2');
    gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
  }

  function uploadTexture() {
    const width = bitmap.width;
    const height = bitmap.height;
    gl.activeTexture(gl.TEXTURE0);
    if (texture === null || width !== textureWidth || height !== textureHeight) {
      if (texture !== null) gl.deleteTexture(texture);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // 32 − clz32(n) is floor(log2(n)) + 1 for a positive integer n.
      gl.texStorage2D(gl.TEXTURE_2D, 32 - Math.clz32(Math.max(width, height)), gl.RGBA8, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textureWidth = width;
      textureHeight = height;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    // WebGL ignores its UNPACK_* flags for ImageBitmap sources: the bitmap's own
    // orientation and premultiplication are uploaded as they are.
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  // Every image fills the canvas: it is scaled to cover it and centred, and the
  // overflow is cropped. The notebook samples only between texel centres,
  // [0, W−1], so the fit maps the canvas's outermost pixel centres onto (or
  // inside) the image's outermost texel centres. An enlarged image therefore gets
  // no black edge. At scale 1 (an image the canvas's size, such as the grid) texel
  // and pixel centres coincide, so nothing is resampled there.
  function updateFit() {
    if (imageWidth === 0 || imageHeight === 0) return;
    scale = Math.max(
      (canvasWidth - 1) / Math.max(1, imageWidth - 1),
      (canvasHeight - 1) / Math.max(1, imageHeight - 1),
    ) || Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight); // 1-px canvas
    offsetX = (canvasWidth - imageWidth * scale) / 2;
    offsetY = (canvasHeight - imageHeight * scale) / 2;
    lod = Math.max(0, Math.log2(1 / scale));
  }

  function forgetSentUniforms() {
    sentImageWidth = NaN;
    sentImageHeight = NaN;
    sentCanvasHeight = NaN;
    sentOffsetX = NaN;
    sentOffsetY = NaN;
    sentScale = NaN;
    sentLod = NaN;
    sentLensX = NaN;
    sentLensY = NaN;
    sentK = NaN;
    sentShadowR2 = NaN;
  }

  // Writes each uniform whose input changed since it was last written.
  function flushUniforms() {
    if (imageWidth !== sentImageWidth || imageHeight !== sentImageHeight) {
      gl.uniform2f(uImageSize, imageWidth, imageHeight);
      sentImageWidth = imageWidth;
      sentImageHeight = imageHeight;
    }
    if (canvasHeight !== sentCanvasHeight) {
      gl.uniform1f(uCanvasHeight, canvasHeight);
      sentCanvasHeight = canvasHeight;
    }
    if (offsetX !== sentOffsetX || offsetY !== sentOffsetY) {
      gl.uniform2f(uOffset, offsetX, offsetY);
      sentOffsetX = offsetX;
      sentOffsetY = offsetY;
    }
    if (scale !== sentScale) {
      gl.uniform1f(uScale, scale);
      sentScale = scale;
    }
    if (lod !== sentLod) {
      gl.uniform1f(uLod, lod);
      sentLod = lod;
    }
    if (lensX !== sentLensX || lensY !== sentLensY) {
      gl.uniform2f(uLens, lensX, lensY);
      sentLensX = lensX;
      sentLensY = lensY;
    }
    if (k !== sentK) {
      gl.uniform1f(uK, k);
      sentK = k;
    }
    if (shadowR2 !== sentShadowR2) {
      gl.uniform1f(uShadowR2, shadowR2);
      sentShadowR2 = shadowR2;
    }
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
  });

  canvas.addEventListener('webglcontextrestored', () => {
    // Every GL object died with the old context.
    program = null;
    texture = null;
    textureWidth = 0;
    textureHeight = 0;
    try {
      buildProgram();
    } catch {
      return; // buildProgram logged the cause; stay lost so render() does nothing.
    }
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    if (bitmap !== null) uploadTexture();
    forgetSentUniforms();
    flushUniforms();
    lost = false;
    if (onRestored) onRestored();
  });

  buildProgram();
  gl.viewport(0, 0, canvasWidth, canvasHeight);

  function setImage(next) {
    if (bitmap !== null && bitmap !== next) bitmap.close();
    bitmap = next;
    imageWidth = next.width;
    imageHeight = next.height;
    if (!lost) uploadTexture();
    updateFit();
  }

  function setLens(x, y) {
    lensX = x;
    lensY = y;
  }

  function setLensFromDevice(xEdge, yEdge) {
    lensX = (xEdge - offsetX) / scale - 0.5;
    lensY = (yEdge - offsetY) / scale - 0.5;
  }

  function setScalars(scalars) {
    k = scalars.kPx2;
    shadowR2 = scalars.rShadowPx * scalars.rShadowPx;
  }

  function resize(width, height) {
    canvasWidth = width;
    canvasHeight = height;
    // Assigning either dimension clears the drawing buffer, even to the same value.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (!lost) gl.viewport(0, 0, width, height);
    updateFit();
  }

  function render() {
    if (lost || imageWidth === 0) return;
    flushUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    maxTextureSize,
    get imageWidth() {
      return imageWidth;
    },
    get imageHeight() {
      return imageHeight;
    },
    setImage,
    setLens,
    setLensFromDevice,
    setScalars,
    resize,
    render,
  };
}
