/**
 * Builds an illustrative depth ladder around a displayed mark. This adapts the
 * synthetic ladder model from maddoxk/frontend-trading-dashboard (MIT); see
 * third-party/frontend-trading-dashboard-LICENSE.txt.
 *
 * These levels and sizes are generated locally. They are never exchange depth.
 */
export function buildOrderBook(symbol, mid, depth = 10) {
  const midpoint = Number(mid);
  if (!Number.isFinite(midpoint) || midpoint <= 0) {
    throw new TypeError('A positive finite midpoint is required.');
  }

  const levelCount = Math.min(40, Math.max(1, Math.floor(Number(depth) || 10)));
  const tick = Math.max(0.01, Math.round(midpoint * 0.0002 * 100) / 100);
  const random = seededRandom(hashSeed(`${symbol}:${midpoint.toFixed(4)}`));
  const bids = [];
  const asks = [];
  let bidTotal = 0;
  let askTotal = 0;

  for (let index = 0; index < levelCount; index += 1) {
    const decay = Math.exp(-index * 0.18);
    const baseSize = 50 + 950 * decay;
    const bidSize = Math.round(baseSize * (0.6 + 0.8 * random()));
    const askSize = Math.round(baseSize * (0.6 + 0.8 * random()));
    const bidPrice = roundPrice(Math.max(0.01, midpoint - tick * (index + 0.5)));
    const askPrice = roundPrice(midpoint + tick * (index + 0.5));

    bidTotal += bidSize;
    askTotal += askSize;
    bids.push({ price: bidPrice, size: bidSize, total: bidTotal });
    asks.push({ price: askPrice, size: askSize, total: askTotal });
  }

  const bestBid = bids[0]?.price ?? midpoint;
  const bestAsk = asks[0]?.price ?? midpoint;
  return {
    symbol,
    bids,
    asks,
    spread: roundPrice(Math.max(0, bestAsk - bestBid)),
    midPrice: roundPrice((bestAsk + bestBid) / 2),
  };
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function roundPrice(value) {
  return Math.round(value * 100) / 100;
}
