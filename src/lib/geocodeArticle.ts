// src/lib/geocodeArticle.ts
//
// Turns a news article's text into a dot on the map. Articles don't come
// with coordinates, so this matches city/department mentions in the
// article's title, description, URL slug, and (best-effort) full body text
// against the static gazetteer in src/data/usCities.ts — no external
// geocoding API call, which keeps this key-free and fast.
//
// Passes, in descending order of confidence, first hit wins:
//   1. "<City>, <ST>" / "<City> <ST>" / "<City>, <Full State Name>" —
//      explicit, state-disambiguated. Comma is optional so this also
//      matches URL slugs ("greer-sc-police-...") once hyphens become
//      spaces — see urlSlugToText in misuseReports.ts.
//   2. A known police department acronym ("LAPD", "NYPD", ...).
//   3. "<City> Police Department" / "<City> Sheriff('s) Office" — also
//      yields a human-readable department name for the popup.
//   4. Loose scan for any gazetteer city name appearing as a capitalized
//      word/phrase in the text, picking the longest phrase that matches
//      (falling back to population as a same-length tie-breaker) —
//      lowest confidence, used only if the above find nothing.
// Callers should treat a null result as "no dot," not an error — most
// articles that don't match still belong in the news list.

import { US_CITIES, type UsCityEntry } from "~/data/usCities";

export interface ArticleLocation {
  city: string;
  state: string;
  lat: number;
  lon: number;
  department: string | null;
}

export const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const STATE_NAME_TO_CODE: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
  "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "District Of Columbia": "DC",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
  "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
  "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
  "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR",
  "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA",
  "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
};

// lowercase city name -> matching gazetteer entries, sorted most-populous
// first so any tie-break ("which Springfield?") defaults to the bigger city.
const cityIndex = new Map<string, UsCityEntry[]>();
for (const entry of US_CITIES) {
  const key = entry.city.toLowerCase();
  const bucket = cityIndex.get(key);
  if (bucket) bucket.push(entry);
  else cityIndex.set(key, [entry]);
}
for (const bucket of cityIndex.values()) {
  bucket.sort((a, b) => b.population - a.population);
}

function pickEntry(cityKey: string, preferredState?: string): UsCityEntry | null {
  const bucket = cityIndex.get(cityKey);
  if (!bucket || bucket.length === 0) return null;
  if (preferredState) {
    const match = bucket.find((e) => e.state === preferredState);
    if (match) return match;
  }
  return bucket[0];
}

// City-name chunk: 1-4 capitalized words, allowing the punctuation that
// actually shows up in US city names (St. Louis, Winston-Salem, O'Fallon).
const CITY_WORD = String.raw`[A-Z][a-zA-Z.'-]*`;
const CITY_CHUNK = String.raw`${CITY_WORD}(?:\s+${CITY_WORD}){0,3}`;

// Comma optional — covers both prose ("Greer, SC") and hyphen-derived URL
// slugs turned into text ("Greer SC", no punctuation left).
const CITY_STATE_CODE_RE = new RegExp(String.raw`\b(${CITY_CHUNK}),?\s+([A-Z]{2})\b`, "g");

const STATE_NAME_PATTERN = Object.keys(STATE_NAME_TO_CODE)
  .map((n) => n.replace(/\s+/g, "\\s+"))
  .join("|");
const CITY_STATE_NAME_RE = new RegExp(
  String.raw`\b(${CITY_CHUNK}),?\s+(${STATE_NAME_PATTERN})\b`,
  "g",
);

function tryCityState(text: string): UsCityEntry | null {
  for (const match of text.matchAll(CITY_STATE_CODE_RE)) {
    const [, cityRaw, stateCode] = match;
    if (!STATE_CODES.has(stateCode)) continue;
    const entry = pickEntry(cityRaw.toLowerCase(), stateCode);
    if (entry) return entry;
  }
  for (const match of text.matchAll(CITY_STATE_NAME_RE)) {
    const [, cityRaw, stateNameRaw] = match;
    const code = STATE_NAME_TO_CODE[stateNameRaw.replace(/\s+/g, " ")];
    if (!code) continue;
    const entry = pickEntry(cityRaw.toLowerCase(), code);
    if (entry) return entry;
  }
  return null;
}

// Unambiguous major-city police department acronyms only — deliberately a
// short list. Plenty of real acronyms (MPD, BPD, HPD, APD, SPD, PPD, DPD...)
// are used by multiple different cities' departments and would risk a wrong
// dot, so those are left out rather than guessed at.
const PD_ACRONYMS: Record<string, { city: string; state: string; label: string }> = {
  LAPD: { city: "Los Angeles", state: "CA", label: "Los Angeles Police Department" },
  NYPD: { city: "New York", state: "NY", label: "New York Police Department" },
  CPD: { city: "Chicago", state: "IL", label: "Chicago Police Department" },
  SFPD: { city: "San Francisco", state: "CA", label: "San Francisco Police Department" },
  LVMPD: { city: "Las Vegas", state: "NV", label: "Las Vegas Metropolitan Police Department" },
  NOPD: { city: "New Orleans", state: "LA", label: "New Orleans Police Department" },
};
export const KNOWN_PD_ACRONYMS = Object.keys(PD_ACRONYMS);
// Case-insensitive — unlike ordinary words, an acronym match is unambiguous
// regardless of case, and URL-slug-derived text Title-Cases everything
// ("lapd" -> "Lapd") rather than preserving true all-caps.
const PD_ACRONYM_RE = new RegExp(String.raw`\b(${KNOWN_PD_ACRONYMS.join("|")})\b`, "gi");

function tryAcronym(text: string): { entry: UsCityEntry; department: string } | null {
  for (const match of text.matchAll(PD_ACRONYM_RE)) {
    const info = PD_ACRONYMS[match[1].toUpperCase()];
    if (!info) continue;
    const entry = pickEntry(info.city.toLowerCase(), info.state);
    if (entry) return { entry, department: info.label };
  }
  return null;
}

const DEPARTMENT_RE = new RegExp(
  String.raw`\b(${CITY_CHUNK}\s+(?:Police Department|Police|Sheriff'?s?\s+(?:Office|Department)))\b`,
  "g",
);

function tryDepartment(text: string): { entry: UsCityEntry; department: string } | null {
  for (const match of text.matchAll(DEPARTMENT_RE)) {
    const full = match[1];
    const cityRaw = full.replace(/\s+(Police Department|Police|Sheriff'?s?\s+(Office|Department))$/, "");
    const entry = pickEntry(cityRaw.toLowerCase());
    if (entry) return { entry, department: full.trim() };
  }
  return null;
}

// Strips leading junk and sentence punctuation, but keeps a trailing period
// on short tokens (<=4 letters) since that's how "St.", "Ft.", "Mt." appear
// in the gazetteer itself — stripping it would break every "St. Louis"-style
// city name.
function cleanWord(word: string): string {
  let cleaned = word.replace(/^[^A-Za-z]+/, "").replace(/[,;:!?"()]+$/, "");
  if (cleaned.endsWith(".") && cleaned.length > 5) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

// Lowest-confidence pass: tokenize into words, check 1-3 word windows
// against the gazetteer directly (O(1) map lookups, not a scan over the
// whole gazetteer). Only phrases that start with a capitalized word in the
// original text are considered, to cut down on matching common lowercase
// words that happen to coincide with a small city's name.
function tryLooseScan(text: string): UsCityEntry | null {
  const rawWords = text.split(/\s+/).map(cleanWord).filter(Boolean);

  // Longest matching phrase wins outright — checked one n at a time so a
  // real 2-word match ("Costa Mesa") is returned before ever considering
  // 1-word fragments of it ("Mesa", which is separately a real, more
  // populous city and would otherwise wrongly outrank the correct match).
  // Population only breaks ties *within* the same phrase length.
  for (let n = 3; n >= 1; n--) {
    let best: UsCityEntry | null = null;
    for (let i = 0; i + n <= rawWords.length; i++) {
      const first = rawWords[i];
      if (!/^[A-Z]/.test(first)) continue;
      const phrase = rawWords.slice(i, i + n).join(" ");
      if (phrase.length < 4) continue;
      const bucket = cityIndex.get(phrase.toLowerCase());
      if (!bucket) continue;
      const candidate = bucket[0];
      // Without an explicit state/department/acronym context, only trust
      // the ~1,000 well-known cities that have a real population figure.
      // The ~29,000 small towns added for state-hinted lookups (Greer, SC)
      // have population 0 here precisely because there's no ranking data
      // for them — left unguarded, ordinary capitalized words in headlines
      // ("Secretary", "Virginia", "Institute", "Carolina"...) start
      // colliding with some obscure same-named small town somewhere in the
      // US and producing a confidently wrong dot, which is worse than no
      // dot at all.
      if (candidate.population === 0) continue;
      if (!best || candidate.population > best.population) best = candidate;
    }
    if (best) return best;
  }
  return null;
}

export function locateArticle(text: string): ArticleLocation | null {
  const cityStateEntry = tryCityState(text);
  const acronymMatch = tryAcronym(text);
  const departmentMatch = tryDepartment(text);

  const entry = cityStateEntry ?? acronymMatch?.entry ?? departmentMatch?.entry ?? tryLooseScan(text);
  if (!entry) return null;

  return {
    city: entry.city,
    state: entry.state,
    lat: entry.lat,
    lon: entry.lon,
    department: departmentMatch?.department ?? acronymMatch?.department ?? null,
  };
}
