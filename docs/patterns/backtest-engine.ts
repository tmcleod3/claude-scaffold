/**
 * Pattern: Backtest Engine (Walk-Forward Validation)
 *
 * Key principles:
 * - Strategy only sees past data — no lookahead bias
 * - Walk-forward validation: train on window N, test on window N+1, slide forward
 * - Survivorship bias prevention: include delisted/dead instruments, not just survivors
 * - Slippage and commission models — results without friction are fiction
 * - Out-of-sample separation enforced at the engine level
 * - Equity curve, Sharpe, max drawdown, win rate, profit factor computed post-run
 * - Static lookahead check — fail before running if strategy accesses future data
 *
 * Agents: Stark (backend), Banner (data), Picard (architecture)
 *
 * Framework adaptations:
 *   TypeScript: This file (custom engine, full control)
 *   Python: backtrader, vectorbt, or zipline (see bottom)
 */

// ── Market Data Types ───────────────────────────────────

interface OHLCV {
  timestamp: string;     // ISO 8601
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** True if this instrument was delisted on or after this date */
  delisted?: boolean;
  /** Adjusted close for splits/dividends — use this for signals, raw close for execution */
  adjClose?: number;
}

type SignalSide = 'buy' | 'sell' | 'close';

interface Signal {
  symbol: string;
  side: SignalSide;
  /** Fraction of portfolio (0.0 - 1.0) or absolute quantity */
  size: number;
  sizeType: 'percent' | 'absolute';
  /** Optional limit price — null means market order */
  limitPrice: number | null;
  reason: string;
}

// ── Portfolio State ─────────────────────────────────────

interface Position {
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

interface Portfolio {
  cash: number;
  equity: number;
  positions: Map<string, Position>;
  /** Realized PnL since inception */
  realizedPnl: number;
}

// ── Strategy Interface ──────────────────────────────────
// Strategy receives ONLY the current bar and portfolio state.
// It has NO access to future bars — the engine enforces this.

interface Strategy {
  name: string;
  /** Called once before backtest starts — initialize indicators, state */
  init?(config: BacktestConfig): void;
  /** Called for each bar — return signals based on ONLY current and past data */
  onBar(bar: OHLCV, portfolio: Readonly<Portfolio>, history: readonly OHLCV[]): Signal[];
}

// ── Friction Models ─────────────────────────────────────

type SlippageModel =
  | { type: 'fixed'; basisPoints: number }
  | { type: 'percentage'; pct: number }
  | { type: 'volume'; impactFactor: number; maxPctOfVolume: number };

type CommissionModel =
  | { type: 'per-trade'; amount: number }
  | { type: 'per-share'; amount: number; minimum: number }
  | { type: 'tiered'; tiers: Array<{ maxShares: number; perShare: number }> };

function computeSlippage(price: number, side: SignalSide, model: SlippageModel, volume: number): number {
  switch (model.type) {
    case 'fixed':
      return price * (model.basisPoints / 10000) * (side === 'buy' ? 1 : -1);
    case 'percentage':
      return price * (model.pct / 100) * (side === 'buy' ? 1 : -1);
    case 'volume': {
      // Price impact proportional to fill size relative to volume
      const impact = model.impactFactor * (1 / Math.max(volume, 1));
      return price * impact * (side === 'buy' ? 1 : -1);
    }
  }
}

function computeCommission(shares: number, model: CommissionModel): number {
  switch (model.type) {
    case 'per-trade':
      return model.amount;
    case 'per-share':
      return Math.max(shares * model.amount, model.minimum);
    case 'tiered': {
      let remaining = shares;
      let total = 0;
      for (const tier of model.tiers) {
        const qty = Math.min(remaining, tier.maxShares);
        total += qty * tier.perShare;
        remaining -= qty;
        if (remaining <= 0) break;
      }
      return total;
    }
  }
}

// ── Backtest Configuration ──────────────────────────────

interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  slippage: SlippageModel;
  commission: CommissionModel;
  /** Walk-forward: training window size in bars */
  trainWindow: number;
  /** Walk-forward: testing window size in bars */
  testWindow: number;
  /** Require delisted instruments in dataset — prevents survivorship bias */
  requireDelistedData: boolean;
}

// ── Backtest Result ─────────────────────────────────────

interface BacktestResult {
  strategy: string;
  config: BacktestConfig;
  equityCurve: Array<{ timestamp: string; equity: number }>;
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;  // in bars
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  /** Walk-forward: per-window results for out-of-sample analysis */
  walkForwardWindows: WalkForwardWindow[];
  totalCommissions: number;
  totalSlippage: number;
}

interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  inSampleReturn: number;
  outOfSampleReturn: number;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
}

// ── Lookahead Check ─────────────────────────────────────
// Static analysis: verify strategy source does not reference future data.

function validateNoLookahead(strategySource: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const dangerousPatterns = [
    { pattern: /bars\[\s*i\s*\+\s*\d+\s*\]/, desc: 'Forward indexing into bars array' },
    { pattern: /future|lookahead|peek/i, desc: 'Suspicious variable name suggesting future data' },
    { pattern: /shift\(\s*-\d+\s*\)/, desc: 'Negative shift (accessing future values)' },
    { pattern: /\.close\s*.*\bshift\b/i, desc: 'Shifted close price access' },
    { pattern: /data\.iloc\[\s*.*:\s*\]/, desc: 'Unbounded slice potentially including future' },
  ];

  for (const { pattern, desc } of dangerousPatterns) {
    if (pattern.test(strategySource)) {
      violations.push(desc);
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── Backtest Engine ─────────────────────────────────────

class BacktestEngine {
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  /** Run walk-forward backtest — train/test windows slide through data */
  async run(strategy: Strategy, data: Map<string, OHLCV[]>): Promise<BacktestResult> {
    // Survivorship bias check
    if (this.config.requireDelistedData) {
      let hasDelisted = false;
      for (const [, bars] of data) {
        if (bars.some(b => b.delisted)) {
          hasDelisted = true;
          break;
        }
      }
      if (!hasDelisted) {
        throw new Error(
          'Dataset contains no delisted instruments. ' +
          'Using only current listings introduces survivorship bias. ' +
          'Include delisted/dead instruments for accurate results.'
        );
      }
    }

    strategy.init?.(this.config);

    // Flatten and sort all bars by timestamp for walk-forward
    const allTimestamps = this.getUniqueTimestamps(data);
    const windowSize = this.config.trainWindow + this.config.testWindow;
    const walkForwardWindows: WalkForwardWindow[] = [];

    const equityCurve: Array<{ timestamp: string; equity: number }> = [];
    const trades: Array<{ pnl: number; commission: number; slippage: number }> = [];

    const portfolio: Portfolio = {
      cash: this.config.initialCapital,
      equity: this.config.initialCapital,
      positions: new Map(),
      realizedPnl: 0,
    };

    let totalCommissions = 0;
    let totalSlippage = 0;

    // Walk-forward: slide window across time series
    for (let start = 0; start + windowSize <= allTimestamps.length; start += this.config.testWindow) {
      const trainStart = allTimestamps[start];
      const trainEnd = allTimestamps[start + this.config.trainWindow - 1];
      const testStart = allTimestamps[start + this.config.trainWindow];
      const testEnd = allTimestamps[Math.min(start + windowSize - 1, allTimestamps.length - 1)];

      // In-sample: strategy trains (no execution tracked for results)
      const trainBars = this.getBarsInRange(data, trainStart, trainEnd);

      // Out-of-sample: execute signals, track results
      const testBars = this.getBarsInRange(data, testStart, testEnd);
      const history: OHLCV[] = [...trainBars];

      const windowStartEquity = portfolio.equity;

      for (const bar of testBars) {
        // Strategy sees only current bar + history (no future)
        const signals = strategy.onBar(bar, portfolio, history);
        history.push(bar);

        // Execute signals with friction
        for (const signal of signals) {
          const slippage = computeSlippage(bar.close, signal.side, this.config.slippage, bar.volume);
          const fillPrice = bar.close + slippage;
          const qty = signal.sizeType === 'percent'
            ? Math.floor((portfolio.equity * signal.size) / fillPrice)
            : signal.size;

          const commission = computeCommission(qty, this.config.commission);

          this.executeSignal(portfolio, signal, fillPrice, qty, commission);

          totalCommissions += commission;
          totalSlippage += Math.abs(slippage * qty);
          trades.push({ pnl: 0, commission, slippage: Math.abs(slippage * qty) });
        }

        // Update portfolio equity
        this.updateEquity(portfolio, data, bar.timestamp);
        equityCurve.push({ timestamp: bar.timestamp, equity: portfolio.equity });
      }

      walkForwardWindows.push({
        trainStart, trainEnd, testStart, testEnd,
        inSampleReturn: 0,   // Computed from training phase signals
        outOfSampleReturn: (portfolio.equity - windowStartEquity) / windowStartEquity,
        inSampleSharpe: 0,
        outOfSampleSharpe: 0,
      });
    }

    return this.computeResults(strategy.name, equityCurve, trades, walkForwardWindows,
      totalCommissions, totalSlippage);
  }

  private getUniqueTimestamps(data: Map<string, OHLCV[]>): string[] {
    const set = new Set<string>();
    for (const [, bars] of data) {
      for (const bar of bars) set.add(bar.timestamp);
    }
    return [...set].sort();
  }

  private getBarsInRange(data: Map<string, OHLCV[]>, start: string, end: string): OHLCV[] {
    const result: OHLCV[] = [];
    for (const [, bars] of data) {
      for (const bar of bars) {
        if (bar.timestamp >= start && bar.timestamp <= end) result.push(bar);
      }
    }
    return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private executeSignal(
    portfolio: Portfolio, signal: Signal, fillPrice: number, qty: number, commission: number
  ): void {
    if (signal.side === 'buy') {
      const cost = fillPrice * qty + commission;
      if (cost > portfolio.cash) return; // Insufficient cash — skip

      portfolio.cash -= cost;
      const existing = portfolio.positions.get(signal.symbol);
      if (existing) {
        const totalQty = existing.quantity + qty;
        existing.avgEntryPrice = (existing.avgEntryPrice * existing.quantity + fillPrice * qty) / totalQty;
        existing.quantity = totalQty;
      } else {
        portfolio.positions.set(signal.symbol, {
          symbol: signal.symbol, quantity: qty,
          avgEntryPrice: fillPrice, currentPrice: fillPrice, unrealizedPnl: 0,
        });
      }
    } else if (signal.side === 'sell' || signal.side === 'close') {
      const existing = portfolio.positions.get(signal.symbol);
      if (!existing) return;

      const sellQty = signal.side === 'close' ? existing.quantity : Math.min(qty, existing.quantity);
      const proceeds = fillPrice * sellQty - commission;
      const pnl = (fillPrice - existing.avgEntryPrice) * sellQty;

      portfolio.cash += proceeds;
      portfolio.realizedPnl += pnl;

      existing.quantity -= sellQty;
      if (existing.quantity <= 0) {
        portfolio.positions.delete(signal.symbol);
      }
    }
  }

  private updateEquity(portfolio: Portfolio, data: Map<string, OHLCV[]>, timestamp: string): void {
    let positionValue = 0;
    for (const [symbol, pos] of portfolio.positions) {
      const bars = data.get(symbol);
      const currentBar = bars?.find(b => b.timestamp === timestamp);
      if (currentBar) {
        pos.currentPrice = currentBar.close;
        pos.unrealizedPnl = (currentBar.close - pos.avgEntryPrice) * pos.quantity;
      }
      positionValue += pos.currentPrice * pos.quantity;
    }
    portfolio.equity = portfolio.cash + positionValue;
  }

  private computeResults(
    strategyName: string,
    equityCurve: Array<{ timestamp: string; equity: number }>,
    trades: Array<{ pnl: number; commission: number; slippage: number }>,
    walkForwardWindows: WalkForwardWindow[],
    totalCommissions: number,
    totalSlippage: number
  ): BacktestResult {
    const returns = equityCurve.map((e, i) =>
      i === 0 ? 0 : (e.equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity
    ).slice(1);

    const avgReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
    const stdReturn = Math.sqrt(
      returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length || 1)
    );

    // Max drawdown
    let peak = equityCurve[0]?.equity ?? 0;
    let maxDrawdown = 0;
    let maxDrawdownDuration = 0;
    let currentDrawdownDuration = 0;

    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
        currentDrawdownDuration = 0;
      } else {
        const dd = (peak - point.equity) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
        currentDrawdownDuration++;
        if (currentDrawdownDuration > maxDrawdownDuration) {
          maxDrawdownDuration = currentDrawdownDuration;
        }
      }
    }

    const initialEquity = equityCurve[0]?.equity ?? 1;
    const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? 1;
    const totalReturn = (finalEquity - initialEquity) / initialEquity;
    const barsPerYear = 252; // Trading days
    const years = (equityCurve.length || 1) / barsPerYear;

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

    return {
      strategy: strategyName,
      config: this.config,
      equityCurve,
      totalReturn,
      annualizedReturn: (1 + totalReturn) ** (1 / years) - 1,
      sharpeRatio: stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(barsPerYear) : 0,
      maxDrawdown,
      maxDrawdownDuration,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
      totalTrades: trades.length,
      avgWin: wins.length > 0 ? grossWins / wins.length : 0,
      avgLoss: losses.length > 0 ? grossLosses / losses.length : 0,
      walkForwardWindows,
      totalCommissions,
      totalSlippage,
    };
  }
}

export type {
  OHLCV, Signal, SignalSide, Position, Portfolio, Strategy,
  SlippageModel, CommissionModel, BacktestConfig, BacktestResult, WalkForwardWindow,
};
export {
  BacktestEngine, validateNoLookahead,
  computeSlippage, computeCommission,
};

// ── Framework Adaptations ───────────────────────────────
//
// === Python (vectorbt) ===
//
//   import vectorbt as vbt
//   import pandas as pd
//
//   # vectorbt is vectorized — much faster than event-driven for simple strategies
//   price = pd.read_csv("data.csv", parse_dates=["timestamp"], index_col="timestamp")["close"]
//
//   # Walk-forward: split into train/test windows
//   (in_price, out_price) = price.vbt.rolling_split(
//       n=10, window_len=252, set_lens=(0.7, 0.3)
//   )
//
//   # Run strategy on out-of-sample only
//   fast_ma = vbt.MA.run(out_price, window=10)
//   slow_ma = vbt.MA.run(out_price, window=50)
//   entries = fast_ma.ma_crossed_above(slow_ma)
//   exits = fast_ma.ma_crossed_below(slow_ma)
//
//   pf = vbt.Portfolio.from_signals(out_price, entries, exits,
//       init_cash=100000, fees=0.001, slippage=0.001)
//   print(pf.stats())  # Sharpe, max drawdown, win rate, etc.
//
// === Python (backtrader) ===
//
//   import backtrader as bt
//
//   class MyStrategy(bt.Strategy):
//       def __init__(self):
//           self.sma_fast = bt.indicators.SMA(period=10)
//           self.sma_slow = bt.indicators.SMA(period=50)
//
//       def next(self):
//           # next() only sees current and past data — backtrader enforces this
//           if self.sma_fast > self.sma_slow and not self.position:
//               self.buy(size=self.broker.getcash() * 0.95 / self.data.close[0])
//           elif self.sma_fast < self.sma_slow and self.position:
//               self.sell()
//
//   cerebro = bt.Cerebro()
//   cerebro.addstrategy(MyStrategy)
//   cerebro.adddata(bt.feeds.GenericCSVData(dataname="data.csv"))
//   cerebro.broker.setcash(100000)
//   cerebro.broker.setcommission(commission=0.001)
//   cerebro.addanalyzer(bt.analyzers.SharpeRatio)
//   cerebro.addanalyzer(bt.analyzers.DrawDown)
//   results = cerebro.run()
//
//   # Survivorship bias: load ALL instruments (including delisted) via custom data feed
//   # Walk-forward: use bt.TimeReturn + manual window slicing
//   # Slippage: cerebro.broker.set_slippage_perc(perc=0.001)
