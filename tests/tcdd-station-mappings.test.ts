import { describe, expect, it } from 'vitest';
import { tcddEndpointMapping } from '../scripts/tcdd-station-mappings.mjs';

describe('TCDD endpoint mappings', () => {
  it('requires known B1 and M11 endpoint stop IDs', () => {
    expect(tcddEndpointMapping('B1', { id: 'outbound', stops: [{ id: 'rail-stop:osm:7711800031' }, { id: 'rail-stop:osm:7716752898' }] })).toMatchObject({ sourceFrom: 'Halkalı MR', sourceTo: 'Gebze' });
    expect(tcddEndpointMapping('M11', { id: 'return', stops: [{ id: 'metro-stop:osm:13952092131' }, { id: 'metro-stop:osm:11568561815' }] })).toMatchObject({ sourceFrom: 'Halkalı', sourceTo: 'Gayrettepe' });
  });

  it('rejects unknown directions and changed static endpoints', () => {
    expect(() => tcddEndpointMapping('B1', { id: 'branch', stops: [] })).toThrow(/eşlemesi bulunamadı/);
    expect(() => tcddEndpointMapping('B1', { id: 'outbound', stops: [{ id: 'wrong' }, { id: 'rail-stop:osm:7716752898' }] })).toThrow(/uyuşmuyor/);
  });
});
