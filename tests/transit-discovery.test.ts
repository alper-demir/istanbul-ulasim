import { describe, expect, it } from 'vitest';
import { normalizeTransitSearch, rankRouteMatches, rankStopMatches } from '@/lib/transit-discovery';

describe('transit discovery ranking', () => {
  it('normalizes Turkish characters and ranks an exact route code first', () => {
    expect(normalizeTransitSearch('Üsküdar — Şişli')).toBe('uskudar sisli');
    expect(rankRouteMatches([{ code:'500T', name:'Tuzla — Cevizlibağ' }, { code:'50T', name:'Alibeyköy — Taksim' }], '500t')[0]?.code).toBe('500T');
  });

  it('matches route and stop tokens regardless of separators or word order in the source', () => {
    expect(rankRouteMatches([{ code:'15F', name:'Beykoz — Kadıköy' }], 'kadikoy beykoz')).toHaveLength(1);
    expect(rankStopMatches([{ name:'Beşiktaş Meydan', district:'Beşiktaş' }, { name:'Kadıköy Rıhtım', district:'Kadıköy' }], 'besiktas meydan')).toHaveLength(1);
  });
});
