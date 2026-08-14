import { compassLabel } from './geo.mjs';

/**
 * Render one attribute value the way its `detailFields` entry says to.
 *
 * Shared between the detail panel and the map's hover card because both read
 * the *same* registry table: a `format` written once against one field has to
 * mean the same thing wherever that field is shown, or one config entry
 * produces `340` in the popup and `340° (NW)` in the panel. `compassLabel`
 * already lives in geo.mjs for exactly this reason — so degree rendering
 * cannot diverge between the browser and the ingest — and this is the same
 * argument one level up.
 *
 * Returns null for an absent value, so callers can skip the row entirely
 * rather than printing an empty one.
 */
export function formatValue(value: unknown, format?: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (format === 'date') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString(document.documentElement.lang, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
  }
  if (format === 'degrees') {
    const compass = compassLabel(value);
    return compass ? `${value}° (${compass})` : `${value}°`;
  }
  return String(value);
}
