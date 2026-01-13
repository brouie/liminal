export {};

type Tab = { id: string; partition: string; url: string; active?: boolean };

const api = (window as any).liminal;
const tabsEl = document.getElementById('tabs')!;
const addressInput = document.getElementById('address') as HTMLInputElement;
const errorEl = document.getElementById('error')!;
const statusEl = document.getElementById('status')!;
const output = document.getElementById('output') as HTMLPreElement;
const txInput = document.getElementById('txid') as HTMLInputElement;

let tabs: Tab[] = [];
let activeId: string | null = null;

function show(data: unknown) {
  output.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function renderTabs() {
  tabsEl.innerHTML = '';
  const addBtn = document.createElement('button');
  addBtn.id = 'add-tab';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', async () => {
    await api.createContext();
    await refreshTabs();
  });
  tabsEl.appendChild(addBtn);

  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = `tab${tab.id === activeId ? ' active' : ''}`;
    el.textContent = tab.url || tab.id;
    const close = document.createElement('span');
    close.className = 'close';
    close.textContent = '×';
    close.addEventListener('click', async ev => {
      ev.stopPropagation();
      await api.closeContext(tab.id);
      await refreshTabs();
    });
    el.appendChild(close);
    el.addEventListener('click', async () => {
      await api.setActiveContext(tab.id);
      activeId = tab.id;
      addressInput.value = tab.url || '';
      renderTabs();
      await refreshStatus();
    });
    tabsEl.appendChild(el);
  });
}

async function refreshTabs() {
  const list = await api.listContexts();
  tabs = Array.isArray(list) ? list : [];
  const active = tabs.find(t => t.active) || tabs[0];
  activeId = active ? active.id : null;
  if (active) {
    addressInput.value = active.url || '';
  }
  renderTabs();
  await refreshStatus();
}

async function navigate() {
  if (!activeId) {
    errorEl.textContent = 'No active tab';
    return;
  }
  const url = addressInput.value.trim();
  if (!url) {
    errorEl.textContent = 'URL required';
    return;
  }
  const res = await api.navigate(activeId, url);
  if (res?.ok) {
    errorEl.textContent = '';
    await refreshTabs();
  } else {
    errorEl.textContent = res?.error || 'Navigation failed';
  }
}

document.getElementById('go')!.addEventListener('click', navigate);
addressInput.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') {
    navigate();
  }
});

document.getElementById('back')!.addEventListener('click', async () => {
  if (!activeId) return;
  await api.back(activeId);
});
document.getElementById('forward')!.addEventListener('click', async () => {
  if (!activeId) return;
  await api.forward(activeId);
});
document.getElementById('reload')!.addEventListener('click', async () => {
  if (!activeId) return;
  await api.reload(activeId);
});

async function refreshStatus() {
  const status = await api.getBrowserStatus();
  const active = tabs.find(t => t.id === activeId);
  addressInput.value = active?.url || '';
  statusEl.textContent = [
    active ? `contextId: ${active.id}` : 'context: none',
    active ? `partition: ${active.partition}` : '',
    status?.killSwitch ? `kill-switch: ${status.killSwitch}` : 'kill-switch: inactive',
    status?.policy
      ? `policy: ${status.policy.lockStatus} (allowSubmission=${status.policy.allowSubmission})`
      : 'policy: n/a',
  ]
    .filter(Boolean)
    .join(' | ');
}

document.getElementById('submit')!.addEventListener('click', async () => {
  const txId = txInput.value.trim();
  if (!txId) {
    show('txId required');
    return;
  }
  try {
    const res = await api.submitTransaction(txId);
    show(res);
  } catch (err: any) {
    show(`Error: ${err?.message ?? String(err)}`);
  }
});

document.getElementById('status-btn')!.addEventListener('click', async () => {
  const txId = txInput.value.trim();
  if (!txId) {
    show('txId required');
    return;
  }
  try {
    const res = await api.getTransactionStatus(txId);
    show(res);
  } catch (err: any) {
    show(`Error: ${err?.message ?? String(err)}`);
  }
});

document.getElementById('receipt-btn')!.addEventListener('click', async () => {
  const txId = txInput.value.trim();
  if (!txId) {
    show('txId required');
    return;
  }
  try {
    const res = await api.getReceipt(txId);
    show(res);
  } catch (err: any) {
    show(`Error: ${err?.message ?? String(err)}`);
  }
});

refreshTabs();
