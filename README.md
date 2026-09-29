# black-hole-ray-tracing-simulation
An interactive Python computational ray-tracing model that simulates the gravitational deflection of light around a Schwarzschild black hole. Users can adjust the black hole's position, mass, distance, and field of view to investigate how each parameter affects image distortion, the critical impact boundary, and the black hole shadow. 

## Interactive web version

`site/` holds a WebGL2 version of the notebook: the lens follows your pointer, the scroll wheel changes its mass, and mass, distance and field of view update live. You can drop in your own background image. It uses the same weak-field model and defaults as the notebook.

- Live: https://sophiebremm-star.github.io/black-hole-ray-tracing-simulation/ (after a repository admin sets Settings → Pages → Source to "GitHub Actions")
- Run locally: `python3 -m http.server -d site 8000`, then open http://localhost:8000
- Tests: `node --test tests/*.test.js`
- Every image fills the window: it is scaled to cover it, and whatever doesn't fit is cropped.

### Backgrounds

The page offers eight backgrounds: the seven images below and a Cartesian grid, which is drawn in the browser at the screen's resolution. The picker's last tile, "+", loads your own image instead. The page credits each image in its control panel while it is shown, and displays every background distorted by the simulated lens.

- [Andromeda (M31)](https://chandra.harvard.edu/photo/2025/m31/), the default: NASA/CXC/SAO's 2025 multiwavelength composite, and the full-resolution original of the notebook's image.
  - Credit: X-ray: NASA/CXO/UMass/Z. Li & Q.D. Wang, ESA/XMM-Newton; Infrared: NASA/JPL-Caltech/WISE, Spitzer, NASA/JPL-Caltech/K. Gordon (U. Az), ESA/Herschel, ESA/Planck, NASA/IRAS, NASA/COBE; Radio: NSF/GBT/WSRT/IRAM/C. Clark (STScI); Ultraviolet: NASA/JPL-Caltech/GALEX; Optical: Andromeda, Unexpected © Marcel Drechsler, Xavier Strottner, Yann Sainty & J. Sahner, T. Kottary. Composite image processing: L. Frattare, K. Arcand, J.Major
  - Licence: NASA and SAO claim no copyright, but the optical layer is third-party copyright, © its photographers. Chandra's image-use policy asks that they be contacted before it is reused.
- [Hubble Ultra Deep Field](https://esahubble.org/images/heic0406a/)
  - Credit: NASA, ESA, and S. Beckwith (STScI) and the HUDF Team
  - Licence: [CC BY 4.0][cc-by]
- [Webb’s First Deep Field](https://esawebb.org/images/weic2209a/)
  - Credit: NASA, ESA, CSA, and STScI
  - Licence: [CC BY 4.0][cc-by]
- [Whirlpool Galaxy (M51)](https://esahubble.org/images/heic0506a/)
  - Credit: NASA, ESA, S. Beckwith (STScI), and The Hubble Heritage Team (STScI/AURA)
  - Licence: [CC BY 4.0][cc-by]
- [Milky Way bulge stars](https://esahubble.org/images/opo1801a/)
  - Credit: NASA, ESA, and T. Brown (STScI), W. Clarkson (University of Michigan-Dearborn), and A. Calamida and K. Sahu (STScI)
  - Licence: [CC BY 4.0][cc-by]
- [Pillars of Creation](https://esawebb.org/images/weic2216b/)
  - Credit: NASA, ESA, CSA, STScI; J. DePasquale, A. Koekemoer, A. Pagan (STScI).
  - Licence: [CC BY 4.0][cc-by]
  - Modified: the page's copy is rotated 90° anticlockwise, to landscape.
- [Milky Way panorama](https://www.eso.org/public/images/eso0932a/)
  - Credit: ESO/S. Brunier
  - Licence: [CC BY 4.0][cc-by]
- Cartesian grid, generated in the browser; it needs no credit.

[cc-by]: https://creativecommons.org/licenses/by/4.0/
