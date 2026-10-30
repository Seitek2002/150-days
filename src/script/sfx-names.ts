// Sound file names by Fallout's rules (sfx_build_* in scripts): letters and order as in the original;
// the sounds themselves live in SOUND\SFX of the player's copy. Rules from fallout1-ce (gsound.cc, art.cc): only the name layout, the code is ours.
// The same rules are already used by `weaponSfx` and `doorSfx` in resources.ts for weapons and doors.

/** Critter animation numbers (as in the original). */
export const ANIM = {
  dodge: 13,
  throwPunch: 16,
  kickLeg: 17,
  throwAnim: 18,
  fallBack: 20,
  fallFront: 21,
  proneToStanding: 36,
  backToStanding: 37,
  takeOut: 38,
  fireContinuous: 47,
  fallBackSf: 48,
  calledShotPic: 64,
} as const;

/** Which character sound is needed on falling and hits (CHARACTER_SOUND_EFFECT). */
export const CHARACTER_SOUND = { unused: 0, knockdown: 1, passOut: 2, die: 3, contact: 4 } as const;

/** Weapon sound kinds (WEAPON_SOUND_EFFECT): ready, attack, out of ammo, firing, hit. */
const WEAPON_EFFECT_LETTERS = ['R', 'A', 'O', 'F', 'H'];
const WEAPON_EFFECT = { ready: 0, outOfAmmo: 2, hit: 4 } as const;

/** Hit modes (HIT_MODE): the weapon's primary mode in the left/right hand and a punch give variant "1", the rest "2". */
const PRIMARY_HIT_MODES = new Set([0, 2, 4]);

/** Materials (MATERIAL_TYPE): the hit sound depends on them. */
const MATERIAL = { glass: 0, metal: 1, plastic: 2, wood: 3, dirt: 4, stone: 5, cement: 6 } as const;

/** Damage types (DAMAGE_TYPE): explosion, plasma and EMP hit sounds have no material. */
const DAMAGE = { plasma: 3, emp: 5, explosion: 6 } as const;

/** Scenery actions (SCENERY_SOUND_EFFECT): open, close, locked, unlocked, use. */
const SCENERY_ACTION_LETTERS = ['O', 'C', 'L', 'N', 'U'];

/** How many weapon kinds animations distinguish: 0 — unarmed, 1 — knife … 10 — rocket launcher. */
const WEAPON_ANIMATIONS = 11;

/** String by the "%6s" rule: shorter ones are padded with spaces on the left (as the original does), all uppercase. */
const pad = (text: string, width: number) => text.toUpperCase().padStart(width, ' ');

/** Ambient sound: "A", six characters of the name, "1". */
export function ambientSfxName(base: string): string {
  return `A${pad(base, 6)}1`;
}

/** Interface sound (items use the same rule): "N", six characters of the name, "1". */
export function interfaceSfxName(base: string): string {
  return `N${pad(base, 6)}1`;
}

/** Animation letters: [weapon letter, action letter], or null if there is no such animation with this weapon (art_get_code). */
export function animationLetters(animation: number, weaponType: number): [string, string] | null {
  if (weaponType < 0 || weaponType >= WEAPON_ANIMATIONS) return null;
  const letter = (code: string, offset: number) => String.fromCharCode(code.charCodeAt(0) + offset);
  if (animation >= ANIM.takeOut && animation <= ANIM.fireContinuous) {
    if (weaponType === 0) return null;
    return [letter('d', weaponType - 1), letter('c', animation - ANIM.takeOut)];
  }
  if (animation === ANIM.proneToStanding) return ['c', 'h'];
  if (animation === ANIM.backToStanding) return ['c', 'j'];
  if (animation === ANIM.calledShotPic) return ['n', 'a'];
  if (animation >= ANIM.fallBackSf) return ['r', letter('a', animation - ANIM.fallBackSf)];
  if (animation >= ANIM.fallBack) return ['b', letter('a', animation - ANIM.fallBack)];
  if (animation === ANIM.throwAnim) {
    if (weaponType === 1) return ['d', 'm'];
    if (weaponType === 4) return ['g', 'm'];
    return ['a', 's'];
  }
  if (animation === ANIM.dodge) return weaponType <= 0 ? ['n', 'a'] : [letter('d', weaponType - 1), 'e'];
  const action = letter('a', animation);
  return animation <= 1 && weaponType > 0 ? [letter('d', weaponType - 1), action] : ['a', action];
}

/**
 * Critter sound: art name ("HMWARR"), weapon letter and action letter. weaponCode is the weapon in the critter's hands
 * (0 — none); for "draw weapon" it is taken from `extra`. No art name or no such animation — empty string.
 */
export function characterSfxName(base: string | undefined, animation: number, weaponCode: number, extra: number): string {
  if (!base) return '';
  const letters = animationLetters(animation, animation === ANIM.takeOut ? extra : weaponCode);
  if (!letters) return '';
  let [first, second] = letters;
  if (animation === ANIM.fallFront || animation === ANIM.fallBack) {
    if (extra === CHARACTER_SOUND.passOut) first = 'Y';
    else if (extra === CHARACTER_SOUND.die) first = 'Z';
  } else if ((animation === ANIM.throwPunch || animation === ANIM.kickLeg) && extra === CHARACTER_SOUND.contact) {
    first = 'Z';
  }
  return `${base}${first}${second}`.toUpperCase();
}

/** What we need to know about the weapon and target to name a weapon sound. */
export interface WeaponSfxInfo {
  /** Sound code of the weapon itself (the 10mm pistol has "A"). */
  soundCode: string;
  /** Weapon damage type (DAMAGE_TYPE). */
  damageType: number;
  /** Target material (MATERIAL_TYPE); −1 — the target has no material, null — no target at all. */
  targetMaterial: number | null;
}

/** Weapon sound: "W", sound kind, weapon code, variant (1/2), target material ("X" if none), "XX", "1". */
export function weaponSfxName(effect: number, hitMode: number, info: WeaponSfxInfo): string {
  const effectCode = WEAPON_EFFECT_LETTERS[effect] ?? 'X';
  const variant = effect !== WEAPON_EFFECT.ready && effect !== WEAPON_EFFECT.outOfAmmo && !PRIMARY_HIT_MODES.has(hitMode) ? 2 : 1;
  let material = 'X';
  const damageWithoutMaterial: number[] = [DAMAGE.explosion, DAMAGE.plasma, DAMAGE.emp];
  const noMaterial = effect !== WEAPON_EFFECT.hit || info.targetMaterial === null || damageWithoutMaterial.includes(info.damageType);
  if (!noMaterial) {
    switch (info.targetMaterial) {
      case MATERIAL.glass:
      case MATERIAL.metal:
      case MATERIAL.plastic:
        material = 'M';
        break;
      case MATERIAL.wood:
        material = 'W';
        break;
      case MATERIAL.dirt:
      case MATERIAL.stone:
      case MATERIAL.cement:
        material = 'S';
        break;
      default:
        material = 'F';
    }
  }
  return `W${effectCode}${info.soundCode}${variant}${material}XX1`.toUpperCase();
}

/** Scenery sound: "S", "P" (passive) or "A" (active), action letter, four characters of the name, "1". */
export function scenerySfxName(passive: boolean, action: number, base: string): string {
  return `S${passive ? 'P' : 'A'}${SCENERY_ACTION_LETTERS[action] ?? 'X'}${pad(base, 4)}1`;
}

/** Open sound: for a door "S?DOORS?" (action letter, door sound letter), for a container "I?CNTNR?". */
export function openSfxName(isItem: boolean, action: number, soundCode: string): string {
  const letter = SCENERY_ACTION_LETTERS[action] ?? 'X';
  return (isItem ? `I${letter}CNTNR${soundCode}` : `S${letter}DOORS${soundCode}`).toUpperCase();
}
