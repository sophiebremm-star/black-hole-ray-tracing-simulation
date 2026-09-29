// Weak-field Schwarzschild lens scalars, computed as the notebook's LensImage
// class does (cell 3 of black_hole_ray_tracing.ipynb). Pure: no DOM, no WebGL.

/** Gravitational constant in m³ kg⁻¹ s⁻², the notebook's value. */
export const G = 6.67430e-11;

/** Speed of light in m/s. */
export const C = 299_792_458;

/** Solar mass in kg, the notebook's value. */
export const SOLAR_MASS = 1.989e30;

/** Light year in m, the notebook's value. */
export const LIGHT_YEAR = 9.461e15;

/** Milliarcseconds in 180°, the notebook's `180 * 3600 * 1000`. */
const MAS_PER_HALF_TURN = 180 * 3600 * 1000;

/**
 * Slider parameters: the notebook's ranges and code defaults. Mass is in M☉,
 * distance in ly and FOV in mas.
 * @type {Readonly<Record<'mass' | 'distance' | 'fov',
 *   Readonly<{min: number, max: number, default: number, unit: string}>>>}
 */
export const PARAMS = Object.freeze({
  mass: Object.freeze({ min: 1e5, max: 3e6, default: 5e5, unit: 'M☉' }),
  distance: Object.freeze({ min: 1e5, max: 3e5, default: 2e5, unit: 'ly' }),
  fov: Object.freeze({ min: 1000, max: 20000, default: 5000, unit: 'mas' }),
});

/**
 * The notebook's LensImage scalars (define_variables, adjust_field_of_view,
 * compute_distances), in float64 and in the notebook's operation order.
 * @param {{mass:number, distance:number, fov:number, width:number, height:number}} p
 *        mass in M☉, distance in ly, fov in mas, width and height in image px
 * @returns {{s:number, fovMas:number, bCritical:number, rShadowPx:number, kPx2:number,
 *            einsteinRadiusMas:number, shadowRadiusUas:number}}
 *   s: rad per px after the FOV clamp; fovMas: the FOV recomputed from s·width;
 *   bCritical: 3√3GM/c² in m; rShadowPx: the shadow radius in px;
 *   kPx2: 4GM/(c²·D·s²), so a pixel r px from the lens shifts by kPx2/r px;
 *   einsteinRadiusMas: √(4GM/(c²D)) in mas; shadowRadiusUas: bCritical/D in µas.
 */
export function lensScalars({ mass, distance, fov, width, height }) {
  // define_variables
  const M = mass * SOLAR_MASS;
  const D = distance * LIGHT_YEAR;
  let fovRadians = fov * Math.PI / MAS_PER_HALF_TURN;
  let s = fovRadians / width;
  const bCritical = 3 * Math.sqrt(3) * G * M / C ** 2;

  // adjust_field_of_view
  const maxPhotonRingRadius = 0.45 * Math.min(width, height);
  const minimumS = bCritical / (D * maxPhotonRingRadius);
  if (s < minimumS) {
    s = minimumS;
    fovRadians = s * width;
  }
  const fovMas = fovRadians * MAS_PER_HALF_TURN / Math.PI;
  const rShadowPx = bCritical / (D * s);

  // compute_distances: pixel_shift = 4GM/(c²·D·r·s)/s = kPx2/r at r px from the lens.
  const kPx2 = 4 * G * M / (C ** 2 * D * s) / s;

  // Derived readouts; neither depends on the FOV clamp.
  const einsteinRadiusMas = Math.sqrt(4 * G * M / (C ** 2 * D)) * MAS_PER_HALF_TURN / Math.PI;
  const shadowRadiusUas = bCritical / D * (MAS_PER_HALF_TURN * 1000) / Math.PI;

  return { s, fovMas, bCritical, rShadowPx, kPx2, einsteinRadiusMas, shadowRadiusUas };
}
