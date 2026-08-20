import type { IControl, Map as MLMap } from 'maplibre-gl';
import { createElement, LocateFixed, type IconNode } from 'lucide';

/**
 * "What's near me" — a corner control, same stack as ResetViewControl and
 * the zoom buttons (see mapController.ts's constructor). A toggle, not a
 * one-shot action: the first click asks the browser for a location and
 * throws lines to whatever's nearby (mapController.ts's showNearMe); a
 * second click clears them. `aria-pressed` carries that state rather than
 * a visual-only class, so it reads correctly to a screen reader too.
 *
 * The label is threaded in for localization, matching ResetViewControl's
 * own precedent — see src/i18n/*.ts's `mapNearMe` key.
 */
export class NearMeControl implements IControl {
  private container: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;

  constructor(
    private readonly label: string,
    private readonly onToggle: () => void,
  ) {}

  onAdd(_map: MLMap): HTMLElement {
    const container = document.createElement('div');
    container.setAttribute('class', 'maplibregl-ctrl maplibregl-ctrl-group');

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('class', 'maplibregl-ctrl-icon near-me-control-button');
    button.setAttribute('aria-label', this.label);
    button.setAttribute('title', this.label);
    button.setAttribute('aria-pressed', 'false');
    button.appendChild(createElement(LocateFixed as IconNode, { width: 16, height: 16 }));
    button.addEventListener('click', () => this.onToggle());

    container.appendChild(button);
    this.container = container;
    this.button = button;
    return container;
  }

  setActive(active: boolean) {
    this.button?.setAttribute('aria-pressed', String(active));
    this.button?.classList.toggle('is-active', active);
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = null;
    this.button = null;
  }
}
