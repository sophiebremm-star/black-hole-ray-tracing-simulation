import test from 'node:test';
import assert from 'node:assert/strict';
import { G, C, SOLAR_MASS, LIGHT_YEAR, PARAMS, lensScalars } from '../site/js/physics.js';

// Expected values come from the notebook's LensImage class (cell 3 of
// black_hole_ray_tracing.ipynb), executed verbatim on a 482×414 image.
// kPx2 = pixel_shift × distance, sampled 5 px from the lens. The notebook has no
// Einstein or shadow radius readout: those two values are the spec §1 formulas,
// evaluated with the same instance's G, M, c, D and b_critical.
const CASES = [
  ['default', { mass: 5e5, distance: 2e5, fov: 5000 }, {
    s: 5.029187563376929e-08, fovMas: 5000.0, bCritical: 3837522964.008284,
    rShadowPx: 4.0326090113989716e-05, kPx2: 617.2575242496042,
    einsteinRadiusMas: 257.7247709949675, shadowRadiusUas: 0.41832043686711323 }],
  ['savedState', { mass: 3e6, distance: 2e5, fov: 5000 }, {
    s: 5.029187563376929e-08, fovMas: 5000.0, bCritical: 23025137784.04971,
    rShadowPx: 0.00024195654068393836, kPx2: 3703.5451454976255,
    einsteinRadiusMas: 631.2941830133163, shadowRadiusUas: 2.50992262120268 }],
  ['maxEffect', { mass: 3e6, distance: 1e5, fov: 1000 }, {
    s: 1.0058375126753858e-08, fovMas: 1000.0000000000001, bCritical: 23025137784.04971,
    rShadowPx: 0.002419565406839383, kPx2: 185177.25727488127,
    einsteinRadiusMas: 892.784795464675, shadowRadiusUas: 5.01984524240536 }],
  ['minEffect', { mass: 1e5, distance: 3e5, fov: 20000 }, {
    s: 2.0116750253507716e-07, fovMas: 20000.0, bCritical: 767504592.801657,
    rShadowPx: 1.3442030037996575e-06, kPx2: 5.143812702080036,
    einsteinRadiusMas: 94.10778046786456, shadowRadiusUas: 0.055776058248948435 }],
  // Unphysical on purpose: forces the notebook's adjust_field_of_view branch.
  ['fovClamp', { mass: 1e12, distance: 1, fov: 1000 }, {
    s: 0.004354427716175941, fovMas: 432915621.19151604, bCritical: 7675045928016569.0,
    rShadowPx: 186.29999999999998, kPx2: 32935.16765336251,
    einsteinRadiusMas: 162999457.1578794, shadowRadiusUas: 167328174746.8453 }],
];

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.abs(expected),
    `${label}: got ${actual}, expected ${expected}`);
}

test('constants match the notebook', () => {
  assert.equal(G, 6.67430e-11);
  assert.equal(C, 299_792_458);
  assert.equal(SOLAR_MASS, 1.989e30);
  assert.equal(LIGHT_YEAR, 9.461e15);
});

test('parameter ranges and defaults match the notebook sliders', () => {
  assert.deepEqual({ ...PARAMS.mass }, { min: 1e5, max: 3e6, default: 5e5, unit: 'M☉' });
  assert.deepEqual({ ...PARAMS.distance }, { min: 1e5, max: 3e5, default: 2e5, unit: 'ly' });
  assert.deepEqual({ ...PARAMS.fov }, { min: 1000, max: 20000, default: 5000, unit: 'mas' });
  assert.ok(Object.isFrozen(PARAMS));
  for (const key of ['mass', 'distance', 'fov']) assert.ok(Object.isFrozen(PARAMS[key]), key);
});

for (const [name, input, expected] of CASES) {
  test(`lensScalars matches the notebook: ${name}`, () => {
    const got = lensScalars({ ...input, width: 482, height: 414 });
    for (const [field, value] of Object.entries(expected)) assertClose(got[field], value, `${name}.${field}`);
  });
}

test('FOV clamp caps the shadow at 0.45 × min(W, H)', () => {
  const got = lensScalars({ mass: 1e12, distance: 1, fov: 1000, width: 482, height: 414 });
  assertClose(got.rShadowPx, 0.45 * 414, 'rShadowPx');
});
