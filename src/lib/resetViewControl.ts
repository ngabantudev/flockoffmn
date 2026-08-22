import type { IControl, Map as MLMap } from 'maplibre-gl';
import { createElement, Crosshair, type IconNode } from 'lucide';

/**
 * "Reset view" — a MapLibre IControl living in the same bottom-right corner
 * stack as ThemeControl and the zoom buttons (see mapController.ts's
 * addControl calls), rather than an Astro-rendered button floating over the
 * map on its own pixel-guessed offset. That's the corner-control treatment
 * wealldobettermn.org uses for its own "back to the state" reset — it only
 * reads as one control among several if the same flexbox that lays out the
 * zoom buttons lays this out too, instead of two positioning systems trying
 * to agree on where the native stack ends.
 *
 * The label is threaded in rather than hardcoded so the button stays
 * localized (see src/i18n/*.ts's `resetView` key) — unlike ThemeControl,
 * which predates this control and is English-only by established precedent.
 */
export class ResetViewControl implements IControl {
  private container: HTMLElement | null = null;

  constructor(
    private readonly label: string,
    private readonly onReset: () => void,
  ) {}

  onAdd(_map: MLMap): HTMLElement {
    const container = document.createElement('div');
    container.setAttribute('class', 'maplibregl-ctrl maplibregl-ctrl-group');

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('class', 'maplibregl-ctrl-icon reset-view-control-button');
    button.setAttribute('aria-label', this.label);
    button.setAttribute('title', this.label);
    button.appendChild(createElement(Crosshair as IconNode, { width: 16, height: 16 }));
    button.addEventListener('click', () => this.onReset());

    container.appendChild(button);
    this.container = container;
    return container;
  }

  /**
   * Hidden while "ALPRs Near Me" is active (mapController.ts's showNearMe/
   * clearNearMe) — resetView() jumps back to METRO_BOUNDS, which would
   * silently abandon a live lookup's own camera fit (refitNearMeCamera) and
   * everything drawn around it (sweep, mask, boundary ring) without ever
   * clearing that state, leaving the reader looking at the statewide view
   * with near-me still technically running. Same `container.hidden`
   * mechanism NearMeRadiusControl's own setVisible uses, for the same
   * "gone entirely, not just disabled" reason — a visible-but-inert button
   * invites exactly the tap this is trying to prevent.
   */
  setVisible(visible: boolean) {
    if (this.container) this.container.hidden = !visible;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = null;
  }
}
