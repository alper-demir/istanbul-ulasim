/**
 * TCDD source station labels are deliberately tied to static stop IDs here.
 * The builder only publishes a direction when both verified endpoints match;
 * it never derives intermediate timings from travel-duration assumptions.
 */
export const TCDD_ENDPOINT_MAPPINGS = {
  B1: {
    outbound: { sourceFrom: 'Halkalı MR', sourceTo: 'Gebze', stopIds: ['rail-stop:osm:7711800031', 'rail-stop:osm:7716752898'] },
    return: { sourceFrom: 'Gebze', sourceTo: 'Halkalı MR', stopIds: ['rail-stop:osm:7716752897', 'rail-stop:osm:7711800001'] },
  },
  M11: {
    outbound: { sourceFrom: 'Gayrettepe', sourceTo: 'Halkalı', stopIds: ['metro-stop:osm:11568561814', 'metro-stop:osm:13952092132'] },
    return: { sourceFrom: 'Halkalı', sourceTo: 'Gayrettepe', stopIds: ['metro-stop:osm:13952092131', 'metro-stop:osm:11568561815'] },
  },
};

export function tcddEndpointMapping(code, direction) {
  const mapping = TCDD_ENDPOINT_MAPPINGS[code]?.[direction.id];
  if (!mapping) throw new Error(`${code}/${direction.id}: açık TCDD uç istasyon eşlemesi bulunamadı`);
  if (mapping.stopIds.length < 2) throw new Error(`${code}/${direction.id}: en az iki doğrulanmış istasyon gerekli`);
  if (direction.stops[0]?.id !== mapping.stopIds[0] || direction.stops.at(-1)?.id !== mapping.stopIds.at(-1)) {
    throw new Error(`${code}/${direction.id}: statik rota uçları TCDD eşleme manifestiyle uyuşmuyor`);
  }
  return mapping;
}
