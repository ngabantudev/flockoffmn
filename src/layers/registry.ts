import { CORD_STROKE_DARK } from '~/lib/densityRamp';
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
    label: { en: 'Immigration Enforcement', es: 'Control migratorio' },
    summary: {
      en: 'What the recording is for: the agencies that have signed up to act, and the places people are held.',
      es: 'Para qué sirve la grabación: las agencias que se comprometieron a actuar y los lugares donde se retiene a personas.',
    },
  },
];

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
    category: 'enforcement',
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
        en: '“Who runs it” is derived by keyword-matching the free text a volunteer typed into the operator field. It records what a word there suggests, never a verified contract: “Eagan” is a city with no keyword in it and lands under “other”, and a name covering several agencies is filed under one of them. Four readers in five say nothing at all, and that — not the breakdown of the remaining fifth — is the finding here.',
        es: '«Quién lo opera» se deduce buscando palabras clave en el texto libre que un voluntario escribió en el campo de operador. Registra lo que sugiere una palabra de ese campo, nunca un contrato verificado: «Eagan» es una ciudad sin ninguna palabra clave y queda en «otros», y un nombre que abarca varias agencias se archiva bajo una sola. Cuatro de cada cinco lectores no dicen nada en absoluto, y eso —no el desglose del quinto restante— es el hallazgo aquí.',
      },
      {
        en: 'The glow under the dots is a density estimate, not coverage. It smooths mapped cameras over a radius, so it paints colour on ground no camera stands on and none can see — it shows where mapped cameras gather, and nothing else. It stays on the map at every zoom and dims as the dots appear, which means the estimate and the mapped positions do overlap: the dot is the surveyed location, the haze around it is not evidence that anything stands there.',
        es: 'El resplandor bajo los puntos es una estimación de densidad, no una cobertura. Suaviza las cámaras mapeadas sobre un radio, así que colorea terreno donde no hay ninguna cámara ni alcance de ninguna: solo muestra dónde se concentran las cámaras mapeadas. Permanece en el mapa en todos los niveles de zoom y se atenúa a medida que aparecen los puntos, por lo que la estimación y las posiciones mapeadas sí se superponen: el punto es la ubicación registrada; la neblina a su alrededor no es prueba de que allí haya nada.',
      },
      {
        en: 'A brighter patch of that glow is a node: two or more reader locations within about 70 metres of one another, drawn as one body whose brightness rises with the number of cameras in it. The grouping distance is a drawing convention chosen to be roughly the size of a signalled intersection — widen it and a node would swallow a block, narrow it and cameras facing each other across a junction would come apart. Brightness is a rough scale and not a readable count: to know how many cameras are at a junction, zoom in and count the dots.',
        es: 'Una mancha más brillante de ese resplandor es un nodo: dos o más ubicaciones de lectores a unos 70 metros entre sí, dibujadas como un solo cuerpo cuyo brillo aumenta con la cantidad de cámaras que contiene. Esa distancia de agrupación es una convención de dibujo elegida para aproximarse al tamaño de un cruce con semáforo: si se amplía, un nodo abarcaría una manzana; si se reduce, cámaras enfrentadas en un mismo cruce se separarían. El brillo es una escala aproximada, no un recuento legible: para saber cuántas cámaras hay en un cruce, acerque el zoom y cuente los puntos.',
      },
      {
        en: 'A node where several cameras share a pole ("321;109") is drawn as one cone per recorded heading over a single dot. A record tagged "0-360" is drawn as a full circle, meaning the surveyor recorded no single direction at all.',
        es: 'Un nodo donde varias cámaras comparten un poste («321;109») se dibuja con un cono por cada orientación registrada sobre un solo punto. Un registro etiquetado «0-360» se dibuja como un círculo completo, lo que significa que no se registró ninguna dirección concreta.',
      },
    ],
    geometry: 'point',
    color: '#38bdf8',
    colorLight: '#067baf',
    bearingKey: 'direction',
    density: {
      label: { en: 'Camera density', es: 'Densidad de cámaras' },
    },
    categoryColors: {
      key: 'operatorType',
      label: { en: 'Who runs it', es: 'Quién lo opera' },
      colors: [
        // Muted, and first, because it is the answer four readers in five give.
        { value: 'Not recorded', color: '#64748b' },
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
    // One drawing, all the way in. The surface never leaves; it thickens into
    // nodes where readers stand together, and from zoom 10 the dots fade up out
    // of it until they are solid hardware at 14. There is no scale at which the
    // reader is handed a different picture of the same cameras.
    scale: { emergeFrom: 10, pointsFrom: 14 },
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
    id: 'alpr_corridor',
    slug: 'alpr-corridors',
    category: 'surveillance',
    order: 3,
    label: {
      en: 'ALPR paths',
      es: 'Rutas de ALPR',
    },
    summary: {
      en: 'The roads between the plate readers — the streets joining neighbouring cameras, and the long roads joining one watched cluster to the next.',
      es: 'Las vías entre los lectores de matrículas: las calles que unen cámaras vecinas y las carreteras largas que unen un grupo vigilado con el siguiente.',
    },
    whatThisMeans: {
      en: 'A map of dots answers one question: is there a camera here. This layer answers another: what connects them. A short, bright line means an everyday drive between two cameras — a few minutes down a city street — gets logged twice. A long, pale line means two watched clusters sit on the same road network, nothing more; it is not a route anyone was seen driving. Follow enough of these lines and separated dots resolve into a handful of networks, some stretching across whole counties. Almost none of it was built that way on purpose: a city police department, a county sheriff, and a private business each bought their own cameras. This layer shows what results when nobody coordinates. The methodology behind every line — what counts as a neighbour, why cords have no length limit, what the colours track — is in "Limitations" below.',
      es: 'Un mapa de puntos responde a una sola pregunta: ¿hay una cámara aquí? Esta capa responde a otra: ¿qué las conecta? Una línea corta y brillante indica un trayecto cotidiano entre dos cámaras —unos minutos por una calle de la ciudad— que queda registrado dos veces. Una línea larga y pálida indica que dos grupos vigilados comparten la misma red viaria, nada más; no es una ruta que se haya visto recorrer a nadie. Siga suficientes líneas y los puntos aislados se convierten en un puñado de redes, algunas que atraviesan condados enteros. Casi nada de esto se construyó así a propósito: la policía de una ciudad, el alguacil de un condado y una empresa privada compraron sus cámaras por separado. Esta capa muestra lo que resulta cuando nadie coordina. La metodología detrás de cada línea —qué cuenta como vecino, por qué los cordones no tienen límite de longitud, qué rastrean los colores— está en «Limitaciones», más abajo.',
    },
    limitations: [
      {
        en: 'Derived from the crowd-sourced camera layer, so every gap there compounds here. A reader nobody has mapped is a reader nothing links to, and it moves every strand around it: the neighbour its neighbours would have chosen is missing from the calculation entirely.',
        es: 'Derivada de la capa de cámaras de origen comunitario, así que cada vacío de aquella se agrava aquí. Un lector que nadie ha mapeado es un lector al que nada se conecta, y desplaza todas las hebras a su alrededor: el vecino que sus vecinos habrían elegido no está en el cálculo.',
      },
      {
        en: 'Two reader locations are linked when no third mapped reader falls inside the circle drawn with the two of them at its ends. A strand says that and only that. It does not say a driver between them is only read twice, that this road is the way anyone actually goes, or that nothing stands in between — only that nothing *mapped* does, which is a claim about the survey and not about the street.',
        es: 'Dos ubicaciones de lectores se conectan cuando ningún tercer lector mapeado cae dentro del círculo trazado con ambas en sus extremos. Una hebra indica eso y solo eso. No indica que a quien conduzca entre ellas solo se le lea dos veces, ni que esa vía sea el camino que la gente toma, ni que no haya nada en medio: solo que no hay nada *mapeado*, que es una afirmación sobre el inventario y no sobre la calle.',
      },
      {
        en: 'The line is the route a car would drive between the two readers, over OpenStreetMap roads. It respects one-way streets and turn bans, but it knows nothing of traffic, closures or roadworks, and it is the shortest such route rather than the one a local would pick. Distances are miles of driving, which is always more than the distance across the map. Which roads a link follows is recorded; what class of road they are is not, because the router does not report it and a road’s class is not something to guess from its name.',
        es: 'La línea es la ruta que un coche recorrería entre los dos lectores por vías de OpenStreetMap. Respeta los sentidos únicos y los giros prohibidos, pero no sabe nada del tráfico, los cortes ni las obras, y es la ruta más corta, no la que elegiría alguien de la zona. Las distancias son millas de recorrido, siempre mayores que la distancia sobre el mapa. Se registra qué vías recorre cada conexión, pero no de qué clase son: el enrutador no lo indica y la clase de una vía no es algo que deba deducirse de su nombre.',
      },
      {
        en: 'A thin strand — a neighbourhood link — is drawn only where the drive between two readers is under a mile and a half. That is an editorial choice: past that distance the line stops describing a trip between two cameras and starts describing the empty road between two towns. A reader whose nearest neighbour is further away than that appears in no thin strand at all, so the mesh thins towards rural Minnesota partly because the cameras do and partly because this number says so. The data file counts exactly how many readers the choice drops.',
        es: 'Una hebra fina —una conexión de vecindario— solo se dibuja donde el trayecto entre dos lectores es de menos de milla y media. Es un criterio editorial: más allá de esa distancia, la línea deja de describir un trayecto entre dos cámaras y pasa a describir la carretera vacía entre dos pueblos. Un lector cuyo vecino más cercano esté más lejos no aparece en ninguna hebra fina, así que la malla se adelgaza hacia la Minnesota rural en parte porque las cámaras lo hacen y en parte porque lo dice esta cifra. El archivo de datos cuenta exactamente cuántos lectores descarta la decisión.',
      },
      {
        en: 'A cord is the weakest claim on this map and it is drawn the widest, which is a real risk of misreading and worth naming plainly. Cords carry no length cap, so some of them are tens of miles of interstate, and width here means structural importance rather than intensity of surveillance: a cord is wide because cutting it would break the network in two, not because more people are watched along it. Nothing is recorded about traffic on a cord, and a cord is emphatically not a route anybody was observed taking. Every cord shows its own length in miles, and a long one should be read as the distance it says it is.',
        es: 'Un cordón es la afirmación más débil de este mapa y es la que se dibuja más ancha, un riesgo real de malinterpretación que conviene decir con claridad. Los cordones no tienen límite de longitud, así que algunos son decenas de millas de autopista, y aquí la anchura indica importancia estructural, no intensidad de la vigilancia: un cordón es ancho porque cortarlo partiría la red en dos, no porque se vigile a más gente a lo largo de él. No se registra nada sobre el tráfico en un cordón, y un cordón no es en absoluto una ruta que se haya observado que alguien recorra. Cada cordón muestra su propia longitud en millas, y uno largo debe leerse como la distancia que dice ser.',
      },
      {
        en: 'The cords are still a thin set of roads, and the absence of a cord is never evidence that no road runs between two places. Most cords draw one road per join. A second is drawn only where the network is badly folded — two clusters within twelve miles of each other on the ground but more than four times that far apart through the network — and never a third. Where four real roads join two clusters, this map shows one of them, or two. Which road wins is decided by straight-line distance between the nearest readers of the two clusters, then routed; a few joins are missing entirely because no drivable route came back at all, and the data file counts those.',
        es: 'Los cordones siguen siendo un conjunto reducido de vías, y la ausencia de un cordón nunca prueba que no haya carretera entre dos lugares. La mayoría de los cordones dibujan una vía por unión. Solo se dibuja una segunda donde la red está muy plegada —dos grupos a menos de doce millas sobre el terreno pero a más del cuádruple de esa distancia a través de la red— y nunca una tercera. Donde cuatro vías reales unen dos grupos, este mapa muestra una, o dos. Qué vía gana lo decide la distancia en línea recta entre los lectores más cercanos de ambos grupos, y luego se calcula la ruta; algunas uniones faltan del todo porque no se obtuvo ninguna ruta transitable, y el archivo de datos las cuenta.',
      },
      {
        en: 'Every mesh link — never the cords — occasionally sends a slow spark along its own length, the way the axon this layer is named for fires and rests rather than carrying something continuously. An earlier version animated every strand this way, all the time and unthrottled, and it was removed rather than kept: it cost every reader’s machine real work on every frame, and a map that is heavy to open is a map fewer people read. This version is narrower and cheaper on purpose — the cords never animate at all, a given link is quiet most of the time and only carries a spark for a few seconds when it does, positions update a few times a second rather than every frame, and it turns off entirely if your system asks for reduced motion. The spark carries no fact of its own; it dramatises what the colour and width already say, standing still would say the same thing, just quieter.',
        es: 'Cada conexión de la malla —nunca los cordones— envía de vez en cuando una chispa lenta a lo largo de su propio trazado, tal como el axón que da nombre a esta capa se dispara y descansa en lugar de transportar algo de forma continua. Una versión anterior animaba así cada hebra, todo el tiempo y sin límite de frecuencia, y se retiró en lugar de conservarla: exigía trabajo real al equipo de cada lector en cada fotograma, y un mapa pesado de abrir es un mapa que lee menos gente. Esta versión es más limitada y más económica a propósito: los cordones nunca se animan, una conexión dada permanece quieta la mayor parte del tiempo y solo lleva una chispa durante unos segundos cuando se dispara, las posiciones se actualizan solo unas pocas veces por segundo en lugar de en cada fotograma, y se desactiva por completo si el sistema pide movimiento reducido. La chispa no aporta ningún dato propio; dramatiza lo que el color y el grosor ya dicen, y quedarse quieto diría lo mismo, solo que más callado.',
      },
      {
        en: 'Colour is the body of mesh, not the road, and it counts thin strands only. Two thin strands in the same shade are joined through a chain of neighbourhood links, and the shade says how many reader locations that chain holds — cords are excluded from the count, or every strand in Minnesota would be the same shade and the encoding would say nothing. A body of mesh is a chain of mapped links under the distance limit above, so it is as much a product of those two choices as of the cameras: one unmapped reader, or one link a hundred yards over the limit, can be the difference between two bodies and one.',
        es: 'El color indica el cuerpo de malla, no la vía, y solo cuenta las hebras finas. Dos hebras finas del mismo tono están unidas por una cadena de conexiones de vecindario, y el tono indica cuántas ubicaciones de lectores tiene esa cadena; los cordones quedan fuera del recuento, o todas las hebras de Minnesota tendrían el mismo tono y la codificación no diría nada. Un cuerpo de malla es una cadena de conexiones mapeadas por debajo del límite de distancia anterior, así que depende tanto de esas dos decisiones como de las cámaras: un lector sin mapear, o una conexión que supere el límite por cien metros, puede ser la diferencia entre dos cuerpos y uno.',
      },
      {
        en: 'Some links are not drawn at all. A reader with no neighbour within a mile and a half by road has nothing to link to; a pair with no mapped road between them cannot be routed; and a pair whose drive is more than three times the distance across the map — a river, a rail yard, a freeway with no crossing — is refused, because at that point the line stops describing the pair and starts describing the detour. The counts are in the data file’s known gaps, and every one of those readers is still on the camera layer.',
        es: 'Algunas conexiones no se dibujan. Un lector sin ningún vecino a menos de milla y media por carretera no tiene con qué conectarse; un par sin vías mapeadas entre ambos no puede enrutarse; y un par cuyo recorrido supera el triple de la distancia sobre el mapa —un río, una playa de vías, una autopista sin cruce— se descarta, porque en ese punto la línea deja de describir el par y pasa a describir el rodeo. Los recuentos están en los vacíos conocidos del archivo de datos, y todos esos lectores siguen en la capa de cámaras.',
      },
      {
        en: 'A reader location is one or more cameras within 75 m of each other, and a camera is placed on the nearest drivable road, which at a crossroads can be decided by a couple of metres. Which way each camera faces is on the camera layer; this layer does not claim that a single trip is read by every camera it passes.',
        es: 'Una ubicación de lector es una o más cámaras a menos de 75 m entre sí, y cada cámara se sitúa en la vía transitable más cercana, lo que en un cruce puede decidirse por un par de metros. Hacia dónde apunta cada cámara está en la capa de cámaras; esta capa no afirma que un solo trayecto sea leído por todas las cámaras que pasa.',
      },
      {
        en: 'Operator is recorded for only a minority of readers, so the agencies named on a link are a floor and never the full list. Naming an operator says who is recorded as running a reader — not who can search what it collects, which is a separate question this layer holds no data on.',
        es: 'El operador solo consta en una minoría de los lectores, así que las agencias nombradas en una conexión son un mínimo y nunca la lista completa. Nombrar a un operador indica quién figura como responsable de un lector, no quién puede consultar lo que recopila, que es una cuestión distinta sobre la que esta capa no tiene datos.',
      },
    ],
    impactSpheres: [
      {
        icon: 'Route',
        color: '#38bdf8',
        title: { en: 'Movement & routine', es: 'Movimiento y rutina' },
        body: {
          en: 'The Supreme Court has twice grappled with what happens once public movements are strung together. In Carpenter v. United States, it held that pulling days of cell-tower records is a search requiring a warrant, because aggregation produces a "detailed, encyclopedic" record that no single data point does. A network built from individually public plate reads raises the same question.',
          es: 'El Tribunal Supremo se ha enfrentado dos veces a lo que ocurre cuando se encadenan movimientos públicos. En Carpenter v. United States, resolvió que obtener varios días de registros de antenas de telefonía es una pesquisa que exige una orden judicial, porque la acumulación produce un registro «detallado y enciclopédico» que ningún dato aislado ofrece. Una red construida a partir de lecturas de matrícula individualmente públicas plantea la misma pregunta.',
        },
        citation: 'Carpenter v. United States, 585 U.S. 296 (2018)',
        citationUrl: 'https://www.supremecourt.gov/opinions/17pdf/16-402_h315.pdf',
      },
      {
        icon: 'Fingerprint',
        color: '#f43f5e',
        title: { en: 'Immigration status', es: 'Estatus migratorio' },
        body: {
          en: 'This is not hypothetical. A public-records request to the Danville, Illinois police turned up more than 4,000 lookups against a nationwide plate-reader network in which officers gave "immigration," "ICE," or "ICE WARRANT" as the reason — despite state law and the vendor’s own policy prohibiting it. Minnesota law requires a warrant before a reader is used to track someone; how many queries against Minnesota cameras actually clear that bar is not public information.',
          es: 'Esto no es hipotético. Una solicitud de registros públicos a la policía de Danville, Illinois, reveló más de 4.000 consultas contra una red nacional de lectores de matrícula en las que los agentes indicaron «immigration», «ICE» o «ICE WARRANT» como motivo, pese a que la ley estatal y la propia política del proveedor lo prohíben. La ley de Minnesota exige una orden judicial antes de usar un lector para rastrear a alguien; cuántas consultas contra cámaras de Minnesota realmente cumplen ese requisito no es información pública.',
        },
        citation: '404 Media (2025)',
        citationUrl:
          'https://www.404media.co/ice-taps-into-nationwide-ai-enabled-camera-network-data-shows/',
        citation2: 'Minn. Stat. § 13.824',
        citation2Url: 'https://www.revisor.mn.gov/statutes/cite/13.824',
      },
      {
        icon: 'Speech',
        color: '#a78bfa',
        title: { en: 'Association & speech', es: 'Asociación y expresión' },
        body: {
          en: 'Knowing you might be watched changes behaviour even when you have broken no law. After the 2013 NSA surveillance revelations became public, traffic to sensitive Wikipedia topics fell nearly 30 percent — a drop researchers linked to awareness of monitoring, not any change in the underlying law.',
          es: 'Saber que podría estar siendo observado cambia el comportamiento incluso sin haber infringido ninguna ley. Tras hacerse públicas las revelaciones de vigilancia de la NSA en 2013, el tráfico hacia temas sensibles de Wikipedia cayó casi un 30 %, una caída que los investigadores vincularon a la conciencia de estar siendo vigilado, no a ningún cambio en la ley.',
        },
        citation: 'Penney, "Chilling Effects: Online Surveillance and Wikipedia Use," 31 Berkeley Tech. L.J. 117 (2016)',
        citationUrl: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2769645',
      },
      {
        icon: 'Landmark',
        color: '#c084fc',
        title: { en: 'Finance & housing', es: 'Finanzas y vivienda' },
        body: {
          en: 'Where this kind of infrastructure clusters today is not disconnected from where lending was denied in the 1930s. This map’s own Redlining layer, drawn from the same historical HOLC survey data, traces where those two patterns still overlap in Minnesota.',
          es: 'Dónde se concentra este tipo de infraestructura hoy no está desconectado de dónde se negó el crédito en los años 30. La capa de Redlining de este mismo mapa, elaborada a partir de los mismos registros históricos de HOLC, traza dónde esos dos patrones todavía se superponen en Minnesota.',
        },
        citation: 'Sources — Redlining (HOLC), this site',
        // Resolved to the locale-specific /sources path at render time — see
        // MapView.astro, which is the only place that knows the locale.
        citationUrl: 'internal:sources',
      },
    ],
    geometry: 'line',
    color: '#818cf8',
    colorLight: '#5160f5',
    filament: true,
    positions: {
      offsetsKey: 'siteOffsets',
      countsKey: 'siteReaders',
      label: {
        en: 'The two reader locations this road runs between',
        es: 'Las dos ubicaciones de lectores que une esta vía',
      },
    },
    networkColor: {
      key: 'connectedSites',
      // The largest network in the current Minnesota extract is 101 reader
      // locations. A little over that, so a denser extract does not clip.
      maxRecords: 120,
    },
    cordTier: {
      key: 'kind',
      value: 'cord',
      // This layer has networkColor set, so mapController.ts actually
      // colours the cord from the density ramp at the current basemap's
      // dark/light state (CORD_STROKE_DARK/_LIGHT) — this value is a
      // fallback for the type, not what's actually drawn. See the comment
      // where cordColor is resolved in mapController.ts.
      color: CORD_STROKE_DARK,
    },
    // 0 rather than a real threshold: every mesh link carries a
    // connectedSites of at least 2 (a link joins two reader locations at
    // minimum), so this includes the whole mesh tier. Cords still never
    // pulse — that exclusion is in setupPulse itself, keyed on cordTier,
    // not on this number.
    pulse: { minConnectedSites: 0 },
    action: {
      requestType: 'alpr',
      label: {
        en: 'Ask about these cameras',
        es: 'Preguntar por estas cámaras',
      },
      fallbackBody: 'countySheriff',
    },
    dataPath: '/data/alpr-corridors.geojson',
    csvPath: null,
    provenance: {
      source: 'Derived from the ALPR layer; roads routed by OSRM over OpenStreetMap',
      sourceUrl: 'https://deflock.me',
      license: 'ODbL 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors, ODbL — mapped by DeFlock volunteers',
      sourceDate: null,
      lastUpdated: null,
      refresh: 'frequent',
    },
    // No filters. The one this layer had was road class, and the router that
    // replaced the hand-built road graph does not report it — see the
    // limitation above. A filter offering a field the data no longer carries
    // is worse than no filter.
    filters: [],
    detailFields: [
      // First, because it decides how everything under it should be read: a
      // mile and a half of city street and ninety miles of interstate are both
      // "a strand" and are not both the same statement.
      { key: 'tier', label: { en: 'Kind of strand', es: 'Tipo de hebra' } },
      {
        key: 'readerCount',
        label: { en: 'Readers at the two ends', es: 'Lectores en los dos extremos' },
      },
      {
        key: 'linkMiles',
        label: { en: 'Road between them (miles)', es: 'Vía entre ambos (millas)' },
      },
      {
        key: 'straightMiles',
        label: { en: 'Straight-line distance (miles)', es: 'Distancia en línea recta (millas)' },
      },
      {
        key: 'connectedSites',
        label: {
          en: 'Reader locations in this connected network',
          es: 'Ubicaciones de lectores en esta red conectada',
        },
      },
      {
        key: 'bringsInSites',
        label: {
          en: 'Reader locations cut off if this strand went (0 = a loop covers it)',
          es: 'Ubicaciones de lectores aisladas si desapareciera esta hebra (0 = la cubre un bucle)',
        },
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
      { key: 'roadsAlong', label: { en: 'Roads it follows', es: 'Vías que recorre' } },
    ],
    nearMe: {
      mode: 'nearest',
      title: { en: 'The camera-to-camera road nearest you', es: 'La vía entre cámaras más cercana' },
      empty: {
        en: 'No mapped link is near this point. That means no pair of mapped readers has a routed road near here — not that the roads here are unwatched.',
        es: 'No hay ninguna conexión mapeada cerca de este punto. Eso significa que ningún par de lectores mapeados tiene una vía calculada por aquí, no que estas carreteras no estén vigiladas.',
      },
      detail: ['readerCount', 'linkMiles', 'straightMiles', 'operators'],
      caveat: {
        en: 'Built from crowd-sourced camera records. This page measures the routed road between two readers. Treat it as the shape of the thing, not a measurement.',
        es: 'Construido a partir de registros comunitarios de cámaras. Esta página mide la vía calculada entre dos lectores. Considérelo la forma del fenómeno, no una medición.',
      },
      wide: true,
    },
  },

  {
    id: 'redlining',
    slug: 'redlining',
    category: 'historical',
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
    colorLight: '#9c3efa',
    categoryColors: {
      key: 'grade',
      label: { en: 'HOLC grade', es: 'Calificación HOLC' },
      // The colours HOLC printed on the original sheets, read from the source
      // data's own fill values, so the map reads like the document it is.
      colors: [
        { value: 'A', color: '#76a865' },
        { value: 'B', color: '#7cb5bd' },
        { value: 'C', color: '#ffff00' },
        { value: 'D', color: '#d9838d' },
        { value: 'E', color: '#fefefe' },
      ],
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
    category: 'enforcement',
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
    order: 6,
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
    order: 8,
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
    order: 7,
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
    order: 9,
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
