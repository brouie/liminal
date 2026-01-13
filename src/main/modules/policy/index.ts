/**
 * Liminal - Policy Modules
 * 
 * Exports for execution policy components.
 * 
 * PHASE 3.7: Policy Lock & Enablement Firewall
 * - All flags default to FALSE
 * - Policy is LOCKED by default
 * - Requires explicit unlock with reason + author
 * - ADDS PROTECTION ONLY
 */

export {
  ExecutionPolicyManager,
  getExecutionPolicyManager,
  resetExecutionPolicyManager,
} from './ExecutionPolicyManager';

