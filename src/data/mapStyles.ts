// src/data/mapStyles.ts

export interface MapStyleOption {
  id: string;
  label: string;
  url: string;
}

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  { id: 'fiord', label: 'Fiord (Muted)', url: 'https://tiles.openfreemap.org/styles/fiord' },
  { id: 'liberty', label: 'Liberty (Google Maps)', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'positron', label: 'Light Minimal', url: 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'dark', label: 'Dark Mode', url: 'https://tiles.openfreemap.org/styles/dark' },
];

// Light, Google-Maps-style basemap by default — dark tiles and pure
// grayscale both make it harder to quickly orient (road/land-use color
// coding, building outlines) at a glance, which matters most for a map
// people are scanning quickly rather than studying.
export const DEFAULT_MAP_STYLE_ID = 'liberty';

export function getDefaultMapStyleUrl(): string {
  return (
    MAP_STYLE_OPTIONS.find((option) => option.id === DEFAULT_MAP_STYLE_ID)?.url ??
    MAP_STYLE_OPTIONS[0].url
  );
}
