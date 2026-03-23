/**
 * Mercury Bank Adapter (Read-Only)
 *
 * Auth: OAuth 2.0 (read-only)
 * Data: Account balance, transactions
 * Frequency: Hourly poll
 *
 * PRD Reference: §9.4 (Revenue Ingest — Mercury)
 */

import type { RevenueSourceAdapter, RevenueCredentials, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../revenue-types.js';

export class MercuryAdapter implements RevenueSourceAdapter {
  private accessToken: string = '';

  async connect(credentials: RevenueCredentials): Promise<ConnectionResult> {
    this.accessToken = credentials.accessToken || '';
    // GET https://backend.mercury.com/api/v1/accounts
    throw new Error('Implement with node:https');
  }

  async detectCurrency(credentials: RevenueCredentials): Promise<string> {
    return 'USD'; // Mercury is US-only
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    // GET https://backend.mercury.com/api/v1/account/{id}/transactions?start={}&end={}
    throw new Error('Implement with node:https');
  }

  async getBalance(): Promise<BalanceResult> {
    // GET https://backend.mercury.com/api/v1/account/{id}
    throw new Error('Implement with node:https');
  }
}
