/**
 * Anomaly Detection — Spend spikes, traffic drops, conversion changes (§9.17).
 *
 * Runs hourly as a heartbeat daemon scheduled job.
 * Compares current metrics against rolling averages.
 * Alerts when deviations exceed thresholds.
 *
 * PRD Reference: §9.7 (hourly anomaly detection), §9.17 (thresholds)
 */

type Cents = number & { readonly __brand: 'Cents' };

// ── Anomaly Types ─────────────────────────────────────

type AnomalyType = 'spend_spike' | 'traffic_drop' | 'conversion_change' | 'roas_drop';
type AnomalySeverity = 'warning' | 'alert' | 'critical';

interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  platform?: string;
  metric: string;
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  message: string;           // Self-contained for screen readers (§9.15.8)
  timestamp: string;
}

// ── Thresholds ────────────────────────────────────────

const THRESHOLDS = {
  // Spend spike: current hour spend > X% of daily average hourly spend
  spendSpikeWarning: 50,     // 50% above average
  spendSpikeAlert: 100,      // 100% above average (double)
  spendSpikeCritical: 200,   // 200% above average (triple)

  // Traffic drop: current day traffic > X% below 7-day average
  trafficDropWarning: 20,    // 20% below average
  trafficDropAlert: 40,      // 40% below average
  trafficDropCritical: 60,   // 60% below average

  // Conversion rate change: > X% from 7-day average
  conversionChangeThreshold: 20, // 20% change in either direction

  // ROAS drop: current < X% of 7-day average
  roasDropWarning: 20,       // 20% below average
  roasDropAlert: 40,         // 40% below average
};

// ── Detection Functions ───────────────────────────────

function detectSpendSpike(currentHourSpend: Cents, avgHourlySpend: Cents, platform: string): Anomaly | null {
  if (avgHourlySpend === 0) return null;
  const deviation = ((currentHourSpend - avgHourlySpend) / avgHourlySpend) * 100;
  if (deviation < THRESHOLDS.spendSpikeWarning) return null;

  const severity: AnomalySeverity =
    deviation >= THRESHOLDS.spendSpikeCritical ? 'critical' :
    deviation >= THRESHOLDS.spendSpikeAlert ? 'alert' : 'warning';

  return {
    type: 'spend_spike',
    severity,
    platform,
    metric: 'hourly_spend',
    currentValue: currentHourSpend,
    expectedValue: avgHourlySpend,
    deviationPercent: Math.round(deviation),
    message: `Spend spike on ${platform}: $${(currentHourSpend / 100).toFixed(2)}/hr vs $${(avgHourlySpend / 100).toFixed(2)}/hr average (+${Math.round(deviation)}%)`,
    timestamp: new Date().toISOString(),
  };
}

function detectTrafficDrop(currentDayTraffic: number, avgDailyTraffic: number): Anomaly | null {
  if (avgDailyTraffic === 0) return null;
  const deviation = ((avgDailyTraffic - currentDayTraffic) / avgDailyTraffic) * 100;
  if (deviation < THRESHOLDS.trafficDropWarning) return null;

  const severity: AnomalySeverity =
    deviation >= THRESHOLDS.trafficDropCritical ? 'critical' :
    deviation >= THRESHOLDS.trafficDropAlert ? 'alert' : 'warning';

  return {
    type: 'traffic_drop',
    severity,
    metric: 'daily_traffic',
    currentValue: currentDayTraffic,
    expectedValue: avgDailyTraffic,
    deviationPercent: -Math.round(deviation),
    message: `Traffic drop: ${currentDayTraffic} visitors today vs ${avgDailyTraffic} average (-${Math.round(deviation)}%)`,
    timestamp: new Date().toISOString(),
  };
}

function detectConversionChange(currentRate: number, avgRate: number): Anomaly | null {
  if (avgRate === 0) return null;
  const deviation = ((currentRate - avgRate) / avgRate) * 100;
  if (Math.abs(deviation) < THRESHOLDS.conversionChangeThreshold) return null;

  return {
    type: 'conversion_change',
    severity: Math.abs(deviation) >= 40 ? 'alert' : 'warning',
    metric: 'conversion_rate',
    currentValue: currentRate,
    expectedValue: avgRate,
    deviationPercent: Math.round(deviation),
    message: `Conversion rate ${deviation > 0 ? 'increase' : 'decrease'}: ${currentRate.toFixed(1)}% vs ${avgRate.toFixed(1)}% average (${deviation > 0 ? '+' : ''}${Math.round(deviation)}%)`,
    timestamp: new Date().toISOString(),
  };
}

function detectRoasDrop(currentRoas: number, avgRoas: number, platform: string): Anomaly | null {
  if (avgRoas === 0) return null;
  const deviation = ((avgRoas - currentRoas) / avgRoas) * 100;
  if (deviation < THRESHOLDS.roasDropWarning) return null;

  return {
    type: 'roas_drop',
    severity: deviation >= THRESHOLDS.roasDropAlert ? 'alert' : 'warning',
    platform,
    metric: 'roas',
    currentValue: currentRoas,
    expectedValue: avgRoas,
    deviationPercent: -Math.round(deviation),
    message: `ROAS drop on ${platform}: ${currentRoas.toFixed(1)}x vs ${avgRoas.toFixed(1)}x average (-${Math.round(deviation)}%)`,
    timestamp: new Date().toISOString(),
  };
}

/** Run all anomaly checks for the current period */
export function runAnomalyDetection(metrics: {
  spendByPlatform: Array<{ platform: string; currentHour: Cents; avgHourly: Cents }>;
  traffic: { currentDay: number; avgDaily: number };
  conversion: { currentRate: number; avgRate: number };
  roasByPlatform: Array<{ platform: string; current: number; avg: number }>;
}): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const s of metrics.spendByPlatform) {
    const a = detectSpendSpike(s.currentHour, s.avgHourly, s.platform);
    if (a) anomalies.push(a);
  }

  const td = detectTrafficDrop(metrics.traffic.currentDay, metrics.traffic.avgDaily);
  if (td) anomalies.push(td);

  const cc = detectConversionChange(metrics.conversion.currentRate, metrics.conversion.avgRate);
  if (cc) anomalies.push(cc);

  for (const r of metrics.roasByPlatform) {
    const a = detectRoasDrop(r.current, r.avg, r.platform);
    if (a) anomalies.push(a);
  }

  return anomalies;
}

export type { Anomaly, AnomalyType, AnomalySeverity };
export { THRESHOLDS };
