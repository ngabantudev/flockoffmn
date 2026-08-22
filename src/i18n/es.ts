/**
 * Spanish UI and key guidance (spec §8).
 *
 * Keys missing here fall back to English per-key at render time, so a
 * half-finished translation degrades into a readable mixed page rather than
 * showing a raw key to a reader who needs the information.
 */
export const es: Record<string, string> = {
  siteName: 'FlockOff: MN',
  tagline: 'Hacer visibles los sistemas de vigilancia, control migratorio y política de vivienda en Minnesota.',

  navMap: 'Mapa',
  navNearMe: 'Cerca de mí',
  navSources: 'Fuentes y metodología',
  navExplainer: 'Cómo se conecta',
  navAct: 'Actuar',
  navData: 'Datos abiertos',
  navContribute: 'Contribuir',
  navAbout: 'Qué es esto',
  // See en.ts's own comment — short forms for the bottom icon bar.
  navMapShort: 'Mapa',
  navNearMeShort: 'Cerca',
  navSourcesShort: 'Fuentes',
  navExplainerShort: 'Red',
  navActShort: 'Actuar',
  navDataShort: 'Datos',
  navAboutShort: 'Qué es',
  skipToContent: 'Saltar al contenido principal',

  // Comparador deslizante
  // Mayúscula inicial en cada palabra aquí — compareTitle es un <h1> visible,
  // comparePovertySide/compareBlackSide son encabezados de leyenda,
  // compareOpenButton/compareShowAlpr son etiquetas de botón/control.
  // compareIntro, compareAccessibleNote y compareVintage son prosa y
  // mantienen mayúscula solo al inicio, a propósito.
  compareTitle: 'Tasa De Pobreza Y Proporción De Población Negra, Una Junto A La Otra',
  compareIntro:
    'Arrastra el control deslizante para comparar dos capas de secciones censales en el mismo mapa: la tasa de pobreza a la izquierda, la proporción de población negra a la derecha. Ambas provienen de las mismas estimaciones de la Encuesta sobre la Comunidad de la Census Bureau que las capas activables del mapa principal — esta vista las presenta una junto a la otra en lugar de una a la vez.',
  compareSliderLabel: 'Mover el divisor entre la tasa de pobreza y la proporción de población negra',
  comparePovertySide: 'Tasa De Pobreza',
  compareBlackSide: 'Proporción De Población Negra',
  compareSourceLabel: 'Fuente:',
  compareVintage: 'Encuesta sobre la Comunidad de la Census Bureau, estimaciones de 5 años,',
  compareShowAlpr: 'Mostrar Cámaras ALPR',
  compareAccessibleNote:
    'Esta vista dividida es una herramienta de comparación visual y no tiene equivalente no visual — un lector de pantalla no puede describir qué tono queda bajo un divisor en movimiento. Para los mismos datos en forma accesible, cierra esta vista y activa las capas de tasa de pobreza y proporción de población negra una a la vez, o descarga la tabla completa desde Datos abiertos.',
  compareAccessibleLink: 'Descargas de datos abiertos',
  compareOpenButton: 'Comparar Pobreza Y Población Negra',
  compareClose: 'Cerrar la vista de comparación',

  layers: 'Capas',
  filters: 'Filtros',
  layersOn: 'capas activadas',
  clearFilters: 'Borrar filtros',
  filtersCleared: 'Filtros borrados',
  ofTotal: 'de',
  loading: 'Cargando datos del mapa…',
  mapLabel: 'Mapa interactivo de registros de vigilancia, control migratorio y política de vivienda',
  resetView: 'Volver a Minnesota',
  mapNearMe: 'ALPR cerca de mí',
  mapNearMeFound: '{count} cerca, {shown} mostrados.',
  mapNearMeNone: 'No hay nada mapeado cerca de este punto.',
  recordSelected: '{layer}: {name} seleccionado',
  mapNearMeRadiusLabel: 'Radio de búsqueda',
  mapNearMeRadiusValue: '{mi} mi',
  mapNearMeListSummary: '{found} encontrados, {shown} mostrados dentro de {radius} mi',
  mapNearMeBack: 'Volver a la lista',
  mapNearMeCrossListed: 'De doble registro',
  mapNearMeLoading: 'Buscando cámaras cercanas…',
  mapNearMeLayerError: 'No se pudo cargar {layer} — sus resultados pueden estar incompletos.',
  mapNearMeListTabSuffix: ', {count} cerca',
  closePanel: 'Cerrar panel',
  noResults: 'Ningún registro coincide con los filtros actuales.',
  recordPanel: 'Registro',

  searchPlaceholder: 'Busque una ciudad, municipio rural, condado o agencia',
  searchLabel: 'Buscar ciudades, municipios rurales, condados y agencias',
  nearMeTitle: 'Qué hay alrededor de este lugar',
  nearMeIntro:
    'Elija un lugar en Minnesota para ver todas las capas a su alrededor en una sola vista. Nada de lo que escriba se envía ni se guarda en ningún lugar.',
  useMyLocation: 'Usar mi ubicación',
  locating: 'Localizando…',
  locationDenied: 'Se denegó el permiso de ubicación. Puede buscar un lugar en su lugar.',
  locationUnavailable: 'Su dispositivo no pudo proporcionar una ubicación. Puede buscar un lugar en su lugar.',
  locationTimedOut: 'Su dispositivo tardó demasiado en responder. Puede buscar un lugar en su lugar.',
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
  entityUnattributed: 'Sin operador registrado',
  showOnMap: 'Ver en el mapa',
  showMore: 'Mostrar {count} más',
  outsideMinnesotaTitle: 'Esta ubicación está fuera de Minnesota',
  outsideMinnesota:
    'flockoffmn solo cubre Minnesota. Este punto está fuera del estado, así que no hay nada mapeado que mostrar aquí.',
  lowAccuracy:
    'Su dispositivo informó esta ubicación con un margen de unas {accuracy} mi — los resultados pueden variar en esa medida.',
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
  crossListedCorner: 'Esquina de doble registro',
  crossListedNearMissLegend:
    'Casi acierto: una declaración tenía cerca un dispositivo mapeado por voluntarios, pero se contó como coincidencia de una declaración más cercana de la misma agencia.',
  crossSourceJumpToMatch: 'Ir a la declaración que se llevó la coincidencia',

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

  confidenceConfirmed: 'Confirmado: documentado en un registro público oficial.',
  confidenceReported: 'Reportado: proviene de permisos o registros secundarios que pueden estar desactualizados.',
  confidenceProbabilistic: 'Probabilístico: de origen comunitario; puede haberse movido o retirado.',

  limitsTitle: 'Qué es esto y qué no es',

  openSource: 'Código abierto',
  noTrackers: 'Sin rastreadores, sin analíticas, sin cuentas.',
  attribution: 'Atribución',

  // Noticias — cobertura de prensa, Nivel 4.
  navNews: 'Cobertura',
  navNewsShort: 'Noticias',
  newsTitle: 'Cobertura',
  newsIntro:
    'Noticias de Minnesota sobre equipos de vigilancia, acuerdos de aplicación de la ley y contratos de detención — recopiladas automáticamente de Google News y actualizadas a diario. Es una lista de lectura, no un registro.',
  newsTierTitle: 'Esta página es cobertura de prensa, no registros.',
  newsTierWarning:
    'Todo lo que aparece abajo es un titular escrito por un medio de comunicación. Los titulares son pistas: señalan algo que vale la pena verificar, y a veces son erróneos, incompletos o se corrigen después. Nada de esto sirve por sí solo como fuente de una afirmación.',
  newsTierPointer: 'Para registros con números de documento y citas que los respalden, use el',
  newsTierPointerAnd: 'y',
  newsEmpty:
    'El archivo de cobertura aún no se ha generado. Ejecute «npm run data:news» para obtenerlo.',
  newsCoverageTitle: 'Lo que esta página no puede ver',
  newsScreenedPrefix: 'En la ejecución más reciente, se descartaron',
  newsScreenedSuffix:
    'noticias antes de guardar nada porque trataban sobre personas concretas — detenciones, causas judiciales, agentes identificados o personas captadas por una cámara. Este sitio documenta los sistemas, nunca a las personas contra quienes se dirigen, y esos titulares se cuentan aquí pero nunca se almacenan.',
  newsTopicAlpr: 'Lectores de matrículas',
  newsTopicSurveillance: 'Tecnología de vigilancia',
  newsTopicImmigration: 'Aplicación de leyes migratorias',
  newsTopicDetention: 'Detención',
  newsTopicOther: 'Otros',

  // Panel de noticias y controles del archivo.
  newsRailTitle: 'Cobertura de MN relacionada',
  newsRange24h: '24H',
  newsRange7d: '7D',
  newsRange30d: '30D',
  newsRange1y: '1A',
  newsRangeAll: 'Todo',
  newsRangeLabel: 'Rango de fechas',
  newsTopicLabel: 'Tema',
  newsTopicAll: 'Todos los temas',
  newsNoneInRange: 'No hay noticias en este rango.',
  newsOpenArchive: 'Abrir el archivo completo',
  newsTierRail:
    'Cobertura de prensa, no registros. Los titulares son pistas — el mapa que aparece al lado es el registro documentado.',
  newsCurveCaption: 'Noticias publicadas por mes —',
  newsCurveAlt: 'Noticias publicadas por mes:',
  newsShownSuffix: 'mostradas',
  newsNoneRecent: 'Sin cobertura en los últimos 30 días. El archivo tiene el registro completo.',
  newsRailCapped: 'Recortado a las noticias más recientes — abra el archivo para ver el mes completo.',
};
