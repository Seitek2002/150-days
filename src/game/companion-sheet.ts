// The companion's skills window (client, 2026-10-26): level and experience, health, armor, weapon and seven skills you can
// put points into (companion.ts → COMPANION_SKILLS). Like the hero's window (character-sheet.ts): fixed size, points put in now
// can be taken back with "−" while the window is open; "Decide yourself" — the companion distributes the points himself. Skill names and descriptions are from
// the player's copy's SKILL.MSG.
import { parseMsg } from '../formats/text.ts';
import { t, tf } from '../i18n.ts';
import { platform } from '../platform.ts';
import { experienceToNextLevel, SKILL_MAX } from './character.ts';
import { autoSpend, companionSkill, refundCompanionPoint, spendCompanionPoint, type CompanionProgress } from './companion.ts';
import type { Fighter } from './fighter.ts';
import type { WeaponData } from '../formats/pro.ts';

/** What to show about the companion besides skills. */
export interface CompanionInfo {
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  weapon: string;
  armor: string;
  /** Weapon in hand — for "Decide yourself" (points go into its skill). */
  gun?: WeaponData;
  /** Which skills grow (companion.ts → skillsFor): the dog has only "Unarmed". */
  skills: readonly number[];
}

let skillTexts: Promise<ReadonlyMap<number, string>> | null = null;
const loadSkillTexts = (): Promise<ReadonlyMap<number, string>> =>
  (skillTexts ??= platform
    .readGameFile('TEXT\\ENGLISH\\GAME\\SKILL.MSG')
    .then(parseMsg)
    .catch(() => new Map<number, string>()));

export class CompanionSheet {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private progress: CompanionProgress | null = null;
  private base: Fighter | null = null;
  private info: CompanionInfo | null = null;
  private floor: readonly number[] = [];
  private texts: ReadonlyMap<number, string> = new Map();
  private note = '';

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'pause sheet';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.card = document.createElement('div');
    this.card.className = 'pause-card sheet-card';
    this.host.append(this.card);
    parent.append(this.host);
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  open(progress: CompanionProgress, base: Fighter, info: CompanionInfo): void {
    this.progress = progress;
    this.base = base;
    this.info = info;
    this.floor = [...progress.skills];
    this.note = '';
    this.host.hidden = false;
    this.render();
    this.card.querySelector<HTMLButtonElement>('.sheet-done')?.focus();
    void loadSkillTexts().then((texts) => {
      this.texts = texts;
      if (this.isOpen) this.render();
    });
  }

  /** Close: the points put in stay with the companion (they have already been recorded in his growth). */
  close(): void {
    this.host.hidden = true;
    this.progress = null;
    this.base = null;
    this.info = null;
  }

  private render(): void {
    const p = this.progress;
    const base = this.base;
    const info = this.info;
    if (!p || !base || !info) return;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const button = (text: string, label: string, enabled: boolean, onClick: () => void) => {
      const b = el('button', 'sheet-step', text);
      b.type = 'button';
      b.disabled = !enabled;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        onClick();
        this.render();
      });
      return b;
    };
    const keepFocus = document.activeElement?.getAttribute('data-focus') ?? null;
    this.card.replaceChildren();

    const next = experienceToNextLevel(p.level);
    const head = el('div', 'sheet-head');
    head.append(el('h2', 'panel-title sheet-title', info.name));
    head.append(el('p', 'sheet-sub', tf('sheetLevel', { level: p.level, xp: p.xp, next: next < 0 ? '—' : next })));
    this.card.append(head);

    const cols = el('div', 'sheet-cols');
    const left = el('div', 'sheet-col');
    left.append(el('h3', 'sheet-section', t('sheetDerived')));
    const list = el('dl', 'sheet-list');
    const pairs: [string, string][] = [
      [t('sheetHp'), `${info.hp}/${info.maxHp}`],
      [t('sheetAc'), String(info.ac)],
      [t('compSheetWeapon'), info.weapon],
      [t('compSheetArmor'), info.armor],
    ];
    for (const [k, v] of pairs) {
      const row = el('div', 'sheet-row');
      row.append(el('dt', '', k), el('dd', '', v));
      list.append(row);
    }
    left.append(list);
    cols.append(left);

    const right = el('div', 'sheet-col');
    right.append(el('h3', 'sheet-section', tf('sheetSkills', { n: p.points })));
    const skills = el('ul', 'sheet-skills');
    for (const i of info.skills) {
      const row = el('li', 'sheet-skill');
      const name = this.texts.get(100 + i) ?? String(i);
      const value = companionSkill(base, p, i);
      const minus = button('−', tf('sheetLower', { name }), (p.skills[i] ?? 0) > (this.floor[i] ?? 0), () => refundCompanionPoint(p, i, this.floor));
      const plus = button('+', tf('sheetRaise', { name }), p.points > 0 && value < SKILL_MAX, () => spendCompanionPoint(p, base, i, info.skills));
      minus.dataset['focus'] = `m${i}`;
      plus.dataset['focus'] = `p${i}`;
      const show = () => this.show(name, this.texts.get(200 + i) ?? '');
      for (const n of [row, plus, minus]) n.addEventListener(n === row ? 'pointerenter' : 'focus', show);
      row.append(el('span', 'sheet-skill-name', name), el('span', 'sheet-skill-value', `${value}%`), minus, plus);
      skills.append(row);
    }
    right.append(skills);
    cols.append(right);
    this.card.append(cols);

    const note = el('p', 'sheet-note', this.note || t('compSheetHint'));
    note.setAttribute('aria-live', 'polite');
    this.card.append(note);
    const self = el('button', 'menu-button sheet-done-self', t('compSheetAuto'));
    self.type = 'button';
    self.disabled = p.points <= 0;
    self.addEventListener('click', () => {
      autoSpend(p, base, info.gun, info.skills);
      this.render();
    });
    this.card.append(self);
    const done = el('button', 'menu-button menu-primary sheet-done', t('sheetDone'));
    done.type = 'button';
    done.addEventListener('click', () => this.host.dispatchEvent(new CustomEvent('companion-sheet-close', { bubbles: true })));
    this.card.append(done);
    if (keepFocus) this.card.querySelector<HTMLElement>(`[data-focus="${keepFocus}"]:not(:disabled)`)?.focus();
  }

  private show(title: string, body: string): void {
    this.note = body ? `${title}: ${body}` : title;
    const note = this.card.querySelector('.sheet-note');
    if (note) {
      note.textContent = this.note;
      note.scrollTop = 0;
    }
  }

  /** Subscribe to "Done" (whoever opened it closes it: they need to return to the game). */
  onDone(handler: () => void): void {
    this.host.addEventListener('companion-sheet-close', handler);
  }
}
