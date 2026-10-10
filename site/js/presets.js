// Background presets for the picker, in display order; the picker's ninth tile
// is the upload tile. Credits are copied
// verbatim from each source page: the CC BY 4.0 licences of ESA/Hubble,
// ESA/Webb and ESO require the full, unaltered credit shown with the image.

const CC_BY_4 = Object.freeze({ name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' });

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} name         shown as the tile's accessible name and in the credit
 * @property {string} thumb        256×256 thumbnail
 * @property {string} [src]        full image (at most 4096 px on its long side); absent for the grid
 * @property {boolean} [grid]      generated in the browser at the canvas's device-pixel size
 * @property {string} [credit]     full credit line, verbatim
 * @property {string} [shortCredit] shorter credit shown on the page when the full one is too long
 * @property {string} [source]     page the image and credit come from
 * @property {{name: string, url: string} | null} [license]
 * @property {string} [modified] how this copy differs from the source, besides the lens
 */

/** @type {readonly Preset[]} */
export const PRESETS = Object.freeze([
  {
    id: 'andromeda',
    name: 'Andromeda (M31)',
    src: 'assets/backgrounds/andromeda.jpg',
    thumb: 'assets/backgrounds/thumbs/andromeda.jpg',
    credit: 'X-ray: NASA/CXO/UMass/Z. Li & Q.D. Wang, ESA/XMM-Newton; Infrared: NASA/JPL-Caltech/WISE, '
      + 'Spitzer, NASA/JPL-Caltech/K. Gordon (U. Az), ESA/Herschel, ESA/Planck, NASA/IRAS, NASA/COBE; '
      + 'Radio: NSF/GBT/WSRT/IRAM/C. Clark (STScI); Ultraviolet: NASA/JPL-Caltech/GALEX; '
      + 'Optical: Andromeda, Unexpected © Marcel Drechsler, Xavier Strottner, Yann Sainty & J. Sahner, T. Kottary. '
      + 'Composite image processing: L. Frattare, K. Arcand, J.Major',
    shortCredit: 'NASA/CXC/SAO and partners; optical © Marcel Drechsler, Xavier Strottner, Yann Sainty & J. Sahner, T. Kottary',
    source: 'https://chandra.harvard.edu/photo/2025/m31/',
    license: null, // NASA/SAO claim no copyright; the optical layer is © the photographers
  },
  {
    id: 'hudf',
    name: 'Hubble Ultra Deep Field',
    src: 'assets/backgrounds/hudf.jpg',
    thumb: 'assets/backgrounds/thumbs/hudf.jpg',
    credit: 'NASA, ESA, and S. Beckwith (STScI) and the HUDF Team',
    source: 'https://esahubble.org/images/heic0406a/',
    license: CC_BY_4,
  },
  {
    id: 'webb-deep-field',
    name: 'Webb’s First Deep Field',
    src: 'assets/backgrounds/webb-deep-field.jpg',
    thumb: 'assets/backgrounds/thumbs/webb-deep-field.jpg',
    credit: 'NASA, ESA, CSA, and STScI',
    source: 'https://esawebb.org/images/weic2209a/',
    license: CC_BY_4,
  },
  {
    id: 'whirlpool',
    name: 'Whirlpool Galaxy (M51)',
    src: 'assets/backgrounds/whirlpool.jpg',
    thumb: 'assets/backgrounds/thumbs/whirlpool.jpg',
    credit: 'NASA, ESA, S. Beckwith (STScI), and The Hubble Heritage Team (STScI/AURA)',
    source: 'https://esahubble.org/images/heic0506a/',
    license: CC_BY_4,
  },
  {
    id: 'bulge-stars',
    name: 'Milky Way bulge stars',
    src: 'assets/backgrounds/bulge-stars.jpg',
    thumb: 'assets/backgrounds/thumbs/bulge-stars.jpg',
    credit: 'NASA, ESA, and T. Brown (STScI), W. Clarkson (University of Michigan-Dearborn), '
      + 'and A. Calamida and K. Sahu (STScI)',
    source: 'https://esahubble.org/images/opo1801a/',
    license: CC_BY_4,
  },
  {
    id: 'pillars',
    name: 'Pillars of Creation',
    src: 'assets/backgrounds/pillars.jpg',
    thumb: 'assets/backgrounds/thumbs/pillars.jpg',
    credit: 'NASA, ESA, CSA, STScI; J. DePasquale, A. Koekemoer, A. Pagan (STScI).',
    source: 'https://esawebb.org/images/weic2216b/',
    modified: 'rotated 90° anticlockwise',
    license: CC_BY_4,
  },
  {
    id: 'milky-way',
    name: 'Milky Way panorama',
    src: 'assets/backgrounds/milky-way.jpg',
    thumb: 'assets/backgrounds/thumbs/milky-way.jpg',
    credit: 'ESO/S. Brunier',
    source: 'https://www.eso.org/public/images/eso0932a/',
    license: CC_BY_4,
  },
  {
    id: 'grid',
    name: 'Cartesian grid',
    thumb: 'assets/backgrounds/thumbs/grid.png',
    grid: true,
  },
].map((preset) => Object.freeze(preset)));

/** The preset shown at load. */
export const DEFAULT_PRESET_ID = 'andromeda';
