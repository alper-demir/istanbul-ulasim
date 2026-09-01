import { describe, expect, it } from 'vitest';
import { parseFerrySchedule } from '@/scripts/ferry-schedule-parser.mjs';

const directions = [
  { id: 'outbound', name: 'Kabataş → Büyükada', stops: [{ id: 'kabatas', name: 'Kabataş' }, { id: 'kadikoy', name: 'Kadıköy' }, { id: 'buyukada', name: 'Büyükada' }] },
  { id: 'return', name: 'Büyükada → Kabataş', stops: [{ id: 'buyukada', name: 'Büyükada' }, { id: 'kadikoy', name: 'Kadıköy' }, { id: 'kabatas', name: 'Kabataş' }] },
];

const fixture = `
<div class="table-responsive table-going"><table><tbody>
<tr><td class="table-head">Hafta İçi ve Cumartesi Günleri</td></tr>
<tr><td>Kabataş</td><td>Kadıköy</td><td>Büyükada</td></tr>
<tr><td>23:30</td><td>23:55</td><td>00:30 *</td></tr>
</tbody></table></div>
<div class="table-responsive table-return"><table><tbody>
<tr><td class="table-head">Pazar ve Tatil Günleri</td></tr>
<tr><td>Büyükada</td><td>Kadıköy</td><td>Kabataş</td></tr>
<tr><td>06:00</td><td>06:35</td><td>07:00</td></tr>
</tbody></table></div>
<div id="tab2"></div>`;

describe('Şehir Hatları schedule parser', () => {
  it('parses both directions, day types and after-midnight calls', () => {
    const parsed = parseFerrySchedule(fixture, directions, 'ferry:177');
    expect(parsed.dayTypes.map((item: { id:string }) => item.id)).toEqual(['weekday-saturday', 'sunday-holiday']);
    expect(parsed.directions[0].patterns[0].journeys[0].calls.map((call: { time:string }) => call.time)).toEqual(['23:30', '23:55', '24:30']);
    expect(parsed.directions[0].patterns[0].journeys[0].calls[2].marker).toBe('*');
    expect(parsed.unmatchedHeaders).toEqual([]);
  });

  it('reports station headings that cannot be matched to route stops', () => {
    const changed = fixture.replace('Büyükada</td></tr>', 'Burgazada</td></tr>');
    const parsed = parseFerrySchedule(changed, directions, 'ferry:177');
    expect(parsed.unmatchedHeaders).toContainEqual({ directionId: 'outbound', header: 'Burgazada' });
  });
});
