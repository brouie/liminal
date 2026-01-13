/**
 * Liminal - Renderer Process
 * 
 * Handles UI logic and communication with main process.
 * 
 * Phase 1: Privacy execution runtime
 * Phase 2: AI observation layer (READ-ONLY display)
 * 
 * NO Solana, NO wallets, NO transactions.
 */

import { Tab, PrivacyReceipt, ContextId, ProxyConfig } from '../../shared/types';
import { 
  AIClassification, 
  AIClassificationWithSimulation, 
  TrackingVector,
  PolicySimulationOutput,
  PolicyDiffExplanation,
  AIDecisionTrace,
  StoredTrace,
  TriggeredRule,
  SimulationResult,
  ModeExplanation,
  ProtectionFactor,
  RiskLevel,
} from '../../shared/ai-types';

// LiminalAPI is exposed via preload script
// Type is already declared in preload.ts

class LiminalUI {
  private tabs: Map<number, Tab> = new Map();
  private activeTabId: number | null = null;
  private currentReceipt: PrivacyReceipt | null = null;
  private currentClassification: AIClassificationWithSimulation | null = null;
  private currentTrace: StoredTrace | null = null;
  private unsubscribeReceipt: (() => void) | null = null;
  private unsubscribeClassification: (() => void) | null = null;
  private classificationRefreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.setupEventListeners();
    this.setupReceiptUpdates();
    this.setupTabUpdates();
    this.setupAIUpdates();
    
    // Create initial tab if none exist
    setTimeout(() => {
      this.updateEmptyState();
    }, 100);
  }

  private setupEventListeners(): void {
    // New tab button
    const newTabBtn = document.getElementById('new-tab-btn');
    newTabBtn?.addEventListener('click', () => this.createTab());

    // Navigation buttons
    const backBtn = document.getElementById('btn-back');
    const forwardBtn = document.getElementById('btn-forward');
    const reloadBtn = document.getElementById('btn-reload');

    backBtn?.addEventListener('click', () => this.goBack());
    forwardBtn?.addEventListener('click', () => this.goForward());
    reloadBtn?.addEventListener('click', () => this.reload());

    // URL input
    const urlInput = document.getElementById('url-input') as HTMLInputElement;
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigate(urlInput.value);
      }
    });

    // Rotate identity button
    const rotateBtn = document.getElementById('btn-rotate');
    rotateBtn?.addEventListener('click', () => this.rotateIdentity());

    // Collapsible sections
    this.setupCollapsibleSections();
  }

  private setupCollapsibleSections(): void {
    const toggleBlocked = document.getElementById('toggle-blocked');
    const toggleThirdParty = document.getElementById('toggle-third-party');
    const toggleSimulation = document.getElementById('toggle-simulation');
    const toggleTrace = document.getElementById('toggle-trace');
    const blockedList = document.getElementById('blocked-domains-list');
    const thirdPartyList = document.getElementById('third-party-domains-list');
    const simulationContent = document.getElementById('simulation-content');
    const traceContent = document.getElementById('trace-content');

    toggleBlocked?.addEventListener('click', () => {
      toggleBlocked.classList.toggle('collapsed');
      blockedList?.classList.toggle('collapsed');
    });

    toggleThirdParty?.addEventListener('click', () => {
      toggleThirdParty.classList.toggle('collapsed');
      thirdPartyList?.classList.toggle('collapsed');
    });

    // Phase 2.2: Simulation section toggle
    toggleSimulation?.addEventListener('click', () => {
      toggleSimulation.classList.toggle('collapsed');
      simulationContent?.classList.toggle('collapsed');
    });

    // Phase 2.4: Trace section toggle
    toggleTrace?.addEventListener('click', () => {
      toggleTrace.classList.toggle('collapsed');
      traceContent?.classList.toggle('collapsed');
    });

    // Phase 2.4: Export trace link
    const exportLink = document.getElementById('export-trace-link');
    exportLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.exportCurrentTrace();
    });
  }

  private setupReceiptUpdates(): void {
    this.unsubscribeReceipt = window.liminal.receipt.onUpdate((receipt) => {
      if (this.activeTabId !== null) {
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.contextId === receipt.contextId) {
          this.currentReceipt = receipt;
          this.updateReceiptPanel(receipt);
        }
      }
    });
  }

  private setupTabUpdates(): void {
    window.liminal.tab.onUpdate((tab) => {
      this.tabs.set(tab.id, tab);
      this.updateTabUI(tab);
      
      if (tab.id === this.activeTabId) {
        this.updateNavBar(tab);
      }
    });
  }

  // ========== Phase 2: AI Observation Layer (READ-ONLY) ==========

  private setupAIUpdates(): void {
    // Listen for classification updates
    this.unsubscribeClassification = window.liminal.ai.onClassification((classification) => {
      if (this.activeTabId !== null) {
        const tab = this.tabs.get(this.activeTabId);
        if (tab) {
          this.currentClassification = classification;
          this.updateAIPanel(classification);
        }
      }
    });
  }

  private startAIRefresh(contextId: ContextId): void {
    // Clear any existing interval
    if (this.classificationRefreshInterval) {
      clearInterval(this.classificationRefreshInterval);
    }

    // Subscribe to AI updates
    window.liminal.ai.subscribe(contextId);

    // Initial fetch
    this.fetchClassification(contextId);

    // Refresh every 10 seconds (AI is read-only observation)
    this.classificationRefreshInterval = setInterval(() => {
      this.fetchClassification(contextId);
    }, 10000);
  }

  private stopAIRefresh(): void {
    if (this.classificationRefreshInterval) {
      clearInterval(this.classificationRefreshInterval);
      this.classificationRefreshInterval = null;
    }
  }

  private async fetchClassification(contextId: ContextId): Promise<void> {
    try {
      // Use classifyWithSimulation to get classification, simulation, and diff explanation
      const classification = await window.liminal.ai.classifyWithSimulation(contextId);
      if (classification) {
        this.currentClassification = classification;
        this.updateAIPanel(classification);
        
        // Update simulation panel if simulation data is available
        if (classification.simulation) {
          this.updateSimulationPanel(classification.simulation);
        }
        
        // Update diff explanation panel (Phase 2.3)
        if (classification.diffExplanation) {
          this.updateDiffExplanationPanel(classification.diffExplanation);
        }

        // Fetch and update trace panel (Phase 2.4)
        this.fetchTrace(contextId);
      }
    } catch (error) {
      console.error('Failed to fetch AI classification:', error);
    }
  }

  // ========== Phase 2.4: AI Audit & Trace (DISPLAY ONLY) ==========

  private async fetchTrace(contextId: ContextId): Promise<void> {
    try {
      const storedTrace = await window.liminal.ai.getTrace(contextId);
      if (storedTrace) {
        this.currentTrace = storedTrace;
        this.updateTracePanel(storedTrace.trace);
      } else {
        this.clearTracePanel();
      }
    } catch (error) {
      console.error('Failed to fetch trace:', error);
      this.clearTracePanel();
    }
  }

  private updateTracePanel(trace: AIDecisionTrace): void {
    // Update trace summary
    const traceIdEl = document.getElementById('trace-id');
    const timestampEl = document.getElementById('trace-timestamp');
    const classifierEl = document.getElementById('trace-classifier');

    if (traceIdEl) {
      traceIdEl.textContent = trace.traceId.slice(0, 8) + '...';
      traceIdEl.title = trace.traceId;
    }

    if (timestampEl) {
      timestampEl.textContent = new Date(trace.timestamp).toLocaleTimeString();
    }

    if (classifierEl) {
      classifierEl.textContent = trace.classifierType === 'heuristic' ? 'Heuristic' : 'LLM';
    }

    // Update inputs
    const inputsEl = document.getElementById('trace-inputs');
    if (inputsEl) {
      inputsEl.innerHTML = `
        <span class="chain-item">Requests: ${trace.inputs.totalRequests} total, ${trace.inputs.blockedRequests} blocked</span>
        <span class="chain-item">Third-party: ${trace.inputs.thirdPartyRequests}</span>
        <span class="chain-item">Fingerprint APIs: ${trace.inputs.fingerprintAPIs.length > 0 ? trace.inputs.fingerprintAPIs.join(', ') : 'None'}</span>
        <span class="chain-item">Headers modified: ${trace.inputs.headersModified}</span>
      `;
    }

    // Update rules
    const rulesEl = document.getElementById('trace-rules');
    if (rulesEl) {
      const triggeredRules = trace.rulesEvaluated.filter(r => r.triggered && r.scoreContribution > 0);
      if (triggeredRules.length === 0) {
        rulesEl.innerHTML = '<span class="chain-item">No rules triggered</span>';
      } else {
        rulesEl.innerHTML = triggeredRules
          .slice(0, 5)
          .map(r => `<span class="chain-item triggered">${this.escapeHtml(r.name)} (+${r.scoreContribution})</span>`)
          .join('');
      }
    }

    // Update outputs
    const outputsEl = document.getElementById('trace-outputs');
    if (outputsEl) {
      outputsEl.innerHTML = `
        <span class="chain-item">Risk: ${trace.classificationOutput.riskLevel}</span>
        <span class="chain-item">Confidence: ${Math.round(trace.classificationOutput.confidence * 100)}%</span>
        <span class="chain-item">Vectors: ${trace.classificationOutput.detectedVectors.length > 0 ? trace.classificationOutput.detectedVectors.length + ' detected' : 'None'}</span>
        <span class="chain-item">Recommendation: ${trace.classificationOutput.recommendation}</span>
      `;
    }
  }

  private clearTracePanel(): void {
    const traceIdEl = document.getElementById('trace-id');
    const timestampEl = document.getElementById('trace-timestamp');
    const classifierEl = document.getElementById('trace-classifier');
    const inputsEl = document.getElementById('trace-inputs');
    const rulesEl = document.getElementById('trace-rules');
    const outputsEl = document.getElementById('trace-outputs');

    if (traceIdEl) traceIdEl.textContent = '—';
    if (timestampEl) timestampEl.textContent = '—';
    if (classifierEl) classifierEl.textContent = '—';
    if (inputsEl) inputsEl.innerHTML = '<span class="trace-loading">No trace available</span>';
    if (rulesEl) rulesEl.innerHTML = '<span class="trace-loading">No trace available</span>';
    if (outputsEl) outputsEl.innerHTML = '<span class="trace-loading">No trace available</span>';

    this.currentTrace = null;
  }

  private async exportCurrentTrace(): Promise<void> {
    if (!this.currentTrace) {
      alert('No trace available to export');
      return;
    }

    const tab = this.activeTabId !== null ? this.tabs.get(this.activeTabId) : null;
    if (!tab) return;

    try {
      const json = await window.liminal.ai.exportTrace(tab.contextId, this.currentTrace.trace.traceId);
      if (json) {
        // Create and download file
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `liminal-trace-${this.currentTrace.trace.traceId.slice(0, 8)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export trace:', error);
      alert('Failed to export trace');
    }
  }

  private updateAIPanel(classification: AIClassification): void {
    // Risk Level Badge
    const riskBadge = document.getElementById('ai-risk-badge');
    const riskLevel = document.getElementById('ai-risk-level');
    if (riskBadge && riskLevel) {
      riskBadge.dataset.level = classification.riskLevel.toLowerCase();
      riskLevel.textContent = classification.riskLevel;
    }

    // Confidence
    const confidenceEl = document.getElementById('ai-confidence');
    if (confidenceEl) {
      const confidenceValue = confidenceEl.querySelector('.confidence-value');
      if (confidenceValue) {
        confidenceValue.textContent = `${Math.round(classification.confidence * 100)}%`;
      }
    }

    // Explanation
    const explanationEl = document.getElementById('ai-explanation');
    if (explanationEl) {
      const textEl = explanationEl.querySelector('.explanation-text');
      if (textEl) {
        textEl.textContent = classification.explanation;
      }
    }

    // Detected Tracking Vectors
    const trackingList = document.getElementById('ai-tracking-list');
    if (trackingList) {
      if (classification.detectedVectors.length === 0) {
        trackingList.innerHTML = '<span class="empty-tracking">No tracking detected</span>';
      } else {
        trackingList.innerHTML = classification.detectedVectors
          .map(v => `<span class="tracking-tag">${this.formatTrackingVector(v)}</span>`)
          .join('');
      }
    }

    // Recommendation (DISPLAY ONLY - does not affect enforcement)
    const recommendationBadge = document.getElementById('ai-recommendation-badge');
    if (recommendationBadge) {
      recommendationBadge.dataset.mode = classification.recommendation.toLowerCase();
      recommendationBadge.textContent = classification.recommendation;
    }
  }

  private formatTrackingVector(vector: TrackingVector): string {
    // Convert SNAKE_CASE to Title Case
    return vector
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private clearAIPanel(): void {
    const riskBadge = document.getElementById('ai-risk-badge');
    const riskLevel = document.getElementById('ai-risk-level');
    if (riskBadge && riskLevel) {
      riskBadge.dataset.level = 'unknown';
      riskLevel.textContent = '—';
    }

    const confidenceEl = document.getElementById('ai-confidence');
    if (confidenceEl) {
      const confidenceValue = confidenceEl.querySelector('.confidence-value');
      if (confidenceValue) {
        confidenceValue.textContent = '—';
      }
    }

    const explanationEl = document.getElementById('ai-explanation');
    if (explanationEl) {
      const textEl = explanationEl.querySelector('.explanation-text');
      if (textEl) {
        textEl.textContent = 'Analyzing privacy status...';
      }
    }

    const trackingList = document.getElementById('ai-tracking-list');
    if (trackingList) {
      trackingList.innerHTML = '<span class="empty-tracking">No tracking detected</span>';
    }

    const recommendationBadge = document.getElementById('ai-recommendation-badge');
    if (recommendationBadge) {
      recommendationBadge.dataset.mode = 'balanced';
      recommendationBadge.textContent = 'BALANCED';
    }

    this.currentClassification = null;
    
    // Also clear simulation panel
    this.clearSimulationPanel();
    
    // Also clear trace panel (Phase 2.4)
    this.clearTracePanel();
  }

  // ========== Phase 2.2: Policy Simulation Preview (DISPLAY ONLY) ==========

  private updateSimulationPanel(simulation: PolicySimulationOutput): void {
    // Update STRICT mode preview
    this.updateSimulationMode('strict', simulation.strict);
    
    // Update BALANCED mode preview
    this.updateSimulationMode('balanced', simulation.balanced);
    
    // Update PERMISSIVE mode preview
    this.updateSimulationMode('permissive', simulation.permissive);
  }

  private updateSimulationMode(mode: 'strict' | 'balanced' | 'permissive', result: SimulationResult): void {
    const changesEl = document.getElementById(`sim-${mode}-changes`);
    const breakageEl = document.getElementById(`sim-${mode}-breakage`);

    if (changesEl) {
      if (result.changes.length === 0) {
        changesEl.innerHTML = '<span class="change-item">No significant changes</span>';
      } else {
        changesEl.innerHTML = result.changes
          .slice(0, 3) // Limit to 3 items for space
          .map(change => {
            const isPositive = change.toLowerCase().includes('increase') || 
                               change.toLowerCase().includes('block') ||
                               change.toLowerCase().includes('stricter');
            const className = isPositive ? 'change-positive' : '';
            return `<span class="change-item ${className}">${this.escapeHtml(change)}</span>`;
          })
          .join('');
      }
    }

    if (breakageEl) {
      breakageEl.textContent = `Breakage: ${result.breakageRiskLevel}`;
      breakageEl.dataset.risk = result.breakageRiskLevel.toLowerCase();
    }
  }

  private clearSimulationPanel(): void {
    const modes = ['strict', 'balanced', 'permissive'];
    
    for (const mode of modes) {
      const changesEl = document.getElementById(`sim-${mode}-changes`);
      const breakageEl = document.getElementById(`sim-${mode}-breakage`);
      const explanationEl = document.getElementById(`sim-${mode}-explanation`);
      const factorsEl = document.getElementById(`sim-${mode}-factors`);
      
      if (changesEl) {
        changesEl.innerHTML = '<span class="loading-sim">Calculating...</span>';
      }
      
      if (breakageEl) {
        breakageEl.textContent = '—';
        delete breakageEl.dataset.risk;
      }
      
      if (explanationEl) {
        explanationEl.textContent = 'Analyzing...';
      }
      
      if (factorsEl) {
        const factorsList = factorsEl.querySelector('.factors-list');
        if (factorsList) {
          factorsList.textContent = '—';
        }
      }
    }
    
    // Clear diff explanation
    this.clearDiffExplanationPanel();
  }

  // ========== Phase 2.3: Policy Diff Explanation (DISPLAY ONLY) ==========

  private updateDiffExplanationPanel(diff: PolicyDiffExplanation): void {
    // Update key differences
    const diffList = document.getElementById('diff-list');
    if (diffList) {
      if (diff.keyDifferences.length === 0) {
        diffList.innerHTML = '<li class="diff-item">All modes provide similar protection.</li>';
      } else {
        diffList.innerHTML = diff.keyDifferences
          .map(d => `<li class="diff-item">${this.escapeHtml(d)}</li>`)
          .join('');
      }
    }

    // Update mode explanations
    this.updateModeExplanation('strict', diff.strict);
    this.updateModeExplanation('balanced', diff.balanced);
    this.updateModeExplanation('permissive', diff.permissive);
  }

  private updateModeExplanation(mode: 'strict' | 'balanced' | 'permissive', explanation: ModeExplanation): void {
    // Update summary
    const explanationEl = document.getElementById(`sim-${mode}-explanation`);
    if (explanationEl) {
      explanationEl.textContent = explanation.summary;
    }

    // Update top factors
    const factorsEl = document.getElementById(`sim-${mode}-factors`);
    if (factorsEl) {
      const factorsList = factorsEl.querySelector('.factors-list');
      if (factorsList) {
        if (explanation.topFactors.length === 0) {
          factorsList.innerHTML = '<span>None active</span>';
        } else {
          factorsList.innerHTML = explanation.topFactors
            .map(f => `<span class="factor-tag ${f.category}">${this.escapeHtml(f.name)}</span>`)
            .join('');
        }
      }
    }
  }

  private clearDiffExplanationPanel(): void {
    const diffList = document.getElementById('diff-list');
    if (diffList) {
      diffList.innerHTML = '<li class="diff-item">Analyzing differences...</li>';
    }
  }

  private async createTab(url?: string): Promise<void> {
    const tab = await window.liminal.tab.create(url);
    if (tab) {
      this.tabs.set(tab.id, tab);
      this.addTabToUI(tab);
      this.activateTab(tab.id);
    }
  }

  private addTabToUI(tab: Tab): void {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = String(tab.id);
    
    tabEl.innerHTML = `
      <span class="tab-context">${this.shortenContextId(tab.contextId)}</span>
      <span class="tab-title">${this.escapeHtml(tab.title)}</span>
      <span class="tab-close" title="Close tab">×</span>
    `;

    // Tab click to activate
    tabEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('tab-close')) {
        this.activateTab(tab.id);
      }
    });

    // Close button
    const closeBtn = tabEl.querySelector('.tab-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });

    container.appendChild(tabEl);
    this.updateEmptyState();
  }

  private updateTabUI(tab: Tab): void {
    const tabEl = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
    if (!tabEl) return;

    const titleEl = tabEl.querySelector('.tab-title');
    if (titleEl) {
      titleEl.textContent = tab.title || 'New Tab';
    }

    tabEl.classList.toggle('loading', tab.loading);
    tabEl.classList.toggle('active', tab.active);
  }

  private activateTab(tabId: number): void {
    // Deactivate previous
    if (this.activeTabId !== null) {
      const prevTab = this.tabs.get(this.activeTabId);
      if (prevTab) {
        prevTab.active = false;
        this.updateTabUI(prevTab);
      }
      // Stop AI refresh for previous tab
      this.stopAIRefresh();
    }

    // Activate new
    this.activeTabId = tabId;
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.active = true;
      this.updateTabUI(tab);
      this.updateNavBar(tab);
      
      // Subscribe to receipt updates for this context
      window.liminal.receipt.subscribe(tab.contextId);
      
      // Fetch and display receipt
      this.fetchReceipt(tab.contextId);

      // Start AI classification updates (Phase 2 - READ-ONLY observation)
      this.startAIRefresh(tab.contextId);
    }
  }

  private async closeTab(tabId: number): Promise<void> {
    await window.liminal.tab.close(tabId);
    
    const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    tabEl?.remove();
    
    this.tabs.delete(tabId);
    
    // If we closed the active tab, activate another
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      this.stopAIRefresh();
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        this.activateTab(remaining[0]);
      } else {
        this.clearNavBar();
        this.clearReceiptPanel();
        this.clearAIPanel();
      }
    }

    this.updateEmptyState();
  }

  private async navigate(input: string): Promise<void> {
    if (this.activeTabId === null) return;
    await window.liminal.tab.navigate(this.activeTabId, input);
  }

  private async goBack(): Promise<void> {
    if (this.activeTabId === null) return;
    await window.liminal.nav.back(this.activeTabId);
  }

  private async goForward(): Promise<void> {
    if (this.activeTabId === null) return;
    await window.liminal.nav.forward(this.activeTabId);
  }

  private async reload(): Promise<void> {
    if (this.activeTabId === null) return;
    await window.liminal.nav.reload(this.activeTabId);
  }

  private async rotateIdentity(): Promise<void> {
    if (this.activeTabId === null) return;
    
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    const result = await window.liminal.context.rotate(tab.contextId);
    if (result) {
      // Clear and refresh receipt
      this.clearReceiptPanel();
      this.fetchReceipt(tab.contextId);
      
      // Clear and refresh AI classification (Phase 2 - READ-ONLY observation)
      this.clearAIPanel();
      this.fetchClassification(tab.contextId);
      
      // Update tab UI to show new context
      const tabEl = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
      const contextEl = tabEl?.querySelector('.tab-context');
      if (contextEl) {
        contextEl.textContent = this.shortenContextId(tab.contextId);
      }
    }
  }

  private async fetchReceipt(contextId: ContextId): Promise<void> {
    const receipt = await window.liminal.receipt.get(contextId);
    if (receipt) {
      this.currentReceipt = receipt;
      this.updateReceiptPanel(receipt);
    }
  }

  private updateNavBar(tab: Tab): void {
    const urlInput = document.getElementById('url-input') as HTMLInputElement;
    const contextIdEl = document.getElementById('context-id-short');
    const contextBadge = document.getElementById('context-badge');

    if (urlInput) {
      urlInput.value = tab.url === 'about:blank' ? '' : tab.url;
    }

    if (contextIdEl) {
      contextIdEl.textContent = this.shortenContextId(tab.contextId);
    }

    if (contextBadge) {
      contextBadge.title = `Context: ${tab.contextId}`;
    }
  }

  private clearNavBar(): void {
    const urlInput = document.getElementById('url-input') as HTMLInputElement;
    const contextIdEl = document.getElementById('context-id-short');

    if (urlInput) urlInput.value = '';
    if (contextIdEl) contextIdEl.textContent = '—';
  }

  private updateReceiptPanel(receipt: PrivacyReceipt): void {
    // Context info
    const contextIdEl = document.getElementById('receipt-context-id');
    const proxyEl = document.getElementById('receipt-proxy');
    const durationEl = document.getElementById('receipt-duration');

    if (contextIdEl) {
      contextIdEl.textContent = this.shortenContextId(receipt.contextId);
      contextIdEl.title = receipt.contextId;
    }

    if (proxyEl) {
      proxyEl.textContent = this.formatProxy(receipt.proxy);
    }

    if (durationEl) {
      durationEl.textContent = this.formatDuration(receipt.lastUpdated - receipt.startTime);
    }

    // Stats
    const blockedCountEl = document.getElementById('stat-blocked-count');
    const blockedDomainsEl = document.getElementById('stat-blocked-domains');

    if (blockedCountEl) {
      blockedCountEl.textContent = String(receipt.blockedCount);
    }

    if (blockedDomainsEl) {
      blockedDomainsEl.textContent = String(receipt.blockedDomains.length);
    }

    // Domain lists
    this.updateDomainList('blocked-domains-list', receipt.blockedDomains, true);
    this.updateDomainList('third-party-domains-list', receipt.allowedThirdPartyDomains, false);
  }

  private updateDomainList(elementId: string, domains: string[], isBlocked: boolean): void {
    const listEl = document.getElementById(elementId);
    if (!listEl) return;

    if (domains.length === 0) {
      listEl.innerHTML = `<div class="empty-list">No ${isBlocked ? 'blocked' : 'third-party'} domains</div>`;
      return;
    }

    listEl.innerHTML = domains
      .map(d => `<div class="domain-item ${isBlocked ? 'blocked' : ''}">${this.escapeHtml(d)}</div>`)
      .join('');
  }

  private clearReceiptPanel(): void {
    const elements = [
      'receipt-context-id',
      'receipt-proxy',
      'receipt-duration',
      'stat-blocked-count',
      'stat-blocked-domains',
    ];

    elements.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id.includes('count') || id.includes('domains') ? '0' : '—';
    });

    this.updateDomainList('blocked-domains-list', [], true);
    this.updateDomainList('third-party-domains-list', [], false);
  }

  private updateEmptyState(): void {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
      emptyState.style.display = this.tabs.size === 0 ? 'block' : 'none';
    }
  }

  // Utility methods
  private shortenContextId(contextId: string): string {
    if (contextId.length <= 8) return contextId;
    return contextId.substring(0, 8);
  }

  private formatProxy(proxy: ProxyConfig): string {
    if (proxy.type === 'direct') return 'Direct';
    return `${proxy.type.toUpperCase()} ${proxy.host}:${proxy.port}`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return '<1s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LiminalUI();
});

