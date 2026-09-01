type SearchableRoute = { code:string; name:string };
type SearchableStop = { name:string; district:string };

const aliases: Record<string, string[]> = {
  kadikoy: ['kadikoy', 'kadıköy'],
  besiktas: ['besiktas', 'beşiktaş'],
  uskudar: ['uskudar', 'üsküdar'],
  sisli: ['sisli', 'şişli'],
};

export function normalizeTransitSearch(value: string) {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replaceAll('ı', 'i').replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value: string) {
  return normalizeTransitSearch(value).split(' ').filter(Boolean);
}

function expands(token: string) {
  return aliases[token] ?? [token];
}

function matchesTokens(haystack: string, queryTokens: string[]) {
  return queryTokens.every((token) => expands(token).some((candidate) => haystack.includes(candidate)));
}

function textScore(haystack: string, query: string, queryTokens: string) {
  if (haystack === query) return 4_000;
  if (haystack.startsWith(query)) return 3_000;
  if (haystack.includes(query)) return 2_000;
  return queryTokens.split(' ').reduce((score, token) => score + (haystack.includes(token) ? 100 : 0), 0);
}

export function rankRouteMatches<T extends SearchableRoute>(routes: T[], query: string) {
  const normalizedQuery = normalizeTransitSearch(query);
  const queryTokens = tokens(query);
  if (!normalizedQuery) return routes;
  return routes.map((route) => {
    const code = normalizeTransitSearch(route.code).replaceAll(' ', '');
    const name = normalizeTransitSearch(route.name);
    if (!matchesTokens(`${code} ${name}`, queryTokens)) return null;
    const score = code === normalizedQuery.replaceAll(' ', '') ? 10_000
      : code.startsWith(normalizedQuery.replaceAll(' ', '')) ? 9_000
        : textScore(name, normalizedQuery, queryTokens.join(' '));
    return { route, score };
  }).filter((item): item is { route:T; score:number } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.route.code.localeCompare(right.route.code, 'tr'))
    .map(({ route }) => route);
}

export function rankStopMatches<T extends SearchableStop>(stops: T[], query: string, limit = 20) {
  const normalizedQuery = normalizeTransitSearch(query);
  const queryTokens = tokens(query);
  if (normalizedQuery.length < 2) return [];
  return stops.map((stop) => {
    const name = normalizeTransitSearch(stop.name);
    const district = normalizeTransitSearch(stop.district);
    if (!matchesTokens(`${name} ${district}`, queryTokens)) return null;
    return { stop, score: textScore(name, normalizedQuery, queryTokens.join(' ')) + Math.min(500, textScore(district, normalizedQuery, queryTokens.join(' ')) / 10) };
  }).filter((item): item is { stop:T; score:number } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.stop.name.localeCompare(right.stop.name, 'tr'))
    .slice(0, limit).map(({ stop }) => stop);
}
