# Rework the grid: a resizable split tree

## Context

The board is a fixed 2×2 of integer cells. `src/views/grid.ts` stores each pane as
a rectangle `{page, col, row, w, h}` with spans of 1 or 2, and `tiles()` is the
invariant that the four cells are covered exactly once. There is no way to set a
pane's proportions — halves and quarters are all there is. `BACKLOG.md:185-194`
records that draggable dividers were built and removed the same day, and what
they would cost if they came back.

The request is to make the board continuous and reactive: dividers you drag,
panes that reshape the board when a drag runs out of room, and edge zones that
restructure the whole board when a pane is dropped into them. None of that fits
integer cells — image 7 alone (a 2×2 whose two rows have their vertical dividers
at different x) is not expressible in the current model at all.

## The model

Rectangles are replaced by a **split tree**:

```ts
type Node = Leaf | Split
interface Leaf  { page: string }
interface Split { dir: 'row' | 'col'; at: { size: number; node: Node }[] }
```

`size` is per-mille, integers, summing to exactly 1000 within each split. `dir:
'row'` stacks its children vertically; `dir: 'col'` places them side by side.
Depth is unbounded.

**Why a tree and not free rectangles.** Two of the stated rules fall out of it
for nothing. A split's children each span the parent's whole cross-axis, so the
root divider necessarily moves every pane (image 8/9: "the vertical resize will
resize all of the panes vertically, not isolated"), while the dividers one level
down belong to one group each and move alone (image 7: each row's column divider
is its own). Free rectangles would need those two facts hunted for and enforced;
a tree cannot express their violation.

**The invariant**, replacing `tiles()`: every split's sizes are positive integers
summing to 1000, no split has fewer than two children, and no page appears
twice. `covers()` is that predicate, and every rewrite returns something
satisfying it.

**Normalization**, run after every rewrite: a split with one child collapses into
that child; a split with none disappears; a child split whose `dir` equals its
parent's is flattened into the parent, its sizes multiplied through.

### Two floors

- **Proportional** — a child may not be squeezed below half its equal share,
  `500/n` per-mille of its parent. At `n = 2` that is exactly "a maximum of half
  a row"; it generalizes to any depth without a new rule.
- **Absolute** — `--pane-min` in px, both axes. This is what makes "no pane cap,
  the minimum decides" answerable: `canOpen(tree, boardPx)` is a pure function of
  the tree and the board's measured size, and it is what stops the board
  subdividing forever.

The drag clamps at whichever floor is larger.

## The gestures

### Resize

Every internal boundary is a divider belonging to one split, between two adjacent
children. Dragging it moves that one boundary; the two children either side
change size and nothing else does.

### Annex — one rewrite, three of the stated behaviours

Past the floor, the drag stops being about the divider and becomes about the two
panes at the pointer. Let **G** be the leaf on the growing side under the
pointer and **V** the leaf on the shrinking side. G takes exactly `V ∩ (G's band
on the cross axis)`. If that is all of V, V leaves the board. If it is part, V
keeps the remainder and the tree reshapes around it.

Both G and V are **the leaf under the pointer**, never a subtree. That is what
keeps the rewrite unambiguous once splits nest: pushing one pane down against a
group of three takes the one you pushed into, and the other two re-proportion.
It also means no gesture can ever close more than one page. Each annex either
removes a leaf or shrinks V, so it terminates, and it ends the drag — one
gesture, one op.

- *"resize the left 1x1 up into the 1x2"* — G = B (x band 0–½), V = A (x band
  0–1). B takes A's left half; A keeps the right. → `col[B, row[A, C]]`: B full
  height on the left, A top-right, C bottom-right. Matches.
- *"resize the left 1x1 right into the other 1x1"* — G = B, V = C, same y band,
  so the overlap is all of C. → C's page leaves the board, `row[A, B]`. Matches.
- *"resize the 1x2 into a 1x1 in the same row"* — the same rewrite driven from
  the shrinking side. A's left edge sits on the board boundary, so this is
  discrete rather than continuous: any intermediate x would make B an L-shape,
  which no split tree can express. The edge yields the whole band up to the
  nearest divider in the adjacent region — x = ½, where B and C divide — and B
  annexes it. Same result as the first case, reached the other way. Matches.

### Hot zones

While a pane is being dragged by its grip:

- **Board edge** (a band hugging one of the four edges, spanning that whole
  side): the root becomes `split(perpendicular, [dragged, rest])`. When `rest`'s
  own direction equals the new root's it is **flipped**, not flattened — that is
  what "moving the 1x1 to the first row" means: `col[B, C]` becomes `row[B, C]`
  so B and C stack in the remaining column.
- **A pane's edge quadrant**: split that pane and insert the dragged one beside
  it.
- **A pane's centre**: swap the two pages. This is what a drag does today, and
  it stays the cheapest gesture.

Board-edge zones win over pane zones where they overlap.

### Open, close, move

- **Open** still splits whichever leaf has the most room, on its long axis.
  `canOpen` becomes `canOpen(tree, boardPx)` — true while the victim leaf is at
  least twice `--pane-min` on that axis.
- **Close** removes the leaf; its size goes to its siblings in that split, in
  proportion. This keeps the promise the old `filled()` made — the panes that
  stay keep the space they had, and nothing you were reading moves — with none
  of the axis-ordering machinery.
- **Reading order** is a depth-first walk. It is what the narrow layout stacks
  in, what "position n of m" counts, and what the keyboard's arrow keys step
  through.

## Storage and compatibility

The layout stays one `pref` op under `views.grid` — invariant 1, and the same
last-writer-wins register as today. The value becomes the tree, serialized as
plain JSON.

No op migration (invariant 7 is not engaged): a `pref` is a register, and
`grid.ts:318-339` already argues that the *reader* decides how much of a stored
value is usable. The new parser accepts, in order: a tree it can validate; a
legacy array of `{page, col, row, w, h}` or `{page, w, h}` or bare strings, which
it converts by recognising the five arrangements the 2×2 could hold; anything
else, laid out canonically by count. An older build reading a tree falls through
its own `Array.isArray` check to canonical, which is the documented behaviour and
not a regression.

`pref('views.grid.split')` — the dead key the removed dividers wrote, per
`BACKLOG.md:195-198` — stays dead. It is not read and not resurrected.

## Rendering: a flat DOM, not a nested one

The tree is nested. **The DOM is not.** `grid.ts` flattens the tree to absolute
rectangles in per-mille, and `Grid.tsx` renders one flat `<For>` of panes keyed
by page id, plus a flat `<For>` of dividers. Each pane carries its rectangle as
custom properties and is positioned from them.

**Why this and not nested flex**, which is the obvious answer. `layout.ts:59-71`
documents the bug that decided it: parsing allocates fresh objects, `<For>` keys
on identity, so a layout write rebuilt every pane and threw away what it held —
"an inspector that closed itself the moment you added a link with it". A resize
writes that pref on every drop, and an annex changes the tree's *shape*. Under
nested flex a shape change rebuilds the subtree's DOM no matter how carefully
it is keyed. Under a flat list keyed by page id, no pane node is ever destroyed
by any layout change at all — resize, annex, reorder or reorient. The pane keeps
its scroll position, its focus and its content through every gesture in this
request.

It also means arbitrary depth costs the renderer nothing: depth is a fact about
the model, and the DOM never sees it.

Continuous rectangles have no CSS-only source, so they arrive as custom
properties on each pane — which needs `CLAUDE.md:104`'s "no inline styles" rule
amended to name the exception, exactly as `BACKLOG.md:185-194` predicted it
would. The gutter is a half-gap inset on each pane rather than a flex `gap`.

The narrow layout drops absolute positioning entirely: panes become static
blocks in reading order and the dividers are not rendered, which is what the
stylesheet already does with `grid-area: auto` at `grid.css:317-319`.

## Accessibility

- Dividers are `role="separator"` with `aria-orientation` and `aria-valuenow`,
  focusable, arrow keys to move.
- `base.css:418-432` removed every focus indicator in the app on purpose, so a
  divider you can focus but not see would be a new hole. It reveals itself the
  way `.pane-grip` already does — on hover and focus, and only where a fine
  pointer exists — rather than growing a focus ring the rest of the app does not
  have.
- A held arrow must not write thirty ops a second (`BACKLOG.md:185-194`): the
  arrow moves a local preview and the op is written on key release, which is the
  same "one gesture, one op" rule the pointer drag already follows.
- Forced-colors twins for the divider, alongside the existing pane rules at
  `base.css:1176-1189`.

## Files

| File | What happens |
| --- | --- |
| `src/views/grid.ts` | Rewritten. Tree types, `covers()`, normalize, floors, resize, `annex`, open/close/swap, parse/serialize. |
| `src/views/zones.ts` | New. Pure geometry: a point plus the board's measured rects → a drag or resize intent. Kept out of `grid.ts` so the model stays arithmetic and the hit-testing stays testable. |
| `src/views/Grid.tsx` | Rewritten as a flat render over the tree's flattened rectangles. Keeps its name — `genericity.test.ts:47` requires it. |
| `src/views/grid.css` | Rewritten: absolute placement from custom properties, divider affordance, drop-zone overlay. |
| `src/views/layout.ts` | `Layout` keeps its shape; `panes` becomes `tree` plus a flattened `panes` for reading order, and `canOpen` takes the measured board. |
| `src/views/grid.test.ts` | Rewritten around `covers()` and the nine stated behaviours, plus property tests. |
| `src/styles/base.css` | `--pane-min`, a divider token, forced-colors twins beside the existing pane rules at `:1176-1189`. |
| `src/views/App.tsx` | The "grid is full" copy at `:55-59` becomes "no room for another pane" — the cap is now the minimum, not a count. |
| `e2e/grid.spec.ts`, `e2e/app.ts` | `span()`/`cell()` replaced by measured fractions; a new divider-drag persistence spec. |
| `CLAUDE.md`, `BACKLOG.md` | The inline-style exception; close the proportions item; note what the rework leaves owed. |

## Steps

One concern per commit, in an order where each is shippable:

1. **The tree, pure.** `grid.ts` rewritten with `covers()`, normalize, the two
   floors, open/close/swap, parse (including the legacy converter) and
   serialize. `grid.test.ts` rewritten alongside it. Nothing renders yet.
2. **Render it.** `Grid.tsx` flat over `rectsOf(tree)`, `grid.css` absolute
   placement, `layout.ts` rewired. No dividers — the board draws the tree and behaves exactly as it
   does today. e2e green at this point, with `span()`/`cell()` replaced.
3. **Dividers.** Pointer drag with the proportional and absolute floors, one op
   on release, `role="separator"` and the arrow keys with it. No annex yet: the
   drag simply clamps.
4. **Annex.** The one rewrite, plus the board-boundary edge gesture, plus the
   keyboard's path to it.
5. **Hot zones.** Board-edge and pane-quadrant drop zones with their overlay;
   centre-swap kept.
6. **The measured cap.** `canOpen(tree, boardPx)`, the nav copy, forced-colors
   twins, `--ring-carry` wired up or deleted.
7. **Docs.** `CLAUDE.md`, `BACKLOG.md`.

## Verification

- `bun run check` and `bun run test` after each step. `grid.test.ts` carries the
  weight: a property test asserting `covers()` survives random sequences of
  open/close/resize/annex/drop, and one named test per behaviour in the request.
- `bun run test:e2e` on both projects. `span()` and `cell()` are replaced by a
  helper reading each pane's box as a fraction of the grid's — deterministic,
  because sizes are integers. The surviving box assertions in "however many
  panes there are, they fill the grid" need no change.
- **New e2e, the persistence boundary CLAUDE.md asks for:** drag a divider,
  `settled()`, reload, the fraction is still there. And: drag past the floor,
  assert the pane count dropped by one and the arrangement is the stated one.
- **The cap test changes.** "The switches stop offering more than fits" asserts
  a count of four today; with the minimum deciding, five panes fit on a 1280px
  desktop and the nav never disables there. The test sets a viewport small
  enough for the refusal to be deterministic instead. On the narrow layout there
  is no geometry, so `canOpen` is always true and the nav never disables.
- Manually in the browser at `localhost:5173` (probe before starting a server),
  walking each of the nine behaviours in the request against the screenshots.

## Decisions taken, worth a second look

- **Per-mille, not whole percent.** You chose "quantised to 1%"; I would use
  per-mille for the same reason — integers, exact comparison, no float drift —
  because 1% is ~19px across the board and reads as a stutter under the pointer.
  It is one constant either way.
- **`CLAUDE.md:104` needs amending.** "No inline styles" becomes "no inline
  styles, except a custom property carrying a continuous value that comes from
  the store" — there is no CSS-only source for one, which `BACKLOG.md:185-194`
  already worked out.
- **A pane absorbed by a resize closes.** "The other 1x1 will disappear" reads
  as the page leaving the board and its nav switch going unlit, same as pressing
  close. It is undone by pressing the switch again, not by dragging back.
- **No keyboard path to the hot zones.** The pick-up-and-place gesture keeps
  meaning swap. Every restructuring the hot zones offer is also reachable by
  holding an arrow on a divider past its floor, so the keyboard loses nothing
  but a shortcut.

