// src/lib/newsFilter.mjs
//
// What counts as a Minnesota surveillance/enforcement story, and — the part
// with no counterpart in the project this was ported from — what must never be
// stored even when it matches.
//
// Ported from ngabantudev/mndatacenter's `src/lib/newsFeed.ts`, which built the
// relevance machinery here (two geography queries, the outlet signal, the state
// and national-scope guards, the duplicate collapse) against measured Google
// News behaviour. Those parts are carried over close to verbatim and the
// measurements behind them are kept in the comments, because a constant whose
// justification was deleted is a constant the next person will "clean up".
//
// THE PART THAT IS NEW, AND WHY.
//
// That project watches data centers. A data center headline has no person in
// it. This project watches ALPR contracts, 287(g) agreements, detention
// facilities and immigration enforcement, and a raw Google News query on those
// terms returns person-level content constantly — someone held, someone
// removed, someone charged, a named deputy, a family at a vigil. CLAUDE.md §1b
// puts every one of those permanently out of scope, and it does not say "out of
// scope for publication": it says not ingested, not cached, not mirrored, in
// any form. A headline that reaches `public/data/` has been ingested and cached
// and committed to git, where it is permanent.
//
// So the person screen runs before anything is written, it is deliberately
// over-inclusive (§1b's "when in doubt, leave it out"), and a rejected item is
// COUNTED, NEVER STORED. `screenForPeople` returns the rule that fired so the
// ingest script can report aggregate rejection counts — §1b permits aggregates
// and §3 requires coverage honesty — without the headline itself surviving
// anywhere on disk.
//
// NOTE FOR ANYONE EDITING THIS FILE, INCLUDING AUTOMATED TOOLING: the patterns
// below necessarily contain the vocabulary they exist to reject. That is what a
// filter is, and it is why the civic-standards scope tripwire blocks edits here
// — the hook exempts files whose job is to *state* the policy (CLAUDE.md,
// SKILL.md) but has no case for a file whose job is to *enforce* it. Do not
// rewrite these patterns into fragments or obfuscate the literals to satisfy a
// scanner: this is the one file in the repo where those words belong, and
// keeping them plainly readable is what makes the screen auditable.
//
// This module is dependency-free and importable from both the ingest script
// (Node) and the build-time reader, same contract as ~/lib/geo.mjs.

/**
 * The apparatus this project watches, as the topic half of the query.
 *
 * One query per topic rather than a single OR'd query, for the reason
 * mndatacenter measured and documented: Google's RSS response is capped at ~100
 * items per search whatever is asked, so terms compete for one fixed budget and
 * widening a query trades coverage rather than adding it. Separate searches get
 * separate budgets.
 *
 * The phrasing is deliberately the vendor's and the statute's, not the
 * reader's. "287(g)" appears in headlines as often as "immigration agreement",
 * and the parenthesised form is what a clerk writes.
 */
export const TOPIC_QUERIES = [
  '"license plate reader" OR "license plate readers" OR ALPR',
  '"Flock Safety" OR "surveillance camera" OR "facial recognition"',
  '"287(g)" OR "immigration enforcement" OR "ICE detainer"',
  '"immigration detention" OR "detention facility" OR "ICE contract"',
];

/**
 * Plain-language topic labels, applied after the fetch so the feed can be
 * grouped without a second pass over the text. §0.9 — the reader gets the
 * words, not the query that found them.
 *
 * First match wins, so the order matters: a story naming both a plate reader
 * and a detention contract files under the plate reader, which is the more
 * specific of the two.
 */
const TOPIC_RULES = [
  { topic: 'alpr', terms: ['license plate reader', 'license plate readers', 'alpr', 'plate reader', 'flock safety'] },
  { topic: 'surveillance', terms: ['surveillance camera', 'facial recognition', 'fusion center', 'drone', 'gunshot detection', 'shotspotter'] },
  { topic: 'immigration-enforcement', terms: ['287(g)', '287g', 'immigration enforcement', 'ice detainer', 'detainer', 'sanctuary'] },
  { topic: 'detention', terms: ['immigration detention', 'detention facility', 'detention center', 'ice facility', 'ice detention', 'bed-day', 'jail contract', 'ice contract'] },
];

/** Which topic a story belongs to, or `other` when nothing specific matched. */
export function classifyTopic(haystack) {
  for (const rule of TOPIC_RULES) {
    if (rule.terms.some((t) => haystack.includes(t))) return rule.topic;
  }
  return 'other';
}

/**
 * Must match at least one of these — establishes the story is actually about
 * the apparatus rather than about something the topic query caught sideways.
 *
 * "ice" is not here and cannot be: it matches ice storms, ice rinks, and the
 * Minnesota Wild. The agency reaches this list through the longer phrases
 * instead.
 */
const SUBJECT_TERMS = [
  'license plate reader', 'license plate readers', 'plate reader', 'alpr',
  'flock safety', 'surveillance camera', 'surveillance system', 'facial recognition',
  'fusion center', 'gunshot detection', 'shotspotter', 'drone program',
  '287(g)', '287g', 'immigration enforcement', 'immigration agent',
  'detainer', 'immigration detention', 'detention facility', 'detention center',
  'ice contract', 'ice agreement', 'ice facility', 'immigration raid',
  'sanctuary city', 'sanctuary county', 'data practices', 'surveillance technology',
];

/**
 * Twin Cities metro counties, matched as "<name> county" phrases rather than
 * bare county names.
 *
 * Inherited wholesale from mndatacenter, including the two deliberate
 * omissions, because the collisions it measured are properties of the county
 * names and not of the topic: over a 30-day window `"Washington County"`
 * returned 57 stories and not one was Minnesota's (Oregon, Maryland and Alabama
 * supplied them), and `"Scott County"` returned 33 of which exactly one was.
 * Both are covered by their city names in MINNESOTA_TERMS instead, which do not
 * collide. If anything the collision is worse here than there: Washington
 * County, Oregon and Scott County, Kentucky both run their own ALPR programs.
 */
const METRO_COUNTY_TERMS = [
  'anoka county',
  'carver county',
  'dakota county',
  'hennepin county',
  'ramsey county',
];

/**
 * Counties outside the metro that carry real proceedings on these topics.
 *
 * Sherburne is here for a reason specific to this project rather than
 * inherited: the county jail has a long-running intergovernmental agreement
 * history on the detention topic, so it is one of the highest-signal county
 * names in the state, and the name is Minnesota's alone.
 *
 * Freeborn, Kandiyohi and Nobles are here on the same basis. All four are
 * county names with no out-of-state twin filing under the same phrase — the
 * test METRO_COUNTY_TERMS' two omissions failed.
 */
const EXURBAN_COUNTY_TERMS = ['sherburne county', 'freeborn county', 'kandiyohi county', 'nobles county'];

/**
 * Minnesota news outlets, matched against an item's `<source>`.
 *
 * The place list below can only see the headline and Google's one-line
 * description, so it misses any story that names a town in its body and not its
 * title — which is most of them. The outlet is the signal that recovers those:
 * a 287(g) story filed by the Star Tribune is Minnesota coverage by
 * construction.
 *
 * Sahan Journal and the Minnesota Reformer carry disproportionate weight on
 * these particular topics — they file much of the state's immigration
 * enforcement reporting — which is the main reason this list is worth
 * maintaining at all rather than gating on place names alone.
 */
const MINNESOTA_SOURCE_TERMS = [
  'star tribune', 'minnpost', 'pioneer press', 'hometownsource', 'southernminn',
  'post bulletin', 'west central tribune', 'bring me the news',
  '5 eyewitness news', 'kare11', 'kare 11', 'wcco', 'fox 9',
  'krwc', 'kymn', 'keyc', 'mpr news', 'minnesota public radio',
  'sahan journal', 'minnesota reformer', 'finance & commerce',
  'duluth news tribune', 'mankato free press', 'brainerd dispatch',
  'st. cloud live', 'alpha news', "minnesota women's press",
  'racket', 'minnesota daily', 'unicorn riot',
  // Community outlets, added only after checking Google News actually files
  // them under their own name — see the knownGaps note in
  // scripts/ingest/mn/news.mjs for the outlets that failed that check and why
  // no entry here would help them.
  'minnesota spokesman-recorder', 'the circle news',
];

/** The check that keeps the outlet signal honest. See `hasMinnesota`. */
export function isLocalOutlet(source) {
  const name = (source ?? '').toLowerCase();
  return MINNESOTA_SOURCE_TERMS.some((t) => name.includes(t));
}

/**
 * Scope guard for stories resting entirely on their outlet.
 *
 * A Minnesota paper's coverage of the apparatus at large is not Minnesota
 * coverage of it, and this topic produces far more national wire copy than data
 * centers do — every federal policy change generates a national story that
 * every local paper reprints. Applied only to items that named no Minnesota
 * place at all, so a Star Tribune piece on a federal rule's effect on Sherburne
 * County is unaffected.
 */
const NATIONAL_SCOPE_PATTERN =
  /\b(rural america|across america|nationwide|across the country|the u\.?s\.?|united states|nationally|nation's|federal government|white house|congress|supreme court|globally|worldwide|every state|other states|50 states)\b/;

const OTHER_STATE_PATTERN = new RegExp(
  `\\b(${[
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
    'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
    'maryland', 'massachusetts', 'michigan', 'mississippi', 'missouri',
    'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
    // The Dakotas appear in their welded form because the haystack is
    // normalised before any of this runs — see `buildHaystack`.
    'new mexico', 'new york', 'north carolina', 'north_dakota_state', 'ohio',
    'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
    'south_dakota_state', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
    // "washington" alone would match the federal shorthand and Washington,
    // D.C., which NATIONAL_SCOPE_PATTERN already covers by other means; the
    // state needs its qualified form to be excludable at all.
    'washington state', 'west virginia', 'wisconsin', 'wyoming',
  ].join('|')})\\b`,
);

/**
 * Establishes Minnesota relevance without depending on the literal word
 * "Minnesota" appearing in the article.
 *
 * The city list is mndatacenter's, minus its data-center hub towns and plus the
 * places that carry this project's subject: county seats whose jails have
 * federal agreement history, and the cities whose councils have voted on ALPR
 * contracts.
 */
const MINNESOTA_TERMS = [
  'minnesota',
  ' mn ',
  'twin cities',
  ...METRO_COUNTY_TERMS,
  ...EXURBAN_COUNTY_TERMS,
  // Largest MN cities by population.
  'minneapolis', 'st. paul', 'saint paul', 'rochester', 'duluth', 'bloomington',
  'brooklyn park', 'plymouth', 'maple grove', 'woodbury', 'st. cloud',
  'saint cloud', 'eagan', 'eden prairie', 'burnsville', 'coon rapids', 'blaine',
  'lakeville', 'minnetonka', 'apple valley', 'edina', 'st. louis park',
  'saint louis park', 'richfield', 'roseville', 'brooklyn center',
  // Washington and Scott county seats and larger cities, standing in for the
  // two county names held out of METRO_COUNTY_TERMS above.
  'stillwater', 'cottage grove', 'oakdale', 'forest lake', 'savage', 'prior lake',
  'shakopee',
  // Remaining Anoka County population centers.
  'anoka', 'andover', 'fridley', 'champlin',
  // Places carrying this project's subject specifically: county seats with
  // federal agreement history, and the regional centers whose departments run
  // ALPR.
  'elk river', 'albert lea', 'willmar', 'worthington', 'moorhead', 'mankato',
  'winona', 'austin', 'faribault', 'northfield', 'red wing',
  'bemidji', 'brainerd', 'hibbing', 'marshall', 'owatonna',
];

/**
 * Geography half of the query, as two searches rather than one.
 *
 * The first string is byte-identical to a bare `Minnesota` on purpose.
 * mndatacenter measured that merely grouping the term — widening it to
 * `(Minnesota OR "Twin Cities")` — reordered what Google fits under the cap and
 * silently dropped stories that the bare term returned in every sample. Leaving
 * it untouched is what makes the second search additive by construction rather
 * than by measurement.
 */
export const GEOGRAPHY_QUERIES = [
  'Minnesota',
  `(${[
    '"Twin Cities"',
    ...[...METRO_COUNTY_TERMS, ...EXURBAN_COUNTY_TERMS].map(
      (county) => `"${county.replace(/\b\w/g, (c) => c.toUpperCase())}"`,
    ),
  ].join(' OR ')})`,
];

/* ------------------------------------------------------------------ *
 * §1b — the person screen.
 *
 * Everything below this line exists because of CLAUDE.md §1b and §0.10. It is
 * the floor, it is meant to be expensive, and widening the feed is never a
 * reason to loosen it.
 * ------------------------------------------------------------------ */

/**
 * Headline patterns that mean the story is about a person rather than about the
 * apparatus. Any match rejects the item outright.
 *
 * Grouped by the §1b clause each one serves, because the next person to edit
 * this needs to know which rule they would be reopening.
 *
 * These are intentionally blunt. The two errors are not symmetric: dropping a
 * systemic story costs us one lead, which the archive will very likely pick up
 * again from another outlet next week, while admitting one person-level story
 * writes that person into a public git repository permanently. §1b settles that
 * trade in advance so it is not re-argued per headline.
 */
const PERSON_RULES = [
  {
    // §1b, first clause — anyone subject to enforcement.
    rule: 'enforcement-subject',
    pattern:
      /\b(detained|detainee|detainees|arrested|arrest of|deported|deportation of|facing deportation|in custody|taken into custody|released from|charged with|pleads?|pleaded|convicted|sentenced|indicted|faces? charges|awaiting trial|removal proceedings|asylum seeker|asylum-seeker|undocumented (man|woman|immigrant|resident|student|worker|father|mother)|green card holder|visa holder|accused|accused of|felony|misdemeanor|booked into|jailed|returns? home from|criminal charges)\b/,
  },
  {
    // The person-shaped headline, added after the first live measurement.
    // "Man accused of cutting down license plate reader camera in St. Cloud",
    // "Sauk Rapids man faces felony charge", and "Minnesota boy, father return
    // home from Texas ICE detention facility" all cleared every rule above:
    // each is about the apparatus by subject and about a person by content.
    // The tell is not the verb — it is a bare common noun standing in for a
    // name, which is how a newsroom writes about an individual it is not
    // naming. An institution is never "a man".
    rule: 'person-subject-headline',
    pattern:
      /\b(man|woman|boy|girl|teen|teenager|child|toddler|father|mother|couple|grandmother|grandfather|driver|passenger|student|worker|resident)\b[^.]{0,40}\b(accused|charged|arrested|jailed|sentenced|convicted|faces|face|pleads|pleaded|returns|return|deported|detained|identified|held|freed|released|sues|sued)\b/,
  },
  {
    // §1b, second clause — rank-and-file officers, agents, corrections staff.
    rule: 'line-personnel',
    pattern:
      /\b(deputy|deputies|patrol officer|police officer|corrections officer|jailer|trooper|off-duty|badge number|body camera footage of|the officer who|the deputy who|the agent who|fired officer|officer identified|names? the officer)\b/,
  },
  {
    // §1b, fifth clause — residents, commenters, petitioners, witnesses — and
    // the private life of anyone at all. Family framing is the reliable tell.
    rule: 'private-person',
    pattern:
      /\b(family of|mother of|father of|son of|daughter of|widow|his wife|her husband|loved ones|vigil for|gofundme|funeral|obituary|remembered as|speaks out|tells (his|her|their) story)\b/,
  },
  {
    // Crime reporting generally. These stories reach the feed through the
    // surveillance terms — a plate reader is credited with an arrest — and the
    // arrest is the part §1b forbids.
    rule: 'crime-report',
    pattern:
      /\b(shooting|shot and|homicide|murder|stabbing|assault|kidnapping|carjacking|manhunt|suspect|suspects|wanted man|wanted woman|fugitive|victim|victims|missing (man|woman|girl|boy|teen)|standoff|body found|human remains)\b/,
  },
  {
    // §1b, fourth clause — people captured by surveillance systems. A headline
    // that quotes a plate or describes a specific vehicle is the thing the
    // project refuses to build, arriving as news.
    rule: 'surveillance-subject',
    pattern:
      /\b(license plate number|plate number|caught on camera|captured on camera|surveillance footage shows|tracked (his|her|their) (car|vehicle|movements)|identified through|facial recognition (match|identified|led to))\b/,
  },
];

/**
 * Screen one item for person-level content.
 *
 * Takes the same normalised haystack the relevance filters use, so the title
 * and Google's description are both covered — the description is where a
 * headline about "a Rochester man" usually turns out to be about an arrest.
 *
 * @returns {{ok: true} | {ok: false, rule: string}}
 */
export function screenForPeople(haystack) {
  for (const { rule, pattern } of PERSON_RULES) {
    if (pattern.test(haystack)) return { ok: false, rule };
  }
  return { ok: true };
}

/** Every rule name, so the ingest script can report a zero for rules that never fired. */
export const PERSON_RULE_NAMES = PERSON_RULES.map((r) => r.rule);

/* ------------------------------------------------------------------ *
 * Relevance
 * ------------------------------------------------------------------ */

/**
 * Normalise a title and description into the string every filter matches on.
 *
 * The Dakotas are rewritten before matching because "North Dakota county
 * commissioner" literally contains the substring "dakota county", which
 * introduced both Dakotas to a Minnesota feed the moment the county list
 * arrived. The sentinel has to end in something other than "dakota": joining
 * the words to "north_dakota" leaves "north_dakota county", which still
 * contains "dakota county" one character in. `\b` keeps Minnesota's own bare
 * "Dakota County" untouched.
 */
export function buildHaystack(title, description) {
  return ` ${title} ${description} `
    .toLowerCase()
    .replace(/\b(north|south) dakota\b/g, '$1_dakota_state');
}

/** Does this story name the apparatus? */
export function hasSubject(haystack) {
  return SUBJECT_TERMS.some((t) => haystack.includes(t));
}

/**
 * Does this story belong to Minnesota?
 *
 * Satisfied either by a place named in the headline or by the outlet being a
 * Minnesota one — and in the second case only when the story names no other
 * state and carries no national framing. The source is checked separately from
 * the haystack rather than folded into it, so an outlet name can never stand in
 * for the subject half of the test.
 */
export function hasMinnesota(haystack, source) {
  const namesPlace = MINNESOTA_TERMS.some((t) => haystack.includes(t));
  if (namesPlace) return true;
  return (
    isLocalOutlet(source) &&
    !OTHER_STATE_PATTERN.test(haystack) &&
    !NATIONAL_SCOPE_PATTERN.test(haystack)
  );
}

/* ------------------------------------------------------------------ *
 * Non-articles
 *
 * Google News RSS returns more than articles. The first live measurement of
 * this feed returned two kinds of thing that are not stories at all, and both
 * cleared every relevance and person rule above:
 *
 *   - a bare topic tag page, titled exactly "Immigration Enforcement
 *     Minnesota", filed by two different outlets. A tag page has no date that
 *     means anything and no content to cite.
 *   - sports-stream spam, "Milwaukee Brewers Vs Minnesota Twins Live-MLB 1 Game
 *     Score Radio Broadcast Play By Play Watch Along Croydon Facial Recognition
 *     Arrests (XRQ3myiKZ7)", which reaches a surveillance feed by keyword
 *     stuffing and carries a tracking token in parentheses.
 *
 * Both are cheap to recognise and neither is a judgement call, which is why
 * this is separate from the relevance filters rather than folded into them.
 * ------------------------------------------------------------------ */

const SPAM_PATTERN =
  /\b(live[- ]?stream|livestream|watch along|play by play|full match|(game|match|video|full) highlights|box score|radio broadcast|game score)/i;

/*
 * Two words were removed from SPAM_PATTERN after they were found to reject
 * ordinary coverage:
 *
 *   - a bare `highlights`, which is plain headline English — "Audit highlights
 *     gaps in plate reader policy" is exactly the kind of story this feed
 *     exists for, and it was being filed as sports spam. Narrowed to the
 *     compound forms a stream listing actually uses.
 *   - `vs\.?\s`, which matches every "privacy vs. safety" framing and every
 *     case caption. The measured spam listing carries five other tells in the
 *     same title, so nothing is lost by dropping it.
 */

/** A stuffed title's tracking token, e.g. "(XRQ3myiKZ7)". */
const JUNK_TOKEN_PATTERN = /\([A-Za-z0-9_-]{8,}\)/;

/**
 * Vocabulary a tag page can be built out of: the words this feed searches for.
 *
 * Built from the same lists the relevance filters use, so it cannot drift from
 * them — a term added to SUBJECT_TERMS becomes a term a tag page may be made of
 * on the same edit.
 */
const QUERY_VOCABULARY = new Set(
  [...SUBJECT_TERMS, ...MINNESOTA_TERMS]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean),
);

/** Filler that carries no topic on its own, so it cannot make a title a story. */
const ECHO_FILLER = new Set(['and', 'in', 'of', 'the', 'a', 'an', 'for', 'on', 'at', 'to', 'news', 'latest']);

/**
 * Is this title just the search query handed back?
 *
 * The word-count floor this replaces was wrong, and measurably so: it rejected
 * any title of three words or fewer, which threw away real headlines —
 * "Duluth cancels Flock" and "ICE contract signed" are stories, and both were
 * being discarded as tag pages.
 *
 * Length was never the signal. The tag page actually observed in the wild was
 * "Immigration Enforcement Minnesota", and what makes it a tag page is that
 * every word in it is a word this feed searched for: there is no verb, no
 * actor, nothing the query did not already contain. A real headline reports
 * something, so it contributes at least one word from outside the query —
 * "cancels", "signed", "adopts".
 *
 * Bounded to short titles as well, because a long title made entirely of
 * vocabulary is far more likely to be a genuine headline than a tag page, and
 * the cost of being wrong is a dropped story.
 */
function isQueryEcho(title) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return words.every((w) => QUERY_VOCABULARY.has(w) || ECHO_FILLER.has(w));
}

/**
 * Is this a tag page, a stream-spam listing, or otherwise not a story?
 */
export function isNonArticle(title) {
  if (isQueryEcho(title)) return true;
  if (SPAM_PATTERN.test(title)) return true;
  if (JUNK_TOKEN_PATTERN.test(title)) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Duplicate collapse
 * ------------------------------------------------------------------ */

/**
 * Words carried by so much of this feed that counting them would make any two
 * headlines look alike, plus ordinary English filler.
 */
const DUPLICATE_STOP_WORDS = new Set(
  ('a an the and or but of in on at to for with from by as is are was were be ' +
    'been that this it its into over under after before more most new news say ' +
    'says said will would can could what when where who why how than then them ' +
    'they their there here about against during up down out off ' +
    'minnesota mn county city police sheriff department').split(' '),
);

function contentWords(title) {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !DUPLICATE_STOP_WORDS.has(w)),
  );
}

function overlap(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * How alike two headlines must be to count as the same story, and how close
 * together they must have run.
 *
 * Both conservative, because the two errors are not equally bad: showing one
 * story twice is untidy, and collapsing two different stories into one hides
 * local reporting from someone trying to follow a fight in their own town. Only
 * the second is a lie. mndatacenter measured 0.55 as the lowest setting at
 * which every collapse over a year of its feed was a genuine repeat, and 0.50
 * as where it starts merging two different council votes a fortnight apart.
 *
 * The date window is what stops a recurring story from eating itself: the same
 * outlet's "council to vote on ALPR contract" and "council discusses ALPR
 * contract" can be two meetings and twenty days apart.
 */
const DUPLICATE_OVERLAP = 0.55;
const DUPLICATE_WINDOW_DAYS = 7;

/**
 * Collapse syndicated and wire-copy repeats of one story.
 *
 * Keeps the Minnesota outlet's version when the cluster has one, on the grounds
 * that a reader following a local fight is better served by the paper covering
 * it than by the aggregator that reprinted it. Otherwise keeps the first —
 * the list arriving sorted, that is the most recent.
 */
export function collapseDuplicates(items) {
  const kept = [];

  for (const item of items) {
    const words = contentWords(item.title);
    const at = new Date(item.published).getTime();
    const twin = kept.find(
      (k) =>
        Math.abs(at - k.at) <= DUPLICATE_WINDOW_DAYS * 86_400_000 &&
        overlap(words, k.words) >= DUPLICATE_OVERLAP,
    );

    if (!twin) {
      kept.push({ item, words, at });
      continue;
    }

    if (isLocalOutlet(item.source) && !isLocalOutlet(twin.item.source)) {
      // The comparison keys move with the item they describe. Leaving the
      // discarded version's words and date in place meant every later item in
      // the run was matched against a headline that is no longer in the output.
      twin.item = item;
      twin.words = words;
      twin.at = at;
    }
  }

  // Re-sorted because the swap above can replace a cluster's kept item with an
  // older one, which leaves `kept` in insertion order but no longer in date
  // order — and the caller writes this array straight to the published file,
  // which the feed renders in order.
  return kept.map((k) => k.item).sort(byPublishedDesc);
}

/** Newest first. */
export function byPublishedDesc(a, b) {
  return new Date(b.published).getTime() - new Date(a.published).getTime();
}
