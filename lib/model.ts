// The radar's value model, version radar-3: what the market pays for a dollar of TVL, then a
// momentum and a maturity adjustment, all measured from the snapshot itself.
//
// The board's question is "which pre-token protocol is worth farming next, and what is it likely
// to be worth". The model answers the second half with four figures it reads, never with a list of
// names:
//
//   1. multiple   what a dollar of TVL is worth in this protocol's category. For every category
//                 the model takes the median market cap over TVL of the category's protocols whose
//                 token already trades, then shrinks that median toward the whole market's median by
//                 how few comparables stand behind it (empirical Bayes: (n*median + k*market) /
//                 (n + k), k = 6). A category with two comparables cannot claim a 20x multiple on
//                 its own; one with twenty is trusted almost as stated.
//   2. momentum   1 + weight * clamp(change_7d, floor, cap) / 100. Seven-day TVL growth is the
//                 snapshot's only forward-looking figure: capital arriving faster than the category
//                 is a reason to look sooner, and a protocol losing TVL is a reason to wait.
//   3. maturity   0.55 + 0.45 * min(age_days, 1825) / 1825. Age is the day DefiLlama began tracking
//                 the protocol, the snapshot's own record of how long it has run without a token: a
//                 protocol that has survived five years of public operation is closer to a launch
//                 than one listed last month.
//   4. band       the category's own 25th and 75th percentile multiples, shrunk the same way, give
//                 every row a low and a high implied value beside the point estimate. A board that
//                 states one number and hides its spread is less honest than one that shows both.
//
// The model never reads a protocol's name for anything except the exclusion rules the watchlist's
// own definition uses: a wrapped, staked or bridged product of a token that already trades is a
// receipt, not a launch, and it is left out of the early radar and out of the comparables. TVL,
// market cap, seven-day change, age, category and chains are the only inputs.

/** One protocol as the sealed snapshot carries it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, shown on the page and applied by one function. */
export interface ModelConstants {
  min_comps: number;
  shrink_k: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  band_log_cap: number;
  implied_cap: number;
}

export const MODEL: ModelConstants = {
  min_comps: 3,
  shrink_k: 6,
  growth_weight: 0.25,
  growth_floor: -40,
  growth_cap: 80,
  maturity_floor: 0.55,
  maturity_days: 1825,
  unknown_age_days: 365,
  multiple_floor: 0.03,
  multiple_cap: 4,
  band_log_cap: 0.75,
  implied_cap: 100_000_000_000_000,
};

/** The version label the page and the board carry. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols outside the watchlist the board carries. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the reference view carries. */
export const LIVE_ROWS = 30;

/** One category's measured pricing: raw and shrunk, with its comparables. */
export interface CategoryPrice {
  category: string;
  comps: number;
  median: number;
  p25: number;
  p75: number;
  multiple: number;
  multiple_low: number;
  multiple_high: number;
  used: boolean;
  top: { name: string; symbol: string | null; tvl_usd: number; mcap_usd: number; multiple: number }[];
}

/** The market's own pricing, the fallback every thin category is shrunk toward. */
export interface MarketPrice {
  multiple: number;
  low: number;
  high: number;
  comps: number;
  dispersion: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  model: {
    multiple: number;
    multiple_source: string;
    comps: number;
    comparables_used: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_estimated: boolean;
  };
  farm_steps: string[];
}

/** The page's view of a row: the board row plus whether the watchlist named it. */
export interface RadarRow extends BoardRow {
  watchlist: boolean;
}

/** A live-token protocol, kept apart from the board because its token already trades. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
  age_days: number | null;
}

/** The counts the page shows above the board. */
export interface RadarStats {
  protocols: number;
  pre_token: number;
  live: number;
  watchlist: number;
  watchlist_in_board: number;
  board: number;
  early: number;
  median_multiple: number;
  median_tvl: number;
  total_implied: number;
  rising: number;
  falling: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  stats: RadarStats;
  market: MarketPrice;
  categories: CategoryPrice[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `n` into [lo, hi]. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A whole day count from the snapshot's date back to `listed_at`, or null. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of `values`; 0 when empty. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The `q` quantile of `values` by linear interpolation; 0 when empty. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

/** Four decimals, so the page and board.json round alike. */
export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** A name that ends in a release marker is a pool of another protocol, not a launch of its own. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A word that marks a receipt token: a wrapped, staked or staking product of a token that trades. */
const RECEIPT_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchanges whose name starts a product that is the exchange's, not the protocol's. */
const EXCHANGE_PREFIX = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories whose TVL belongs to a receipt or an exchange rather than a protocol that may launch. */
const RECEIPT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether the protocol records no token at all (the watchlist's own definition). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Whether the record is a wrapped, staked or bridged product of a token that already trades. */
export function isReceipt(p: SnapshotProtocol): boolean {
  if (VERSIONED.test(p.name)) return true;
  if (p.category !== null && RECEIPT_CATEGORIES.has(p.category)) return true;
  if (RECEIPT_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIX.some((prefix) => p.name.startsWith(prefix));
}

/** Whether a token-bearing protocol may price a category: a real protocol, not a receipt or an exchange. */
function isComparable(p: SnapshotProtocol): boolean {
  if (isPreToken(p)) return false;
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  if (p.tvl_usd <= 0) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  if (RECEIPT_WORD.test(p.name)) return false;
  return true;
}

/**
 * The market's price for a dollar of TVL, by category. Every comparable's multiple is first
 * winsorised into the market's own 5th to 95th percentile, so one micro-cap with a stray market
 * cap cannot claim a 400x category. The category median is then shrunk toward the market median by
 * how few comparables stand behind it, and its band is the market's own log dispersion divided by
 * the square root of those comparables: a category of one is wide, one of twenty is narrow.
 */
export function categoryPrices(snapshot: Snapshot, model: ModelConstants = MODEL): { categories: CategoryPrice[]; market: MarketPrice } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  const pick: { p: SnapshotProtocol; multiple: number }[] = [];
  for (const p of snapshot.protocols) {
    if (!isComparable(p)) continue;
    const multiple = p.mcap_usd! / p.tvl_usd;
    if (!Number.isFinite(multiple) || multiple <= 0) continue;
    all.push(multiple);
    pick.push({ p, multiple });
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(multiple);
    byCategory.set(key, list);
  }
  if (all.length === 0) {
    return {
      categories: [],
      market: { multiple: 1, low: 0.5, high: 2, comps: 0, dispersion: 1 },
    };
  }
  const p05 = quantile(all, 0.05);
  const p95 = quantile(all, 0.95);
  const winsorise = (value: number): number => clamp(value, p05, p95);
  const marketMedian = median(all.map(winsorise));
  const logs = all.map((value) => Math.log(winsorise(value)));
  const meanLog = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const dispersion = Math.max(0.35, Math.sqrt(logs.reduce((sum, value) => sum + (value - meanLog) ** 2, 0) / logs.length));
  const shrink = (value: number, comps: number): number =>
    clamp((comps * value + model.shrink_k * marketMedian) / (comps + model.shrink_k), model.multiple_floor, model.multiple_cap);
  const band = (multiple: number, comps: number): { low: number; high: number } => {
    const sigma = Math.min(model.band_log_cap, (1.28 * dispersion) / Math.sqrt(comps + 1));
    return {
      low: clamp(multiple * Math.exp(-sigma), model.multiple_floor, model.multiple_cap),
      high: clamp(multiple * Math.exp(sigma), model.multiple_floor, model.multiple_cap),
    };
  };
  const marketMultiple = clamp(marketMedian, model.multiple_floor, model.multiple_cap);
  const marketBand = band(marketMultiple, 1);

  const categories: CategoryPrice[] = [];
  for (const [category, raw] of byCategory) {
    const list = raw.map(winsorise);
    const comps = list.length;
    const categoryMedian = median(list);
    const multiple = shrink(categoryMedian, comps);
    const spread = band(multiple, comps);
    const top = pick
      .filter((x) => (x.p.category ?? 'Uncategorized') === category)
      .sort((a, b) => winsorise(b.multiple) - winsorise(a.multiple))
      .slice(0, 6)
      .map((x) => ({ name: x.p.name, symbol: x.p.symbol, tvl_usd: x.p.tvl_usd, mcap_usd: x.p.mcap_usd!, multiple: round4(winsorise(x.multiple)) }));
    categories.push({
      category,
      comps,
      median: round4(categoryMedian),
      p25: round4(quantile(list, 0.25)),
      p75: round4(quantile(list, 0.75)),
      multiple: round4(multiple),
      multiple_low: round4(spread.low),
      multiple_high: round4(spread.high),
      used: comps >= model.min_comps,
      top,
    });
  }
  categories.sort((a, b) => b.comps - a.comps || a.category.localeCompare(b.category));
  return {
    categories,
    market: { multiple: round4(marketMultiple), low: round4(marketBand.low), high: round4(marketBand.high), comps: all.length, dispersion: round4(dispersion) },
  };
}

/** The one function every row is scored by. */
export interface Score {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  multipleLow: number;
  multipleHigh: number;
  multipleSource: string;
  comps: number;
  compsUsed: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  ageEstimated: boolean;
}

/** Score one protocol under the model. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  prices: { categories: CategoryPrice[]; market: MarketPrice },
): Score {
  const age = ageDays(asOf, p.listed_at);
  const ageEstimated = age === null;
  const ageForModel = age ?? model.unknown_age_days;
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * (1 - model.maturity_floor);
  const key = p.category ?? 'Uncategorized';
  const priced = prices.categories.find((c) => c.category === key);
  const multiple = priced?.multiple ?? prices.market.multiple;
  const multipleLow = priced?.multiple_low ?? prices.market.low;
  const multipleHigh = priced?.multiple_high ?? prices.market.high;
  const comps = priced?.comps ?? 0;
  const clampValue = (n: number): number => {
    const raw = Math.round(n);
    if (!Number.isFinite(raw) || raw < 1) return 1;
    return Math.min(model.implied_cap, raw);
  };
  const base = p.tvl_usd * growthMult * maturityMult;
  return {
    implied: clampValue(base * multiple),
    low: clampValue(base * multipleLow),
    high: clampValue(base * multipleHigh),
    multiple,
    multipleLow,
    multipleHigh,
    multipleSource: priced === undefined ? 'all categories' : priced.used ? key : key + ' (thin, shrunk to market)',
    comps,
    compsUsed: priced?.comps ?? prices.market.comps,
    growthPct,
    growthMult,
    maturityMult,
    age,
    ageEstimated,
  };
}

/** A farm step before it is flattened into the one string board.json carries. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Capital per position, from the protocol's own TVL tier. */
function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 200;
  if (tvl >= 250_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

/** How long to keep the position open, from how young the protocol is. */
function holdFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The first chain a protocol names; a neutral phrase when the record names none. */
function chainName(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The protocol's main action, written for its own category. */
function mainAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('allocator')) {
    return `Deposit $${capital} of USDC into one of ${name}'s curator vaults on ${chain} and keep the vault shares, so the deposit shows as a position rather than a transfer.`;
  }
  if (c.includes('prediction')) {
    return `Fund a ${name} account with $${capital} of USDC and place four positions across different markets, then leave the rest as balance so the account stays active.`;
  }
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain}, borrow 30% of it against the position and keep the health factor above 1.8.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} in a narrow range around the current price and rebalance it once a week.`;
  }
  if (c.includes('basis')) {
    return `Open a $${capital} delta-neutral basis position through ${name} on ${chain}: buy spot, short the perp, and keep both legs open.`;
  }
  if (c.includes('rwa')) {
    return `Subscribe to $${capital} of ${name}'s tokenised fund on ${chain} and hold the receipt in the same wallet that subscribes.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and trade a small volume each week with low leverage.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}, then use a third of it in the protocol's own pools.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy open through the qualifying period.`;
  }
  if (c.includes('privacy')) {
    return `Move $${capital} through ${name} on ${chain} in two or three separate transfers and keep the notes needed to exit.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC onto ${chain} through ${name}, then swap half into the chain's main asset and stake it there.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open through the qualifying period.`;
}

/** The repeat action, which keeps the address looking like a user rather than a one-off deposit. */
function repeatAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lending') || c.includes('cdp')) return 'one repay and redraw cycle';
  if (c.includes('dex') || c.includes('yield')) return 'one small swap and a range rebalance';
  if (c.includes('prediction')) return 'one new position on a market you have an opinion on';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'one small open and close';
  if (c.includes('rwa') || c.includes('curator') || c.includes('allocator')) return 'one top-up of the same position';
  return `one small transaction on ${chain}`;
}

/**
 * A protocol's farm plan: six steps, each an action with what it costs and how long it takes. The
 * plan is derived from the protocol's own record — category, chains, TVL and age — never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainName(p);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdFor(age);
  const action = mainAction(p, capital, chain);
  const repeat = repeatAction(p, chain);
  return [
    {
      text: `Set up one wallet that holds only farm funds, on ${chain}, and fund it with $${capital} plus about $20 of gas; never reuse an address that holds your main assets.`,
      cost: 'about $20 of gas',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} in the position, about $${capital >= 150 ? 8 : 4} of fees`,
      time: '15 to 20 minutes',
    },
    {
      text: `Make ${repeat} twice a week, on different days, so the address shows recurring and varied use instead of one deposit.`,
      cost: 'about $3 of gas a week',
      time: '10 minutes, twice a week',
    },
    {
      text: `Keep the position open for at least ${hold} days and through at least two weekly snapshots; most programmes count weeks with activity, not a single deposit.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before any claim, open ${p.name}'s own app or documentation and check the claim page is on its official domain; never pay a fee to claim, and revoke approvals when you exit.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Record the address, the dates and every transaction in one log, so you can top up activity or unwind the position without guessing.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string, kept inside the gate's 20 to 600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Confirm the protocol's own page before acting.`;
  return s;
}

/**
 * The protocols the board carries: the whole watchlist, then the strongest early rows outside it.
 * The early radar is every pre-token protocol that is not a receipt token — below the house's floor
 * and above it alike — ranked by the model and cut at EARLY_ROWS. The floor is the watchlist's, not
 * the radar's ceiling.
 */
export function boardProtocols(snapshot: Snapshot, model: ModelConstants = MODEL): SnapshotProtocol[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const prices = categoryPrices(snapshot, model);
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && !isReceipt(p))
    .map((p) => ({ p, score: scoreProtocol(p, snapshot.as_of, model, prices) }))
    .sort((a, b) => b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const row of early) chosen.set(row.p.slug, row.p);
  return [...chosen.values()];
}

/** The ranked board: every chosen protocol scored, strongest first, ranks 1..n. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { rows: BoardRow[]; radar: RadarData } {
  const prices = categoryPrices(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const scored = boardProtocols(snapshot, model).map((p) => ({ p, score: scoreProtocol(p, snapshot.as_of, model, prices) }));
  scored.sort((a, b) => b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const rows: BoardRow[] = scored.map(({ p, score }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token' as const,
    age_days: score.age,
    implied_value_usd: score.implied,
    band_low_usd: score.low,
    band_high_usd: score.high,
    model: {
      multiple: round4(score.multiple),
      multiple_source: score.multipleSource,
      comps: score.comps,
      comparables_used: score.compsUsed,
      growth_pct: round4(score.growthPct),
      growth_multiplier: round4(score.growthMult),
      maturity_multiplier: round4(score.maturityMult),
      age_estimated: score.ageEstimated,
    },
    farm_steps: farmSteps(p, score.age).map(stepText),
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => isComparable(p))
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: round4(p.mcap_usd! / p.tvl_usd),
      age_days: ageDays(snapshot.as_of, p.listed_at),
    }));

  const preToken = snapshot.protocols.filter(isPreToken).length;
  const radarRows: RadarRow[] = rows.map((r) => ({ ...r, watchlist: watchlist.has(r.slug) }));
  const stats: RadarStats = {
    protocols: snapshot.protocols.length,
    pre_token: preToken,
    live: snapshot.protocols.length - preToken,
    watchlist: snapshot.watchlist.length,
    watchlist_in_board: radarRows.filter((r) => r.watchlist).length,
    board: rows.length,
    early: radarRows.filter((r) => !r.watchlist).length,
    median_multiple: round4(median(rows.map((r) => r.model.multiple))),
    median_tvl: Math.round(median(rows.map((r) => r.tvl_usd))),
    total_implied: rows.reduce((sum, r) => sum + r.implied_value_usd, 0),
    rising: rows.filter((r) => (r.change_7d ?? 0) > 5).length,
    falling: rows.filter((r) => (r.change_7d ?? 0) < -5).length,
  };

  return {
    rows,
    radar: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model,
      model_version: MODEL_VERSION,
      stats,
      market: prices.market,
      categories: prices.categories,
      rows: radarRows,
      live,
    },
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  const watchlist = new Set<string>();
  const slugs = new Set(protocols.map((p) => p.slug));
  for (const slug of o.watchlist as string[]) {
    if (slugs.has(slug)) watchlist.add(slug);
  }
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: [...watchlist] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, the gate wants at least 100`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `row ${i + 1} carries rank ${board[i]!.rank}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row shares one implied value, so the board ranks nothing';
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

/** The page's whole dataset as one script: no fetch, no network, no server. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
