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
//      (falling back to population as a same-length tie-breaker).
//   5. A bare state name with no city at all — resolves to that state's
//      capital.
//   6. No location signal whatsoever — resolves to a fixed US-wide fallback
//      point.
// locateArticle() never returns null: every article gets *some* dot, tagged
// with a `precision` ("city" | "state" | "unknown") so callers can render
// lower-confidence tiers as visually approximate instead of a precise pin.

import { US_CITIES, type UsCityEntry } from "~/data/usCities";

export interface ArticleLocation {
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  department: string | null;
  // How confidently lat/lon were resolved: "city" matched a specific place,
  // "state" only found a bare state name (lat/lon point at its capital),
  // "unknown" found no location signal at all (lat/lon are a US-wide
  // fallback). Callers should render "state"/"unknown" dots as visually
  // approximate rather than treating them as a precise pin.
  precision: "city" | "state" | "unknown";
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
      // The ~29,000 small towns added for state-hinted lookups (Greer, SC)
      // have population 0 here precisely because there's no ranking data
      // for them. A lone common word ("Secretary", "Virginia", "Institute"...)
      // colliding with an obscure same-named town is the real risk, and only
      // shows up at n=1 — a 2-3 word phrase is specific enough that letting
      // it match one of these small towns is safe, and catches small-town
      // mentions that never pair with a state name in the text. So the
      // population-0 guard only applies to single-word matches.
      if (candidate.population === 0 && n === 1) continue;
      if (!best || candidate.population > best.population) best = candidate;
    }
    if (best) return best;
  }
  return null;
}

// State capital for each state — used to place a "state" tier dot when the
// text names a state but no city. Resolved through the same gazetteer/
// pickEntry as every other pass, so no separate coordinate table is needed.
const STATE_CAPITALS: Record<string, string> = {
  AL: "Montgomery", AK: "Juneau", AZ: "Phoenix", AR: "Little Rock", CA: "Sacramento",
  CO: "Denver", CT: "Hartford", DE: "Dover", DC: "Washington", FL: "Tallahassee",
  GA: "Atlanta", HI: "Honolulu", ID: "Boise", IL: "Springfield", IN: "Indianapolis",
  IA: "Des Moines", KS: "Topeka", KY: "Frankfort", LA: "Baton Rouge", ME: "Augusta",
  MD: "Annapolis", MA: "Boston", MI: "Lansing", MN: "Saint Paul", MS: "Jackson",
  MO: "Jefferson City", MT: "Helena", NE: "Lincoln", NV: "Carson City", NH: "Concord",
  NJ: "Trenton", NM: "Santa Fe", NY: "Albany", NC: "Raleigh", ND: "Bismarck",
  OH: "Columbus", OK: "Oklahoma City", OR: "Salem", PA: "Harrisburg", RI: "Providence",
  SC: "Columbia", SD: "Pierre", TN: "Nashville", TX: "Austin", UT: "Salt Lake City",
  VT: "Montpelier", VA: "Richmond", WA: "Olympia", WV: "Charleston", WI: "Madison",
  WY: "Cheyenne",
};

// Bare full state name anywhere in the text, no city required — deliberately
// doesn't scan bare 2-letter codes (too ambiguous: "IN", "OR", "ME" collide
// with common words), unlike CITY_STATE_CODE_RE above which only trusts a
// 2-letter code when it directly follows a city-shaped phrase.
const STATE_NAME_ONLY_RE = new RegExp(String.raw`\b(${STATE_NAME_PATTERN})\b`, "g");

function tryStateOnly(text: string): UsCityEntry | null {
  for (const match of text.matchAll(STATE_NAME_ONLY_RE)) {
    const code = STATE_NAME_TO_CODE[match[1].replace(/\s+/g, " ")];
    const capital = code ? STATE_CAPITALS[code] : undefined;
    if (!capital) continue;
    const entry = pickEntry(capital.toLowerCase(), code);
    if (entry) return entry;
  }
  return null;
}

// Geographic center of the contiguous US — last-resort pin for an article
// with no location signal at all, so it still lands on the map instead of
// vanishing (callers render this precision tier as visually approximate).
const US_FALLBACK_CENTER = { lat: 39.8283, lon: -98.5795 };

export function locateArticle(text: string): ArticleLocation {
  const cityStateEntry = tryCityState(text);
  const acronymMatch = tryAcronym(text);
  const departmentMatch = tryDepartment(text);
  const cityEntry =
    cityStateEntry ?? acronymMatch?.entry ?? departmentMatch?.entry ?? tryLooseScan(text);

  if (cityEntry) {
    return {
      city: cityEntry.city,
      state: cityEntry.state,
      lat: cityEntry.lat,
      lon: cityEntry.lon,
      department: departmentMatch?.department ?? acronymMatch?.department ?? null,
      precision: "city",
    };
  }

  const stateEntry = tryStateOnly(text);
  if (stateEntry) {
    return {
      city: null,
      state: stateEntry.state,
      lat: stateEntry.lat,
      lon: stateEntry.lon,
      department: null,
      precision: "state",
    };
  }

  return {
    city: null,
    state: null,
    lat: US_FALLBACK_CENTER.lat,
    lon: US_FALLBACK_CENTER.lon,
    department: null,
    precision: "unknown",
  };
}
