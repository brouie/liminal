/**
 * TraceStorage - Local Trace Storage
 * 
 * Stores AI decision traces locally for audit and review.
 * Traces are immutable once written.
 * 
 * PHASE 2.4 RULES:
 * - Local storage ONLY - no remote upload
 * - Traces are IMMUTABLE once stored
 * - NEVER influences enforcement
 * - NEVER alters AI outputs
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  AIDecisionTrace,
  StoredTrace,
} from '../../../shared/ai-types';
import { ContextId } from '../../../shared/types';

/** Directory for trace storage */
const TRACES_DIR = 'traces';

/** Maximum traces to keep per context */
const MAX_TRACES_PER_CONTEXT = 50;

export class TraceStorage {
  private basePath: string;
  private initialized: boolean = false;

  constructor(basePath?: string) {
    // Use app data path or provided path
    this.basePath = basePath || path.join(app.getPath('userData'), TRACES_DIR);
  }

  /**
   * Initialize storage directory
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.basePath)) {
        fs.mkdirSync(this.basePath, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize trace storage:', error);
      throw new Error('Trace storage initialization failed');
    }
  }

  /**
   * Get file path for a context's traces
   */
  private getContextFilePath(contextId: ContextId): string {
    // Sanitize context ID for filesystem
    const safeId = contextId.replace(/[^a-zA-Z0-9-]/g, '_');
    return path.join(this.basePath, `${safeId}.json`);
  }

  /**
   * Load traces for a context
   */
  private loadContextTraces(contextId: ContextId): StoredTrace[] {
    this.ensureInitialized();

    const filePath = this.getContextFilePath(contextId);
    
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Failed to load traces for context ${contextId}:`, error);
      return [];
    }
  }

  /**
   * Save traces for a context
   */
  private saveContextTraces(contextId: ContextId, traces: StoredTrace[]): void {
    this.ensureInitialized();

    const filePath = this.getContextFilePath(contextId);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(traces, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save traces for context ${contextId}:`, error);
      throw new Error('Trace storage write failed');
    }
  }

  /**
   * Store a trace (IMMUTABLE once stored)
   */
  store(trace: AIDecisionTrace): StoredTrace {
    const storedTrace: StoredTrace = {
      trace: { ...trace }, // Deep copy to ensure immutability
      storedAt: Date.now(),
      immutable: true,
    };

    // Load existing traces
    const traces = this.loadContextTraces(trace.contextId);

    // Check if trace already exists (by traceId)
    const existingIndex = traces.findIndex(t => t.trace.traceId === trace.traceId);
    if (existingIndex >= 0) {
      // Trace already stored - return existing (immutable)
      return traces[existingIndex];
    }

    // Add new trace
    traces.push(storedTrace);

    // Enforce max traces limit (remove oldest)
    while (traces.length > MAX_TRACES_PER_CONTEXT) {
      traces.shift();
    }

    // Save
    this.saveContextTraces(trace.contextId, traces);

    return storedTrace;
  }

  /**
   * Get most recent trace for a context
   */
  getLatest(contextId: ContextId): StoredTrace | null {
    const traces = this.loadContextTraces(contextId);
    
    if (traces.length === 0) {
      return null;
    }

    return traces[traces.length - 1];
  }

  /**
   * Get trace by ID
   */
  getById(contextId: ContextId, traceId: string): StoredTrace | null {
    const traces = this.loadContextTraces(contextId);
    return traces.find(t => t.trace.traceId === traceId) || null;
  }

  /**
   * List all traces for a context
   */
  list(contextId: ContextId): StoredTrace[] {
    return this.loadContextTraces(contextId);
  }

  /**
   * Export trace as JSON string
   */
  exportAsJson(trace: AIDecisionTrace): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: trace.traceVersion,
      trace,
    }, null, 2);
  }

  /**
   * Export trace to file
   */
  exportToFile(trace: AIDecisionTrace, filePath: string): boolean {
    try {
      const json = this.exportAsJson(trace);
      fs.writeFileSync(filePath, json, 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to export trace:', error);
      return false;
    }
  }

  /**
   * Get total trace count for a context
   */
  getCount(contextId: ContextId): number {
    return this.loadContextTraces(contextId).length;
  }

  /**
   * Clear all traces for a context
   * (Used during context destruction)
   */
  clearContext(contextId: ContextId): void {
    this.ensureInitialized();
    
    const filePath = this.getContextFilePath(contextId);
    
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to clear traces for context ${contextId}:`, error);
    }
  }

  /**
   * Get storage path (for debugging)
   */
  getStoragePath(): string {
    return this.basePath;
  }
}

// Singleton instance
let instance: TraceStorage | null = null;

export function getTraceStorage(): TraceStorage {
  if (!instance) {
    instance = new TraceStorage();
  }
  return instance;
}

export function resetTraceStorage(): void {
  instance = null;
}

/**
 * Create a test-friendly TraceStorage with custom path
 */
export function createTraceStorage(basePath: string): TraceStorage {
  return new TraceStorage(basePath);
}

