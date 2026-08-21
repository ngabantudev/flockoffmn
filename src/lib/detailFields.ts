import type { DetailFieldFormat, I18nString, Locale } from '../layers/types';
import { compassLabel } from './geo.mjs';
import { pick } from './i18n';

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
    // The raw `"; "`-joined source string, unsplit — same value `text` would
    // produce. Splitting into individual pills and resolving each code's
    // label is a DOM-structure choice (one element per code, not one string),
    // so it happens where the elements are built, not here. See
    // MapView.astro's row-rendering loop.
    case 'pills':
      return String(value);
    default: {
      // Exhaustiveness guard: adding a DetailFieldFormat member without a case
      // above is a compile error here, not a silent fall-through.
      const unhandled: never = format;
      return String(unhandled);
    }
  }
}

/**
 * Resolve a `nearMe(.list).detail` key against a layer's own `detailFields`
 * table and localize its label — the build-time-throw guard `/near-me` and
 * the homepage map's near-me list each used to reimplement independently
 * (differing only in which field name their error message quoted, which had
 * already drifted: one said `nearMe.detail`, the other `nearMe.list.detail`,
 * for the same underlying check). One shared resolver means a registry typo
 * fails the build with the same message everywhere it's checked, and a
 * future change to the guard (loosening it, adding a fallback) only has to
 * be made once.
 *
 * `fieldPath` names where the caller found `key` in the registry, purely for
 * the thrown error's wording — `nearMe.detail` from `/near-me`,
 * `nearMe.list.detail` from the homepage map's list — since that's the one
 * thing that legitimately differs between the two call sites.
 */
export function labelForDetailField(
  layer: { id: string; detailFields: Array<{ key: string; label: I18nString }> },
  key: string,
  fieldPath: string,
  locale: Locale,
): string {
  const field = layer.detailFields.find((f) => f.key === key);
  if (!field) {
    throw new Error(`Layer "${layer.id}" names "${key}" in ${fieldPath} but has no detailFields entry for it.`);
  }
  return pick(field.label, locale);
}

/**
 * "Is this record's entity value blank" — the same three-way emptiness check
 * (`null`/`undefined`/`''`) the homepage map's near-me list and `/near-me`'s
 * own list each used to spell out independently. Both surfaces' own comments
 * say the same blank-operator camera can never read differently between
 * them; a shared predicate is what actually makes that true, rather than
 * leaving it to two hand-typed copies staying in sync by convention.
 */
export function isUnattributedValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}
