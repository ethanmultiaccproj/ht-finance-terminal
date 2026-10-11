export const INSTRUMENTS = [
  ['SPY', 'SPDR S&P 500 ETF', 'Index ETF', 'NYSE Arca'],
  ['QQQ', 'Invesco QQQ Trust', 'Index ETF', 'NASDAQ'],
  ['DIA', 'SPDR Dow Jones ETF', 'Index ETF', 'NYSE Arca'],
  ['IWM', 'iShares Russell 2000 ETF', 'Index ETF', 'NYSE Arca'],
  ['VTI', 'Vanguard Total Market ETF', 'Index ETF', 'NYSE Arca'],
  ['AAPL', 'Apple Inc.', 'Technology', 'NASDAQ'],
  ['MSFT', 'Microsoft Corp.', 'Technology', 'NASDAQ'],
  ['NVDA', 'NVIDIA Corp.', 'Semiconductors', 'NASDAQ'],
  ['AMZN', 'Amazon.com Inc.', 'Consumer', 'NASDAQ'],
  ['GOOGL', 'Alphabet Inc. Class A', 'Communication', 'NASDAQ'],
  ['META', 'Meta Platforms Inc.', 'Communication', 'NASDAQ'],
  ['TSLA', 'Tesla Inc.', 'Automotive', 'NASDAQ'],
  ['AVGO', 'Broadcom Inc.', 'Semiconductors', 'NASDAQ'],
  ['ORCL', 'Oracle Corp.', 'Technology', 'NYSE'],
  ['CRM', 'Salesforce Inc.', 'Technology', 'NYSE'],
  ['AMD', 'Advanced Micro Devices', 'Semiconductors', 'NASDAQ'],
  ['QCOM', 'Qualcomm Inc.', 'Semiconductors', 'NASDAQ'],
  ['JPM', 'JPMorgan Chase & Co.', 'Financials', 'NYSE'],
  ['BRK.B', 'Berkshire Hathaway Class B', 'Financials', 'NYSE'],
  ['V', 'Visa Inc.', 'Financials', 'NYSE'],
  ['MA', 'Mastercard Inc.', 'Financials', 'NYSE'],
  ['GS', 'Goldman Sachs Group', 'Financials', 'NYSE'],
  ['WFC', 'Wells Fargo & Co.', 'Financials', 'NYSE'],
  ['XOM', 'Exxon Mobil Corp.', 'Energy', 'NYSE'],
  ['CVX', 'Chevron Corp.', 'Energy', 'NYSE'],
  ['LLY', 'Eli Lilly & Co.', 'Healthcare', 'NYSE'],
  ['JNJ', 'Johnson & Johnson', 'Healthcare', 'NYSE'],
  ['UNH', 'UnitedHealth Group', 'Healthcare', 'NYSE'],
  ['COST', 'Costco Wholesale Corp.', 'Consumer', 'NASDAQ'],
  ['WMT', 'Walmart Inc.', 'Consumer', 'NYSE'],
  ['HD', 'Home Depot Inc.', 'Consumer', 'NYSE'],
  ['MCD', "McDonald's Corp.", 'Consumer', 'NYSE'],
  ['NFLX', 'Netflix Inc.', 'Communication', 'NASDAQ'],
  ['DIS', 'Walt Disney Co.', 'Communication', 'NYSE'],
  ['UBER', 'Uber Technologies Inc.', 'Industrials', 'NYSE'],
  ['CAT', 'Caterpillar Inc.', 'Industrials', 'NYSE'],
  ['GE', 'GE Aerospace', 'Industrials', 'NYSE'],
  ['BA', 'Boeing Co.', 'Industrials', 'NYSE'],
  ['NKE', 'Nike Inc.', 'Consumer', 'NYSE'],
  ['KO', 'Coca-Cola Co.', 'Consumer', 'NYSE'],
  ['PEP', 'PepsiCo Inc.', 'Consumer', 'NASDAQ'],
  ['ADBE', 'Adobe Inc.', 'Technology', 'NASDAQ'],
  ['INTC', 'Intel Corp.', 'Semiconductors', 'NASDAQ'],
  ['CSCO', 'Cisco Systems Inc.', 'Technology', 'NASDAQ'],
  ['PLTR', 'Palantir Technologies Inc.', 'Technology', 'NASDAQ'],
  ['PANW', 'Palo Alto Networks Inc.', 'Technology', 'NASDAQ'],
  ['T', 'AT&T Inc.', 'Communication', 'NYSE'],
  ['TLT', 'iShares 20+ Year Treasury ETF', 'Rates', 'NASDAQ'],
  ['IEF', 'iShares 7-10 Year Treasury ETF', 'Rates', 'NASDAQ'],
  ['GLD', 'SPDR Gold Shares', 'Commodities', 'NYSE Arca'],
  ['SLV', 'iShares Silver Trust', 'Commodities', 'NYSE Arca'],
  ['USO', 'United States Oil Fund', 'Commodities', 'NYSE Arca'],
  ['XLF', 'Financial Select Sector SPDR', 'Sector ETF', 'NYSE Arca'],
  ['XLK', 'Technology Select Sector SPDR', 'Sector ETF', 'NYSE Arca'],
  ['XLE', 'Energy Select Sector SPDR', 'Sector ETF', 'NYSE Arca'],
  ['XLV', 'Health Care Select Sector SPDR', 'Sector ETF', 'NYSE Arca'],
  ['SMH', 'VanEck Semiconductor ETF', 'Sector ETF', 'NASDAQ'],
  ['ARKK', 'ARK Innovation ETF', 'Thematic ETF', 'NYSE Arca'],
  ['EEM', 'iShares MSCI Emerging Markets ETF', 'International ETF', 'NYSE Arca'],
  ['GLDM', 'SPDR Gold MiniShares Trust', 'Commodities', 'NYSE Arca'],
];

export const INSTRUMENT_BY_SYMBOL = new Map(
  INSTRUMENTS.map(([symbol, name, sector, exchange]) => [symbol, { symbol, name, sector, exchange }]),
);

export const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'JPM', 'TLT', 'GLD', 'XOM'];

export function findInstruments(query = '') {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return INSTRUMENTS.slice(0, 12).map(toInstrument);
  return INSTRUMENTS
    .filter(([symbol, name, sector]) => `${symbol} ${name} ${sector}`.toUpperCase().includes(normalized))
    .slice(0, 16)
    .map(toInstrument);
}

export function toInstrument([symbol, name, sector, exchange]) {
  return { symbol, name, sector, exchange };
}

export function instrument(symbol) {
  return INSTRUMENT_BY_SYMBOL.get(String(symbol || '').toUpperCase())
    || { symbol: String(symbol || '').toUpperCase(), name: 'Listed security', sector: 'Unclassified', exchange: 'US' };
}

export function cleanSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw new Error('Use a valid ticker, such as NVDA or BRK.B.');
  return symbol;
}
