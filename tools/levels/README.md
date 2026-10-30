# Map conversion configs

This folder holds a config for each level converted by `tools/map-to-level.ts` from an original map: the file `<MAP>.ts` (floor 0) or
`<MAP>-<floor>.ts` (other floors). A config holds everything that cannot be guessed from the map: name and music, entries, exit marks, frame
cropping, `blockers` (invisible wall cells), `skipItems` (furniture), `hull` (boundary along the hull), stairs and elevators (`extraObjects`).
Any level is re-converted with **a single command**, so when the converter gets better, all maps can be re-converted.

## One map

```
node tools/map-to-level.ts <MAP> <floor> --config tools/levels/<file>.ts > level.ts
```

Standard output gets the source of a single `LevelDef` constant (with a comment above it); stderr gets the analysis: critters, weapons, unknown
numbers (add them to `src/world/pids.ts`), what was carved out and what was dropped. Key reference: at the top of `tools/map-to-level.ts`.

## Comparison and re-conversion

```
node tools/levels/check.ts                  # all levels in the list: "matches" or how many lines differ
node tools/levels/check.ts HUBENT --show    # show the differing lines
node tools/levels/check.ts HUBENT --write   # write the new snapshot into the level file (only this constant is replaced)
```

The "config — map — floor — level file" list is in `check.ts` (`LEVELS`); the same list is below.

| Config | Command | Level | File |
|---|---|---|---|
| `VAULTENT` | `node tools/map-to-level.ts VAULTENT 0 --config tools/levels/VAULTENT.ts` | `vault15-entrance` | `vault15.ts` (by hand) |
| `VAULTBUR` | `node tools/map-to-level.ts VAULTBUR 0 --config tools/levels/VAULTBUR.ts` | `vault15-1` | `vault15.ts` |
| `VAULTBUR-1` | `node tools/map-to-level.ts VAULTBUR 1 --config tools/levels/VAULTBUR-1.ts` | `vault15-2` | `vault15.ts` |
| `VAULTBUR-2` | `node tools/map-to-level.ts VAULTBUR 2 --config tools/levels/VAULTBUR-2.ts` | `vault15-3` | `vault15.ts` |
| `SHADYE` | `node tools/map-to-level.ts SHADYE 0 --config tools/levels/SHADYE.ts` | `shady-sands-e` | `shady-sands.ts` (by hand) |
| `SHADYW` | `node tools/map-to-level.ts SHADYW 0 --config tools/levels/SHADYW.ts` | `shady-sands-w` | `shady-sands.ts` |
| `JUNKENT` | `node tools/map-to-level.ts JUNKENT 0 --config tools/levels/JUNKENT.ts` | `junktown-ent` | `junktown.ts` |
| `JUNKENT-1` | `node tools/map-to-level.ts JUNKENT 1 --config tools/levels/JUNKENT-1.ts` | `junktown-ent-2` | `junktown.ts` |
| `JUNKKILL` | `node tools/map-to-level.ts JUNKKILL 0 --config tools/levels/JUNKKILL.ts` | `junktown-center` | `junktown.ts` |
| `JUNKCSNO` | `node tools/map-to-level.ts JUNKCSNO 0 --config tools/levels/JUNKCSNO.ts` | `junktown-casino` | `junktown.ts` |
| `HUBENT` | `node tools/map-to-level.ts HUBENT 0 --config tools/levels/HUBENT.ts` | `hub-ent` | `hub.ts` |
| `HUBDWNTN` | `node tools/map-to-level.ts HUBDWNTN 0 --config tools/levels/HUBDWNTN.ts` | `hub-downtown` | `hub.ts` |
| `HUBDWNTN-1` | `node tools/map-to-level.ts HUBDWNTN 1 --config tools/levels/HUBDWNTN-1.ts` | `hub-downtown-2` | `hub.ts` |
| `HUBOLDTN` | `node tools/map-to-level.ts HUBOLDTN 0 --config tools/levels/HUBOLDTN.ts` | `hub-oldtown` | `hub.ts` |
| `HUBOLDTN-1` | `node tools/map-to-level.ts HUBOLDTN 1 --config tools/levels/HUBOLDTN-1.ts` | `hub-oldtown-2` | `hub.ts` |
| `HUBHEIGT` | `node tools/map-to-level.ts HUBHEIGT 0 --config tools/levels/HUBHEIGT.ts` | `hub-heights` | `hub.ts` |
| `HUBWATER` | `node tools/map-to-level.ts HUBWATER 0 --config tools/levels/HUBWATER.ts` | `hub-water` | `hub.ts` |
| `RAIDERS` | `node tools/map-to-level.ts RAIDERS 0 --config tools/levels/RAIDERS.ts` | `raiders` | `raiders.ts` |
| `RAIDERS-1` | `node tools/map-to-level.ts RAIDERS 1 --config tools/levels/RAIDERS-1.ts` | `raiders-arena` | `raiders.ts` |
| `HUBMIS1` | `node tools/map-to-level.ts HUBMIS1 0 --config tools/levels/HUBMIS1.ts` | `hub-mission` | `hub.ts` |
| `HOTEL-1` | `node tools/map-to-level.ts HOTEL 1 --config tools/levels/HOTEL-1.ts` | `necro-hotel` | `necropolis.ts` |
| `HOTEL` | `node tools/map-to-level.ts HOTEL 0 --config tools/levels/HOTEL.ts` | `necro-hotel-low` | `necropolis.ts` |
| `HALLDED-1` | `node tools/map-to-level.ts HALLDED 1 --config tools/levels/HALLDED-1.ts` | `necro-hall` | `necropolis.ts` |
| `HALLDED` | `node tools/map-to-level.ts HALLDED 0 --config tools/levels/HALLDED.ts` | `necro-hall-low` | `necropolis.ts` |
| `WATRSHD-1` | `node tools/map-to-level.ts WATRSHD 1 --config tools/levels/WATRSHD-1.ts` | `necro-water` | `necropolis.ts` |
| `WATRSHD` | `node tools/map-to-level.ts WATRSHD 0 --config tools/levels/WATRSHD.ts` | `necro-water-low` | `necropolis.ts` |
| `VAULT13` | `node tools/map-to-level.ts VAULT13 0 --config tools/levels/VAULT13.ts` | `vault13-1` | `vault13.ts` |
| `VAULT13-1` | `node tools/map-to-level.ts VAULT13 1 --config tools/levels/VAULT13-1.ts` | `vault13-2` | `vault13.ts` |
| `VAULT13-2` | `node tools/map-to-level.ts VAULT13 2 --config tools/levels/VAULT13-2.ts` | `vault13-3` | `vault13.ts` |
| `VAULTNEC` | `node tools/map-to-level.ts VAULTNEC 0 --config tools/levels/VAULTNEC.ts` | `vault12-1` | `vault12.ts` |
| `VAULTNEC-1` | `node tools/map-to-level.ts VAULTNEC 1 --config tools/levels/VAULTNEC-1.ts` | `vault12-2` | `vault12.ts` |
| `VAULTNEC-2` | `node tools/map-to-level.ts VAULTNEC 2 --config tools/levels/VAULTNEC-2.ts` | `vault12-3` | `vault12.ts` |
| `BROHDENT` | `node tools/map-to-level.ts BROHDENT 0 --config tools/levels/BROHDENT.ts` | `brotherhood-ent` | `brotherhood.ts` |
| `BROHD12` | `node tools/map-to-level.ts BROHD12 0 --config tools/levels/BROHD12.ts` | `brotherhood-1` | `brotherhood.ts` |
| `BROHD12-1` | `node tools/map-to-level.ts BROHD12 1 --config tools/levels/BROHD12-1.ts` | `brotherhood-2` | `brotherhood.ts` |
| `BROHD34` | `node tools/map-to-level.ts BROHD34 0 --config tools/levels/BROHD34.ts` | `brotherhood-3` | `brotherhood.ts` |
| `BROHD34-1` | `node tools/map-to-level.ts BROHD34 1 --config tools/levels/BROHD34-1.ts` | `brotherhood-4` | `brotherhood.ts` |
| `GLOWENT` | `node tools/map-to-level.ts GLOWENT 0 --config tools/levels/GLOWENT.ts` | `glow-ent` | `glow.ts` |
| `GLOW1` | `node tools/map-to-level.ts GLOW1 0 --config tools/levels/GLOW1.ts` | `glow-1` | `glow.ts` |
| `GLOW1-1` | `node tools/map-to-level.ts GLOW1 1 --config tools/levels/GLOW1-1.ts` | `glow-2` | `glow.ts` |
| `GLOW1-2` | `node tools/map-to-level.ts GLOW1 2 --config tools/levels/GLOW1-2.ts` | `glow-3` | `glow.ts` |
| `GLOW2` | `node tools/map-to-level.ts GLOW2 0 --config tools/levels/GLOW2.ts` | `glow-4` | `glow.ts` |
| `GLOW2-1` | `node tools/map-to-level.ts GLOW2 1 --config tools/levels/GLOW2-1.ts` | `glow-5` | `glow.ts` |
| `GLOW2-2` | `node tools/map-to-level.ts GLOW2 2 --config tools/levels/GLOW2-2.ts` | `glow-6` | `glow.ts` |
| `LAADYTUM` | `node tools/map-to-level.ts LAADYTUM 0 --config tools/levels/LAADYTUM.ts` | `boneyard-adytum` | `boneyard.ts` |
| `LAADYTUM-1` | `node tools/map-to-level.ts LAADYTUM 1 --config tools/levels/LAADYTUM-1.ts` | `boneyard-adytum-2` | `boneyard.ts` |
| `LABLADES` | `node tools/map-to-level.ts LABLADES 0 --config tools/levels/LABLADES.ts` | `boneyard-blades` | `boneyard.ts` |
| `LARIPPER` | `node tools/map-to-level.ts LARIPPER 0 --config tools/levels/LARIPPER.ts` | `boneyard-rippers` | `boneyard.ts` |
| `LARIPPER-1` | `node tools/map-to-level.ts LARIPPER 1 --config tools/levels/LARIPPER-1.ts` | `boneyard-rippers-2` | `boneyard.ts` |
| `LARIPPER-2` | `node tools/map-to-level.ts LARIPPER 2 --config tools/levels/LARIPPER-2.ts` | `boneyard-rippers-3` | `boneyard.ts` |
| `LAGUNRUN` | `node tools/map-to-level.ts LAGUNRUN 0 --config tools/levels/LAGUNRUN.ts` | `boneyard-gunrunners` | `boneyard.ts` |
| `LAFOLLWR` | `node tools/map-to-level.ts LAFOLLWR 0 --config tools/levels/LAFOLLWR.ts` | `boneyard-followers` | `boneyard.ts` |
| `LAFOLLWR-1` | `node tools/map-to-level.ts LAFOLLWR 1 --config tools/levels/LAFOLLWR-1.ts` | `boneyard-followers-2` | `boneyard.ts` |
| `DETHCLAW` | `node tools/map-to-level.ts DETHCLAW 0 --config tools/levels/DETHCLAW.ts` | `boneyard-deathclaw` | `boneyard.ts` |
| `MBENT` | `node tools/map-to-level.ts MBENT 0 --config tools/levels/MBENT.ts` | `mbase-ent` | `mbase.ts` |
| `MBSTRG12` | `node tools/map-to-level.ts MBSTRG12 0 --config tools/levels/MBSTRG12.ts` | `mbase-1` | `mbase.ts` |
| `MBSTRG12-1` | `node tools/map-to-level.ts MBSTRG12 1 --config tools/levels/MBSTRG12-1.ts` | `mbase-2` | `mbase.ts` |
| `MBVATS12` | `node tools/map-to-level.ts MBVATS12 0 --config tools/levels/MBVATS12.ts` | `mbase-3` | `mbase.ts` |
| `MBVATS12-1` | `node tools/map-to-level.ts MBVATS12 1 --config tools/levels/MBVATS12-1.ts` | `mbase-4` | `mbase.ts` |
| `CHILDRN1` | `node tools/map-to-level.ts CHILDRN1 0 --config tools/levels/CHILDRN1.ts` | `cathedral-ent` | `cathedral.ts` |
| `CHILDRN1-1` | `node tools/map-to-level.ts CHILDRN1 1 --config tools/levels/CHILDRN1-1.ts` | `cathedral-1` | `cathedral.ts` |
| `CHILDRN2` | `node tools/map-to-level.ts CHILDRN2 0 --config tools/levels/CHILDRN2.ts` | `cathedral-tower-1` | `cathedral.ts` |
| `CHILDRN2-1` | `node tools/map-to-level.ts CHILDRN2 1 --config tools/levels/CHILDRN2-1.ts` | `cathedral-tower-2` | `cathedral.ts` |
| `CHILDRN2-2` | `node tools/map-to-level.ts CHILDRN2 2 --config tools/levels/CHILDRN2-2.ts` | `cathedral-tower-3` | `cathedral.ts` |
| `MSTRLR12` | `node tools/map-to-level.ts MSTRLR12 0 --config tools/levels/MSTRLR12.ts` | `master-1` | `cathedral.ts` |
| `MSTRLR12-1` | `node tools/map-to-level.ts MSTRLR12 1 --config tools/levels/MSTRLR12-1.ts` | `master-2` | `cathedral.ts` |
| `MSTRLR34` | `node tools/map-to-level.ts MSTRLR34 0 --config tools/levels/MSTRLR34.ts` | `master-3` | `cathedral.ts` |
| `MSTRLR34-1` | `node tools/map-to-level.ts MSTRLR34 1 --config tools/levels/MSTRLR34-1.ts` | `master-4` | `cathedral.ts` |
| `CAVES` | `node tools/map-to-level.ts CAVES 0 --config tools/levels/CAVES.ts` | `shady-caves` | `shady-caves.ts` |
| `V13ENT` | `node tools/map-to-level.ts V13ENT 0 --config tools/levels/V13ENT.ts` (finished by hand: vault door) | `cave` | `cave.ts` |
| `DESCRVN1` | `node tools/map-to-level.ts DESCRVN1 0 --config tools/levels/DESCRVN1.ts` | `caravan-desert-1` | `encounters.ts` |
| `DESCRVN2` | `node tools/map-to-level.ts DESCRVN2 0 --config tools/levels/DESCRVN2.ts` | `caravan-desert-2` | `encounters.ts` |
| `DESCRVN3` | `node tools/map-to-level.ts DESCRVN3 0 --config tools/levels/DESCRVN3.ts` | `caravan-desert-3` | `encounters.ts` |
| `DESCRVN4` | `node tools/map-to-level.ts DESCRVN4 0 --config tools/levels/DESCRVN4.ts` | `caravan-desert-4` | `encounters.ts` |
| `MNTCRVN1` | `node tools/map-to-level.ts MNTCRVN1 0 --config tools/levels/MNTCRVN1.ts` | `caravan-mountain-1` | `encounters.ts` |
| `MNTCRVN2` | `node tools/map-to-level.ts MNTCRVN2 0 --config tools/levels/MNTCRVN2.ts` | `caravan-mountain-2` | `encounters.ts` |
| `MNTCRVN3` | `node tools/map-to-level.ts MNTCRVN3 0 --config tools/levels/MNTCRVN3.ts` | `caravan-mountain-3` | `encounters.ts` |
| `MNTCRVN4` | `node tools/map-to-level.ts MNTCRVN4 0 --config tools/levels/MNTCRVN4.ts` | `caravan-mountain-4` | `encounters.ts` |

"By hand": in the repository the level is finished by hand (a small clearing with a shack at the Vault 15 entrance; the east of Shady Sands
with rock outside the village). Its config produces the whole original map, so the comparison shows differences; this is expected, leave the level file alone.

## The cave by Vault 13 and Vault 13

Made differently (not by the converter), so they have no configs here.

## As in the original: floor, roofs, openings, posts

Reference: `SHADYW.ts` and `SHADYE.ts` (Shady Sands, 2026-10-24). Config keys:

- `paint: true`: floor following the original's tiles: a cell whose tile is of a different kind than the level floor gets its own texture
  (`LevelDef.paint`: letters a–z and a legend). Which texture goes with which tile: `floor-rules.ts` (`FLOOR_RULES`; it also has
  `WALL_RULES` for `tools/map-to-location.ts`).
- `roofs: true` (or a texture name, `adobeRoof` by default): roofs: wherever the original's roof layer has a non-empty tile,
  `roof.rows` gets a `#`; in the game this is a second storey of full blocks (above a wall, a two-storey wall; above floor, a
  ceiling), in the location editor, ordinary second-storey blocks. The original's roof layer does not cover some walls, so the roof
  is completed per house: a room (floor that cannot be reached from the entries without passing a door, opening or window) is fully under a roof
  if the original roof covers at least half of its cells; doors, openings, walls and windows next to such floor are too;
  a yard with a gate gets no roof. stderr shows a "roofs: …" line (entries, rooms and their coverage).
- `doorways: true`: doorless openings: a wall cell in which only some hexes are occupied and both sides along the wall line
  are free is opened (the list is in stderr, "Doorless openings"). Neighbouring cells that became wall only from merging pieces
  (`--link`) are opened together with the opening. A fence whose line zigzags along the border of two cells (the Shady Sands yard)
  does not open this way: its gate is set by hand via `patches` (draft cells → `'.'`); to see which hexes of the cells are occupied, use the
  `--masks x0,y0,x1,y1` key (draft).
- `posts: { art, texture, height }`: fence posts: wall cells with wall pieces whose image matches `art`
  become `towers` of height `height` with their own texture.
- `windows: { art, texture }`: round windows: a wall cell with a wall piece matching the image `art` (in Shady Sands, `adb1011`,
  the wheel window) becomes floor in the grid, and in `columns` a column `{ texture, window: 'round' }`: in the game this is a full-storey
  block with texture `texture` and a round hole in it (you can see through it but not pass); in the editor, the "Round window" block.
- Pen gates (the original's `gate.frm`) are a door with the `woodGate` texture; in the game such a door is a waist-high wicket in the fence row
  (`Door.gate`, a leaf made of blocks in `scene.ts`); the converter needs nothing for this.
- `carve: false`: do not carve passages to unreachable items: once `doorways` has opened the openings, carving would break through
  the yard wall (a wall "costs more" than floor, but the path through it is still shorter). What remains unreachable is in stderr.
- `revision: N`: layout revision number: a save with the old layout forgets this location's state and puts
  the hero at the entrance.
- `doorLooks: { grayDoor: 'chromeDoor' }`: replacement for the door textures that the converter picks from the original's image
  (Vault 13: chrome doors instead of grey ones); `doorTexture` is the texture for doors without one of their own.
- `wallArts: [[/^(ybk|ylf)/i, 'T'], …]`: wall letter by the image of the wall piece in the cell (first match, otherwise `#`);
  the letter's texture is in `walls`. Khans camp: tents are `T` → `canvas`, the house's brick base is `B` → `oldBrick`.
- `roofSkip: /^yrf/i`: original roof tiles with these names are not counted as roof (tents: otherwise two storeys).
- The converter does not take fences (`fen*` in the original's walls) into the walls: they are placed during the game as a see-through fence
  (`wallDecor` `fence` in `src/world/map-scripts.ts`, `fenceBlock` in `src/game/blocks.ts`).

Compare with the original without running it: `node tools/map-picture.ts SHADYW [floor] [--roofs] [--scale 0.5] [--region tx0,ty0,tx1,ty1]`
→ `docs/img/pic-<NAME>-<floor>[-roofs].png` (an oblique view with the real images; the folder exists only on this computer).

## New level

1. Put `<MAP>.ts` here (use any neighbouring one as a template), run the command from the table and check stderr: what was dropped,
   which numbers are unknown, what cannot be reached.
2. Add a line to `LEVELS` in `check.ts` and to the table above.
3. Assemble the level file from the output (file header: a comment and imports of `FACING`, `LevelDef`, `PID`), register it in
   `src/world/levels/index.ts`, add an entrance from the wasteland to `PLACE_ENTRANCES` (`src/world/wasteland.ts`).
4. `node tools/map-scripts.ts` (the map script table); then `npx tsc --noEmit`, `npx vitest run`.

Where to put the hero. The original map scripts pick the starting cell by the entrance number (the second parameter of `load_map`), not by the cell in the
map header: `node tools/load-map-calls.ts` writes `docs/data/load-map.md`, listing who calls `load_map` and each map's starting cell
by entrance number (cell = y × 200 + x). The entrance from the wasteland and the arrival points of stairs and elevators come from there.

Location config drafts: `node tools/levels/gen.ts spec.json [--dry]` finds exits, arrival points, stairs and doors with
scripts (`move_to`, `load_map`) on the location's maps and writes `<MAP>[-floor].ts` (existing ones only with `--force`). The spec holds `worldKey`, `music`, `links`
(transitions via `load_map`: script, from, to, `arriveTile`) and `levels` (map, elevation, id, constant, names, description). Then
the configs are finished by hand (elevators, `hull`, `seeds`, `entrances`).
