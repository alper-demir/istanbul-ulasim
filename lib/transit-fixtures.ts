export type TransitStop = {
  id: string;
  name: string;
  coordinates: [number, number];
  district: string;
};

export type TransitVehicle = {
  id: string;
  doorCode: string;
  coordinates: [number, number];
  speed: number;
  direction: string;
  nextStop: string;
  updatedSecondsAgo: number;
  source?: 'fixture' | 'ibb-iett-live';
  directionId?: 'outbound' | 'return' | 'unknown';
  nearbyStopCode?: string;
  updatedAt?: string;
};

export type TransitDirection = {
  id: string;
  name: string;
  durationMinutes: number;
  coordinates: [number, number][];
  stops: TransitStop[];
  geometrySource?: string;
  geometrySourceUpdatedAt?: string;
  geometrySourceUrl?: string;
};

export type TransitRoute = {
  id: string;
  code: string;
  name: string;
  color: string;
  /**
   * Presentation labels are kept in Turkish because this object is also used
   * by the small offline fixture. New static networks should use the same
   * contract rather than creating mode-specific route shapes.
   */
  mode: 'Otobüs' | 'Metrobüs' | 'Metro' | 'Tramvay' | 'Füniküler' | 'Marmaray' | 'Vapur' | 'Minibüs';
  fareLabel: string;
  fareProfileId?: string;
  fareVerification?: 'route-verified' | 'group-verified' | 'general-only';
  fareSourceUrl?: string;
  fareEffectiveFrom?: string;
  fareVerifiedAt?: string;
  durationMinutes: number;
  coordinates: [number, number][];
  stops: TransitStop[];
  vehicles: TransitVehicle[];
  directions?: TransitDirection[];
  operator?: string;
  source?: 'fixture' | 'ibb-open-data' | 'metro-istanbul' | 'marmaray' | 'sehir-hatlari' | 'osm';
  sourceLabel?: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  supportsLiveVehicles?: boolean;
  geometrySource?: string;
  geometrySourceUpdatedAt?: string;
  geometrySourceUrl?: string;
};

export const routes: TransitRoute[] = [
  {
    id: '500t', code: '500T', name: 'Tuzla Şifa Mahallesi — Cevizlibağ', color: '#ef5b4c',
    mode: 'Otobüs', fareLabel: '2 biletli tarife', durationMinutes: 136,
    coordinates: [[29.364,40.829],[29.283,40.875],[29.231,40.898],[29.168,40.917],[29.107,40.944],[29.064,40.971],[29.022,40.991],[28.986,41.01],[28.947,41.021],[28.916,41.019]],
    stops: [
      { id:'500t-1', name:'Şifa Mahallesi', district:'Tuzla', coordinates:[29.364,40.829] },
      { id:'500t-2', name:'Tuzla Devlet Hastanesi', district:'Tuzla', coordinates:[29.283,40.875] },
      { id:'500t-3', name:'Kartal Köprüsü', district:'Kartal', coordinates:[29.168,40.917] },
      { id:'500t-4', name:'Küçükyalı Metro', district:'Maltepe', coordinates:[29.107,40.944] },
      { id:'500t-5', name:'Kadıköy Rıhtım', district:'Kadıköy', coordinates:[29.022,40.991] },
      { id:'500t-6', name:'Cevizlibağ', district:'Zeytinburnu', coordinates:[28.916,41.019] },
    ],
    vehicles: [
      { id:'v-500t-1', doorCode:'B-1832', coordinates:[29.246,40.892], speed:34, direction:'Cevizlibağ', nextStop:'Kartal Köprüsü', updatedSecondsAgo:12 },
      { id:'v-500t-2', doorCode:'ÖHO-2417', coordinates:[29.084,40.957], speed:21, direction:'Cevizlibağ', nextStop:'Küçükyalı Metro', updatedSecondsAgo:18 },
      { id:'v-500t-3', doorCode:'B-2045', coordinates:[28.966,41.016], speed:16, direction:'Şifa Mahallesi', nextStop:'Topkapı', updatedSecondsAgo:27 },
    ],
  },
  {
    id:'34bz', code:'34BZ', name:'Beylikdüzü — Zincirlikuyu', color:'#f3a712',
    mode:'Metrobüs', fareLabel:'Mesafe bazlı tarife', durationMinutes:82,
    coordinates:[[28.622,41.002],[28.69,41.01],[28.744,40.99],[28.806,40.982],[28.862,40.992],[28.916,41.019],[28.955,41.043],[29.011,41.067]],
    stops:[
      { id:'34bz-1', name:'Beylikdüzü Sondurak', district:'Beylikdüzü', coordinates:[28.622,41.002] },
      { id:'34bz-2', name:'Avcılar Merkez', district:'Avcılar', coordinates:[28.744,40.99] },
      { id:'34bz-3', name:'Cevizlibağ', district:'Zeytinburnu', coordinates:[28.916,41.019] },
      { id:'34bz-4', name:'Zincirlikuyu', district:'Beşiktaş', coordinates:[29.011,41.067] },
    ],
    vehicles:[
      { id:'v-34bz-1', doorCode:'M-3412', coordinates:[28.716,41.001], speed:42, direction:'Zincirlikuyu', nextStop:'Avcılar Merkez', updatedSecondsAgo:9 },
      { id:'v-34bz-2', doorCode:'M-3478', coordinates:[28.895,41.008], speed:29, direction:'Beylikdüzü', nextStop:'Merter', updatedSecondsAgo:14 },
      { id:'v-34bz-3', doorCode:'M-3501', coordinates:[28.973,41.053], speed:38, direction:'Zincirlikuyu', nextStop:'Mecidiyeköy', updatedSecondsAgo:22 },
    ],
  },
  {
    id:'15f', code:'15F', name:'Beykoz — Kadıköy', color:'#277da1',
    mode:'Otobüs', fareLabel:'Tam elektronik bilet', durationMinutes:94,
    coordinates:[[29.092,41.134],[29.071,41.107],[29.055,41.075],[29.043,41.04],[29.032,41.014],[29.022,40.991]],
    stops:[
      { id:'15f-1', name:'Beykoz', district:'Beykoz', coordinates:[29.092,41.134] },
      { id:'15f-2', name:'Çubuklu', district:'Beykoz', coordinates:[29.071,41.107] },
      { id:'15f-3', name:'Kavacık', district:'Beykoz', coordinates:[29.055,41.075] },
      { id:'15f-4', name:'Üsküdar', district:'Üsküdar', coordinates:[29.032,41.014] },
      { id:'15f-5', name:'Kadıköy', district:'Kadıköy', coordinates:[29.022,40.991] },
    ],
    vehicles:[
      { id:'v-15f-1', doorCode:'B-1519', coordinates:[29.064,41.09], speed:25, direction:'Kadıköy', nextStop:'Kavacık', updatedSecondsAgo:16 },
      { id:'v-15f-2', doorCode:'ÖHO-1534', coordinates:[29.037,41.026], speed:18, direction:'Beykoz', nextStop:'Üsküdar', updatedSecondsAgo:31 },
    ],
  },
];
