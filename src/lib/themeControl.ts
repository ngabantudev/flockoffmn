import type { IControl, Map as MLMap } from 'maplibre-gl';
import { createElement, SunMoon, Sun, Moon, Ghost, Check, type IconNode } from 'lucide';
import {
  MAP_STYLES,
  currentTheme,
  setTheme,
  onThemeChange,
  storedMapStyle,
  initialMapStyle,
  setMapStyle,
  onMapStyleChange,
  type Theme,
  type MapStyleId,
} from './theme';

/**
 * The map's "Site theme / Map theme" control — a MapLibre IControl, not an
 * Astro component, because it has to live inside the map's own corner
 * control stack (see mapController.ts's addControl call), the same visual
 * family as the zoom buttons. This is the only place either setting can be
 * changed — there is deliberately no header equivalent for pages without a
 * map; the choice still applies everywhere via localStorage, it just isn't
 * independently settable from, say, /about.
 *
 * Deliberately vanilla DOM construction with hand-written CSS classes
 * (global.css's .theme-control-* rules), not Tailwind utility classes:
 * mapController.ts already establishes the convention of not using Tailwind
 * utilities in dynamically-created map DOM, so this follows that rather
 * than being the first exception.
 */
export class ThemeControl implements IControl {
  private container: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;
  private mapStyleButtons = new Map<MapStyleId, HTMLButtonElement>();
  private lightBtn: HTMLButtonElement | null = null;
  private darkBtn: HTMLButtonElement | null = null;
  private halloweenBtn: HTMLButtonElement | null = null;
  private offThemeChange: (() => void) | null = null;
  private offMapStyleChange: (() => void) | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  onAdd(_map: MLMap): HTMLElement {
    const container = document.createElement('div');
    container.setAttribute('class', 'maplibregl-ctrl maplibregl-ctrl-group theme-control');

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('class', 'maplibregl-ctrl-icon theme-control-button');
    button.setAttribute('aria-label', 'Map and site theme');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'true');
    button.appendChild(createElement(SunMoon as IconNode, { width: 18, height: 18 }));
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOpen(this.panel?.hidden !== false);
    });
    this.button = button;

    const panel = document.createElement('div');
    panel.setAttribute('class', 'theme-control-panel');
    panel.hidden = true;
    panel.appendChild(this.buildSiteThemeSection());
    panel.appendChild(this.buildMapThemeSection());
    this.panel = panel;

    // Closing on outside click (not just the button toggling it) is what
    // makes this read as a popover rather than a second permanent panel
    // competing with the sidebar — it needs to get out of the way on its
    // own once a visitor has made a choice or looked elsewhere.
    this.outsideClickHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) this.setOpen(false);
    };
    document.addEventListener('click', this.outsideClickHandler);

    container.appendChild(button);
    container.appendChild(panel);
    this.container = container;

    this.reflectSiteTheme(currentTheme());
    this.reflectMapStyle(storedMapStyle() ?? initialMapStyle());
    this.offThemeChange = onThemeChange((theme: Theme) => this.reflectSiteTheme(theme));
    this.offMapStyleChange = onMapStyleChange((style: MapStyleId) => this.reflectMapStyle(style));

    return container;
  }

  onRemove(): void {
    if (this.outsideClickHandler) document.removeEventListener('click', this.outsideClickHandler);
    this.offThemeChange?.();
    this.offMapStyleChange?.();
    this.container?.parentNode?.removeChild(this.container);
    this.container = null;
  }

  private setOpen(open: boolean): void {
    if (!this.panel || !this.button) return;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
  }

  private buildSiteThemeSection(): HTMLElement {
    const section = document.createElement('div');
    section.setAttribute('class', 'theme-control-section');

    const label = document.createElement('div');
    label.setAttribute('class', 'theme-control-label');
    label.textContent = 'Site theme';
    section.appendChild(label);

    const row = document.createElement('div');
    row.setAttribute('class', 'theme-control-segmented');

    const lightBtn = document.createElement('button');
    lightBtn.type = 'button';
    lightBtn.setAttribute('class', 'theme-control-segment');
    lightBtn.appendChild(createElement(Sun as IconNode, { width: 14, height: 14 }));
    lightBtn.appendChild(document.createTextNode('Light'));
    lightBtn.addEventListener('click', () => setTheme('light'));

    const darkBtn = document.createElement('button');
    darkBtn.type = 'button';
    darkBtn.setAttribute('class', 'theme-control-segment');
    darkBtn.appendChild(createElement(Moon as IconNode, { width: 14, height: 14 }));
    darkBtn.appendChild(document.createTextNode('Dark'));
    darkBtn.addEventListener('click', () => setTheme('dark'));

    // Seasonal, not a fourth permanent appearance mode — same site theme
    // machinery as light/dark (dataset.theme, THEME_STORAGE_KEY,
    // THEME_BASEMAP), just an extra segment here rather than a separate
    // control, so a visitor who picks it keeps the same one persisted
    // choice light/dark already gets.
    const halloweenBtn = document.createElement('button');
    halloweenBtn.type = 'button';
    halloweenBtn.setAttribute('class', 'theme-control-segment');
    halloweenBtn.appendChild(createElement(Ghost as IconNode, { width: 14, height: 14 }));
    halloweenBtn.appendChild(document.createTextNode('Halloween'));
    halloweenBtn.addEventListener('click', () => setTheme('halloween'));

    this.lightBtn = lightBtn;
    this.darkBtn = darkBtn;
    this.halloweenBtn = halloweenBtn;
    row.appendChild(lightBtn);
    row.appendChild(darkBtn);
    row.appendChild(halloweenBtn);
    section.appendChild(row);
    return section;
  }

  private reflectSiteTheme(theme: Theme): void {
    this.lightBtn?.classList.toggle('is-active', theme === 'light');
    this.darkBtn?.classList.toggle('is-active', theme === 'dark');
    this.halloweenBtn?.classList.toggle('is-active', theme === 'halloween');
  }

  private buildMapThemeSection(): HTMLElement {
    const section = document.createElement('div');
    section.setAttribute('class', 'theme-control-section');

    const label = document.createElement('div');
    label.setAttribute('class', 'theme-control-label');
    label.textContent = 'Map theme';
    section.appendChild(label);

    const list = document.createElement('div');
    list.setAttribute('class', 'theme-control-list');
    for (const [id, entry] of Object.entries(MAP_STYLES) as [MapStyleId, (typeof MAP_STYLES)[MapStyleId]][]) {
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('class', 'theme-control-list-item');
      const labelSpan = document.createElement('span');
      labelSpan.textContent = entry.label;
      const check = createElement(Check as IconNode, { width: 14, height: 14 });
      check.setAttribute('class', 'theme-control-check');
      row.appendChild(labelSpan);
      row.appendChild(check);
      row.addEventListener('click', () => setMapStyle(id));
      this.mapStyleButtons.set(id, row);
      list.appendChild(row);
    }
    section.appendChild(list);
    return section;
  }

  private reflectMapStyle(style: MapStyleId): void {
    for (const [id, el] of this.mapStyleButtons) {
      el.classList.toggle('is-active', id === style);
      el.setAttribute('aria-pressed', String(id === style));
    }
  }
}
