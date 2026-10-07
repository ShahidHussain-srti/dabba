# Dabba

**Try it here: https://shahidhussain-srti.github.io/dabba/**

Dabba is a little browser tool for designing 3D-printed cases around things you own. You
measure the object, tell it what shape it is, and it builds a hinged box with a pocket that
fits. When you're happy, export a multi-colour `.3mf` and send it to your slicer.

I started it because I wanted a proper case for a battery-powered air pump, and drawing one
from scratch in CAD every time I need a box for something felt like too much work. It grew
from there.

Nothing to install and no build step. Use the link above, or download the repo and
double-click `index.html`; it works offline too, because the geometry engine
([Manifold](https://github.com/elalish/manifold)) is bundled in `vendor/workbench/`.

## What you can make

A hinged case with a base and a lid, or just the base on its own if you want an open tray
or a drawer insert. Either one can sit on a **Gridfinity** base: the footprint rounds up to
whole 42 mm units, and you get the standard feet and optional magnet holes.

### Compartments

Add as many as you like and pick what each one holds. Fit clearance is added around
whatever you choose; each compartment can add to the global clearance, or take some away
for a snugger fit.

- **Box**, **round/oval** and **capsule** pockets, sized by width, length and height.
- **Lying cylinder** for torches, bottles or a rolled-up cable, which rest in a round trough.
- **Stepped cylinder** for things made of round sections end to end, like the air pump
  (body, neck, nozzle) or a screwdriver. Add as many sections as you need.
- **Battery holders** for 37 standard sizes: AA, AAA, AAAA, C, D, N, A23, 9 V and 4.5 V, Li-ion
  cells from 10440 to 4680 (18650, 21700 and the rest), CR123A and CR2, and coin and button
  cells, standing or lying down. Batteries are a standard size, so each hole goes as deep as
  the base allows; the base share of the height sets that, and the lid takes the rest.
- **Hex bit holders** and **card slots** for SD, microSD, USB sticks and CF cards.
- **Custom shapes**, if none of those fit. Build the pocket out of boxes, ovals, capsules,
  hexagons and cylinders. Drag them around in the plan (they line up with each other's edges and centres; Alt
  places freely) or nudge with the arrow keys,
  pull any edge or corner handle to resize while the opposite side stays put (Alt resizes
  from the centre), grab the round grip to turn them (or press `[` and `]`), and give each
  one its own depth if you like.

Each compartment also gets its own pocket depth (by default shorter things sit flush with
the rim), its own pocket shape (corner radius, floor rounding, rim round-over and taper,
with a button to copy them to every compartment), and optional finger notches so you can
get the object back out. Inner walls never go below the thickness you set. Resizing one
compartment grows the case if it needs to, but never changes the others. Where neighbours
are different sizes the wall between them gets thicker, unless you set a compartment to
*Fill* so it grows into the space instead; its size then shows what Fill gives it and stays
locked until you turn Fill off.

### The box itself

- Wall, floor and lid thicknesses set separately.
- Rounded or chamfered outer edges and an outer taper.
- Any base/lid split, not just half and half.
- An alignment lip that can be turned off per edge, so the inside can be flush where
  you reach in.
- A lid that's open inside, has walls only (dividers over the base's walls, so nothing slides
  between compartments), thin walls (one thin divider wherever two compartments' areas meet,
  the case wall closing the rest), or mirrors the base's compartments exactly, with the same depth,
  rounding and shapes, so things are held from above when it's shut.
- A filament-pin hinge on any edge: count, knuckles, length, pin size and clearances are
  all adjustable.
- Clasps: snap hooks, magnets, snap bumps, a hook latch on its own pin, a swing hook like
  the ones on old jewellery boxes, or a press latch: a stiff tab hung from the lid on a thin
  web, which you press at the top to lift its hook out of the base. Its lever thickness
  (3 mm by default) and web thickness (1.2 mm) are adjustable; the web is filleted at both ends
  and is both hinge and spring, printing flat so it bends along its layers rather than across
  them. A thicker web stands the lever further off the wall so it bends no harder. The
  hook latch and swing hook print as a separate small piece.

### Texture and decoration

There are 27 surface textures for the outside: knurling, hexagons, wood grain, leather,
topographic lines and lots more, or upload your own height map.
You can set depth, scale and angle, push the pattern out or sink it into a recessed panel, and
pick a different pattern (or none) for each side. The plain bands at the top and bottom of
each wall can be set separately too. Hinges and clasps always sit on a smooth surface.

The lid top and the base underside can carry borders, text and pictures, the same way
[Keychain Studio](https://shahidhussain-srti.github.io/keychains/) does it. Each element
gets its own colour, set in, engraved or raised. Dragged elements snap to the edges and centre
lines of the face, the inside of its border and each other (hold Alt to place freely).

### Getting around

Click a compartment in the plan to select it, drag its edges or corners to resize it, and
drag it to move it; while dragging, its edges and centre snap to the other compartments,
the interior and its slot's middle, with a guide line (hold Alt to place freely). Moving it, or typing a position, sets that direction to Custom
(each direction also has Left / Centre / Right / Fill). A moved compartment can overlap its
neighbours (the pockets merge) but stays inside the outer wall. Use **+** to add a neighbour, the dashed pills outside the case
to add a compartment along a whole side, and Delete to remove one. The 3D view can show the case closed, open at any angle,
or laid out for printing. Number boxes work like Unity's inspector: type a value, or drag
sideways on the label or the edge of the box (Shift for bigger steps, Alt for finer).

**Designs** lists every design kept in this browser: start a new one, carry on in a copy, open
another or delete it. Each tab works on its own design, so two tabs never write over each
other; a new tab picks up your latest design unless another tab has it open.

Each section of the sidebar has a ↺ button that puts its settings back to their defaults,
keeping your names, sizes, text and pictures. `⌘Z` / `Ctrl+Z` undoes anything, and your work survives a refresh. **Save** and **Load** keep
a design as a `.case.json` file.

**Share** copies a link that opens your design for whoever you send it to. Everything is
packed into the link itself, after the `#`, so nothing gets uploaded anywhere. Pictures and
image textures are too big to fit in a link, though, so if your design uses them, send the
saved file or the exported 3MF instead.

## Printing

The 3MF comes laid out ready to print: the base upright, and the lid flipped open beside
it so its top is on the bed. Hook latches and swing hooks add a third small piece. Every part is a closed,
watertight solid, and every height is a whole number of layers, so set the layer height to
match your slicer. Pick your printer under Printer to see its bed under the print layout and
be warned if the parts don't fit on it.

Colours are assigned the way Bambu Studio writes its own files, so they come through in
Bambu Studio, OrcaSlicer, Creality Print and PrusaSlicer, numbered from extruder 1 in the
order they're used. Base and lid are separate objects, so you can print them in different
filaments on any printer. Multi-colour decoration needs an AMS, CFS or MMU.

For the hinge, push a length of 1.75 mm filament through the knuckles and melt or trim
the ends. If it's tight, run a 2 mm drill through or bump up *Pin hole*. The knuckles have
45° undersides, so no supports are needed.

**STL** gives you the same layout as a single-colour mesh.

## How it works

Compartment sizes flow up a tree from the objects and positions flow back down
(`layout.js`). The solids are built with Manifold, whose booleans always come back
watertight (`geometry.js`). Decoration reuses Keychain Studio's approach: draw each element
to a mask, trace it into polygons, then extrude and cut it into the face. The 3D view shows
the exact mesh that gets exported, so what you see is what you print.

Files in `src/`: `util` state, `items` compartment shapes, `layout` sizes and placement,
`geometry` solids, `texture` surface patterns, `raster` the face masks, `export` the case as
printable objects, `gl` lid poses and picking in the 3D view, `plan` the planner, `face` the decoration editor, and `app`
to wire it all up.

The parts Dabba shares with Keychain Studio (masks and contours, borders, text and
pictures, the 3MF writer, the 3D viewer, share links, undo, number fields and most of the
styling) live in
[Workbench](https://github.com/ShahidHussain-srti/workbench), copied into
`vendor/workbench/`.

## Development

```sh
npm install      # manifold-3d, for the tests
npm test         # geometry, collision, layout and 3MF checks in node
npm run render-stl -- case.stl case.png   # look at an export without a slicer
node ../workbench/tools/sync.mjs .        # refresh vendor/workbench from a checkout beside this one
```

The tests check the physical things: every part is a valid closed solid, the base and lid
don't overlap when shut, the lid swings a full 180° without hitting anything, latch hooks
clear both halves, printed pieces don't touch, and the 3MF reads back with the right
colours.

## Privacy

There are no accounts, cookies, analytics or trackers, and the page loads nothing from
other sites. Designs and pictures stay in your browser's local storage, which the app
only uses to keep your work, and leave it only as files you save or export. A share link
holds the design after the `#`, which browsers don't send to the server, so it goes only
where you send it (and anyone with it can read it); pictures never go in links. The site
is hosted on GitHub Pages, where GitHub keeps standard request logs under its own privacy
statement. Designs → Delete all saved data removes everything the app has kept.

## License

Copyright © 2026 shahidhussain2k13@gmail.com

Dabba is free software under the **GNU General Public License v3.0 or later**. You can
use it, change it and share it. If you distribute something built from it, including
hosting a modified copy on a website, that has to be GPL with its source available too.
There's no warranty. See [LICENSE](LICENSE) for the full text.

`vendor/workbench/manifold.js` is [Manifold](https://github.com/elalish/manifold), © The
Manifold Authors, under the Apache License 2.0
([vendor/workbench/LICENSE-manifold.txt](vendor/workbench/LICENSE-manifold.txt)), which is
compatible with the GPL.

`vendor/workbench/` is [Workbench](https://github.com/ShahidHussain-srti/workbench), by the
same author under the same license.
