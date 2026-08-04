import { createElement, Sun, Moon, type IconNode } from 'lucide';
import { setTheme, type Theme } from './theme';

export interface SiteThemeStrings {
  sectionLabel: string;
  light: string;
  dark: string;
}

export const DEFAULT_SITE_THEME_STRINGS: SiteThemeStrings = {
  sectionLabel: 'Site theme',
  light: 'Light',
  dark: 'Dark',
};

/**
 * The "Site theme" segmented Light/Dark control, shared between two hosts
 * that can't share a DOM tree: src/lib/themeControl.ts (the map's own
 * corner popover, which also has a "Map theme" section) and Nav.astro's
 * header popover (every page, including the ones with no map to theme).
 * Same markup and behavior either way — only the container it's dropped
 * into differs — so this stays the one place "what Light/Dark looks like"
 * is decided. Strings are passed in, not hardcoded: both callers read them
 * from a server-rendered `#theme-toggle-strings` JSON script tag (Astro's
 * i18n, not duplicated here), falling back to English only if that tag is
 * ever missing.
 */
export function buildSiteThemeSection(
  strings: SiteThemeStrings = DEFAULT_SITE_THEME_STRINGS,
): { el: HTMLElement; reflect: (theme: Theme) => void } {
  const section = document.createElement('div');
  section.setAttribute('class', 'theme-control-section');

  const label = document.createElement('div');
  label.setAttribute('class', 'theme-control-label');
  label.textContent = strings.sectionLabel;
  section.appendChild(label);

  const row = document.createElement('div');
  row.setAttribute('class', 'theme-control-segmented');

  const lightBtn = document.createElement('button');
  lightBtn.type = 'button';
  lightBtn.setAttribute('class', 'theme-control-segment');
  lightBtn.appendChild(createElement(Sun as IconNode, { width: 14, height: 14 }));
  lightBtn.appendChild(document.createTextNode(strings.light));
  lightBtn.addEventListener('click', () => setTheme('light'));

  const darkBtn = document.createElement('button');
  darkBtn.type = 'button';
  darkBtn.setAttribute('class', 'theme-control-segment');
  darkBtn.appendChild(createElement(Moon as IconNode, { width: 14, height: 14 }));
  darkBtn.appendChild(document.createTextNode(strings.dark));
  darkBtn.addEventListener('click', () => setTheme('dark'));

  row.appendChild(lightBtn);
  row.appendChild(darkBtn);
  section.appendChild(row);

  return {
    el: section,
    reflect: (theme: Theme) => {
      const isLight = theme === 'light';
      lightBtn.classList.toggle('is-active', isLight);
      darkBtn.classList.toggle('is-active', !isLight);
    },
  };
}
