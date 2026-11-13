# Clay Slicer

A browser-based slicer for clay 3D printing on WASP delta printers. It runs entirely client-side, so your models never leave your machine, and it deploys as a static site to GitHub Pages.

**The G-code has not been tested on a real printer.** Do a dry run without clay, and calibrate the extrusion (see below), before printing.

## Features

| Area          | What it does                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load          | STL (binary/ASCII) by drag-and-drop or file picker, three sample models, rotate/scale, drop to bed                                                                                                                                                                                                                                                                    |
| Profiles      | Pick a **printer**, a **nozzle** and a **clay** profile independently. Built-ins are starting points; editing one forks your own copy (saved in the browser). Copy / rename / delete, plus JSON import / export. Active setup with an **Edit** button per profile that opens the editor as a popup. Lives in the _Print Setup_ panel together with the print settings |
| Slicing       | Spiral (vase) mode with seam-aligned contour interpolation, or layered rings. Floor as a continuous spiral that flows into the wall                                                                                                                                                                                                                                   |
| Textures      | Stackable fuzzy skin, waves, zigzag, ribs, twist. Each has a split height range (start, fade-out start, end) and an optional **painted mask**                                                                                                                                                                                                                         |
| Mask painting | Paint (or erase) where a texture applies directly on the model; the view shows the finished print and updates live while you draw. Right mouse button rotates while painting                                                                                                                                                                                          |
| Bead width    | Per-point estimate from extrusion rate, layer height, flow factor and speed, the "Print preview" meshes every bead at its estimated width                                                                                                                                                                                                                             |
| Analysis      | Overhang overlay on the model and colouring on the toolpath (measured on the final path, textures included); estimates for time, clay, weight, tank refills                                                                                                                                                                                                           |
| Preview       | Shaded matcap model with smooth normals; unlit crisp toolpath lines; layer slider and playback; colour by height, floor/wall, overhang, and (only when they vary) speed, bead width or layer height                                                                                                                                                                   |
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

so **`E-axis Ø` (default 4.5 mm) in the printer profile is a placeholder**. Print a short test line, measure the bead, and adjust `E-axis Ø` and the clay profile's `Flow factor` until it matches. Also check bed size, tank volume, start/end G-code and homing for your machine. All built-in profile values are rough starting points.

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
- **Layers**: unlit, crisp toolpath lines, colourable by height, floor/wall and overhang. Speed, bead width and layer height only appear in the list when they actually differ along the path (otherwise the whole path would be one colour); layer height shows with "Follow the top" and prints its range.
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

On the **STL or Design** tab choose _Design_. A design is a stack of **sections** at different heights. Each section is a free closed outline that you edit in a **top view**: drag the points, click a "+" on an edge to add a point, delete a point, or set a regular polygon with the _Points_ slider; _Corner radius_ fillets the corners (optionally for all sections). The sections are resampled to the same point count, aligned to each other and blended along the height with a monotone spline, so a square can turn into a triangle or a free-form blob, and shapes can lean and bend: nothing is rotary. Tick _Mirror X_ (left ↔ right) and/or _Mirror Y_ (top ↔ bottom) to edit symmetrically: dragging a point moves its mirror partners (the vertices that were its mirror images) too, and points on an axis stay on it (`core/shape/symmetry.ts`). Tick _Perfect circle_ to make a section a true circle (centre + radius) instead of a polygon. In the 3D view every section is an outline with a sphere: click it to select the section and get its **gizmo**. The arrows move it along X, Y and Z (the centre dot moves it freely on its plane), the small squares scale it (sides stretch one axis, Shift keeps the proportions; corners scale evenly), and the ring turns that layer, so the layers in between twist smoothly (Shift snaps to 15°). _Twist_ turns the whole shape. The design is saved in projects (with the generated mesh as `model.stl`), and the STL and the design are kept side by side, so you can switch back and forth.

### Textures: stacking, brush, decals

**Mask pattern** (each texture except twist and decal): next to the painted mask a texture can be limited by a procedural pattern or a picture. The two multiply (painted area AND pattern). Patterns are computed per point in the core (`core/textures/noise.ts`) in millimetres on the surface, as a point on a cylinder so they close seamlessly around the object. Kinds: _Simplex noise_ (smooth blobs, _Detail_ adds finer layers), _Billowy noise_ (soft lumps), _Ridged noise_ (veins and ridges), _Cells_ (pebbles, from Worley noise), _Cracks_ (dried-clay cracks), _Stripes_ and _Checkerboard_ (_Direction_ turns them, a whole number of repeats fits around), _Gradient_ (bottom to top, so "Coverage 30%" is the top 30%; _Direction_ turns it: 90° runs from the +X side round to the opposite side, as a rise and fall so there is no seam, negative turns the other way) _Curvature_ (see below) and _Image_ (a picture wrapped once around the object and over its height, with _Repeats around / in height_; bright = texture; a picture's luminance times alpha is used). Common settings: _Size_ (feature size, mm), _Stretch in height_, _Warp_ (bends the pattern with a second noise), _Coverage_ (share of the surface that gets the texture), _Soft edge_, _Seed_ and _Invert pattern_. The mask picture is saved in the project (`maskimages/`).

**Curvature mask**: the pattern _Curvature_ limits a texture by how sharply the outline bends at that point (turn of the outline normal over a short stretch / its length, `curvatureAt` in `core/geometry/contour.ts`; for _Follow the top_ it is taken from the radius profile). _Where_ chooses outward corners (convex), inward corners (concave) or both; _Corner radius_ is the threshold: outline tighter than this radius counts as curved. _Invert pattern_ gives the opposite, i.e. areas flatter than the radius. _Soft edge_ blends around the threshold. Straight walls and big circles have curvature near 0; a hole's wall is concave. Everything also works for blobs (their dwell time scales with the mask).

Every texture card has a small picture of the model with **only that texture** applied (a coarse, lit front view, so fine detail is approximate). Fold a card with the arrow to keep the list short; the picture stays visible. Drag the grip on the left to reorder (textures apply from top to bottom); with the grip focused the Up/Down arrow keys also move it. The thumbnail code is `core/textures/thumb.ts`.

- **Layers and blending:** textures are applied in list order (use the arrows to reorder). Each layer blends onto the result of the ones before it: _Add_ sums, _Max_ keeps the higher one, _Replace_ overrides. A layer's height range and painted mask weight it, so a half-strength area gives half the effect.
- **Height range:** one track with four handles. The tall outer handles are where the texture starts and ends; the round handles below the track are where it reaches full strength and where it starts to fade out (fade in and fade out are independent).
- **Brush:** hardness (soft edge) and opacity. _Everywhere_ clears the mask, _Invert_ flips it. A stroke paints like a grayscale image: overlapping stamps within one stroke do not pile up, and painting over it again builds up. Erase works the same way.
- **Decal:** load any image (bright = raised, or engraved with _Invert_; transparency counts as black). Set width and height in mm on the surface, rotation and relief depth, and click or drag on the model to place it. Decal images are saved in project files.

## Known limits and next steps

- Only the largest outer contour per layer is printed (single wall). Handles, multiple parts and inner walls are ignored with a warning.
- Masks are unwrapped by angle around the model's vertical axis, which suits pots and vases; they are not meant for strongly non-round shapes.

## Textures: duplicate, copy, paste

Each texture card has _Duplicate_ (a copy right below), _Copy_ and _Paste below_ icons; under the stack, _Copy stack_ and _Paste stack_ copy all textures and paste them at the end. A copy takes its painted mask, decal picture and mask picture along, and a paste always creates new textures, so it works inside one project and, because the clipboard stays while the app is open, between projects (copy, open or create another project, paste). The clipboard is not kept when the page is reloaded.

## Projects

Work is organised in projects. A project holds everything: the model (STL or design), the three active profiles, print settings, textures, painted masks and images.

- **Autosave:** every change is saved into this browser (IndexedDB) after a short pause, as soon as the project has a model; the title bar shows the state. The project that was open is reopened when you come back. Starting a **New project** saves the old one first (the printer, nozzle, clay and print settings carry over, model and textures start empty).
- **Name:** type it in the title bar or in the _Project_ tab. Until you do, it follows the model's name. It is used for the file names and the G-code header.
- **Title bar:** the project's name (click to rename) with the save state and the time of the last save under it, plus _Download zip_ (one zip with the project file, the G-code once sliced, and the STL) next to _Download G-code_.
- **Unique names:** every project has its own name: a new project is "Untitled project" (or "… 2"), an unnamed project takes its model's name (first letter capitalised), and a name already used by another project gets " 2", " 3"… (also when renaming, opening a file or uploading).
- **Project tab (side panel):** one list. On top a short note that projects live only in this browser, the orange _New project_ button and _Open file…_; then _Download all_ (every stored project as one zip, `clay-projects.zip`) and _Upload…_ (adds project files, or such a zip, without opening them; hover for tooltips). Each project shows a small shaded picture of its model with its textures (rendered like the texture thumbnails) and has **Open**, **Duplicate** (a copy named "… copy", not opened), _Download_ and _Delete_.
- **Order:** the list is ordered by last save. A project is only saved again when something changed, so opening or switching between projects never reorders the list.
- **Profiles when opening:** a project carries its printer, nozzle and clay profile. Opening compares them with yours: if they are the same, nothing happens. If not, you are asked whether to **Import** them (a profile you do not have is added; one of the same name that you made yourself is replaced with the project's values; built-in profiles are never overwritten, the project's copy is added as "… (project)"), or to open the project **keeping your current profiles**, or cancel. The open project is always saved first.
- Dropping an STL puts it into the open project; dropping a project zip opens it as a project of its own. Projects live in this browser only: clearing site data deletes them, so download the ones you care about. Where IndexedDB is blocked (some private windows) they stay in memory until the tab closes.
- Code: `actions/projectManager.ts` (save, open, new, downloads), `domain/projectLibrary.ts` (storage), `store/projectStore.ts`, `components/panels/ProjectTab.tsx`.
- Painting raycasts the whole mesh on every pointer move; very dense STLs (several hundred thousand triangles) will feel slow. A BVH (three-mesh-bvh) would fix that.
- The floor fill scales the first contour toward its centroid: exact for round shapes, approximate otherwise. A polygon offset (Clipper2) would fix that.
- No mesh repair yet; the mesh must be watertight (an open mesh gives "no closed contour").
- Not yet: image/heightmap displacement, lay-flat on face, drying-pause planner, shareable links, 3MF/OBJ import, tall-print stability checks, G-code upload to the printer.

## More textures

- **Outdents (ledges):** every layer within the height range goes a little further out, like a corbel. Two graph editors shape it: _Outdent over height_ (how the outdent grows and returns; presets _Close slowly_, _Bridge back_ and _Stay open_ (goes out and stays out to the end of the range), where the print jumps back to the normal wall in one layer so that layer bridges the gap) and _Outdent around_ (strength around the object; _Repeats around_ repeats the graph). _Outdent height_ is how tall each outdent is: the height range is split into outdents of about that height (a whole number fits), each following the height graph, and _Rotate each repeat_ turns each repeat further around the object (the around-graph is turned with it). Click a graph to add a point, double-click a point to remove it. The overhang warnings measure the result.
- **Slings:** the print head leaves the wall for a short outward spike so the clay droops. Rows every _Row spacing_ mm, _Slings per row_, _Reach_ and _Sling width_. _Layers that droop_ sets how many consecutive layers hang down from each row, and _Rotate each row_ turns the next row of slings by that angle.
- **Clay blobs: Lift while extruding:** while a blob is made the nozzle rises slowly (`G1 Z.. E..`) and then returns, so the blob is not squeezed flat. 0 = stands still.

## Slicing modes, non-planar tops and travel moves

- **Mode:** _Spiral (vase mode)_, _Layered rings_ and the new _Standard layers_. Standard layers prints every curve of every layer: outer walls, the inner walls of holes and separate parts. Between curves the nozzle travels (rising by the _Z hop_), with a retraction written to the G-code. The floor is still made from the largest outer contour only. Overhang is measured for every wall line (outer, hole and inner walls): each wall point is compared with the closest point of the wall printed on the layer below (`core/toolpath/overhang.ts`), and the outward step against the layer height gives the angle, as in the other modes. A hole that narrows towards the top counts too (the material leans into it). Parts with nothing within about 8 layer heights below them (a new island) are not rated.
- **Walls and infill (Standard layers):** _Wall loops_ (0 to 5; **0 = no walls, only infill**, which needs infill above 0, otherwise one wall is printed; textures act on the outer wall, so they have nothing to act on without walls) prints extra concentric loops inside the outer one (each moved in by one bead width; the outer loop carries the textures; a loop that would collapse in a thin wall is left out). _Infill_ (0 = hollow) fills the area inside the walls (holes stay empty) with _Lines_ (turn 90° each layer), _Grid_, _Triangles_ or _Gyroid_ at the given _Infill angle_ (gyroid ignores the angle); the line spacing is chosen so the share of filled area matches the density (grid and triangles widen the spacing for their two or three directions). The last _Solid top layers_ below the model's top are filled 100%. _Gyroid_ cuts the 3D gyroid surface sin x cos y + sin y cos z + sin z cos x = 0 at each layer's height (marching squares, `gyroidSegments` in `core/toolpath/infill.ts`), so the waves shift from layer to layer and interlock; the crossings are chained into continuous wavy lines that are cut at the walls, and the wave period is set so the filled share matches the density (about ±15% accurate); its curves are simplified to within 0.12 mm to keep the point count and G-code small. Each infill line is its own extrusion; a link from one line to the next is extruded only if it is shorter than 1.5 line spacings and stays inside the region (it must not cross a hole or leave the part), otherwise the nozzle travels with a Z hop and retraction. Infill shows in its own colour in the _Floor / wall_ view and as `;TYPE:FILL` in the G-code. Limits: infill is not combined with open top curves, there are no internal solid ceilings (only the top of the model), and there is no concentric infill.
- **Non-planar top:** for an object whose top is slanted or curved (a rim cut at an angle, a dome). _Close the curves_ is the previous behaviour: each layer is a closed loop, so a slanted rim gets a cut-face across the opening. _Open lines_ leaves out the parts of the contour that lie on a top surface (faces tilted up to _Top surface tilt_ from flat, default 35°), so every layer is only the wall: separate lines, each its own extrusion. Between them the nozzle rises, runs just outside the wall (4 mm out, along the side that does not cross the opening) and comes down on the next line. In spiral mode the spiral continues up to the first layer with a top surface and the rest is printed as open lines. Faces flatter than the tilt anywhere (a shoulder, a dome) are treated as top too, so use it only where you want that.
- **Follow the top (layer height varies):** the whole wall is one continuous line even when the rim is slanted or wavy. The layer surfaces are stretched between the floor and the local rim height: surface f (0 to 1) lies at `z = zStart + f * (rim(angle) - zStart)`. Where the rim is low the layers are thinner, and the last turn runs exactly along the rim. The _Layer height_ setting is the maximum thickness; the number of turns is chosen so the highest point gets that. Line width stays constant; clay per mm follows the local thickness (`E` scaled by the bead area at that thickness), and the preview draws the bead at that thickness. A warning appears if layers get thinner than 40% of the set height. Textures, blobs, slings and the overhang check use the local thickness. How it works (`core/toolpath/variable.ts`): the model's planar slices give the wall radius per angle at each height (a polar table around the model centre); the rim height per angle comes from the points where each planar cut meets the top surface (known exactly) plus the highest point, interpolated around. This is a height-field version of curved-layer slicing (CurviSlicer, Etienne et al. 2019; QuickCurve, 2024). Limits: the wall must be star-shaped around the model centre (one wall point per angle); only one wall is printed; the nozzle rises and falls by the rim slope on each turn, so very steep rims need a collision check; _Standard layers_ mode ignores it.
- **Travel moves:** _Retraction_ (mm of E, default 3; 0 = off), _Retraction speed_ and _Z hop_. They apply to every travel move longer than 3 mm, including floor patterns with separate lines. G-code is `G1 E-` before and `G1 E+` after the move, marked `; retract` / `; unretract`.
- **Flow (more / less clay):** changes the extrusion rate along the wall. _More / less clay_ is a percentage (+50 = half again as much, -50 = half as much). With _Alternate around_ or _Alternate in height_ set it swings between more and less in a sine; leave both at 0 for a constant change. Use the height range, the paint mask or a mask pattern (noise, stripes, ...) to say where. The bead gets wider or thinner (the preview and the "Bead width" colouring show it) and the G-code `E` per mm is scaled; the wall itself does not move. It works in all slicing modes.

## STL units

STL files have no units. When a loaded model is under 10 mm or does not fit the printer (taken as millimetres), a dialog asks for the units (mm, cm, inch, m, or scale to fit) and preselects a guess: the unit that gives a size near 120 mm inside the build volume. Enter accepts the guess.

## Defaults

Printer WASP Delta 4070 Pro (400 × 400 × 800 mm; other values like the 2040), 2 mm nozzle, stoneware (overhang warning at 40°).

## Undo, redo and history

Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z (or Ctrl+Y) redoes; there are also Undo / Redo buttons in the top bar. Tracked: print settings, textures (incl. order and painted masks), profiles and which are selected, and the drawn shape. Not tracked: loading a model file, decal images, view settings. Quick edits of the same value (a slider drag, one brush stroke) become one step.

**History** lists every step. _Undo this_ switches off a single step even if it is old; the steps after it stay in place. In the design, every section (P1, P2 ...) and every property is its own entry, so moving P2 and then P3 can be undone in either order. Entries show icons for what changed (move, scale, rotate ...) and use the names of the editor fields. A step is simply on or off, and a value is whatever the newest step that is on says, so you can switch any step back on later. When two steps changed the same value, the later one wins; the older one is marked "replaced later". Painted masks are stored per mask, so an older stroke on a mask that was painted again later is "replaced later" too. The history keeps the last 200 steps and lives until the page is closed. The logic is in `domain/history.ts` (framework-free, tested) and `store/historyStore.ts`.

## View cube and bead size

- A small cube in the bottom-right corner of the viewport turns the view to the front, back, left, right, top or bottom (drag the cube to turn the view, or click a face, an edge or a corner to look from there (the top view has the front edge at the bottom of the screen)).
- In the **Layers** view the _Bead size_ checkbox draws every bead at its real width and layer height instead of thin lines, with the same colour modes and layer slider. The _Print preview_ always shows the clay beads.

## History is saved in the project

The undo history (every step, including painted-mask changes and which steps are switched off) is stored in the project file (`history.json`, with painted masks as `history/N.bin`) and in the copy kept in this browser, so it is still there when you reopen a project. Steps that changed profiles are not restored, because profiles may be skipped or renamed on import. Older project files without history open as before.
