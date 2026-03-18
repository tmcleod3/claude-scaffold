/**
 * Brex Bank Adapter (Read-Only)
 *
 * Auth: OAuth 2.0 (read-only)
 * Data: Card transactions, account balance
 * Frequency: Hourly poll
 *
 * PRD Reference: §9.4 (Revenue Ingest — Brex)
 */

import type { RevenueSourceAdapter, RevenueCredentials, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../../../docs/patterns/revenue-source-adapter.js';

export class BrexAdapter implements RevenueSourceAdapter {
  private accessToken: string = '';

  async connect(credentials: RevenueCredentials): Promise<ConnectionResult> {
    this.accessToken = credentials.accessToken || '';
    // GET https://platform.brexapis.com/v2/accounts/cash
    throw new Error('Implement with node:https');
  }

  async detectCurrency(credentials: RevenueCredentials): Promise<string> {
    return 'USD'; // Brex defaults to USD
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    // GET https://platform.brexapis.com/v2/transactions/cash?posted_at_start={}&posted_at_end={}
    throw new Error('Implement with node:https');
  }

  async getBalance(): Promise<BalanceResult> {
    // GET https://platform.brexapis.com/v2/accounts/cash
    throw new Error('Implement with node:https');
  }
}
