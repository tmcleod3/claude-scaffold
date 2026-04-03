/**
 * Pattern: Execution Safety (Trading / Financial Order Management)
 *
 * Key principles:
 * - Exchange precision (tick size, lot size, min notional) fetched from API — NEVER hardcoded
 * - Every order validated before submission: size limits, price bounds, rate limits
 * - Paper/live toggle via interface — same code path, different backend
 * - Reconciliation: compare local state vs exchange fills — detect drift immediately
 * - Circuit breaker: auto-pause after consecutive losses or drawdown threshold
 * - Audit trail: every order logged with timestamp, reason, fill, and result
 * - Position limits enforced at portfolio level, not just per-order
 *
 * Agents: Stark (backend), Kenobi (security), L (monitoring)
 *
 * Framework adaptations:
 *   TypeScript: This file (generic execution backend interface)
 *   Python/CCXT: Crypto exchanges (see bottom)
 *   Python/Alpaca: US equities (see bottom)
 *   Any financial API: Implement ExecutionBackend interface
 */

// ── Order Types ─────────────────────────────────────────

type OrderSide = 'buy' | 'sell';
type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
type OrderStatus = 'pending' | 'submitted' | 'partial' | 'filled' | 'cancelled' | 'rejected';

interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  /** Quantity in base units (e.g., shares, coins) */
  size: number;
  /** Required for limit and stop-limit orders */
  price?: number;
  /** Required for stop and stop-limit orders */
  stopPrice?: number;
  /** Strategy-provided reason for audit trail */
  reason: string;
  /** Client-generated ID for idempotent submission */
  clientOrderId: string;
}

interface OrderResult {
  orderId: string;
  clientOrderId: string;
  status: OrderStatus;
  filledSize: number;
  avgFillPrice: number;
  commission: number;
  timestamp: string;
  rawResponse: Record<string, unknown>;
}

// ── Exchange Precision ──────────────────────────────────
// NEVER hardcode these values. Always fetch from the exchange API.
// Precision rules change — hardcoded values WILL cause order rejections.

interface ExchangePrecision {
  symbol: string;
  /** Minimum price increment (e.g., 0.01 for USD stocks) */
  tickSize: number;
  /** Minimum quantity increment (e.g., 0.001 for BTC) */
  lotSize: number;
  /** Minimum order value in quote currency (e.g., $10) */
  minNotional: number;
  /** Maximum order size */
  maxSize: number;
  /** Decimal places for price */
  pricePrecision: number;
  /** Decimal places for quantity */
  quantityPrecision: number;
  /** When this precision data was fetched — refetch if stale */
  fetchedAt: string;
}

function roundToTickSize(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

function roundToLotSize(quantity: number, lotSize: number): number {
  return Math.floor(quantity / lotSize) * lotSize;
}

function roundToPrecision(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ── Order Validation ────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

function validateOrder(
  order: OrderRequest,
  precision: ExchangePrecision,
  portfolio: { cash: number; maxOrderSize: number }
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Size checks
  if (order.size <= 0) {
    errors.push({ field: 'size', message: 'Order size must be positive' });
  }
  if (order.size < precision.lotSize) {
    errors.push({ field: 'size', message: `Size ${order.size} below lot size ${precision.lotSize}` });
  }
  if (order.size > precision.maxSize) {
    errors.push({ field: 'size', message: `Size ${order.size} exceeds max ${precision.maxSize}` });
  }
  if (order.size > portfolio.maxOrderSize) {
    errors.push({ field: 'size', message: `Size exceeds portfolio max order size ${portfolio.maxOrderSize}` });
  }

  // Lot size alignment
  const rounded = roundToLotSize(order.size, precision.lotSize);
  if (rounded !== order.size) {
    errors.push({ field: 'size', message: `Size ${order.size} not aligned to lot size ${precision.lotSize}` });
  }

  // Price checks (for limit/stop orders)
  if (order.type === 'limit' || order.type === 'stop-limit') {
    if (order.price == null) {
      errors.push({ field: 'price', message: 'Limit orders require a price' });
    } else {
      if (order.price <= 0) {
        errors.push({ field: 'price', message: 'Price must be positive' });
      }
      const roundedPrice = roundToTickSize(order.price, precision.tickSize);
      if (roundedPrice !== order.price) {
        errors.push({ field: 'price', message: `Price not aligned to tick size ${precision.tickSize}` });
      }
    }
  }

  // Stop price check
  if ((order.type === 'stop' || order.type === 'stop-limit') && order.stopPrice == null) {
    errors.push({ field: 'stopPrice', message: 'Stop orders require a stop price' });
  }

  // Minimum notional check
  const estimatedValue = order.size * (order.price ?? 0);
  if (order.type !== 'market' && estimatedValue < precision.minNotional) {
    errors.push({ field: 'notional', message: `Order value ${estimatedValue} below minimum ${precision.minNotional}` });
  }

  // Cash sufficiency (buy orders only)
  if (order.side === 'buy' && estimatedValue > portfolio.cash) {
    errors.push({ field: 'cash', message: 'Insufficient cash for order' });
  }

  return errors;
}

// ── Execution Backend Interface ─────────────────────────
// Paper and live trading implement the same interface.
// Switch between them via configuration — never via code branching.

interface ExecutionBackend {
  name: string;
  /** Fetch exchange precision rules — call on startup and periodically */
  fetchPrecision(symbol: string): Promise<ExchangePrecision>;
  /** Submit an order */
  submitOrder(order: OrderRequest): Promise<OrderResult>;
  /** Cancel an order */
  cancelOrder(orderId: string): Promise<void>;
  /** Get current open orders */
  getOpenOrders(symbol?: string): Promise<OrderResult[]>;
  /** Get fills for reconciliation */
  getFills(since: string): Promise<OrderResult[]>;
}

// ── Paper Trading Backend ───────────────────────────────

class PaperBackend implements ExecutionBackend {
  name = 'paper';
  private orders: Map<string, OrderResult> = new Map();
  private nextId = 1;

  async fetchPrecision(symbol: string): Promise<ExchangePrecision> {
    // Paper mode uses reasonable defaults — but real precision should
    // still be fetched from the target exchange for realistic simulation
    return {
      symbol,
      tickSize: 0.01,
      lotSize: 1,
      minNotional: 10,
      maxSize: 100000,
      pricePrecision: 2,
      quantityPrecision: 0,
      fetchedAt: new Date().toISOString(),
    };
  }

  async submitOrder(order: OrderRequest): Promise<OrderResult> {
    const result: OrderResult = {
      orderId: `paper-${this.nextId++}`,
      clientOrderId: order.clientOrderId,
      status: 'filled',
      filledSize: order.size,
      avgFillPrice: order.price ?? 0,
      commission: 0,
      timestamp: new Date().toISOString(),
      rawResponse: { simulated: true },
    };
    this.orders.set(result.orderId, result);
    return result;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (order) order.status = 'cancelled';
  }

  async getOpenOrders(): Promise<OrderResult[]> {
    return [...this.orders.values()].filter(o => o.status === 'pending' || o.status === 'submitted');
  }

  async getFills(since: string): Promise<OrderResult[]> {
    return [...this.orders.values()].filter(o => o.status === 'filled' && o.timestamp >= since);
  }
}

// ── Position Manager ────────────────────────────────────

interface PositionLimits {
  /** Maximum total exposure as fraction of equity (0.0 - 1.0) */
  maxExposure: number;
  /** Maximum exposure per symbol as fraction of equity */
  maxPerSymbol: number;
  /** Maximum number of concurrent positions */
  maxPositions: number;
  /** Stop-loss percentage — auto-close at this drawdown */
  stopLossPct: number;
}

interface ManagedPosition {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLossPrice: number;
  unrealizedPnl: number;
  openedAt: string;
}

class PositionManager {
  private positions: Map<string, ManagedPosition> = new Map();
  private limits: PositionLimits;
  private equity: number;

  constructor(limits: PositionLimits, initialEquity: number) {
    this.limits = limits;
    this.equity = initialEquity;
  }

  canOpenPosition(symbol: string, size: number, price: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const orderValue = size * price;

    // Position count limit
    if (!this.positions.has(symbol) && this.positions.size >= this.limits.maxPositions) {
      errors.push({ field: 'positions', message: `At maximum position count (${this.limits.maxPositions})` });
    }

    // Per-symbol exposure limit
    const existingExposure = this.getSymbolExposure(symbol);
    if ((existingExposure + orderValue) / this.equity > this.limits.maxPerSymbol) {
      errors.push({ field: 'exposure', message: `Would exceed per-symbol limit (${this.limits.maxPerSymbol * 100}%)` });
    }

    // Total portfolio exposure limit
    const totalExposure = this.getTotalExposure();
    if ((totalExposure + orderValue) / this.equity > this.limits.maxExposure) {
      errors.push({ field: 'exposure', message: `Would exceed total exposure limit (${this.limits.maxExposure * 100}%)` });
    }

    return errors;
  }

  /** Check all positions for stop-loss triggers. Returns symbols to close. */
  checkStopLosses(currentPrices: Map<string, number>): string[] {
    const triggered: string[] = [];
    for (const [symbol, pos] of this.positions) {
      const currentPrice = currentPrices.get(symbol);
      if (currentPrice == null) continue;

      pos.currentPrice = currentPrice;
      pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity * (pos.side === 'buy' ? 1 : -1);

      if (pos.side === 'buy' && currentPrice <= pos.stopLossPrice) {
        triggered.push(symbol);
      } else if (pos.side === 'sell' && currentPrice >= pos.stopLossPrice) {
        triggered.push(symbol);
      }
    }
    return triggered;
  }

  private getSymbolExposure(symbol: string): number {
    const pos = this.positions.get(symbol);
    return pos ? pos.quantity * pos.currentPrice : 0;
  }

  private getTotalExposure(): number {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.quantity * pos.currentPrice;
    }
    return total;
  }
}

// ── Circuit Breaker ─────────────────────────────────────

interface CircuitBreakerConfig {
  /** Pause after this many consecutive losses */
  maxConsecutiveLosses: number;
  /** Pause if drawdown exceeds this percentage (0.0 - 1.0) */
  maxDrawdownPct: number;
  /** Cooldown period before resuming (milliseconds) */
  cooldownMs: number;
  /** Callback when circuit breaker trips */
  onTrip: (reason: string) => void;
}

class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private consecutiveLosses = 0;
  private peakEquity: number;
  private trippedAt: number | null = null;

  constructor(config: CircuitBreakerConfig, initialEquity: number) {
    this.config = config;
    this.peakEquity = initialEquity;
  }

  /** Record a trade result. Returns true if trading should continue. */
  recordTrade(pnl: number): boolean {
    if (pnl < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this.trip(`${this.consecutiveLosses} consecutive losses`);
        return false;
      }
    } else {
      this.consecutiveLosses = 0;
    }
    return !this.isTripped();
  }

  /** Update equity and check drawdown. Returns true if trading should continue. */
  updateEquity(currentEquity: number): boolean {
    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }
    const drawdown = (this.peakEquity - currentEquity) / this.peakEquity;
    if (drawdown >= this.config.maxDrawdownPct) {
      this.trip(`Drawdown ${(drawdown * 100).toFixed(1)}% exceeds limit ${(this.config.maxDrawdownPct * 100).toFixed(1)}%`);
      return false;
    }
    return !this.isTripped();
  }

  isTripped(): boolean {
    if (this.trippedAt == null) return false;
    if (Date.now() - this.trippedAt >= this.config.cooldownMs) {
      this.reset();
      return false;
    }
    return true;
  }

  private trip(reason: string): void {
    this.trippedAt = Date.now();
    this.config.onTrip(reason);
  }

  private reset(): void {
    this.trippedAt = null;
    this.consecutiveLosses = 0;
  }
}

// ── Audit Trail ─────────────────────────────────────────

interface AuditEntry {
  timestamp: string;
  action: 'submit' | 'fill' | 'cancel' | 'reject' | 'stop-loss' | 'circuit-break';
  order: OrderRequest | null;
  result: OrderResult | null;
  reason: string;
  portfolioState: { cash: number; equity: number; positionCount: number };
}

class AuditTrail {
  private entries: AuditEntry[] = [];
  private onLog?: (entry: AuditEntry) => void;

  constructor(onLog?: (entry: AuditEntry) => void) {
    this.onLog = onLog;
  }

  record(entry: Omit<AuditEntry, 'timestamp'>): void {
    const full: AuditEntry = { ...entry, timestamp: new Date().toISOString() };
    this.entries.push(full);
    this.onLog?.(full);

    // Structured JSON logging — never log PII or API keys
    console.log(JSON.stringify({
      event: `order.${full.action}`,
      symbol: full.order?.symbol,
      side: full.order?.side,
      size: full.order?.size,
      reason: full.reason,
      orderId: full.result?.orderId,
      fillPrice: full.result?.avgFillPrice,
      equity: full.portfolioState.equity,
    }));
  }

  getEntries(): readonly AuditEntry[] {
    return this.entries;
  }
}

// ── Reconciliation ──────────────────────────────────────

interface ReconciliationResult {
  matched: number;
  mismatched: number;
  missingLocal: string[];    // Orders on exchange not tracked locally
  missingExchange: string[]; // Local orders not found on exchange
  priceDifferences: Array<{ orderId: string; localPrice: number; exchangePrice: number }>;
}

function reconcile(
  localOrders: OrderResult[],
  exchangeFills: OrderResult[]
): ReconciliationResult {
  const exchangeMap = new Map(exchangeFills.map(f => [f.clientOrderId, f]));
  const localMap = new Map(localOrders.map(o => [o.clientOrderId, o]));

  let matched = 0;
  let mismatched = 0;
  const missingExchange: string[] = [];
  const priceDifferences: Array<{ orderId: string; localPrice: number; exchangePrice: number }> = [];

  for (const [clientId, local] of localMap) {
    const exchange = exchangeMap.get(clientId);
    if (!exchange) {
      missingExchange.push(clientId);
      continue;
    }
    if (Math.abs(local.avgFillPrice - exchange.avgFillPrice) > 0.0001) {
      priceDifferences.push({
        orderId: clientId,
        localPrice: local.avgFillPrice,
        exchangePrice: exchange.avgFillPrice,
      });
      mismatched++;
    } else {
      matched++;
    }
  }

  const missingLocal = exchangeFills
    .filter(f => !localMap.has(f.clientOrderId))
    .map(f => f.clientOrderId);

  return { matched, mismatched, missingLocal, missingExchange, priceDifferences };
}

export type {
  OrderRequest, OrderResult, OrderSide, OrderType, OrderStatus,
  ExchangePrecision, ExecutionBackend, ValidationError,
  PositionLimits, ManagedPosition, CircuitBreakerConfig,
  AuditEntry, ReconciliationResult,
};
export {
  roundToTickSize, roundToLotSize, roundToPrecision,
  validateOrder, reconcile,
  PaperBackend, PositionManager, CircuitBreaker, AuditTrail,
};

// ── Framework Adaptations ───────────────────────────────
//
// === Python / CCXT (Crypto Exchanges) ===
//
//   import ccxt
//
//   exchange = ccxt.binance({"apiKey": "...", "secret": "..."})
//   exchange.set_sandbox_mode(True)  # Paper trading toggle
//
//   # Fetch precision from exchange — NEVER hardcode
//   markets = exchange.load_markets()
//   info = markets["BTC/USDT"]
//   tick_size = info["precision"]["price"]
//   lot_size = info["precision"]["amount"]
//   min_notional = info["limits"]["cost"]["min"]
//
//   # Round to exchange precision
//   price = exchange.price_to_precision("BTC/USDT", raw_price)
//   amount = exchange.amount_to_precision("BTC/USDT", raw_amount)
//
//   # Submit order
//   order = exchange.create_limit_buy_order("BTC/USDT", amount, price)
//
//   # Reconciliation
//   fills = exchange.fetch_my_trades("BTC/USDT", since=timestamp)
//   # Compare fills against local order log
//
//   # CCXT handles 40+ exchanges with the same interface — same as ExecutionBackend pattern
//
// === Python / Alpaca (US Equities) ===
//
//   from alpaca.trading.client import TradingClient
//   from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
//   from alpaca.trading.enums import OrderSide, TimeInForce
//
//   # Paper vs live: just change the base_url
//   client = TradingClient(api_key, secret_key, paper=True)
//
//   # Submit order
//   order = client.submit_order(
//       MarketOrderRequest(
//           symbol="AAPL", qty=10, side=OrderSide.BUY,
//           time_in_force=TimeInForce.DAY,
//           client_order_id="my-unique-id"  # Idempotency
//       )
//   )
//
//   # Position management
//   positions = client.get_all_positions()
//   account = client.get_account()
//   buying_power = float(account.buying_power)
//
//   # Reconciliation: compare client.get_orders() vs local state
//
// === IBKR (Interactive Brokers) ===
//
//   # Use ib_insync (Python) or official TWS API
//   from ib_insync import IB, Stock, LimitOrder
//
//   ib = IB()
//   ib.connect("127.0.0.1", 7497, clientId=1)  # 7497=paper, 7496=live
//
//   contract = Stock("AAPL", "SMART", "USD")
//   ib.qualifyContracts(contract)
//
//   # Precision: contract details include min tick, lot size
//   details = ib.reqContractDetails(contract)[0]
//   min_tick = details.minTick
//
//   order = LimitOrder("BUY", 10, round(price / min_tick) * min_tick)
//   trade = ib.placeOrder(contract, order)
//
//   # IBKR supports paper trading on port 7497 — same code, different port

// ── Anti-Patterns ──────────────────────────────────────
//
// === Never raw transfer() to smart contracts ===
//
// ERC20 `transfer(address, amount)` to a smart contract deposits funds with
// no guarantee of recovery. Smart contracts may lack withdrawal functions,
// absorb tokens into settlement pools, or have no rescue mechanism.
//
// Before any on-chain transfer:
// 1. Read the contract's ABI — verify the correct deposit/funding function
// 2. Check if the contract has a withdrawal or recovery function
// 3. Use the contract's own deposit method, not raw transfer()
// 4. For amounts >$100, simulate the transaction first (eth_call)
//
// This applies to any on-chain execution — Ethereum, L2s, Solana (via CPI).
//
// === Derive Don't Accumulate ===
//
// Never maintain a running balance by incrementing/decrementing on each event.
// Running totals drift due to: missed events, duplicate processing, rounding
// errors, and partial fills that update one side but not the other.
//
// Instead, derive the current state from the source of truth:
//
//   // WRONG: running accumulator
//   this.totalPnl += trade.pnl;
//   this.positionSize += trade.filledSize;
//
//   // RIGHT: derive from complete history
//   const fills = await backend.getFills(since);
//   const totalPnl = fills.reduce((sum, f) => sum + f.pnl, 0);
//   const positionSize = fills.reduce(
//     (sum, f) => sum + f.filledSize * (f.side === 'buy' ? 1 : -1), 0
//   );
//
// For reconciliation, the derived value IS the value. If the derived value
// disagrees with an accumulator, the accumulator is wrong — always.
// (Field reports #271, #274, #275)
