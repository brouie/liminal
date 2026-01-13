/**
 * Liminal - Wallet Modules
 * 
 * Exports for wallet adapter components.
 * 
 * PHASE 3.1: Signing ONLY
 * - NO sendTransaction
 * - NO RPC submission
 * - NO funds movement
 */

export {
  WalletScopeManager,
  getWalletScopeManager,
  resetWalletScopeManager,
  type ScopeValidation,
} from './WalletScopeManager';

export {
  LiminalWalletAdapter,
  getLiminalWalletAdapter,
  resetLiminalWalletAdapter,
} from './LiminalWalletAdapter';

