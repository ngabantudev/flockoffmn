import type { IControl, Map as MLMap } from 'maplibre-gl';

/**
 * The "what's near me" search-radius slider — a corner control, same stack
 * as NearMeControl (mapController.ts's constructor), but hidden until a
 * location is actually found (see setVisible). Dragging it changes which
 * nearby cameras/readers are drawn without ever moving the map: this is
 * what replaced the autozoom "near me" shipped with originally (PR #111,
 * see NEARME_RADIUS_MIN_MI's own comment in mapController.ts) — the reader
 * decides how wide a net to throw, rather than an animation guessing a
 * frame for them.
 *
 * `input` fires on every drag tick — wired to a live redraw only, no
 * announcement, so a screen-reader user isn't read every intermediate
 * mile as the thumb moves. `change` fires once on release/commit, which is
 * the one moment the aria-live result count actually updates (see
 * mapController.ts's applyNearMeRadius and MapView.astro's onNearMeResult
 * wiring) — matching the "don't narrate every tick" precedent the
 * canvas-only throw-line render already sets.
 */
export class NearMeRadiusControl implements IControl {
  private container: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private valueLabel: HTMLSpanElement | null = null;

  constructor(
    private readonly label: string,
    private readonly min: number,
    private readonly max: number,
    private readonly initial: number,
    private readonly formatValue: (miles: number) => string,
    private readonly onDrag: (miles: number) => void,
    private readonly onCommit: (miles: number) => void,
  ) {}

  onAdd(_map: MLMap): HTMLElement {
    const container = document.createElement('div');
    // maplibregl-ctrl-group carries the shared corner-control chrome
    // (background/border/radius — see global.css's own override of it)
    // rather than near-me-radius-control redeclaring it a third time
    // alongside .theme-control-panel's own copy.
    container.setAttribute('class', 'maplibregl-ctrl maplibregl-ctrl-group near-me-radius-control');
    // Hidden by default — setVisible(true) reveals it once showNearMe has
    // an origin to search from; nothing to filter before that.
    container.hidden = true;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(this.min);
    input.max = String(this.max);
    input.step = '1';
    input.value = String(this.initial);
    input.className = 'near-me-radius-input';
    input.setAttribute('aria-label', this.label);
    input.setAttribute('aria-valuetext', this.formatValue(this.initial));

    const valueLabel = document.createElement('span');
    valueLabel.className = 'near-me-radius-value';
    // The input's own aria-valuetext already carries this for a screen
    // reader; this span is the sighted-only visible echo beside the thumb.
    valueLabel.setAttribute('aria-hidden', 'true');
    valueLabel.textContent = this.formatValue(this.initial);

    input.addEventListener('input', () => {
      const miles = Number(input.value);
      const formatted = this.formatValue(miles);
      input.setAttribute('aria-valuetext', formatted);
      valueLabel.textContent = formatted;
      this.onDrag(miles);
    });
    input.addEventListener('change', () => this.onCommit(Number(input.value)));

    container.appendChild(input);
    container.appendChild(valueLabel);
    this.container = container;
    this.input = input;
    this.valueLabel = valueLabel;
    return container;
  }

  setVisible(visible: boolean) {
    if (this.container) this.container.hidden = !visible;
  }

  /** Back to the default radius — called by clearNearMe so a fresh lookup doesn't inherit the last one's slider position. */
  reset() {
    if (!this.input || !this.valueLabel) return;
    const formatted = this.formatValue(this.initial);
    this.input.value = String(this.initial);
    this.input.setAttribute('aria-valuetext', formatted);
    this.valueLabel.textContent = formatted;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = null;
    this.input = null;
    this.valueLabel = null;
  }
}
