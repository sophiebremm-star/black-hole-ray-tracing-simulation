// Page wiring: sizing, pointer, sliders and readouts, background presets, image
// loading, render scheduling and messages. Nothing imports this module.
import { PARAMS, lensScalars } from './physics.js';
import { createRenderer } from './renderer.js';
import { decodeImage } from './images.js';
import { PRESETS, DEFAULT_PRESET_ID } from './presets.js';
import { createGridImage } from './grid.js';

const DEFAULT_PRESET = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID);
const NOTICE_MS = 4000;
const NOTICE_FADE_MS = 200;
// While the grid is shown, it is redrawn at the canvas's new size once resizing
// has paused this long.
const GRID_REDRAW_MS = 200;
const SLIDER_STEPS = 1000;
// Scrolling moves along the mass slider's log scale: 2500 px of wheel delta,
// about 25 mouse-wheel notches, crosses the whole range.
const WHEEL_PX_PER_RANGE = 2500;
const WHEEL_LINE_PX = 33; // Firefox reports mouse wheels in lines
const KEYS = ['mass', 'distance', 'fov'];
const TEXT = {
  unreadable: "Couldn't read that image.",
  notImage: "That file isn't an image.",
  loadFailed: "Couldn't load that image.",
  noDefault: "The default image didn't load. Choose another background or upload an image.",
};

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const threeFigures = new Intl.NumberFormat('en-US', {
  minimumSignificantDigits: 3,
  maximumSignificantDigits: 3,
});
const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const canvas = document.getElementById('lens');
const panel = document.getElementById('panel');
const panelHeader = document.getElementById('panel-header');
const panelToggle = document.getElementById('panel-toggle');
const hint = document.getElementById('hint');
const notice = document.getElementById('notice');
const dropOverlay = document.getElementById('drop');
const fatal = document.getElementById('fatal');
const uploadInput = document.getElementById('upload');
const presetList = document.getElementById('presets');
const caption = document.getElementById('caption');
const captionName = document.getElementById('caption-name');
const captionCredit = document.getElementById('caption-credit');
const captionLicense = document.getElementById('caption-license');
const captionModified = document.getElementById('caption-modified');
const captionLine = document.getElementById('caption-line');
const captionLineName = document.getElementById('caption-line-name');
const captionLineCredit = document.getElementById('caption-line-credit');
const einsteinOutput = document.getElementById('einstein');
const shadowOutput = document.getElementById('shadow');
const sliders = {};
const outputs = {};
for (const key of KEYS) {
  sliders[key] = document.getElementById(key);
  outputs[key] = document.getElementById(`${key}-out`);
}
// The picker's radio inputs, by preset id.
const presetInputs = new Map();

// Exact parameter values; the sliders only display them.
const state = {
  mass: PARAMS.mass.default,
  distance: PARAMS.distance.default,
  fov: PARAMS.fov.default,
};

let renderer = null;
let frameQueued = false;
// The canvas's client rect and CSS→device ratios, cached for the pointer handler.
let rectLeft = 0;
let rectTop = 0;
let ratioX = 1;
let ratioY = 1;
// The canvas's drawing-buffer size, in device px.
let deviceWidth = 0;
let deviceHeight = 0;
let hintDismissed = false;
let noticeTimer = 0;
let noticeSticky = false;
// The default image failed and nothing else has loaded, so the page is empty.
let awaitingImage = false;
// Every image request takes a new token; a result whose token is stale is dropped.
let loadToken = 0;
// Aborts the preset fetch in flight when a newer request supersedes it.
let fetchController = null;
// The preset whose image is on screen: null before the first image and after an
// upload, drop or paste.
let shownPreset = null;
// The grid on screen was drawn for this gridFit(); gridToken drops stale redraws.
let gridDrawnFor = '';
let gridTimer = 0;
let gridToken = 0;
let dragDepth = 0;

try {
  renderer = createRenderer(canvas, { onRestored: invalidate });
} catch {
  showFatal();
}
if (renderer !== null) start();

function start() {
  observeSize();
  window.addEventListener('resize', onWindowResize);
  canvas.addEventListener('pointerdown', onPointer, { passive: true });
  canvas.addEventListener('pointermove', onPointer, { passive: true });
  canvas.addEventListener('wheel', onWheel, { passive: true });
  for (const key of KEYS) {
    sliders[key].addEventListener('input', () => onSliderInput(key));
  }
  // A click anywhere on the top bar toggles the panel. The chevron's own clicks,
  // keyboard ones included, reach this listener once by bubbling.
  panelHeader.addEventListener('click', togglePanel);
  buildPresetPicker();
  uploadInput.addEventListener('change', onUploadChange);
  document.addEventListener('dragenter', onDragEnter);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('drop', onDrop);
  document.addEventListener('paste', onPaste);
  // Safari only fires paste outside editable fields when beforepaste is cancelled.
  document.addEventListener('beforepaste', (event) => event.preventDefault());
  positionSliders();
  updateScalars();
  selectPreset(DEFAULT_PRESET);
}

// Sizing

function observeSize() {
  const observer = new ResizeObserver(onResize);
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas, { box: 'content-box' });
  }
}

function onResize(entries) {
  const entry = entries[entries.length - 1];
  const box = entry.contentBoxSize && entry.contentBoxSize[0];
  const pixelRatio = window.devicePixelRatio || 1;
  let width = (box ? box.inlineSize : entry.contentRect.width) * pixelRatio;
  let height = (box ? box.blockSize : entry.contentRect.height) * pixelRatio;
  // Prefer the exact device-pixel size. Chromium's emulated device scale factors
  // (DevTools device mode, automation) report it in CSS px, so ignore it when it
  // disagrees with the CSS size × devicePixelRatio.
  const devicePixels = entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
  if (devicePixels && Math.abs(devicePixels.inlineSize - width) < 2 && Math.abs(devicePixels.blockSize - height) < 2) {
    width = devicePixels.inlineSize;
    height = devicePixels.blockSize;
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));

  deviceWidth = width;
  deviceHeight = height;
  cachePointerMapping();
  renderer.resize(width, height);
  // Resizing cleared the drawing buffer after this frame's animation callbacks
  // ran, so draw now rather than show a black canvas until the next frame.
  renderer.render();
  if (shownPreset !== null && shownPreset.grid) scheduleGridRedraw();
}

// Browser zoom changes devicePixelRatio and the canvas's CSS size but not its
// device-pixel size, so the observer above stays quiet. The window's resize event
// does fire: refresh the pointer mapping, and redraw a grid, whose pitch follows
// the pixel ratio.
function onWindowResize() {
  cachePointerMapping();
  if (shownPreset !== null && shownPreset.grid) scheduleGridRedraw();
}

// Caches the canvas's client rect and CSS→device ratios for the pointer handler.
function cachePointerMapping() {
  const rect = canvas.getBoundingClientRect();
  rectLeft = rect.left;
  rectTop = rect.top;
  ratioX = rect.width > 0 ? deviceWidth / rect.width : 1;
  ratioY = rect.height > 0 ? deviceHeight / rect.height : 1;
}

// Pointer and scheduling

function onPointer(event) {
  renderer.setLensFromDevice((event.clientX - rectLeft) * ratioX, (event.clientY - rectTop) * ratioY);
  invalidate();
  // Browsers also send motionless pointermoves after layout; they aren't interactions.
  if (!hintDismissed && (event.type === 'pointerdown' || event.movementX !== 0 || event.movementY !== 0)) {
    dismissHint();
  }
}

function invalidate() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(frame);
}

function frame() {
  frameQueued = false;
  renderer.render();
}

// Parameters and readouts

function sliderToValue(key, position) {
  const { min, max } = PARAMS[key];
  return min * (max / min) ** (position / SLIDER_STEPS);
}

function valueToSlider(key, value) {
  const { min, max } = PARAMS[key];
  return Math.round(SLIDER_STEPS * Math.log(value / min) / Math.log(max / min));
}

function onSliderInput(key) {
  const position = Number(sliders[key].value);
  state[key] = sliderToValue(key, position);
  paintSliderFill(key, position);
  updateScalars();
  dismissHint();
}

// Scrolling over the image changes the mass: up grows the black hole, down
// shrinks it. Ctrl+wheel, which trackpad pinches also send, stays browser zoom.
function onWheel(event) {
  if (event.ctrlKey || event.deltaY === 0) return;
  let deltaPx = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaPx *= WHEEL_LINE_PX;
  else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaPx *= window.innerHeight;
  const { min, max } = PARAMS.mass;
  const t = Math.log(state.mass / min) / Math.log(max / min) - deltaPx / WHEEL_PX_PER_RANGE;
  const mass = t <= 0 ? min : t >= 1 ? max : min * (max / min) ** t;
  if (mass === state.mass) return;
  state.mass = mass;
  const position = valueToSlider('mass', mass);
  sliders.mass.value = String(position);
  paintSliderFill('mass', position);
  updateScalars();
  dismissHint();
}

function positionSliders() {
  for (const key of KEYS) {
    const position = valueToSlider(key, state[key]);
    sliders[key].value = String(position);
    paintSliderFill(key, position);
  }
}

function paintSliderFill(key, position) {
  sliders[key].style.setProperty('--progress', String(position / SLIDER_STEPS));
}

function updateScalars() {
  const scalars = lensScalars({
    ...state,
    width: renderer.imageWidth,
    height: renderer.imageHeight,
  });
  renderer.setScalars(scalars);
  // Write only changed text, so unchanged readouts cause no DOM or accessibility churn.
  for (const key of KEYS) {
    const text = formatParameter(key, state[key]);
    if (outputs[key].value !== text) {
      outputs[key].value = text;
      sliders[key].setAttribute('aria-valuetext', text);
    }
  }
  const einstein = `${threeFigures.format(scalars.einsteinRadiusMas)} mas`;
  const shadow = `${threeFigures.format(scalars.shadowRadiusUas)} µas`;
  if (einsteinOutput.value !== einstein) einsteinOutput.value = einstein;
  if (shadowOutput.value !== shadow) shadowOutput.value = shadow;
  invalidate();
}

function formatParameter(key, value) {
  const { unit } = PARAMS[key];
  if (key === 'fov') return `${wholeNumber.format(value)} ${unit}`;
  return `${formatScientific(value)} ${unit}`;
}

// 512345 → "5.12 × 10⁵".
function formatScientific(value) {
  const [mantissa, exponent] = value.toExponential(2).split('e');
  const power = Number(exponent);
  let digits = '';
  for (const digit of String(Math.abs(power))) digits += SUPERSCRIPT_DIGITS[Number(digit)];
  return `${mantissa} × 10${power < 0 ? '⁻' : ''}${digits}`;
}

// Images

function maxImageSide() {
  return Math.min(4096, renderer.maxTextureSize);
}

// Supersedes any image request in flight: its fetch is aborted, and its result is
// dropped because its token is stale. Returns the new request's token.
function newRequest() {
  loadToken += 1;
  if (fetchController !== null) fetchController.abort();
  fetchController = null;
  markBusy(null);
  return loadToken;
}

// Ends the request with this token and returns true, unless a newer request
// has superseded it.
function endRequest(token) {
  if (token !== loadToken) return false;
  fetchController = null;
  markBusy(null);
  return true;
}

// Shows a preset the way an upload is shown: the lens re-centres and the
// parameters stay. The current image stays on screen until the new one is ready.
async function selectPreset(preset) {
  const token = newRequest();
  checkPreset(preset);
  if (preset === shownPreset) return;
  markBusy(presetInputs.get(preset.id));
  let fit = null;
  try {
    let bitmap;
    if (preset.grid) {
      fit = gridFit();
      bitmap = await createGridImage(...fit);
    } else {
      fetchController = new AbortController();
      const response = await fetch(preset.src, { signal: fetchController.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bitmap = await decodeImage(await response.blob(), maxImageSide());
    }
    if (!endRequest(token)) {
      bitmap.close();
      return;
    }
    applyImage(bitmap, preset);
    if (fit !== null) {
      gridDrawnFor = fit.join();
      // The canvas may have been resized while the grid was being drawn.
      if (gridFit().join() !== gridDrawnFor) scheduleGridRedraw();
    }
  } catch {
    if (!endRequest(token)) return;
    // The selection returns to the preset on screen, or to none.
    checkPreset(shownPreset);
    const empty = renderer.imageWidth === 0;
    if (empty && preset === DEFAULT_PRESET) {
      awaitingImage = true;
      showNotice(TEXT.noDefault, true);
    } else {
      awaitingImage = empty;
      showNotice(TEXT.loadFailed);
    }
  }
}

async function loadFile(file) {
  if (file.type !== '' && !file.type.startsWith('image/')) {
    showNotice(TEXT.notImage);
    return;
  }
  const token = newRequest();
  checkPreset(shownPreset); // a preset still loading is abandoned
  markBusy(uploadInput);
  try {
    const bitmap = await decodeImage(file, maxImageSide());
    if (!endRequest(token)) {
      bitmap.close();
      return;
    }
    applyImage(bitmap, null);
  } catch {
    if (endRequest(token)) showNotice(TEXT.unreadable);
  }
}

// preset is null for an upload, drop or paste, which clears the selection.
function applyImage(bitmap, preset) {
  renderer.setImage(bitmap);
  shownPreset = preset;
  gridToken += 1; // a grid redraw in flight is for the previous image
  checkPreset(preset);
  showCaption(preset);
  renderer.setLens(Math.floor(renderer.imageWidth / 2), Math.floor(renderer.imageHeight / 2));
  updateScalars();
  invalidate();
  awaitingImage = false;
  if (noticeSticky) hideNotice();
}

// The grid's width, height and pixel ratio for the canvas as it is now. It
// fills the canvas at 1:1 unless the canvas outgrows the largest texture.
function gridFit() {
  return [
    Math.max(1, Math.min(deviceWidth, renderer.maxTextureSize)),
    Math.max(1, Math.min(deviceHeight, renderer.maxTextureSize)),
    window.devicePixelRatio || 1,
  ];
}

function scheduleGridRedraw() {
  clearTimeout(gridTimer);
  gridTimer = setTimeout(redrawGrid, GRID_REDRAW_MS);
}

// Redraws the grid at the canvas's current size. The lens keeps its image
// coordinates, and the scalars follow the new image width.
async function redrawGrid() {
  if (shownPreset === null || !shownPreset.grid) return;
  const token = ++gridToken; // supersedes a redraw still in flight
  const fit = gridFit();
  if (fit.join() === gridDrawnFor) return;
  let bitmap;
  try {
    bitmap = await createGridImage(...fit);
  } catch {
    return; // the grid on screen stays
  }
  if (token !== gridToken) {
    bitmap.close();
    return;
  }
  gridDrawnFor = fit.join();
  renderer.setImage(bitmap);
  updateScalars();
}

function onUploadChange() {
  const file = uploadInput.files && uploadInput.files[0];
  uploadInput.value = ''; // Choosing the same file again still fires change.
  if (file) loadFile(file);
}

function hasFiles(event) {
  const types = event.dataTransfer && event.dataTransfer.types;
  return Boolean(types) && Array.prototype.includes.call(types, 'Files');
}

function onDragEnter(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.classList.add('is-active');
}

function onDragOver(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropOverlay.classList.add('is-active');
}

function onDragLeave(event) {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove('is-active');
}

function onDrop(event) {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('is-active');
  const files = event.dataTransfer ? event.dataTransfer.files : [];
  for (let i = 0; i < files.length; i += 1) {
    if (files[i].type.startsWith('image/')) {
      loadFile(files[i]);
      return;
    }
  }
  showNotice(TEXT.notImage);
}

function onPaste(event) {
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  let sawFile = false;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    sawFile = true;
    const file = item.type.startsWith('image/') ? item.getAsFile() : null;
    if (file) {
      event.preventDefault();
      loadFile(file);
      return;
    }
  }
  if (sawFile) showNotice(TEXT.notImage);
}

// Background picker and credit caption

// One radio input per preset, so the arrow keys move the selection natively. The
// upload tile, already in the page, stays last.
function buildPresetPicker() {
  const uploadTile = uploadInput.closest('.tile');
  for (const preset of PRESETS) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'background';
    input.value = preset.id;
    input.className = 'tile-input visually-hidden';
    input.addEventListener('change', () => selectPreset(preset));

    const thumb = document.createElement('img');
    thumb.alt = '';
    thumb.width = 256;
    thumb.height = 256;
    thumb.loading = 'lazy'; // set before src, which starts the load
    thumb.decoding = 'async';
    thumb.draggable = false; // the tile is a control, not an image to drag away
    thumb.src = preset.thumb;
    const face = document.createElement('span');
    face.className = 'tile-face';
    face.append(thumb);

    const name = document.createElement('span');
    name.className = 'visually-hidden';
    name.textContent = preset.name;

    const tile = document.createElement('label');
    tile.className = 'tile';
    tile.title = preset.name;
    tile.append(input, face, name);
    uploadTile.before(tile);
    presetInputs.set(preset.id, input);
  }
}

// Checks the tile for this preset. With null no preset is checked, and the upload
// tile shows the checked ring instead if an uploaded image is on screen.
function checkPreset(preset) {
  for (const [id, input] of presetInputs) input.checked = preset !== null && id === preset.id;
  const uploadShown = shownPreset === null && renderer.imageWidth > 0;
  uploadInput.toggleAttribute('data-checked', preset === null && uploadShown);
}

// Marks the tile whose image is loading, by its input; null marks none.
function markBusy(tileInput) {
  for (const input of [...presetInputs.values(), uploadInput]) {
    if (input === tileInput) input.setAttribute('aria-busy', 'true');
    else input.removeAttribute('aria-busy');
  }
}

// The caption credits the preset on screen: in full below the picker, and in one
// line under the title while the panel is collapsed. The grid and uploads need none.
function showCaption(preset) {
  caption.hidden = preset === null || !preset.credit;
  captionLine.hidden = caption.hidden;
  if (caption.hidden) return;
  const credit = preset.shortCredit || preset.credit;
  captionName.textContent = preset.name;
  captionName.href = preset.source;
  captionCredit.textContent = credit;
  captionLineName.textContent = preset.name;
  captionLineCredit.textContent = credit;
  captionLicense.hidden = !preset.license;
  // CC BY 4.0 asks that modifications be indicated; the lens distorts the image.
  captionModified.hidden = !preset.license;
  if (preset.license) {
    captionLicense.textContent = preset.license.name;
    captionLicense.href = preset.license.url;
    captionModified.textContent = preset.modified
      ? `Modified: ${preset.modified} and distorted by the simulated lens.`
      : 'Modified: distorted by the simulated lens.';
  }
}

// Panel, hint and messages

function togglePanel() {
  const collapse = panelToggle.getAttribute('aria-expanded') === 'true';
  panelToggle.setAttribute('aria-expanded', String(!collapse));
  panel.toggleAttribute('data-collapsed', collapse);
}

function dismissHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  hint.classList.add('is-dismissed');
}

function showNotice(text, sticky = false) {
  clearTimeout(noticeTimer);
  noticeSticky = sticky;
  notice.textContent = text;
  notice.classList.add('is-visible');
  if (!sticky) noticeTimer = setTimeout(hideNotice, NOTICE_MS);
}

function hideNotice() {
  clearTimeout(noticeTimer);
  if (awaitingImage) {
    // A transient notice replaced the prompt; an empty page still needs it.
    showNotice(TEXT.noDefault, true);
    return;
  }
  noticeSticky = false;
  notice.classList.remove('is-visible');
  // Clear the text once it has faded, so the live region holds no stale message.
  noticeTimer = setTimeout(() => {
    notice.textContent = '';
  }, NOTICE_FADE_MS);
}

function showFatal() {
  fatal.hidden = false;
  panel.hidden = true;
  hint.hidden = true;
}
