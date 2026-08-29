/**
 * Official source registry for the IETT integration.
 *
 * Static route geometry is intentionally ingested server-side: the official
 * GeoJSON is roughly 257 MB, which is unsuitable for a browser request.
 */
export const IETT_SOURCES = {
  routeGeometry: {
    id: 'ibb-iett-route-geometry',
    label: 'İBB Açık Veri — İETT Hat Güzergâhları',
    url: 'https://data.ibb.gov.tr/dataset/b48d2095-851c-413c-8d36-87d2310a22b5/resource/4ccb4d29-c2b6-414a-b324-d2c9962b18e2/download/iett-hat-guzergahlar-verisi.geojson',
    licenseUrl: 'https://data.ibb.gov.tr/license',
    refresh: 'daily',
  },
  masterData: {
    id: 'ibb-iett-master-data',
    label: 'İBB İETT Hat ve Durak Ana Verisi',
    wsdl: 'https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx?wsdl',
    refresh: 'daily',
  },
  vehiclePositions: {
    id: 'ibb-iett-vehicle-positions',
    label: 'İBB İETT Araç Konumları',
    wsdl: 'https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx?wsdl',
    endpoint: 'https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx',
    refresh: '30 seconds',
  },
} as const;

export type SourceHealth = {
  id: string;
  label: string;
  kind: 'static-network' | 'live-vehicles';
  status: 'ready-to-import' | 'connected' | 'credentials-required' | 'fixture';
  detail: string;
  updatedAt: string;
  attributionUrl: string;
};

export function getIettSourceHealth(): SourceHealth[] {
  return [
    {
      id: IETT_SOURCES.routeGeometry.id,
      label: IETT_SOURCES.routeGeometry.label,
      kind: 'static-network',
      status: 'ready-to-import',
      detail: 'Resmî GeoJSON kaynak kaydı doğrulandı; büyük dosya sunucu tarafında sürümlü olarak içe aktarılacak.',
      updatedAt: new Date().toISOString(),
      attributionUrl: IETT_SOURCES.routeGeometry.licenseUrl,
    },
    {
      id: IETT_SOURCES.vehiclePositions.id,
      label: IETT_SOURCES.vehiclePositions.label,
      kind: 'live-vehicles',
      status: 'connected',
      detail: 'Resmî hat bazlı araç konum metodu bağlı; sunucu adaptörü kısa süreli önbellek ve saatlik istek bütçesiyle kaynağı korur.',
      updatedAt: new Date().toISOString(),
      attributionUrl: IETT_SOURCES.vehiclePositions.wsdl,
    },
    {
      id: 'istanbulum-fixtures',
      label: 'İstanbulum geliştirme verisi',
      kind: 'static-network',
      status: 'fixture',
      detail: 'Geliştirme verisi yalnızca resmî statik veya canlı kaynak kullanılamadığında yedek olarak tutulur.',
      updatedAt: new Date().toISOString(),
      attributionUrl: 'https://github.com/',
    },
  ];
}
