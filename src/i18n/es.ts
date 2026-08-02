/**
 * Spanish UI and key guidance (spec §8).
 *
 * Keys missing here fall back to English per-key at render time, so a
 * half-finished translation degrades into a readable mixed page rather than
 * showing a raw key to a reader who needs the information.
 */
export const es: Record<string, string> = {
  siteName: 'FlockOff',
  tagline: 'Hacer visibles los sistemas de vigilancia, control migratorio y política de vivienda en Minnesota.',

  navMap: 'Mapa',
  navNearMe: 'Cerca de mí',
  navSources: 'Fuentes y metodología',
  navExplainer: 'Cómo se conecta',
  navAct: 'Actuar',
  navData: 'Datos abiertos',
  navContribute: 'Contribuir',
  navAbout: 'Qué es esto',
  skipToContent: 'Saltar al contenido principal',

  liveFlightsToggleLabel: 'Tráfico aéreo en vivo',
  liveFlightsAboutToggle: 'Acerca de estos datos',
  liveFlightsIntro:
    'Toda aeronave con transpondedor actualmente sobre Minnesota, según adsb.lol. Tráfico aéreo general, no actividad de control migratorio — se muestra para demostrar que el sistema de rastreo en vivo funciona.',
  liveFlightsCaveat:
    'Las posiciones entre actualizaciones se estiman interpolando entre dos posiciones reales tomadas con unos 8 segundos de diferencia, no una nueva lectura GPS en cada fotograma. La estela de color detrás de cada aeronave es su trayectoria reciente realmente reportada; al hacer clic en un avión se carga su historial real completo hasta la última vez que dejó tierra. La línea gris discontinua adelante es una proyección en línea recta desde su rumbo y velocidad actuales para los próximos 10 minutos, no su plan de vuelo o ruta real — este feed no ofrece ninguno de los dos. Que aparezca una matrícula o distintivo aquí no implica que la aeronave sea propiedad de, ni opere en nombre de, ninguna agencia gubernamental.',
  liveFlightsLegendTitle: 'Coloreado por altitud',
  liveFlightsAltGround: 'En tierra',
  liveFlightsAltLow: 'Menos de 10,000 pies',
  liveFlightsAltMid: '10,000–25,000 pies',
  liveFlightsAltHigh: '25,000–35,000 pies',
  liveFlightsAltVeryHigh: 'Más de 35,000 pies',
  liveFlightsCount: '{count} aeronaves rastreadas',
  liveFlightsUpdated: 'actualizado hace {seconds}s',
  liveFlightsUnavailable: 'adsb.lol no responde en este momento.',
  liveFlightsIceOnlyLabel: 'Mostrar solo vuelos chárter de ICE Air (en todo el mundo)',
  liveFlightsIceOnlyCaveat:
    'Cambia a una consulta mundial — estos chárteres pasan la mayor parte del tiempo lejos de Minnesota — filtrada a las aeronaves que emiten un distintivo de llamada que coincide con operadores chárter conocidos de ICE Air. Mismo enfoque, y los mismos patrones de distintivo de llamada, que el "MSP ICE Air Flight Tracker" de Otter Goose (ottergoose.net). El filtrado ocurre en el servidor antes de llegar a su navegador, y se actualiza un poco menos seguido que la vista de Minnesota de arriba, ya que la consulta subyacente es mucho más grande. Una coincidencia de distintivo de llamada no es una confirmación de registro: puede reutilizarse para un vuelo no relacionado, reasignarse, o simplemente no transmitirse, y este filtro no puede distinguir entre esos casos.',

  liveBannerLoading: 'Comprobando aeronaves de agencias…',
  liveBannerCount: 'EN VIVO: {count} aeronaves de agencias en Minnesota',
  liveBannerCaveat:
    '"Contratista de ICE Air" significa que la aeronave pertenece a una empresa bajo un contrato chárter de ICE Air, no confirmación de que se trate de un vuelo activo.',
  liveBannerUnavailable: 'Los datos de aeronaves en vivo no están disponibles en este momento.',
  agencyLabelStatePatrol: 'Patrulla Estatal',
  agencyLabelDnrEnforcement: 'Cumplimiento del DNR',
  agencyLabelIceAir: 'contratista de ICE Air',
  agencyLabelBca: 'BCA',
  agencyLabelCountySheriff: 'alguacil de condado',
  agencyLabelCbp: 'CBP',
  agencyLabelMnArmyNationalGuard: 'Guardia Nacional del Ejército de MN',

  layers: 'Capas',
  filters: 'Filtros',
  layersOn: 'capas activadas',
  clearFilters: 'Borrar filtros',
  filtersCleared: 'Filtros borrados',
  ofTotal: 'de',
  loading: 'Cargando datos del mapa…',
  mapLabel: 'Mapa interactivo de registros de vigilancia, control migratorio y política de vivienda',
  resetView: 'Volver a Minnesota',
  closePanel: 'Cerrar panel',
  noResults: 'Ningún registro coincide con los filtros actuales.',

  searchPlaceholder: 'Busque una ciudad, municipio rural, condado o agencia',
  searchLabel: 'Buscar ciudades, municipios rurales, condados y agencias',
  nearMeTitle: 'Qué hay alrededor de este lugar',
  nearMeIntro:
    'Elija un lugar en Minnesota para ver todas las capas a su alrededor en una sola vista. Nada de lo que escriba se envía ni se guarda en ningún lugar.',
  useMyLocation: 'Usar mi ubicación',
  locating: 'Localizando…',
  locationDenied: 'Se denegó el permiso de ubicación. Puede buscar un lugar en su lugar.',
  locationUnavailable: 'Su dispositivo no pudo proporcionar una ubicación. Puede buscar un lugar en su lugar.',
  chooseAPlace: 'Elija un lugar',
  nearMePrivacy:
    'Esta consulta se ejecuta por completo en su navegador. La lista de lugares de Minnesota se descarga junto con la página, así que nada de lo que escriba se envía a un geocodificador, ni a nosotros, ni a nadie más: aquí no hay servidor que pueda registrarlo.',
  aroundYourLocation: 'Alrededor de su ubicación',
  aroundPlace: 'Alrededor de {place}',
  stateName: 'Minnesota',
  mappedWithin: 'en el mapa, a menos de {miles} mi',
  alsoWithin: '{count} a menos de {miles} mi',
  nearestIs: 'El más cercano, a {distance} mi',
  distanceAway: 'a {distance} mi',
  foundInCounty: '{count} en este condado:',
  crossLayerNote:
    'No son mapas separados. Las cámaras alimentan búsquedas, las búsquedas alimentan la aplicación de la ley, la aplicación alimenta la detención, y todo ello se asienta sobre un terreno moldeado por décadas de política de vivienda.',
  readHowThisConnects: 'Lea cómo se conecta',

  whatThisMeans: 'Qué significa esto',
  source: 'Fuente',
  sourceDate: 'Fecha de la fuente',
  lastUpdated: 'Última actualización',
  license: 'Licencia',
  confidence: 'Confianza',
  limitations: 'Limitaciones',
  county: 'Condado',
  viewRecord: 'Ver el registro original',

  // Quién responde aquí
  whoAnswersTitle: 'Quién le debe respuesta aquí',
  whoAnswersIntro:
    'Cada punto de Minnesota está bajo varios gobiernos a la vez. Estas son las oficinas obligadas a responder una solicitud sobre este terreno, de la más cercana a la más lejana.',
  whoAnswersEmpty:
    'Este punto queda fuera de los límites jurisdiccionales que tenemos. Pruebe con el nombre de un lugar.',
  youAreIn: 'Usted está en',
  jurisdictionCity: 'Ciudad',
  jurisdictionTownship: 'Municipio rural (township)',
  jurisdictionUnorganized: 'Territorio no organizado',
  jurisdictionCounty: 'Condado',
  inCounty: 'en {county}',

  officeTownClerk: 'Secretario del municipio rural (town clerk)',
  officeTownClerkRole:
    'La junta del municipio designa quién responde las solicitudes de datos. Mientras no lo haga, la ley de Minnesota se lo asigna al secretario, que ya custodia los registros, libros y documentos del municipio.',
  officeCityClerk: 'Secretario municipal (city clerk)',
  officeCityClerkRole:
    'El concejo municipal designa quién responde las solicitudes de datos. Mientras no lo haga, la ley de Minnesota se lo asigna al secretario municipal, electo o designado.',
  officeCountyAdministrator: 'Coordinador o administrador del condado',
  officeCountyAdministratorRole:
    'La junta del condado designa quién responde las solicitudes de datos. Mientras no lo haga, la ley de Minnesota se lo asigna al coordinador o administrador del condado, o al auditor del condado si no existe ninguno de los dos.',
  officeLawEnforcement: 'Oficina del sheriff',
  officeLawEnforcementRole:
    'Donde realmente se guardan los datos de los lectores de matrículas. La ley de ALPR de Minnesota exige un registro público, una pista de auditoría de cada acceso y una auditoría independiente cada dos años.',
  officeCommissioner: 'Comisionado de Administración',
  officeCommissionerRole:
    'Si le niegan una solicitud, el comisionado dictaminará por escrito, en un plazo de 50 días, si la negativa fue legal. La opinión no obliga a la entidad, pero un tribunal debe darle deferencia.',

  noLocalGovernment:
    'Este terreno no tiene gobierno local propio. Aquí no hay junta municipal ni secretario: el condado es el gobierno local, y todo lo que trataría una junta municipal empieza en el condado.',
  operatorMismatch:
    'Las cámaras registradas cerca de aquí las opera {operators}, no {jurisdiction}. Un organismo que usted elige localmente no controla equipos que instaló otro gobierno, ni siquiera dentro de sus propios límites.',
  operatorUnattributed:
    '{count} de las cámaras registradas cerca de aquí no tienen operador anotado. Quién las opera es una pregunta, no un hallazgo, y es de las que una solicitud de datos puede responder.',
  writeToThisOffice: 'Escriba a esta oficina',
  underStatute: 'Según {cite}',

  actionAddressed: 'La carta irá dirigida a {body}, según consta en este registro.',
  actionUnknownOperator:
    'Nadie ha anotado quién opera esta. La carta irá dirigida a {body}, la agencia de este terreno, y preguntar quién la opera es en sí una pregunta legítima para ellos.',
  actionPickBody: 'Elegirá a qué organismo dirigirse en la página siguiente.',

  locateTitle: 'Empiece por donde vive',
  locateIntro:
    'Elija su ciudad o municipio rural y esta página nombrará las oficinas obligadas a responderle, y dirigirá la carta de abajo a la que usted elija.',
  locateLabel: 'Su ciudad o municipio rural',
  locatePlaceholder: 'p. ej. Waterford Township, o Northfield',
  locateHint:
    'Están listadas las 2.757 ciudades, municipios rurales y territorios no organizados de Minnesota, no solo las ciudades incorporadas.',
  useThisBody: 'Dirigir la carta a esta oficina',
  addressedTo: 'La carta de abajo ahora va dirigida a {entity}.',

  positionsScale:
    'Dibujado a escala sobre {total} millas. Un punto más grande significa más en un mismo lugar.',
  positionsSummary: '{count} marcas a lo largo de {total} millas, a {offsets} millas del inicio.',
  densityScale: 'escasa → densa',
  densityNodes: 'Las manchas más brillantes son nodos: dos o más cámaras juntas.',
  categoryFromZoom: 'Los colores se aplican cuando las cámaras se dibujan una a una, desde el zoom {zoom}.',

  confidenceConfirmed: 'Confirmado: documentado en un registro público oficial.',
  confidenceReported: 'Reportado: proviene de permisos o registros secundarios que pueden estar desactualizados.',
  confidenceProbabilistic: 'Probabilístico: de origen comunitario; puede haberse movido o retirado.',

  limitsTitle: 'Qué es esto y qué no es',

  openSource: 'Código abierto',
  noTrackers: 'Sin rastreadores, sin analíticas, sin cuentas.',
  attribution: 'Atribución',
};
