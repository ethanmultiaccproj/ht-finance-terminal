import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const ranges: Record<string, { timeframe: string; days: number }> = {
  "1D": { timeframe: "5Min", days: 5 },
  "1W": { timeframe: "15Min", days: 8 },
  "1M": { timeframe: "1Hour", days: 35 },
  "3M": { timeframe: "4Hour", days: 100 },
  "1Y": { timeframe: "1Day", days: 380 },
  "ALL": { timeframe: "1Day", days: 3800 },
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Supabase function is not configured." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sign in required" }, 401);

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (memberError || !member) return json({ error: "Club membership is required for market data." }, 403);

  const key = Deno.env.get("ALPACA_API_KEY_ID");
  const secret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!key || !secret) return json({ error: "Market feed is not configured yet." }, 503);

  try {
    const body = await request.json();
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const range = String(body.range ?? "1D");
    const rangeConfig = ranges[range];
    if (!/^[A-Z.-]{1,12}$/.test(symbol)) return json({ error: "Invalid ticker symbol." }, 400);
    if (!rangeConfig) return json({ error: "Unsupported chart range." }, 400);

    const requestedSymbols = Array.isArray(body.symbols) ? body.symbols : [];
    const symbols = Array.from(new Set([symbol, ...requestedSymbols]
      .map((value) => String(value).trim().toUpperCase())
      .filter((value) => /^[A-Z.-]{1,12}$/.test(value))));
    if (symbols.length > 30) return json({ error: "Request up to 30 ticker symbols at a time." }, 400);

    const headers = { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
    const now = new Date();
    const end = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const start = new Date(now.getTime() - rangeConfig.days * 86400000).toISOString();
    const snapshotUrl = new URL("https://data.alpaca.markets/v2/stocks/snapshots");
    snapshotUrl.searchParams.set("symbols", symbols.join(","));
    snapshotUrl.searchParams.set("feed", "iex");
    const barsUrl = new URL("https://data.alpaca.markets/v2/stocks/bars");
    barsUrl.searchParams.set("symbols", symbol);
    barsUrl.searchParams.set("timeframe", rangeConfig.timeframe);
    barsUrl.searchParams.set("start", start);
    barsUrl.searchParams.set("end", end);
    barsUrl.searchParams.set("limit", "10000");
    barsUrl.searchParams.set("feed", "iex");
    barsUrl.searchParams.set("sort", "asc");

    const [snapshotResponse, barsResponse] = await Promise.all([
      fetch(snapshotUrl, { headers }),
      fetch(barsUrl, { headers }),
    ]);
    if (!snapshotResponse.ok || !barsResponse.ok) {
      const failed = !snapshotResponse.ok ? snapshotResponse : barsResponse;
      return json({ error: "Alpaca market data request failed.", providerStatus: failed.status }, failed.status === 429 ? 429 : 502);
    }

    const [snapshots, history] = await Promise.all([snapshotResponse.json(), barsResponse.json()]);
    const quotes: Record<string, unknown> = {};
    for (const ticker of symbols) {
      const snapshot = snapshots[ticker];
      if (!snapshot) continue;
      const trade = snapshot.latestTrade;
      const day = snapshot.dailyBar;
      const previous = snapshot.prevDailyBar;
      const price = Number(trade?.p ?? day?.c ?? previous?.c);
      const baseline = Number(previous?.c ?? day?.o);
      quotes[ticker] = {
        price: Number.isFinite(price) ? price : null,
        change: Number.isFinite(price) && Number.isFinite(baseline) && baseline !== 0 ? 100 * (price - baseline) / baseline : null,
        timestamp: trade?.t ?? day?.t ?? null,
      };
    }

    let bars = history.bars?.[symbol] ?? [];
    if (range === "1D" && bars.length) {
      const lastTradeDate = snapshots[symbol]?.latestTrade?.t;
      const sessionDate = lastTradeDate ? newYorkDate(lastTradeDate) : null;
      const sessionBars = sessionDate ? bars.filter((bar: { t: string }) => newYorkDate(bar.t) === sessionDate) : [];
      if (sessionBars.length > 1) bars = sessionBars;
      else if (sessionBars.length) bars = sessionBars;
    }

    return json({
      symbol,
      range,
      feed: "IEX",
      quoteScope: "single exchange",
      chartWindowMinutes: 15,
      asOf: now.toISOString(),
      quotes,
      bars,
    });
  } catch {
    return json({ error: "Market data request could not be completed." }, 500);
  }
});

function newYorkDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
