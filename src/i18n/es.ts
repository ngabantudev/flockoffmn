/**
 * Spanish UI and key guidance (spec §8).
 *
 * Keys missing here fall back to English per-key at render time, so a
 * half-finished translation degrades into a readable mixed page rather than
 * showing a raw key to a reader who needs the information.
 */
export const es: Record<string, string> = {
  siteName: 'get-flocked',
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
  skipToMap: 'Saltar al mapa',

  layers: 'Capas',
  legend: 'Leyenda',
  filters: 'Filtros',
  toggleLayer: 'Mostrar u ocultar capa',
  showLayer: 'Mostrar',
  hideLayer: 'Ocultar',
  clearFilters: 'Borrar filtros',
  featuresShown: 'mostrados',
  ofTotal: 'de',
  loading: 'Cargando datos del mapa…',
  mapLabel: 'Mapa interactivo de registros de vigilancia, control migratorio y política de vivienda',
  zoomIn: 'Acercar',
  zoomOut: 'Alejar',
  resetView: 'Volver a Minnesota',
  closePanel: 'Cerrar panel',
  noResults: 'Ningún registro coincide con los filtros actuales.',

  searchPlaceholder: 'Busque una ciudad, condado o agencia',
  searchLabel: 'Buscar lugares, condados y agencias',
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
  downloadLayer: 'Descargar esta capa',

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
  limitsNotLive:
    'No es un rastreador en vivo. Muestra dónde se ha registrado infraestructura, nunca dónde está una persona.',
  limitsNotPeople:
    'Nunca sobre personas. Cada registro describe una institución, un edificio, un contrato o una política.',
  limitsNotLegal: 'No es asesoría legal. Las herramientas de acción son informativas.',
  limitsIncomplete:
    'Incompleto por naturaleza. Cada capa está fechada, es parcial o aproximada, y cada una lo explica.',
  dismiss: 'Descartar',

  openSource: 'Código abierto',
  noTrackers: 'Sin rastreadores, sin analíticas, sin cuentas.',
  attribution: 'Atribución',
};
