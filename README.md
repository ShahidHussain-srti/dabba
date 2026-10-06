# Dabba — case studio

Design a hinged, two-piece case around objects you have already measured, and export a
3D-printable multi-colour `.3mf`.

**Use it online: https://shahidhussain-srti.github.io/dabba/**

No build step and nothing to install — **double-click `index.html`**. It works offline:
the geometry engine ([Manifold](https://github.com/elalish/manifold)) is bundled in
`vendor/` with its WebAssembly inlined.

## Controls

- **Make**: a hinged case, or **base only**, which gives an open tray or insert with no
  lid, hinge or clasps. Either can stand on a **Gridfinity base**. The footprint rounds
  up to whole 42 mm units (less the standard 0.5 mm), with standard feet and optional
  6 × 2 mm magnet holes. The extra width thickens walls, or grows compartments set to
  Fill.
- **Number fields**: type exact values, or drag sideways on a field's label or the edges
  of its box to change it, as in Unity's inspector. Shift for big steps, Alt for fine.

- **Compartments**: as many as you like. Each one says what it **holds**, and the fit
  clearance is added around it:
  - **Box**, **Round / oval** and **Capsule**: sized by the object's width, length and
    height.
  - **Lying cylinder**: a torch, a bottle or a rolled cable, cradled in a round trough.
  - **Stepped cylinder**: round sections of different sizes end to end on one axis, such
    as a battery air pump's body, neck and nozzle, or a screwdriver. Add or remove sections.
  - **Battery holder** (AA, AAA, C, D, 18650, 21700, CR123A, 9 V, coin cells), standing
    or lying; **hex bit holder**; **card slots** for SD, microSD, USB sticks and CF. Rows,
    counts, hold depth and walls are all adjustable.
  - **Custom shapes**: build the pocket from boxes, ovals, capsules, hexagons and lying
    cylinders. In the plan, drag a shape to move it, drag its corner square to resize it,
    and drag its round handle to turn it (`[` and `]` turn by 15°). Each shape can have its
    own depth, or follow the compartment's depth.
  - **Pocket depth** is set per compartment. On automatic, shorter objects sit flush with
    the rim; switch to *Reach the floor* to drop every pocket to the bottom.
  - **Inner walls** are never thinner than the setting. Where neighbours differ in size,
    the wall between them thickens to take up the slack. Set a compartment to **Fill** to
    grow its cavity into that space instead.
  - **Finger notches**: a round scoop on any side of a compartment, with its own width and
    depth, so you can lift the object out.
- **Plan view**: click a compartment to select it, drag an edge to resize it, use **+**
  to add a neighbour on that side, and press Delete to remove one. Arrow keys move the
  selection. Clicking the hinge, clasps or walls opens their settings.
- **3D view**: Closed, Open (with a lid-angle slider) or Print layout. Click a compartment
  to select it, even through a closed lid.
- **Walls**: side, base floor, lid top and inner, each set separately.
- **Edges & tapers**:
  - Outside: corner radius, lid-top and base-bottom edge rounding (rounded or chamfered),
    and an outer wall taper.
  - Pockets: corner radius, floor rounding, rim round-over and a draft taper. Walls are
    spaced so their thinnest point, at the top, still meets the inner-wall setting.
- **Base / lid split**: any ratio, not just 50/50.
- **Alignment lip**: the inner half of the base wall rises into a groove in the lid. It can
  be switched off per edge. On an edge without it, the lid's groove is filled in too, so
  base and lid meet flush on the inside. That's handy on the clasp side, where you reach
  in.
- **Lid interior**: open, or **mirror compartments**. Mirroring puts walls over the base's
  walls and a pocket over every compartment, stopping a set gap above the base walls so
  the lid closes cleanly. Near the hinge the walls also step back from the lip by the
  sideways sweep the lid makes as it opens. Pockets run full height, or *fit to objects*
  so they stop just above each object and hold it down.
- **Hinge**: on any edge. Set how many hinges, knuckles per hinge, length, knuckle
  diameter, pin hole, the gap between knuckles, swing clearance and inset from the
  corners. The pin is a length of 1.75 mm filament.
- **Clasps** on the edge opposite the hinge, any number:
  - **Snap hook**: a flexible tab on the lid catches a slot in the base.
  - **Hook latch**: a separate hook pivots on a filament pin through lugs on the lid and
    drops over a second filament pin held by lugs on the base. The hook is exported as its
    own object, lying on its side for printing.
  - **Swing hook**: the jewellery-box kind. A flat hook turns on a filament pin set into a
    boss on the lid, and its curved tip (an arc around the pin) threads through an eye on
    the base. Turn the knob to open. The hook prints flat as its own piece; the eye has a
    45° chin so it prints without supports.
  - **Magnets**: pockets in the rim that meet face to face.
  - **Snap bumps**: ridges on the lip click into dimples in the lid.
- **Texture**: displacement patterns on the outside. There are 27 patterns:
  knurl, pyramids, crosshatch, ribs, chevron, waves, hexagons, triangles, waffle, tiles,
  checkerboard, bricks, herringbone, basket weave, diamond plate, fish scales, dimples,
  studs, perforated, rings, bubbles, stone, crystal, leather, wood grain, topographic and
  sand, or an uploaded image (dark is deep). Settings are depth, size, angle and **outer
  depth**: at 0 the pattern is cut in with its high points flush; at the depth it stands
  out with its low points flush; below 0 the whole pattern sinks into a recessed panel,
  never closer than 0.8 mm to the inside. The hinge edge, and the clasp edge when a clasp hangs
  there, always stay cut in so nothing rubs. Walls stay plain under hinge supports and
  clasps. Each wall and face of
  the base and lid can use the main pattern, another one, or none. Textured walls are built
  as an even grid of columns round the outline and rows up it, and textured faces are
  stamped with a regular x/y grid. With the **Fine** engine (default), the export samples about 30 times per repeat and Manifold then
  simplifies to within 0.01 mm, so triangles stay dense only where the surface bends.
  The preview builds a light mesh and shades it per pixel from a height atlas of the
  same texture. **Classic** keeps the earlier single-density method.
- **Decoration** on the lid top and the base underside, done the same way as Keychain
  Studio: borders, any number of text boxes and pictures, one colour per element, and
  inlay / engraved / raised per face.

`⌘Z` / `Ctrl+Z` undoes anything. Your work survives a refresh; **Reset** starts over.
**Save** / **Load** keep a design as JSON.

## Printing

The 3MF holds two objects (three with hook or swing latches), laid out for printing: the base upright, and the lid swung
open 180° on its hinge so it lies top-down beside the base. Both decorated faces
therefore print against the bed. That makes inlay crisp and flat, and it's why raised
detail on those faces is flagged.

The file layout matches Keychain Studio, which follows how Bambu Studio writes a
multi-colour file. Each colour is its own mesh object, gathered by an assembly object
per printable piece. `Metadata/model_settings.config` keys each `<part>` by the
component's objectid and gives it an extruder, which is what makes colour stick in Bambu
Studio, OrcaSlicer and Creality Print. `Slic3r_PE_model.config` says the same thing as
per-object triangle ranges for PrusaSlicer. Extruders are numbered densely from 1, in
order of use.

- **Base and lid** are separate objects, so they can be printed in different filaments on
  any printer. Decoration colours need a multi-material printer (AMS / CFS / MMU).
- Every height (floor, parting line, lid, lip, decoration depth) is a whole number of
  layers. Set **layer height** to match your slicer.
- **Hinge**: the knuckles have 45° chins and print without supports. Push filament
  through the pin hole, then melt or trim the ends. If it's tight, ream the hole with a
  2 mm drill or raise *Pin hole*.
- **STL** exports both pieces in the same layout as a single-colour mesh.

## How it works

Sizes flow up the compartment tree from the objects, and placement flows back down
(`layout.js`). The case is then built as solids with Manifold, whose booleans always
return watertight, oriented meshes (`geometry.js`):

- Shells and tapered pockets are hulls of stacked rounded outlines.
- Concave profiles, like a rim round-over, are unions of hulls between neighbouring
  outlines.
- The hinge and clasps are built in a frame turned so the hinge edge faces +y, then turned
  back.

Decoration reuses Keychain Studio's mask pipeline: raster → marching squares → polygons.
The polygons are then extruded and cut into the face, with colour regions kept exclusive
both in 2-D and as solids. The 3D view renders the exported mesh, so it can't drift from
the file.

`util` state · `layout` compartment tree + dimensions · `geometry` solids, posing ·
`raster`/`edt`/`contour`/`shapes` decoration masks · `zip`/`export` 3MF + STL ·
`gl` viewer · `plan` planner · `face` decoration editor · `drawpad` · `app` wiring

## Development

```sh
npm install      # manifold-3d, for the tests and for re-vendoring
npm test         # geometry, collision, layout and 3MF checks in node
npm run vendor   # rebuild vendor/manifold.js after changing the manifold-3d version
npm run render-stl -- case.stl case.png   # look at an export, facets as-is, no slicer needed
```

The tests are physical checks. For every hinge side and clasp type, they confirm that:

- every part is a valid closed solid;
- base and lid don't overlap when closed;
- latch hooks clear both halves when closed and lie flat and apart for printing;
- the lid swings through 180° without touching the base (snap hooks aside — catching is
  their job);
- the printed pieces are apart;
- the 3MF meshes re-import as closed solids, with colour assignments keyed correctly.

## License

Copyright © 2026 shahidhussain2k13@gmail.com

Dabba is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License** as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version. It is distributed in the
hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full
text.

In short: anyone may use, change and share it, but anything they distribute that is built
from it, including a modified copy hosted on a website, must also be released under the
GPL with its source.

`vendor/manifold.js` is [Manifold](https://github.com/elalish/manifold), © The Manifold
Authors, under the Apache License 2.0 ([vendor/LICENSE-manifold.txt](vendor/LICENSE-manifold.txt)).
Apache-2.0 is compatible with GPL-3.0, and Manifold keeps its own license.
