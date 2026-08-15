import type { LayerCategory, LayerDefinition } from './types';

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
    ],
    geometry: 'point',
    color: '#facc15',
    colorLight: '#a16207',
    markerIcon: { icon: 'FileText' },
    // One documented contract so far — nothing yet to build a filter on.
    filters: [],
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
    // §0.3 forbids. See relatedBuildings' comment in types.ts.
    relatedBuildings: {
      layerId: 'agency_building',
      joinKey: 'jurisdictionId',
      // Throw from the headquarters where the inventory distinguishes one: a
      // § 13.824 filing is the department's, not any one precinct's, so the
      // lines leave the address that answers for the department rather than
      // whichever substation the ingest happened to emit first.
      hubKey: 'subStation',
      // Only to readers this agency itself reported to the state — never to
      // whatever happens to sit inside the boundary. See pathsTo's own
      // comment in types.ts for why that distinction is the whole point.
      pathsTo: {
        layerId: 'alpr_reported',
        joinKey: 'jurisdictionId',
      },
    },
    // A green wash on a jurisdiction that has a documented vendor contract
    // — see the field's own comment in types.ts for why this is a coverage
    // cue and not a score. The only jurisdiction lit up today is the one
    // MuckRock request has actually produced; every other polygon staying
    // neutral is the honest state of the data, not a verdict on the agency.
    // Bright emerald on dark, deep emerald on light — the first plain green
    // (Tailwind's own 500/600 step) read at roughly 1.1:1 against the light
    // basemap's neutral unselected grey, i.e. functionally invisible; both
    // ends here clear ~3:1 against their basemap's own neutral polygon
    // colour as well as the basemap itself.
    tintWhenRelated: {
      layerId: 'vendor_contract',
      joinKey: 'jurisdictionId',
      color: '#6ee7b7',
      colorLight: '#064e3b',
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
          en: 'Device locations, as the agency reported them',
          es: 'Ubicaciones de dispositivos, según lo informado por la agencia',
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
      en: 'ALPR / Flock cameras',
      es: 'Cámaras ALPR / Flock',
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
      colors: [
        // First, because it is the answer four readers in five give — but not
        // muted. A desaturated grey here used to read as "no camera," the
        // opposite of what it means: every one of these is a live, recording
        // reader, just one whose operator nobody has identified yet. A
        // saturated red keeps that legible at a glance, the way a device's own
        // recording light would.
        { value: 'Not recorded', color: '#dc2626' },
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
      radii: [1, 3],
      caveat: {
        en: 'Crowd-sourced and incomplete — the absence of a camera here is not evidence that none exists.',
        es: 'De origen comunitario e incompleto: la ausencia de una cámara aquí no prueba que no exista ninguna.',
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
      en: 'ALPR readers agencies reported',
      es: 'Lectores ALPR reportados por agencias',
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
      radii: [1, 3],
      caveat: {
        en: 'Only readers agencies reported to the state. An agency that filed nothing does not appear.',
        es: 'Solo lectores que las agencias reportaron al estado. Una agencia que no presentó nada no aparece.',
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
        // of nine things. See GRADE_OF_CLASS in scripts/ingest/holc-detail.mjs.
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
        key: 'stressorCount',
        label: { en: 'Stressors present, of 26', es: 'Factores presentes, de 26' },
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
      detail: ['stressorCount', 'countyMedian', 'mpcaAdverse'],
      wide: true,
    },
  },
];
