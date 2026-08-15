import type { DetailFieldFormat } from '../layers/types';
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
 * The parameter is the closed `DetailFieldFormat` union rather than `string`,
 * and the switch is exhaustive against it: an earlier version took `string`
 * and let everything it didn't recognise fall through to `String(value)`,
 * which silently dropped `link` — the registry has two such fields, and the
 * first one named in a hover card would have rendered a bare URL in the card
 * and an anchor in the panel, with the type checker seeing nothing wrong. A
 * new member of the union now fails the build here instead.
 *
 * Returns null for an absent value, so callers can skip the row entirely
 * rather than printing an empty one. `link` returns the href; rendering it as
 * an anchor is the caller's job, since that is an element choice and not a
 * string one.
 */
export function formatValue(
  value: unknown,
  format: DetailFieldFormat = 'text',
  locale: string = document.documentElement.lang,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  switch (format) {
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? String(value)
        : d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    }
    case 'degrees': {
      const compass = compassLabel(value);
      return compass ? `${value}° (${compass})` : `${value}°`;
    }
    case 'currency': {
      const n = Number(value);
      return Number.isFinite(n)
        ? n.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
        : String(value);
    }
    case 'link':
    case 'text':
      return String(value);
    default: {
      // Exhaustiveness guard: adding a DetailFieldFormat member without a case
      // above is a compile error here, not a silent fall-through.
      const unhandled: never = format;
      return String(unhandled);
    }
  }
}
