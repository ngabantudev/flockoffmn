/**
 * Who has to answer you, for a given piece of Minnesota ground.
 *
 * The map answers "what is here". This answers the question a reader has
 * immediately afterwards and which the site previously left them to work out
 * alone: *and who do I write to about it*. The letter generator on the Take
 * Action page has always been able to address a body — but only if the reader
 * already knew which body to name, which is precisely what somebody looking at
 * a camera down their road does not know.
 *
 * Shared by the build and the browser, for the same reason `geo.mjs` is: the
 * office named beside a record on one page and the address on a generated
 * letter on another have to be the same office.
 *
 * ## What this module will and will not claim
 *
 * Every office below is the one Minnesota statute names, cited in place. Under
 * Minn. Stat. § 13.02, subd. 16(b) a political subdivision's governing body
 * designates its responsible authority, and *until it does* the statute fixes
 * a default — the county coordinator or administrator, the city clerk, the
 * chief clerical officer. Those defaults are what this module returns, because
 * they are knowable from public law for all 2,757 jurisdictions in the state.
 * A specific designation is knowable only by asking the entity, so the UI says
 * "unless your board has designated someone else" rather than asserting a
 * person. We never name an individual: this file returns offices.
 *
 * The prose lives in the i18n dictionaries, keyed by the office ids here.
 * Statutes are not translatable — a citation and a revisor URL are the same in
 * every language — so those stay in this file, next to the rule they support.
 */

/** Minnesota Revisor deep link for a statute citation. */
const revisor = (cite) => `https://www.revisor.mn.gov/statutes/cite/${cite}`;

/**
 * The statutory defaults of Minn. Stat. § 13.02, subd. 16(b), verbatim in
 * effect: "Until an individual is designated by the political subdivision's
 * governing body, the responsible authority is: (1) for counties, the county
 * coordinator or administrator. If the county does not employ a coordinator or
 * administrator, the responsible authority is the county auditor; (2) for
 * statutory or home rule charter cities, the elected or appointed city clerk
 * […]; (4) for all other political subdivisions, the chief clerical officer
 * for filing and record keeping purposes."
 *
 * Clause (4) is the one that covers a Minnesota town, and the chief clerical
 * officer of a town is its clerk — Minn. Stat. § 367.11 gives the town clerk
 * custody of "the records, books, and papers of the town".
 */
export const OFFICES = {
  townClerk: {
    id: 'townClerk',
    cite: '13.02',
    subdivision: 'subd. 16(b)(4)',
    url: revisor('13.02'),
    also: { cite: '367.11', url: revisor('367.11') },
  },
  cityClerk: {
    id: 'cityClerk',
    cite: '13.02',
    subdivision: 'subd. 16(b)(2)',
    url: revisor('13.02'),
  },
  countyAdministrator: {
    id: 'countyAdministrator',
    cite: '13.02',
    subdivision: 'subd. 16(b)(1)',
    url: revisor('13.02'),
  },
  lawEnforcement: {
    id: 'lawEnforcement',
    cite: '13.824',
    subdivision: null,
    url: revisor('13.824'),
  },
  commissioner: {
    id: 'commissioner',
    cite: '13.072',
    subdivision: null,
    url: revisor('13.072'),
  },
};

/**
 * What to call a jurisdiction on screen: "Waterford Township", "Minneapolis".
 *
 * Census writes the class in lower case and abbreviates unorganized territory
 * to "UT", which reads as a typo in a sentence and as a state abbreviation in
 * a letter. A township keeps its suffix, because it is part of the name and
 * because Minnesota has a Waterford township in Dakota County and a Waterford
 * in Rice County next door — the word is how a reader tells them apart. A city
 * drops it: nobody searches for "Minneapolis City".
 */
export function displayName(name) {
  if (!name) return '';
  return name
    .replace(/\s+UT$/, ' Unorganized Territory')
    .replace(/\s+township$/, ' Township')
    .replace(/\s+city$/, '');
}

/**
 * What to write on an envelope: "Waterford Township", "City of Minneapolis".
 *
 * Deliberately not the same function as `displayName`. A letter is addressed
 * to a legal entity and "Minneapolis City" is not one, while a list of search
 * results wants the short form a reader typed. Getting these backwards
 * produces either a search nobody can use or a letter addressed to a body that
 * does not exist under that name, so they are separate and each is used in
 * exactly one place.
 */
export function entityName(name) {
  if (!name) return '';
  if (/\s+city$/.test(name)) return `City of ${name.replace(/\s+city$/, '')}`;
  return displayName(name);
}

/**
 * @typedef {object} Jurisdiction
 * @property {string} geoid
 * @property {string} name
 * @property {'city'|'township'|'unorganized'} kind
 * @property {boolean} governed
 * @property {string} county
 * @property {string} countyFips
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {object} Office
 * @property {string} id Key into the i18n dictionary, as `office<Id>`.
 * @property {string} cite Minnesota statute chapter or section.
 * @property {string|null} subdivision Subdivision within the section, if any.
 * @property {string} url Revisor deep link.
 * @property {{cite: string, url: string}} [also] A second section worth citing.
 */

/**
 * @typedef {object} Authority
 * @property {'local'|'county'|'lawEnforcement'|'state'} level
 * @property {'city'|'township'|'unorganized'|'county'|'sheriff'|'state'} kind
 * @property {string} entity The body's name, as it should be written to.
 * @property {Office} office The office within it that must answer.
 * @property {boolean} elected Whether voters choose this body directly.
 * @property {boolean} [isLocalGovernment] County only: true when the county is
 *   the local government because the ground has none of its own.
 */

/**
 * The chain of bodies that answer for one point, nearest first.
 *
 * @param {Jurisdiction|null} jurisdiction A record from `mn-jurisdictions.json`.
 * @param {string|null} county County name, used when there is no jurisdiction
 *   record — off the state's edge, or a point the simplified boundaries missed.
 * @returns {Authority[]} Each entry names an entity and the office that must
 *   answer, with the statute that says so.
 */
export function resolveAuthorities(jurisdiction, county = null) {
  /** @type {Authority[]} */
  const chain = [];
  const countyName = jurisdiction?.county ?? county;

  /**
   * A city or an organised township is a government in its own right: it has a
   * governing body, it holds its own data, and it has a responsible authority.
   *
   * An unorganized territory or a non-functioning township does not. There is
   * no board and no clerk, and this is the case the module exists to get right
   * — 82 Minnesota subdivisions have no local government, and sending someone
   * there to petition a town board sends them to an office that does not
   * exist. In that case the county is the local government and the chain
   * simply starts one level up.
   */
  if (jurisdiction?.governed) {
    const isCity = jurisdiction.kind === 'city';
    chain.push({
      level: 'local',
      kind: jurisdiction.kind,
      entity: entityName(jurisdiction.name),
      office: isCity ? OFFICES.cityClerk : OFFICES.townClerk,
      // Whether this body is one the reader elects locally. It is the lever
      // the Take Action page points at for anything that is not a records
      // request: a board with a public agenda and an election behind it.
      elected: true,
    });
  }

  if (countyName) {
    chain.push({
      level: 'county',
      kind: 'county',
      entity: countyName,
      office: OFFICES.countyAdministrator,
      elected: true,
      /**
       * True when the county is not merely the next level up but the local
       * government itself, because the ground has none of its own. The UI says
       * so out loud rather than silently omitting the local row and leaving a
       * reader to conclude their township was simply not in the data.
       */
      isLocalGovernment: Boolean(jurisdiction && !jurisdiction.governed),
    });

    // Where ALPR data actually lives. The sheriff is a separate elected
    // officer rather than a department of the county board, and in most of
    // Minnesota — everywhere outside a city with its own force — the sheriff
    // is the law enforcement agency for this ground.
    chain.push({
      level: 'lawEnforcement',
      kind: 'sheriff',
      entity: `${countyName} Sheriff's Office`,
      office: OFFICES.lawEnforcement,
      elected: true,
    });
  }

  // The backstop, and the only entry that is the same everywhere: when a
  // request is refused, the commissioner of administration will say in writing
  // whether the refusal was lawful, within 50 days, and a court must give that
  // opinion deference (§ 13.072, subd. 2).
  chain.push({
    level: 'state',
    kind: 'state',
    entity: 'Minnesota Department of Administration',
    office: OFFICES.commissioner,
    elected: false,
  });

  return chain;
}

/**
 * Whether the bodies operating cameras here are bodies this reader elects at
 * this level — and if not, which ones they are.
 *
 * This is the finding the Waterford question turned on, and it generalises:
 * the government you can walk to on a Tuesday evening is frequently not the
 * government that put the camera there. A township supervisor can call a
 * meeting, put an item on an agenda, and pass a resolution, and none of that
 * reaches equipment a county sheriff mounted on a county road inside the
 * township's own borders. Saying so is not discouragement — it is the
 * difference between a letter that gets answered and one that gets forwarded
 * and forgotten.
 *
 * @param {Array<string|null>} operators Operator strings from nearby records,
 *   as they appear in the data — frequently null, which is itself the answer
 *   to a different question and is reported separately rather than guessed at.
 * @param {Jurisdiction|null} jurisdiction The containing jurisdiction record.
 * @returns {{operators: string[], outside: string[], unattributed: number}}
 */
export function operatorGap(operators, jurisdiction) {
  const named = operators.filter((o) => typeof o === 'string' && o.trim());
  const unattributed = operators.length - named.length;
  const distinct = [...new Set(named)].sort();

  // A loose containment test on purpose. Operators are free text typed by
  // volunteers — "Edina", "St louis park PD", "Minneapolis, MN PD" — so an
  // exact match against a Census name would report every one of them as
  // outside the jurisdiction, which is the more misleading error: it would
  // tell a Minneapolis reader that Minneapolis PD is somebody else's police.
  const localBase = jurisdiction
    ? displayName(jurisdiction.name)
        .toLowerCase()
        .replace(/\s+(township|unorganized territory)$/, '')
    : null;

  const outside = localBase
    ? distinct.filter((o) => !o.toLowerCase().includes(localBase))
    : distinct;

  return {
    /** Every distinct named operator of a record near this point. */
    operators: distinct,
    /** Operators that are not this jurisdiction's own government. */
    outside,
    /** Records whose operator nobody has recorded. Not zero — unknown. */
    unattributed,
  };
}
