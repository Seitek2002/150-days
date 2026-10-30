// Skilldex (U), as in Fallout: use a skill on whatever is in front of the hero: lockpick, steal, traps, first aid,
// doctor, science, repair. The skill name comes from SKILL.MSG in the player's copy, its value from the hero. The window has a fixed size;
// digits 1–7 choose a skill, Esc or U closes.
import { parseMsg } from '../formats/text.ts';
import { t } from '../i18n.ts';
import { platform } from '../platform.ts';
import { SKILL, skillLevel, type Character } from './character.ts';

/** Skilldex skills: the same as in the original. */
export const SKILLDEX = [SKILL.lockpick, SKILL.steal, SKILL.traps, SKILL.firstAid, SKILL.doctor, SKILL.science, SKILL.repair] as const;

let namesPending: Promise<ReadonlyMap<number, string>> | null = null;
/** SKILL.MSG lines from the player's copy; the skill name is under number 100 + skill (skillTitle). No file means empty. */
export const loadSkillNames = (): Promise<ReadonlyMap<number, string>> => loadNames();
export const skillTitle = (names: ReadonlyMap<number, string>, skill: number): string => names.get(100 + skill) ?? '';
const loadNames = () =>
  (namesPending ??= platform
    .readGameFile('TEXT\\ENGLISH\\GAME\\SKILL.MSG')
    .then(parseMsg)
    .catch(() => new Map<number, string>()));

export class Skilldex {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private pick: ((skill: number) => void) | null = null;
  private character: Character | null = null;
  private names: ReadonlyMap<number, string> = new Map();
  private readonly keys = (e: KeyboardEvent) => {
    const digit = /^Digit([1-7])$/.exec(e.code);
    if (!digit || !this.isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    const skill = SKILLDEX[Number(digit[1]) - 1];
    if (skill !== undefined) this.choose(skill);
  };

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'pause skilldex';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.card = document.createElement('div');
    this.card.className = 'pause-card skilldex-card';
    this.host.append(this.card);
    parent.append(this.host);
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  /** Show the hero's skills; a choice calls pick (the window closes first). */
  open(character: Character, target: string, pick: (skill: number) => void): void {
    this.character = character;
    this.pick = pick;
    this.host.hidden = false;
    window.addEventListener('keydown', this.keys, true);
    this.render(target);
    void loadNames().then((names) => {
      this.names = names;
      if (this.isOpen) this.render(target);
    });
  }

  close(): void {
    this.host.hidden = true;
    this.pick = null;
    window.removeEventListener('keydown', this.keys, true);
  }

  private choose(skill: number): void {
    const pick = this.pick;
    this.host.dispatchEvent(new CustomEvent('skilldex-close', { bubbles: true }));
    pick?.(skill);
  }

  /** Subscribe to the window closing (the caller needs to give the game back). */
  onClose(handler: () => void): void {
    this.host.addEventListener('skilldex-close', handler);
  }

  private render(target: string): void {
    const c = this.character;
    if (!c) return;
    this.card.replaceChildren();
    const title = document.createElement('h2');
    title.className = 'panel-title skilldex-title';
    title.textContent = t('skilldexTitle');
    const sub = document.createElement('p');
    sub.className = 'skilldex-target';
    sub.textContent = target;
    const list = document.createElement('div');
    list.className = 'pause-buttons';
    SKILLDEX.forEach((skill, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-button skilldex-skill';
      const name = document.createElement('span');
      name.textContent = `${i + 1}. ${skillTitle(this.names, skill) || skill}`;
      const value = document.createElement('span');
      value.textContent = `${skillLevel(c, skill)}%`;
      b.append(name, value);
      b.addEventListener('click', () => this.choose(skill));
      list.append(b);
    });
    this.card.append(title, sub, list);
    list.querySelector<HTMLButtonElement>('button')?.focus();
  }
}
