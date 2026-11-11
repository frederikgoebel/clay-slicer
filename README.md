# Clay Slicer

A browser-based slicer for clay 3D printing on WASP delta printers. It runs entirely client-side, so your models never leave your machine, and it deploys as a static site to GitHub Pages.

**The G-code has not been tested on a real printer.** Do a dry run without clay, and calibrate the extrusion (see below), before printing.

## Features

| Area          | What it does                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load          | STL (binary/ASCII) by drag-and-drop or file picker, three sample models, rotate/scale, drop to bed                                                                                                                                                                                                                                                                    |
| Profiles      | Pick a **printer**, a **nozzle** and a **clay** profile independently. Built-ins are starting points; editing one forks your own copy (saved in the browser). Copy / rename / delete, plus JSON import / export. Active setup with an **Edit** button per profile that opens the editor as a popup. Lives in the _Print Setup_ panel together with the print settings |
| Slicing       | Spiral (vase) mode with seam-aligned contour interpolation, or layered rings. Floor as a continuous spiral that flows into the wall                                                                                                                                                                                                                                   |
| Textures      | Stackable fuzzy skin, waves, zigzag, ribs, twist. Each has a split height range (start, fade-out start, end) and an optional **painted mask**                                                                                                                                                                                                                                             |
| Mask painting | Paint (or erase) where a texture applies directly on the model; the view shows the finished print and updates live while you draw. Right mouse button rotates while painting                                                                                                                                                                                                                                                          |
| Bead width    | Per-point estimate from extrusion rate, layer height, flow factor and speed, the "Print preview" meshes every bead at its estimated width                                                                                                                                                                                                                             |
| Analysis      | Overhang overlay on the model and colouring on the toolpath (measured on the final path, textures included); estimates for time, clay, weight, tank refills                                                                                                                                                                                                           |
| Preview       | Shaded matcap model with smooth normals; unlit crisp toolpath lines; layer slider and playback; colour by height, floor/wall, overhang, speed or bead width                                                                                                                                                                                                           |
| G-code        | Marlin/RepRap style, absolute E, no retraction, editable start/end G-code in the printer profile, bounds check before download                                                                                                                                                                                                                                        |

### How bead width is estimated

The line width is **never typed in**. The nozzle profile holds an **extrusion rate** (cm³/min, at the clay profile's print speed); the clay profile's flow factor scales it. The bead area is rate ÷ speed, and the width follows from the area and the layer height. The cross-section is a rectangle with round ends, so

```
nominal = extrusionRate * flow% / printSpeed                (mm²)
area   = (width - height) * height + pi * height^2 / 4      (height = layer height)
actual = nominal * (printSpeed / speed) ^ k
width  = (actual - pi*height^2/4) / height + height
```

`k` is the printer profile's **Flow follows speed** (0-100%): 0 means an ideal E-driven extruder (same bead at any speed), 100 means pressure-fed (a slower move gives a fatter bead). It matters when "Min layer time" slows small layers. Volume and weight estimates use these widths.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (core + stores)
npm run lint       # eslint
npm run format     # prettier
npm run build      # static site in dist/
```

## Deploy to GitHub Pages

1. Push this repo to GitHub (default branch `main`).
2. Repo **Settings > Pages > Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`: install, lint, test, build, publish.

`vite.config.ts` uses `base: './'`, so it works under `https://<user>.github.io/<repo>/` without changes.

## Calibrate before you print

Clay printers push material through the E axis, and the right scale depends on your extruder. This slicer computes

```
E per mm = programmed bead volume per mm / area of a "filament" with diameter eDia
```

so **`E-axis Ø` (default 1.75 mm) in the printer profile is a placeholder**. Print a short test line, measure the bead, and adjust `E-axis Ø` and the clay profile's `Flow factor` until it matches. Also check bed size, tank volume, start/end G-code and homing for your machine. All built-in profile values are rough starting points.

## Code layout

```
src/
  core/                 framework-free slicing core (no React, no three.js)
    geometry/           slice.ts (triangles -> loops), contour.ts, mesh.ts (transform, overhang colours)
    textures/           textures.ts (offsets, twist), mask.ts (painted mask sampling + brush)
    toolpath/           rings.ts -> floor.ts + wall.ts -> stats.ts, orchestrated by pipeline.ts
                        bead.ts (bead model), PathBuilder.ts, verify.ts
    gcode/              gcode.ts
    worker/             slicer.worker.ts + SlicerClient.ts (promise wrapper)
    io/stl.ts, samples.ts
  domain/               profiles.ts (printer/nozzle/clay + resolve), print.ts (per-print settings)
  store/                zustand: settingsStore (persisted), maskStore, uiStore, sliceStore, modelStore
  hooks/                useMesh, useSliceSettings, useSlicer, useDebouncedValue
  actions/              loading models, downloading G-code
  components/
    ui/                 Slider, Button, Section, ...
    panels/             Model, Profiles, Print, Textures
    layout/             TopBar, ViewBar, StatsCard, LayerBar
    viewport/           react-three-fiber scene: Bed, ModelMesh (shading + painting), Toolpath, CameraRig
tests/                  vitest
```

Data flow: stores -> `useMesh` / `useSliceSettings` -> `useSlicer` (debounced, in a Web Worker) -> `sliceStore` -> viewport and stats. Painted masks mutate in place while you drag; the slicer re-runs about every 120 ms during a stroke (one slice at a time) and once more on release.

### Views

- **Model**: shaded STL (smooth matcap), paintable masks.
- **Layers**: unlit, crisp toolpath lines, colourable by height, floor/wall, overhang, speed or bead width.
- **Print preview**: the print as real geometry, a stadium-section bead swept along every path point, lit like matte clay with soft shadows. The layer slider clips it. Large prints make big meshes (about 10 vertices per path point).

### Floor and blobs

- Set **Floor layers** to 0 for no floor: the wall spiral starts directly on the bed.
- **Clay blobs** texture: the nozzle stands still at repeated points (rows every N mm, M per row, alternate rows offset) while clay keeps flowing. G-code gets an extrusion-only `G1 E… ; blob` line; time and clay volume include it. The preview shows each blob as a sphere of the extruded volume. Calibrate dwell time on a test piece.

### Floor, clay colour and measurements

- **Floor**: every floor layer is a full outer loop on the model's contour (the shell is never cut into) plus a fill one line spacing inside it. Patterns: spiral, inset curves (concentric loops), lines (turning 90° each layer) and grid (both directions on every layer). Line spacing defaults to 140% and goes up to 200%. **Print the floor below the model** adds the floor layers underneath instead of replacing the model's first layers. **Pause after the floor** lifts the nozzle (default 300 mm, capped at the build height), waits (default 20 s) and returns; the lift is a `G1 Z` move and the wait a `G4 P`.
- **Lighting**: in the print preview the lights follow the camera, so the side you look at is always lit.
- **Clay colour**: each clay profile has a colour that tints the model view and the print preview.
- **Profile settings** are split into _Used in the G-code_ and _Analysis only_ (estimates, warnings, preview).
- **Measurements**: the bed shows mm ticks along X and Y, the bed diameter and a height scale; the section top view has labelled gridlines and shows width × depth (or Ø) and centre of the section.

### Panels, docking and resizing

The three panels (Print Setup, STL or Design, Textures) live in a left and a right dock. **Drag a tab** to dock it on the other side (drop it near the window edge) or to let it float as a window; floating windows can be moved, resized and docked back with the arrow buttons. Drag a dock's inner edge to resize it (double-click resets, arrow keys nudge). The layout is remembered in the browser.

### Sidebar tabs

Print Setup (profiles + print settings, with Import / export and **Reset all** at the bottom) | STL or Design | Textures.

### Design tool (lofted sections)

On the **STL or Design** tab choose _Design_. A design is a stack of **sections** at different heights. Each section is a free closed outline that you edit in a **top view**: drag the points, click a "+" on an edge to add a point, delete a point, or set a regular polygon with the _Points_ slider; _Corner radius_ fillets the corners (optionally for all sections). The sections are resampled to the same point count, aligned to each other and blended along the height with a monotone spline, so a square can turn into a triangle or a free-form blob, and shapes can lean and bend: nothing is rotary. Tick _Perfect circle_ to make a section a true circle (centre + radius) instead of a polygon. In the 3D view every section is an outline with a sphere: click it to select the section and get its **gizmo**. The arrows move it along X, Y and Z (the centre dot moves it freely on its plane), the small squares scale it (sides stretch one axis, Shift keeps the proportions; corners scale evenly), and the ring turns that layer, so the layers in between twist smoothly (Shift snaps to 15°). _Twist_ turns the whole shape. The design is saved in projects (with the generated mesh as `model.stl`), and the STL and the design are kept side by side, so you can switch back and forth.

### Textures: stacking, brush, decals

- **Layers and blending:** textures are applied in list order (use the arrows to reorder). Each layer blends onto the result of the ones before it: _Add_ sums, _Max_ keeps the higher one, _Replace_ overrides. A layer's height range and painted mask weight it, so a half-strength area gives half the effect.
- **Height range:** one track with three handles: where the texture starts, the round handle where it begins to fade out, and where it ends.
- **Brush:** hardness (soft edge) and opacity. _Everywhere_ clears the mask, _Invert_ flips it. A stroke paints like a grayscale image: overlapping stamps within one stroke do not pile up, and painting over it again builds up. Erase works the same way.
- **Decal:** load any image (bright = raised, or engraved with _Invert_; transparency counts as black). Set width and height in mm on the surface, rotation and relief depth, and click or drag on the model to place it. Decal images are saved in project files.

## Known limits and next steps

- Only the largest outer contour per layer is printed (single wall). Handles, multiple parts and inner walls are ignored with a warning.
- Painted masks are not kept between browser sessions; **Save project** (zip with model, active profiles, print settings, textures and masks) keeps them. Open a project from the start popup, the _STL or Design_ panel, or by dragging the zip onto the page. Masks are unwrapped by angle around the model's vertical axis, which suits pots and vases; they are not meant for strongly non-round shapes.
- Painting raycasts the whole mesh on every pointer move; very dense STLs (several hundred thousand triangles) will feel slow. A BVH (three-mesh-bvh) would fix that.
- The floor fill scales the first contour toward its centroid: exact for round shapes, approximate otherwise. A polygon offset (Clipper2) would fix that.
- No mesh repair yet; the mesh must be watertight (an open mesh gives "no closed contour").
- Not yet: image/heightmap displacement, lay-flat on face, drying-pause planner, shareable links, 3MF/OBJ import, tall-print stability checks, G-code upload to the printer.

## Defaults

Printer WASP Delta 4070 Pro (400 × 400 × 800 mm; other values like the 2040), 2 mm nozzle, stoneware (overhang warning at 40°).
