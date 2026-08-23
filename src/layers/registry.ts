import type { I18nString, LayerCategory, LayerDefinition, LayerId } from './types';
// Band thresholds and offence list live in one module shared with the
// ingest that writes these attributes (CLAUDE.md §2), so a band label
// cannot drift between what is written and what is coloured by.
import { OFFENCES, TOTAL_STOPS, bandLabels } from '~/lib/crimeBands.mjs';

/**
 * The sections of the layer panel, in the order they are listed.
 *
 * The order is an argument, and it now runs bottom-up: what drew the lines,
 * what got built on them, what records from what was built, and who acts on
 * the recording. Read down the panel and each section is a precondition for
 * the next — a camera needs a pole, power and a road before it needs a policy,
 * and the road and the redlining grade were both there first.
 *
 * It used to run the other way, opening on surveillance. That order put the
 * alarming thing first and left the reader to work backwards to why it is
 * where it is; this one costs the cameras their top slot, which is a real
 * cost, because most people arrive looking for exactly that. It is affordable
 * only because every section ships closed: the whole panel is four short rows,
 * so third from the top is one glance rather than a scroll.
 *
 * Each layer names its own category below, so adding a layer still means
 * editing one entry — this list only changes when a genuinely new kind of
 * subject arrives.
 */
export const LAYER_CATEGORIES: LayerCategory[] = [
  {
    id: 'historical',
    label: { en: 'Historical Policies', es: 'Políticas históricas' },
    summary: {
      en: 'The oldest layer, and the one underneath the others: public and private rules that drew the lines the rest of this map sits on.',
      es: 'La capa más antigua, y la que está debajo de las demás: normas públicas y privadas que trazaron las líneas sobre las que se asienta el resto del mapa.',
    },
  },
  {
    id: 'environment',
    label: { en: 'Environment & Health', es: 'Medio ambiente y salud' },
    summary: {
      en: 'The present-day reading of the same ground: which places carry the most environmental and health burdens now, tract by tract.',
      es: 'La lectura actual del mismo terreno: qué lugares soportan hoy más cargas ambientales y de salud, sección por sección.',
    },
  },
  {
    id: 'crime',
    label: { en: 'Reported Crime', es: 'Delitos denunciados' },
    summary: {
      en: 'What Minneapolis residents reported to police, by neighborhood and by year — the counts themselves, on their own, drawing no conclusion about anything else on this map.',
      es: 'Lo que los residentes de Minneapolis denunciaron a la policía, por barrio y por año: los recuentos en sí, por su cuenta, sin sacar conclusiones sobre nada más en este mapa.',
    },
  },
  {
    id: 'infrastructure',
    label: { en: 'Infrastructure', es: 'Infraestructura' },
    summary: {
      en: 'What has to be built and fed before anything can record: the buildings, power and land the rest of it runs on.',
      es: 'Lo que hay que construir y alimentar antes de que algo pueda grabar: los edificios, la energía y el terreno sobre los que funciona todo lo demás.',
    },
  },
  {
    id: 'surveillance',
    label: { en: 'Surveillance Apparatus', es: 'Vigilancia' },
    summary: {
      en: 'What is recording, and how far one ordinary journey is recorded for.',
      es: 'Qué está grabando y durante cuánto trayecto cotidiano se graba.',
    },
  },
  {
    id: 'enforcement',
    label: { en: 'Enforcement', es: 'Aplicación de la ley' },
    summary: {
      en: 'What the recording is for: the agencies that have signed up to act, and the places people are held.',
      es: 'Para qué sirve la grabación: las agencias que se comprometieron a actuar y los lugares donde se retiene a personas.',
    },
  },
];

/**
 * The colours HOLC printed on its own map sheets, read from Mapping
 * Inequality's fill values.
 *
 * Two layers draw the same 1930s document — the graded neighbourhood areas and
 * the block-by-block tracing of the colour inside them — and they have to agree
 * on screen or the claim that they are two readings of one sheet fails at a
 * glance. Written once so an edit cannot desynchronise them.
 */
const HOLC_GRADE_COLORS = {
  A: '#76a865',
  B: '#7cb5bd',
  C: '#ffff00',
  D: '#d9838d',
  /** Non-residential land, recorded on some sheets without a residential grade. */
  E: '#fefefe',
} as const;

/**
 * Shared `geometryNote` for every layer keyed to a census tract
 * (ej_cumulative and the three demographic_* layers): a tract's own name is
 * just a number, and nothing in the source data names it anything else — see
 * tractLabel's comment in ej-cumulative.mjs for why no neighborhood name is
 * invented here.
 */
const CENSUS_TRACT_NOTE = {
  en: 'A census tract is a U.S. Census Bureau statistical area of roughly 1,200–8,000 residents, drawn for reporting — not an official neighborhood.',
  es: 'Una sección censal es un área estadística de la Oficina del Censo de EE. UU. de aproximadamente 1200 a 8000 residentes, trazada para fines de informes — no un barrio oficial.',
};

/**
 * One `detailFields` row per complete calendar year in the `crime_minneapolis`
 * series, which is how that layer shows its history without a time scrubber:
 * the ingest emits a `totalYYYY` attribute for every year it judged complete,
 * and these rows render them in order.
 *
 * Generated rather than hand-written because the list grows by one every
 * January — bump `CRIME_LAST_FULL_YEAR` when a year closes and the ingest
 * starts emitting it. A row whose attribute is absent simply does not render,
 * so the two can never disagree destructively; the worst case is a year of
 * data present in the download but missing from the panel.
 */
// Exported so MapView.astro's shared crime year slider reads its min/max off
// the same two numbers the detail-field rows and the timeSeries layers'
// `years` arrays already come from, rather than a second hardcoded copy that
// could drift the day one of these is bumped and the other is not.
export const CRIME_FIRST_FULL_YEAR = 2018;
export const CRIME_LAST_FULL_YEAR = 2025;
const YEAR_ROWS = Array.from(
  { length: CRIME_LAST_FULL_YEAR - CRIME_FIRST_FULL_YEAR + 1 },
  (_, i) => CRIME_FIRST_FULL_YEAR + i,
).map((year) => ({
  key: `total${year}`,
  label: {
    en: `Reported Part I offenses, ${year}`,
    es: `Delitos de Parte I denunciados, ${year}`,
  },
}));

/**
 * The same per-year rows for the block-group layer, whose totals are all
 * offenses together rather than the Part I split — so the wording differs even
 * though the years are the same.
 */
const BLOCK_GROUP_YEAR_ROWS = Array.from(
  { length: CRIME_LAST_FULL_YEAR - CRIME_FIRST_FULL_YEAR + 1 },
  (_, i) => CRIME_FIRST_FULL_YEAR + i,
).map((year) => ({
  key: `total${year}`,
  label: {
    en: `Reported offenses, ${year}`,
    es: `Delitos denunciados, ${year}`,
  },
}));

/**
 * The lime ramp every reported-crime layer shares, lowest band first.
 *
 * One ramp across all nine rather than nine colours: these are one
 * measurement — offenses reported in a year — cut eight ways, not nine
 * different metrics. The three demographic layers each get their own hue
 * because poverty, Black share and Latinx share are genuinely different
 * things; splitting one column by category is the opposite case, and giving
 * each split its own colour would imply a distinction that isn't there. What
 * changes between them is the band *labels*, since each offense is cut on its
 * own scale (src/lib/crimeBands.mjs).
 *
 * Lime because the sixteen colours already in this file leave exactly one
 * large gap in OKLCH hue — 71° between yellow #facc15 and emerald #34d399 —
 * and this ramp sits in it at a minimum distance of 0.123 from any of them.
 * Red and orange are both taken and would carry an alarm valence this layer
 * must not have.
 */
const CRIME_RAMP = ['#f7fee7', '#d9f99d', '#a3e635', '#65a30d', '#365314'];
const CRIME_FALLBACK = '#6b7280';

/** Band colours for one offense, zipped from its own stops. */
function crimeBands(stops: number[]) {
  return bandLabels(stops).map((value: string, i: number) => ({ value, color: CRIME_RAMP[i] }));
}

const CRIME_GEOMETRY_NOTE = {
  en: 'A Minneapolis neighborhood, as the City draws them — 87 areas covering the city, of widely differing size and population.',
  es: 'Un barrio de Minneapolis, según los traza la Ciudad: 87 áreas que cubren la ciudad, de tamaño y población muy dispares.',
};

/**
 * The Reported Crime category's two subgroups (see LayerDefinition.subgroup's
 * own comment): the combined total and the eight Part I types all read the
 * neighbourhood-scale file, the small-areas layer reads a different one at a
 * different grain — genuinely two kinds of the same subject, which is the
 * one case this field exists for.
 */
const CRIME_SUBGROUP_BY_TYPE = {
  id: 'crime-by-type',
  label: { en: 'By offense type, Minneapolis neighborhoods', es: 'Por tipo de delito, barrios de Minneapolis' },
};
const CRIME_SUBGROUP_SMALL_AREAS = {
  id: 'crime-small-areas',
  label: { en: 'Small areas', es: 'Áreas pequeñas' },
};

/**
 * Shared by all nine reported-crime layers: they are nine views of one file,
 * so a caveat that is true of one is true of all of them, and one copy is one
 * thing to keep correct instead of nine that can drift apart.
 */
const CRIME_LIMITATIONS = [
  {
    en: 'Each area is drawn as a scatter of small dots rather than a shaded fill. A dot’s position inside its neighborhood is chosen at random by this site when the map draws it. No dot marks a real address, an actual report, or any specific place — only the count and the neighborhood boundary come from the source data.',
    es: 'Cada área se dibuja como una dispersión de pequeños puntos en lugar de un relleno sombreado. La posición de un punto dentro de su barrio la elige al azar este sitio al dibujar el mapa. Ningún punto marca una dirección real, una denuncia concreta ni un lugar específico: solo el recuento y el límite del barrio provienen de los datos de origen.',
  },
  {
    en: 'A count of offenses reported to and recorded by police. It is a record of what was reported and what police chose to record, which is not the same as a record of what happened. Reporting rates differ by offense and by neighborhood, and a change in a count can reflect a change in reporting or recording practice rather than a change in events.',
    es: 'Un recuento de delitos denunciados a la policía y registrados por ella. Es un registro de lo que se denunció y de lo que la policía decidió registrar, que no es lo mismo que un registro de lo que ocurrió. Las tasas de denuncia difieren según el delito y el barrio, y un cambio en un recuento puede reflejar un cambio en la práctica de denuncia o de registro más que un cambio en los hechos.',
  },
  {
    en: 'Counts, not rates. A larger or busier neighborhood will show a higher count without that meaning more per resident. This layer publishes no per-resident rate, because the City publishes no neighborhood population to divide by, and apportioning census-tract populations across neighborhood lines would be a number this project invented rather than one any source states.',
    es: 'Recuentos, no tasas. Un barrio más grande o más concurrido mostrará un recuento mayor sin que eso signifique más por residente. Esta capa no publica ninguna tasa por residente, porque la Ciudad no publica una población por barrio con la que dividir, y repartir la población de las secciones censales entre los límites de los barrios sería una cifra inventada por este proyecto y no una que ninguna fuente declare.',
  },
  {
    en: 'Each offense is drawn at its own dot ratio, because these counts span two orders of magnitude — a neighborhood-year runs 0 to 9 for homicide and 0 to nearly 2,000 for larceny. The same number of dots on the homicide map and the larceny map does not mean the same number of reports, and each layer’s on-map key says what one dot stands for.',
    es: 'Cada delito se dibuja con su propia proporción de puntos, porque estos recuentos abarcan dos órdenes de magnitud: un barrio-año va de 0 a 9 en homicidios y de 0 a casi 2000 en hurtos. El mismo número de puntos en el mapa de homicidios y en el de hurtos no significa el mismo número de denuncias, y la clave de cada capa en el mapa indica qué representa un punto.',
  },
  {
    en: 'The published series begins in 2018. The upstream dataset’s first year, 2017, holds August through December only, and is left out rather than shown as a full year that would read as a collapse in reported crime that did not happen. The current calendar year is likewise incomplete, and is shown only as a separately labeled partial-year total.',
    es: 'La serie publicada comienza en 2018. El primer año del conjunto de datos original, 2017, contiene solo de agosto a diciembre, y se excluye en lugar de mostrarse como un año completo que se leería como una caída de la delincuencia denunciada que no ocurrió. El año calendario en curso también está incompleto y se muestra solo como un total parcial etiquetado por separado.',
  },
  {
    en: 'The City changed how incidents are assigned to neighborhoods in February 2019, when it moved to a new police records system. Counts before that date were assigned under the previous system, so the earliest figures are not strictly comparable to later years.',
    es: 'La Ciudad cambió la forma de asignar incidentes a los barrios en febrero de 2019, al pasar a un nuevo sistema de registros policiales. Los recuentos anteriores a esa fecha se asignaron con el sistema previo, por lo que las primeras cifras no son estrictamente comparables con los años posteriores.',
  },
  {
    en: 'Eight offense categories only — the FBI’s Part I list. Offenses outside it are not counted here at all, and the City publishes no breakdown finer than these eight.',
    es: 'Solo ocho categorías de delitos: la lista de Parte I del FBI. Los delitos fuera de ella no se cuentan aquí en absoluto, y la Ciudad no publica ningún desglose más fino que estas ocho.',
  },
  {
    en: 'Minneapolis only. This is one city of more than 850 in Minnesota, and the rest of this map’s area has no crime layer, because no source publishes comparable neighborhood-level figures statewide.',
    es: 'Solo Minneapolis. Esta es una ciudad de más de 850 en Minnesota, y el resto del área de este mapa no tiene capa de delincuencia, porque ninguna fuente publica cifras comparables a nivel de barrio en todo el estado.',
  },
];

const CRIME_PROVENANCE = {
  source: 'City of Minneapolis Open Data, NEIGHBORHOOD CRIME STATS and Minneapolis Neighborhoods',
  sourceUrl: 'https://opendata.minneapolismn.gov/datasets/97ce8f1a93084479929be2750b25187f_0/about',
  license: 'CC0 1.0 Universal (public domain dedication)',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: 'City of Minneapolis Open Data',
  sourceDate: null,
  lastUpdated: null,
  refresh: 'periodic' as const,
};

/**
 * Every crime layer shows the same detail panel, because every one of them is
 * a view of the same neighborhood record: a reader who opened the homicide map
 * still wants the other seven counts and the year series in front of them.
 */
const CRIME_DETAIL_FIELDS = [
  { key: 'reportedTotal', label: { en: 'Reported Part I offenses, latest full year', es: 'Delitos de Parte I denunciados, último año completo' } },
  { key: 'statYear', label: { en: 'Latest full year', es: 'Último año completo' } },
  { key: 'violentTotal', label: { en: 'Violent offenses (homicide, rape, robbery, aggravated assault)', es: 'Delitos violentos (homicidio, violación, robo con violencia, agresión con agravantes)' } },
  { key: 'propertyTotal', label: { en: 'Property offenses (burglary, larceny, auto theft, arson)', es: 'Delitos contra la propiedad (robo con allanamiento, hurto, robo de vehículos, incendio provocado)' } },
  { key: 'homicide', label: { en: 'Homicide', es: 'Homicidio' } },
  { key: 'rape', label: { en: 'Rape', es: 'Violación' } },
  { key: 'robbery', label: { en: 'Robbery', es: 'Robo con violencia' } },
  { key: 'aggravatedAssault', label: { en: 'Aggravated assault', es: 'Agresión con agravantes' } },
  { key: 'burglary', label: { en: 'Burglary', es: 'Robo con allanamiento' } },
  { key: 'larceny', label: { en: 'Larceny', es: 'Hurto' } },
  { key: 'autoTheft', label: { en: 'Auto theft', es: 'Robo de vehículos' } },
  { key: 'arson', label: { en: 'Arson', es: 'Incendio provocado' } },
  // One row per complete calendar year. The ingest decides which years are
  // complete and emits a totalYYYY attribute for each; bump
  // CRIME_LAST_FULL_YEAR when a new year closes and the row appears. A year
  // with no attribute simply does not render.
  ...YEAR_ROWS,
  { key: 'changeSinceFirstFullYear', label: { en: 'Change in reported Part I offenses, first to latest full year', es: 'Cambio en delitos de Parte I denunciados, del primer al último año completo' } },
  { key: 'partialYearLabel', label: { en: 'Current year so far', es: 'Año en curso hasta ahora' } },
  { key: 'partialYearTotal', label: { en: 'Reported Part I offenses, current year so far', es: 'Delitos de Parte I denunciados, año en curso hasta ahora' } },
];

/**
 * One dot colour per offense, fixed to the same Part I order OFFENCES already
 * uses everywhere else — assigned once, never cycled or reassigned, per the
 * categorical-colour rule (dataviz skill, color-formula.md): identity lives in
 * a fixed slot, not a colour picked fresh per render.
 *
 * Computed in OKLCH, not eyeballed, and checked with the skill's own
 * validator (`node scripts/validate_palette.js "<8 hex>" --mode light|dark`)
 * rather than assumed. What that run found, and why it shapes this table:
 *
 * A map where any subset of these eight can be toggled on together is what
 * the skill calls an "all-pairs" form (same category as scatter, bubble,
 * choropleth) — any two dots can end up adjacent anywhere, not just next to
 * their neighbours in a fixed list. The skill's own reference palette proves
 * eight free-form categorical hues cannot clear its colour-vision-deficiency
 * (CVD) floor under `--pairs all`, in any order — three is the most that
 * validates all-pairs in both modes. Confirmed the same result here: this
 * exact table FAILS `--pairs all` (worst CVD ΔE 2–4 with all eight on at
 * once) but PASSES every hard gate — CVD separation and the normal-vision
 * floor — on the realistic case, adjacent pairs in the fixed order below, in
 * both light and dark mode. That is the honest ceiling for eight simultaneous
 * free-form map colours, not a shortcut taken here; see the shared
 * `OFFENCE_CVD_LIMITATION` below, appended to every one of these layers, for
 * the plain-language version of this same finding.
 *
 * `color` is the dark-basemap value (OKLCH L ≈ 0.50–0.63, the skill's dark
 * band); `colorLight` is the light-basemap value (L ≈ 0.50–0.74, the light
 * band) — same dual-hex convention every other layer in this file already
 * uses, keyed the same way `layerColor()` reads it in mapController.ts.
 */
const OFFENCE_DOT_COLORS: Record<string, { color: string; colorLight: string }> = {
  homicide: { color: '#d81e70', colorLight: '#ff6f84' },
  rape: { color: '#ab4200', colorLight: '#c65400' },
  robbery: { color: '#978e00', colorLight: '#beaf00' },
  aggravatedAssault: { color: '#007d0a', colorLight: '#009733' },
  burglary: { color: '#00a499', colorLight: '#00cdd0' },
  larceny: { color: '#0070c1', colorLight: '#0082dd' },
  autoTheft: { color: '#8f6af5', colorLight: '#a195ff' },
  arson: { color: '#a0268b', colorLight: '#b545ae' },
};

/**
 * How many reported offenses one dot stands for, per offense — not one flat
 * ratio for all eight, for the same reason the choropleth bands were never
 * shared: homicide tops out at 9 a year per neighbourhood, larceny at nearly
 * 2,000. Picked from the real 2018–2025 distribution so the single busiest
 * neighbourhood-year in each category lands around 30 dots — enough to read
 * as texture, never a blob. Homicide and arson are rare enough that 1 dot = 1
 * report is the honest ratio; anything coarser would erase them almost
 * everywhere.
 */
const OFFENCE_DOTS_PER_UNIT: Record<string, number> = {
  homicide: 1,
  rape: 2,
  robbery: 7,
  aggravatedAssault: 6,
  burglary: 7,
  larceny: 66,
  autoTheft: 18,
  arson: 1,
};

/**
 * Appended only to the eight single-offense layers, not the combined total —
 * the combined layer is always one colour, so it never has this problem.
 * Required reading alongside OFFENCE_DOT_COLORS' own comment above: stated
 * here in plain language because a limitations entry is what a reader
 * actually sees, where the colour table's comment is only for whoever edits
 * this file next.
 */
const OFFENCE_CVD_LIMITATION = {
  en: 'Each offense type has its own dot colour, fixed the same way every time. Two or three types shown together are chosen to stay clearly distinguishable, including for colourblind readers. Turning on many at once pushes past what colour alone can reliably tell apart, for any reader — the exact figures for every offense are always in an area’s detail panel regardless of which colours are on screen or how many.',
  es: 'Cada tipo de delito tiene su propio color de punto, fijo siempre de la misma manera. Dos o tres tipos mostrados juntos se eligen para que sigan siendo claramente distinguibles, incluso para lectores daltónicos. Activar muchos a la vez supera lo que el color por sí solo puede distinguir de forma fiable, para cualquier lector — las cifras exactas de cada delito están siempre en el panel de detalle de un área, sin importar qué colores estén en pantalla ni cuántos sean.',
};

/**
 * Per-offense identity and copy. `id` and `slug` are written out rather than
 * built from the key so they stay greppable and so `id` satisfies LayerId.
 *
 * `gloss` is the plain-language definition §0.9 requires: "aggravated assault"
 * and "larceny" are terms of art, and a reader who has to already know what
 * they mean is looking at a wall rather than a door. Each one is the FBI's own
 * Part I definition, said plainly.
 */
const OFFENCE_COPY: Record<
  string,
  { id: LayerId; slug: string; label: I18nString; gloss: I18nString }
> = {
  homicide: {
    id: 'crime_homicide',
    slug: 'crime-homicide',
    label: { en: 'Homicide', es: 'Homicidio' },
    gloss: {
      en: 'A death caused by another person — murder and non-negligent manslaughter, as the FBI counts them.',
      es: 'Una muerte causada por otra persona: asesinato y homicidio doloso, según los cuenta el FBI.',
    },
  },
  rape: {
    id: 'crime_rape',
    slug: 'crime-rape',
    label: { en: 'Rape', es: 'Violación' },
    gloss: {
      en: 'Penetration without consent, of any victim of any sex, under the FBI’s definition since 2013.',
      es: 'Penetración sin consentimiento, de cualquier víctima de cualquier sexo, según la definición del FBI desde 2013.',
    },
  },
  robbery: {
    id: 'crime_robbery',
    slug: 'crime-robbery',
    label: { en: 'Robbery', es: 'Robo con violencia' },
    gloss: {
      en: 'Taking something from a person by force or by threat of force. Theft with no person present is larceny, not robbery.',
      es: 'Tomar algo de una persona por la fuerza o bajo amenaza. El hurto sin nadie presente es hurto, no robo con violencia.',
    },
  },
  aggravatedAssault: {
    id: 'crime_aggravated_assault',
    slug: 'crime-aggravated-assault',
    label: { en: 'Aggravated assault', es: 'Agresión con agravantes' },
    gloss: {
      en: 'An attack intended to cause severe injury, usually involving a weapon. Lesser assaults are not Part I offenses and are not counted here.',
      es: 'Un ataque destinado a causar lesiones graves, normalmente con un arma. Las agresiones menores no son delitos de Parte I y no se cuentan aquí.',
    },
  },
  burglary: {
    id: 'crime_burglary',
    slug: 'crime-burglary',
    label: { en: 'Burglary', es: 'Robo con allanamiento' },
    gloss: {
      en: 'Entering a building to commit a crime inside it. No force is required for it to count, and no one need be home.',
      es: 'Entrar en un edificio para cometer un delito dentro. No hace falta forzar la entrada ni que haya alguien en casa.',
    },
  },
  larceny: {
    id: 'crime_larceny',
    slug: 'crime-larceny',
    label: { en: 'Larceny', es: 'Hurto' },
    gloss: {
      en: 'Theft of property with no force and no breaking in — shoplifting, theft from a vehicle, a package taken from a step. By far the most common Part I offense.',
      es: 'Robo de bienes sin fuerza ni allanamiento: hurto en tiendas, robo desde un vehículo, un paquete tomado de la entrada. Con diferencia, el delito de Parte I más común.',
    },
  },
  autoTheft: {
    id: 'crime_auto_theft',
    slug: 'crime-auto-theft',
    label: { en: 'Auto theft', es: 'Robo de vehículos' },
    gloss: {
      en: 'Theft of a motor vehicle itself. Theft of something from inside a vehicle is larceny.',
      es: 'Robo del vehículo en sí. El robo de algo del interior de un vehículo es hurto.',
    },
  },
  arson: {
    id: 'crime_arson',
    slug: 'crime-arson',
    label: { en: 'Arson', es: 'Incendio provocado' },
    gloss: {
      en: 'Deliberately setting fire to property.',
      es: 'Prender fuego a la propiedad de forma deliberada.',
    },
  },
};

/**
 * The eight single-offense layers, one per FBI Part I category, all reading
 * the same file as the all-offenses layer and each shaded on its own scale.
 *
 * Generated from the shared offense table rather than written out eight times:
 * the only things that differ between them are the label, the gloss and which
 * band attribute they colour by, and eight near-identical 60-line entries is
 * eight places for one of those caveats to fall out of sync.
 */
const CRIME_OFFENCE_LAYERS: LayerDefinition[] = OFFENCES.map((offence: { key: string; stops: number[] }) => {
  const copy = OFFENCE_COPY[offence.key];
  const bandKey = `${offence.key}Band`;
  return {
    id: copy.id,
    slug: copy.slug,
    category: 'crime',
    subgroup: CRIME_SUBGROUP_BY_TYPE,
    label: {
      en: `${copy.label.en} reported, Minneapolis`,
      es: `${copy.label.es} denunciado, Minneapolis`,
    },
    summary: {
      en: `${copy.gloss.en} Counted by Minneapolis neighborhood, per year.`,
      es: `${copy.gloss.es} Contado por barrio de Minneapolis, por año.`,
    },
    whatThisMeans: {
      en: `One of the eight FBI Part I categories the City of Minneapolis publishes a neighborhood count for. ${copy.gloss.en} The map draws each report as one dot among a scatter inside its neighborhood, roughly ${OFFENCE_DOTS_PER_UNIT[offence.key]} reported ${OFFENCE_DOTS_PER_UNIT[offence.key] === 1 ? 'offense' : 'offenses'} per dot for the most recent complete calendar year, and the detail panel carries the other seven categories and the year-by-year series beside it. This is a count of reports, not of people, and holds no record of any person — the City aggregates the figures before publishing them, and nothing here resolves to an incident, an address, or an individual. Its dot ratio is its own: the same number of dots here does not mean the same number of reports as on another offense’s map. Each offense type keeps one fixed colour, chosen so that a few shown together stay distinguishable — see this layer’s limitations for what happens past a few. It computes no score or index against any other layer, only the counts themselves.`,
      es: `Una de las ocho categorías de Parte I del FBI para las que la Ciudad de Minneapolis publica un recuento por barrio. ${copy.gloss.es} El mapa dibuja cada denuncia como un punto dentro de una dispersión en su barrio, aproximadamente ${OFFENCE_DOTS_PER_UNIT[offence.key]} ${OFFENCE_DOTS_PER_UNIT[offence.key] === 1 ? 'delito denunciado' : 'delitos denunciados'} por punto para el último año calendario completo, y el panel de detalle incluye junto a ello las otras siete categorías y la serie año por año. Es un recuento de denuncias, no de personas, y no contiene registro de ninguna persona: la Ciudad agrega las cifras antes de publicarlas, y nada aquí se resuelve a un incidente, una dirección o un individuo. Su proporción de puntos es propia: el mismo número de puntos aquí no significa el mismo número de denuncias que en el mapa de otro delito. Cada tipo de delito mantiene un color fijo, elegido para que unos pocos mostrados juntos sigan siendo distinguibles — ver las limitaciones de esta capa para lo que ocurre más allá de unos pocos. No calcula ningún puntaje ni índice frente a otra capa, solo los recuentos mismos.`,
    },
    geometryNote: CRIME_GEOMETRY_NOTE,
    limitations: [...CRIME_LIMITATIONS, OFFENCE_CVD_LIMITATION],
    geometry: 'polygon',
    color: OFFENCE_DOT_COLORS[offence.key].color,
    colorLight: OFFENCE_DOT_COLORS[offence.key].colorLight,
    // Kept for the "Filters" control and the detail panel's band context —
    // not used to paint the fill (see mapController.ts's polygonFillColor)
    // and not shown as a swatch bar on the floating map key: dotDensity below
    // replaces both, same pattern as crime_block_group.
    categoryColors: {
      key: bandKey,
      label: {
        en: `${copy.label.en} reported`,
        es: `${copy.label.es} denunciado`,
      },
      colors: crimeBands(offence.stops),
      fallback: CRIME_FALLBACK,
      showOnMapKey: false,
    },
    dotDensity: {
      perUnit: OFFENCE_DOTS_PER_UNIT[offence.key],
      key: offence.key,
      keyLabel: {
        en: `1 dot ≈ ${OFFENCE_DOTS_PER_UNIT[offence.key]} ${copy.label.en.toLowerCase()} reported, positions randomized`,
        es: `1 punto ≈ ${OFFENCE_DOTS_PER_UNIT[offence.key]} ${copy.label.es.toLowerCase()} denunciado(s), posiciones aleatorias`,
      },
    },
    hoverCard: { fields: [offence.key, 'statYear', 'reportedTotal'] },
    dataPath: '/data/crime-minneapolis.geojson',
    csvPath: null,
    provenance: CRIME_PROVENANCE,
    filters: [
      {
        key: bandKey,
        kind: 'enum',
        label: {
          en: `${copy.label.en} reported`,
          es: `${copy.label.es} denunciado`,
        },
      },
    ],
    detailFields: CRIME_DETAIL_FIELDS,
  };
});

/**
 * Plain-language label for each of CI-MAP's 26 stressor codes, for the
 * `ej_cumulative` layer's `adverseList` pill row.
 *
 * MPCA's own field ships snake_case codes joined by "; " — read straight
 * through from the source, unmodified, so the raw record still matches the
 * document (see ej-cumulative.mjs). This is presentation over that same
 * value, the same role HOLC_GRADE_COLORS and each filter's
 * `valueDescriptions` already play elsewhere: it renames nothing in the data,
 * only in what a reader is shown.
 */
const EJ_STRESSOR_LABELS: Record<string, { en: string; es: string }> = {
  age: { en: 'Older population', es: 'Población de mayor edad' },
  asthma: { en: 'Asthma', es: 'Asma' },
  cancer_risk: { en: 'Cancer risk', es: 'Riesgo de cáncer' },
  childhood_lead_exposure: { en: 'Childhood lead exposure', es: 'Exposición infantil al plomo' },
  cleanup_sites: { en: 'Contaminated cleanup sites', es: 'Sitios contaminados en limpieza' },
  cost_burdened_households: { en: 'Cost-burdened households', es: 'Hogares con carga de costos' },
  disability: { en: 'Disability', es: 'Discapacidad' },
  education: { en: 'Limited educational attainment', es: 'Nivel educativo limitado' },
  food_insecurity: { en: 'Food insecurity', es: 'Inseguridad alimentaria' },
  groundwater_threats: { en: 'Groundwater contamination threats', es: 'Amenazas de contaminación de aguas subterráneas' },
  heart_disease: { en: 'Heart disease', es: 'Enfermedad cardíaca' },
  impaired_waters: { en: 'Impaired waters', es: 'Aguas degradadas' },
  impervious_surfaces: { en: 'Impervious surfaces', es: 'Superficies impermeables' },
  income_inequality: { en: 'Income inequality', es: 'Desigualdad de ingresos' },
  industrial_runoff_exceedances: {
    en: 'Industrial runoff exceedances',
    es: 'Excesos de escorrentía industrial',
  },
  lack_recreation: { en: 'Lack of recreational access', es: 'Falta de acceso recreativo' },
  lack_tree_canopy: { en: 'Lack of tree canopy', es: 'Falta de cobertura arbórea' },
  non_cancer_risk: { en: 'Non-cancer health risk', es: 'Riesgo de salud no cancerígeno' },
  ozone: { en: 'Ozone', es: 'Ozono' },
  pm_2_5: { en: 'Fine particulate matter (PM2.5)', es: 'Partículas finas (PM2.5)' },
  population_near_highways: {
    en: 'Population near highways',
    es: 'Población cerca de autopistas',
  },
  regulated_pollution_activities: {
    en: 'Regulated pollution activities',
    es: 'Actividades reguladas de contaminación',
  },
  solid_waste: { en: 'Solid waste facilities', es: 'Instalaciones de residuos sólidos' },
  traffic_density: { en: 'Traffic density', es: 'Densidad de tráfico' },
  unemployment: { en: 'Unemployment', es: 'Desempleo' },
  uninsured: { en: 'Uninsured residents', es: 'Residentes sin seguro médico' },
};

/**
 * The layer registry — the single source of truth for what the map shows.
 *
 * Adding a layer means: write an ingest script that emits a LayerCollection to
 * /public/data, then add an entry here. The map, legend, filters, detail
 * panels, sources page, "near me" panel and download page are all generated
 * from this list, so no other file needs to change.
 *
 * Ordering follows the roadmap in spec §12.
 */
export const LAYERS: LayerDefinition[] = [
  {
    id: 'vendor_contract',
    slug: 'vendor-contracts',
    // What the device is doing, and what the agency signed up to run it —
    // filed with the agreements and the agencies that hold them, not with
    // the cameras themselves.
    category: 'enforcement',
    defaultOn: true,
    label: {
      en: 'Documented vendor contracts',
      es: 'Contratos de proveedores documentados',
    },
    summary: {
      en: 'The actual contract behind a camera system — vendor, cost, term and data-sharing terms — for the agencies a records request has produced one from.',
      es: 'El contrato real detrás de un sistema de cámaras — proveedor, costo, plazo y condiciones de intercambio de datos — para las agencias de las que una solicitud de registros lo obtuvo.',
    },
    whatThisMeans: {
      en: 'Every other surveillance layer on this map can say an agency operates a camera system; almost none of them can say who sold it, what it cost, or who else gets to search it. This layer is where that answer lives once a public records request produces it — a hand-curated set, not an automatic feed, because no agency publishes an index of its own vendor contracts. The first entry is University of Minnesota Police Department’s Flock Safety contract, released through a Minnesota Government Data Practices Act request filed via MuckRock: the signed services agreement, a later 5-camera expansion order, and two months of network audit logs showing every outside agency that searched UMPD’s camera network and how often. The dollar figures, terms and signers below are transcribed from those documents, which are mirrored in full for anyone to check.',
      es: 'Cualquier otra capa de vigilancia de este mapa puede decir que una agencia opera un sistema de cámaras; casi ninguna puede decir quién lo vendió, cuánto costó, o quién más puede buscar en él. Esta capa es donde vive esa respuesta una vez que una solicitud de registros públicos la produce — un conjunto curado a mano, no una fuente automática, porque ninguna agencia publica un índice de sus propios contratos con proveedores. La primera entrada es el contrato de Flock Safety del Departamento de Policía de la Universidad de Minnesota, obtenido mediante una solicitud bajo la Ley de Prácticas de Datos Gubernamentales de Minnesota presentada vía MuckRock: el acuerdo de servicios firmado, una orden de expansión posterior de 5 cámaras, y dos meses de registros de auditoría de red que muestran cada agencia externa que buscó en la red de cámaras de la UMPD y con qué frecuencia. Las cifras, plazos y firmantes abajo se transcriben de esos documentos, que se reproducen íntegros para que cualquiera los verifique.',
    },
    limitations: [
      {
        en: 'A hand-curated set, not a survey. A contract appears here only once a records request has produced and mirrored it — an agency missing here has not been shown to lack a vendor contract, only to not yet have one documented.',
        es: 'Un conjunto curado a mano, no una encuesta. Un contrato aparece aquí solo una vez que una solicitud de registros lo produjo y se mirroreó — una agencia ausente aquí no ha demostrado carecer de contrato con un proveedor, solo que aún no está documentado.',
      },
      {
        en: 'Network query figures cover only the months included in the records response that produced them — two months here — not the contract’s full history.',
        es: 'Las cifras de consultas de red cubren solo los meses incluidos en la respuesta de registros que las produjo — dos meses en este caso — no el historial completo del contrato.',
      },
      {
        en: 'The agency’s own redaction of its in-house search log was incomplete when released — it named individual staff and case numbers. This project does not publish or mirror that file; only a single monthly total of in-house searches is carried here. See the mirrored document folder’s README for what was withheld and why.',
        es: 'La propia redacción del registro interno de búsquedas de la agencia estaba incompleta al publicarse — nombraba personal individual y números de caso. Este proyecto no publica ni reproduce ese archivo; aquí solo consta un total mensual de búsquedas internas. Consulte el README de la carpeta de documentos reproducidos para ver qué se omitió y por qué.',
      },
      {
        en: 'Contract status (added August 2026, as Minnesota cities began ending Flock Safety contracts) distinguishes a Tier 1/2-documented ending — "Suspended," "Terminated," "Not renewed," "Expired" — from one that is only reported: "Reported ended" (a distinct glyph on the map, and "Reported" rather than "Confirmed" confidence) means multiple news outlets, but no council resolution, agency memo, or other primary record yet, describe this contract as ending. That is frequently a live, unsettled situation — a manager’s action a council could reverse, a story still developing — not a weaker version of a settled fact. Both the point and the jurisdiction under it show which kind: a confirmed ending washes red, a reported one a duller amber, and an active, confirmed contract green. A jurisdiction that shows none of the three is not evidence its contract continues — only that no report has reached this layer yet.',
        es: 'El estado del contrato (agregado en agosto de 2026, cuando ciudades de Minnesota comenzaron a terminar contratos con Flock Safety) distingue una finalización documentada en Nivel 1/2 —"Suspendido", "Terminado", "No renovado", "Vencido"— de una que solo se reporta: "Finalización reportada" (un ícono distinto en el mapa, y confianza "Reportado" en lugar de "Confirmado") significa que varios medios periodísticos, pero aún ningún acuerdo del concejo, memorando de la agencia u otro registro primario, describen este contrato como finalizado. Con frecuencia se trata de una situación en curso y no resuelta —una acción de un gerente que un concejo podría revertir, una historia aún en desarrollo— no una versión más débil de un hecho ya resuelto. Tanto el punto como la jurisdicción debajo muestran de qué tipo se trata: una finalización confirmada se tiñe de rojo, una reportada de un ámbar más apagado, y un contrato activo y confirmado de verde. Que una jurisdicción no muestre ninguno de los tres no es evidencia de que su contrato continúe — solo de que ningún reporte ha llegado aún a esta capa.',
      },
    ],
    geometry: 'point',
    color: '#facc15',
    colorLight: '#a16207',
    markerIcon: {
      icon: 'FileText',
      // Both shape AND colour carry the status distinction, and every colour
      // here is exactly the one the jurisdiction wash uses for the same
      // statuses (tintWhenRelated's `color`/`cancelledWhen`/`secondaryWhen`
      // below) — one palette, read the same way at the point and the
      // polygon, so a reader learns green/red/amber once and it means the
      // same thing wherever it shows up. Every value named here explicitly,
      // `Active` included, rather than leaving it to the top-level
      // `icon`/`color` fallback: a record with no `status` attribute at all
      // (there shouldn't be one, but nothing enforces that at ingest — see
      // ContractStatus's own comment in types.ts) still falls back to this
      // layer's plain identity yellow, which reads as "unknown," not as a
      // fourth, unlabelled status colour.
      byValue: {
        key: 'status',
        icons: {
          Active: 'FileText',
          Suspended: 'FileX',
          Terminated: 'FileX',
          'Not renewed': 'FileX',
          Expired: 'FileX',
          // A different shape, not a paler FileX: this is the status for a
          // record with no Tier 1/2 document behind it yet, only converging
          // news coverage — see ContractStatus's own comment in types.ts.
          'Reported ended': 'FileQuestion',
        },
        colors: {
          // Same green as tintWhenRelated.color: an active, confirmed
          // contract reads as one fact in one colour whether you're looking
          // at the pin or the jurisdiction under it.
          Active: { color: '#86efac', colorLight: '#064e3b' },
          // Red for a confirmed ending — the one status change on this
          // record a reader should catch without opening the panel. The
          // jurisdiction it drives washes the same red (tintWhenRelated's
          // `cancelledWhen` below), so the fact reads identically whether a
          // reader is looking at the pin or the polygon under it.
          Suspended: { color: '#f87171', colorLight: '#7f1d1d' },
          Terminated: { color: '#f87171', colorLight: '#7f1d1d' },
          'Not renewed': { color: '#f87171', colorLight: '#7f1d1d' },
          Expired: { color: '#f87171', colorLight: '#7f1d1d' },
          // Same amber as tintWhenRelated.secondaryWhen: "reported, not yet
          // confirmed" is one colour wherever it appears.
          'Reported ended': { color: '#fcd34d', colorLight: '#78350f' },
        },
      },
    },
    filters: [
      {
        key: 'status',
        kind: 'enum',
        label: { en: 'Contract status', es: 'Estado del contrato' },
        valueDescriptions: {
          Active: {
            en: 'No ending event has been transcribed onto this record. The default for every documented contract.',
            es: 'No se ha transcrito ningún evento de finalización en este registro. El estado por defecto de todo contrato documentado.',
          },
          Suspended: {
            en: 'Use was paused by the agency, stated in the source as reversible — not a termination.',
            es: 'El uso fue pausado por la agencia, y la fuente lo describe como reversible — no es una terminación.',
          },
          Terminated: {
            en: 'The contract was ended before its term or renewal would otherwise have expired.',
            es: 'El contrato terminó antes de que su plazo o renovación hubiera vencido de otro modo.',
          },
          'Not renewed': {
            en: 'The agency let the contract lapse at the end of its term rather than renewing it.',
            es: 'La agencia dejó vencer el contrato al final de su plazo en lugar de renovarlo.',
          },
          Expired: {
            en: 'The contract’s term ended with no documented renewal or replacement on record.',
            es: 'El plazo del contrato terminó sin que haya constancia documentada de renovación o reemplazo.',
          },
          'Reported ended': {
            en: 'News coverage — not yet a council resolution, agency memo, or other primary record — reports this contract suspended, terminated, or not renewed. Often still unsettled: several of these are a manager’s action a council could reverse, or a decision made in the days since the last check of this record. Confidence on this record is “Reported,” not “Confirmed.”',
            es: 'La cobertura periodística —todavía no una resolución del concejo, un memorando de la agencia u otro registro primario— reporta que este contrato fue suspendido, terminado o no renovado. A menudo aún no está resuelto: varios de estos casos son una decisión de un gerente que un concejo podría revertir, o una decisión tomada en los días posteriores a la última revisión de este registro. La confianza de este registro es "Reportado", no "Confirmado".',
          },
        },
      },
    ],
    hoverCard: {
      fields: ['vendor', 'executedDate', 'cameraCountCurrent', 'annualCost'],
      related: {
        layerId: 'alpr_reported',
        fromKey: 'jurisdictionId',
        joinKey: 'jurisdictionId',
        labelKey: 'reportedLocation',
        linkKey: 'sourceUrl',
        title: {
          en: 'This agency’s ALPR readers, reported to the state',
          es: 'Los lectores ALPR de esta agencia, reportados al estado',
        },
        empty: {
          en: 'No BCA filing found under this agency’s jurisdiction. That means none was found under this name — not that it reported none.',
          es: 'No se encontró ninguna declaración ante el BCA bajo la jurisdicción de esta agencia. Eso significa que no se encontró bajo este nombre, no que no reportó ninguno.',
        },
        linkLabel: {
          en: 'The BCA filing this joins to',
          es: 'La declaración del BCA con la que se relaciona',
        },
        moreLabel: { en: '+{n} more', es: '+{n} más' },
        max: 4,
      },
      note: {
        en: 'Network query figures and the in-house search total on this record are drawn from documents mirrored below — click through for the underlying files.',
        es: 'Las cifras de consultas de red y el total de búsquedas internas de este registro provienen de documentos reproducidos abajo — haga clic para ver los archivos originales.',
      },
    },
    action: {
      requestType: 'procurement',
      label: {
        en: 'Request this agency’s current billing and renewal records',
        es: 'Solicitar los registros actuales de facturación y renovación de esta agencia',
      },
      bodyKey: 'jurisdictionName',
      fallbackBody: 'name',
    },
    dataPath: '/data/vendor-contracts.geojson',
    csvPath: '/data/vendor-contracts.csv',
    provenance: {
      source: 'University of Minnesota Police Department, released via MuckRock public records requests',
      sourceUrl:
        'https://www.muckrock.com/foi/minneapolis-1607/flock-safety-contract-information-communication-records-and-access-logs-university-of-minnesota-police-department-212163/',
      license: 'Public government data (Minnesota Government Data Practices Act, Minn. Stat. ch. 13)',
      licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
      attribution: 'University of Minnesota Police Department; released via MuckRock',
      sourceDate: '2026-07-09',
      lastUpdated: null,
      refresh: 'rare',
    },
    detailFields: [
      { key: 'vendor', label: { en: 'Vendor', es: 'Proveedor' } },
      { key: 'product', label: { en: 'Product', es: 'Producto' } },
      // Absent for a record with no ending event, which is why this sits
      // above executedDate rather than at the bottom: a reader should not
      // have to scroll past a dollar figure to learn a contract has ended.
      { key: 'status', label: { en: 'Contract status', es: 'Estado del contrato' } },
      { key: 'statusDate', label: { en: 'Status as of', es: 'Estado a partir de' }, format: 'date' },
      {
        key: 'statusSourceUrl',
        label: { en: 'Source for status', es: 'Fuente del estado' },
        format: 'link',
      },
      { key: 'executedDate', label: { en: 'Contract executed', es: 'Contrato firmado' }, format: 'date' },
      { key: 'initialTermMonths', label: { en: 'Initial term (months)', es: 'Plazo inicial (meses)' } },
      { key: 'renewalType', label: { en: 'Renewal terms', es: 'Condiciones de renovación' } },
      { key: 'signedBy', label: { en: 'Signed by', es: 'Firmado por' } },
      { key: 'cameraCountInitial', label: { en: 'Cameras, at signing', es: 'Cámaras, al firmar' } },
      { key: 'cameraCountCurrent', label: { en: 'Cameras, current', es: 'Cámaras, actual' } },
      { key: 'annualCost', label: { en: 'Annual recurring cost', es: 'Costo anual recurrente' }, format: 'currency' },
      { key: 'totalContractYear1', label: { en: 'Total cost, year 1', es: 'Costo total, año 1' }, format: 'currency' },
      { key: 'expansionDate', label: { en: 'Expansion order date', es: 'Fecha de orden de expansión' }, format: 'date' },
      { key: 'expansionCamerasAdded', label: { en: 'Cameras added by expansion', es: 'Cámaras añadidas por expansión' } },
      { key: 'expansionAnnualCost', label: { en: 'Expansion annual cost', es: 'Costo anual de la expansión' }, format: 'currency' },
      { key: 'expansionRenewalType', label: { en: 'Expansion renewal terms', es: 'Condiciones de renovación de la expansión' } },
      { key: 'expansionSignedBy', label: { en: 'Expansion signed by', es: 'Expansión firmada por' } },
      { key: 'footageRetentionDays', label: { en: 'Footage retention (days)', es: 'Retención de video (días)' } },
      { key: 'networkQueriesLatestMonth', label: { en: 'Network queries, latest mirrored month', es: 'Consultas de red, último mes reproducido' } },
      { key: 'partnerAgenciesLatestMonth', label: { en: 'Outside agencies querying this network', es: 'Agencias externas que consultan esta red' } },
      { key: 'outsideAgencySharePct', label: { en: 'Share of queries from outside agencies (%)', es: 'Proporción de consultas de agencias externas (%)' } },
      { key: 'networkQueryTopReason', label: { en: 'Most common query reason', es: 'Motivo de consulta más común' } },
      { key: 'inHouseQueriesMostRecentMonth', label: { en: 'This agency’s own queries, most recent month', es: 'Consultas propias de esta agencia, mes más reciente' } },
      { key: 'inHouseQueriesPeriod', label: { en: 'Period covered', es: 'Período cubierto' } },
      { key: 'contractDocUrl', label: { en: 'Signed services agreement', es: 'Acuerdo de servicios firmado' }, format: 'link' },
      { key: 'expansionDocUrl', label: { en: 'Expansion order form', es: 'Formulario de orden de expansión' }, format: 'link' },
      { key: 'requestId', label: { en: 'Records request', es: 'Solicitud de registros' } },
      { key: 'requestUrl', label: { en: 'Original request and full response', es: 'Solicitud original y respuesta completa' }, format: 'link' },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'Nearest documented vendor contract', es: 'Contrato de proveedor documentado más cercano' },
      empty: {
        en: 'No documented vendor contract near this point — most agencies have none on record here yet, documented or not.',
        es: 'Ningún contrato de proveedor documentado cerca de este punto — la mayoría de las agencias aún no tienen ninguno registrado aquí, documentado o no.',
      },
      detail: ['vendor', 'annualCost'],
    },
  },

  {
    id: 'agency_jurisdiction',
    slug: 'agency-jurisdictions',
    category: 'enforcement',
    // The frame every other layer is read against: which agency answers for
    // the ground under a given camera.
    defaultOn: true,
    label: {
      en: 'Police & sheriff jurisdictions',
      es: 'Jurisdicciones policiales y de alguaciles',
    },
    summary: {
      en: 'Which police department or sheriff’s office answers for each block of the Twin Cities metro.',
      es: 'Qué departamento de policía u oficina del alguacil responde por cada zona del área metropolitana de Twin Cities.',
    },
    whatThisMeans: {
      en: 'Every 911 call is routed by a table — the Master Street Address Guide (MSAG) — that assigns each address to one law enforcement agency. The Metropolitan Emergency Services Board (MESB) publishes that assignment as a map: one polygon per agency, covering its full response area. This is the ground an agency answers for, not an internal subdivision — Minneapolis’s own five numbered police precincts, for instance, are folded into one polygon here, because the point of this layer is the boundary a records request or a council question is actually addressed to, not how a department organises its own patrol shifts.',
      es: 'Cada llamada al 911 se enruta mediante una tabla — la Guía Maestra de Direcciones (MSAG) — que asigna cada dirección a una agencia de aplicación de la ley. La Junta de Servicios de Emergencia Metropolitana (MESB) publica esa asignación como un mapa: un polígono por agencia, que cubre toda su área de respuesta. Este es el territorio del que responde una agencia, no una subdivisión interna — los cinco recintos numerados de la policía de Minneapolis, por ejemplo, quedan agrupados en un solo polígono aquí, porque el propósito de esta capa es el límite al que realmente se dirige una solicitud de registros o una pregunta ante el concejo, no cómo organiza un departamento sus propios turnos de patrulla.',
    },
    limitations: [
      {
        en: 'Covers the 10-county Twin Cities metro region only — MESB’s own service area. Minnesota DPS is building a statewide version under its NG911 GIS program; it was not yet public as of this layer’s last refresh.',
        es: 'Cubre solo la región metropolitana de Twin Cities de 10 condados — el área de servicio propia de MESB. El DPS de Minnesota está construyendo una versión estatal bajo su programa NG911 GIS; no era pública aún en la última actualización de esta capa.',
      },
      {
        en: 'A polygon is where an agency answers 911 calls, not a map of where its officers actually patrol day to day.',
        es: 'Un polígono es el área donde una agencia responde llamadas al 911, no un mapa de dónde patrullan realmente sus oficiales día a día.',
      },
      {
        en: 'This is agency-level jurisdiction, not an internal subdivision. A department that organises itself into precincts, districts, or beats does not have those drawn separately here.',
        es: 'Esto es jurisdicción a nivel de agencia, no una subdivisión interna. Un departamento que se organiza en recintos, distritos o zonas de patrulla no los tiene dibujados por separado aquí.',
      },
      {
        en: 'Checked against Census city boundaries: most single-city departments track their city\'s limits almost exactly, but not all. A few, like St. Anthony, also serve a second contracting city under agreement. Four — Lakes Area, South Lake Minnetonka, West Hennepin, and Centennial Lakes police — are joint departments shared by several small cities and match no single municipality. Four more are institutional forces that sit inside or across city lines rather than being a city themselves: University of Minnesota, Metropolitan Airports Commission, Veterans Affairs, and Minnesota State Fair police.',
        es: 'Comparado con los límites municipales del Censo: la mayoría de los departamentos de una sola ciudad siguen los límites de su ciudad casi con exactitud, pero no todos. Algunos, como St. Anthony, también atienden a una segunda ciudad bajo contrato. Cuatro — Lakes Area, South Lake Minnetonka, West Hennepin y Centennial Lakes police — son departamentos conjuntos compartidos por varias ciudades pequeñas y no coinciden con ningún municipio único. Otros cuatro son fuerzas institucionales que se ubican dentro o a través de los límites municipales en lugar de ser una ciudad en sí: la policía de la Universidad de Minnesota, la Comisión Metropolitana de Aeropuertos, Asuntos de Veteranos y la Feria Estatal de Minnesota.',
      },
      {
        en: 'A jurisdiction washes green once at least one of its agencies has a documented vendor contract on the "Documented vendor contracts" layer — right now, that is University of Minnesota Police alone. The colour marks that a records request has produced something, nothing more: a jurisdiction left uncoloured has not been shown to lack a contract, only that nobody has yet requested and mirrored one for it.',
        es: 'Una jurisdicción se tiñe de verde en cuanto al menos una de sus agencias tiene un contrato con proveedores documentado en la capa «Contratos de proveedores documentados» — por ahora, solo la Policía de la Universidad de Minnesota. El color solo indica que una solicitud de registros produjo algo, nada más: una jurisdicción sin colorear no ha demostrado carecer de un contrato, solo que nadie lo ha solicitado y reproducido todavía.',
      },
    ],
    geometry: 'polygon',
    // Doubles as the selected-jurisdiction highlight colour (see
    // polygonClick below) — every polygon starts a neutral, uncoloured grey
    // and only the tapped one switches to this, so it needs to read clearly
    // against both the muted default and a basemap, not just tile neatly
    // into the rest of the enforcement palette the way a normal fill would.
    color: '#f59e0b',
    colorLight: '#b45309',
    filters: [
      {
        key: 'agencyType',
        kind: 'enum',
        label: { en: 'Agency type', es: 'Tipo de agencia' },
      },
    ],
    // The name MESB routes 911 calls under, drawn on the ground the way the
    // source's own dispatch table names it.
    labelBy: { key: 'name' },
    // Ward-map browsing: hovering previews a jurisdiction, a tap commits it
    // and fits the camera to it, and ALPR dots (added after this layer — see
    // beneathDots()) keep drawing on top of every polygon here regardless of
    // which one is selected.
    polygonClick: 'highlight',
    // The polygon is context, not the finding: what lights up on selection is
    // the building it answers from and the readers it reported, so the ward
    // settles rather than blazing.
    selectedEmphasis: 'subtle',
    // What a selected jurisdiction actually highlights: the building(s) it
    // answers from, per agency-buildings.mjs's own join, and thin paths to the
    // readers this agency itself reported to the state under Minn. Stat.
    // § 13.824. Both are joins on a document, not tests of what falls inside
    // the boundary — an earlier version drew a path to every camera merely
    // *contained* by the polygon, which is a claim the data cannot support and
    // §0.3 forbids. See relation's comment in types.ts.
    relation: {
      layerId: 'agency_building',
      joinKey: 'jurisdictionId',
      // Throw from the headquarters where the inventory distinguishes one: a
      // § 13.824 filing is the department's, not any one precinct's, so the
      // lines leave the address that answers for the department rather than
      // whichever substation the ingest happened to emit first.
      hubWhere: { key: 'subStation' },
      // Only to readers this agency itself reported to the state — never to
      // whatever happens to sit inside the boundary. See pathsTo's own
      // comment in types.ts for why that distinction is the whole point.
      pathsTo: {
        layerId: 'alpr_reported',
        joinKey: 'jurisdictionId',
      },
    },
    // A green wash on a jurisdiction that has a documented, currently active
    // vendor contract — see the field's own comment in types.ts for why this
    // is a coverage cue and not a score. excludeWhen means a jurisdiction
    // whose only contract has since ended, confirmed or merely reported
    // (see ContractStatus's own comment in types.ts) stops glowing green on
    // the strength of a record that no longer describes the present,
    // without the record itself leaving the map. cancelledWhen and
    // secondaryWhen then repaint that jurisdiction one of two other colours
    // rather than plain neutral: red for a confirmed cancellation, a duller
    // amber for one that's still only reported — so "confirmed cancelled,"
    // "reported but contested," and "nothing on record" are three distinct
    // visible states instead of collapsing "cancelled" and "never had one"
    // into the same neutral. Only a polygon with no ending on record at all
    // stays neutral, and that staying neutral is the honest state of the
    // data, not a verdict on the agency.
    // Bright mint on dark, deep emerald on light — the first plain green
    // (Tailwind's own 500/600 step) read at roughly 1.1:1 against the light
    // basemap's neutral unselected grey, i.e. functionally invisible; both
    // ends here clear ~3:1 against their basemap's own neutral polygon
    // colour as well as the basemap itself. Also see the fill-opacity/
    // line-width bump mapController gives a `related` ward specifically —
    // the hue alone was never going to read at a 0.16-opacity / 1.1px wash,
    // the same strength every other unselected ward already draws at.
    tintWhenRelated: {
      layerId: 'vendor_contract',
      joinKey: 'jurisdictionId',
      excludeWhen: {
        key: 'status',
        values: ['Suspended', 'Terminated', 'Not renewed', 'Expired', 'Reported ended'],
      },
      color: '#86efac',
      colorLight: '#064e3b',
      // Red, matching the pin's own colour for the same statuses (see
      // vendor_contract's markerIcon.byValue.colors) — a confirmed
      // cancellation is the one status change a reader should be able to
      // spot without a click, at the polygon as well as the point. Ranked
      // above secondaryWhen: see applyRelatedTint's own comment for why a
      // jurisdiction with both a confirmed cancellation and an unrelated
      // reported one shows the confirmed fact.
      cancelledWhen: {
        key: 'status',
        values: ['Suspended', 'Terminated', 'Not renewed', 'Expired'],
        color: '#f87171',
        colorLight: '#7f1d1d',
      },
      // A duller amber, not a paler green: a jurisdiction whose only
      // documented contract is only *reported* ended (see ContractStatus's
      // own comment in types.ts) is genuinely a different state from one
      // with a confirmed, active contract, from one with a confirmed
      // cancellation, and from one with none on record at all — visible
      // without a click, the same way the other washes already are. Amber
      // reads as "unsettled" against this basemap the way the confidence
      // label already does in the detail panel; this is that same
      // distinction made visible at the polygon.
      secondaryWhen: {
        key: 'status',
        values: ['Reported ended'],
        color: '#fcd34d',
        colorLight: '#78350f',
      },
    },
    action: {
      // Reuses the existing generic surveillance-inventory request template —
      // right for any agency, not specific to 287(g) or ALPR.
      requestType: 'inventory',
      label: {
        en: 'Ask what surveillance tech this agency runs',
        es: 'Preguntar qué tecnología de vigilancia usa esta agencia',
      },
      // The record is the agency, so it is also the body to write to.
      fallbackBody: 'name',
    },
    dataPath: '/data/agency-jurisdictions.geojson',
    csvPath: null,
    provenance: {
      source: 'Metropolitan Emergency Services Board — Law Enforcement Agency areas',
      sourceUrl: 'https://gisdata.mn.gov/dataset/org-mn-mesb-bdry-law',
      license: 'Public government data — no formal reuse licence published (MESB disclaims warranty)',
      licenseUrl: null,
      attribution:
        'Metropolitan Emergency Services Board, MESB Region PSAPs and Emergency Response Agencies',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    detailFields: [
      { key: 'agencyType', label: { en: 'Agency type', es: 'Tipo de agencia' } },
      { key: 'county', label: { en: 'County', es: 'Condado' } },
      {
        key: 'alprReportStatus',
        label: {
          en: 'ALPR use reported to the state',
          es: 'Uso de lectores de placas informado al estado',
        },
      },
      {
        key: 'alprDeviceLocations',
        label: {
          en: 'All device locations this agency reported to the BCA, including filings that could not be placed on the map as points',
          es: 'Todas las ubicaciones de dispositivos que esta agencia informó al BCA, incluidas las presentadas que no se pudieron ubicar en el mapa como puntos',
        },
      },
      {
        key: 'alprBcaSourceUrl',
        label: { en: 'BCA report', es: 'Informe del BCA' },
        format: 'link',
      },
    ],
    nearMe: {
      mode: 'contains',
      title: {
        en: 'Your local police or sheriff’s jurisdiction',
        es: 'Su jurisdicción policial o del alguacil local',
      },
      empty: {
        en: 'This point falls outside the 10-county metro region this layer covers.',
        es: 'Este punto está fuera de la región metropolitana de 10 condados que cubre esta capa.',
      },
      detail: ['agencyType'],
      caveat: {
        en: 'This is the agency’s full jurisdiction, not an internal precinct or patrol district.',
        es: 'Esta es la jurisdicción completa de la agencia, no un recinto o distrito de patrulla interno.',
      },
    },
  },

  {
    id: 'agency_building',
    slug: 'agency-buildings',
    category: 'enforcement',
    // Off by default. Statewide this is thousands of points, and at the
    // opening view they crowd the marks the map is actually about — the
    // cameras and the agreements. The jurisdiction polygon already answers
    // "who is responsible for this ground" without it; a reader who wants
    // the specific door switches this on.
    defaultOn: false,
    label: {
      en: 'Police & sheriff buildings',
      es: 'Edificios policiales y de alguaciles',
    },
    summary: {
      en: 'Station and precinct addresses for Minnesota law enforcement agencies, one point per building.',
      es: 'Direcciones de estaciones y recintos de agencias policiales de Minnesota, un punto por edificio.',
    },
    whatThisMeans: {
      en: 'Minnesota keeps a statewide inventory of active law enforcement facility locations, built with local officials and updated on a rolling basis. Unlike the jurisdiction layer, which folds a department’s whole area into one polygon, this is one point per building — so Minneapolis’s five numbered precincts and headquarters each appear separately, and so does every substation a larger department runs. Selecting a jurisdiction on the map highlights the building or buildings it answers from.',
      es: 'Minnesota mantiene un inventario estatal de ubicaciones activas de instalaciones policiales, elaborado con funcionarios locales y actualizado de forma continua. A diferencia de la capa de jurisdicciones, que agrupa toda el área de un departamento en un solo polígono, aquí hay un punto por edificio — así que los cinco recintos numerados y la sede de Minneapolis aparecen por separado, al igual que cada subestación de un departamento más grande. Seleccionar una jurisdicción en el mapa resalta el edificio o edificios desde los que responde.',
    },
    limitations: [
      {
        en: 'Covers all of Minnesota, but only buildings whose agency also appears in the 10-county metro jurisdiction layer can be highlighted by selecting a jurisdiction; the rest are shown on their own with no polygon to link them to.',
        es: 'Cubre todo Minnesota, pero solo los edificios cuya agencia también aparece en la capa de jurisdicciones del área metropolitana de 10 condados pueden resaltarse al seleccionar una jurisdicción; el resto se muestra por separado, sin polígono al que vincularlo.',
      },
      {
        en: 'A handful of jurisdictions — chiefly federal or military installations — have no building on record in this dataset at all.',
        es: 'Un puñado de jurisdicciones — principalmente instalaciones federales o militares — no tienen ningún edificio registrado en este conjunto de datos.',
      },
      {
        en: 'This is a continually-edited reference inventory maintained by local officials, not a survey with a fixed vintage; a recently opened, closed, or renamed building may lag here.',
        es: 'Este es un inventario de referencia editado continuamente por funcionarios locales, no una encuesta con una fecha fija; un edificio recientemente abierto, cerrado o renombrado puede no reflejarse aquí de inmediato.',
      },
    ],
    geometry: 'point',
    color: '#f59e0b',
    colorLight: '#b45309',
    // A station house is a kind of place, not a measurement, so it gets a
    // glyph rather than a dot — and the two offices get their own insignia,
    // which is a real distinction in Minnesota law rather than decoration: a
    // sheriff is an elected county officer, a police chief is a municipal
    // appointee, and which one answers for a building changes who a records
    // request is addressed to.
    markerIcon: {
      icon: 'Landmark',
      byValue: {
        key: 'agencyType',
        // Military and Other both fall through to the `icon` above: this map
        // has no claim to make about the difference between a National Guard
        // facility and an unclassified one, and inventing an insignia for it
        // would be decoration.
        icons: { Police: 'Shield', Sheriff: 'Star' },
      },
    },
    hoverCard: {
      fields: ['agencyType', 'address', 'city', 'subStation'],
      // Joined on the department, not the building: the filing under Minn.
      // Stat. § 13.824 is the agency's, so every station of a department
      // shows the same readers rather than pretending one door owns some
      // subset of them.
      related: {
        layerId: 'alpr_reported',
        fromKey: 'jurisdictionId',
        joinKey: 'jurisdictionId',
        labelKey: 'reportedLocation',
        linkKey: 'sourceUrl',
        title: {
          en: 'ALPR readers this department reported to the state',
          es: 'Lectores ALPR que este departamento reportó al estado',
        },
        empty: {
          en: 'No ALPR filing found for this department. That means none was found under this name — not that it operates none.',
          es: 'No se encontró ninguna declaración de ALPR para este departamento. Eso significa que no se encontró bajo este nombre, no que no opere ninguno.',
        },
        linkLabel: {
          en: 'The filing these come from',
          es: 'La declaración de la que provienen',
        },
        moreLabel: { en: '+{n} more', es: '+{n} más' },
        max: 4,
      },
      // The honest answer to "where's the contract?". Almost no agency's
      // vendor contract is published in any dataset this project ingests — a
      // records request has to produce one before it can appear on the
      // "Documented vendor contracts" layer — so rather than leave a reader
      // assuming one is missing by oversight, the card says so and points at
      // the way to get it (§0.6). No longer an absolute claim as of the first
      // documented contract (University of Minnesota Police); see
      // vendor_contract below.
      note: {
        en: 'No vendor contract is published here for most agencies — check the “Documented vendor contracts” layer, then click the station and “Ask what surveillance tech this agency runs” to request one.',
        es: 'Para la mayoría de las agencias no hay ningún contrato con proveedores publicado aquí — consulte la capa «Contratos de proveedores documentados», luego haga clic en la estación y en «Preguntar qué tecnología de vigilancia usa esta agencia» para solicitarlo.',
      },
    },
    filters: [
      {
        key: 'agencyType',
        kind: 'enum',
        label: { en: 'Agency type', es: 'Tipo de agencia' },
      },
    ],
    action: {
      requestType: 'inventory',
      label: {
        en: 'Ask what surveillance tech this agency runs',
        es: 'Preguntar qué tecnología de vigilancia usa esta agencia',
      },
      fallbackBody: 'name',
    },
    dataPath: '/data/agency-buildings.geojson',
    csvPath: '/data/agency-buildings.csv',
    provenance: {
      source: 'Minnesota Law Enforcement Locations — U-Spatial, University of Minnesota',
      sourceUrl: 'https://gisdata.mn.gov/dataset/struc-law-enforce-mn',
      license:
        'No formal licence published; U-Spatial/USGS disclaim warranty, acknowledgement appreciated',
      licenseUrl: null,
      attribution: 'U-Spatial, University of Minnesota; U.S. Geological Survey',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    detailFields: [
      { key: 'agencyType', label: { en: 'Agency type', es: 'Tipo de agencia' } },
      { key: 'address', label: { en: 'Address', es: 'Dirección' } },
      { key: 'city', label: { en: 'City', es: 'Ciudad' } },
      { key: 'subStation', label: { en: 'Precinct / substation', es: 'Recinto / subestación' } },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'Nearest police or sheriff building', es: 'Edificio policial más cercano' },
      empty: {
        en: 'No building in this dataset is near this point.',
        es: 'Ningún edificio de este conjunto de datos está cerca de este punto.',
      },
      detail: ['address'],
    },
  },

  {
    id: 'agency_287g',
    slug: '287g',
    category: 'enforcement',
    label: {
      en: '287(g) agency agreements',
      es: 'Acuerdos de agencias 287(g)',
    },
    summary: {
      en: 'Local police and sheriffs who have signed agreements to help ICE with immigration enforcement.',
      es: 'Policías y alguaciles locales que firmaron acuerdos para ayudar a ICE con la aplicación de leyes migratorias.',
    },
    whatThisMeans: {
      en: 'Section 287(g) of the Immigration and Nationality Act lets ICE delegate certain federal immigration powers to local officers. An agreement here means this agency signed a memorandum with ICE. The model matters: a Jail Enforcement Model agreement operates on people already booked into a local jail; a Warrant Service Officer agreement lets designated officers serve ICE administrative warrants on people in custody; a Task Force Model agreement extends immigration enforcement into everyday street-level policing. This record describes the agency and its contract — not any person it has encountered.',
      es: 'La Sección 287(g) de la Ley de Inmigración y Nacionalidad permite que ICE delegue ciertas facultades migratorias federales a agentes locales. Un acuerdo aquí significa que esta agencia firmó un memorando con ICE. El modelo importa: el Modelo de Aplicación en Cárceles opera sobre personas ya ingresadas en una cárcel local; el acuerdo de Oficial de Servicio de Órdenes permite a agentes designados entregar órdenes administrativas de ICE a personas bajo custodia; el Modelo de Fuerza de Tarea extiende la aplicación migratoria a la vigilancia policial cotidiana. Este registro describe a la agencia y su contrato, no a ninguna persona.',
    },
    limitations: [
      {
        en: 'ICE publishes this list without coordinates. Each agency is placed at the geographic centre of the county it serves, so a dot marks a jurisdiction, not a building.',
        es: 'ICE publica esta lista sin coordenadas. Cada agencia se ubica en el centro geográfico del condado que atiende, por lo que un punto marca una jurisdicción, no un edificio.',
      },
      {
        en: 'The list is a snapshot. Agreements are signed and terminated between our refreshes; check the ICE source for the current status.',
        es: 'La lista es una instantánea. Los acuerdos se firman y terminan entre nuestras actualizaciones; consulte la fuente de ICE para conocer el estado actual.',
      },
      {
        en: 'A signed agreement does not tell you how actively an agency uses it.',
        es: 'Un acuerdo firmado no indica con qué frecuencia la agencia lo utiliza.',
      },
    ],
    geometry: 'point',
    color: '#f97316',
    colorLight: '#c35305',
    action: {
      requestType: '287g',
      label: {
        en: 'Request the agreement',
        es: 'Solicitar el acuerdo',
      },
      // The record is the agency, so it is also the body to write to.
      fallbackBody: 'name',
    },
    dataPath: '/data/287g.geojson',
    csvPath: '/data/287g.csv',
    provenance: {
      source: 'ICE — Participating agencies (287(g))',
      sourceUrl: 'https://www.ice.gov/identify-and-arrest/287g',
      license: 'Public domain (US federal government work)',
      licenseUrl: 'https://www.usa.gov/government-works',
      attribution: 'U.S. Immigration and Customs Enforcement',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [
      {
        key: 'supportType',
        kind: 'enum',
        label: { en: 'Agreement model', es: 'Modelo de acuerdo' },
      },
      {
        key: 'agencyType',
        kind: 'enum',
        label: { en: 'Agency type', es: 'Tipo de agencia' },
      },
      { key: 'signed', kind: 'dateRange', label: { en: 'Date signed', es: 'Fecha de firma' } },
    ],
    detailFields: [
      { key: 'supportType', label: { en: 'Agreement model', es: 'Modelo de acuerdo' } },
      { key: 'agencyType', label: { en: 'Agency type', es: 'Tipo de agencia' } },
      { key: 'signed', label: { en: 'Signed', es: 'Firmado' }, format: 'date' },
      { key: 'moa', label: { en: 'Memorandum (MOA)', es: 'Memorando (MOA)' }, format: 'link' },
    ],
    nearMe: {
      mode: 'countyMatch',
      title: { en: 'Your county sheriff and ICE', es: 'Su alguacil del condado e ICE' },
      empty: {
        en: 'No 287(g) agreement is on ICE’s current list for agencies in this county.',
        es: 'No hay ningún acuerdo 287(g) en la lista actual de ICE para agencias de este condado.',
      },
      detail: ['supportType', 'signed'],
      caveat: {
        en: 'A signed agreement does not tell you how actively an agency uses it.',
        es: 'Un acuerdo firmado no indica con qué frecuencia la agencia lo utiliza.',
      },
    },
  },

  {
    id: 'alpr',
    slug: 'alpr',
    category: 'surveillance',
    // The map's subject. On since long before this field existed, when the
    // whole surveillance category was switched on by category.
    defaultOn: true,
    label: {
      en: 'ALPR Cameras (Community Reported)',
      es: 'Cámaras ALPR (reportadas por la comunidad)',
    },
    summary: {
      en: 'Automated licence plate readers mapped by volunteers — cameras that photograph and log passing vehicles.',
      es: 'Lectores automáticos de matrículas mapeados por voluntarios: cámaras que fotografían y registran vehículos que pasan.',
    },
    whatThisMeans: {
      en: 'An automated licence plate reader photographs every passing vehicle, converts the plate to text, and stores it with a time and location. Networks of these cameras let an agency reconstruct where a vehicle has travelled over weeks or months, and many networks are searchable by outside agencies. This is a transparency tool showing where infrastructure has been observed — it is not a live tracker, and it says nothing about who drives past.',
      es: 'Un lector automático de matrículas fotografía cada vehículo que pasa, convierte la matrícula en texto y la almacena con hora y ubicación. Las redes de estas cámaras permiten a una agencia reconstruir por dónde viajó un vehículo durante semanas o meses, y muchas redes son consultables por agencias externas. Esta es una herramienta de transparencia que muestra dónde se ha observado la infraestructura: no es un rastreador en vivo y no dice nada sobre quién pasa por allí.',
    },
    limitations: [
      {
        en: 'Crowd-sourced and incomplete. Absence of a dot is not evidence that no camera is there.',
        es: 'De origen comunitario e incompleto. La ausencia de un punto no prueba que no haya cámara.',
      },
      {
        en: 'Historical, not real-time. A camera may have been removed, moved, or re-aimed since it was mapped.',
        es: 'Histórico, no en tiempo real. Una cámara puede haber sido retirada, movida o reorientada desde que se mapeó.',
      },
      {
        en: 'Not every mapped device is a Flock device; the layer covers ALPR cameras generally, and the manufacturer tag is often missing.',
        es: 'No todos los dispositivos mapeados son de Flock; la capa cubre cámaras ALPR en general y la etiqueta del fabricante suele faltar.',
      },
      {
        en: 'The cone shows the direction a camera faces. Its length is a drawing convention and not a range — nothing in the source says how far down the road a camera reads a plate, and the cone stays the same size on screen as you zoom rather than covering a real distance on the ground.',
        es: 'El cono muestra la dirección hacia la que apunta una cámara. Su longitud es una convención de dibujo y no un alcance: la fuente no indica a qué distancia una cámara lee una matrícula, y el cono mantiene el mismo tamaño en pantalla al hacer zoom en lugar de cubrir una distancia real sobre el terreno.',
      },
      {
        en: 'Where a record gives a real sector — 50 of them do, such as "108-153" — the cone is drawn at exactly that width. Where it gives only a heading, the cone is drawn at a fixed nominal width, because no field of view was recorded. The two look alike on the map, so treat cone width as evidence only when the detail panel shows a sector.',
        es: 'Cuando un registro indica un sector real —50 lo hacen, como «108-153»— el cono se dibuja exactamente con esa amplitud. Cuando solo indica una orientación, el cono se dibuja con una amplitud nominal fija, porque no se registró ningún campo de visión. Ambos se ven igual en el mapa, así que considere la amplitud del cono como evidencia solo cuando el panel de detalle muestre un sector.',
      },
      {
        en: '“Who runs it” is derived by keyword-matching the free text a volunteer typed into the operator field. It records what a word there suggests, never a verified contract: “Eagan” is a city with no keyword in it and lands under “other”, and a name covering several agencies is filed under one of them. Four readers in five say nothing at all, and that — not the breakdown of the remaining fifth — is the finding here.',
        es: '«Quién lo opera» se deduce buscando palabras clave en el texto libre que un voluntario escribió en el campo de operador. Registra lo que sugiere una palabra de ese campo, nunca un contrato verificado: «Eagan» es una ciudad sin ninguna palabra clave y queda en «otros», y un nombre que abarca varias agencias se archiva bajo una sola. Cuatro de cada cinco lectores no dicen nada en absoluto, y eso —no el desglose del quinto restante— es el hallazgo aquí.',
      },
      {
        en: 'Several cameras sharing a pole ("321;109") are drawn as one cone per recorded heading over a single dot. A record tagged "0-360" is drawn as a full circle, meaning the surveyor recorded no single direction at all.',
        es: 'Varias cámaras que comparten un poste («321;109») se dibujan con un cono por cada orientación registrada sobre un solo punto. Un registro etiquetado «0-360» se dibuja como un círculo completo, lo que significa que no se registró ninguna dirección concreta.',
      },
      {
        en: 'A brass ring marks a "cross-listed corner": this project found a BCA-reported reader within 50 m of this camera. That is a proximity calculation between two already-approximate coordinates — a road-junction estimate on the BCA side, a hand-placed pin on this one — not a document linking the two records, and not a claim they describe the same device or that either camera is still there. See the record\'s own detail panel for what a match here does and does not mean.',
        es: 'Un anillo bronce marca una «esquina de doble registro»: este proyecto encontró un lector reportado al BCA a menos de 50 m de esta cámara. Es un cálculo de proximidad entre dos coordenadas ya aproximadas —una estimación de cruce vial del lado del BCA, un pin colocado a mano de este lado— no un documento que vincule ambos registros, y no una afirmación de que describan el mismo dispositivo o de que alguna de las dos cámaras siga allí. Consulte el panel de detalle del registro para ver qué significa y qué no significa una coincidencia aquí.',
      },
    ],
    geometry: 'point',
    color: '#38bdf8',
    colorLight: '#067baf',
    // Category colour now applies at every zoom (see mapController.ts), and
    // the rarest value — "Other or unclassified", muted slate #94a3b8 —
    // reads as almost no edge at all against the dark basemap's own
    // near-black background under the default basemap-coloured ring. A fixed
    // white ring keeps every dot legible regardless of which category colour
    // it landed on or which basemap it's sitting over.
    pointStrokeColor: '#ffffff',
    bearingKey: 'direction',
    categoryColors: {
      key: 'operatorType',
      label: { en: 'Who runs it', es: 'Quién lo opera' },
      // Nine categories, two of which the bar can label (see
      // `showOnMapKey`'s doc comment) — and, per the `limitations` entry
      // above, a keyword guess rather than a verified value. The filter
      // fieldset in the layer panel is the real, fully-labelled key.
      showOnMapKey: false,
      colors: [
        // First, because it is the answer four readers in five give — but not
        // muted. A desaturated grey here used to read as "no camera," the
        // opposite of what it means: every one of these is a live, recording
        // reader, just one whose operator nobody has identified yet. Stays
        // saturated so that reads at a glance, the way a device's own
        // recording light would — but off the red hue: #dc2626 is the racial
        // covenants layer's own identity colour, and near-identical to that
        // layer's 1950s swatch (#de2d26). Both layers can be fully opaque in
        // the same panel and legend key at once, so a shared red would carry
        // two unrelated meanings under one swatch. Magenta keeps the same
        // saturated-alarm read without borrowing another layer's colour. See #80.
        { value: 'Not recorded', color: '#db2777' },
        { value: 'Police department', color: '#38bdf8' },
        { value: 'County sheriff', color: '#22d3ee' },
        { value: 'State agency', color: '#a78bfa' },
        { value: 'Multi-agency task force', color: '#fb7185' },
        { value: 'Neighbourhood association', color: '#4ade80' },
        { value: 'School or campus', color: '#facc15' },
        { value: 'Vendor-operated (Flock)', color: '#f97316' },
        { value: 'Other or unclassified', color: '#94a3b8' },
      ],
      fallback: '#94a3b8',
    },
    // Plain locations, not a density estimate. A faint, uncoloured speck is
    // visible from the map's own minimum zoom (3 — the whole state, or the
    // whole country) so a reader never has to take "there are cameras out
    // there" on faith; it fades toward solid hardware from zoom 10 and is
    // fully resolved, coloured by who runs it, by 14. No heatmap or node
    // surface beneath them at any point — just the mapped cameras themselves,
    // drawn smaller and fainter the further out you are.
    scale: { speckleFrom: 3, emergeFrom: 10, pointsFrom: 14 },
    // The operator is recorded on maybe a third of these, so the fallback is
    // not an edge case — it is the common path. Outside a city with its own
    // force the sheriff is the agency for that ground, and asking the wrong
    // county office still beats not asking.
    action: {
      requestType: 'alpr',
      label: {
        en: 'Ask who runs this camera',
        es: 'Preguntar quién opera esta cámara',
      },
      bodyKey: 'operator',
      fallbackBody: 'countySheriff',
    },
    dataPath: '/data/alpr.geojson',
    csvPath: '/data/alpr.csv',
    provenance: {
      source: 'OpenStreetMap via Overpass API (DeFlock tagging convention)',
      sourceUrl: 'https://deflock.me',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors, ODbL — mapped by DeFlock volunteers',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'frequent',
    },
    filters: [
      { key: 'operatorType', kind: 'enum', label: { en: 'Who runs it', es: 'Quién lo opera' } },
      { key: 'operator', kind: 'enum', label: { en: 'Operator', es: 'Operador' } },
      { key: 'manufacturer', kind: 'enum', label: { en: 'Manufacturer', es: 'Fabricante' } },
      { key: 'cameraType', kind: 'enum', label: { en: 'Camera type', es: 'Tipo de cámara' } },
    ],
    hoverCard: {
      fields: ['manufacturer', 'operatorType', 'operator', 'cameraType', 'zone'],
      // No `related` here, deliberately, and it is the whole difference
      // between this card and the one on an agency-reported reader. There is
      // no document joining a crowd-sourced camera to an agency — the
      // operator field is a word a volunteer typed, which is why the note
      // says so on every single card rather than only where the field is
      // blank. A `related` block here would be the containment inference
      // this project already removed once.
      note: {
        en: 'Mapped by volunteers. “Who runs it” is what a mapper wrote down, not a verified contract — and most often nobody wrote anything.',
        es: 'Mapeado por voluntarios. «Quién lo opera» es lo que anotó un mapeador, no un contrato verificado, y la mayoría de las veces nadie anotó nada.',
      },
    },
    detailFields: [
      { key: 'manufacturer', label: { en: 'Manufacturer', es: 'Fabricante' } },
      { key: 'operatorType', label: { en: 'Who runs it', es: 'Quién lo opera' } },
      { key: 'operator', label: { en: 'Operator', es: 'Operador' } },
      { key: 'cameraType', label: { en: 'Camera type', es: 'Tipo de cámara' } },
      {
        key: 'direction',
        label: { en: 'Direction of coverage', es: 'Dirección de cobertura' },
        format: 'degrees',
      },
      { key: 'zone', label: { en: 'Surveillance zone', es: 'Zona de vigilancia' } },
      { key: 'osmUrl', label: { en: 'OpenStreetMap record', es: 'Registro de OpenStreetMap' }, format: 'link' },
    ],
    nearMe: {
      mode: 'radius',
      title: { en: 'Nearest ALPR cameras', es: 'Cámaras ALPR más cercanas' },
      empty: {
        en: 'No mapped cameras are near this point.',
        es: 'No hay cámaras mapeadas cerca de este punto.',
      },
      radii: [5],
      list: {
        entityKey: 'operator',
        detail: ['cameraType'],
        initialCount: 8,
        showOnMap: true,
        // ~4 in 5 mapped cameras carry no `operator` value — the generic
        // "No operator recorded" fallback read as if the camera itself were
        // in doubt, when what's actually missing is only who runs it. See
        // NearMeSummary.list.unattributedLabel's own comment.
        unattributedLabel: { en: 'ALPR Camera', es: 'Cámara ALPR' },
        showCoordsWhenUnattributed: true,
      },
      caveat: {
        en: 'Crowd-sourced and incomplete — the absence of a camera here is not evidence that none exists. Who runs each one is a mapper’s guess from free text, not a verified contract.',
        es: 'De origen comunitario e incompleto: la ausencia de una cámara aquí no prueba que no exista ninguna. Quién opera cada una es una suposición de un mapeador a partir de texto libre, no un contrato verificado.',
      },
    },
    // "Cross-listed corner" — see alpr-cross-source.mjs and
    // LayerDefinition.crossSource's own comment in layers/types.ts. This is
    // the alpr (OSM) side: the copy names the *agency*, because that's the
    // fact this side's match adds that the record didn't already carry.
    crossSource: {
      legend: {
        en: 'Cross-listed corner — an agency reported a fixed reader at this corner, and volunteers separately mapped ALPR hardware within 50 m of it. Two independent records point at the same place. Neither says a camera is there today.',
        es: 'Esquina de doble registro: una agencia reportó un lector fijo en esta esquina, y voluntarios mapearon por separado equipo ALPR a menos de 50 m de allí. Dos registros independientes señalan el mismo lugar. Ninguno afirma que haya una cámara allí hoy.',
      },
      hoverNote: {
        en: 'Also reported to the state by {agency} ({d} m away).',
        es: 'También reportado al estado por {agency} (a {d} m de distancia).',
      },
      matched: {
        en: '{agency} reported a fixed licence plate reader at this corner under Minn. Stat. § 13.824, {d} m from this mapped device. The two records were matched by distance (50 m), not by any document linking them — so this is two independent records naming one corner, not proof that this specific device is the one the agency reported, and not a statement that either is still in place.',
        es: '{agency} reportó un lector fijo de matrículas en esta esquina bajo Minn. Stat. § 13.824, a {d} m de este dispositivo mapeado. Ambos registros se emparejaron por distancia (50 m), no por ningún documento que los vincule, así que se trata de dos registros independientes que nombran una esquina, no una prueba de que este dispositivo en particular sea el que reportó la agencia, ni una afirmación de que alguno de los dos siga en su lugar.',
      },
      unmatched: {
        en: 'No record from the other source falls within 50 m of this one. The two sources cover different things — one is what agencies filed with the state, the other is what volunteers happened to map — so an unmatched record is the normal case, not a doubt about this one.',
        es: 'Ningún registro de la otra fuente se encuentra a menos de 50 m de este. Las dos fuentes cubren cosas distintas —una es lo que las agencias declararon al estado, la otra es lo que los voluntarios llegaron a mapear— así que un registro sin coincidencia es el caso normal, no una duda sobre este registro.',
      },
      contested: {
        en: 'More than one agency reported a reader near this corner. This project does not choose between them — each agency\'s own filing is a separate record in this layer, not linked from here.',
        es: 'Más de una agencia reportó un lector cerca de esta esquina. Este proyecto no elige entre ellas: la declaración de cada agencia es un registro aparte en esta capa, no enlazado desde aquí.',
      },
      ambiguousAnchor: {
        en: 'The two roads in this filing meet in more than one place, so the corner shown is one of several the filing could mean. Read this match accordingly.',
        es: 'Las dos vías de esta declaración se cruzan en más de un lugar, así que la esquina mostrada es una de varias que la declaración podría significar. Interprete esta coincidencia en consecuencia.',
      },
      glossary: {
        en: 'Cross-listed corner — A place where two independent records land within 50 metres of each other: an agency\'s own filing to the state that it operates a fixed licence plate reader there, and a camera mapped at that spot by an OpenStreetMap volunteer. The match is measured by this project from the two coordinates; no document says the two records describe the same device. It says the corner turns up in two separate paper trails. It does not say a camera is there today.',
        es: 'Esquina de doble registro: un lugar donde dos registros independientes caen a menos de 50 metros el uno del otro: la propia declaración de una agencia al estado de que opera allí un lector fijo de matrículas, y una cámara mapeada en ese punto por un voluntario de OpenStreetMap. Este proyecto mide la coincidencia a partir de las dos coordenadas; ningún documento afirma que ambos registros describan el mismo dispositivo. Indica que la esquina aparece en dos rastros documentales independientes. No indica que haya una cámara allí hoy.',
      },
      searchSuffix: {
        en: ' — cross-listed corner',
        es: ' — esquina de doble registro',
      },
    },
  },

  {
    id: 'alpr_reported',
    slug: 'alpr-reported',
    category: 'surveillance',
    // The readers the thrown lines land on. Off, they would land on nothing.
    defaultOn: true,
    label: {
      en: 'ALPR Cameras (BCA Reported)',
      es: 'Cámaras ALPR (reportadas por el BCA)',
    },
    summary: {
      en: 'Readers a named police department or sheriff told the state it operates, and where.',
      es: 'Lectores que un departamento de policía o alguacil declaró al estado que opera, y dónde.',
    },
    whatThisMeans: {
      en: 'Minnesota law (Minn. Stat. § 13.824) requires every law enforcement agency that operates an automated licence plate reader to report it to the state, including where its fixed readers are, and requires the Bureau of Criminal Apprehension to publish what they file. Every point here comes from one of those filings. That makes this the only camera layer on this map whose operator is documented rather than guessed: the crowd-sourced camera layer records hardware someone saw on a pole and usually cannot say whose it is, while a record here is a named public agency stating, under a reporting duty, that this reader is theirs.',
      es: 'La ley de Minnesota (Minn. Stat. § 13.824) exige que toda agencia policial que opere un lector automático de matrículas lo informe al estado, incluida la ubicación de sus lectores fijos, y exige que la Oficina de Aprehensión Criminal publique lo que presentan. Cada punto aquí proviene de una de esas presentaciones. Esto la convierte en la única capa de cámaras de este mapa cuyo operador está documentado y no inferido: la capa comunitaria registra equipos que alguien vio en un poste y casi nunca puede decir de quién son, mientras que un registro aquí es una agencia pública nombrada declarando, bajo un deber de informar, que ese lector es suyo.',
    },
    limitations: [
      {
        en: 'Only agencies that filed a report appear. An agency missing here may not have filed, or may operate only vehicle-mounted readers, which are not fixed locations — it is not evidence the agency operates none.',
        es: 'Solo aparecen las agencias que presentaron un informe. Una agencia ausente puede no haber presentado, o puede operar solo lectores montados en vehículos, que no son ubicaciones fijas; no es prueba de que no opere ninguno.',
      },
      {
        en: 'Positions are resolved from the words in each filing against OpenStreetMap road geometry. The filing is the record; the coordinate is this project’s reading of it.',
        es: 'Las posiciones se resuelven a partir de las palabras de cada presentación usando la geometría vial de OpenStreetMap. La presentación es el registro; la coordenada es la lectura que hace este proyecto.',
      },
      {
        en: 'Filings that give a street address, name a landmark rather than a corner, or name roads that do not exist or do not meet — including outright typos in the published list — are deliberately left off the map rather than approximated. They are published in full alongside the data so the gap is inspectable.',
        es: 'Las presentaciones que dan una dirección postal, nombran un punto de referencia en lugar de una esquina, o nombran vías que no existen o no se cruzan —incluidos errores tipográficos en la lista publicada— se omiten deliberadamente del mapa en lugar de aproximarse. Se publican íntegras junto a los datos para que la brecha sea inspeccionable.',
      },
      {
        en: 'A reported location is where the agency says a reader is, not a guarantee it is still there or was ever installed.',
        es: 'Una ubicación reportada es donde la agencia dice que hay un lector, no una garantía de que siga allí o de que se haya instalado.',
      },
      {
        en: 'A brass ring marks a "cross-listed corner": this project found a volunteer-mapped camera within 50 m of this filing. That is a proximity calculation between two already-approximate coordinates — this project\'s own resolution of the filing\'s words against road geometry, and a hand-placed OpenStreetMap pin — not a document linking the two records. Most filings have no such match; that is the normal case, not a doubt about the filing. A faint, thinner version of the same ring marks a narrower case — a "near miss," where a nearby volunteer-mapped camera exists but was assigned to a closer filing from the same agency instead. See the record\'s own detail panel for what a match, or a near miss, here does and does not mean.',
        es: 'Un anillo bronce marca una «esquina de doble registro»: este proyecto encontró una cámara mapeada por voluntarios a menos de 50 m de esta declaración. Es un cálculo de proximidad entre dos coordenadas ya aproximadas —la resolución que hace este proyecto de las palabras de la declaración contra la geometría vial, y un pin de OpenStreetMap colocado a mano— no un documento que vincule ambos registros. La mayoría de las declaraciones no tienen tal coincidencia; ese es el caso normal, no una duda sobre la declaración. Una versión tenue y más delgada del mismo anillo marca un caso más estrecho —un «casi acierto»—, donde existe una cámara cercana mapeada por voluntarios pero fue asignada a una declaración más cercana de la misma agencia. Consulte el panel de detalle del registro para ver qué significa y qué no significa una coincidencia, o un casi acierto, aquí.',
      },
    ],
    geometry: 'point',
    // Kin to the crowd-sourced camera layer's sky blue rather than a colour
    // of its own: same subject, stronger provenance. Deliberately not the
    // detention layer's rose, which it collided with exactly when this entry
    // was first written.
    color: '#22d3ee',
    colorLight: '#0e7490',
    filters: [
      { key: 'agencyName', kind: 'enum', label: { en: 'Reporting agency', es: 'Agencia informante' } },
    ],
    hoverCard: {
      fields: ['agencyName', 'reportedLocation', 'statute'],
      // The inverse of the station card, and the reason this layer exists:
      // from a reader, name the department that claimed it and the door it
      // answers from. Safe to draw because the filing itself makes the link
      // — the crowd-sourced layer above gets no such block for exactly that
      // reason.
      // Joined on the agency's own name rather than its jurisdiction id:
      // the id only exists for the 10-county metro, and this layer is
      // statewide, so keying on it would leave every outstate reader
      // reporting "none" when the department had in fact filed a dozen.
      related: {
        layerId: 'alpr_reported',
        fromKey: 'agencyName',
        joinKey: 'agencyName',
        labelKey: 'reportedLocation',
        linkKey: 'sourceUrl',
        title: {
          en: 'Readers this department reported, this one among them',
          es: 'Lectores que este departamento reportó, incluido este',
        },
        // Unreachable in practice, and kept deliberately: this is a self-join,
        // so the hovered reader is always one of its own matches and the count
        // is never zero. Retained because the field is required and because
        // the day this layer is joined to anything else, an empty state that
        // says what an absence does NOT mean is what §1c asks for.
        empty: {
          en: 'No other filing found under this department’s name.',
          es: 'No se encontró ninguna otra declaración a nombre de este departamento.',
        },
        linkLabel: {
          en: 'The filing these come from',
          es: 'La declaración de la que provienen',
        },
        moreLabel: { en: '+{n} more', es: '+{n} más' },
        max: 4,
      },
      note: {
        en: 'Position is this project’s reading of the words in the filing, resolved against OpenStreetMap roads — not a surveyed coordinate.',
        es: 'La posición es la lectura que hace este proyecto de las palabras de la declaración, resuelta con las vías de OpenStreetMap; no es una coordenada topográfica.',
      },
    },
    action: {
      requestType: 'alpr',
      label: {
        en: 'Request this agency’s ALPR records',
        es: 'Solicitar los registros ALPR de esta agencia',
      },
      bodyKey: 'agencyName',
      fallbackBody: 'countySheriff',
    },
    dataPath: '/data/alpr-reported.geojson',
    csvPath: '/data/alpr-reported.csv',
    provenance: {
      source: 'Minnesota Bureau of Criminal Apprehension — agencies reporting LPR use',
      sourceUrl: 'https://dps.mn.gov/divisions/bca/data-and-reports/agencies-use-lprs-lpr',
      license: 'Public government data (Minn. Stat. ch. 13)',
      licenseUrl: null,
      attribution:
        'Minnesota Bureau of Criminal Apprehension; positions resolved against © OpenStreetMap contributors (ODbL)',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    detailFields: [
      { key: 'agencyName', label: { en: 'Reporting agency', es: 'Agencia informante' } },
      {
        key: 'reportedLocation',
        label: { en: 'Location, as the agency wrote it', es: 'Ubicación, según la agencia' },
      },
      { key: 'statute', label: { en: 'Reported under', es: 'Informado bajo' } },
      { key: 'sourceUrl', label: { en: 'BCA report', es: 'Informe del BCA' }, format: 'link' },
    ],
    nearMe: {
      mode: 'radius',
      title: {
        en: 'Agency-reported readers near you',
        es: 'Lectores reportados por agencias cerca de usted',
      },
      empty: {
        en: 'No agency has reported a fixed reader near this point.',
        es: 'Ninguna agencia ha reportado un lector fijo cerca de este punto.',
      },
      radii: [5],
      list: {
        entityKey: 'agencyName',
        detail: ['reportedLocation'],
        initialCount: 8,
        showOnMap: true,
      },
      caveat: {
        en: 'Only readers agencies reported to the state. An agency that filed nothing does not appear.',
        es: 'Solo lectores que las agencias reportaron al estado. Una agencia que no presentó nada no aparece.',
      },
    },
    // "Cross-listed corner" — see alpr-cross-source.mjs and
    // LayerDefinition.crossSource's own comment in layers/types.ts. This is
    // the alpr_reported (BCA) side: the copy counts volunteer-mapped devices
    // near the filing, since that's the fact this side's match adds.
    crossSource: {
      legend: {
        en: 'Cross-listed corner — an agency reported a fixed reader at this corner, and volunteers separately mapped ALPR hardware within 50 m of it. Two independent records point at the same place. Neither says a camera is there today.',
        es: 'Esquina de doble registro: una agencia reportó un lector fijo en esta esquina, y voluntarios mapearon por separado equipo ALPR a menos de 50 m de allí. Dos registros independientes señalan el mismo lugar. Ninguno afirma que haya una cámara allí hoy.',
      },
      hoverNote: {
        en: 'Also mapped by volunteers ({d} m away).',
        es: 'También mapeado por voluntarios (a {d} m de distancia).',
      },
      matched: {
        en: 'Volunteers have mapped {n} ALPR device(s) within {d} m of this corner, independently of this filing. That is two separate records pointing at the same corner — a filing by the agency, and hardware someone saw on a pole. It is not proof they describe the same device, and it is not a statement that anything is there now. Cameras are removed, moved and re-aimed without notice, and this project matched the two by distance (50 m), not by any document connecting them.',
        es: 'Voluntarios han mapeado {n} dispositivo(s) ALPR a menos de {d} m de esta esquina, de forma independiente a esta declaración. Son dos registros separados que señalan la misma esquina: una declaración de la agencia, y equipo que alguien vio en un poste. No es prueba de que describan el mismo dispositivo, ni una afirmación de que algo esté allí ahora. Las cámaras se retiran, se mueven y se reorientan sin previo aviso, y este proyecto emparejó ambos registros por distancia (50 m), no por ningún documento que los conecte.',
      },
      unmatched: {
        en: 'No record from the other source falls within 50 m of this one. The two sources cover different things — one is what agencies filed with the state, the other is what volunteers happened to map — so an unmatched record is the normal case, not a doubt about this one.',
        es: 'Ningún registro de la otra fuente se encuentra a menos de 50 m de este. Las dos fuentes cubren cosas distintas —una es lo que las agencias declararon al estado, la otra es lo que los voluntarios llegaron a mapear— así que un registro sin coincidencia es el caso normal, no una duda sobre este registro.',
      },
      // A fainter cousin of `matched`, not a rewrite of `unmatched` — see
      // LayerDefinition.crossSource.nearMiss's own comment. This only ever
      // fires on this (alpr_reported) side: an OSM point is never discarded
      // outright, only a BCA filing loses a same-agency tie to a nearer
      // sibling, so the alpr side's crossSource block carries no such key.
      nearMiss: {
        en: 'A volunteer-mapped device sat {d} m from this filing — close enough to be worth a mention — but it fell nearer to another filing by this same agency, so it counts as that filing\'s match instead of this one\'s. This filing has no cross-listed device of its own.',
        es: 'Un dispositivo mapeado por voluntarios se encontraba a {d} m de esta declaración —lo bastante cerca como para mencionarlo— pero quedó más cerca de otra declaración de esta misma agencia, así que cuenta como coincidencia de esa declaración y no de esta. Esta declaración no tiene un dispositivo de doble registro propio.',
      },
      contested: {
        en: 'More than one agency reported a reader near this corner. This project does not choose between them — each agency\'s own filing is a separate record in this layer, not linked from here.',
        es: 'Más de una agencia reportó un lector cerca de esta esquina. Este proyecto no elige entre ellas: la declaración de cada agencia es un registro aparte en esta capa, no enlazado desde aquí.',
      },
      ambiguousAnchor: {
        en: 'The two roads in this filing meet in more than one place, so the corner shown is one of several the filing could mean. Read this match accordingly.',
        es: 'Las dos vías de esta declaración se cruzan en más de un lugar, así que la esquina mostrada es una de varias que la declaración podría significar. Interprete esta coincidencia en consecuencia.',
      },
      glossary: {
        en: 'Cross-listed corner — A place where two independent records land within 50 metres of each other: an agency\'s own filing to the state that it operates a fixed licence plate reader there, and a camera mapped at that spot by an OpenStreetMap volunteer. The match is measured by this project from the two coordinates; no document says the two records describe the same device. It says the corner turns up in two separate paper trails. It does not say a camera is there today. A faint version of the same ring marks a "near miss" — a filing that had a volunteer-mapped device nearby, but lost it to a closer filing from the same agency.',
        es: 'Esquina de doble registro: un lugar donde dos registros independientes caen a menos de 50 metros el uno del otro: la propia declaración de una agencia al estado de que opera allí un lector fijo de matrículas, y una cámara mapeada en ese punto por un voluntario de OpenStreetMap. Este proyecto mide la coincidencia a partir de las dos coordenadas; ningún documento afirma que ambos registros describan el mismo dispositivo. Indica que la esquina aparece en dos rastros documentales independientes. No indica que haya una cámara allí hoy. Una versión tenue del mismo anillo marca un «casi acierto»: una declaración que tenía un dispositivo mapeado por voluntarios cerca, pero que quedó asignado a una declaración más cercana de la misma agencia.',
      },
      searchSuffix: {
        en: ' — cross-listed corner',
        es: ' — esquina de doble registro',
      },
      // Optional per LayerDefinition.crossSource.searchSuffix's own comment
      // — appended instead of searchSuffix when only `crossSourceNearMiss`
      // is set (see MapView.astro's search-result naming).
      nearMissSearchSuffix: {
        en: ' — near miss (cross-listed elsewhere)',
        es: ' — casi acierto (doble registro en otra esquina)',
      },
    },
  },

  {
    id: 'redlining',
    slug: 'redlining',
    category: 'historical',
    label: {
      en: 'Redlining zones (HOLC)',
      es: 'Zonas de redlining (HOLC)',
    },
    summary: {
      en: '1930s federal mortgage-risk grades that steered lending away from Black and immigrant neighbourhoods.',
      es: 'Calificaciones federales de riesgo hipotecario de los años 30 que desviaron el crédito de barrios negros e inmigrantes.',
    },
    whatThisMeans: {
      en: 'In the 1930s the federal Home Owners’ Loan Corporation graded neighbourhoods A through D for mortgage risk, and the grade turned explicitly on the race, ethnicity and immigration status of the residents. Areas graded D were outlined in red — "redlined" — and starved of lending for decades. These lines are the historical substrate beneath much of the present-day geography of wealth, housing and policing. Where the appraiser’s survey sheet survives, this layer also shows what they wrote to justify the grade — in their own words, unedited. This layer shows a policy applied to an area, drawn from digitised historical maps.',
      es: 'En los años 30, la Home Owners’ Loan Corporation federal calificó los barrios de A a D según el riesgo hipotecario, y la calificación dependía explícitamente de la raza, etnia y estatus migratorio de los residentes. Las áreas con calificación D se delinearon en rojo — "redlined" — y quedaron privadas de crédito durante décadas. Estas líneas son el sustrato histórico de buena parte de la geografía actual de la riqueza, la vivienda y la vigilancia policial. Cuando se conserva la hoja de encuesta del tasador, esta capa también muestra lo que escribió para justificar la calificación, en sus propias palabras y sin editar. Esta capa muestra una política aplicada a un área, tomada de mapas históricos digitalizados.',
    },
    limitations: [
      {
        en: 'Only cities that HOLC surveyed appear. A neighbourhood with no polygon was not necessarily untouched by housing discrimination — it may simply never have been graded.',
        es: 'Solo aparecen las ciudades que HOLC evaluó. Un barrio sin polígono no estuvo necesariamente libre de discriminación en vivienda: puede que nunca haya sido calificado.',
      },
      {
        en: 'Boundaries are georeferenced from hand-drawn 1930s maps and are approximate.',
        es: 'Los límites provienen de mapas dibujados a mano de los años 30 y son aproximados.',
      },
      {
        en: 'Racial covenants — a separate and often more granular record — are mapped by Mapping Prejudice and are linked rather than duplicated here.',
        es: 'Los convenios raciales — un registro distinto y a menudo más granular — son mapeados por Mapping Prejudice y se enlazan en lugar de duplicarse aquí.',
      },
      {
        en: 'The survey text quotes 1930s appraisers word for word, including racist language and slurs. It is reproduced unaltered because paraphrasing it conceals how explicit the racial criteria were.',
        es: 'El texto de la encuesta cita textualmente a tasadores de los años 30, incluido lenguaje racista e insultos. Se reproduce sin alterar porque parafrasearlo oculta cuán explícitos eran los criterios raciales.',
      },
      {
        en: 'Not every graded area has a surviving survey sheet, and the Minnesota sheets use a narrative form with no boxes for the share of Black or foreign-born residents. Where a sheet is missing the record is silent, which is not the same as an area having nothing written about it.',
        es: 'No toda área calificada conserva su hoja de encuesta, y las hojas de Minnesota usan un formulario narrativo sin casillas para la proporción de residentes negros o nacidos en el extranjero. Cuando falta una hoja, el registro calla, lo cual no significa que no se escribiera nada sobre esa área.',
      },
      {
        en: '"Groups named" is derived by keyword-matching the appraisers\' own vocabulary against their prose. It records that a word was written about an area — not who actually lived there, and not how many. Any percentage is the appraiser\'s estimate, not a census.',
        es: '«Grupos nombrados» se deriva buscando el vocabulario de los propios tasadores en su prosa. Registra que se escribió una palabra sobre un área, no quién vivía allí realmente ni cuántas personas. Cualquier porcentaje es la estimación del tasador, no un censo.',
      },
      {
        en: 'Only two of the eight Minnesota maps carry a year upstream — Minneapolis 1937 and Duluth 1936. For the rest no year is recorded at all, so they are dated only to HOLC’s survey window or, where the map was made outside that programme, not dated. Each area says which of the three it is.',
        es: 'Solo dos de los ocho mapas de Minnesota traen un año en la fuente: Minneapolis 1937 y Duluth 1936. Para el resto no se registra ningún año, así que se fechan solo dentro del periodo de encuestas de HOLC o, si el mapa se hizo fuera de ese programa, no se fechan. Cada área indica cuál de los tres casos es.',
      },
      {
        en: 'The census tracts listed on an area are a geometric overlap and nothing more: this share of that tract sits on ground graded this way. The percentage is what makes the difference readable — covering four per cent of a tract and covering ninety are not the same claim, and neither says anything follows from the grade.',
        es: 'Las secciones censales listadas en un área son una superposición geométrica y nada más: esa proporción de la sección se asienta sobre terreno calificado así. El porcentaje es lo que hace legible la diferencia — cubrir el cuatro por ciento de una sección y cubrir el noventa no son la misma afirmación, y ninguna implica que algo se derive de la calificación.',
      },
    ],
    geometry: 'polygon',
    color: '#c084fc',
    colorLight: '#9c3efa',
    categoryColors: {
      key: 'grade',
      label: { en: 'HOLC grade', es: 'Calificación HOLC' },
      // The colours HOLC printed on the original sheets, so the map reads like
      // the document it is. Shared with the block-by-block layer.
      colors: Object.entries(HOLC_GRADE_COLORS).map(([value, color]) => ({ value, color })),
      fallback: '#9ca3af',
    },
    // The identifier HOLC printed on each zone — "A1", "D4" — drawn on the
    // ground the way the original sheet drew it.
    labelBy: { key: 'holcId' },
    // Same hover-on-enabled treatment as holc_appraisal_detail beside it: a
    // reader browsing this layer should get the grade at a glance without a
    // click, same as agency_jurisdiction's ward browsing.
    hoverCard: {
      fields: ['grade', 'groupsNamed', 'city', 'dating'],
    },
    dataPath: '/data/redlining.geojson',
    csvPath: null,
    provenance: {
      source: 'Mapping Inequality, Digital Scholarship Lab, University of Richmond',
      sourceUrl: 'https://dsl.richmond.edu/panorama/redlining/',
      license: 'CC BY-NC 2.5',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.5/',
      attribution:
        'Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality: Redlining in New Deal America"',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'rare',
    },
    filters: [
      {
        key: 'grade',
        kind: 'enum',
        label: { en: 'HOLC grade', es: 'Calificación HOLC' },
        valueDescriptions: {
          A: {
            en: '“Best.” New and homogeneous — in practice, restricted to white residents.',
            es: '«Mejor». Nuevo y homogéneo: en la práctica, restringido a residentes blancos.',
          },
          B: {
            en: '“Still Desirable.” Expected to hold value; white neighbourhoods past their newest years.',
            es: '«Aún deseable». Se esperaba que mantuviera su valor; barrios blancos ya no tan nuevos.',
          },
          C: {
            en: '“Definitely Declining.” Marked down for the arrival of Black, Jewish and immigrant residents.',
            es: '«En claro declive». Degradado por la llegada de residentes negros, judíos e inmigrantes.',
          },
          D: {
            en: '“Hazardous.” Outlined in red — redlined — with lending withheld on explicitly racial grounds.',
            es: '«Peligroso». Delineado en rojo — redlined — con el crédito negado por motivos explícitamente raciales.',
          },
          E: {
            en: 'Commercial or industrial land, recorded without a residential grade.',
            es: 'Suelo comercial o industrial, registrado sin calificación residencial.',
          },
        },
      },
      { key: 'city', kind: 'enum', label: { en: 'City', es: 'Ciudad' } },
      {
        key: 'groupsNamed',
        kind: 'enum',
        label: { en: 'Groups named in the survey', es: 'Grupos nombrados en la encuesta' },
      },
      {
        key: 'dating',
        kind: 'enum',
        label: { en: 'How the date is known', es: 'Cómo se conoce la fecha' },
        // The bilingual sentences live here rather than on all 168 features:
        // three strings written once beat three English strings shipped per
        // record and rendered under a Spanish label.
        valueDescriptions: {
          'Year recorded upstream': {
            en: 'Mapping Inequality records a year for this city’s map. Only Minneapolis (1937) and Duluth (1936) have one.',
            es: 'Mapping Inequality registra un año para el mapa de esta ciudad. Solo Minneapolis (1937) y Duluth (1936) lo tienen.',
          },
          'Survey-programme window only': {
            en: 'No year is recorded for this city. The map was made under HOLC’s City Survey Program, which ran from late 1935 to 1940, and can be dated no more closely than that.',
            es: 'No hay año registrado para esta ciudad. El mapa se hizo bajo el City Survey Program de HOLC, que funcionó desde finales de 1935 hasta 1940, y no puede fecharse con más precisión.',
          },
          'No year recorded': {
            en: 'No year recorded, and this map was made outside HOLC’s City Survey Program altogether. No source found for when it was drawn.',
            es: 'Sin año registrado, y este mapa se hizo completamente fuera del City Survey Program de HOLC. No se encontró ninguna fuente sobre cuándo se dibujó.',
          },
        },
      },
    ],
    detailFields: [
      { key: 'grade', label: { en: 'HOLC grade', es: 'Calificación HOLC' } },
      { key: 'gradeMeaning', label: { en: 'Grade meaning', es: 'Significado' } },
      {
        key: 'groupsNamed',
        label: { en: 'Groups named in the survey', es: 'Grupos nombrados en la encuesta' },
      },
      {
        key: 'blackResidentsPercent',
        label: {
          en: 'Black residents, as recorded on the form',
          es: 'Residentes negros, según el formulario',
        },
      },
      {
        key: 'foreignBornNationality',
        label: { en: 'Nationalities recorded', es: 'Nacionalidades registradas' },
      },
      {
        key: 'foreignBornPercent',
        label: {
          en: 'Foreign-born residents, as recorded',
          es: 'Residentes nacidos en el extranjero, según el formulario',
        },
      },
      {
        key: 'infiltrationOf',
        label: { en: '“Infiltration of” — HOLC’s own term', es: '«Infiltración de» — término de HOLC' },
      },
      {
        key: 'surveyText',
        label: { en: 'What the appraiser wrote', es: 'Lo que escribió el tasador' },
      },
      { key: 'surveyForm', label: { en: 'Survey form', es: 'Formulario de la encuesta' } },
      { key: 'city', label: { en: 'City', es: 'Ciudad' } },
      { key: 'holcId', label: { en: 'HOLC area ID', es: 'ID del área HOLC' } },
      // The year itself is the record's source date and the panel already
      // renders it; this says how firmly it is known, which the date alone
      // cannot.
      { key: 'dating', label: { en: 'How the date is known', es: 'Cómo se conoce la fecha' } },
      {
        key: 'tracts',
        label: {
          en: 'Census tracts today, and how much of each this area covers',
          es: 'Secciones censales actuales, y qué parte de cada una cubre esta área',
        },
      },
    ],
    nearMe: {
      mode: 'contains',
      title: {
        en: 'This area’s housing-policy history',
        es: 'Historial de política de vivienda de esta zona',
      },
      empty: {
        en: 'This point is not inside a HOLC-graded area. Only eight Minnesota cities were surveyed, so this is not evidence the area was untouched by housing discrimination.',
        es: 'Este punto no está dentro de un área calificada por HOLC. Solo se evaluaron ocho ciudades de Minnesota, así que esto no prueba que la zona quedara libre de discriminación en la vivienda.',
      },
      detail: ['grade', 'gradeMeaning'],
      wide: true,
    },
  },

  {
    id: 'holc_appraisal_detail',
    slug: 'holc-detail',
    category: 'historical',
    label: {
      en: 'HOLC appraisal, block by block',
      es: 'Tasación HOLC, manzana por manzana',
    },
    summary: {
      en: 'The same Twin Cities sheet the redlining layer draws, retraced by the Metropolitan Council at the scale the colour was actually applied.',
      es: 'La misma lámina de las Ciudades Gemelas que dibuja la capa de redlining, retrazada por el Metropolitan Council a la escala en que se aplicó el color.',
    },
    whatThisMeans: {
      en: 'HOLC’s appraisers coloured their Minneapolis and St. Paul map block by block. The redlining layer beside this one shows the neighbourhood areas they outlined; this shows where the colour itself stopped. It is the same document at about seventy times the resolution — and because it follows the shading rather than the outline, it leaves out the lakes, parks and undeveloped land that a neighbourhood boundary necessarily swallows. Roughly an eighth of the ground on this sheet turns out to be water or parkland that was never graded at all. What it cannot tell you is what the appraiser wrote: the Metropolitan Council’s file carries a class and nothing else, no area identifier for a survey sheet to attach to. Each block therefore records which of the other layer’s areas it sits inside, so the prose is one tap away.',
      es: 'Los tasadores de HOLC colorearon su mapa de Minneapolis y St. Paul manzana por manzana. La capa de redlining muestra las áreas de barrio que delinearon; esta muestra dónde se detuvo el color. Es el mismo documento con unas setenta veces más resolución y, como sigue el sombreado en vez del contorno, deja fuera los lagos, parques y terrenos sin urbanizar que un límite de barrio necesariamente engloba. Alrededor de una octava parte del terreno de esta lámina resulta ser agua o parque que nunca fue calificado. Lo que no puede decirle es qué escribió el tasador: el archivo del Metropolitan Council solo lleva una clase, sin identificador de área al que adjuntar una hoja de encuesta. Por eso cada manzana registra en qué área de la otra capa se encuentra, y la prosa queda a un toque de distancia.',
    },
    limitations: [
      {
        en: 'The Minneapolis–St. Paul sheet only. The other six Minnesota cities HOLC surveyed appear in the redlining layer instead. The sheet was drawn to its own edges rather than to city limits, so a handful of blocks fall in adjoining jurisdictions — Fort Snelling, Maplewood, Lilydale — and the City filter names them as what they are rather than folding them into a city they are not in.',
        es: 'Solo la lámina de Minneapolis–St. Paul. Las otras seis ciudades de Minnesota que HOLC evaluó aparecen en la capa de redlining. La lámina se dibujó hasta sus propios bordes, no hasta los límites municipales, así que unas pocas manzanas caen en jurisdicciones vecinas — Fort Snelling, Maplewood, Lilydale — y el filtro de ciudad las nombra como lo que son en lugar de asignarlas a una ciudad en la que no están.',
      },
      {
        en: 'The publisher dates this file to 1934. HOLC’s survey programme did not begin until late 1935, and Mapping Inequality dates the Minneapolis map to 1937 and records no year at all for St. Paul. 1934 is the year the federal underwriting scheme was created, not the year this sheet was drawn.',
        es: 'El editor fecha este archivo en 1934. El programa de encuestas de HOLC no comenzó hasta finales de 1935, y Mapping Inequality fecha el mapa de Minneapolis en 1937 y no registra ningún año para St. Paul. 1934 es el año en que se creó el esquema federal de suscripción, no el año en que se dibujó esta lámina.',
      },
      {
        en: 'The Metropolitan Council states that the file was digitised from a non-georeferenced photograph of the original map and that its accuracy is unknown. Every polygon is nonetheless checked at build time against the independently georeferenced Mapping Inequality areas, and the measured agreement rate ships with the download.',
        es: 'El Metropolitan Council afirma que el archivo se digitalizó a partir de una fotografía no georreferenciada del mapa original y que su exactitud es desconocida. Aun así, cada polígono se contrasta al compilar con las áreas georreferenciadas de Mapping Inequality, y la tasa de coincidencia medida se publica con la descarga.',
      },
      {
        en: 'The Metropolitan Council file has no area identifier and no survey sheet. The HOLC area label drawn on each block comes from Mapping Inequality, matched by which of their graded areas the block’s centre falls inside — it is the route back to what the appraiser wrote, which is in the redlining layer. Blocks beyond the graded areas carry no label.',
        es: 'El archivo del Metropolitan Council no tiene identificador de área ni hoja de encuesta. La etiqueta de área HOLC dibujada en cada manzana proviene de Mapping Inequality, según en qué área calificada cae su centro: es la vía de vuelta a lo que escribió el tasador, que está en la capa de redlining. Las manzanas fuera de las áreas calificadas no llevan etiqueta.',
      },
      {
        en: 'The 2020 census tract on each block is a join key for laying present-day data beside the grade — not a claim that anything about the tract today follows from it. Graded areas in the redlining layer carry the same link as a list, with the share of each tract they cover.',
        es: 'La sección censal de 2020 en cada manzana es una clave de unión para poner datos actuales junto a la calificación, no una afirmación de que algo de la sección hoy se derive de ella. Las áreas calificadas de la capa de redlining llevan el mismo vínculo como lista, con la proporción de cada sección que cubren.',
      },
      {
        en: 'Parks, water and undeveloped land are drawn as the 1930s sheet drew them. That is a record of the old map, not of present-day land cover.',
        es: 'Los parques, el agua y el terreno sin urbanizar se dibujan como los dibujó la lámina de los años 30. Es un registro del mapa antiguo, no de la cobertura del suelo actual.',
      },
    ],
    geometry: 'polygon',
    color: '#a855f7',
    colorLight: '#7e22ce',
    categoryColors: {
      key: 'className',
      label: { en: 'Class on the 1930s sheet', es: 'Clase en la lámina de los años 30' },
      /*
       * The four graded classes take HOLC's own printed colours, the same
       * values the redlining layer reads out of Mapping Inequality's fills, so
       * the two layers of the same document agree on screen.
       *
       * The five non-residential classes have no source colour to take: the
       * publisher's service ships a single flat symbol and no per-class
       * palette. These are ours, deliberately desaturated so that "not a
       * grade" reads as not a grade rather than as a fifth grade.
       */
      colors: [
        { value: 'Best', color: HOLC_GRADE_COLORS.A },
        { value: 'Still Desirable', color: HOLC_GRADE_COLORS.B },
        { value: 'Definitely Declining', color: HOLC_GRADE_COLORS.C },
        { value: 'Hazardous', color: HOLC_GRADE_COLORS.D },
        { value: 'Business and Industrial', color: '#9ca3af' },
        { value: 'Park / Open Space', color: '#6b7f6b' },
        { value: 'Open Water', color: '#7d9db8' },
        { value: 'Undeveloped', color: '#b8ae9c' },
        { value: 'Uncertain', color: '#6b7280' },
      ],
      fallback: '#6b7280',
    },
    // Deliberately no `polygonClick: 'highlight'`. That mode draws polygons in
    // one neutral fill until hovered, which is right for browsing wards and
    // wrong here: this layer's whole claim is that it reproduces the colouring
    // of a specific sheet, and a reader has to be able to see the sheet.
    //
    // The identifier HOLC printed on the surrounding area, drawn on the ground
    // the way the original sheet drew it — see limitations for where it comes
    // from and why some blocks have none. `minzoom` because this labels
    // *blocks*: one area's identifier is carried by hundreds of polygons
    // ("C3" on 682 of them), and below street zoom every one of those is a
    // collision candidate placed and then discarded.
    labelBy: { key: 'miArea', minzoom: 12 },
    // No `related` join here, deliberately. The tract's present-day burden
    // band is stamped on each block at ingest instead: fetching the whole
    // cumulative-stressor layer (3.6 MB, 683 KB gzipped) the moment a reader
    // toggled this one on, to render one of four words, doubled the cost of
    // switching the layer on for an enum. See holc-detail.mjs.
    hoverCard: {
      fields: ['className', 'grade', 'miArea', 'tractBurdenBand'],
      note: {
        en: 'Traced from a photograph of the original map. Two dated records of the same ground, eighty years apart — the map sets them side by side and draws no conclusion between them.',
        es: 'Trazado a partir de una fotografía del mapa original. Dos registros fechados del mismo terreno, con ochenta años de diferencia: el mapa los pone uno junto al otro y no extrae ninguna conclusión.',
      },
    },
    dataPath: '/data/holc-detail.geojson',
    csvPath: null,
    provenance: {
      source: 'Historic HOLC Neighborhood Appraisal, Metropolitan Council',
      sourceUrl: 'https://gis.data.mn.gov/datasets/d801b130d3f640c4832d3af7abee5b2c_0/explore',
      license: 'Public domain (Minn. Stat. ch. 13)',
      licenseUrl: 'https://www.revisor.mn.gov/statutes/cite/13',
      attribution:
        'Metropolitan Council, "Historic Home Owners\' Loan Corporation Neighborhood Appraisal Map"',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'rare',
    },
    filters: [
      {
        key: 'className',
        kind: 'enum',
        label: { en: 'Class on the sheet', es: 'Clase en la lámina' },
        // The nine meanings live here rather than on every polygon: nine
        // strings across 11,561 records was most of two megabytes to say one
        // of nine things. See GRADE_OF_CLASS in scripts/ingest/mn/holc-detail.mjs.
        valueDescriptions: {
          Best: {
            en: 'Grade A. “Best” — new and homogeneous; in practice, restricted to white residents.',
            es: 'Calificación A. «Mejor»: nuevo y homogéneo; en la práctica, restringido a residentes blancos.',
          },
          'Still Desirable': {
            en: 'Grade B. “Still Desirable” — expected to hold value, but past its newest years.',
            es: 'Calificación B. «Aún deseable»: se esperaba que mantuviera su valor, pero ya no era nuevo.',
          },
          'Definitely Declining': {
            en: 'Grade C. “Definitely Declining” — marked down for what HOLC called the “infiltration” of Black, Jewish and immigrant residents.',
            es: 'Calificación C. «En claro declive»: degradado por lo que HOLC llamó la «infiltración» de residentes negros, judíos e inmigrantes.',
          },
          Hazardous: {
            en: 'Grade D. “Hazardous” — outlined in red, with lending withheld on explicitly racial grounds.',
            es: 'Calificación D. «Peligroso»: delineado en rojo, con el crédito negado por motivos explícitamente raciales.',
          },
          'Business and Industrial': {
            en: 'Shaded as commercial or industrial land rather than given a residential grade.',
            es: 'Sombreado como suelo comercial o industrial en lugar de recibir una calificación residencial.',
          },
          'Park / Open Space': {
            en: 'Parkland on the original sheet — never graded, and excluded from the neighbourhood outlines in the other layer.',
            es: 'Parque en la lámina original: nunca calificado, y excluido de los contornos de barrio de la otra capa.',
          },
          'Open Water': {
            en: 'Lake or river on the original sheet — never graded, though a neighbourhood outline may cover it.',
            es: 'Lago o río en la lámina original: nunca calificado, aunque un contorno de barrio pueda cubrirlo.',
          },
          Undeveloped: {
            en: 'Shaded as undeveloped land, with no grade applied.',
            es: 'Sombreado como terreno sin urbanizar, sin calificación aplicada.',
          },
          Uncertain: {
            en: 'The colour here could not be read off the photographed sheet. Left unresolved rather than guessed.',
            es: 'El color aquí no pudo leerse en la lámina fotografiada. Se deja sin resolver en lugar de adivinarlo.',
          },
        },
      },
      { key: 'city', kind: 'enum', label: { en: 'City', es: 'Ciudad' } },
    ],
    detailFields: [
      { key: 'className', label: { en: 'Class on the sheet', es: 'Clase en la lámina' } },
      { key: 'grade', label: { en: 'HOLC grade', es: 'Calificación HOLC' } },
      {
        key: 'miArea',
        label: {
          en: 'HOLC area this block sits in',
          es: 'Área HOLC en la que está esta manzana',
        },
      },
      { key: 'city', label: { en: 'City', es: 'Ciudad' } },
      { key: 'tractGeoid', label: { en: '2020 census tract', es: 'Sección censal 2020' } },
      {
        key: 'tractBurdenBand',
        label: {
          en: 'That tract’s cumulative burden today (MPCA draft)',
          es: 'Carga acumulativa actual de esa sección (borrador MPCA)',
        },
      },
    ],
    nearMe: {
      mode: 'contains',
      title: {
        en: 'What this exact block was coloured',
        es: 'De qué color se pintó exactamente esta manzana',
      },
      empty: {
        en: 'This point is outside the Minneapolis–St. Paul sheet. Only those two cities were retraced at this scale; the redlining layer covers six more.',
        es: 'Este punto está fuera de la lámina de Minneapolis–St. Paul. Solo esas dos ciudades se retrazaron a esta escala; la capa de redlining cubre seis más.',
      },
      detail: ['className', 'grade', 'miArea', 'tractGeoid'],
      caveat: {
        en: 'Traced from a photograph of a hand-drawn 1930s map. The publisher states the accuracy is unknown.',
        es: 'Trazado a partir de una fotografía de un mapa dibujado a mano en los años 30. El editor indica que la exactitud es desconocida.',
      },
      wide: true,
    },
  },

  {
    id: 'detention_facility',
    slug: 'detention',
    category: 'enforcement',
    label: {
      en: 'ICE-contract detention facilities',
      es: 'Centros de detención con contrato de ICE',
    },
    summary: {
      en: 'Jails and facilities that hold people under contract with ICE.',
      es: 'Cárceles e instalaciones que retienen personas bajo contrato con ICE.',
    },
    whatThisMeans: {
      en: 'These are buildings and contracts: a facility that has agreed to hold people for ICE, who operates it, and under what kind of agreement. County jails frequently rent bed space to ICE under an intergovernmental agreement, which turns a local facility into part of the federal detention system. This layer describes facilities and contracts only. It contains no information about anyone detained, and never will.',
      es: 'Estos son edificios y contratos: una instalación que acordó retener personas para ICE, quién la opera y bajo qué tipo de acuerdo. Las cárceles del condado suelen alquilar camas a ICE mediante un acuerdo intergubernamental, lo que convierte una instalación local en parte del sistema federal de detención. Esta capa describe únicamente instalaciones y contratos. No contiene información sobre ninguna persona detenida, y nunca la contendrá.',
    },
    limitations: [
      {
        en: 'Facility-level only. We publish no information about individual detainees under any circumstances.',
        es: 'Solo a nivel de instalación. No publicamos información sobre personas detenidas bajo ninguna circunstancia.',
      },
      {
        en: 'Contracts start and end without announcement; a listed facility may not currently hold anyone for ICE.',
        es: 'Los contratos comienzan y terminan sin aviso; una instalación listada puede no estar reteniendo a nadie para ICE actualmente.',
      },
    ],
    geometry: 'point',
    color: '#f43f5e',
    action: {
      requestType: 'detention',
      label: {
        en: 'Request the contract',
        es: 'Solicitar el contrato',
      },
      fallbackBody: 'name',
    },
    dataPath: '/data/detention.geojson',
    csvPath: '/data/detention.csv',
    provenance: {
      source: 'ICE detention statistics (facility list) / TRAC facility records',
      sourceUrl: 'https://www.ice.gov/detain/detention-management',
      license: 'Public domain (US federal government work)',
      licenseUrl: 'https://www.usa.gov/government-works',
      attribution: 'U.S. Immigration and Customs Enforcement',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [
      { key: 'operator', kind: 'enum', label: { en: 'Operator', es: 'Operador' } },
      { key: 'facilityType', kind: 'enum', label: { en: 'Facility type', es: 'Tipo de instalación' } },
    ],
    detailFields: [
      { key: 'operator', label: { en: 'Operator', es: 'Operador' } },
      { key: 'facilityType', label: { en: 'Facility type', es: 'Tipo de instalación' } },
      { key: 'contractType', label: { en: 'Contract type', es: 'Tipo de contrato' } },
      { key: 'inspectionUrl', label: { en: 'Inspection records', es: 'Registros de inspección' }, format: 'link' },
      // Null on every ICE-list facility; populated only on facilities added
      // manually ahead of ICE's own list (see MANUAL_ADDITIONS in detention.mjs).
      { key: 'address', label: { en: 'Street address', es: 'Dirección' } },
      { key: 'contractNoticeNumber', label: { en: 'Federal contract notice #', es: 'N.º de aviso de contrato federal' } },
      { key: 'contractNoticeUrl', label: { en: 'Federal contract notice', es: 'Aviso de contrato federal' }, format: 'link' },
    ],
    nearMe: {
      mode: 'nearest',
      title: {
        en: 'Nearest ICE-contract facility',
        es: 'Centro con contrato de ICE más cercano',
      },
      empty: {
        en: 'No facility in this dataset is near this point.',
        es: 'Ningún centro de este conjunto de datos está cerca de este punto.',
      },
      detail: ['contractType'],
      caveat: {
        en: 'This describes a building and a contract. It holds no information about any person.',
        es: 'Esto describe un edificio y un contrato. No contiene información sobre ninguna persona.',
      },
    },
  },

  {
    id: 'data_center',
    slug: 'data-centers',
    category: 'infrastructure',
    label: {
      en: 'Data centers',
      es: 'Centros de datos',
    },
    summary: {
      en: 'Large computing facilities, their operators and power sources — plus where communities are organising against them.',
      es: 'Grandes instalaciones de cómputo, sus operadores y fuentes de energía, y dónde las comunidades se organizan contra ellas.',
    },
    whatThisMeans: {
      en: 'Data centers are the physical substrate the rest of this map runs on: the storage and compute behind plate-reader networks, records systems and the analytics sold to agencies. They also carry immediate local consequences — electricity and water demand, land use, noise, tax abatements, and grid costs borne by other ratepayers. Where a community has organised in response, this layer surfaces the campaign so you can find it rather than start from nothing.',
      es: 'Los centros de datos son el sustrato físico sobre el que funciona el resto de este mapa: el almacenamiento y el cómputo detrás de las redes de lectores de matrículas, los sistemas de registros y las analíticas vendidas a las agencias. También tienen consecuencias locales inmediatas: demanda de electricidad y agua, uso del suelo, ruido, exenciones fiscales y costos de red que pagan otros usuarios. Donde una comunidad se ha organizado, esta capa muestra la campaña para que pueda encontrarla en lugar de empezar de cero.',
    },
    limitations: [
      {
        en: 'Facility status changes quickly; "proposed" projects are cancelled and built ones expand.',
        es: 'El estado de las instalaciones cambia rápidamente; los proyectos "propuestos" se cancelan y los construidos se amplían.',
      },
      {
        en: 'Power-source and capacity figures are as reported by the operator or permit filings and are not independently verified.',
        es: 'Las cifras de fuente de energía y capacidad son las reportadas por el operador o en permisos y no están verificadas de forma independiente.',
      },
      {
        en: 'The four trackers this layer draws on contradict each other about several projects. Where they do, the record says so and shows what each one claims.',
        es: 'Los cuatro rastreadores en los que se basa esta capa se contradicen sobre varios proyectos. Cuando ocurre, el registro lo indica y muestra lo que afirma cada uno.',
      },
      {
        en: 'This is contextual background, not a facility register. It is not complete and should not be cited as an inventory.',
        es: 'Esto es contexto de fondo, no un registro de instalaciones. No está completo y no debe citarse como un inventario.',
      },
    ],
    geometry: 'point',
    color: '#34d399',
    colorLight: '#1d845f',
    action: {
      requestType: 'datacenter',
      label: {
        en: 'Request the permits',
        es: 'Solicitar los permisos',
      },
      // Permits and abatements sit with planning, zoning or finance — never
      // with a sheriff, and never with the operator.
      fallbackBody: 'county',
    },
    dataPath: '/data/data-centers.geojson',
    csvPath: '/data/data-centers.csv',
    provenance: {
      source: 'FracTracker Alliance — national data center database',
      sourceUrl: 'https://www.fractracker.org/data-centers/',
      license: 'CC BY-NC 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
      attribution: 'FracTracker Alliance',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
      // The permit file is the spine, but it carries no status and no capacity
      // and none of the hyperscale build-out. Those facts come from four public
      // trackers, so four publishers are named rather than one.
      secondarySources: [
        {
          key: 'mtjp',
          name: 'More Than Just Parks — Data Center Tracker',
          url: 'https://morethanjustparks.com/data-center-tracker/state/minnesota',
          license: 'No reuse licence stated; beta preview, publisher disclaims reliance',
          licenseUrl: null,
          contributes: {
            en: 'Most of the project list, including status and megawatt capacity for the operating, proposed and cancelled build-out.',
            es: 'La mayor parte de la lista de proyectos, incluidos el estado y la capacidad en megavatios de las instalaciones en operación, propuestas y canceladas.',
          },
        },
        {
          key: 'cleanview',
          name: 'Cleanview — Minnesota data centers',
          url: 'https://cleanview.co/data-centers/minnesota',
          license: 'Proprietary platform, free web access, no reuse licence stated',
          licenseUrl: null,
          contributes: {
            en: 'Independent status and capacity figures for the large projects, and the disagreements with the other trackers that this layer records rather than resolves.',
            es: 'Cifras independientes de estado y capacidad de los grandes proyectos, y las discrepancias con los demás rastreadores que esta capa registra en lugar de resolver.',
          },
        },
        {
          key: 'baxtel',
          name: 'Baxtel — Minnesota data centers',
          url: 'https://baxtel.com/data-center/minnesota',
          license: '© all rights reserved; detailed specifications sold separately',
          licenseUrl: null,
          contributes: {
            en: 'Corroboration that particular operators run particular sites. Its detailed specifications are paywalled and are not reproduced here.',
            es: 'Corroboración de que ciertos operadores gestionan ciertos sitios. Sus especificaciones detalladas son de pago y no se reproducen aquí.',
          },
        },
        {
          key: 'poweredbywho',
          name: 'PoweredByWho',
          url: 'https://poweredbywho.com/map',
          license: 'Public-records journalism; no reuse licence stated',
          licenseUrl: null,
          contributes: {
            en: 'Consulted for project context and reporting on local opposition. Its public map yielded no field-level figures we could attribute, so no value in this layer rests on it.',
            es: 'Consultado para contexto de proyectos e informes sobre la oposición local. Su mapa público no aportó cifras atribuibles, por lo que ningún valor de esta capa depende de él.',
          },
        },
      ],
    },
    filters: [
      { key: 'operator', kind: 'enum', label: { en: 'Operator', es: 'Operador' } },
      { key: 'status', kind: 'enum', label: { en: 'Status', es: 'Estado' } },
      { key: 'powerSource', kind: 'enum', label: { en: 'Power source', es: 'Fuente de energía' } },
    ],
    detailFields: [
      { key: 'operator', label: { en: 'Operator', es: 'Operador' } },
      { key: 'city', label: { en: 'City', es: 'Ciudad' } },
      { key: 'status', label: { en: 'Status', es: 'Estado' } },
      { key: 'capacityMw', label: { en: 'Capacity (MW)', es: 'Capacidad (MW)' } },
      { key: 'disputedNote', label: { en: 'Sources disagree', es: 'Las fuentes discrepan' } },
      { key: 'powerSource', label: { en: 'Power source', es: 'Fuente de energía' } },
      { key: 'locationPrecision', label: { en: 'Location precision', es: 'Precisión de ubicación' } },
      { key: 'resistanceStatus', label: { en: 'Community response', es: 'Respuesta comunitaria' } },
      { key: 'campaignUrl', label: { en: 'Local campaign', es: 'Campaña local' }, format: 'link' },
      { key: 'petitionUrl', label: { en: 'Petition', es: 'Petición' }, format: 'link' },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'Nearest data center', es: 'Centro de datos más cercano' },
      empty: {
        en: 'No data center in this dataset is near this point.',
        es: 'Ningún centro de datos de este conjunto de datos está cerca de este punto.',
      },
      detail: ['city'],
      linkKey: 'campaignUrl',
    },
  },

  {
    id: 'aadt',
    slug: 'traffic-volume',
    category: 'infrastructure',
    label: {
      en: 'Roadway traffic volume',
      es: 'Volumen de tráfico vial',
    },
    summary: {
      en: 'How many vehicles cross each stretch of Minnesota road on an average day, counted by the agency that owns the roads.',
      es: 'Cuántos vehículos cruzan cada tramo de carretera de Minnesota en un día promedio, contados por la agencia propietaria de las vías.',
    },
    whatThisMeans: {
      en: 'Annual Average Daily Traffic is the number of vehicles crossing a point on a road on a typical day, averaged across a whole year. MnDOT counts it because federal reporting requires it and because state-aid money for road maintenance is allocated from it — so this is a layer about budgets and asphalt before it is a layer about anything else. It sits under the cameras rather than beside them, and the distinction is the point of putting it here. A plate reader records the vehicles that pass it. This records how many vehicles pass. One is surveillance; the other is the capacity that surveillance gets mounted on, and reading the second as the first would be a mistake this map should not invite. A busy road is not a watched road: a segment carrying two hundred thousand vehicles a day with no reader on it is not surveilled, and a reader on a gravel county road is not made busy by standing there. What the two layers together can show is a question neither answers alone — whether the roads that carry the most ordinary movement are the roads anyone chose to instrument.',
      es: 'El Tráfico Promedio Diario Anual es el número de vehículos que cruzan un punto de una vía en un día típico, promediado a lo largo de un año. MnDOT lo cuenta porque los informes federales lo exigen y porque de ahí se asignan los fondos estatales para mantenimiento vial: así que esta es una capa sobre presupuestos y asfalto antes que sobre cualquier otra cosa. Se sitúa debajo de las cámaras y no junto a ellas, y esa distinción es el motivo de incluirla aquí. Un lector de matrículas registra los vehículos que pasan por él. Esto registra cuántos vehículos pasan. Lo uno es vigilancia; lo otro es la capacidad sobre la que se monta esa vigilancia, y leer lo segundo como lo primero sería un error que este mapa no debe inducir. Una vía concurrida no es una vía vigilada: un tramo con doscientos mil vehículos diarios y sin ningún lector no está vigilado, y un lector en un camino rural de grava no se vuelve concurrido por estar allí. Lo que ambas capas sí pueden mostrar juntas es una pregunta que ninguna responde por separado: si las vías que concentran el movimiento cotidiano son las vías que alguien decidió instrumentar.',
    },
    limitations: [
      {
        en: 'An average, not a measurement of any day. One number stands in for rush hour, holidays, closures and the difference between January and July, and no day of the year necessarily looks like it.',
        es: 'Un promedio, no la medición de ningún día. Una sola cifra sustituye a la hora punta, los festivos, los cortes y la diferencia entre enero y julio, y ningún día del año se parece necesariamente a ella.',
      },
      {
        en: 'Counts run on a rotating two-to-twelve-year cycle, not annually. Each segment shows the year its own count was taken — they range from 1998 to 2025 — and MnDOT states the figure is "not growth factored", so an older segment is that year\'s number carried forward unchanged rather than an estimate of traffic now.',
        es: 'Los conteos siguen un ciclo rotativo de dos a doce años, no anual. Cada tramo muestra el año de su propio conteo —van de 1998 a 2025— y MnDOT indica que la cifra "no está ajustada por crecimiento", así que un tramo antiguo es el número de aquel año trasladado sin cambios, no una estimación del tráfico actual.',
      },
      {
        en: 'Only sampled roads appear. A road with no segment here was not counted, which is not the same as a road with no traffic — coverage is thinnest on local streets no state-aid programme requires a count for.',
        es: 'Solo aparecen las vías muestreadas. Una vía sin tramo aquí no fue contada, lo cual no equivale a una vía sin tráfico: la cobertura es más escasa en calles locales para las que ningún programa de ayuda estatal exige un conteo.',
      },
      {
        en: 'Line width is the volume, on a deliberately bent scale. Traffic is so skewed — a few segments carry a hundred times what most do — that a straight scale would draw nearly every road as a hairline. Width is therefore comparable in rank but not in ratio: a line twice as wide is not carrying twice the traffic, and the figure in the panel is the only exact reading.',
        es: 'El grosor de la línea es el volumen, en una escala deliberadamente curvada. El tráfico está tan sesgado —unos pocos tramos soportan cien veces más que la mayoría— que una escala lineal dibujaría casi todas las vías como un pelo. Por tanto, el grosor es comparable en orden pero no en proporción: una línea del doble de ancho no soporta el doble de tráfico, y la cifra del panel es la única lectura exacta.',
      },
      {
        en: 'Geometry is generalised by MnDOT\'s server to about six metres and rounded to five decimal places, because the full-precision statewide file is roughly 50 MB. Vertices move by less than the width of a road; it is a drawing convention, not a survey.',
        es: 'La geometría está generalizada por el servidor de MnDOT a unos seis metros y redondeada a cinco decimales, porque el archivo estatal a precisión completa ocupa unos 50 MB. Los vértices se desplazan menos que el ancho de una vía; es una convención de dibujo, no un levantamiento.',
      },
      {
        en: 'The "data type" code is shown as the raw letter MnDOT publishes. Their metadata says the field categorises how a value was derived but publishes no key to the codes, so a meaning is not invented for them here.',
        es: 'El código de "tipo de dato" se muestra como la letra sin procesar que publica MnDOT. Sus metadatos dicen que el campo clasifica cómo se obtuvo un valor, pero no publican ninguna clave de los códigos, así que aquí no se les inventa un significado.',
      },
      {
        en: 'This describes roads and vehicles in aggregate. It records no vehicle, no trip and no person, and it never will.',
        es: 'Esto describe vías y vehículos de forma agregada. No registra ningún vehículo, ningún trayecto ni ninguna persona, y nunca lo hará.',
      },
    ],
    geometry: 'line',
    // Amber rather than the brighter yellow this started on. It is the one hue
    // no other layer uses, which matters on a map where colour is how a reader
    // tells the layers apart, but the substrate should not be the loudest thing
    // in the frame — and a saturated yellow over 40,000 statewide segments is
    // exactly that.
    color: '#c9a227',
    colorLight: '#8d721b',
    // Context, not subject: this is the ground the other layers stand on, and
    // it has to stay legible underneath them rather than through them.
    opacity: 0.5,
    // The busiest segment in the state carries about 204,000 vehicles a day and
    // the median carries a low four figures, so the scale is bent hard at the
    // bottom: most of the width range is spent below 20,000, where almost every
    // road actually sits. Past 100,000 it flattens, because the handful of
    // interstate segments above that are already the widest things on the map
    // and letting them keep growing would only bury their neighbours.
    weightBy: {
      key: 'aadt',
      label: { en: 'Vehicles per day', es: 'Vehículos por día' },
      stops: [
        [0, 0.35],
        [500, 0.6],
        [2_000, 0.95],
        [10_000, 1.5],
        [30_000, 2.2],
        [100_000, 3.1],
        [205_000, 3.6],
      ],
    },
    dataPath: '/data/aadt.geojson',
    csvPath: null,
    provenance: {
      source: 'MnDOT — Annual Average Daily Traffic Segments, Current',
      sourceUrl: 'https://www.dot.state.mn.us/traffic/data/',
      license: 'No licence restriction stated; acknowledgement of the publisher requested',
      licenseUrl: 'https://www.arcgis.com/home/item.html?id=42923bcddafe4909b4eed0a03dea893a',
      attribution: 'Minnesota Department of Transportation',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [
      { key: 'roadClass', kind: 'enum', label: { en: 'Road class', es: 'Clase de vía' } },
      {
        key: 'jurisdiction',
        kind: 'enum',
        label: { en: 'Who owns the road', es: 'Quién es propietario de la vía' },
      },
    ],
    detailFields: [
      { key: 'aadt', label: { en: 'Vehicles per day (average)', es: 'Vehículos por día (promedio)' } },
      { key: 'countYear', label: { en: 'Year this was counted', es: 'Año del conteo' } },
      { key: 'roadClass', label: { en: 'Road class', es: 'Clase de vía' } },
      { key: 'jurisdiction', label: { en: 'Who owns the road', es: 'Quién es propietario de la vía' } },
      { key: 'community', label: { en: 'City', es: 'Ciudad' } },
      {
        key: 'collectionCycle',
        label: { en: 'Years between counts', es: 'Años entre conteos' },
      },
      {
        key: 'dataType',
        label: { en: 'Data type code (MnDOT publishes no key)', es: 'Código de tipo de dato (MnDOT no publica clave)' },
      },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'Traffic on the road nearest you', es: 'Tráfico en la vía más cercana' },
      empty: {
        en: 'No counted road segment is near this point. MnDOT counts a sample of roads, so this means none nearby was counted — not that the roads here are empty.',
        es: 'No hay ningún tramo contado cerca de este punto. MnDOT cuenta una muestra de vías, así que esto significa que ninguna cercana fue contada, no que estas vías estén vacías.',
      },
      detail: ['aadt', 'countYear', 'roadClass'],
      caveat: {
        en: 'An annual average from a count taken in the year shown, carried forward unadjusted. It counts vehicles, never who is in them.',
        es: 'Un promedio anual de un conteo realizado en el año indicado, trasladado sin ajustar. Cuenta vehículos, nunca quién va en ellos.',
      },
    },
  },

  {
    id: 'racial_covenant',
    slug: 'covenants',
    category: 'historical',
    label: {
      en: 'Racial covenants',
      es: 'Convenios raciales',
    },
    summary: {
      en: 'Deed clauses that barred non-white families from buying or living on a property, shown on the lots they were written onto.',
      es: 'Cláusulas de escritura que prohibían a familias no blancas comprar o vivir en una propiedad, mostradas sobre los lotes en que se escribieron.',
    },
    whatThisMeans: {
      en: 'A racial covenant is a sentence written into a property deed forbidding sale or occupancy to anyone not white. They were drafted from templates, recorded by the county like any other deed, and sold by developers as a feature. Minnesota covenants run from 1910, predating the federal redlining maps by a generation — the private restriction came first, and the federal appraiser later graded the neighbourhoods it had helped produce. Shelley v. Kraemer made them unenforceable in 1948 and they are void today, but the text stays in the chain of title until a homeowner files to remove it. Each shape here is the lot a covenant was written onto, as published by Mapping Prejudice. The record is the restriction on the land — the deed year, the city and the clause itself. The people named in the deed, the present-day address and the parcel number are deliberately not included.',
      es: 'Un convenio racial es una frase escrita en la escritura de una propiedad que prohíbe su venta u ocupación a cualquier persona no blanca. Se redactaban a partir de plantillas, se registraban en el condado como cualquier escritura y los promotores los vendían como una ventaja. Los convenios de Minnesota comienzan en 1910, una generación antes de los mapas federales de redlining: la restricción privada llegó primero, y el tasador federal calificó después los barrios que ella había ayudado a crear. Shelley v. Kraemer los hizo inaplicables en 1948 y hoy son nulos, pero el texto permanece en el historial de titularidad hasta que un propietario solicita eliminarlo. Cada forma aquí es el lote sobre el que se escribió un convenio, tal como lo publica Mapping Prejudice. El registro es la restricción sobre la tierra: el año de la escritura, la ciudad y la cláusula misma. Las personas nombradas en la escritura, la dirección actual y el número de parcela quedan deliberadamente fuera.',
    },
    limitations: [
      {
        en: 'The deeds name a seller and a buyer, and the source file carries the present-day street address and county parcel number. None of that is ingested here — the build fails rather than write a file containing a name, an address or a parcel identifier. For the full per-property research data, go to Mapping Prejudice directly.',
        es: 'Las escrituras nombran a un vendedor y un comprador, y el archivo de origen incluye la dirección actual y el número de parcela del condado. Nada de eso se incorpora aquí: la compilación falla antes que escribir un archivo con un nombre, una dirección o un identificador de parcela. Para los datos completos por propiedad, acuda directamente a Mapping Prejudice.',
      },
      {
        en: 'A covenant describes land. Present-day residents of a covenanted property have no connection to the clause and are not the subject of this record.',
        es: 'Un convenio describe la tierra. Los residentes actuales de una propiedad con convenio no tienen relación con la cláusula y no son el sujeto de este registro.',
      },
      {
        en: 'Covenants are found by reading digitised deeds county by county, so every count is a floor on the true number and never a ceiling. Only eight Minnesota counties have been published; a county with no parcels has not been searched.',
        es: 'Los convenios se localizan leyendo escrituras digitalizadas condado por condado, así que cada recuento es un mínimo y nunca un máximo. Solo se han publicado ocho condados de Minnesota; un condado sin parcelas no ha sido investigado.',
      },
      {
        en: 'Lot shapes are the modern parcels the deeds were matched to. A parcel split or merged since the deed was recorded may not align exactly with today’s lot lines.',
        es: 'Las formas de los lotes son las parcelas modernas a las que se vincularon las escrituras. Una parcela dividida o fusionada desde que se registró la escritura puede no coincidir exactamente con los límites actuales.',
      },
      {
        en: 'Zoomed out past a city, individual lots are drawn as a shaded grid cell instead — a count and a commonest decade standing in for parcels too small to tell apart at that distance. The cell is a drawing convenience, not a record: it is not searchable, not clickable, and disappears as soon as the view is close enough to show the real lots underneath it.',
        es: 'Alejado más allá de una ciudad, los lotes individuales se dibujan como una celda de cuadrícula sombreada: un recuento y la década más común representan parcelas demasiado pequeñas para distinguirlas a esa distancia. La celda es un recurso de dibujo, no un registro: no se puede buscar, no se puede pulsar, y desaparece en cuanto la vista está lo bastante cerca para mostrar los lotes reales debajo de ella.',
      },
    ],
    geometry: 'polygon',
    // Mapping Prejudice draw covenants as red marks on a dark ground; the
    // layer keeps the source's visual language.
    color: '#dc2626',
    categoryColors: {
      key: 'deedDecade',
      label: { en: 'Decade the deed was recorded', es: 'Década en que se registró la escritura' },
      // One hue, light to dark in deed order, so the spread of covenants
      // across the century reads as a deepening of the same red.
      colors: [
        { value: '1910s', color: '#fee2d5' },
        { value: '1920s', color: '#fcbba1' },
        { value: '1930s', color: '#fc9272' },
        { value: '1940s', color: '#f4604d' },
        { value: '1950s', color: '#de2d26' },
        { value: '1960s', color: '#a50f15' },
        { value: '1970s', color: '#67000d' },
      ],
      fallback: '#9ca3af',
    },
    // Same window ALPR uses for its own emerge/resolve pair, shifted up: a
    // parcel is metres wide rather than a fixed-size camera icon, so it needs
    // to be much closer before it reads as its own shape rather than noise.
    blockAggregate: { cellMeters: 300, blocksUntil: 12, detailFrom: 15 },
    // Only when this layer is toggled on and a lot renders at real scale
    // (not the zoomed-out block-aggregate cell — see blockAggregate above,
    // which stays unclickable and unhoverable by design).
    hoverCard: {
      fields: ['deedYear', 'city'],
    },
    dataPath: '/data/covenants.geojson',
    csvPath: null,
    provenance: {
      source: 'Mapping Prejudice, University of Minnesota Libraries',
      sourceUrl: 'https://mappingprejudice.umn.edu',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/public-domain/cc0/',
      attribution:
        'Ehrman-Solberg, Petersen, Mills, Delegard, Mattke and crowdsourcing community mapmakers — U.S. Racial Covenants Series, hosted by Mapping Prejudice',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'rare',
    },
    filters: [
      { key: 'city', kind: 'enum', label: { en: 'City', es: 'Ciudad' } },
      { key: 'deedDecade', kind: 'enum', label: { en: 'Decade', es: 'Década' } },
    ],
    detailFields: [
      { key: 'deedYear', label: { en: 'Deed year', es: 'Año de la escritura' } },
      { key: 'city', label: { en: 'City', es: 'Ciudad' } },
      {
        key: 'covenantText',
        label: { en: 'The clause, verbatim', es: 'La cláusula, textual' },
      },
    ],
    nearMe: {
      mode: 'contains',
      title: { en: 'Racial covenants recorded here', es: 'Convenios raciales registrados aquí' },
      empty: {
        en: 'No covenant is recorded on a parcel containing this point. Only eight Minnesota counties have been searched, so a blank is not evidence that none was written.',
        es: 'No hay ningún convenio registrado en una parcela que contenga este punto. Solo se han investigado ocho condados de Minnesota, así que un vacío no prueba que no se escribiera ninguno.',
      },
      detail: ['deedYear', 'city'],
      caveat: {
        en: 'A covenant describes a restriction on land, not the people who live there now. The deed’s names, the address and the parcel number are not part of this record.',
        es: 'Un convenio describe una restricción sobre la tierra, no a las personas que viven allí ahora. Los nombres de la escritura, la dirección y el número de parcela no forman parte de este registro.',
      },
      wide: true,
    },
  },

  {
    id: 'ej_cumulative',
    slug: 'ej-cumulative',
    category: 'environment',
    label: { en: 'Cumulative Stressors', es: 'Factores de estrés acumulativos' },
    summary: {
      en: 'How many environmental and health stressors burden each census tract today, from MPCA’s draft CI-MAP.',
      es: 'Cuántos factores de estrés ambientales y de salud cargan hoy cada sección censal, según el borrador CI-MAP de la MPCA.',
    },
    whatThisMeans: {
      en: 'Minnesota’s 2023 cumulative impacts law (Minn. Stat. § 116.065) requires the state to weigh the burdens a community already carries before permitting new ones. CI-MAP is the Pollution Control Agency’s draft implementation: for every census tract it counts stressors — air pollution risk, cleanup sites, impaired waters, traffic, asthma and lead rates, tree cover and more, 26 indicators in all — and compares the count to county and state medians. Laid beside the 1930s redlining grades and the covenant map, it shows where the historical lines and present-day burdens coincide. A tract is an aggregate of thousands of people; nothing here describes a household.',
      es: 'La ley de impactos acumulativos de Minnesota de 2023 (Minn. Stat. § 116.065) exige al estado sopesar las cargas que una comunidad ya soporta antes de permitir otras nuevas. CI-MAP es la implementación preliminar de la Agencia de Control de la Contaminación: para cada sección censal cuenta factores de estrés — riesgo de contaminación del aire, sitios de limpieza, aguas degradadas, tráfico, tasas de asma y plomo, cobertura arbórea y más, 26 indicadores en total — y compara el recuento con las medianas del condado y del estado. Junto a las calificaciones de redlining de los años 30 y el mapa de convenios, muestra dónde coinciden las líneas históricas y las cargas actuales. Una sección censal agrega a miles de personas; nada aquí describe un hogar.',
    },
    geometryNote: CENSUS_TRACT_NOTE,
    limitations: [
      {
        en: 'CI-MAP is a public draft first published in December 2025; scores and methodology may change as rulemaking under the statute proceeds.',
        es: 'CI-MAP es un borrador público publicado en diciembre de 2025; las puntuaciones y la metodología pueden cambiar durante la reglamentación de la ley.',
      },
      {
        en: 'The four burden bands compare a tract to its county median and are this project’s presentation, not MPCA’s determination. The agency’s own adverse-cumulative-stressors finding is shown unmodified in the detail panel.',
        es: 'Las cuatro bandas de carga comparan una sección con la mediana de su condado y son una presentación de este proyecto, no una determinación de la MPCA. La conclusión propia de la agencia sobre factores acumulativos adversos se muestra sin modificar en el panel de detalle.',
      },
      {
        en: 'A tract average says nothing about any particular block or household within it.',
        es: 'Un promedio por sección censal no dice nada sobre una manzana o un hogar concreto dentro de ella.',
      },
      {
        en: 'No formal licence is published for the service; it is treated as public government data under Minn. Stat. ch. 13 and attributed to MPCA.',
        es: 'No se publica una licencia formal para el servicio; se trata como datos públicos gubernamentales según Minn. Stat. cap. 13 y se atribuye a la MPCA.',
      },
    ],
    geometry: 'polygon',
    color: '#d95f2b',
    categoryColors: {
      key: 'burdenBand',
      label: { en: 'Burden vs county median', es: 'Carga frente a la mediana del condado' },
      colors: [
        { value: 'Fewer stressors', color: '#fde8d7' },
        { value: 'Near county median', color: '#f5a86b' },
        { value: 'Elevated', color: '#d95f2b' },
        { value: 'Most burdened', color: '#8f2d0f' },
      ],
      fallback: '#6b7280',
    },
    // Same hover-on-enabled treatment as the historical-policy layers beside
    // it: a reader browsing tracts should get the burden band at a glance
    // without a click.
    hoverCard: {
      fields: ['stressorSummary', 'burdenBand', 'mpcaAdverse'],
    },
    dataPath: '/data/ej-cumulative.geojson',
    csvPath: null,
    provenance: {
      source: 'Minnesota Pollution Control Agency, Cumulative Impacts Mapping and Analysis Platform (CI-MAP)',
      sourceUrl: 'https://pca-gis02.pca.state.mn.us/ci-map/',
      license: 'Public government data (Minn. Stat. ch. 13) — no formal licence published',
      licenseUrl: null,
      attribution: 'Minnesota Pollution Control Agency, CI-MAP (draft)',
      sourceDate: '2025-12',
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [
      { key: 'burdenBand', kind: 'enum', label: { en: 'Burden band', es: 'Banda de carga' } },
      {
        key: 'mpcaAdverse',
        kind: 'enum',
        label: {
          en: 'MPCA adverse-stressors finding',
          es: 'Conclusión de la MPCA sobre factores adversos',
        },
      },
    ],
    detailFields: [
      {
        // "19 / 26" — the count as MPCA counts it, and the fixed denominator
        // CI-MAP's methodology uses (see whatThisMeans above). Computed once
        // in ej-cumulative.mjs alongside the raw stressorCount, which stays a
        // plain number for the band calculation and any future export; this
        // is display text only.
        key: 'stressorSummary',
        label: { en: 'Cumulative stressors', es: 'Factores de estrés acumulativos' },
      },
      {
        // Same wording the map's own legend and fill color already use for
        // this field (categoryColors.label above) — one judgment about a
        // tract's burden, read the same way wherever it appears, not a
        // second scale invented for this row alone.
        key: 'burdenBand',
        label: { en: 'Burden vs county median', es: 'Carga frente a la mediana del condado' },
      },
      {
        key: 'countyMedian',
        label: { en: 'County median', es: 'Mediana del condado' },
      },
      {
        key: 'stateMedian',
        label: { en: 'State median', es: 'Mediana estatal' },
      },
      {
        key: 'mpcaAdverse',
        label: {
          en: 'MPCA finding: adverse cumulative stressors',
          es: 'Conclusión de la MPCA: factores acumulativos adversos',
        },
      },
      {
        key: 'adverseList',
        label: {
          en: 'Stressors MPCA marks adverse here',
          es: 'Factores que la MPCA marca como adversos aquí',
        },
        format: 'pills',
        pillLabels: EJ_STRESSOR_LABELS,
      },
      {
        key: 'tribeNames',
        label: { en: 'Tribal nation, where the tract overlaps one', es: 'Nación tribal, cuando la sección se superpone a una' },
      },
      {
        key: 'ejPoverty',
        label: {
          en: 'EJ area by income (MPCA threshold)',
          es: 'Área de justicia ambiental por ingresos (umbral de la MPCA)',
        },
      },
      {
        key: 'ejPeopleOfColor',
        label: {
          en: 'EJ area by race (MPCA threshold)',
          es: 'Área de justicia ambiental por raza (umbral de la MPCA)',
        },
      },
      {
        key: 'ejLimitedEnglish',
        label: {
          en: 'EJ area by limited English (MPCA threshold)',
          es: 'Área de justicia ambiental por dominio limitado del inglés (umbral de la MPCA)',
        },
      },
    ],
    nearMe: {
      mode: 'contains',
      title: {
        en: 'This area’s cumulative burden today',
        es: 'La carga acumulativa actual de esta zona',
      },
      empty: {
        en: 'This point is not inside a Minnesota census tract with CI-MAP data.',
        es: 'Este punto no está dentro de una sección censal de Minnesota con datos de CI-MAP.',
      },
      detail: ['stressorSummary', 'burdenBand', 'countyMedian', 'mpcaAdverse'],
      wide: true,
    },
  },

  {
    id: 'demographic_black_share',
    slug: 'demographics-black',
    category: 'environment',
    label: { en: 'Black population share', es: 'Proporción de población negra' },
    summary: {
      en: 'What share of each census tract is Black or African American, from the Census Bureau’s American Community Survey.',
      es: 'Qué proporción de cada sección censal es negra o afroamericana, según la Encuesta sobre la Comunidad de la Census Bureau.',
    },
    whatThisMeans: {
      en: 'The Census Bureau’s American Community Survey samples households continuously and publishes a five-year rolling average for every census tract — a few thousand residents each. This layer shows what share of each tract is Black or African American, counted separately from Hispanic or Latino origin so a Black Hispanic resident is not counted twice. Laid beside the ALPR and agency-jurisdiction layers, it lets a reader ask whether surveillance and enforcement infrastructure concentrates in Black neighborhoods — a question this layer states the numbers for and answers for no one: it computes no score or index against any other layer, only the population share itself.',
      es: 'La Encuesta sobre la Comunidad de la Census Bureau muestrea hogares de forma continua y publica un promedio móvil de cinco años para cada sección censal, de unos pocos miles de residentes cada una. Esta capa muestra qué proporción de cada sección es negra o afroamericana, contada por separado del origen hispano o latino para que un residente negro hispano no se cuente dos veces. Junto a las capas de ALPR y jurisdicciones policiales, permite preguntar si la infraestructura de vigilancia y aplicación de la ley se concentra en barrios negros — una pregunta para la que esta capa presenta las cifras y no responde por nadie: no calcula ningún puntaje ni índice frente a otra capa, solo la proporción de población misma.',
    },
    geometryNote: CENSUS_TRACT_NOTE,
    limitations: [
      {
        en: 'A five-year rolling average, not a count taken on any single date.',
        es: 'Un promedio móvil de cinco años, no un recuento tomado en una fecha concreta.',
      },
      {
        en: 'Margins of error can be large for a small population in a small tract. Tracts where the estimate’s coefficient of variation exceeds 40% — the Census Bureau’s own reliability cutoff — are marked in the detail panel rather than shown as precise; roughly seven in ten Minnesota tracts fall into that category for this specific estimate, since the statewide Black population is a small share spread thin across mostly rural tracts.',
        es: 'Los márgenes de error pueden ser grandes para una población pequeña en una sección pequeña. Las secciones donde el coeficiente de variación de la estimación supera el 40% —el propio umbral de fiabilidad de la Census Bureau— se marcan en el panel de detalle en lugar de mostrarse como precisas; alrededor de siete de cada diez secciones de Minnesota caen en esa categoría para esta estimación en concreto, ya que la población negra estatal es una proporción pequeña repartida entre secciones mayormente rurales.',
      },
      {
        en: 'A tract average says nothing about any block or household within it.',
        es: 'Un promedio por sección censal no dice nada sobre una manzana o un hogar concreto dentro de ella.',
      },
    ],
    geometry: 'polygon',
    color: '#ec4899',
    colorLight: '#be185d',
    categoryColors: {
      key: 'blackBand',
      label: { en: 'Black population share', es: 'Proporción de población negra' },
      colors: [
        { value: '0–5%', color: '#fce7f3' },
        { value: '5–15%', color: '#f9a8d4' },
        { value: '15–30%', color: '#ec4899' },
        { value: '30–50%', color: '#be185d' },
        { value: '50%+', color: '#831843' },
      ],
      fallback: '#6b7280',
    },
    // Same hover-on-enabled treatment as the other tract-level layers.
    hoverCard: {
      fields: ['blackPercent', 'blackHighUncertainty', 'totalPopulation'],
    },
    dataPath: '/data/demographics.geojson',
    csvPath: null,
    provenance: {
      source: 'U.S. Census Bureau, American Community Survey, table B03002',
      sourceUrl: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
      license: 'Public domain (U.S. federal statistical work)',
      licenseUrl: null,
      attribution: 'U.S. Census Bureau, American Community Survey',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [{ key: 'blackBand', kind: 'enum', label: { en: 'Black population share', es: 'Proporción de población negra' } }],
    detailFields: [
      { key: 'blackPercent', label: { en: 'Black or African American, % of tract', es: 'Negra o afroamericana, % de la sección' } },
      { key: 'blackPercentMoe', label: { en: '± margin of error, percentage points', es: '± margen de error, puntos porcentuales' } },
      { key: 'blackHighUncertainty', label: { en: 'Estimate below the Census Bureau’s reliability threshold', es: 'Estimación por debajo del umbral de fiabilidad de la Census Bureau' } },
      { key: 'totalPopulation', label: { en: 'Total tract population', es: 'Población total de la sección' } },
    ],
  },

  {
    id: 'demographic_latinx_share',
    slug: 'demographics-latinx',
    category: 'environment',
    label: { en: 'Latinx population share', es: 'Proporción de población latina' },
    summary: {
      en: 'What share of each census tract is Hispanic or Latino, from the Census Bureau’s American Community Survey.',
      es: 'Qué proporción de cada sección censal es hispana o latina, según la Encuesta sobre la Comunidad de la Census Bureau.',
    },
    whatThisMeans: {
      en: 'The same American Community Survey five-year rolling average as the Black population share layer, showing what share of each tract is Hispanic or Latino of any race. Laid beside the ALPR and agency-jurisdiction layers, it lets a reader ask whether surveillance and enforcement infrastructure concentrates in Latinx neighborhoods — a question this layer states the numbers for and answers for no one: it computes no score or index against any other layer, only the population share itself.',
      es: 'El mismo promedio móvil de cinco años de la Encuesta sobre la Comunidad que la capa de proporción de población negra, mostrando qué proporción de cada sección es hispana o latina de cualquier raza. Junto a las capas de ALPR y jurisdicciones policiales, permite preguntar si la infraestructura de vigilancia y aplicación de la ley se concentra en barrios latinos — una pregunta para la que esta capa presenta las cifras y no responde por nadie: no calcula ningún puntaje ni índice frente a otra capa, solo la proporción de población misma.',
    },
    geometryNote: CENSUS_TRACT_NOTE,
    limitations: [
      {
        en: 'A five-year rolling average, not a count taken on any single date.',
        es: 'Un promedio móvil de cinco años, no un recuento tomado en una fecha concreta.',
      },
      {
        en: 'Margins of error can be large for a small population in a small tract. Tracts where the estimate’s coefficient of variation exceeds 40% — the Census Bureau’s own reliability cutoff — are marked in the detail panel rather than shown as precise.',
        es: 'Los márgenes de error pueden ser grandes para una población pequeña en una sección pequeña. Las secciones donde el coeficiente de variación de la estimación supera el 40% —el propio umbral de fiabilidad de la Census Bureau— se marcan en el panel de detalle en lugar de mostrarse como precisas.',
      },
      {
        en: 'A tract average says nothing about any block or household within it.',
        es: 'Un promedio por sección censal no dice nada sobre una manzana o un hogar concreto dentro de ella.',
      },
    ],
    geometry: 'polygon',
    color: '#6366f1',
    colorLight: '#4338ca',
    categoryColors: {
      key: 'latinxBand',
      label: { en: 'Latinx population share', es: 'Proporción de población latina' },
      colors: [
        { value: '0–5%', color: '#e0e7ff' },
        { value: '5–15%', color: '#a5b4fc' },
        { value: '15–30%', color: '#6366f1' },
        { value: '30–50%', color: '#4338ca' },
        { value: '50%+', color: '#312e81' },
      ],
      fallback: '#6b7280',
    },
    // Same hover-on-enabled treatment as the other tract-level layers.
    hoverCard: {
      fields: ['latinxPercent', 'latinxHighUncertainty', 'totalPopulation'],
    },
    dataPath: '/data/demographics.geojson',
    csvPath: null,
    provenance: {
      source: 'U.S. Census Bureau, American Community Survey, table B03002',
      sourceUrl: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
      license: 'Public domain (U.S. federal statistical work)',
      licenseUrl: null,
      attribution: 'U.S. Census Bureau, American Community Survey',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [{ key: 'latinxBand', kind: 'enum', label: { en: 'Latinx population share', es: 'Proporción de población latina' } }],
    detailFields: [
      { key: 'latinxPercent', label: { en: 'Hispanic or Latino, % of tract', es: 'Hispana o latina, % de la sección' } },
      { key: 'latinxPercentMoe', label: { en: '± margin of error, percentage points', es: '± margen de error, puntos porcentuales' } },
      { key: 'latinxHighUncertainty', label: { en: 'Estimate below the Census Bureau’s reliability threshold', es: 'Estimación por debajo del umbral de fiabilidad de la Census Bureau' } },
      { key: 'totalPopulation', label: { en: 'Total tract population', es: 'Población total de la sección' } },
    ],
  },

  {
    id: 'demographic_poverty_rate',
    slug: 'demographics-poverty',
    category: 'environment',
    label: { en: 'Poverty rate', es: 'Tasa de pobreza' },
    summary: {
      en: 'What share of each census tract lives below the federal poverty line, from the Census Bureau’s American Community Survey.',
      es: 'Qué proporción de cada sección censal vive por debajo del umbral federal de pobreza, según la Encuesta sobre la Comunidad de la Census Bureau.',
    },
    whatThisMeans: {
      en: 'The same American Community Survey five-year rolling average as the two population-share layers, showing what share of each tract’s residents live below the federal poverty line. Laid beside the ALPR and agency-jurisdiction layers, it lets a reader ask whether surveillance and enforcement infrastructure concentrates in low-income neighborhoods — a question this layer states the numbers for and answers for no one: it computes no score or index against any other layer, only the rate itself.',
      es: 'El mismo promedio móvil de cinco años de la Encuesta sobre la Comunidad que las dos capas de proporción de población, mostrando qué proporción de los residentes de cada sección vive por debajo del umbral federal de pobreza. Junto a las capas de ALPR y jurisdicciones policiales, permite preguntar si la infraestructura de vigilancia y aplicación de la ley se concentra en barrios de bajos ingresos — una pregunta para la que esta capa presenta las cifras y no responde por nadie: no calcula ningún puntaje ni índice frente a otra capa, solo la tasa misma.',
    },
    geometryNote: CENSUS_TRACT_NOTE,
    limitations: [
      {
        en: 'A five-year rolling average, not a count taken on any single date.',
        es: 'Un promedio móvil de cinco años, no un recuento tomado en una fecha concreta.',
      },
      {
        en: 'This is the Census Bureau’s own pre-computed subject-table rate (table S1701), with its own published margin of error — shown in the detail panel, and flagged where the coefficient of variation exceeds the Bureau’s 40% reliability cutoff.',
        es: 'Esta es la tasa ya calculada por la propia Census Bureau en su tabla temática (tabla S1701), con su propio margen de error publicado —mostrado en el panel de detalle y señalado cuando el coeficiente de variación supera el umbral de fiabilidad del 40% de la Oficina.',
      },
      {
        en: 'A tract average says nothing about any block or household within it.',
        es: 'Un promedio por sección censal no dice nada sobre una manzana o un hogar concreto dentro de ella.',
      },
    ],
    geometry: 'polygon',
    color: '#14b8a6',
    colorLight: '#0f766e',
    categoryColors: {
      key: 'povertyBand',
      label: { en: 'Poverty rate', es: 'Tasa de pobreza' },
      colors: [
        { value: '0–10%', color: '#ccfbf1' },
        { value: '10–20%', color: '#5eead4' },
        { value: '20–30%', color: '#14b8a6' },
        { value: '30–40%', color: '#0f766e' },
        { value: '40%+', color: '#134e4a' },
      ],
      fallback: '#6b7280',
    },
    // Same hover-on-enabled treatment as the other tract-level layers.
    hoverCard: {
      fields: ['povertyPercent', 'povertyHighUncertainty', 'totalPopulation'],
    },
    dataPath: '/data/demographics.geojson',
    csvPath: null,
    provenance: {
      source: 'U.S. Census Bureau, American Community Survey, table S1701',
      sourceUrl: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
      license: 'Public domain (U.S. federal statistical work)',
      licenseUrl: null,
      attribution: 'U.S. Census Bureau, American Community Survey',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [{ key: 'povertyBand', kind: 'enum', label: { en: 'Poverty rate', es: 'Tasa de pobreza' } }],
    detailFields: [
      { key: 'povertyPercent', label: { en: 'Below the poverty line, % of tract', es: 'Por debajo del umbral de pobreza, % de la sección' } },
      { key: 'povertyPercentMoe', label: { en: '± margin of error, percentage points', es: '± margen de error, puntos porcentuales' } },
      { key: 'povertyHighUncertainty', label: { en: 'Estimate below the Census Bureau’s reliability threshold', es: 'Estimación por debajo del umbral de fiabilidad de la Census Bureau' } },
      { key: 'totalPopulation', label: { en: 'Total tract population', es: 'Población total de la sección' } },
    ],
  },

  {
    id: 'crime_minneapolis',
    slug: 'crime-minneapolis',
    category: 'crime',
    subgroup: CRIME_SUBGROUP_BY_TYPE,
    label: {
      en: 'Reported crime, Minneapolis neighborhoods',
      es: 'Delitos denunciados, barrios de Minneapolis',
    },
    summary: {
      en: 'All eight FBI Part I offenses together, reported to Minneapolis police in each neighborhood each year. The eight are also mappable one at a time.',
      es: 'Los ocho delitos de Parte I del FBI juntos, denunciados a la policía de Minneapolis en cada barrio cada año. Los ocho también se pueden mapear por separado.',
    },
    whatThisMeans: {
      en: 'The City of Minneapolis publishes a count of reported offenses in each of its 87 neighborhoods, every month, in eight categories the FBI’s Uniform Crime Reporting program calls Part I offenses: homicide, rape, robbery, aggravated assault, burglary, larceny, auto theft, and arson. This layer draws all eight added together as a scatter of dots inside each neighborhood, roughly one dot per 74 reported offenses for the most recent complete calendar year, with each neighborhood’s year-by-year figures in its detail panel. Because larceny outnumbers every other category several times over, this combined total largely traces where larceny is reported — the eight single-offense layers beside it are where a different pattern shows up, and a homicide map and a larceny map look nothing alike. These are counts of reports, not of people, and this layer holds no record of any person — the City aggregates the figures before publishing them, and nothing here resolves to an incident, an address, or an individual. A reader may want to set these numbers beside where surveillance equipment sits, or beside the poverty and population layers on this map. That is a question this layer states the numbers for and answers for no one: it computes no score or index against any other layer, only the counts themselves.',
      es: 'La Ciudad de Minneapolis publica un recuento de delitos denunciados en cada uno de sus 87 barrios, cada mes, en ocho categorías que el programa de Informes Uniformes de Delitos del FBI llama delitos de Parte I: homicidio, violación, robo con violencia, agresión con agravantes, robo con allanamiento, hurto, robo de vehículos e incendio provocado. Esta capa dibuja los ocho sumados como una dispersión de puntos dentro de cada barrio, aproximadamente un punto por cada 74 delitos denunciados para el último año calendario completo, con las cifras año por año de cada barrio en su panel de detalle. Como el hurto supera varias veces a todas las demás categorías, este total combinado traza en gran medida dónde se denuncia el hurto: las ocho capas de delito individual que la acompañan son donde aparece un patrón distinto, y un mapa de homicidios y uno de hurtos no se parecen en nada. Son recuentos de denuncias, no de personas, y esta capa no contiene registro de ninguna persona: la Ciudad agrega las cifras antes de publicarlas, y nada aquí se resuelve a un incidente, una dirección o un individuo. Quien lea puede querer poner estas cifras junto a dónde se ubican los equipos de vigilancia, o junto a las capas de pobreza y población de este mapa. Esa es una pregunta para la que esta capa presenta las cifras y no responde por nadie: no calcula ningún puntaje ni índice frente a otra capa, solo los recuentos mismos.',
    },
    geometryNote: CRIME_GEOMETRY_NOTE,
    limitations: CRIME_LIMITATIONS,
    geometry: 'polygon',
    color: '#a3e635',
    colorLight: '#4d7c0f',
    categoryColors: {
      key: 'reportedTotalBand',
      label: { en: 'Reported Part I offenses', es: 'Delitos de Parte I denunciados' },
      colors: crimeBands(TOTAL_STOPS),
      fallback: CRIME_FALLBACK,
      showOnMapKey: false,
    },
    dotDensity: {
      perUnit: 74,
      key: 'reportedTotal',
      keyLabel: {
        en: '1 dot ≈ 74 reported Part I offenses, positions randomized',
        es: '1 punto ≈ 74 delitos de Parte I denunciados, posiciones aleatorias',
      },
    },
    // total2018..total2025 already exist on every feature — see the ingest's
    // YEAR_ROWS-driven detail fields. The eight single-offense layers below
    // do not have this yet (see timeSeries' own comment in layers/types.ts).
    timeSeries: { years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] },
    hoverCard: {
      fields: ['reportedTotal', 'statYear', 'violentTotal'],
    },
    dataPath: '/data/crime-minneapolis.geojson',
    csvPath: null,
    provenance: CRIME_PROVENANCE,
    filters: [
      {
        key: 'reportedTotalBand',
        kind: 'enum',
        label: { en: 'Reported Part I offenses', es: 'Delitos de Parte I denunciados' },
      },
    ],
    detailFields: CRIME_DETAIL_FIELDS,
  },

  ...CRIME_OFFENCE_LAYERS,

  {
    id: 'crime_block_group',
    slug: 'crime-block-groups',
    category: 'crime',
    subgroup: CRIME_SUBGROUP_SMALL_AREAS,
    label: {
      en: 'Reported crime, small areas',
      es: 'Delitos denunciados, áreas pequeñas',
    },
    summary: {
      en: 'The same reports counted in areas about a fifth the size of a neighborhood — roughly 600 to 3,000 residents each. All offenses together; this layer publishes no breakdown by type.',
      es: 'Las mismas denuncias contadas en áreas de aproximadamente una quinta parte de un barrio: de unos 600 a 3000 residentes cada una. Todos los delitos juntos; esta capa no publica desglose por tipo.',
    },
    whatThisMeans: {
      en: 'Minneapolis has 87 neighborhoods, which is coarse enough that a busy corner and the quiet blocks around it read as one flat shade. This layer counts the same reported offenses inside census block groups instead — 394 areas rather than 87 — so concentration inside a neighborhood becomes visible. It is the only layer on this map built by aggregating records that are published one-by-one: the City’s incident feed carries a case number, an address and a time on every row, and this project reads none of those fields. The ingest requests the location and nothing else, so no case number, address, date or charge is ever downloaded, held, or written. What is published is one number for one area for one full year. There is deliberately no breakdown by offense type here and there will not be one: a single rape or homicide placed in one small area in one year can identify a person, where a count of all offenses together cannot. The breakdown lives at neighborhood scale in the layers beside this one, and the two are never crossed. Areas with fewer than five reported offenses in a year are withheld rather than published, and shown as withheld rather than as zero. Each area is drawn as a scatter of small dots rather than a shaded fill — roughly one dot per five reported offenses — so that density reads as texture instead of one flat colour per area. A dot’s position inside its area is chosen at random by this site when the map draws it. No dot marks a real address, an actual report, or any specific place — only the count and the area boundary come from the source data.',
      es: 'Minneapolis tiene 87 barrios, lo bastante amplios como para que una esquina concurrida y las manzanas tranquilas a su alrededor se lean como un solo tono plano. Esta capa cuenta las mismas denuncias dentro de grupos de bloques censales: 394 áreas en lugar de 87, de modo que la concentración dentro de un barrio se hace visible. Es la única capa de este mapa construida agregando registros que se publican uno por uno: el flujo de incidentes de la Ciudad lleva un número de caso, una dirección y una hora en cada fila, y este proyecto no lee ninguno de esos campos. La ingesta solicita la ubicación y nada más, así que ningún número de caso, dirección, fecha ni cargo se descarga, se guarda ni se escribe. Lo que se publica es un número, para un área, para un año completo. Deliberadamente no hay desglose por tipo de delito aquí y no lo habrá: una sola violación u homicidio situado en un área pequeña en un año puede identificar a una persona, mientras que un recuento de todos los delitos juntos no. El desglose vive a escala de barrio en las capas contiguas, y ambas nunca se cruzan. Las áreas con menos de cinco delitos denunciados en un año se retienen en lugar de publicarse, y se muestran como retenidas, no como cero. Cada área se dibuja como una dispersión de pequeños puntos en lugar de un relleno sombreado —aproximadamente un punto por cada cinco delitos denunciados— para que la densidad se lea como textura en vez de un solo color plano por área. La posición de un punto dentro de su área la elige al azar este sitio al dibujar el mapa. Ningún punto marca una dirección real, una denuncia concreta ni un lugar específico: solo el recuento y el límite del área provienen de los datos de origen.',
    },
    geometryNote: {
      en: 'A census block group is a U.S. Census Bureau reporting area of roughly 600–3,000 residents — the smallest area the Bureau publishes most statistics for. It is not a neighborhood and has no name anyone uses.',
      es: 'Un grupo de bloques censales es un área de informe de la Oficina del Censo de EE. UU. de unos 600 a 3000 residentes: la menor área para la que la Oficina publica la mayoría de sus estadísticas. No es un barrio y no tiene un nombre que nadie use.',
    },
    limitations: [
      {
        en: 'Each dot’s position inside its area is chosen at random, and carries no information of its own — a cluster of dots means a busier area, not that anything happened at any of those exact spots. Nothing on this map places a dot at a real address or ties one to a real report.',
        es: 'La posición de cada punto dentro de su área se elige al azar y no aporta información por sí sola: un grupo de puntos indica un área más activa, no que algo haya ocurrido en esos lugares exactos. Nada en este mapa coloca un punto en una dirección real ni lo vincula a una denuncia concreta.',
      },
      {
        en: 'A count of offenses reported to and recorded by police. It is a record of what was reported and what police chose to record, which is not the same as a record of what happened.',
        es: 'Un recuento de delitos denunciados a la policía y registrados por ella. Es un registro de lo que se denunció y de lo que la policía decidió registrar, que no es lo mismo que un registro de lo que ocurrió.',
      },
      {
        en: 'No breakdown by offense type, by design and permanently. Crossing a small area with a rare offense is what makes small-area crime data able to identify a person, so this layer publishes all offenses added together and nothing else. For the breakdown, use the neighborhood-scale layers beside this one.',
        es: 'Sin desglose por tipo de delito, por diseño y de forma permanente. Cruzar un área pequeña con un delito poco frecuente es lo que permite que los datos de delincuencia de áreas pequeñas identifiquen a una persona, así que esta capa publica todos los delitos sumados y nada más. Para el desglose, usa las capas a escala de barrio contiguas a esta.',
      },
      {
        en: 'Areas with fewer than five reported offenses in a year are withheld, not published. A withheld area is shown as withheld and never as zero — that something was withheld is itself worth publishing.',
        es: 'Las áreas con menos de cinco delitos denunciados en un año se retienen, no se publican. Un área retenida se muestra como retenida y nunca como cero: que algo se haya retenido merece publicarse por sí mismo.',
      },
      {
        en: 'An incident is placed at the address the report was filed against, which is not always where anything happened. A report taken at a police building, a hospital or a shelter is counted there, which can make that area look busier than the blocks around it.',
        es: 'Un incidente se sitúa en la dirección contra la que se presentó la denuncia, que no siempre es donde ocurrió algo. Una denuncia tomada en una comisaría, un hospital o un albergue se cuenta allí, lo que puede hacer que esa área parezca más concurrida que las manzanas de alrededor.',
      },
      {
        en: 'Counts, not rates. Block groups are drawn to hold roughly similar populations, which makes them more comparable to each other than neighborhoods are — but a block group covering a downtown block with few residents and many visitors still shows a high count without that meaning more per resident.',
        es: 'Recuentos, no tasas. Los grupos de bloques se trazan para contener poblaciones aproximadamente similares, lo que los hace más comparables entre sí que los barrios; pero un grupo que cubre una manzana del centro con pocos residentes y muchos visitantes seguirá mostrando un recuento alto sin que eso signifique más por residente.',
      },
      {
        en: 'The City changed police records systems in February 2019. 2018 is assembled from the two extracts that straddle that change, and its figures are not strictly comparable to later years.',
        es: 'La Ciudad cambió de sistema de registros policiales en febrero de 2019. 2018 se compone de los dos extractos que abarcan ese cambio, y sus cifras no son estrictamente comparables con los años posteriores.',
      },
      {
        en: 'Minneapolis only, and only what Minneapolis police recorded. This is one city of more than 850 in Minnesota, and no comparable small-area figures exist statewide.',
        es: 'Solo Minneapolis, y solo lo que registró la policía de Minneapolis. Esta es una ciudad de más de 850 en Minnesota, y no existen cifras comparables de áreas pequeñas en todo el estado.',
      },
    ],
    geometry: 'polygon',
    color: '#a3e635',
    colorLight: '#4d7c0f',
    // Kept for the "Filters" control — hiding a band still hides that band's
    // areas and their dots (see mapController.ts's refresh()) — but not used
    // to paint the fill itself, and not shown as a swatch bar on the floating
    // map key: dotDensity below replaces both of those (see its own comment
    // in layers/types.ts and refreshMapKeys in MapView.astro).
    categoryColors: {
      key: 'reportedTotalBand',
      label: { en: 'Reported offenses', es: 'Delitos denunciados' },
      colors: [
        { value: '0–24', color: '#f7fee7' },
        { value: '25–44', color: '#d9f99d' },
        { value: '45–74', color: '#a3e635' },
        { value: '75–114', color: '#65a30d' },
        { value: '115+', color: '#365314' },
      ],
      fallback: '#6b7280',
      showOnMapKey: false,
    },
    // 1:5 chosen against the real 2018-2025 distribution: even the single
    // busiest block group (443 offenses/year, ~0.36km2) scatters to about 80m
    // average spacing between dots at that ratio — legible texture, not a
    // solid blob. ~4,400 dots citywide for the mapped year, well inside what
    // this map already draws for the real ALPR point layer (1,430 features).
    dotDensity: {
      perUnit: 5,
      key: 'reportedTotal',
      keyLabel: {
        en: '1 dot ≈ 5 reported offenses, positions randomized',
        es: '1 punto ≈ 5 delitos denunciados, posiciones aleatorias',
      },
    },
    timeSeries: { years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] },
    hoverCard: {
      fields: ['reportedTotal', 'statYear', 'suppressed'],
    },
    dataPath: '/data/crime-blockgroups.geojson',
    csvPath: null,
    provenance: {
      source:
        'City of Minneapolis Open Data, Police Incidents (aggregated to block groups by this project); U.S. Census Bureau TIGERweb 2020 block groups',
      sourceUrl:
        'https://opendata.minneapolismn.gov/search?groupIds=79606f50581f4a33b14a19e61c4891f7&q=incidents',
      license:
        'CC0 1.0 Universal (public domain dedication); block group boundaries public domain (U.S. federal work)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'City of Minneapolis Open Data; U.S. Census Bureau',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
    },
    filters: [
      {
        key: 'reportedTotalBand',
        kind: 'enum',
        label: { en: 'Reported offenses', es: 'Delitos denunciados' },
      },
    ],
    detailFields: [
      { key: 'reportedTotal', label: { en: 'Reported offenses, latest full year', es: 'Delitos denunciados, último año completo' } },
      { key: 'statYear', label: { en: 'Latest full year', es: 'Último año completo' } },
      { key: 'suppressed', label: { en: 'Withheld — fewer than five reported offenses', es: 'Retenido: menos de cinco delitos denunciados' } },
      ...BLOCK_GROUP_YEAR_ROWS,
      { key: 'tract', label: { en: 'Census tract', es: 'Sección censal' } },
      { key: 'blockGroup', label: { en: 'Block group within the tract', es: 'Grupo de bloques dentro de la sección' } },
      { key: 'geoid', label: { en: 'Census GEOID', es: 'GEOID censal' } },
    ],
  },
];
