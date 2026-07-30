import type { Locale } from '~/layers/types';
import { en } from '~/i18n/en';
import { es } from '~/i18n/es';

export type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

export const LOCALES: Locale[] = ['en', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

/** Read the locale out of an Astro URL pathname. */
export function localeFromUrl(url: URL): Locale {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  return LOCALES.includes(seg as Locale) ? (seg as Locale) : DEFAULT_LOCALE;
}

/**
 * Translator. Spanish falls back to English per key rather than per page, so a
 * partially-translated dictionary degrades to a readable mixed page instead of
 * printing a missing-key placeholder to a reader who needs the information.
 */
export function useTranslations(locale: Locale) {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return function t(key: string): string {
    return dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  };
}

/** Prefix a path with the locale, leaving the default locale unprefixed. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean === '/' ? '/' : clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** Strip the locale prefix, e.g. /es/sources -> /sources. */
export function stripLocale(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (LOCALES.includes(parts[0] as Locale)) parts.shift();
  return `/${parts.join('/')}`;
}

/** Pick the locale variant of an I18nString from the layer registry. */
export function pick(value: Record<Locale, string>, locale: Locale): string {
  return value[locale] ?? value[DEFAULT_LOCALE];
}
