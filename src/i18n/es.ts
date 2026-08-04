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
  navFlightLog: 'Registro de vuelos',
  navAct: 'Actuar',
  navData: 'Datos abiertos',
  navContribute: 'Contribuir',
  navAbout: 'Qué es esto',
  skipToContent: 'Saltar al contenido principal',

  liveFlightsToggleLabel: 'Vuelos chárter de ICE Air en vivo',
  liveFlightsAboutToggle: 'Acerca de estos datos',
  liveFlightsIntro:
    'Aeronaves en cualquier parte del mundo que actualmente emiten un distintivo de llamada que coincide con operadores chárter conocidos de ICE Air, según adsb.lol — el mismo enfoque que usa el "MSP ICE Air Flight Tracker" de Otter Goose (ottergoose.net). Estos chárteres pasan la mayor parte del tiempo lejos de Minnesota, por lo que este es un feed mundial, no limitado al estado como el resto de las capas aquí.',
  liveFlightsCaveat:
    'Una coincidencia de distintivo de llamada no es una confirmación de registro: puede reutilizarse para un vuelo no relacionado, reasignarse, o simplemente no transmitirse, y este filtro no puede distinguir entre esos casos. Las posiciones entre actualizaciones se estiman interpolando entre dos posiciones reales, no una nueva lectura GPS en cada fotograma. La estela de color detrás de cada aeronave es su trayectoria reciente realmente reportada; al hacer clic en un avión se carga su historial real completo hasta la última vez que dejó tierra. La línea gris discontinua adelante es una proyección en línea recta desde el rumbo y la velocidad actuales para los próximos 10 minutos, no un plan de vuelo real — este feed no ofrece ninguno de los dos. El filtrado ocurre en el servidor antes de llegar a su navegador, y esto se actualiza con menos frecuencia que un feed en vivo típico, ya que la consulta mundial subyacente es grande.',
  liveFlightsLegendTitle: 'Coloreado por altitud',
  liveFlightsAltGround: 'En tierra',
  liveFlightsAltLow: 'Menos de 10,000 pies',
  liveFlightsAltMid: '10,000–25,000 pies',
  liveFlightsAltHigh: '25,000–35,000 pies',
  liveFlightsAltVeryHigh: 'Más de 35,000 pies',
  liveFlightsCount: '{count} aeronaves rastreadas',
  liveFlightsUpdated: 'actualizado hace {seconds}s',
  liveFlightsUnavailable: 'adsb.lol no responde en este momento.',

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

  // Registro de vuelos — historial persistente de llegadas/salidas en tierra
  // para aeronaves que coinciden con el filtro chárter de ICE Air del feed en
  // vivo, más una explicación legal sobre hábeas corpus. Los datos siempre
  // tienen confidence: 'reported', nunca 'confirmed'. El texto de contexto
  // legal es un borrador pendiente de revisión por un abogado — ver
  // flightLogDraftNotice.
  flightLogTitle: 'Registro de vuelos',
  flightLogIntro:
    'Un historial que se puede buscar de llegadas y salidas en tierra de aeronaves que han coincidido con el filtro chárter de ICE Air de este sitio, junto con una breve explicación de por qué esos datos de horario importan en la práctica del hábeas corpus. A diferencia del feed en vivo del mapa, los registros aquí persisten más allá de la consulta actual, de modo que un abogado puede citar una hora de tierra específica después de los hechos.',
  flightLogSearchLabel: 'Matrícula, código hexadecimal o distintivo de llamada',
  flightLogKnownGaps:
    'Limitaciones conocidas: los avistamientos se capturan mediante consultas cada minuto, por lo que una marca de tiempo puede estar desviada hasta ese margen. La identificación del aeropuerto es de mejor esfuerzo y solo para Minnesota — los avistamientos en otros lugares se registran con el campo de aeropuerto vacío en vez de una suposición. Una coincidencia de distintivo de llamada no es una confirmación de registro: los distintivos pueden reutilizarse, reasignarse o simplemente no transmitirse, y este filtro no puede distinguir entre esos casos.',
  flightLogLegalContextTitle: 'Por qué importan los datos de horario de vuelo en casos de hábeas corpus',
  flightLogLegalContext:
    "En la práctica del hábeas corpus, los tribunales suelen tratar por defecto al custodio inmediato de quien presenta la petición — quien tiene el poder de presentarlo ante el tribunal — como la parte demandada correcta, y escuchan el caso donde ese custodio se encuentra. Esta es la regla que la Corte Suprema aplicó en Rumsfeld v. Padilla, 542 U.S. 426 (2004), para impugnaciones a la reclusión física actual de una persona. Es una regla por defecto, no absoluta: los tribunales han reconocido excepciones, y qué custodio y qué tribunal son los correctos puede depender de los hechos específicos de un traslado. Una hora documentada de llegada o salida en tierra es un dato más para esa pregunta específica de los hechos, nada más.\n\nLa jurisdicción de hábeas corpus bajo 28 U.S.C. § 2241 alcanza de forma amplia: en Munaf v. Geren, 553 U.S. 674 (2008), la Corte Suprema resolvió que se extiende a cualquier persona bajo custodia real de Estados Unidos, sin importar bajo qué autoridad formal se le retiene. La misma decisión también corta en sentido contrario: resolvió que los tribunales no pueden usar el hábeas corpus para impedir el traslado de una persona bajo custodia estadounidense hacia un país extranjero para enfrentar allí un proceso penal de ese país por delitos cometidos en su territorio. Ambas mitades forman parte de lo resuelto. Por separado, la Regla 23(a) de Procedimiento de Apelación Federal es una salvaguarda procesal real y limitada: mientras una petición de hábeas corpus está pendiente de revisión, prohíbe que un custodio traslade a la persona fuera de la jurisdicción del tribunal sin autorización de ese tribunal. Por sí sola, no dice nada sobre lo que una marca de tiempo en particular puede demostrar.\n\nDos casos recientes muestran cómo los tribunales han tratado en la práctica el horario de los vuelos de expulsión — citados aquí como hechos históricos documentados, no como precedente asentado para disputas futuras. En J.G.G. v. Trump (D.D.C. núm. 1:25-cv-00766, presentado el 15 de marzo de 2025), el tribunal, durante una audiencia de emergencia, ordenó que los vuelos que ya estaban en el aire regresaran; un vuelo que ya había despegado aterrizó de todos modos en su destino, y el tribunal luego encontró causa probable de desacato penal. En A.A.R.P./W.M.M. v. Trump (Corte Suprema núm. 24A1007, 605 U.S. ___ (2025)), la Corte emitió una orden de emergencia en plena madrugada que prohibía la expulsión de un grupo de personas mientras se revisaba el caso, y después anuló el fallo del tribunal de apelaciones y devolvió el asunto para que los tribunales de distrito y de apelaciones abordaran los requisitos de medida cautelar preliminar y de notificación conforme al debido proceso. Ninguno de los dos casos establece una regla que los datos de este proyecto demuestren en ningún sentido.\n\nEl rastreador de hábeas corpus migratorio de Just Security (justsecurity.org/133928) ha documentado casos en los que los tribunales determinaron que el gobierno trasladó o expulsó a peticionarios en violación de órdenes judiciales — lo citamos únicamente para esa afirmación específica. Algunos defensores, incluida Lexington Alarm, cuyo Habeas Flight Watch inspiró esta página, sostienen además que la jurisdicción de hábeas corpus 'no termina al despegar' y continúa hasta que la aeronave aterriza. No pudimos verificar ese planteamiento frente a ninguna decisión judicial, así que aparece aquí únicamente como un argumento atribuido a otros, no como una afirmación que este proyecto haga sobre el derecho.\n\nNo hemos encontrado ninguna decisión judicial que haya admitido específicamente como prueba datos de marca de tiempo de rastreo ADS-B como estos, y no afirmamos que los datos de este proyecto se hayan usado en ningún caso concreto. Tampoco hemos encontrado, ni ofrecemos, ningún marco legal que describa el riesgo de publicar datos de rastreo de este tipo — si eso le importa a su situación, esa es una pregunta para un abogado, no algo que esta página pueda responder.",
  flightLogNotLegalAdvice:
    'Esto no es asesoría legal. Si usted está involucrado en un asunto de hábeas corpus, consulte a un abogado — esta página es un punto de partida para investigar, no un sustituto de representación legal.',
  flightLogDraftNotice:
    'Borrador — pendiente de revisión por un abogado. Esta sección todavía no ha sido revisada por un abogado y no debe usarse como base para ninguna decisión hasta que lo sea.',

  openSource: 'Código abierto',
  noTrackers: 'Sin rastreadores, sin analíticas, sin cuentas.',
  attribution: 'Atribución',
};
