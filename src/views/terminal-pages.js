import { calculateClubActivity, calculatePortfolio } from '../lib/portfolio.js';
import { classForChange, escapeHtml as h, formatCompact, formatMoney, formatNumber, formatPercent, formatSignedMoney, formatTime, relativeTime } from '../lib/format.js';
import { DEFAULT_WATCHLIST, findInstruments, instrument, INSTRUMENTS } from '../data/universe.js';
import { chartLegend } from '../components/price-chart.js';
import { renderOrderBook } from '../components/order-book.js';

const NAV = [
  ['overview', 'Overview', 'OV'],
  ['markets', 'Markets', 'MK'],
  ['proposals', 'Proposals', 'PR'],
  ['portfolio', 'Portfolio', 'PF'],
  ['activity', 'Activity', 'AC'],
];

export function renderApplication(state) {
  const content = renderPage(state);
  const userName = state.user?.user_metadata?.full_name
    || state.user?.user_metadata?.name
    || state.user?.email?.split('@')[0]
    || 'Guest session';
  const initials = userName.split(/[\s._-]/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'G';
  const roleName = state.role === 'visitor' ? 'Research preview' : state.role === 'pending' ? 'Pending activation' : state.role;
  const marketLabel = state.market.source === 'iex' ? 'Alpaca IEX' : 'Training tape';
  const marketClass = state.market.source === 'iex' ? 'feed-live' : 'feed-demo';

  return `
    <a class="skip-link" href="#main-content">Skip to terminal</a>
    <div class="terminal-shell">
      <aside class="sidebar" aria-label="Primary navigation">
        <a class="brand" href="#overview" aria-label="HT Investment Club terminal home">
          <span class="brand-mark">HT</span>
          <span class="brand-copy"><b>HT / FINANCE CLUB</b><small>INVESTMENT DESK</small></span>
        </a>
        <div class="sidebar-section-title">DESK</div>
        <nav class="nav-list">
          ${[...NAV, ...(state.role === 'manager' ? [['manager', 'Manager desk', 'MD'], ['members', 'Members', 'MB']] : []), ['setup', 'Feed setup', 'ST']].map(([route, label, glyph]) => `
            <a class="nav-link ${state.route === route ? 'is-active' : ''}" href="#${route}" aria-current="${state.route === route ? 'page' : 'false'}">
              <span class="nav-code">${glyph}</span><span>${label}</span>${route === 'proposals' && state.pendingCount ? `<i class="nav-count">${state.pendingCount}</i>` : ''}
            </a>`).join('')}
        </nav>
        <div class="sidebar-bottom">
          <div class="connection-card">
            <div class="connection-title"><span class="feed-dot ${marketClass}"></span><b>${marketLabel}</b></div>
            <p>${state.market.source === 'iex' ? 'Exchange feed connected' : 'Synthetic values · training only'}</p>
            <a href="#setup">Configure connection <span>↗</span></a>
          </div>
          <div class="user-card">
            <span class="avatar">${h(initials)}</span>
            <span class="user-info"><b>${h(userName)}</b><small>${h(roleName)}</small></span>
            ${state.user ? '<button class="signout-button" type="button" data-action="signout" aria-label="Sign out">↗</button>' : '<button class="signout-button" type="button" data-action="signin" aria-label="Sign in with Google">↗</button>'}
          </div>
        </div>
      </aside>

      <main class="terminal-main" id="main-content">
        <header class="terminal-topbar">
          <div class="crumb"><span>HTIC</span><b>/</b><span>${h(pageTitle(state.route).toUpperCase())}</span></div>
          <form class="command-search" id="command-search" autocomplete="off" role="search">
            <span class="command-prefix">⌕</span>
            <input id="command-input" name="query" type="search" placeholder="Find a company or ticker" aria-label="Find a company or ticker" aria-controls="search-results" aria-expanded="${state.searchOpen}">
            <kbd>⌘ K</kbd>
            ${state.searchOpen ? renderSearchResults(state.searchQuery) : ''}
          </form>
          <div class="topbar-actions">
            <span class="market-clock"><i class="clock-dot"></i> NY ${h(state.clock || '—')}</span>
            ${state.user ? `<span class="top-role role-${h(state.role)}">${h(roleName)}</span>` : '<button class="button compact" type="button" data-action="signin">Continue with Google</button>'}
          </div>
        </header>
        <div class="page-area">
          ${state.notice ? `<div class="notice notice-${h(state.notice.type || 'info')}" role="status"><span>${h(state.notice.message)}</span><button data-action="dismiss-notice" aria-label="Dismiss message">×</button></div>` : ''}
          ${state.loadError ? `<div class="notice notice-error" role="alert"><span>${h(state.loadError)}</span><button data-action="retry-data">Retry</button></div>` : ''}
          ${state.role === 'pending' && state.user ? '<div class="membership-banner"><b>Account awaiting activation</b><span>You can explore the training tape. A club manager must assign your role before shared proposals and paper ledgers unlock.</span></div>' : ''}
          ${content}
        </div>
        <footer class="terminal-footer">
          <span>HTIC · EDUCATIONAL PAPER PORTFOLIO</span>
          <span>NO BROKER CONNECTION · NO LIVE ORDERS</span>
          <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™ · Copyright (c) 2025 TradingView, Inc. ↗</a>
        </footer>
      </main>
    </div>
    ${renderProposalDialog(state)}
  `;
}

function renderPage(state) {
  switch (state.route) {
    case 'markets': return marketsPage(state);
    case 'proposals': return proposalsPage(state);
    case 'portfolio': return portfolioPage(state);
    case 'activity': return activityPage(state);
    case 'manager': return managerPage(state);
    case 'members': return membersPage(state);
    case 'setup': return setupPage(state);
    default: return overviewPage(state);
  }
}

function pageTitle(route) {
  return ({ overview: 'Overview', markets: 'Markets', proposals: 'Proposals', portfolio: 'Portfolio', activity: 'Activity', manager: 'Manager desk', members: 'Members', setup: 'Feed setup' })[route] || 'Overview';
}

function renderSearchResults(query) {
  const matches = findInstruments(query || '');
  return `<div class="search-results" id="search-results" role="listbox" aria-label="Ticker results">
    ${matches.length ? matches.map((item) => `<button class="search-result" role="option" type="button" data-action="select-symbol" data-symbol="${h(item.symbol)}"><b>${h(item.symbol)}</b><span>${h(item.name)}</span><small>${h(item.exchange)}</small></button>`).join('') : '<div class="search-empty">No matches in the covered universe.</div>'}
  </div>`;
}

function heading(kicker, title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${h(kicker)}</div><h1>${title}</h1><p>${h(description)}</p></div><div class="heading-action">${action}</div></div>`;
}

function marketStatus(state) {
  const connected = state.market.source === 'iex';
  return `<span class="source-label ${connected ? 'source-connected' : 'source-simulated'}"><i></i>${connected ? 'IEX EXCHANGE FEED' : 'TRAINING SIMULATION'}</span>`;
}

function quoteFor(state, symbol) {
  return state.market.quotes.get(symbol) || null;
}

function watchlistTable(state, options = {}) {
  const symbols = state.watchlist.length ? state.watchlist : DEFAULT_WATCHLIST;
  if (!symbols.length) return `<div class="table-empty"><b>Your watchlist is empty.</b><span>Search for a company above and add it to follow the tape.</span></div>`;
  return `<div class="table-frame"><table class="data-table watch-table">
    <thead><tr><th>Instrument</th><th>Last</th><th>Change</th><th>Volume</th><th></th></tr></thead>
    <tbody>${symbols.map((symbol) => {
      const item = instrument(symbol);
      const quote = quoteFor(state, symbol);
      const change = quote?.change ?? 0;
      return `<tr>
        <td><button class="instrument-select" type="button" data-action="open-symbol" data-symbol="${h(symbol)}"><b>${h(symbol)}</b><span>${h(item.name)}</span></button></td>
        <td class="numeric">${quote ? formatMoney(quote.price) : '—'}</td>
        <td class="numeric ${classForChange(change)}">${quote ? `${formatSignedMoney(change)} <small>${formatPercent(quote.changePercent)}</small>` : '—'}</td>
        <td class="numeric volume-cell">${quote ? formatCompact(quote.volume) : '—'}</td>
        <td class="row-actions"><button class="mini-icon" type="button" data-action="open-symbol" data-symbol="${h(symbol)}" title="Open ${h(symbol)} workspace">↗</button>${options.manage ? `<button class="mini-icon remove-icon" type="button" data-action="remove-watch" data-symbol="${h(symbol)}" title="Remove ${h(symbol)} from watchlist">×</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function overviewPage(state) {
  const watchQuotes = state.watchlist.map((symbol) => quoteFor(state, symbol)).filter(Boolean);
  const advancing = watchQuotes.filter((quote) => quote.change > 0).length;
  const declining = watchQuotes.filter((quote) => quote.change < 0).length;
  const own = calculatePortfolio(state.trades, state.user?.id, state.market.quotes);
  const pending = state.proposals.filter((proposal) => proposal.status === 'pending').length;
  const portfolioLabel = state.user && state.role !== 'pending' ? formatMoney(own.equity) : '—';
  const activity = state.trades.slice(0, 5);
  return `
    ${heading('MARKET INTELLIGENCE / CLUB WORKSPACE', 'Investment desk<span class="heading-period">.</span>', 'A shared research book for ideas, manager decisions, and simulated execution.', `<button class="button button-accent" type="button" data-action="open-proposal">New thesis <span>＋</span></button>`)}
    <section class="index-strip" aria-label="Market indices">
      ${['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'GLD'].map((symbol) => indexTile(state, symbol)).join('')}
      <div class="strip-source">${marketStatus(state)}</div>
    </section>
    <div class="overview-grid">
      <section class="panel watch-panel">
        <div class="panel-heading"><div><div class="eyebrow">COVERAGE / ${state.watchlist.length.toString().padStart(2, '0')} NAMES</div><h2>Watchlist</h2></div><a class="inline-link" href="#markets">Open markets ↗</a></div>
        ${watchlistTable(state)}
      </section>
      <section class="panel pulse-panel">
        <div class="panel-heading"><div><div class="eyebrow">DESK PULSE / ${formatTime(new Date())}</div><h2>What needs attention</h2></div></div>
        <div class="pulse-metric"><span>Watchlist breadth</span><b class="${advancing >= declining ? 'is-up' : 'is-down'}">${advancing} advancing <i>·</i> ${declining} declining</b></div>
        <div class="pulse-metric"><span>Manager review queue</span><b>${state.role === 'manager' ? `${pending} pending` : state.role === 'pending' || !state.user ? 'Member access required' : '—'}</b></div>
        <div class="pulse-metric"><span>My paper equity</span><b>${portfolioLabel}</b></div>
        <div class="pulse-rule"></div>
        ${state.user && state.role === 'pending' ? `<div class="inline-callout"><b>Manager activation needed</b><span>Your Google account is signed in. Ask the club manager to activate your account.</span></div>` : `<div class="workflow-steps"><div><i>01</i><span>Submit a written thesis</span></div><div><i>02</i><span>Manager reviews the risk</span></div><div><i>03</i><span>Manager records a paper fill</span></div></div>`}
      </section>
      <section class="panel recent-panel">
        <div class="panel-heading"><div><div class="eyebrow">LATEST RESEARCH / ${state.proposals.length}</div><h2>Proposal flow</h2></div><a class="inline-link" href="#proposals">Review all ↗</a></div>
        ${state.proposals.length ? `<div class="proposal-list">${state.proposals.slice(0, 5).map((proposal) => compactProposal(proposal)).join('')}</div>` : `<div class="table-empty"><b>No shared proposals yet.</b><span>Write a thesis with a clear catalyst and the risks that would invalidate it.</span><button class="text-action" type="button" data-action="open-proposal">Draft first thesis ↗</button></div>`}
      </section>
      <section class="panel ledger-panel">
        <div class="panel-heading"><div><div class="eyebrow">EXECUTION JOURNAL / ${state.trades.length}</div><h2>Recent paper fills</h2></div><a class="inline-link" href="#activity">Open ledger ↗</a></div>
        ${activity.length ? `<div class="ledger-list">${activity.map((trade) => compactTrade(state, trade)).join('')}</div>` : `<div class="table-empty"><b>The execution journal is clear.</b><span>Paper fills appear after a manager approves and records a proposal.</span></div>`}
      </section>
    </div>
    <div class="data-footnote">${state.market.source === 'iex' ? `ALPACA IEX SNAPSHOT · RECEIVED ${state.market.asOf ? relativeTime(state.market.asOf).toUpperCase() : '—'}` : 'TRAINING TAPE · SYNTHETIC PRICES · NOT MARKET DATA'} <span>Paper equity is marked against the selected price feed. No orders are sent to a broker.</span></div>
  `;
}

function indexTile(state, symbol) {
  const item = instrument(symbol);
  const quote = quoteFor(state, symbol);
  return `<button type="button" class="index-tile" data-action="open-symbol" data-symbol="${h(symbol)}"><span>${h(symbol)} <small>${h(item.name.replace(/ (ETF|Trust|Shares)$/i, ''))}</small></span><b>${quote ? formatMoney(quote.price) : '—'}</b><i class="${classForChange(quote?.change || 0)}">${quote ? formatPercent(quote.changePercent) : '—'}</i></button>`;
}

function marketsPage(state) {
  const item = instrument(state.symbol);
  const quote = quoteFor(state, state.symbol);
  const legend = chartLegend(quote, state.market.bars);
  const change = quote?.change ?? 0;
  const isWatched = state.watchlist.includes(state.symbol);
  const movers = [...INSTRUMENTS]
    .map(([symbol]) => ({ symbol, quote: quoteFor(state, symbol) }))
    .filter((item) => item.quote)
    .sort((a, b) => Math.abs(b.quote.changePercent) - Math.abs(a.quote.changePercent))
    .slice(0, 7);

  return `
    ${heading('MARKET MONITOR / UNITED STATES', 'Markets<span class="heading-period">.</span>', 'Search the covered universe, compare the tape, and study price history.', `<form class="symbol-entry" id="market-search"><span>LOOKUP</span><input name="symbol" value="${h(state.symbol)}" maxlength="12" aria-label="Ticker symbol" autocomplete="off"><button class="button button-accent">Go <span>↵</span></button></form>`)}
    <section class="quote-header">
      <div class="quote-identity"><span class="exchange-code">${h(item.exchange)}</span><h2>${h(state.symbol)}</h2><p>${h(item.name)} <i>·</i> ${h(item.sector)}</p></div>
      <div class="quote-price-block"><strong>${quote ? formatMoney(quote.price, { digits: quote.price < 2 ? 4 : 2 }) : '—'}</strong><span class="${classForChange(change)}">${quote ? `${formatSignedMoney(change)} (${formatPercent(quote.changePercent)})` : 'Awaiting feed'}</span><small>${state.market.asOf ? `AS OF ${formatTime(state.market.asOf)}` : 'NO EXCHANGE SNAPSHOT'}</small></div>
      <div class="quote-actions">${marketStatus(state)}<button class="button ${isWatched ? 'button-muted' : 'button-accent'}" type="button" data-action="toggle-watch" data-symbol="${h(state.symbol)}">${isWatched ? 'Following ✓' : '＋ Follow'}</button><button class="button" type="button" data-action="open-proposal" data-symbol="${h(state.symbol)}">Pitch trade</button></div>
    </section>
    <div class="market-layout">
      <section class="panel chart-panel">
        <div class="chart-panel-head"><div><div class="eyebrow">PRICE HISTORY / ${h(state.symbol)} / ${h(state.chartRange)}</div><h2>${legend.price ? formatMoney(legend.price) : 'Price chart'} <small id="chart-crosshair-readout">Move crosshair for OHLC</small></h2></div><div class="chart-controls">
          <div class="segmented" aria-label="Chart range">${['1D', '1W', '1M', '3M', '1Y', '5Y'].map((range) => `<button type="button" data-action="chart-range" data-range="${range}" class="${state.chartRange === range ? 'selected' : ''}" aria-pressed="${state.chartRange === range}">${range}</button>`).join('')}</div>
        </div></div>
        <div class="chart-indicators"><button class="indicator-toggle ${state.showSma20 ? 'active' : ''}" type="button" data-action="toggle-indicator" data-indicator="showSma20" aria-pressed="${state.showSma20}"><i class="indicator-dot sma20"></i>SMA 20</button><button class="indicator-toggle ${state.showSma50 ? 'active' : ''}" type="button" data-action="toggle-indicator" data-indicator="showSma50" aria-pressed="${state.showSma50}"><i class="indicator-dot sma50"></i>SMA 50</button><span>${state.market.loadingBars ? 'LOADING BARS…' : `${state.market.bars.length} BARS`} · ${h(state.market.chartSource === 'iex' ? 'IEX' : 'TRAINING SIM')}</span></div>
        <div id="price-chart" class="price-chart" aria-label="Interactive candlestick price chart"></div>
        <div class="chart-credit"><span>${state.market.chartSource === 'iex' ? 'Source: Alpaca IEX · Exchange coverage is limited to IEX.' : 'Illustrative generated candles · no current market data.'}</span><a href="https://www.tradingview.com/" rel="noopener" target="_blank">TradingView Lightweight Charts™ ↗</a></div>
      </section>
      <aside class="panel quote-details">
        <div class="panel-heading"><div><div class="eyebrow">SESSION SNAPSHOT</div><h2>Trading range</h2></div><span class="detail-feed-dot ${state.market.source === 'iex' ? 'feed-live' : 'feed-demo'}"></span></div>
        ${detailRow('Open', quote?.open)}${detailRow('Day high', quote?.high)}${detailRow('Day low', quote?.low)}${detailRow('Prev. close', quote?.previousClose)}${detailRow('Volume', quote?.volume, true)}${detailRow('Bid', quote?.bid)}${detailRow('Ask', quote?.ask)}
        <div class="range-meter"><div class="range-track"><i style="--range-position:${quote && quote.high > quote.low ? `${Math.min(100, Math.max(0, ((quote.price - quote.low) / (quote.high - quote.low)) * 100))}%` : '50%'}"></i></div><div><span>LOW ${quote ? formatMoney(quote.low) : '—'}</span><span>HIGH ${quote ? formatMoney(quote.high) : '—'}</span></div></div>
      </aside>
    </div>
    <div class="market-bottom-grid">
      ${renderOrderBook(state.symbol, quote)}
      <section class="panel movers-panel"><div class="panel-heading"><div><div class="eyebrow">COVERED UNIVERSE</div><h2>Largest moves</h2></div><span class="quiet-count">${movers.length} symbols</span></div>
        ${movers.length ? `<div class="table-frame"><table class="data-table"><thead><tr><th>Ticker</th><th>Last</th><th>Day change</th></tr></thead><tbody>${movers.map(({symbol,quote:row}) => `<tr><td><button type="button" class="instrument-select" data-action="open-symbol" data-symbol="${h(symbol)}"><b>${h(symbol)}</b><span>${h(instrument(symbol).name)}</span></button></td><td class="numeric">${formatMoney(row.price)}</td><td class="numeric ${classForChange(row.change)}">${formatPercent(row.changePercent)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="table-empty"><b>Waiting on a snapshot.</b><span>Market changes will populate after the feed connects.</span></div>`}
      </section>
      <section class="panel market-watch-panel"><div class="panel-heading"><div><div class="eyebrow">PERSONAL COVERAGE / ${state.watchlist.length}</div><h2>Watchlist</h2></div><a href="#setup" class="inline-link">Feed setup ↗</a></div>${watchlistTable(state, {manage:true})}</section>
    </div>
  `;
}

function detailRow(label, value, compact = false) {
  const display = value == null || !Number.isFinite(Number(value)) ? '—' : compact ? formatCompact(value) : formatMoney(value);
  return `<div class="detail-row"><span>${h(label)}</span><b>${display}</b></div>`;
}

function proposalsPage(state) {
  if (!state.user) return authGate('Proposals are shared with signed-in club members.', 'Sign in with Google to draft a thesis and review club research.');
  if (state.role === 'pending') return memberGate();
  const active = state.proposalFilter || 'all';
  const proposals = active === 'all' ? state.proposals : state.proposals.filter((proposal) => proposal.status === active);
  const tabs = ['all', 'pending', 'approved', 'executed', 'rejected'];
  return `
    ${heading('RESEARCH QUEUE / THESIS BEFORE TRADE', 'Proposals<span class="heading-period">.</span>', 'Interns submit the reasoning and risk. Managers approve or reject before paper execution.', `<button type="button" class="button button-accent" data-action="open-proposal">＋ Write a thesis</button>`)}
    <div class="filter-tabs" role="tablist" aria-label="Filter proposals">${tabs.map((status) => `<button role="tab" type="button" data-action="proposal-filter" data-status="${status}" class="${active === status ? 'selected' : ''}" aria-selected="${active === status}">${status === 'all' ? 'All research' : titleCase(status)} <i>${status === 'all' ? state.proposals.length : state.proposals.filter((proposal) => proposal.status === status).length}</i></button>`).join('')}</div>
    ${proposals.length ? `<div class="proposal-grid">${proposals.map((proposal) => proposalCard(state, proposal)).join('')}</div>` : `<section class="panel empty-panel"><span class="empty-code">${active === 'all' ? 'NO IDEAS' : `NO ${active.toUpperCase()}`}</span><h2>Nothing in this view yet.</h2><p>${active === 'all' ? 'Start with a security, a time horizon, a catalyst, and one way your thesis could fail.' : `No ${active} proposals are in the ledger.`}</p>${active === 'all' ? '<button class="button button-accent" type="button" data-action="open-proposal">Draft first thesis</button>' : ''}</section>`}
  `;
}

function proposalCard(state, proposal) {
  const author = memberName(state, proposal.author_id);
  const canReview = state.role === 'manager' && proposal.status === 'pending';
  const canExecute = state.role === 'manager' && proposal.status === 'approved';
  return `<article class="proposal-card">
    <div class="proposal-card-top"><span class="proposal-symbol">${h(proposal.symbol)}</span><span class="status-tag status-${h(proposal.status)}">${h(proposal.status)}</span></div>
    <div class="proposal-line">${h(proposal.side.toUpperCase())} <i>·</i> ${formatNumber(proposal.quantity, 4)} SHARES <i>·</i> ${h(formatTime(proposal.created_at, { dateOnly: true }))}</div>
    <div class="proposal-author">SUBMITTED BY <b>${h(author)}</b></div>
    <div class="thesis-block"><small>INVESTMENT THESIS</small><p>${h(proposal.thesis)}</p></div>
    <div class="risk-block"><small>RISK / INVALIDATION</small><p>${h(proposal.risks)}</p></div>
    ${proposal.reviewed_at ? `<div class="review-meta">${proposal.status === 'executed' ? 'EXECUTED' : 'REVIEWED'} ${h(relativeTime(proposal.reviewed_at))} BY ${h(memberName(state, proposal.reviewed_by))}</div>` : ''}
    ${canReview ? `<div class="review-controls"><button class="button approve-button" data-action="review-proposal" data-proposal="${h(proposal.id)}" data-decision="approved">Approve thesis</button><button class="button reject-button" data-action="review-proposal" data-proposal="${h(proposal.id)}" data-decision="rejected">Reject</button></div>` : ''}
    ${canExecute ? `<form class="fill-entry" data-form="execute" data-proposal="${h(proposal.id)}"><label>MANAGER PAPER FILL / USD<input name="price" type="number" min="0.0001" step="any" required placeholder="Enter the executed simulation price"></label><button class="button button-accent">Record fill ↗</button></form>` : ''}
  </article>`;
}

function portfolioPage(state) {
  if (!state.user) return authGate('Your paper book is private to your club account.', 'Sign in to review holdings and cash from approved paper fills.');
  if (state.role === 'pending') return memberGate();
  const portfolio = calculatePortfolio(state.trades, state.user.id, state.market.quotes);
  const priced = portfolio.positions.filter((position) => position.quoteAvailable).length;
  return `
    ${heading('SIMULATED BOOK / MARKED TO SELECTED FEED', 'Portfolio<span class="heading-period">.</span>', 'Average-cost holdings from approved manager-recorded paper fills. Marks use the visible feed.', `<a class="button" href="#activity">Open trade ledger ↗</a>`)}
    <div class="portfolio-summary">
      ${summaryMetric('Paper equity', formatMoney(portfolio.equity), `${formatSignedMoney(portfolio.totalPnl)} total simulated P/L`, classForChange(portfolio.totalPnl))}
      ${summaryMetric('Available cash', formatMoney(portfolio.cash), 'Starting cash less buys, plus sells', '')}
      ${summaryMetric('Open market value', formatMoney(portfolio.marketValue), `${portfolio.positions.length} open positions`, '')}
      ${summaryMetric('Unrealized P/L', formatSignedMoney(portfolio.unrealizedPnl), `${formatPercent(portfolio.costBasis ? (portfolio.unrealizedPnl / portfolio.costBasis) * 100 : 0)} on cost basis`, classForChange(portfolio.unrealizedPnl))}
    </div>
    <section class="panel positions-panel"><div class="panel-heading"><div><div class="eyebrow">LONG POSITIONS / AVERAGE COST</div><h2>Holdings</h2></div><span class="quiet-count">${priced} of ${portfolio.positions.length} marked from ${state.market.source === 'iex' ? 'IEX' : 'training data'}</span></div>
      ${portfolio.positions.length ? `<div class="table-frame"><table class="data-table positions-table"><thead><tr><th>Security</th><th>Shares</th><th>Avg. cost</th><th>Mark</th><th>Market value</th><th>Unrealized P/L</th></tr></thead><tbody>${portfolio.positions.map((position) => `<tr><td><button class="instrument-select" type="button" data-action="open-symbol" data-symbol="${h(position.symbol)}"><b>${h(position.symbol)}</b><span>${h(instrument(position.symbol).name)}</span></button></td><td class="numeric">${formatNumber(position.shares, 4)}</td><td class="numeric">${formatMoney(position.averageCost)}</td><td class="numeric">${position.quoteAvailable ? formatMoney(position.mark) : `<span class="at-cost">${formatMoney(position.averageCost)} · cost</span>`}</td><td class="numeric">${formatMoney(position.marketValue)}</td><td class="numeric ${classForChange(position.unrealizedPnl)}">${formatSignedMoney(position.unrealizedPnl)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="table-empty"><b>No holdings yet.</b><span>Propose an idea, wait for manager approval, then the manager records the paper fill.</span><a class="text-action" href="#proposals">Open research queue ↗</a></div>`}
    </section>
    <div class="data-footnote">MARKET VALUE IS IEX PRICED WHEN CONNECTED; OTHERWISE OPEN POSITIONS DISPLAY AT COST. PAPER TRADES DO NOT ROUTE TO A BROKER.</div>
  `;
}

function summaryMetric(label, value, foot, tone = '') {
  return `<article class="summary-metric"><small>${h(label)}</small><b class="${tone}">${h(value)}</b><span>${h(foot)}</span></article>`;
}

function activityPage(state) {
  if (!state.user) return authGate('The paper execution ledger is access controlled.', 'Sign in to review trade history recorded for your account.');
  if (state.role === 'pending') return memberGate();
  const trades = state.trades;
  return `
    ${heading('AUDIT JOURNAL / MANAGER RECORDED FILLS', 'Activity<span class="heading-period">.</span>', state.role === 'manager' ? 'Club fills are linked to their approved proposal and attributed to the recording manager.' : 'Your recorded fills, with price, side, quantity, and proposal link.', `<span class="source-label source-neutral">${trades.length} LEDGER ENTRIES</span>`)}
    <section class="panel ledger-table-panel"><div class="panel-heading"><div><div class="eyebrow">${state.role === 'manager' ? 'CLUB LEDGER' : 'MY PAPER LEDGER'}</div><h2>Execution history</h2></div><button class="button" type="button" data-action="export-trades">Export CSV ↓</button></div>
      <div class="table-frame"><table class="data-table"><thead><tr><th>Recorded</th><th>Security</th><th>Account</th><th>Side</th><th>Shares</th><th>Fill price</th><th>Notional</th><th>Proposal</th></tr></thead><tbody>${trades.length ? trades.map((trade) => `<tr><td>${h(formatTime(trade.created_at))}</td><td><button class="instrument-select single-line" data-action="open-symbol" data-symbol="${h(trade.symbol)}"><b>${h(trade.symbol)}</b></button></td><td>${h(memberName(state, trade.author_id))}</td><td class="side-${h(trade.side)}">${h(trade.side.toUpperCase())}</td><td class="numeric">${formatNumber(trade.quantity, 4)}</td><td class="numeric">${formatMoney(trade.price)}</td><td class="numeric">${formatMoney(Number(trade.quantity) * Number(trade.price))}</td><td><a class="inline-link" href="#proposals">${h(String(trade.proposal_id).slice(0, 8))} ↗</a></td></tr>`).join('') : '<tr><td colspan="8" class="empty-cell">No paper fills recorded.</td></tr>'}</tbody></table></div>
    </section>
    <div class="data-footnote">APPROVED PROPOSAL → MANAGER-ENTERED PAPER FILL → IMMUTABLE TRADE ROW.</div>
  `;
}

function managerPage(state) {
  if (state.role !== 'manager') return authGate('Manager desk is restricted.', 'Only activated club managers can view the review queue, member roster, and group ledger.');
  const pending = state.proposals.filter((proposal) => proposal.status === 'pending');
  const open = state.proposals.filter((proposal) => proposal.status === 'approved');
  const participation = calculateClubActivity(state.trades, (userId) => memberName(state, userId));
  const today = new Date();
  const todaysFills = state.trades.filter((trade) => new Date(trade.created_at).toDateString() === today.toDateString()).length;
  return `
    ${heading('MANAGER CONSOLE / CLUB CONTROL', 'Manager desk<span class="heading-period">.</span>', 'Review intern research, manage membership, and record paper execution after approval.', `<a class="button" href="#members">Open member roster ↗</a>`)}
    <div class="manager-kpis">${summaryMetric('Pending decisions', String(pending.length).padStart(2, '0'), 'Awaiting manager review', pending.length ? 'is-warning' : '')}${summaryMetric('Approved / unfilled', String(open.length).padStart(2, '0'), 'Ready for manual paper entry', '')}${summaryMetric('Club paper fills', String(state.trades.length).padStart(2, '0'), `${todaysFills} recorded today`, '')}${summaryMetric('Active members', String(state.members.filter((member) => member.role).length).padStart(2, '0'), `${state.members.filter((member) => !member.role).length} pending activation`, '')}</div>
    <div class="manager-grid"><section class="panel review-queue"><div class="panel-heading"><div><div class="eyebrow">DECISIONS REQUIRED</div><h2>Pending research</h2></div><span class="quiet-count">${pending.length}</span></div>${pending.length ? `<div class="proposal-list">${pending.map((proposal) => compactProposal(proposal, true)).join('')}</div>` : `<div class="table-empty"><b>No proposals need review.</b><span>New intern submissions will appear here.</span></div>`}</section>
      <section class="panel execution-queue"><div class="panel-heading"><div><div class="eyebrow">APPROVED THESIS / PAPER EXECUTION</div><h2>Ready to record</h2></div><span class="quiet-count">${open.length}</span></div>${open.length ? `<div class="proposal-list">${open.map((proposal) => compactProposal(proposal, true)).join('')}</div>` : `<div class="table-empty"><b>No approved proposals are waiting.</b><span>When you approve an idea, record the simulated fill price in the proposal queue.</span></div>`}</section>
    </div>
    <div class="manager-bottom-grid"><section class="panel manager-recent"><div class="panel-heading"><div><div class="eyebrow">RECENT EXECUTIONS</div><h2>Latest fills</h2></div><a href="#activity" class="inline-link">View full ledger ↗</a></div>${state.trades.length ? `<div class="table-frame"><table class="data-table"><thead><tr><th>Time</th><th>Symbol</th><th>Intern</th><th>Side</th><th>Quantity</th><th>Fill</th><th>Recorded by</th></tr></thead><tbody>${state.trades.slice(0, 7).map((trade) => `<tr><td>${h(relativeTime(trade.created_at))}</td><td><b>${h(trade.symbol)}</b></td><td>${h(memberName(state, trade.author_id))}</td><td class="side-${h(trade.side)}">${h(trade.side.toUpperCase())}</td><td class="numeric">${formatNumber(trade.quantity, 4)}</td><td class="numeric">${formatMoney(trade.price)}</td><td>${h(memberName(state, trade.executed_by))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="table-empty"><b>No executions recorded.</b><span>Approvals and manual paper entries will be logged here.</span></div>'}</section>
      <section class="panel member-activity"><div class="panel-heading"><div><div class="eyebrow">MEMBER PARTICIPATION / NOT RETURNS</div><h2>Trading activity</h2></div><a class="inline-link" href="#members">Roster ↗</a></div>${participation.length ? `<div class="table-frame"><table class="data-table"><thead><tr><th>Member</th><th>Fills</th><th>Buys / sells</th><th>Notional</th></tr></thead><tbody>${participation.slice(0, 8).map((member) => `<tr><td>${h(member.name)}</td><td class="numeric">${member.count}</td><td class="numeric">${member.buys} / ${member.sells}</td><td class="numeric">${formatMoney(member.notional)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="table-empty"><b>No member activity yet.</b><span>Notional tracks recorded trade size only. It is not a return ranking.</span></div>'}<div class="manager-footnote">NOTIONAL IS PAPER FILL SIZE; IT DOES NOT MEASURE PERFORMANCE.</div></section></div>
  `;
}

function membersPage(state) {
  if (state.role !== 'manager') return authGate('Member management is restricted to managers.', 'The roster contains private account emails and role controls.');
  const members = state.members;
  return `
    ${heading('ACCESS CONTROL / GOOGLE ACCOUNTS', 'Members<span class="heading-period">.</span>', 'Activate sign-ins as interns or managers. Role changes are rechecked by Postgres.', `<span class="source-label source-neutral">${members.length} ACCOUNTS</span>`)}
    <section class="panel member-roster"><div class="panel-heading"><div><div class="eyebrow">CLUB ROSTER</div><h2>Signed-in accounts</h2></div><span class="quiet-count">${members.filter((member) => !member.role).length} awaiting access</span></div>
      ${members.length ? `<div class="table-frame"><table class="data-table"><thead><tr><th>Member</th><th>Access</th><th>Joined</th><th>Assign role</th></tr></thead><tbody>${members.map((member) => {
        const fullName = member.full_name || member.email?.split('@')[0] || 'New member';
        const self = member.user_id === state.user?.id;
        return `<tr><td><div class="member-cell"><span class="avatar small-avatar">${h(fullName.slice(0, 1).toUpperCase())}</span><span><b>${h(fullName)}</b><small>${h(member.email || '')}</small></span></div></td><td><span class="role-tag role-${h(member.role || 'pending')}">${h(member.role || 'pending')}</span></td><td>${h(member.joined_at ? formatTime(member.joined_at, { dateOnly: true }) : '—')}</td><td>${self ? '<span class="self-role">Your manager access is protected</span>' : `<form class="role-assignment" data-form="member-role" data-user-id="${h(member.user_id)}"><select name="role" aria-label="Role for ${h(fullName)}"><option value="intern" ${member.role === 'intern' ? 'selected' : ''}>Intern</option><option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Manager</option></select><button class="button compact">Save</button></form>`}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="table-empty"><b>No users have signed in yet.</b><span>After the first Google login, initialize the first manager using the one-time bootstrap SQL in the repository.</span></div>'}
    </section>
    <div class="data-footnote">PENDING USERS CANNOT READ SHARED PROPOSALS OR TRADES. KEEP AT LEAST ONE MANAGER ACTIVE.</div>
  `;
}

function setupPage(state) {
  const connected = state.market.source === 'iex';
  return `
    ${heading('CONNECTIONS / MARKET DATA', 'Feed setup<span class="heading-period">.</span>', 'Use the no-cost Alpaca IEX plan for exchange quotes and historical bars. Keys stay server-side in Supabase.', marketStatus(state))}
    <div class="setup-layout"><section class="panel setup-main"><div class="setup-title"><span class="setup-step">01</span><div><div class="eyebrow">FREE MARKET DATA / EQUITIES</div><h2>${connected ? 'Alpaca IEX is connected' : 'Connect Alpaca IEX'}</h2><p>The free stock-data plan provides real-time prints from IEX only. It is a single exchange feed, not consolidated NYSE/Nasdaq/SIP coverage.</p></div></div>
      <ol class="setup-steps"><li><span>1</span><div><b>Create a free Alpaca account</b><small>Open the Alpaca dashboard and create paper-trading API keys. Choose the paper environment; this app only reads market data.</small><a href="https://app.alpaca.markets/signup" target="_blank" rel="noopener">Alpaca sign-up ↗</a></div></li><li><span>2</span><div><b>Deploy the market-data function</b><small>Publish <code>supabase/functions/market-data/index.ts</code> to project <code>nftmbvwzeahcnfycdoam</code>. The function verifies the Supabase session and club role before it proxies data.</small><code>npx supabase functions deploy market-data --project-ref nftmbvwzeahcnfycdoam</code></div></li><li><span>3</span><div><b>Add server secrets in Supabase</b><small>Supabase → Edge Functions → Secrets. Add your Alpaca paper API key ID and secret as these names:</small><code>ALPACA_API_KEY_ID<br>ALPACA_API_SECRET_KEY</code></div></li><li><span>4</span><div><b>Refresh the terminal</b><small>Secrets never go into Vite, GitHub, or the browser bundle. Return to Markets and refresh; the status changes to Alpaca IEX when a valid snapshot arrives.</small><button class="text-action" type="button" data-action="retry-data">Test connection ↗</button></div></li></ol>
    </section><aside class="panel setup-side"><div class="eyebrow">CURRENT FEED STATE</div><h2>${connected ? 'Connected' : 'Training tape active'}</h2><p>${connected ? 'The terminal is receiving Alpaca IEX snapshots. The source timestamp is shown next to each selected security.' : 'A synthetic training model is active so the interface remains usable. It is not live, delayed, or historical market data.'}</p><div class="feed-status-card ${connected ? 'connected' : 'simulated'}"><i></i><div><b>${connected ? 'ALPACA IEX' : 'SYNTHETIC TRAINING'}</b><span>${connected ? `Last response ${state.market.asOf ? relativeTime(state.market.asOf) : 'just now'}` : 'Do not use values for proposal fills'}</span></div></div><div class="data-notes"><b>What the IEX feed means</b><p>Quotes and bars represent the IEX exchange. Trading volume and last price can differ from consolidated US market totals. Club paper fills remain manually entered by a manager.</p><a href="https://docs.alpaca.markets/us/docs/about-market-data-api" target="_blank" rel="noopener">Alpaca market-data plans ↗</a><a href="https://docs.alpaca.markets/us/docs/market-data-faq" target="_blank" rel="noopener">Feed coverage FAQ ↗</a></div></aside></div>
    <section class="panel integration-note"><div><div class="eyebrow">CHART ENGINE / OPEN SOURCE</div><h2>Interactive candles, rendered in the app</h2><p>The terminal draws candlesticks, volume, crosshair readouts, and moving averages locally with TradingView Lightweight Charts. No chart iframe or hosted widget supplies the interface.</p></div><span class="source-label source-neutral">TradingView Lightweight Charts™</span></section>
  `;
}

function compactProposal(proposal, link = false) {
  const row = `<div class="compact-proposal"><span class="proposal-symbol">${h(proposal.symbol)}</span><span class="compact-copy"><b>${h(proposal.side.toUpperCase())} / ${formatNumber(proposal.quantity, 4)} sh.</b><small>${h(String(proposal.thesis || '').slice(0, 90))}${proposal.thesis?.length > 90 ? '…' : ''}</small></span><span class="status-tag status-${h(proposal.status)}">${h(proposal.status)}</span></div>`;
  return link ? `<a class="compact-proposal-link" href="#proposals">${row}</a>` : row;
}

function compactTrade(state, trade) {
  return `<div class="compact-trade"><span class="trade-side-marker side-${h(trade.side)}">${trade.side === 'buy' ? 'B' : 'S'}</span><span><b>${h(trade.symbol)} <i>·</i> ${h(trade.side.toUpperCase())}</b><small>${h(memberName(state, trade.author_id))} / ${h(relativeTime(trade.created_at))}</small></span><strong>${formatMoney(Number(trade.price) * Number(trade.quantity))}</strong></div>`;
}

function memberName(state, userId) {
  if (!userId) return 'Club member';
  if (userId === state.user?.id) return 'You';
  const member = state.members.find((item) => item.user_id === userId);
  return member?.full_name || member?.email || `Member ${String(userId).slice(0, 7)}`;
}

function authGate(title, description) {
  return `<section class="panel access-gate"><span class="gate-kicker">MEMBER ACCESS</span><h2>${h(title)}</h2><p>${h(description)}</p><button class="button button-accent" type="button" data-action="signin">Continue with Google ↗</button></section>`;
}

function memberGate() {
  return `<section class="panel access-gate"><span class="gate-kicker">PENDING ACTIVATION</span><h2>Your club role is not active yet.</h2><p>Ask a club manager to assign your Google account as an intern or manager. The manager console will not expose shared records until then.</p><a href="#setup" class="inline-link">Explore data setup ↗</a></section>`;
}

function renderProposalDialog(state) {
  const suggestedSymbol = state.proposalSymbol || state.symbol || '';
  return `<dialog id="proposal-dialog" aria-labelledby="proposal-title"><form id="proposal-form" data-form="proposal">
    <div class="dialog-top"><div><div class="eyebrow">RESEARCH SUBMISSION / NEW IDEA</div><h2 id="proposal-title">Write an investment thesis</h2></div><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">×</button></div>
    <p class="dialog-intro">A manager reviews the reasoning and risk before any paper trade is recorded. This submission does not place an order.</p>
    <label>SECURITY<input name="symbol" value="${h(suggestedSymbol)}" maxlength="12" pattern="[A-Za-z0-9.\-]{1,12}" placeholder="e.g. NVDA" required></label>
    <div class="form-two"><label>PROPOSED SIDE<select name="side"><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>SHARES<input name="quantity" type="number" min="0.0001" max="1000000" step="any" placeholder="0.00" required></label></div>
    <label>THESIS / CATALYST<textarea name="thesis" minlength="20" maxlength="4000" rows="5" placeholder="What does the market miss? State the thesis, catalyst, and time horizon." required></textarea><small>20–4,000 characters</small></label>
    <label>RISK / INVALIDATION<textarea name="risks" minlength="1" maxlength="2000" rows="3" placeholder="What would make you change your view?" required></textarea></label>
    <div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button button-accent">Submit for review ↗</button></div>
  </form></dialog>`;
}

function titleCase(value) {
  return value[0].toUpperCase() + value.slice(1);
}
