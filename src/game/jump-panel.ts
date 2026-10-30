// Hidden debug window (F9): "Go to location" lists every location in the game by name, the jump is instant, no travel.
// Locations are grouped by town (the part of the name before the comma: "the Hub, center" → "the Hub"), single ones go to "Other locations"; separately,
// the wasteland next to each world map location. The search line at the top filters locations by name. The window has a fixed size, the list
// scrolls inside, nothing jumps. Keys: ↑ ↓ and Tab move between buttons, Enter jumps, Esc or F9 closes.
import { t } from '../i18n.ts';
import { focusStep } from '../ui/settings.ts';
import type { Destination } from '../world/defs.ts';

export interface JumpPlace {
  /** Button label. */
  label: string;
  /** Full name: the search matches it and it shows in the tooltip. */
  name: string;
  /** Map number (the button tooltip: for testing it matters exactly where). */
  id: string;
  to: Destination;
}

export interface JumpGroup {
  title: string;
  places: JumpPlace[];
}

/** The town in a location name: before the comma or bracket ("Caravan ambush (desert, 1)" → "Caravan ambush"). */
function split(title: string): { town: string; rest: string } {
  const m = /^(.*?)(?:, | \()(.*?)\)?$/.exec(title);
  return m ? { town: m[1]!, rest: m[2]! } : { town: title, rest: '' };
}

/**
 * Locations by town in order of first appearance; a town with a single location goes to the shared group other (with its full name).
 */
export function groupPlaces(places: readonly { id: string; title: string; to: Destination }[], other: string): JumpGroup[] {
  const towns = new Map<string, JumpPlace[]>();
  for (const p of places) {
    const { town, rest } = split(p.title);
    const list = towns.get(town) ?? [];
    list.push({ label: rest || p.title, name: p.title, id: p.id, to: p.to });
    towns.set(town, list);
  }
  const groups: JumpGroup[] = [];
  const single: JumpPlace[] = [];
  for (const [town, list] of towns) {
    if (list.length > 1) groups.push({ title: town, places: list });
    else single.push({ ...list[0]!, label: list[0]!.name });
  }
  if (single.length) groups.push({ title: other, places: single });
  return groups;
}

export class JumpPanel {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private onGo: ((to: Destination) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'pause jump';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.host.setAttribute('aria-labelledby', 'jump-title');
    this.card = document.createElement('div');
    this.card.className = 'pause-card polygon-card';
    const title = document.createElement('h2');
    title.className = 'panel-title';
    title.id = 'jump-title';
    this.search = document.createElement('input');
    this.search.className = 'jump-search';
    this.search.type = 'search';
    this.search.autocomplete = 'off';
    this.search.spellcheck = false;
    this.search.addEventListener('input', () => this.filter());
    this.list = document.createElement('div');
    this.empty = document.createElement('p');
    this.empty.className = 'jump-empty';
    this.empty.hidden = true;
    this.empty.setAttribute('role', 'status');
    this.card.append(title, this.search, this.list, this.empty);
    this.host.append(this.card);
    parent.append(this.host);
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  /** Show the locations; current is the map number where the hero is now (its button is highlighted). */
  open(groups: readonly JumpGroup[], current: string, onGo: (to: Destination) => void): void {
    this.onGo = onGo;
    this.card.querySelector('#jump-title')!.textContent = t('jumpTitle');
    this.search.placeholder = t('jumpSearch');
    this.search.setAttribute('aria-label', t('jumpSearch'));
    this.empty.textContent = t('jumpNothing');
    const children: HTMLElement[] = [];
    for (const group of groups) {
      const section = document.createElement('section');
      const h = document.createElement('h3');
      h.className = 'polygon-section';
      h.textContent = group.title;
      const row = document.createElement('div');
      row.className = 'polygon-row';
      for (const place of group.places) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = place.id === current ? 'menu-button menu-primary' : 'menu-button';
        b.textContent = place.label;
        b.title = `${place.name} · ${place.id}`;
        b.dataset.search = `${group.title} ${place.name} ${place.id}`.toLowerCase();
        b.addEventListener('click', () => this.onGo?.(place.to));
        row.append(b);
      }
      section.append(h, row);
      children.push(section);
    }
    this.list.replaceChildren(...children);
    this.search.value = '';
    this.filter();
    this.host.hidden = false;
    // Always from the top of the list: the search line sticks to the top, and focusing it would scroll the window by itself.
    this.card.scrollTop = 0;
    this.search.focus({ preventScroll: true });
  }

  close(): void {
    this.host.hidden = true;
    this.onGo = null;
  }

  /** Window keys (Esc and F9 close it, the game decides that); true means the key was handled. */
  key(e: KeyboardEvent): boolean {
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'Tab') {
      e.preventDefault();
      focusStep(this.card, e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey) ? -1 : 1);
      return true;
    }
    return false;
  }

  /** Keep the locations that contain every search word; empty groups are hidden. */
  private filter(): void {
    const words = this.search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const section of this.list.children) {
      let inSection = 0;
      for (const b of section.querySelectorAll<HTMLButtonElement>('button')) {
        const hit = words.every((w) => b.dataset.search!.includes(w));
        // A hidden button is also disabled: the arrows and Tab skip it.
        b.hidden = !hit;
        b.disabled = !hit;
        if (hit) inSection++;
      }
      (section as HTMLElement).hidden = inSection === 0;
      shown += inSection;
    }
    this.empty.hidden = shown > 0;
  }
}
