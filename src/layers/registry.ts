import type { LayerDefinition } from './types';

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
    id: 'agency_287g',
    slug: '287g',
    order: 1,
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
    cluster: false,
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
    order: 2,
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
        en: 'A node where several cameras share a pole ("321;109") is drawn as one cone per recorded heading over a single dot. A record tagged "0-360" is drawn as a full circle, meaning the surveyor recorded no single direction at all.',
        es: 'Un nodo donde varias cámaras comparten un poste («321;109») se dibuja con un cono por cada orientación registrada sobre un solo punto. Un registro etiquetado «0-360» se dibuja como un círculo completo, lo que significa que no se registró ninguna dirección concreta.',
      },
    ],
    geometry: 'point',
    color: '#38bdf8',
    cluster: true,
    bearingKey: 'direction',
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
      { key: 'operator', kind: 'enum', label: { en: 'Operator', es: 'Operador' } },
      { key: 'manufacturer', kind: 'enum', label: { en: 'Manufacturer', es: 'Fabricante' } },
      { key: 'cameraType', kind: 'enum', label: { en: 'Camera type', es: 'Tipo de cámara' } },
    ],
    detailFields: [
      { key: 'manufacturer', label: { en: 'Manufacturer', es: 'Fabricante' } },
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
    id: 'alpr_corridor',
    slug: 'alpr-corridors',
    order: 3,
    label: {
      en: 'ALPR corridors',
      es: 'Corredores de ALPR',
    },
    summary: {
      en: 'Stretches of road where plate readers stand in a line one after another, not clustered at a single junction.',
      es: 'Tramos de carretera donde los lectores de matrículas se alinean uno tras otro, no agrupados en un solo cruce.',
    },
    whatThisMeans: {
      en: 'A map of dots answers a narrow question: is there a camera here. This layer answers a different one: how many times does one ordinary trip get logged. A corridor is a stretch of a single named or numbered road with at least four reader locations strung along it — the school run, the commute, the drive to a clinic, read again and again by the same network, and the people read are overwhelmingly not suspects. The line drawn is real OpenStreetMap road geometry clipped to the run of readers; no connector is ever invented between two dots, because a drawn line would assert a relationship no source records. The operator count is the other half of the point. Almost none of this was planned as a corridor: a city police department, the neighbouring city’s, a county sheriff and a hardware store each buy cameras for their own reasons, and the continuous run is what they add up to. No one signed off on the whole of it, and no record of it exists anywhere except a map that goes looking for it.',
      es: 'Un mapa de puntos responde a una pregunta estrecha: ¿hay una cámara aquí? Esta capa responde a otra: ¿cuántas veces queda registrado un trayecto cotidiano? Un corredor es un tramo de una sola carretera con nombre o número que tiene al menos cuatro ubicaciones de lectores a lo largo: el trayecto al colegio, el viaje al trabajo, la ida a la clínica, leídos una y otra vez por la misma red, y las personas leídas en su inmensa mayoría no son sospechosas. La línea dibujada es geometría vial real de OpenStreetMap recortada al tramo que ocupan los lectores; nunca se inventa un conector entre dos puntos, porque una línea trazada afirmaría una relación que ninguna fuente registra. El recuento de operadores es la otra mitad del asunto. Casi nada de esto se planificó como corredor: la policía de una ciudad, la de la ciudad vecina, el alguacil del condado y una ferretería compran cámaras cada uno por sus propios motivos, y el tramo continuo es la suma de todos ellos. Nadie aprobó el conjunto, y no existe constancia de él en ningún sitio salvo en un mapa que lo busque.',
    },
    limitations: [
      {
        en: 'Derived from the crowd-sourced camera layer, so every gap there compounds here. A road with no corridor drawn on it may simply be a road nobody has finished mapping.',
        es: 'Derivada de la capa de cámaras de origen comunitario, así que cada vacío de aquella se agrava aquí. Una carretera sin corredor dibujado puede ser simplemente una carretera que nadie ha terminado de mapear.',
      },
      {
        en: 'The thresholds are a judgement, not a finding: at least four reader locations on one named or numbered road, no more than three miles apart, spanning at least a mile. Readers clustered at a single junction are real, and are not a corridor.',
        es: 'Los umbrales son un criterio, no un hallazgo: al menos cuatro ubicaciones de lectores en una carretera con nombre o número, separadas por no más de tres millas y abarcando al menos una milla. Los lectores agrupados en un solo cruce son reales, y no son un corredor.',
      },
      {
        en: 'Gaps in the drawn line are stretches we hold no road geometry for. They are not stretches known to be unwatched.',
        es: 'Los huecos en la línea dibujada son tramos de los que no tenemos geometría vial. No son tramos que se sepa que no están vigilados.',
      },
      {
        en: 'Distances are measured in straight lines between consecutive reader locations rather than along the curve of the road, so a winding corridor is slightly longer to drive than the figure given.',
        es: 'Las distancias se miden en línea recta entre ubicaciones consecutivas de lectores y no siguiendo la curva de la carretera, así que un corredor sinuoso es algo más largo de recorrer que la cifra indicada.',
      },
      {
        en: 'Operator is recorded for only a minority of readers, so the agencies named on a corridor are a floor and never the full list. Naming an operator says who is recorded as running a reader — not who can search what it collects, which is a separate question this layer holds no data on.',
        es: 'El operador solo consta en una minoría de los lectores, así que las agencias nombradas en un corredor son un mínimo y nunca la lista completa. Nombrar a un operador indica quién figura como responsable de un lector, no quién puede consultar lo que recopila, que es una cuestión distinta sobre la que esta capa no tiene datos.',
      },
      {
        en: 'A reader location is one or more cameras within 75 m of each other. This layer does not claim that a single trip is read by every camera it passes; which way each camera faces is on the camera layer.',
        es: 'Una ubicación de lector es una o más cámaras a menos de 75 m entre sí. Esta capa no afirma que un solo trayecto sea leído por cada cámara que pasa; hacia dónde apunta cada cámara está en la capa de cámaras.',
      },
    ],
    geometry: 'line',
    color: '#818cf8',
    cluster: false,
    positions: {
      offsetsKey: 'siteOffsets',
      countsKey: 'siteReaders',
      label: {
        en: 'Reader locations along this corridor',
        es: 'Ubicaciones de lectores a lo largo de este corredor',
      },
    },
    dataPath: '/data/alpr-corridors.geojson',
    csvPath: null,
    provenance: {
      source: 'Derived from the ALPR layer and OpenStreetMap road geometry (Overpass API)',
      sourceUrl: 'https://deflock.me',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors, ODbL — mapped by DeFlock volunteers',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'frequent',
    },
    filters: [{ key: 'roadClass', kind: 'enum', label: { en: 'Road type', es: 'Tipo de vía' } }],
    detailFields: [
      { key: 'readerCount', label: { en: 'Readers on this corridor', es: 'Lectores en este corredor' } },
      { key: 'siteCount', label: { en: 'Separate reader locations', es: 'Ubicaciones de lectores distintas' } },
      { key: 'corridorMiles', label: { en: 'Corridor length (miles)', es: 'Longitud del corredor (millas)' } },
      {
        key: 'averageGapMiles',
        label: { en: 'Average gap between locations (miles)', es: 'Distancia media entre ubicaciones (millas)' },
      },
      {
        key: 'medianGapMiles',
        label: { en: 'Median gap between locations (miles)', es: 'Distancia mediana entre ubicaciones (millas)' },
      },
      {
        key: 'longestGapMiles',
        label: { en: 'Longest gap (miles)', es: 'Mayor distancia sin lector (millas)' },
      },
      {
        key: 'operatorCount',
        label: { en: 'Operators recorded here', es: 'Operadores registrados aquí' },
      },
      { key: 'operators', label: { en: 'Who runs these readers', es: 'Quién opera estos lectores' } },
      {
        key: 'unattributedReaders',
        label: { en: 'Readers with no operator recorded', es: 'Lectores sin operador registrado' },
      },
      { key: 'road', label: { en: 'Road', es: 'Carretera' } },
      { key: 'roadClass', label: { en: 'Road type', es: 'Tipo de vía' } },
      { key: 'countiesSpanned', label: { en: 'Counties spanned', es: 'Condados que atraviesa' } },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'The corridor nearest you', es: 'El corredor más cercano' },
      empty: {
        en: 'No mapped corridor is near this point. That means no run of readers has been mapped along one road here — not that the roads here are unwatched.',
        es: 'No hay ningún corredor mapeado cerca de este punto. Eso significa que no se ha mapeado una sucesión de lectores a lo largo de una carretera aquí, no que estas carreteras no estén vigiladas.',
      },
      detail: ['readerCount', 'corridorMiles', 'averageGapMiles', 'operators'],
      caveat: {
        en: 'Built from crowd-sourced camera records, and the thresholds that decide what counts as a corridor are our judgement. Treat it as the shape of the thing, not a measurement.',
        es: 'Construido a partir de registros comunitarios de cámaras, y los umbrales que deciden qué cuenta como corredor son criterio nuestro. Considérelo la forma del fenómeno, no una medición.',
      },
      wide: true,
    },
  },

  {
    id: 'redlining',
    slug: 'redlining',
    order: 4,
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
    ],
    geometry: 'polygon',
    color: '#c084fc',
    cluster: false,
    dataPath: '/data/redlining.geojson',
    csvPath: null,
    provenance: {
      source: 'Mapping Inequality, Digital Scholarship Lab, University of Richmond',
      sourceUrl: 'https://dsl.richmond.edu/panorama/redlining/',
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      attribution:
        'Robert K. Nelson, LaDale Winling, et al., "Mapping Inequality: Redlining in New Deal America"',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'rare',
    },
    filters: [
      { key: 'grade', kind: 'enum', label: { en: 'HOLC grade', es: 'Calificación HOLC' } },
      { key: 'city', kind: 'enum', label: { en: 'City', es: 'Ciudad' } },
      {
        key: 'groupsNamed',
        kind: 'enum',
        label: { en: 'Groups named in the survey', es: 'Grupos nombrados en la encuesta' },
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
    id: 'detention_facility',
    slug: 'detention',
    order: 5,
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
    cluster: false,
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
    order: 6,
    label: {
      en: 'Data centres',
      es: 'Centros de datos',
    },
    summary: {
      en: 'Large computing facilities, their operators and power sources — plus where communities are organising against them.',
      es: 'Grandes instalaciones de cómputo, sus operadores y fuentes de energía, y dónde las comunidades se organizan contra ellas.',
    },
    whatThisMeans: {
      en: 'Data centres are the physical substrate the rest of this map runs on: the storage and compute behind plate-reader networks, records systems and the analytics sold to agencies. They also carry immediate local consequences — electricity and water demand, land use, noise, tax abatements, and grid costs borne by other ratepayers. Where a community has organised in response, this layer surfaces the campaign so you can find it rather than start from nothing.',
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
    ],
    geometry: 'point',
    color: '#34d399',
    cluster: false,
    dataPath: '/data/data-centers.geojson',
    csvPath: '/data/data-centers.csv',
    provenance: {
      source: 'FracTracker Alliance — national data centre database',
      sourceUrl: 'https://www.fractracker.org/data-centers/',
      license: 'CC BY-NC 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
      attribution: 'FracTracker Alliance',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'periodic',
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
      { key: 'powerSource', label: { en: 'Power source', es: 'Fuente de energía' } },
      { key: 'resistanceStatus', label: { en: 'Community response', es: 'Respuesta comunitaria' } },
      { key: 'campaignUrl', label: { en: 'Local campaign', es: 'Campaña local' }, format: 'link' },
      { key: 'petitionUrl', label: { en: 'Petition', es: 'Petición' }, format: 'link' },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'Nearest data centre', es: 'Centro de datos más cercano' },
      empty: {
        en: 'No data centre in this dataset is near this point.',
        es: 'Ningún centro de datos de este conjunto de datos está cerca de este punto.',
      },
      detail: ['city'],
      linkKey: 'campaignUrl',
    },
  },

  {
    id: 'racial_covenant',
    slug: 'covenants',
    order: 7,
    label: {
      en: 'Racial covenants (aggregate)',
      es: 'Convenios raciales (agregado)',
    },
    summary: {
      en: 'Deed clauses that barred non-white families from buying or living on a property, counted by block.',
      es: 'Cláusulas de escritura que prohibían a familias no blancas comprar o vivir en una propiedad, contadas por manzana.',
    },
    whatThisMeans: {
      en: 'A racial covenant is a sentence written into a property deed forbidding sale or occupancy to anyone not white. They were drafted from templates, recorded by the county like any other deed, and sold by developers as a feature. Minnesota covenants run from 1910, predating the federal redlining maps by a generation — the private restriction came first, and the federal appraiser later graded the neighbourhoods it had helped produce. Shelley v. Kraemer made them unenforceable in 1948 and they are void today, but the text stays in the chain of title until a homeowner files to remove it. This layer is deliberately an aggregate: each shape is a fixed 250-metre cell reporting how many covenants were recorded inside it, never a record for one property. It describes a restriction on land, not the people who live there now.',
      es: 'Un convenio racial es una frase escrita en la escritura de una propiedad que prohíbe su venta u ocupación a cualquier persona no blanca. Se redactaban a partir de plantillas, se registraban en el condado como cualquier escritura y los promotores los vendían como una ventaja. Los convenios de Minnesota comienzan en 1910, una generación antes de los mapas federales de redlining: la restricción privada llegó primero, y el tasador federal calificó después los barrios que ella había ayudado a crear. Shelley v. Kraemer los hizo inaplicables en 1948 y hoy son nulos, pero el texto permanece en el historial de titularidad hasta que un propietario solicita eliminarlo. Esta capa es deliberadamente un agregado: cada forma es una celda fija de 250 metros que indica cuántos convenios se registraron dentro, nunca un registro por propiedad. Describe una restricción sobre la tierra, no a las personas que viven allí hoy.',
    },
    limitations: [
      {
        en: 'This is an aggregate, on purpose. A cell showing "1" means one covenant was recorded somewhere in an area of several houses — not which house. The per-property data is published by Mapping Prejudice and should be got from them, not from a copy here.',
        es: 'Esto es un agregado, a propósito. Una celda que muestra «1» significa que se registró un convenio en algún lugar de un área de varias casas, no en cuál. Los datos por propiedad los publica Mapping Prejudice y deben obtenerse de ellos, no de una copia aquí.',
      },
      {
        en: 'The original deeds name the seller and the buyer, and the source file also carries the present-day street address and parcel outline of the property. None of that is ingested here, and the build fails rather than write a file containing it.',
        es: 'Las escrituras originales nombran al vendedor y al comprador, y el archivo de origen también incluye la dirección actual y el contorno de la parcela. Nada de eso se incorpora aquí, y la compilación falla antes que escribir un archivo que lo contenga.',
      },
      {
        en: 'Covenants are found by reading digitised deeds county by county, so every count is a floor on the true number and never a ceiling. Only eight Minnesota counties have been published; a county with no cells has not been searched.',
        es: 'Los convenios se localizan leyendo escrituras digitalizadas condado por condado, así que cada recuento es un mínimo y nunca un máximo. Solo se han publicado ocho condados de Minnesota; un condado sin celdas no ha sido investigado.',
      },
      {
        en: 'A covenant describes land. Present-day residents of a covenanted property have no connection to the clause and are not the subject of this record.',
        es: 'Un convenio describe la tierra. Los residentes actuales de una propiedad con convenio no tienen relación con la cláusula y no son el sujeto de este registro.',
      },
    ],
    geometry: 'polygon',
    color: '#f472b6',
    cluster: false,
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
    filters: [{ key: 'city', kind: 'enum', label: { en: 'City', es: 'Ciudad' } }],
    detailFields: [
      {
        key: 'covenantCount',
        label: { en: 'Covenants recorded here', es: 'Convenios registrados aquí' },
      },
      { key: 'city', label: { en: 'City', es: 'Ciudad' } },
      { key: 'earliestDeed', label: { en: 'Earliest deed', es: 'Escritura más antigua' } },
      { key: 'latestDeed', label: { en: 'Latest deed', es: 'Escritura más reciente' } },
      {
        key: 'exampleWording',
        label: { en: 'Example wording recorded here', es: 'Ejemplo de redacción registrada aquí' },
      },
    ],
    nearMe: {
      mode: 'contains',
      title: { en: 'Racial covenants recorded here', es: 'Convenios raciales registrados aquí' },
      empty: {
        en: 'No covenant is recorded in the cell containing this point. Only eight Minnesota counties have been searched, so a blank is not evidence that none was written.',
        es: 'No hay ningún convenio registrado en la celda que contiene este punto. Solo se han investigado ocho condados de Minnesota, así que un vacío no prueba que no se escribiera ninguno.',
      },
      detail: ['covenantCount', 'earliestDeed', 'latestDeed'],
      caveat: {
        en: 'A count for an area of several houses, never a record for one property. It describes a restriction on land, not the people who live there now.',
        es: 'Un recuento para un área de varias casas, nunca un registro de una propiedad. Describe una restricción sobre la tierra, no a las personas que viven allí ahora.',
      },
      wide: true,
    },
  },
];
