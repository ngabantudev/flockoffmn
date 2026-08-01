import type { LayerCategory, LayerDefinition } from './types';

/**
 * The sections of the layer panel, in the order they are listed.
 *
 * The order is an argument: what is recording now, who acts on what it sees,
 * what it all runs on, and what drew the lines it sits on top of. Each layer
 * names its own category below, so adding a layer still means editing one
 * entry — this list only changes when a genuinely new kind of subject arrives.
 */
export const LAYER_CATEGORIES: LayerCategory[] = [
  {
    id: 'surveillance',
    label: { en: 'Surveillance', es: 'Vigilancia' },
    summary: {
      en: 'What is recording, and how far one ordinary journey is recorded for.',
      es: 'Qué está grabando y durante cuánto trayecto cotidiano se graba.',
    },
  },
  {
    id: 'enforcement',
    label: { en: 'Immigration enforcement', es: 'Control migratorio' },
    summary: {
      en: 'The agencies that have signed up to act, and the places people are held.',
      es: 'Las agencias que se comprometieron a actuar y los lugares donde se retiene a personas.',
    },
  },
  {
    id: 'infrastructure',
    label: { en: 'Infrastructure', es: 'Infraestructura' },
    summary: {
      en: 'The buildings, power and land this all runs on.',
      es: 'Los edificios, la energía y el terreno sobre los que funciona todo esto.',
    },
  },
  {
    id: 'historical',
    label: { en: 'Historical policy', es: 'Políticas históricas' },
    summary: {
      en: 'Older public and private rules that drew the lines the rest of this map sits on.',
      es: 'Normas antiguas, públicas y privadas, que trazaron las líneas sobre las que se asienta el resto del mapa.',
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
      en: 'ALPR corridors',
      es: 'Corredores de ALPR',
    },
    summary: {
      en: 'The road each plate reader would take to reach the nearest other plate reader, drawn as far as your radius reaches.',
      es: 'La vía que habría que recorrer desde cada lector de matrículas hasta el lector más cercano, dibujada hasta donde alcance su radio.',
    },
    whatThisMeans: {
      en: 'A map of dots answers a narrow question: is there a camera here. This layer answers a different one: what is between the cameras. Two reader locations are joined when no third reader stands between them, and the line drawn is the actual road a car would drive from one to the other — routed over OpenStreetMap, never a line drawn straight across the ground. Nothing here is a threshold somebody picked: the test is a piece of geometry, and it draws a strand exactly where two readers are neighbours with nothing in between. One number does apply, and it is the only one — a link is drawn if the drive between its two readers is under a mile and a half, roughly five minutes of city traffic. Past that the line stops describing a trip and starts describing a distance. Colour carries what a line cannot: everything in one connected network burns at the same brightness, and the brighter it is the more reader locations that network holds. Watch one cluster for a moment and you will see light travel outward along its strands. That is a drawing device and nothing more — it makes the shape of a network legible where a still line just sits there, and it says nothing about traffic, about direction, or about anything moving between these cameras at all. The operator counts are the other half of the point. Almost none of this was planned as a network: a city police department, the neighbouring city’s, a county sheriff and a hardware store each buy cameras for their own reasons, and what they add up to is what you are looking at.',
      es: 'Un mapa de puntos responde a una pregunta estrecha: ¿hay una cámara aquí? Esta capa responde a otra: ¿qué hay entre las cámaras? Dos ubicaciones de lectores se unen cuando no hay un tercer lector entre ellas, y la línea dibujada es la vía que un coche recorrería realmente de una a otra, calculada sobre OpenStreetMap y nunca trazada en línea recta sobre el terreno. Aquí nada es un umbral elegido por alguien: la prueba es geométrica, y traza una hebra justo donde dos lectores son vecinos sin nada en medio. Se aplica una cifra, y es la única: se dibuja una conexión si el trayecto entre sus dos lectores es de menos de milla y media, unos cinco minutos de tráfico urbano. Más allá, la línea deja de describir un trayecto y pasa a describir una distancia. El color transporta lo que una línea no puede: todo lo que está en una misma red conectada arde con el mismo brillo, y cuanto más brillante, más ubicaciones de lectores tiene esa red. Observe un grupo un momento y verá la luz avanzar hacia fuera por sus hebras. Eso es un recurso de dibujo y nada más: hace legible la forma de una red donde una línea quieta no dice nada, y no afirma nada sobre el tráfico, ni sobre una dirección, ni sobre que algo circule entre estas cámaras.  El recuento de operadores es la otra mitad del asunto. Casi nada de esto se planificó como una red: la policía de una ciudad, la de la ciudad vecina, el alguacil del condado y una ferretería compran cámaras cada uno por sus propios motivos, y lo que suman es lo que usted está viendo.',
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
        en: 'A link is drawn only where the drive between two readers is under a mile and a half. That is an editorial choice and it is the only one in this layer: past that distance the line stops describing a trip between two cameras and starts describing the empty road between two towns. It does cut real links off. A reader whose nearest neighbour is further away than that appears on the camera layer and in no strand here, so the map thins towards rural Minnesota partly because the cameras do and partly because this number says so. The data file counts exactly how many readers the choice drops.',
        es: 'Solo se dibuja una conexión donde el trayecto entre dos lectores es de menos de milla y media. Es un criterio editorial y es el único de esta capa: más allá de esa distancia, la línea deja de describir un trayecto entre dos cámaras y pasa a describir la carretera vacía entre dos pueblos. Sí que descarta conexiones reales. Un lector cuyo vecino más cercano esté más lejos aparece en la capa de cámaras y en ninguna hebra de aquí, así que el mapa se adelgaza hacia la Minnesota rural en parte porque las cámaras lo hacen y en parte porque lo dice esta cifra. El archivo de datos cuenta exactamente cuántos lectores descarta la decisión.',
      },
      {
        en: 'The light travelling along the strands is decoration. It moves outward from the middle of each network because that ordering makes a cluster read as a shape rather than a tangle — not because anything travels that way, in that direction, or at all. Nothing on this map is encoded in the motion: every fact here is in the lines, the colour and the panel, and the animation stops entirely for anyone whose system asks for reduced motion.',
        es: 'La luz que recorre las hebras es decorativa. Avanza hacia fuera desde el centro de cada red porque ese orden hace que un grupo se lea como una forma y no como una maraña, no porque algo circule así, en esa dirección ni en absoluto. Nada de este mapa está codificado en el movimiento: todos los datos están en las líneas, el color y el panel, y la animación se detiene por completo para quien tenga configurado el movimiento reducido.',
      },
      {
        en: 'Colour is the network, not the road. Two strands in the same shade are joined through a chain of links, and the shade says how many reader locations that chain holds. A network is a chain of mapped links under the distance limit above, so it is as much a product of those two choices as of the cameras: one unmapped reader, or one link a hundred yards over the limit, can be the difference between two networks and one.',
        es: 'El color indica la red, no la vía. Dos hebras del mismo tono están unidas por una cadena de conexiones, y el tono indica cuántas ubicaciones de lectores tiene esa cadena. Una red es una cadena de conexiones mapeadas por debajo del límite de distancia anterior, así que depende tanto de esas dos decisiones como de las cámaras: un lector sin mapear, o una conexión que supere el límite por cien metros, puede ser la diferencia entre dos redes y una.',
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
    geometry: 'line',
    color: '#818cf8',
    filament: true,
    positions: {
      offsetsKey: 'siteOffsets',
      countsKey: 'siteReaders',
      label: {
        en: 'The two reader locations this road runs between',
        es: 'Las dos ubicaciones de lectores que une esta vía',
      },
    },
    pulse: {
      phaseKey: 'phase',
      // Must equal PHASE_BANDS in scripts/ingest/corridors.mjs. Fewer bands
      // here than the ingest wrote would hide every link in the bands past the
      // end, so the two move together. Each band is a style layer that
      // re-uploads a gradient texture per tile per frame, which is why this is
      // as low as it is — the reasoning is beside the ingest constant.
      bands: 3,
      // A little over two seconds end to end. Slow enough to read as travelling
      // rather than flickering, quick enough that a reader who glances at one
      // cluster sees a whole pass without waiting for it.
      periodMs: 2200,
      networkKey: 'connectedSites',
    },
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
    category: 'historical',
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
