// Token Radar model v2 ("launch-odds"): snapshot figures in, ranked board out.
//
// The board ranks pre-token protocols by IMPLIED VALUE, and the model keeps two
// ideas apart instead of blending them into one TVL multiple:
//
//   potential  = what a launch could be worth IF it happens
//   launchProb = how likely a launch looks from the record alone
//   implied    = round(launchProb * potential)
//
// Potential starts from TVL, because a token's value tracks the economic base it
// would govern. The multiple depends on the protocol's CATEGORY CLASS (a coarse,
// published mapping below), never on a name: capital-forming protocols (lending,
// exchanges, derivatives) historically command a higher value per dollar locked
// than pure infrastructure (bridges, chains), with consumer protocols in between.
// Growth bends the potential with a tanh curve, so a +4,448% week cannot explode
// the board the way a linear clamp would let it, and a -70% week cannot zero it.
// Breadth (number of chains) widens the potential a little: more chains, more
// users a token could reach.
//
// Launch probability is a separate, bounded score from four snapshot signals:
// age (older pre-token protocols have survived longer without a token, so the
// launch window looks nearer), 7-day growth (a growing protocol has more reason
// to launch), breadth (multi-chain protocols coordinate launches more), and size
// (log TVL: bigger protocols clear the bar for a launch team). Nothing here
// predicts WHETHER or WHEN a token appears: a high probability means the record
// looks launch-shaped, not that a launch is confirmed. Every input is a number
// from the sealed snapshot; no protocol name is ever special-cased and no
// outside fact (funding, team, points program) is used, because the snapshot
// carries none of those and inventing them would be fabrication.
//
// Confidence and risk travel with every row so the dashboard can show them:
// confidence rises when change_7d and listed_at are actually reported and
// falls when the record is thin or the growth is extreme; risk rises for very
// young, single-chain, or violently shrinking protocols.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  sector_capital: number;
  sector_consumer: number;
  sector_infra: number;
  sector_unknown: number;
  growth_weight: number;
  growth_scale: number;
  growth_floor: number;
  growth_cap: number;
  breadth_step: number;
  breadth_max: number;
  prob_floor: number;
  prob_cap: number;
  prob_age_weight: number;
  prob_growth_weight: number;
  prob_breadth_weight: number;
  prob_size_weight: number;
  age_scale_years: number;
  unknown_age_days: number;
  size_floor_usd: number;
  size_span_log10: number;
}

export const MODEL: ModelConstants = {
  sector_capital: 0.34,
  sector_consumer: 0.26,
  sector_infra: 0.18,
  sector_unknown: 0.25,
  growth_weight: 0.3,
  growth_scale: 30,
  growth_floor: -80,
  growth_cap: 300,
  breadth_step: 0.05,
  breadth_max: 5,
  prob_floor: 0.15,
  prob_cap: 0.92,
  prob_age_weight: 0.3,
  prob_growth_weight: 0.22,
  prob_breadth_weight: 0.12,
  prob_size_weight: 0.18,
  age_scale_years: 2,
  unknown_age_days: 365,
  size_floor_usd: 5_000_000,
  size_span_log10: 2,
};

export const MODEL_VERSION = 'launch-odds-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  model: {
    sector: string;
    sector_multiple: number;
    growth_pct: number;
    growth_adjustment: number;
    breadth_multiplier: number;
    launch_probability: number;
    potential_usd: number;
    age_days: number | null;
  };
  confidence: number;
  risk: 'Low' | 'Medium' | 'High';
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  sector: string;
  sector_multiple: number;
  growth_adjustment: number;
  breadth_multiplier: number;
  launch_probability: number;
  potential_usd: number;
  confidence: number;
  risk: 'Low' | 'Medium' | 'High';
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const CAPITAL_WORDS = [
  'lend', 'cdp', 'dex', 'derivative', 'yield', 'restak', 'risk curator',
  'capital allocator', 'liquidity manager', 'leveraged farm', 'basis trad',
  'collateral', 'farm', 'synthetic', 'option', 'perpetual', 'interest rate',
];
const INFRA_WORDS = ['bridge', 'chain', 'staking pool', 'oracle'];

/** The sector class of a category string: capital, infra, consumer, or unknown. */
export function sectorOf(category: string | null): { sector: string; multiple: number } {
  const c = (category ?? '').toLowerCase();
  if (c === '') return { sector: 'unknown', multiple: MODEL.sector_unknown };
  if (CAPITAL_WORDS.some((w) => c.includes(w))) return { sector: 'capital', multiple: MODEL.sector_capital };
  if (INFRA_WORDS.some((w) => c.includes(w))) return { sector: 'infra', multiple: MODEL.sector_infra };
  return { sector: 'consumer', multiple: MODEL.sector_consumer };
}

export interface Scored {
  implied: number;
  potential: number;
  launchProb: number;
  growthPct: number;
  growthAdj: number;
  breadthMult: number;
  sector: string;
  sectorMultiple: number;
  age: number | null;
  confidence: number;
  risk: 'Low' | 'Medium' | 'High';
}

/** Score one protocol: potential, launch probability, implied value, confidence, risk. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): Scored {
  const age = ageDays(asOf, p.listed_at);
  const ageYears = (age ?? model.unknown_age_days) / 365;
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthAdj = 1 + model.growth_weight * Math.tanh(growthPct / model.growth_scale);
  const breadth = clamp(p.chains.length, 1, model.breadth_max);
  const breadthMult = 1 + model.breadth_step * (breadth - 1);
  const { sector, multiple } = sectorOf(p.category);
  const potential = Math.max(1, Math.round(p.tvl_usd * multiple * growthAdj * breadthMult));

  const ageFactor = 1 - Math.exp(-ageYears / model.age_scale_years);
  const growthFactor = (Math.tanh(growthPct / model.growth_scale) + 1) / 2;
  const breadthFactor = (breadth - 1) / (model.breadth_max - 1);
  const sizeFactor = clamp(
    Math.log10(Math.max(p.tvl_usd, 1) / model.size_floor_usd) / model.size_span_log10,
    0,
    1,
  );
  const launchProb =
    0.18 +
    model.prob_age_weight * ageFactor +
    model.prob_growth_weight * growthFactor +
    model.prob_breadth_weight * breadthFactor +
    model.prob_size_weight * sizeFactor;
  const prob = clamp(launchProb, model.prob_floor, model.prob_cap);
  const implied = Math.max(1, Math.round(prob * potential));

  let confidence = 55;
  if (p.change_7d !== null) confidence += 15;
  if (p.listed_at !== null) confidence += 15;
  confidence += 5 * Math.min(p.chains.length, 3);
  if (Math.abs(growthPct) > 100) confidence -= 10;
  confidence = clamp(confidence, 30, 97);

  let riskScore = 0;
  if (age !== null && age < 90) riskScore += 2;
  if (age === null) riskScore += 1;
  if (p.chains.length <= 1) riskScore += 1;
  if (growthPct < -25) riskScore += 2;
  else if (growthPct < 0) riskScore += 1;
  if (growthPct > 200) riskScore += 1;
  if (p.tvl_usd < 25_000_000) riskScore += 1;
  const risk: 'Low' | 'Medium' | 'High' = riskScore <= 1 ? 'Low' : riskScore <= 3 ? 'Medium' : 'High';

  return {
    implied,
    potential,
    launchProb: Math.round(prob * 1000) / 1000,
    growthPct,
    growthAdj: Math.round(growthAdj * 10000) / 10000,
    breadthMult: Math.round(breadthMult * 10000) / 10000,
    sector,
    sectorMultiple: multiple,
    age,
    confidence,
    risk,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((row, i) => ({
    rank: i + 1,
    slug: row.p.slug,
    name: row.p.name,
    category: row.p.category,
    chains: row.p.chains,
    tvl_usd: row.p.tvl_usd,
    change_7d: row.p.change_7d,
    mcap_usd: row.p.mcap_usd,
    listed_at: row.p.listed_at,
    gecko_id: row.p.gecko_id,
    symbol: row.p.symbol,
    token_status: 'pre-token',
    age_days: row.s.age,
    implied_value_usd: row.s.implied,
    model: {
      sector: row.s.sector,
      sector_multiple: row.s.sectorMultiple,
      growth_pct: row.s.growthPct,
      growth_adjustment: row.s.growthAdj,
      breadth_multiplier: row.s.breadthMult,
      launch_probability: row.s.launchProb,
      potential_usd: row.s.potential,
      age_days: row.s.age,
    },
    confidence: row.s.confidence,
    risk: row.s.risk,
    farm_steps: farmSteps(row.p, row.s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 365) return 60;
  return 45;
}

/** The category's core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC on ${name} (${chain}), borrow a small amount against it, then repay the borrow within the same week.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return `Add $${capital} of liquidity to the busiest ${name} pool on ${chain} and leave it in range for the full hold period.`;
  }
  if (c.includes('yield') || c.includes('vault') || c.includes('allocator') || c.includes('curator')) {
    return `Deposit $${capital} of USDC into the main ${name} vault on ${chain} and keep the vault shares until the hold ends.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds in one app on that chain.`;
  }
  if (c.includes('stak') || c.includes('restak')) {
    return `Stake $${capital} of the native asset through ${name} on ${chain} and keep the staking receipt in the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) {
    return `Deposit $${capital} of USDC as margin on ${name} (${chain}) and open one small hedged trade, then close it the same day.`;
  }
  if (c.includes('prediction')) {
    return `Fund ${name} with $${capital} on ${chain} and take one small position in a market that settles within a week.`;
  }
  if (c.includes('stable')) {
    return `Mint or hold $${capital} of the stable asset issued through ${name} on ${chain} for the full hold period.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the yield-bearing asset offered by ${name} on ${chain} and hold it for the full hold period.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold period.`;
  }
  return `Use ${name} on ${chain} with $${capital} of USDC: deposit it in the protocol's main product and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The
 * plan is derived from the protocol's own record (category, chains, TVL, age),
 * never from a hand-written list of names. It says the protocol records no
 * token; it never claims a token exists, a points program exists, or a launch
 * date, because the snapshot carries none of those.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  return [
    {
      text: `Open a separate wallet for this farm only, fund it with $${capital} plus about $5 for gas on ${chain}, and store its seed phrase offline.`,
      cost: 'about $5 of gas to fund it',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 200 ? 10 : 5} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: secondChain === null
        ? `Repeat one real action every week on ${chain} — a deposit, swap, vote, or claim — so the wallet shows steady use.`
        : `Repeat one real action every week, alternating ${chain} and ${secondChain}, so the wallet shows steady use on both chains.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days, and do not move the funds to another wallet mid-way.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check the protocol's own rewards or points page from its official site only; if it publishes one, follow its stated rules and never pay anyone to claim.`,
      cost: 'nothing to check',
      time: '10 minutes a week',
    },
    {
      text: `Log every transaction hash, date, and amount in a farm journal, then unwind in reverse order: withdraw, bridge back, and keep the journal for tax records.`,
      cost: 'about $3 of gas to unwind',
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    sector: row.model.sector,
    sector_multiple: row.model.sector_multiple,
    growth_adjustment: row.model.growth_adjustment,
    breadth_multiplier: row.model.breadth_multiplier,
    launch_probability: row.model.launch_probability,
    potential_usd: row.model.potential_usd,
    confidence: row.confidence,
    risk: row.risk,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: [...snapshot.watchlist].sort(),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
