const REFERENCE = {
  SPY: 542, QQQ: 466, DIA: 421, IWM: 215, VTI: 299,
  AAPL: 227, MSFT: 514, NVDA: 138, AMZN: 224, GOOGL: 176, META: 712, TSLA: 337,
  AVGO: 181, ORCL: 243, CRM: 252, AMD: 161, QCOM: 167, JPM: 286, 'BRK.B': 513,
  V: 335, MA: 515, GS: 715, WFC: 79, XOM: 112, CVX: 158, LLY: 797, JNJ: 159,
  UNH: 583, COST: 958, WMT: 102, HD: 390, MCD: 308, NFLX: 1210, DIS: 112,
  UBER: 92, CAT: 398, GE: 264, BA: 201, NKE: 79, KO: 70, PEP: 168, ADBE: 403,
  INTC: 35, CSCO: 69, PLTR: 146, PANW: 198, T: 22, TLT: 91, IEF: 95, GLD: 300,
  SLV: 28, USO: 75, XLF: 52, XLK: 229, XLE: 89, XLV: 145, SMH: 286, ARKK: 62,
  EEM: 47, GLDM: 64,
};

function seedFor(symbol) {
  return [...symbol].reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
}

function randomFor(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTrainingBars(symbol, count = 260, interval = '1Day') {
  const normalized = String(symbol).toUpperCase();
  if (interval !== '1Day') return generateIntradayBars(normalized, count, interval);
  const random = randomFor(seedFor(normalized));
  const base = REFERENCE[normalized] || 80 + (seedFor(normalized) % 320);
  const bars = [];
  let close = base * (0.83 + random() * 0.24);
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - count * 1.48);

  while (bars.length < count) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const drift = (random() - 0.49) * 0.028;
    const open = close;
    close = Math.max(0.25, open * (1 + drift));
    const spread = open * (0.003 + random() * 0.012);
    const high = Math.max(open, close) + random() * spread;
    const low = Math.max(0.01, Math.min(open, close) - random() * spread);
    bars.push({
      time: Math.floor(day.getTime() / 1000),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(500_000 + random() * 9_500_000),
    });
  }
  return bars;
}

function generateIntradayBars(symbol, count, interval) {
  const stepMinutes = interval === '5Min' ? 5 : interval === '15Min' ? 15 : 60;
  const barsPerSession = Math.floor(390 / stepMinutes);
  const sessionsNeeded = Math.ceil(count / barsPerSession) + 1;
  const random = randomFor(seedFor(`${symbol}:${interval}`));
  const base = REFERENCE[symbol] || 80 + (seedFor(symbol) % 320);
  const sessionDates = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; sessionDates.length < sessionsNeeded && offset < 90; offset += 1) {
    const date = new Date(cursor);
    date.setUTCDate(cursor.getUTCDate() - offset);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) sessionDates.unshift(date);
  }

  let previousClose = base * (0.83 + random() * 0.24);
  const bars = [];
  for (const date of sessionDates) {
    const opening = previousClose * (1 + (random() - 0.5) * 0.01);
    let close = opening;
    for (let minute = 0; minute < 390; minute += stepMinutes) {
      const open = close;
      close = Math.max(0.25, open * (1 + (random() - 0.49) * (interval === '1Hour' ? 0.007 : 0.002)));
      const spread = open * (0.0008 + random() * 0.0025);
      const timestamp = new Date(date);
      timestamp.setUTCHours(13, 30 + minute, 0, 0);
      bars.push({
        time: Math.floor(timestamp.getTime() / 1000),
        open: round(open),
        high: round(Math.max(open, close) + random() * spread),
        low: round(Math.max(0.01, Math.min(open, close) - random() * spread)),
        close: round(close),
        volume: Math.round(20_000 + random() * 700_000),
      });
    }
    previousClose = close;
  }
  return bars.slice(-count);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function trainingSnapshot(symbol, bars = generateTrainingBars(symbol, 2)) {
  const prior = bars.at(-2) || bars.at(-1);
  const current = bars.at(-1);
  const change = current.close - prior.close;
  return {
    symbol: String(symbol).toUpperCase(),
    price: current.close,
    change,
    changePercent: prior.close ? (change / prior.close) * 100 : 0,
    open: current.open,
    high: current.high,
    low: current.low,
    previousClose: prior.close,
    volume: current.volume,
    timestamp: new Date(current.time * 1000).toISOString(),
    feed: 'training-sim',
  };
}

export function trainingSnapshots(symbols) {
  return Object.fromEntries(symbols.map((symbol) => [symbol, trainingSnapshot(symbol)]));
}
