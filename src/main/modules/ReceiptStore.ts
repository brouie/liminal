/**
 * ReceiptStore - Privacy Receipt Storage
 * 
 * File-backed storage for privacy receipts.
 * Tracks blocked/allowed domains per context.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import {
  ContextId,
  InterceptionResult,
  PrivacyReceipt,
  ProxyConfig,
} from '../../shared/types';

// Maximum events to store per receipt (memory management)
const MAX_EVENTS_PER_RECEIPT = 1000;

export class ReceiptStore {
  private receipts: Map<ContextId, PrivacyReceipt> = new Map();
  private dataDir: string;
  private listeners: Map<ContextId, Set<(receipt: PrivacyReceipt) => void>> = new Map();

  constructor() {
    this.dataDir = join(app.getPath('userData'), 'receipts');
    this.ensureDataDir();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Create a new receipt for a context
   */
  createReceipt(contextId: ContextId, proxy: ProxyConfig): PrivacyReceipt {
    const receipt: PrivacyReceipt = {
      contextId,
      proxy,
      blockedCount: 0,
      blockedDomains: [],
      allowedThirdPartyDomains: [],
      events: [],
      startTime: Date.now(),
      lastUpdated: Date.now(),
    };

    this.receipts.set(contextId, receipt);
    return receipt;
  }

  /**
   * Get receipt for a context, creating if needed
   */
  getReceipt(contextId: ContextId): PrivacyReceipt | undefined {
    return this.receipts.get(contextId);
  }

  /**
   * Record an interception event
   */
  recordInterception(contextId: ContextId, result: InterceptionResult): void {
    let receipt = this.receipts.get(contextId);
    
    if (!receipt) {
      // Auto-create receipt with direct proxy
      receipt = this.createReceipt(contextId, { type: 'direct' });
    }

    // Update blocked count and domains
    if (result.blocked) {
      receipt.blockedCount++;
      if (!receipt.blockedDomains.includes(result.domain)) {
        receipt.blockedDomains.push(result.domain);
      }
    } else if (result.isThirdParty) {
      if (!receipt.allowedThirdPartyDomains.includes(result.domain)) {
        receipt.allowedThirdPartyDomains.push(result.domain);
      }
    }

    // Add event (with limit)
    receipt.events.push(result);
    if (receipt.events.length > MAX_EVENTS_PER_RECEIPT) {
      receipt.events = receipt.events.slice(-MAX_EVENTS_PER_RECEIPT);
    }

    receipt.lastUpdated = Date.now();

    // Notify listeners
    this.notifyListeners(contextId, receipt);
  }

  /**
   * Subscribe to receipt updates
   */
  subscribe(contextId: ContextId, callback: (receipt: PrivacyReceipt) => void): () => void {
    if (!this.listeners.has(contextId)) {
      this.listeners.set(contextId, new Set());
    }
    this.listeners.get(contextId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(contextId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(contextId);
        }
      }
    };
  }

  /**
   * Notify listeners of receipt update
   */
  private notifyListeners(contextId: ContextId, receipt: PrivacyReceipt): void {
    const listeners = this.listeners.get(contextId);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(receipt);
        } catch (error) {
          console.error('Receipt listener error:', error);
        }
      }
    }
  }

  /**
   * Save receipt to disk
   */
  saveReceipt(contextId: ContextId): boolean {
    const receipt = this.receipts.get(contextId);
    if (!receipt) return false;

    try {
      const filePath = join(this.dataDir, `${contextId}.json`);
      writeFileSync(filePath, JSON.stringify(receipt, null, 2));
      return true;
    } catch (error) {
      console.error(`Failed to save receipt ${contextId}:`, error);
      return false;
    }
  }

  /**
   * Load receipt from disk
   */
  loadReceipt(contextId: ContextId): PrivacyReceipt | null {
    try {
      const filePath = join(this.dataDir, `${contextId}.json`);
      if (!existsSync(filePath)) return null;

      const content = readFileSync(filePath, 'utf-8');
      const receipt: PrivacyReceipt = JSON.parse(content);
      this.receipts.set(contextId, receipt);
      return receipt;
    } catch (error) {
      console.error(`Failed to load receipt ${contextId}:`, error);
      return null;
    }
  }

  /**
   * Clear receipt for a context (used during identity rotation)
   */
  clearReceipt(contextId: ContextId, newProxy?: ProxyConfig): PrivacyReceipt | null {
    const oldReceipt = this.receipts.get(contextId);
    const proxy = newProxy || oldReceipt?.proxy || { type: 'direct' as const };
    
    // Create fresh receipt
    const receipt = this.createReceipt(contextId, proxy);
    
    // Notify listeners
    this.notifyListeners(contextId, receipt);
    
    return receipt;
  }

  /**
   * Delete receipt for a context
   */
  deleteReceipt(contextId: ContextId): void {
    this.receipts.delete(contextId);
    this.listeners.delete(contextId);
  }

  /**
   * Get summary statistics for a receipt
   */
  getReceiptSummary(contextId: ContextId): {
    blockedCount: number;
    blockedDomainCount: number;
    thirdPartyDomainCount: number;
    duration: number;
  } | null {
    const receipt = this.receipts.get(contextId);
    if (!receipt) return null;

    return {
      blockedCount: receipt.blockedCount,
      blockedDomainCount: receipt.blockedDomains.length,
      thirdPartyDomainCount: receipt.allowedThirdPartyDomains.length,
      duration: receipt.lastUpdated - receipt.startTime,
    };
  }

  /**
   * Get all receipts
   */
  getAllReceipts(): PrivacyReceipt[] {
    return Array.from(this.receipts.values());
  }

  /**
   * Export receipt as JSON string
   */
  exportReceipt(contextId: ContextId): string | null {
    const receipt = this.receipts.get(contextId);
    if (!receipt) return null;
    return JSON.stringify(receipt, null, 2);
  }
}

// Singleton instance
let instance: ReceiptStore | null = null;

export function getReceiptStore(): ReceiptStore {
  if (!instance) {
    instance = new ReceiptStore();
  }
  return instance;
}

export function resetReceiptStore(): void {
  instance = null;
}

