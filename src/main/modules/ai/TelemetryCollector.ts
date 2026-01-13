/**
 * TelemetryCollector - Read-Only Telemetry Snapshot Collection
 * 
 * Collects per-context privacy telemetry for AI analysis.
 * 
 * PHASE 2 RULES:
 * - This module is READ-ONLY
 * - It does NOT modify any state
 * - It does NOT affect enforcement
 * - It ONLY observes and reports
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import { ContextId } from '../../../shared/types';
import {
  TelemetrySnapshot,
  RequestTelemetry,
  FingerprintTelemetry,
  TimingTelemetry,
  HeaderTelemetry,
} from '../../../shared/ai-types';
import { getContextManager } from '../ContextManager';
import { getReceiptStore } from '../ReceiptStore';
import { getTimingJitter } from '../TimingJitter';

/**
 * Fingerprint event tracking (reported from renderer)
 */
interface FingerprintEvent {
  type: 'canvas' | 'webgl' | 'audio' | 'navigator';
  property?: string;
  timestamp: number;
}

export class TelemetryCollector {
  /** Fingerprint events per context (reported from renderer) */
  private fingerprintEvents: Map<ContextId, FingerprintEvent[]> = new Map();
  
  /** Header modification counts per context */
  private headerStats: Map<ContextId, HeaderTelemetry> = new Map();
  
  /** Timing jitter stats per context */
  private jitterStats: Map<ContextId, { delays: number[]; count: number }> = new Map();

  /**
   * Record a fingerprint API access event (called from renderer via IPC)
   * This is READ-ONLY observation
   */
  recordFingerprintEvent(contextId: ContextId, event: FingerprintEvent): void {
    const events = this.fingerprintEvents.get(contextId) || [];
    events.push(event);
    
    // Cap at 1000 events per context to prevent memory bloat
    if (events.length > 1000) {
      events.shift();
    }
    
    this.fingerprintEvents.set(contextId, events);
  }

  /**
   * Record header modification (called from Interceptor)
   * This is READ-ONLY observation
   */
  recordHeaderModification(
    contextId: ContextId,
    modification: 'referrerStripped' | 'referrerReduced' | 'userAgentNormalized' | 'clientHintsStripped'
  ): void {
    const stats = this.headerStats.get(contextId) || {
      referrerStripped: 0,
      referrerReduced: 0,
      userAgentNormalized: 0,
      clientHintsStripped: 0,
    };
    
    stats[modification]++;
    this.headerStats.set(contextId, stats);
  }

  /**
   * Record timing jitter applied (called from Interceptor)
   * This is READ-ONLY observation
   */
  recordJitterApplied(contextId: ContextId, delayMs: number): void {
    const stats = this.jitterStats.get(contextId) || { delays: [], count: 0 };
    stats.delays.push(delayMs);
    stats.count++;
    
    // Cap at 1000 samples
    if (stats.delays.length > 1000) {
      stats.delays.shift();
    }
    
    this.jitterStats.set(contextId, stats);
  }

  /**
   * Generate a complete telemetry snapshot for a context
   * This is READ-ONLY - does not modify any state
   */
  generateSnapshot(contextId: ContextId): TelemetrySnapshot | null {
    const contextManager = getContextManager();
    const receiptStore = getReceiptStore();
    const timingJitter = getTimingJitter();

    const context = contextManager.getContext(contextId);
    if (!context) {
      return null;
    }

    const receipt = receiptStore.getReceipt(contextId);
    const now = Date.now();

    // Build request telemetry from receipt
    const requests: RequestTelemetry = {
      totalRequests: receipt?.events.length || 0,
      blockedRequests: receipt?.blockedCount || 0,
      thirdPartyRequests: receipt?.events.filter(e => e.isThirdParty).length || 0,
      thirdPartyDomains: receipt?.allowedThirdPartyDomains || [],
      blockedDomains: receipt?.blockedDomains || [],
    };

    // Build fingerprint telemetry from events
    const fpEvents = this.fingerprintEvents.get(contextId) || [];
    const fingerprinting: FingerprintTelemetry = {
      canvasAccessed: fpEvents.some(e => e.type === 'canvas'),
      canvasOperations: fpEvents.filter(e => e.type === 'canvas').length,
      webglAccessed: fpEvents.some(e => e.type === 'webgl'),
      webglOperations: fpEvents.filter(e => e.type === 'webgl').length,
      audioAccessed: fpEvents.some(e => e.type === 'audio'),
      audioOperations: fpEvents.filter(e => e.type === 'audio').length,
      navigatorAccessed: fpEvents.some(e => e.type === 'navigator'),
      navigatorProperties: [...new Set(fpEvents.filter(e => e.type === 'navigator').map(e => e.property || 'unknown'))],
    };

    // Build timing telemetry
    const jitterConfig = timingJitter.getConfig();
    const jitterData = this.jitterStats.get(contextId);
    const avgJitter = jitterData && jitterData.delays.length > 0
      ? jitterData.delays.reduce((a, b) => a + b, 0) / jitterData.delays.length
      : 0;

    const timing: TimingTelemetry = {
      jitterEnabled: jitterConfig.enabled,
      minJitterMs: jitterConfig.minDelayMs,
      maxJitterMs: jitterConfig.maxDelayMs,
      avgJitterMs: Math.round(avgJitter * 100) / 100,
      jitteredRequests: jitterData?.count || 0,
    };

    // Build header telemetry
    const headerData = this.headerStats.get(contextId);
    const headers: HeaderTelemetry = {
      referrerStripped: headerData?.referrerStripped || 0,
      referrerReduced: headerData?.referrerReduced || 0,
      userAgentNormalized: headerData?.userAgentNormalized || 0,
      clientHintsStripped: headerData?.clientHintsStripped || 0,
    };

    // Determine origin from receipt events
    let origin: string | null = null;
    if (receipt && receipt.events.length > 0) {
      try {
        // Find first non-third-party request to determine origin
        const firstPartyEvent = receipt.events.find(e => !e.isThirdParty);
        if (firstPartyEvent) {
          origin = new URL(firstPartyEvent.url).origin;
        }
      } catch {
        origin = null;
      }
    }

    const snapshot: TelemetrySnapshot = {
      contextId,
      origin,
      timestamp: now,
      durationMs: now - context.createdAt,
      proxy: context.proxy,
      requests,
      fingerprinting,
      timing,
      headers,
    };

    return snapshot;
  }

  /**
   * Clear telemetry for a context (called when context is destroyed)
   */
  clearContext(contextId: ContextId): void {
    this.fingerprintEvents.delete(contextId);
    this.headerStats.delete(contextId);
    this.jitterStats.delete(contextId);
  }

  /**
   * Get all context IDs with telemetry
   */
  getContextIds(): ContextId[] {
    const ids = new Set<ContextId>();
    this.fingerprintEvents.forEach((_, id) => ids.add(id));
    this.headerStats.forEach((_, id) => ids.add(id));
    this.jitterStats.forEach((_, id) => ids.add(id));
    return Array.from(ids);
  }
}

// Singleton instance
let instance: TelemetryCollector | null = null;

export function getTelemetryCollector(): TelemetryCollector {
  if (!instance) {
    instance = new TelemetryCollector();
  }
  return instance;
}

export function resetTelemetryCollector(): void {
  instance = null;
}

