/**
 * Sandbox Bank Adapter — full implementation for development/demo.
 *
 * Implements RevenueSourceAdapter with realistic fake financial data.
 * Every method returns valid-shaped data. No throws.
 * This IS a full implementation for a sandbox bank (No Stubs Doctrine, v17.0).
 */

import { randomUUID } from 'node:crypto';
import type { RevenueSourceAdapter, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../revenue-types.js';

export class SandboxBankAdapter implements RevenueSourceAdapter {
  private accountName: string;
  private balanceCents: number;

  constructor(label: string = 'Sandbox Bank', initialBalanceCents: number = 500000) {
    this.accountName = label;
    this.balanceCents = initialBalanceCents;
  }

  async connect(credentials: Record<string, string>): Promise<ConnectionResult> {
    return {
      connected: true,
      accountName: credentials.accountName ?? this.accountName,
      accountId: `sandbox_bank_${randomUUID().slice(0, 8)}`,
      currency: 'USD',
    };
  }

  async getTransactions(dateRange: DateRange): Promise<TransactionPage> {
    // Generate realistic transaction data
    const dayCount = Math.max(1, Math.ceil(
      (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (24 * 60 * 60 * 1000)
    ));

    const transactions: Array<{
      id: string;
      date: string;
      amountCents: number;
      type: 'credit' | 'debit';
      description: string;
      category: string;
    }> = [];

    // Simulate 2-5 transactions per day
    for (let d = 0; d < dayCount; d++) {
      const date = new Date(new Date(dateRange.start).getTime() + d * 86400000);
      const txCount = 2 + Math.floor(Math.random() * 4);

      for (let t = 0; t < txCount; t++) {
        const isRevenue = Math.random() > 0.4; // 60% revenue, 40% expenses
        const amountCents = isRevenue
          ? Math.round(500 + Math.random() * 9500)  // $5-$100 revenue
          : -Math.round(100 + Math.random() * 5000); // $1-$50 expenses

        transactions.push({
          id: `txn_${randomUUID().slice(0, 12)}`,
          date: date.toISOString().slice(0, 10),
          amountCents,
          type: amountCents > 0 ? 'credit' : 'debit',
          description: isRevenue
            ? ['Stripe payout', 'Customer payment', 'Subscription renewal', 'One-time purchase'][Math.floor(Math.random() * 4)]
            : ['Ad spend - Google', 'Ad spend - Meta', 'SaaS subscription', 'Domain renewal', 'Hosting'][Math.floor(Math.random() * 5)],
          category: isRevenue ? 'revenue' : 'expense',
        });
      }
    }

    return {
      transactions,
      hasMore: false,
      cursor: undefined,
    };
  }

  async getBalance(): Promise<BalanceResult> {
    // Slightly vary the balance to simulate real account activity
    this.balanceCents += Math.round((Math.random() - 0.3) * 10000);
    return {
      availableCents: this.balanceCents,
      pendingCents: Math.round(Math.random() * 50000),
      currency: 'USD',
      asOf: new Date().toISOString(),
    };
  }

  async detectCurrency(): Promise<string> {
    return 'USD';
  }
}
