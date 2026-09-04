/**
 * M7 source sections are deliberately mapped by hand.  Do not replace these
 * with name similarity: an unknown Metro İstanbul section must stop the
 * snapshot build instead of being silently attached to the full line.
 */
export const M7_SEGMENT_MAPPINGS = {
  outbound: {
    segments: [
      { sourceFrom: 'Yıldız', sourceTo: 'Mecidiyeköy', staticFrom: 'Yıldız', staticTo: 'Mecidiyeköy', stopIds: ['metro-stop:osm:7897142455', 'metro-stop:osm:6508650238'] },
      { sourceFrom: 'Nurtepe', sourceTo: 'Mahmutbey', staticFrom: 'Nurtepe', staticTo: 'Mahmutbey', stopIds: ['metro-stop:osm:6508688805', 'metro-stop:osm:7726641183'] },
    ],
  },
  return: {
    segments: [
      { sourceFrom: 'Mecidiyeköy', sourceTo: 'Yıldız', staticFrom: 'Mecidiyeköy', staticTo: 'Yıldız', stopIds: ['metro-stop:osm:6508650248', 'metro-stop:osm:6507293771'] },
      { sourceFrom: 'Mahmutbey', sourceTo: 'Nurtepe', staticFrom: 'Mahmutbey', staticTo: 'Nurtepe', stopIds: ['metro-stop:osm:7726641183', 'metro-stop:osm:6508688805'] },
    ],
  },
};

export function m7SegmentForDirection(direction) {
  const mapping = M7_SEGMENT_MAPPINGS[direction.id];
  if (!mapping) throw new Error(`M7/${direction.id}: açık kaynak bölüm eşlemesi bulunamadı`);
  if (!Array.isArray(mapping.segments) || !mapping.segments.length) throw new Error(`M7/${direction.id}: açık kaynak bölümü bulunamadı`);
  for (const segment of mapping.segments) {
    if (!Array.isArray(segment.stopIds) || segment.stopIds.length < 2) throw new Error(`M7/${direction.id}: bölüm en az iki açık istasyon kimliği içermeli`);
  }
  return mapping.segments;
}
