/**
 * Liminal - Phase Freeze
 * 
 * Freezes Phase 3 as read-only.
 * 
 * PHASE 3.10 RULES:
 * - Phase 3 becomes IMMUTABLE
 * - Any attempt to modify execution paths must THROW
 * - Freeze status is queryable and auditable
 */

import { createHash } from 'crypto';
import {
  PhaseFreezeStatus,
  PhaseFreezeRecord,
} from '../../../shared/tx-types';

/**
 * Phase Freeze Manager
 * 
 * Manages phase freeze state.
 * Once frozen, Phase 3 becomes read-only.
 */
export class PhaseFreeze {
  private freezeRecord: PhaseFreezeRecord | null = null;
  private readonly PHASE = '3';
  
  /**
   * Freeze Phase 3
   * 
   * @param reason - Why phase is being frozen
   * @param frozenBy - Who is freezing it
   */
  freeze(reason: string, frozenBy: string): PhaseFreezeRecord {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Freeze reason is required');
    }
    if (!frozenBy || frozenBy.trim().length === 0) {
      throw new Error('Freeze author is required');
    }
    
    if (this.isFrozen()) {
      throw new Error(`Phase ${this.PHASE} is already frozen`);
    }
    
    const record: PhaseFreezeRecord = {
      freezeId: `freeze_${Date.now().toString(36)}_${createHash('sha256').update(`${reason}${frozenBy}${Date.now()}`).digest('hex').substring(0, 8)}`,
      phase: this.PHASE,
      frozenAt: Date.now(),
      frozenBy: frozenBy.trim(),
      reason: reason.trim(),
      status: PhaseFreezeStatus.FROZEN,
    };
    
    this.freezeRecord = record;
    
    console.warn(`PHASE ${this.PHASE} FROZEN: ${reason} (by ${frozenBy})`);
    
    return record;
  }
  
  /**
   * Check if Phase 3 is frozen
   */
  isFrozen(): boolean {
    return this.freezeRecord !== null && this.freezeRecord.status === PhaseFreezeStatus.FROZEN;
  }
  
  /**
   * Get freeze status
   */
  getStatus(): PhaseFreezeStatus {
    return this.isFrozen() ? PhaseFreezeStatus.FROZEN : PhaseFreezeStatus.NOT_FROZEN;
  }
  
  /**
   * Get freeze record
   */
  getFreezeRecord(): PhaseFreezeRecord | null {
    return this.freezeRecord ? { ...this.freezeRecord } : null;
  }
  
  /**
   * Enforce freeze - throws if frozen
   * 
   * @param operation - Operation being attempted
   */
  enforceFreeze(operation: string): void {
    if (this.isFrozen()) {
      throw new Error(
        `Phase ${this.PHASE} is frozen. Operation "${operation}" is not allowed. ` +
        `Freeze reason: ${this.freezeRecord?.reason}`
      );
    }
  }
  
  /**
   * Reset (for testing only)
   */
  reset(): void {
    this.freezeRecord = null;
  }
}

// ============ Singleton ============

let phaseFreeze: PhaseFreeze | null = null;

/**
 * Get the PhaseFreeze singleton
 */
export function getPhaseFreeze(): PhaseFreeze {
  if (!phaseFreeze) {
    phaseFreeze = new PhaseFreeze();
  }
  return phaseFreeze;
}

/**
 * Reset the PhaseFreeze singleton (for testing)
 */
export function resetPhaseFreeze(): void {
  if (phaseFreeze) {
    phaseFreeze.reset();
  }
  phaseFreeze = null;
}

