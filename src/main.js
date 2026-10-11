import { mountPriceChart } from './components/price-chart.js';
import { DEFAULT_WATCHLIST, cleanSymbol, findInstruments, instrument } from './data/universe.js';
import { escapeHtml as h, formatMoney, formatTime } from './lib/format.js';
import { calculatePortfolio } from './lib/portfolio.js';
import { backendConfigured, supabase } from './lib/supabase.js';
import { loadBars, loadSnapshots, MarketDataError } from './services/market-data.js';
import { generateTrainingBars, trainingSnapshots } from './services/training-market.js';
import { renderApplication } from './views/terminal-pages.js';

const app = document.querySelector('#app');
const ROUTES = new Set(['overview', 'markets', 'proposals', 'portfolio', 'activity', 'manager', 'members', 'setup']);
const STARTING_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'GLD', 'AAPL', 'NVDA'];
const RANGE_CONFIG = {
  '1D': { interval: '5Min', count: 78 },
  '1W': { interval: '15Min', count: 130 },
  '1M': { interval: '1Hour', count: 140 },
  '3M': { interval: '1Day', count: 65 },
  '1Y': { interval: '1Day', count: 260 },
  '5Y': { interval: '1Day', count: 1000 },
};

const state = {
  user: null,
  role: 'visitor',
  route: 'overview',
  symbol: 'SPY',
  chartRange: '1M',
  proposalFilter: 'all',
  proposalSymbol: '',
  watchlist: loadWatchlist(null),
  proposals: [],
  trades: [],
  members: [],
  pendingCount: 0,
  searchOpen: false,
  searchQuery: '',
  notice: null,
  loadError: '',
  clock: '',
  showSma20: false,
  showSma50: false,
  market: {
    source: 'training-sim',
    chartSource: 'training-sim',
    quotes: new Map(),
    bars: [],
    asOf: null,
    error: '',
    loading: false,
    loadingBars: false,
    lastRefreshAt: 0,
  },
};

let chartCleanup = () => {};
let marketRequestInFlight = false;
let chartRequestNumber = 0;
let noticeTimer = null;

function hashState() {
  const [path = '', query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const route = ROUTES.has(path) ? path : 'overview';
  try {
    if (params.has('symbol')) state.symbol = cleanSymbol(params.get('symbol'));
  } catch {
    // An invalid link falls back to the last selected symbol.
  }
  if (params.has('range') && RANGE_CONFIG[params.get('range')]) state.chartRange = params.get('range');
  state.route = route;
}

function setHash(route, params = {}) {
  const query = new URLSearchParams();
  if (route === 'markets' && params.symbol) query.set('symbol', params.symbol);
  if (route === 'markets' && params.range && params.range !== '1M') query.set('range', params.range);
  const next = `#${route}${query.size ? `?${query}` : ''}`;
  if (location.hash === next) {
    hashState();
    render();
    return;
  }
  location.hash = next;
}

function storageKey(userId) {
  return `ht-terminal-watchlist:${userId || 'device'}`;
}

function loadWatchlist(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
    if (Array.isArray(value)) return [...new Set(value.filter((symbol) => /^[A-Z0-9.-]{1,12}$/.test(symbol)))].slice(0, 30);
  } catch {
    // Local preferences are optional; use the desk defaults if storage is unavailable.
  }
  return [...DEFAULT_WATCHLIST];
}

function saveWatchlist() {
  try {
    localStorage.setItem(storageKey(state.user?.id || null), JSON.stringify(state.watchlist));
  } catch {
    setNotice('Watchlist changes are active for this session but browser storage is unavailable.', 'info');
  }
}

function render() {
  if (!app) return;
  const active = document.activeElement;
  const activeId = active?.id;
  const activeValue = active && 'value' in active ? active.value : null;
  let selection = null;
  try {
    if (active && typeof active.selectionStart === 'number') selection = [active.selectionStart, active.selectionEnd];
  } catch {
    // Some browser controls do not expose a text selection.
  }

  chartCleanup();
  app.innerHTML = renderApplication(state);

  if (activeId) {
    const next = document.getElementById(activeId);
    if (next) {
      if (activeValue !== null) next.value = activeValue;
      next.focus({ preventScroll: true });
      if (selection && typeof next.setSelectionRange === 'function') {
        try { next.setSelectionRange(...selection); } catch { /* no-op */ }
      }
    }
  }

  if (state.route === 'markets') {
    chartCleanup = mountPriceChart(document.querySelector('#price-chart'), state.market.bars, {
      quote: state.market.quotes.get(state.symbol),
      range: state.chartRange,
      showSma20: state.showSma20,
      showSma50: state.showSma50,
      readout: document.querySelector('#chart-crosshair-readout'),
    });
  }
}

function setNotice(message, type = 'info') {
  clearTimeout(noticeTimer);
  state.notice = { message, type };
  render();
  noticeTimer = setTimeout(() => {
    state.notice = null;
    render();
  }, 5200);
}

function updateClock() {
  state.clock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const target = document.querySelector('.market-clock');
  if (target) target.innerHTML = `<i class="clock-dot"></i> NY ${h(state.clock)}`;
}

async function signIn() {
  if (!supabase) {
    setNotice('Google sign-in is not configured for this build. Add the Supabase Actions variables and rebuild.', 'error');
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) setNotice(error.message, 'error');
}

async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) setNotice(error.message, 'error');
}

async function loadClubData() {
  state.loadError = '';
  if (!supabase || !state.user) {
    state.role = 'visitor';
    state.proposals = [];
    state.trades = [];
    state.members = [];
    state.pendingCount = 0;
    render();
    return;
  }

  const memberResult = await supabase.from('members').select('role').eq('id', state.user.id).maybeSingle();
  if (memberResult.error) {
    state.role = 'pending';
    state.proposals = [];
    state.trades = [];
    state.members = [];
    state.pendingCount = 0;
    state.loadError = `Could not verify club access: ${memberResult.error.message}`;
    render();
    return;
  }
  state.role = memberResult.data?.role || 'pending';
  if (state.role === 'pending') {
    state.proposals = [];
    state.trades = [];
    state.members = [];
    state.pendingCount = 0;
    render();
    return;
  }

  const [proposalResult, tradeResult] = await Promise.all([
    supabase.from('proposals').select('*').order('created_at', { ascending: false }).limit(250),
    supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(1000),
  ]);
  const readError = proposalResult.error || tradeResult.error;
  if (readError) {
    state.loadError = `The club ledger could not load: ${readError.message}`;
    state.proposals = [];
    state.trades = [];
    state.members = [];
    render();
    return;
  }
  state.proposals = proposalResult.data || [];
  state.trades = tradeResult.data || [];
  state.pendingCount = state.proposals.filter((proposal) => proposal.status === 'pending').length;

  if (state.role === 'manager') {
    const membersResult = await supabase.rpc('list_club_members');
    if (membersResult.error) {
      state.members = [];
      state.loadError = `The manager roster could not load: ${membersResult.error.message}`;
    } else {
      state.members = membersResult.data || [];
    }
  } else {
    state.members = [];
  }
  if (state.route === 'members' && state.role !== 'manager') setHash('overview');
  if (state.route === 'manager' && state.role !== 'manager') setHash('overview');
  render();
}

function allMarketSymbols() {
  const positions = state.user ? calculatePortfolio(state.trades, state.user.id).positions.map((position) => position.symbol) : [];
  return [...new Set([...STARTING_SYMBOLS, ...state.watchlist, state.symbol, ...positions])].slice(0, 40);
}

function setTrainingMarket(symbols = allMarketSymbols()) {
  state.market.source = 'training-sim';
  state.market.quotes = new Map(Object.entries(trainingSnapshots(symbols)));
  state.market.asOf = null;
}

async function refreshMarketData(options = {}) {
  if (marketRequestInFlight) return;
  marketRequestInFlight = true;
  state.market.loading = true;
  const symbols = allMarketSymbols();
  if (!state.user || !backendConfigured) {
    setTrainingMarket(symbols);
    state.market.error = !backendConfigured ? 'Supabase is not configured in this build.' : 'Sign in and activate club membership to connect the shared feed.';
    state.market.loading = false;
    state.market.lastRefreshAt = Date.now();
    marketRequestInFlight = false;
    if (state.route === 'markets') await loadChartBars({ silent: true });
    else render();
    return;
  }

  try {
    const result = await loadSnapshots(supabase, symbols);
    state.market.quotes = new Map(Object.entries(result.quotes || {}));
    state.market.source = 'iex';
    state.market.asOf = result.receivedAt || new Date().toISOString();
    state.market.error = '';
  } catch (error) {
    setTrainingMarket(symbols);
    state.market.error = error instanceof MarketDataError ? error.message : String(error?.message || error);
  }
  state.market.loading = false;
  state.market.lastRefreshAt = Date.now();
  marketRequestInFlight = false;
  if (state.route === 'markets') await loadChartBars({ silent: true });
  else render();
}

async function loadChartBars(options = {}) {
  const requestNumber = ++chartRequestNumber;
  const symbol = state.symbol;
  const range = state.chartRange;
  const config = RANGE_CONFIG[range] || RANGE_CONFIG['1M'];
  state.market.loadingBars = true;
  if (!options.silent && state.route === 'markets') render();

  if (state.market.source === 'iex' && supabase && state.role !== 'pending') {
    try {
      const result = await loadBars(supabase, symbol, range);
      if (requestNumber !== chartRequestNumber || symbol !== state.symbol || range !== state.chartRange) return;
      state.market.bars = result.bars || [];
      state.market.chartSource = 'iex';
      if (!state.market.bars.length) state.market.error = `No ${range} history returned for ${symbol}.`;
    } catch (error) {
      if (requestNumber !== chartRequestNumber) return;
      state.market.bars = generateTrainingBars(symbol, config.count, config.interval);
      state.market.chartSource = 'training-sim';
      state.market.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    state.market.bars = generateTrainingBars(symbol, config.count, config.interval);
    state.market.chartSource = 'training-sim';
  }
  state.market.loadingBars = false;
  if (state.route === 'markets') render();
}

function navigateToSymbol(value) {
  let symbol;
  try {
    symbol = cleanSymbol(value);
  } catch (error) {
    setNotice(error.message, 'error');
    return;
  }
  state.searchOpen = false;
  state.searchQuery = '';
  state.symbol = symbol;
  setHash('markets', { symbol, range: state.chartRange });
  void refreshMarketData({ silent: true });
}

function toggleWatchlist(symbol) {
  if (state.watchlist.includes(symbol)) {
    state.watchlist = state.watchlist.filter((item) => item !== symbol);
    setNotice(`${symbol} removed from your watchlist.`, 'info');
  } else if (state.watchlist.length >= 30) {
    setNotice('A watchlist can hold up to 30 securities.', 'error');
    return;
  } else {
    state.watchlist = [...state.watchlist, symbol];
    setNotice(`${symbol} added to your watchlist.`, 'success');
  }
  saveWatchlist();
  void refreshMarketData({ silent: true });
}

function openProposal(symbol = '') {
  if (!state.user) {
    setNotice('Sign in with Google before submitting a club proposal.', 'info');
    void signIn();
    return;
  }
  if (state.role === 'pending') {
    setNotice('A manager must activate your club membership before you can submit a thesis.', 'error');
    return;
  }
  state.proposalSymbol = symbol || state.symbol;
  const dialog = document.querySelector('#proposal-dialog');
  const input = dialog?.querySelector('[name="symbol"]');
  if (input) input.value = state.proposalSymbol;
  dialog?.showModal();
  input?.focus();
}

async function submitProposal(form) {
  if (!supabase || !state.user || !['intern', 'manager'].includes(state.role)) {
    setNotice('An active club role is required to submit a proposal.', 'error');
    return;
  }
  const fields = Object.fromEntries(new FormData(form));
  try {
    fields.symbol = cleanSymbol(fields.symbol);
  } catch (error) {
    setNotice(error.message, 'error');
    return;
  }
  fields.quantity = Number(fields.quantity);
  if (!Number.isFinite(fields.quantity) || fields.quantity <= 0) {
    setNotice('Enter a positive share quantity.', 'error');
    return;
  }
  if (String(fields.thesis || '').trim().length < 20 || !String(fields.risks || '').trim()) {
    setNotice('Write a thesis of at least 20 characters and name one material risk.', 'error');
    return;
  }
  const submit = form.querySelector('button[type="submit"], button:not([type])');
  if (submit) { submit.disabled = true; submit.textContent = 'Submitting…'; }
  const { error } = await supabase.from('proposals').insert({
    symbol: fields.symbol,
    side: fields.side,
    quantity: fields.quantity,
    thesis: String(fields.thesis).trim(),
    risks: String(fields.risks).trim(),
    author_id: state.user.id,
  });
  if (error) {
    if (submit) submit.disabled = false;
    setNotice(error.message, 'error');
    return;
  }
  document.querySelector('#proposal-dialog')?.close();
  form.reset();
  await loadClubData();
  setNotice('Thesis submitted to the manager review queue.', 'success');
}

async function reviewProposal(proposalId, decision) {
  if (!supabase || state.role !== 'manager') return setNotice('Manager access required.', 'error');
  const { error } = await supabase.rpc('review_proposal', { proposal_id: proposalId, decision });
  if (error) return setNotice(error.message, 'error');
  await loadClubData();
  setNotice(`Proposal ${decision}.`, 'success');
}

async function executeProposal(form) {
  if (!supabase || state.role !== 'manager') return setNotice('Manager access required.', 'error');
  const proposalId = form.dataset.proposal;
  const fillPrice = Number(new FormData(form).get('price'));
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) return setNotice('Enter a valid simulated fill price.', 'error');
  const button = form.querySelector('button');
  if (button) { button.disabled = true; button.textContent = 'Recording…'; }
  const { error } = await supabase.rpc('execute_proposal', { proposal_id: proposalId, fill_price: fillPrice });
  if (error) {
    if (button) button.disabled = false;
    return setNotice(error.message, 'error');
  }
  await loadClubData();
  setNotice('Paper fill recorded in the club ledger.', 'success');
}

async function assignRole(form) {
  if (!supabase || state.role !== 'manager') return setNotice('Manager access required.', 'error');
  const assignedRole = new FormData(form).get('role');
  const targetUserId = form.dataset.userId;
  const { error } = await supabase.rpc('set_member_role', { target_user_id: targetUserId, assigned_role: assignedRole });
  if (error) return setNotice(error.message, 'error');
  await loadClubData();
  setNotice(`Member role updated to ${assignedRole}.`, 'success');
}

function exportTrades() {
  const rows = [['created_at', 'symbol', 'side', 'quantity', 'price', 'notional', 'member', 'executed_by', 'proposal_id']];
  for (const trade of state.trades) {
    rows.push([trade.created_at, trade.symbol, trade.side, trade.quantity, trade.price, Number(trade.quantity) * Number(trade.price), memberLabel(trade.author_id), memberLabel(trade.executed_by), trade.proposal_id]);
  }
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `htic-paper-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function memberLabel(userId) {
  if (userId === state.user?.id) return 'You';
  const member = state.members.find((item) => item.user_id === userId);
  return member?.full_name || member?.email || String(userId || '');
}

function onAppClick(event) {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, symbol, range, indicator, proposal, decision, status } = control.dataset;
  switch (action) {
    case 'signin': void signIn(); break;
    case 'signout': void signOut(); break;
    case 'dismiss-notice': state.notice = null; render(); break;
    case 'select-symbol':
    case 'open-symbol': navigateToSymbol(symbol); break;
    case 'toggle-watch': toggleWatchlist(symbol); break;
    case 'remove-watch': toggleWatchlist(symbol); break;
    case 'open-proposal': openProposal(symbol || ''); break;
    case 'close-dialog': document.querySelector('#proposal-dialog')?.close(); break;
    case 'review-proposal': void reviewProposal(proposal, decision); break;
    case 'proposal-filter': state.proposalFilter = status; render(); break;
    case 'chart-range':
      state.chartRange = range;
      setHash('markets', { symbol: state.symbol, range });
      void loadChartBars();
      break;
    case 'toggle-indicator': state[indicator] = !state[indicator]; render(); break;
    case 'retry-data': void refreshMarketData(); break;
    case 'export-trades': exportTrades(); break;
    default: break;
  }
}

function onAppInput(event) {
  if (event.target.id === 'command-input') {
    state.searchQuery = event.target.value;
    state.searchOpen = true;
    render();
  }
}

function onAppSubmit(event) {
  const form = event.target;
  if (form.id === 'command-search') {
    event.preventDefault();
    const query = new FormData(form).get('query')?.trim() || '';
    if (!query) return;
    const match = findInstruments(query)[0];
    try {
      const symbol = match ? match.symbol : cleanSymbol(query);
      navigateToSymbol(symbol);
    } catch {
      setNotice(`No covered ticker matches “${query}”. Choose a result or use a valid US ticker.`, 'error');
    }
    return;
  }
  if (form.id === 'market-search') {
    event.preventDefault();
    navigateToSymbol(new FormData(form).get('symbol'));
    return;
  }
  if (form.dataset.form === 'proposal') {
    event.preventDefault();
    void submitProposal(form);
    return;
  }
  if (form.dataset.form === 'execute') {
    event.preventDefault();
    void executeProposal(form);
    return;
  }
  if (form.dataset.form === 'member-role') {
    event.preventDefault();
    void assignRole(form);
  }
}

function onHashChange() {
  const oldRoute = state.route;
  const oldSymbol = state.symbol;
  const oldRange = state.chartRange;
  hashState();
  state.searchOpen = false;
  state.searchQuery = '';
  render();
  if (state.route === 'markets' && (oldRoute !== 'markets' || oldSymbol !== state.symbol || oldRange !== state.chartRange)) {
    void loadChartBars();
  }
}

function onGlobalKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    state.searchOpen = true;
    render();
    document.querySelector('#command-input')?.focus();
  }
  if (event.key === 'Escape' && state.searchOpen) {
    state.searchOpen = false;
    render();
  }
}

async function initialize() {
  hashState();
  state.market.quotes = new Map(Object.entries(trainingSnapshots(allMarketSymbols())));
  state.clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  render();
  app.addEventListener('click', onAppClick);
  app.addEventListener('input', onAppInput);
  app.addEventListener('submit', onAppSubmit);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('keydown', onGlobalKeydown);
  updateClock();
  setInterval(updateClock, 15_000);

  if (!supabase) {
    state.market.error = 'Supabase is not configured in this build.';
    if (state.route === 'markets') await loadChartBars({ silent: true });
    render();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    state.loadError = `Sign-in session could not be read: ${error.message}`;
    render();
  }
  state.user = data?.session?.user || null;
  if (state.user) state.watchlist = loadWatchlist(state.user.id);
  await Promise.all([loadClubData(), refreshMarketData()]);
  if (state.route === 'markets') await loadChartBars({ silent: true });

  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user || null;
    const changed = state.user?.id !== nextUser?.id;
    state.user = nextUser;
    if (changed) {
      state.watchlist = loadWatchlist(state.user?.id || null);
      state.market.error = '';
      state.market.source = 'training-sim';
      setTrainingMarket(allMarketSymbols());
      render();
      void Promise.all([loadClubData(), refreshMarketData()]);
    }
  });

  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - state.market.lastRefreshAt > 75_000) {
      void refreshMarketData({ silent: true });
    }
  }, 25_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - state.market.lastRefreshAt > 60_000) {
      void refreshMarketData({ silent: true });
    }
  });
}

void initialize();
