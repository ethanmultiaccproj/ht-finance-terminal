const CACHE_MS = 45_000;
const cache = new Map();

export class MarketDataError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MarketDataError';
    this.code = options.code || 'MARKET_DATA_ERROR';
    this.cause = options.cause;
  }
}

function readCache(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.savedAt < CACHE_MS) return item.value;
  cache.delete(key);
  return null;
}

function writeCache(key, value) {
  cache.set(key, { value, savedAt: Date.now() });
  return value;
}

async function requestMarketData(supabase, body, cacheKey) {
  const cached = readCache(cacheKey);
  if (cached) return cached;
  if (!supabase) {
    throw new MarketDataError('Sign in and connect the market-data function to load exchange prices.', { code: 'NO_SESSION' });
  }
  const { data, error } = await supabase.functions.invoke('market-data', { body });
  if (error) {
    const message = error.message || 'The market-data service is not responding.';
    throw new MarketDataError(
      /function|404|not found/i.test(message)
        ? 'The market-data function is not deployed yet. Open Setup for the free IEX connection steps.'
        : message,
      { cause: error, code: 'EDGE_FUNCTION_UNAVAILABLE' },
    );
  }
  if (!data?.ok) {
    throw new MarketDataError(data?.error || 'The market-data service returned an invalid response.', {
      code: data?.code || 'INVALID_RESPONSE',
    });
  }
  return writeCache(cacheKey, data);
}

export async function loadSnapshots(supabase, symbols) {
  const list = [...new Set(symbols.map((symbol) => String(symbol).toUpperCase()))].slice(0, 40).sort();
  if (!list.length) return { feed: 'iex', quotes: {}, receivedAt: new Date().toISOString() };
  return requestMarketData(supabase, { action: 'snapshots', symbols: list }, `snapshots:${list.join(',')}`);
}

export async function loadBars(supabase, symbol, range = '1M') {
  const normalized = String(symbol).toUpperCase();
  const timeframeByRange = { '1D': '5Min', '1W': '15Min', '1M': '1Hour', '3M': '1Day', '1Y': '1Day', '5Y': '1Day' };
  const timeframe = timeframeByRange[range] || '1Day';
  const limitByRange = { '1D': 200, '1W': 200, '1M': 240, '3M': 100, '1Y': 260, '5Y': 1000 };
  return requestMarketData(
    supabase,
    { action: 'bars', symbol: normalized, timeframe, limit: limitByRange[range] || 240, range },
    `bars:${normalized}:${range}`,
  );
}

export function clearMarketCache() {
  cache.clear();
}
