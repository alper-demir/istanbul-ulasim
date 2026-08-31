import { describe, expect, it } from 'vitest';
import { parseIettLiveVehicleResponse } from '@/lib/data-sources/iett-live-vehicles';

const response = (payload: unknown) => `<GetHatOtoKonum_jsonResult>${JSON.stringify(payload).replaceAll('"', '&quot;')}</GetHatOtoKonum_jsonResult>`;

describe('IETT live response parsing', () => {
  it('normalizes valid Istanbul coordinates and discards malformed records', () => {
    const snapshot = parseIettLiveVehicleResponse(response([
      { kapino: 'B-42', boylam: '29,019', enlem: '41,043', hatkodu: '500T', son_konum_zamani: '2026-08-30 12:00:00' },
      { kapino: 'bad', boylam: '1', enlem: '1' },
    ]), '500T', new Date('2026-08-30T09:00:30.000Z'));

    expect(snapshot.vehicles).toHaveLength(1);
    expect(snapshot.vehicles[0]).toMatchObject({ doorCode: 'B-42', routeCode: '500T', coordinates: [29.019, 41.043], updatedSecondsAgo: 30 });
    expect(snapshot.fetchedAt).toBe('2026-08-30T09:00:30.000Z');
    expect(snapshot.discardedVehicleCount).toBe(1);
  });

  it('fails closed when the SOAP result is missing or not a list', () => {
    expect(() => parseIettLiveVehicleResponse('<xml/>', '500T')).toThrow('beklenen alanı içermiyor');
    expect(() => parseIettLiveVehicleResponse(response({ kapino: 'B-42' }), '500T')).toThrow('liste biçiminde değil');
  });
});
