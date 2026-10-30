// Location NPCs for the location editor: who is important (a marker: can be moved, cannot be removed), who is an enemy (placed,
// moved and removed like blocks) and who is a crowd extra (stands at random near their spot, once per game).
// Rule (Opus decision, 2026-10-23, following the client's intent):
// - important: one with a rare script (at most two critters in the whole game: merchants, doctors, companions, quest givers),
//   guards (guard scripts), an enemy with a script for only one map (the radscorpions from the Shady Sands quest)
//   and a peaceful one with a script but a rare prototype (at most two in the whole game), a named NPC with a shared script:
//   Nicole, Sheriff Greene, the Brotherhood elders (2026-10-24). The prototype's "barters" flag does not work: even plain
//   peasants have it (166 prototypes), while trading (gdialog_barter) exists only in important NPCs' scripts;
// - enemy: hostile from the first meeting (critter) or with a shared script of raiders, mutants, rats and so on;
// - crowd: everyone else: ghouls, brahmin, vault dwellers, children, Blades. In the game they stand at their spot, as in the original
//   (client, 2026-10-25): only those led by their scripts walk, plus animals (roams).
import { parseLevelDef, type LevelDef, type ObjectDef } from './defs.ts';
import { LEVELS } from './levels/index.ts';

export type PersonRole = 'important' | 'enemy' | 'crowd';

/** A level's NPC or enemy (from the object list). */
export type PersonDef = Extract<ObjectDef, { kind: 'npc' | 'critter' }>;

/** Shared enemy scripts: raiders, mutants, Children of the Night, rats, deathclaws, the Cathedral's master, thugs. */
const ENEMY_SCRIPTS = new Set(['WANRATS', 'GENRAIDR', 'FARMRAID', 'HOTGHOUL', 'BROINVAD', 'FOLINVAD', 'GENSUPR', 'GENMUTAN', 'CHIDNITE', 'MONSTER', 'EGGCLAW', 'THUG']);
/** Guards: at gates, in corridors, the Hub police. */
const GUARD_SCRIPT = /GRD|GUARD|GENCOP/;
/** A rare script: no more than this many critters in the whole game. */
const RARE = 2;

/**
 * How many critters have each script in the whole game and on how many maps, and how many have each prototype, across the game levels
 * (computed once).
 */
let census: { scripts: Map<string, { count: number; maps: Set<string> }>; pids: Map<number, number> } | null = null;
const peopleCensus = () => {
  if (census) return census;
  census = { scripts: new Map(), pids: new Map() };
  for (const def of Object.values(LEVELS)) {
    for (const o of parseLevelDef(def).objects) {
      if (o.kind !== 'npc' && o.kind !== 'critter') continue;
      census.pids.set(o.pid, (census.pids.get(o.pid) ?? 0) + 1);
      if (!o.script) continue;
      const row = census.scripts.get(o.script) ?? { count: 0, maps: new Set<string>() };
      row.count++;
      row.maps.add(def.original ?? def.id);
      census.scripts.set(o.script, row);
    }
  }
  return census;
};

export const isPerson = (o: ObjectDef): o is PersonDef => o.kind === 'npc' || o.kind === 'critter';

/** What this NPC is for the editor. */
export function personRole(o: PersonDef): PersonRole {
  const script = o.script;
  const enemy = o.kind === 'critter' || (!!script && ENEMY_SCRIPTS.has(script));
  if (script) {
    const row = peopleCensus().scripts.get(script);
    if (row && row.count <= RARE) return 'important';
    if (enemy && o.kind === 'critter' && row && row.maps.size === 1) return 'important';
    if (!enemy && GUARD_SCRIPT.test(script)) return 'important';
    if (!enemy && (peopleCensus().pids.get(o.pid) ?? 0) <= RARE) return 'important';
  }
  return enemy ? 'enemy' : 'crowd';
}

/** A level NPC with a role and key (for an important one, "script#index" among the level's NPCs with the same script). */
export interface LevelPerson {
  def: PersonDef;
  /** Index in the level's object list (parseLevelDef). */
  index: number;
  role: PersonRole;
  key: string;
}

/**
 * Whether the NPC wanders around their spot on their own. Previously the whole crowd of location variants wandered (except the Brotherhood of Steel); in the original
 * NPCs stand where they are placed, and only those led by their scripts walk (the bartender behind the counter, patrols), and the same here
 * (client, 2026-10-25: "the ones that should stand still keep wandering off somewhere").
 */
export function roams(_p: { def: PersonDef; role: PersonRole }): boolean {
  return false;
}

/** Level NPCs in object order. The key does not depend on how the level is rebuilt: script and index in order. */
export function levelPeople(def: LevelDef): LevelPerson[] {
  const seen = new Map<string, number>();
  const people: LevelPerson[] = [];
  parseLevelDef(def).objects.forEach((o, index) => {
    if (!isPerson(o)) return;
    const name = o.script ?? `#${o.pid}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    people.push({ def: o, index, role: personRole(o), key: `${name}#${n}` });
  });
  return people;
}

/** An enemy in the editor: cell (center), prototype, weapon; level enemies also have their script and kind (npc). */
export interface EnemyMark {
  x: number;
  y: number;
  pid: number;
  weapon?: number;
  facing?: number;
  script?: string;
  /** Peaceful until provoked (raiders in their camp); absent means hostile at once. */
  npc?: boolean;
}

export const enemyMark = (o: PersonDef): EnemyMark => ({
  x: o.x,
  y: o.y,
  pid: o.pid,
  ...(o.weapon ? { weapon: o.weapon } : {}),
  ...(o.facing !== undefined ? { facing: o.facing } : {}),
  ...(o.script ? { script: o.script } : {}),
  ...(o.kind === 'npc' ? { npc: true } : {}),
});

/** An enemy script can be taken from a foreign file only from this list (or if such an enemy exists in the level). */
export const enemyScriptAllowed = (script: string, base: LevelDef): boolean =>
  ENEMY_SCRIPTS.has(script) || levelPeople(base).some((p) => p.role === 'enemy' && p.def.script === script);

/** Enemy types for the editor: prototypes and weapons, all those that enemies have in the game. */
export function enemyKinds(): { pid: number; weapon: number }[] {
  const kinds = new Map<string, { pid: number; weapon: number }>();
  for (const def of Object.values(LEVELS))
    for (const p of levelPeople(def)) if (p.role === 'enemy') kinds.set(`${p.def.pid}/${p.def.weapon ?? 0}`, { pid: p.def.pid, weapon: p.def.weapon ?? 0 });
  return [...kinds.values()];
}
