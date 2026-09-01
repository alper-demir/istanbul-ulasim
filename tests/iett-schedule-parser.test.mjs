import { describe, expect, it } from 'vitest';
import { parseIettScheduleTables } from '../scripts/iett-schedule-parser.mjs';

const directions = [
  { id: 'outbound', name: 'Başlangıç → Bitiş', stops: [{ id: 'start', name: 'Başlangıç' }, { id: 'end', name: 'Bitiş' }] },
  { id: 'return', name: 'Bitiş → Başlangıç', stops: [{ id: 'end', name: 'Bitiş' }, { id: 'start', name: 'Başlangıç' }] },
];

describe('IETT schedule table parser', () => {
  it('retains direction, day types and the official ÖHO marker', () => {
    const payload = parseIettScheduleTables(`
      <table class="line-table"><thead><tr><th colspan="3">BAŞLANGIÇ KALKIŞ</th></tr><tr><th>İş Günleri</th><th>Cumartesi</th><th>Pazar</th></tr></thead>
      <tbody><tr><td>04:10</td><td style="color:red;">04:20 (-1)</td><td>04:30</td></tr></tbody></table>
      <table class="line-table"><thead><tr><th colspan="3">BİTİŞ KALKIŞ</th></tr><tr><th>İş Günleri</th><th>Cumartesi</th><th>Pazar</th></tr></thead>
      <tbody><tr><td>05:10</td><td>05:20</td><td>05:30</td></tr></tbody></table>`, 'iett:example', directions);
    expect(payload.dayTypes.map((item) => item.id)).toEqual(['weekday', 'saturday', 'sunday']);
    expect(payload.directions.map((item) => item.directionId)).toEqual(['outbound', 'return']);
    expect(payload.directions[0].patterns[1].journeys[0].calls[0]).toMatchObject({ stopId: 'start', time: '04:20', marker: 'ÖHO · (-1)' });
  });

  it('rejects a table whose departure stop cannot be tied to the static route', () => {
    expect(() => parseIettScheduleTables('<table class="line-table"><tr><th>Başka Yer Kalkış</th></tr><tr><th>İş Günleri</th></tr><tr><td>04:10</td></tr></table>', 'iett:example', directions)).toThrow(/eşleşmedi/);
  });

  it('maps an official terminal label to the first static stop when the route uses a terminal area name', () => {
    const payload = parseIettScheduleTables(`
      <table class="line-table"><thead><tr><th>SEYRANTEPE KALKIŞ</th></tr><tr><th>İş Günleri</th></tr></thead>
      <tbody><tr><td>05:30</td></tr></tbody></table>
      <table class="line-table"><thead><tr><th>BİTİŞ KALKIŞ</th></tr><tr><th>İş Günleri</th></tr></thead>
      <tbody><tr><td>06:00</td></tr></tbody></table>`, 'iett:terminal-label', [
      { id: 'outbound', name: 'Seyrantepe → Bitiş', stops: [{ id: 'first', name: 'Mescid-i Nur Camii' }, { id: 'last', name: 'Bitiş' }] },
      { id: 'return', name: 'Bitiş → Seyrantepe', stops: [{ id: 'last', name: 'Bitiş' }, { id: 'first', name: 'Mescid-i Nur Camii' }] },
    ]);
    expect(payload.directions[0].patterns[0].journeys[0].calls[0]).toMatchObject({ stopId: 'first', time: '05:30' });
  });
});
