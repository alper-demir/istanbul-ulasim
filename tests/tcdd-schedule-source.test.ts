import { describe, expect, it } from 'vitest';
import { extractApiDepartureTimes } from '../scripts/tcdd-schedule-source.mjs';

describe('TCDD API sefer kaynağı', () => {
  it('yönü açık istasyon kodlarıyla filtreler ve ilk/son saati sıralar', () => {
    expect(extractApiDepartureTimes([
      { originStation: 'Halkalı', destinationStation: 'Gebze', originTime: '06:00:00' },
      { originStation: 'Halkalı', destinationStation: 'Gebze', originTime: '05:45:00' },
      { originStation: 'Gebze', destinationStation: 'Halkalı', originTime: '05:30:00' },
    ], { sourceFrom: 'Halkalı', sourceTo: 'Gebze' })).toEqual(['05:45', '06:00']);
  });

  it('boş, hatalı veya yanlış yön verisini reddeder', () => {
    expect(() => extractApiDepartureTimes([{ originStation: 'Halkalı', destinationStation: 'Gebze', originTime: 'bozuk' }], { sourceFrom: 'Halkalı', sourceTo: 'Gebze' })).toThrow(/doğrulanmış kalkış/);
  });
});
