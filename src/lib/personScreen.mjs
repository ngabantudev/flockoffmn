// src/lib/personScreen.mjs
//
// CLAUDE.md §1b, as code. Nothing here is about news.
//
// This was extracted from ~/lib/newsFilter.mjs, where it had been sitting
// underneath 280 lines about what counts as a Minnesota surveillance headline.
// The screen is not news-specific — it answers "does this free text describe an
// individual" — and §1d already names the repo's structural enforcement points
// (`src/layers/types.ts`, `src/lib/authority.mjs`) as top-level modules rather
// than as sections inside a feature's helper. This belongs at that altitude.
//
// The concrete reason to split it now rather than later: §1b's third bullet
// promises a community submission path whose free-text fields must be
// structurally rejected before publication. Whoever builds that either
// re-implements this screen or imports something called `newsFilter`. Both end
// with two person screens that drift apart, and §1b is the one rule in this
// repo that must not have two implementations.
//
// NOTE FOR ANYONE EDITING THIS FILE, INCLUDING AUTOMATED TOOLING: the patterns
// below necessarily contain the vocabulary they exist to reject. That is what a
// filter is, and it is why the civic-standards scope tripwire blocks edits here
// — the hook exempts files whose job is to *state* the policy (CLAUDE.md,
// SKILL.md) but has no case for a file whose job is to *enforce* it. Do not
// rewrite these patterns into fragments or obfuscate the literals to satisfy a
// scanner: keeping them plainly readable is what makes the screen auditable.


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
    //
    // Widened after three person-level headlines were found sitting in the
    // committed archive, having passed every rule here. The gaps were narrow
    // and specific: `in custody` was matched but `from custody` was not, so an
    // escape read as systemic; `remains in detention` had no verb in either
    // rule; and a headline opening `Charge:` announced a prosecution the
    // alternation did not recognise. None of these are exotic phrasings — they
    // are how a newsroom ordinarily writes about an individual, which is the
    // point: the screen has now leaked three times, and each time the leak was
    // a synonym rather than a new category.
    rule: 'enforcement-subject',
    pattern:
      /\b(detained|detainee|detainees|arrested|arrest of|deported|deportation of|facing deportation|in custody|taken into custody|released from|charged with|pleads?|pleaded|convicted|sentenced|indicted|faces? charges|awaiting trial|removal proceedings|asylum seeker|asylum-seeker|undocumented (man|woman|immigrant|resident|student|worker|father|mother)|green card holder|visa holder|accused|accused of|felony|misdemeanor|booked into|jailed|returns? home from|criminal charges|from custody|out of custody|escapes?|escaped|remains in custody|remains in detention|remains in ice|still in custody|still detained|charge:|charged:)\b/,
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
      /\b(man|woman|boy|girl|teen|teenager|child|toddler|father|mother|couple|grandmother|grandfather|driver|passenger|student|worker|resident)\b[^.]{0,40}\b(accused|charged|arrested|jailed|sentenced|convicted|faces|face|pleads|pleaded|returns|return|deported|detained|identified|held|freed|released|sues|sued|escapes|escaped|flees|fled|remains|remain|tried|sought|solicited|hired)\b/,
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

