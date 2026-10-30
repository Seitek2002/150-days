// Test range panel (F2): place opponents (who, with what weapon, how many, hostile or peaceful),
// remove them, immortality and items for the hero, time of day. Our own window for testing mechanics, in the style of the pause window.
import { t } from '../i18n.ts';

export interface PolygonChoice {
  pid: number;
  /** Name from the player's copy. */
  name: string;
}

export interface PolygonActions {
  spawn(pid: number, weapon: number, count: number, hostile: boolean): void;
  clear(): void;
  immortal(): boolean;
  setImmortal(on: boolean): void;
  heal(): void;
  addAmmo(): void;
  addStimpaks(): void;
  /** Move the clock forward to this hour. */
  setHour(hour: number): void;
  close(): void;
}

const COUNTS = [1, 3, 5];
const HOURS: [string, number][] = [
  ['pgMorning', 7],
  ['pgNoon', 13],
  ['pgEvening', 19],
  ['pgNight', 1],
];

export class PolygonPanel {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private creatures: PolygonChoice[] = [];
  private weapons: PolygonChoice[] = [];
  private actions: PolygonActions | null = null;
  /** The choice in the panel is remembered between openings. */
  private creature = 0;
  private weapon = 0;
  private count = 1;
  private hostile = true;

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'pause polygon';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.card = document.createElement('div');
    this.card.className = 'pause-card polygon-card';
    this.host.append(this.card);
    parent.append(this.host);
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  open(creatures: PolygonChoice[], weapons: PolygonChoice[], actions: PolygonActions): void {
    this.creatures = creatures;
    this.weapons = weapons;
    this.actions = actions;
    if (!this.creature) this.creature = creatures[0]?.pid ?? 0;
    this.host.hidden = false;
    this.render();
    this.card.querySelector<HTMLButtonElement>('button')?.focus();
  }

  close(): void {
    this.host.hidden = true;
    this.actions = null;
  }

  private render(): void {
    const actions = this.actions;
    if (!actions) return;
    const section = (title: string) => {
      const h = document.createElement('h3');
      h.className = 'polygon-section';
      h.textContent = title;
      return h;
    };
    const row = (...items: HTMLElement[]) => {
      const div = document.createElement('div');
      div.className = 'polygon-row';
      div.append(...items);
      return div;
    };
    const button = (text: string, chosen: boolean, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = chosen ? 'menu-button menu-primary' : 'menu-button';
      b.textContent = text;
      b.addEventListener('click', () => {
        onClick();
        this.render();
      });
      return b;
    };
    const title = document.createElement('h2');
    title.className = 'panel-title';
    title.textContent = t('pgTitle');
    const children: HTMLElement[] = [title, section(t('pgEnemies'))];
    children.push(row(...this.creatures.map((c) => button(c.name, c.pid === this.creature, () => (this.creature = c.pid)))));
    children.push(section(t('pgWeapon')));
    children.push(
      row(
        button(t('pgNoWeapon'), this.weapon === 0, () => (this.weapon = 0)),
        ...this.weapons.map((w) => button(w.name, w.pid === this.weapon, () => (this.weapon = w.pid))),
      ),
    );
    children.push(
      row(
        ...COUNTS.map((n) => button(`×${n}`, n === this.count, () => (this.count = n))),
        button(t('pgHostile'), this.hostile, () => (this.hostile = true)),
        button(t('pgPeaceful'), !this.hostile, () => (this.hostile = false)),
      ),
    );
    children.push(
      row(
        button(t('pgSpawn'), false, () => actions.spawn(this.creature, this.weapon, this.count, this.hostile)),
        button(t('pgClear'), false, () => actions.clear()),
      ),
    );
    children.push(section(t('pgHero')));
    children.push(
      row(
        button(`${t('pgImmortal')}: ${t(actions.immortal() ? 'pgOn' : 'pgOff')}`, actions.immortal(), () => actions.setImmortal(!actions.immortal())),
        button(t('pgHeal'), false, () => actions.heal()),
        button(t('pgAmmo'), false, () => actions.addAmmo()),
        button(t('pgStimpaks'), false, () => actions.addStimpaks()),
      ),
    );
    children.push(section(t('pgTime')));
    children.push(row(...HOURS.map(([label, hour]) => button(t(label as 'pgMorning'), false, () => actions.setHour(hour)))));
    children.push(row(button(t('pgClose'), false, () => actions.close())));
    this.card.replaceChildren(...children);
  }
}
