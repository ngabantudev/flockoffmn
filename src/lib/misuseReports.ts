// src/lib/misuseReports.ts
//
// Nationwide Google News RSS feed of articles about police/sheriff misuse of
// Flock Safety (or general ALPR/license-plate-reader) cameras. Mirrors the
// fetch/parse approach in mn-data-center-watch's src/lib/newsFeed.ts (same
// no-API-key RSS endpoint, same regex-based item parsing) but scoped
// nationwide instead of to one state, and with each item geocoded to a dot
// via src/lib/geocodeArticle.ts.
//
// NOTE on scraping the actual article page: this was tried (fetch the
// publisher URL, read its body/URL slug for a location) and had to be
// removed. Google News RSS `<link>` entries no longer redirect via plain
// HTTP — they land on a Google-hosted Angular page that resolves the real
// URL client-side via JS, which a server-side fetch() can never execute,
// and the real URL isn't embedded anywhere in that page's HTML either.
// Confirmed by testing with multiple User-Agents (default, curl, Googlebot)
// — all get the same JS-shell response, not a redirect. So geocoding only
// ever has the RSS item's own title + description to work with.

import { locateArticle, KNOWN_PD_ACRONYMS, type ArticleLocation } from "~/lib/geocodeArticle";

export interface MisuseReportItem {
  title: string;
  url: string;
  published: string;
  source: string;
  location: ArticleLocation | null;
}

// --- Tune these lists to control precision without touching fetch/parse ---

// Must match at least one — establishes the article is actually about Flock
// or ALPR/mass-surveillance-style cameras, not just "police" news in general.
const CAMERA_TERMS = [
  "flock", "license plate reader", "license plate camera", "alpr",
  "automated license plate", "mass surveillance",
];

// Must match at least one — establishes an accountable actor is involved,
// which for this project is either law enforcement *or* Flock Safety's own
// staff (their employees have separately been reported watching customer
// camera feeds — e.g. kids' spaces — for sales demos, which is squarely in
// scope even though no officer is involved). A known department acronym
// (LAPD, NYPD, ...) counts too — checked separately in the filter below
// since it needs a per-acronym regex rather than a plain substring check.
// Individual-officer stalking stories often say "officer"/"deputy"/
// "detective"/"trooper"/"cop" without ever saying "police" or naming a
// department, so those need to be recognized too. "cop"/"cops" is checked
// separately via COP_TEST_RE below (word-boundary regex, not a plain
// substring) since unlike the others it's short enough to false-positive
// inside ordinary words ("scope", "coping").
const LAW_ENFORCEMENT_TERMS = [
  "police", "sheriff", "law enforcement", "officer", "deputy", "detective", "trooper",
];
const COP_TEST_RE = /\bcops?\b/i;
const COMPANY_ACTOR_TERMS = [
  "flock employee", "flock safety employee", "flock staff", "flock safety staff",
  "flock worker", "flock safety worker", "flock executive", "flock safety executive",
  "company employee", "corporate worker", "corporate employee", "sales rep", "salesperson",
];

// Must match at least one *alongside* an actor mention above — covers
// confirmed-misuse stories (lawsuit, audit, illegal...), the broader
// accountability angle (a department's contract decision, privacy/
// oversight coverage), and — deliberately called out, not just folded
// into "misuse" — an officer or Flock employee using camera access to
// stalk exes or partners, surveil women or kids, or track people seeking
// abortion care. These are exactly the kind of story this project must
// not miss, and a headline about them won't always say "misuse" outright.
// Moderate broaden, not maximal: this still requires the actor-terms check
// above to also pass, so pure Flock product/marketing coverage stays out.
const MISUSE_TERMS = [
  "misuse", "abuse", "unauthorized", "violation", "violat", "lawsuit",
  "scandal", "audit", "overreach", "without a warrant", "illegal",
  "improper", "wrongful", "banned", "unlawful", "privacy", "civil liberties",
  "surveillance", "oversight", "transparency", "contract", "data sharing",
  "stalk", "stalking", "ex-girlfriend", "ex-boyfriend", "ex-wife", "ex-husband",
  "domestic violence", "romantic partner", "abortion", "reproductive",
  "spying on", "spy on", "children", "kids", "minor", "minors",
];

const PD_ACRONYM_TEST_RE = new RegExp(String.raw`\b(${KNOWN_PD_ACRONYMS.join("|")})\b`, "i");

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildDateQuery(windowDays: number): string {
  // when: is documented and reliable up to 1y; anything longer uses
  // after:/before: date ranges instead, since when: beyond ~1y is
  // undocumented and its behavior isn't guaranteed by Google.
  if (windowDays <= 30) {
    return `when:${windowDays}d`;
  }

  const now = new Date();
  const after = new Date(now);
  after.setDate(after.getDate() - windowDays);
  const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD
  return `after:${fmt(after)} before:${fmt(now)}`;
}

function buildDateQuerySince(startDate: string): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `after:${startDate} before:${fmt(new Date())}`;
}

async function runMisuseReportsQuery(
  dateQuery: string,
): Promise<{ newsItems: MisuseReportItem[]; errorMessage: string | null }> {
  const rawQuery =
    `("Flock Safety" OR "Flock camera" OR "license plate reader" OR "license plate camera" OR ALPR OR "mass surveillance") ` +
    `(police OR sheriff OR officer OR deputy OR detective OR trooper OR cop OR cops OR "police department" OR LAPD OR NYPD OR CPD OR employee OR employees OR staff OR "sales rep") ` +
    `(misuse OR abuse OR unauthorized OR violation OR lawsuit OR scandal OR audit OR overreach OR "without a warrant" OR illegal OR privacy OR "civil liberties" OR surveillance OR oversight OR contract OR stalk OR stalking OR "ex-girlfriend" OR "ex-boyfriend" OR "domestic violence" OR abortion OR reproductive OR "spying on" OR children OR kids) ` +
    dateQuery;
  const query = encodeURIComponent(rawQuery);
  const googleNewsUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  // Force an early escape if the internal environment hangs during build or HMR
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(googleNewsUrl, {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { newsItems: [], errorMessage: "Feed momentarily unavailable." };
    }

    const xmlText = await response.text();
    const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];

    const parsed = itemMatches.map((itemXml) => {
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);

      let fullTitle = titleMatch ? titleMatch[1] : "Report";
      let source = sourceMatch ? sourceMatch[1] : "News";
      const description = descMatch ? descMatch[1] : "";

      if (fullTitle.includes(` - ${source}`)) {
        fullTitle = fullTitle.split(` - ${source}`)[0];
      }

      const combinedText = `${fullTitle} ${description}`;
      const haystack = ` ${combinedText} `.toLowerCase();

      return {
        title: fullTitle,
        url: linkMatch ? linkMatch[1] : "#",
        published: pubDateMatch ? pubDateMatch[1] : new Date().toString(),
        source,
        combinedText,
        haystack,
      };
    });

    const newsItems = parsed
      .filter((item) => {
        const hasCamera = CAMERA_TERMS.some((t) => item.haystack.includes(t));
        const hasActor =
          LAW_ENFORCEMENT_TERMS.some((t) => item.haystack.includes(t)) ||
          PD_ACRONYM_TEST_RE.test(item.combinedText) ||
          COP_TEST_RE.test(item.combinedText) ||
          COMPANY_ACTOR_TERMS.some((t) => item.haystack.includes(t));
        const hasMisuse = MISUSE_TERMS.some((t) => item.haystack.includes(t));
        return hasCamera && hasActor && hasMisuse;
      })
      .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())
      .map(({ combinedText, haystack, ...item }) => ({
        ...item,
        location: locateArticle(combinedText),
      }));

    return { newsItems, errorMessage: null };

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn("⚠️ Miniflare safety fallback triggered. Bypassing misuse-report fetch.");
    return { newsItems: [], errorMessage: "Reports temporarily unavailable in dev environment." };
  }
}

export async function fetchMisuseReports(
  windowDays: number = 7,
): Promise<{ newsItems: MisuseReportItem[]; errorMessage: string | null }> {
  return runMisuseReportsQuery(buildDateQuery(windowDays));
}

// Widest available backfill: queries from an explicit start date (e.g. a
// company's founding date) through today, rather than a rolling window.
// Google News RSS still caps results per query at ~100 items ranked by its
// own relevance/recency — this doesn't guarantee exhaustive historical
// coverage, just the widest single query Google's search will accept.
export async function fetchMisuseReportsSince(
  startDate: string,
): Promise<{ newsItems: MisuseReportItem[]; errorMessage: string | null }> {
  return runMisuseReportsQuery(buildDateQuerySince(startDate));
}
