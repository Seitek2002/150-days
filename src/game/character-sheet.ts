// The in-game character screen (K): level and experience, stats and attributes, skills with points to spend, perks.
// Names of stats, skills and perks and their descriptions are from the player's copy's STAT.MSG, SKILL.MSG and PERK.MSG, our labels are
// in i18n. The window has a fixed size: lists scroll inside, nothing jumps. Points spent now can be taken back
// with the "−" button while the window is open; once closed, the changes are written to the hero.
import { parseMsg } from '../formats/text.ts';
import { t, tf } from '../i18n.ts';
import { platform } from '../platform.ts';
import { derivedStats, experienceToNextLevel, perkRank, skillLevel, SKILL_COUNT, specialLevel, SPECIAL_NAMES, type Character } from './character.ts';
import type { Hero } from './hero.ts';
import { availablePerks, canTagMore, heroLevel, PERK_RULES, refundSkillPoint, spendSkillPoint, tagSkill, takePerk } from './perks.ts';

/** Radiation, poison, addictions and our own marks (easter eggs — lloyd.ts): the session stores them. */
interface Conditions {
  rads: number;
  poison: number;
  addictions?: { perk: number; withdrawal: boolean }[];
  /** Marks next to the perks (ready text). */
  marks?: string[];
}

interface Texts {
  stat: ReadonlyMap<number, string>;
  skill: ReadonlyMap<number, string>;
  perk: ReadonlyMap<number, string>;
}

let textsPending: Promise<Texts> | null = null;
function loadTexts(): Promise<Texts> {
  const read = (name: string) =>
    platform
      .readGameFile(`TEXT\\ENGLISH\\GAME\\${name}`)
      .then(parseMsg)
      .catch(() => new Map<number, string>());
  textsPending ??= Promise.all([read('STAT.MSG'), read('SKILL.MSG'), read('PERK.MSG')]).then(([stat, skill, perk]) => ({ stat, skill, perk }));
  return textsPending;
}

export class CharacterSheet {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private hero: Hero | null = null;
  private character: Character | null = null;
  /** Skill points before the window was opened: "−" doesn't go below them. */
  private floor: readonly number[] = [];
  private texts: Texts = { stat: new Map(), skill: new Map(), perk: new Map() };
  /** Description of what is pointed at (a skill or a perk). */
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

  /** Radiation, poison and addictions (the session stores them). */
  private conditions: Conditions = { rads: 0, poison: 0 };

  open(hero: Hero, conditions: Conditions = { rads: 0, poison: 0 }): void {
    this.conditions = conditions;
    this.hero = hero;
    this.character = hero.character;
    this.floor = [...hero.character.skillPoints];
    this.note = '';
    this.host.hidden = false;
    this.render();
    this.card.querySelector<HTMLButtonElement>('.sheet-done')?.focus();
    void loadTexts().then((texts) => {
      this.texts = texts;
      if (this.isOpen) this.render();
    });
  }

  /** Close: the points spent and the chosen perk stay with the hero. */
  close(): void {
    if (this.hero && this.character) this.hero.setCharacter(this.character);
    this.host.hidden = true;
    this.hero = null;
    this.character = null;
  }

  private change(next: Character): void {
    this.character = next;
    this.render();
  }

  private render(): void {
    const c = this.character;
    const hero = this.hero;
    if (!c || !hero) return;
    const { stat, skill, perk } = this.texts;
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
      b.addEventListener('click', onClick);
      return b;
    };
    const keepFocus = document.activeElement?.getAttribute('data-focus') ?? null;
    const skillScroll = this.card.querySelector('.sheet-skills')?.scrollTop ?? 0;
    const perkScroll = this.card.querySelector('.sheet-perks')?.scrollTop ?? 0;
    this.card.replaceChildren();

    const level = heroLevel(c);
    const next = experienceToNextLevel(level);
    const head = el('div', 'sheet-head');
    head.append(el('h2', 'panel-title sheet-title', c.name || t('heroName')));
    head.append(el('p', 'sheet-sub', tf('sheetLevel', { level, xp: hero.experience, next: next < 0 ? '—' : next })));
    this.card.append(head);

    const cols = el('div', 'sheet-cols');
    // Stats and attributes.
    const left = el('div', 'sheet-col');
    left.append(el('h3', 'sheet-section', t('sheetSpecial')));
    const special = el('dl', 'sheet-list');
    SPECIAL_NAMES.forEach((name, i) => {
      const row = el('div', 'sheet-row');
      row.append(el('dt', '', stat.get(100 + i) ?? name), el('dd', '', String(specialLevel(c, name))));
      special.append(row);
    });
    left.append(special);
    const d = derivedStats(c);
    left.append(el('h3', 'sheet-section', t('sheetDerived')));
    const derived = el('dl', 'sheet-list');
    const pairs: [string, string][] = [
      [t('sheetHp'), `${hero.hp}/${d.maxHp}`],
      [t('sheetAc'), String(d.armorClass)],
      [t('sheetAp'), String(d.maxAp)],
      [t('sheetMelee'), String(d.meleeDamage)],
      [t('sheetCrit'), `${d.criticalChance}%`],
      [t('sheetHealing'), String(d.healingRate)],
      [t('sheetCarry'), String(d.carryWeight)],
      [t('sheetRads'), String(this.conditions.rads)],
      [t('sheetPoison'), String(this.conditions.poison)],
    ];
    for (const [k, v] of pairs) {
      const row = el('div', 'sheet-row');
      row.append(el('dt', '', k), el('dd', '', v));
      derived.append(row);
    }
    left.append(derived);
    cols.append(left);

    // Skills.
    const right = el('div', 'sheet-col');
    right.append(el('h3', 'sheet-section', tf('sheetSkills', { n: c.unspentSkillPoints ?? 0 }) + (canTagMore(c) ? ' · ' + t('sheetTagHint') : '')));
    const skills = el('ul', 'sheet-skills');
    for (let i = 0; i < SKILL_COUNT; i++) {
      const row = el('li', 'sheet-skill' + (c.tagged.includes(i) ? ' sheet-tagged' : ''));
      const name = skill.get(100 + i) ?? String(i);
      const label = el('span', 'sheet-skill-name', name);
      label.tabIndex = -1;
      // After "Tag!" a click on a name makes the skill tagged.
      if (canTagMore(c) && !c.tagged.includes(i)) {
        label.classList.add('sheet-taggable');
        label.addEventListener('click', () => this.change(tagSkill(c, i)));
      }
      const minus = button('−', tf('sheetLower', { name }), (c.skillPoints[i] ?? 0) > (this.floor[i] ?? 0), () => this.change(refundSkillPoint(c, i, this.floor)));
      const plus = button('+', tf('sheetRaise', { name }), (c.unspentSkillPoints ?? 0) > 0, () => this.change(spendSkillPoint(c, i)));
      minus.dataset['focus'] = `m${i}`;
      plus.dataset['focus'] = `p${i}`;
      const show = () => this.show(name, skill.get(200 + i) ?? '');
      for (const n of [row, plus, minus]) n.addEventListener(n === row ? 'pointerenter' : 'focus', show);
      row.append(label, el('span', 'sheet-skill-value', `${skillLevel(c, i)}%`), minus, plus);
      skills.append(row);
    }
    right.append(skills);
    cols.append(right);
    this.card.append(cols);

    // Perks: those taken and, if due, a choice.
    const owed = c.perksOwed ?? 0;
    const perksBox = el('div', 'sheet-perks');
    const taken = PERK_RULES.filter((r) => perkRank(c, r.id) > 0).map((r) => `${perk.get(101 + r.id) ?? r.id}${r.ranks > 1 ? ` (${perkRank(c, r.id)})` : ''}`);
    // Addictions are shown next to the perks, as in the original (they have their own lines in PERK.MSG).
    for (const a of this.conditions.addictions ?? []) taken.push(`${perk.get(101 + a.perk) ?? a.perk}${a.withdrawal ? ` (${t('sheetWithdrawal')})` : ''}`);
    taken.push(...(this.conditions.marks ?? []));
    perksBox.append(el('p', 'sheet-taken', tf('sheetPerks', { list: taken.join(', ') || t('sheetNoPerks') })));
    if (owed > 0) {
      perksBox.append(el('h3', 'sheet-section', tf('sheetChoosePerk', { n: owed })));
      const choices = availablePerks(c);
      if (!choices.length) perksBox.append(el('p', 'sheet-taken', t('sheetNoChoice')));
      for (const r of choices) {
        const name = perk.get(101 + r.id) ?? String(r.id);
        const b = el('button', 'menu-button sheet-perk', name);
        b.type = 'button';
        b.dataset['focus'] = `perk${r.id}`;
        const show = () => this.show(name, perk.get(201 + r.id) ?? '');
        b.addEventListener('pointerenter', show);
        b.addEventListener('focus', show);
        b.addEventListener('click', () => this.change(takePerk(c, r.id)));
        perksBox.append(b);
      }
    }
    this.card.append(perksBox);

    const note = el('p', 'sheet-note', this.note);
    note.setAttribute('aria-live', 'polite');
    this.card.append(note);
    const done = el('button', 'menu-button menu-primary sheet-done', t('sheetDone'));
    done.type = 'button';
    done.addEventListener('click', () => this.host.dispatchEvent(new CustomEvent('sheet-close', { bubbles: true })));
    this.card.append(done);

    this.card.querySelector('.sheet-skills')!.scrollTop = skillScroll;
    this.card.querySelector('.sheet-perks')!.scrollTop = perkScroll;
    if (keepFocus) this.card.querySelector<HTMLElement>(`[data-focus="${keepFocus}"]:not(:disabled)`)?.focus();
  }

  /** Description of a skill or perk at the bottom of the window (a fixed-size line — the window doesn't jump). */
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
    this.host.addEventListener('sheet-close', handler);
  }
}
