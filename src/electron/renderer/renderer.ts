export {};

const api = (window as any).liminal;
const ctxLabel = document.getElementById('contexts')!;
const output = document.getElementById('output') as HTMLPreElement;
const txInput = document.getElementById('txid') as HTMLInputElement;

async function refresh() {
  const list = await api.listContexts();
  ctxLabel.textContent = `Contexts: ${JSON.stringify(list)}`;
}

document.getElementById('create')!.addEventListener('click', async () => {
  await api.createContext();
  await refresh();
});

document.getElementById('list')!.addEventListener('click', async () => {
  await refresh();
});

document.getElementById('close')!.addEventListener('click', async () => {
  const list = await api.listContexts();
  if (Array.isArray(list) && list.length > 0) {
    await api.closeContext(list[0].id);
    await refresh();
  }
});

document.getElementById('submit')!.addEventListener('click', async () => {
  const txId = txInput.value.trim();
  if (!txId) {
    output.textContent = 'txId required';
    return;
  }
  const res = await api.submitTransaction(txId);
  output.textContent = JSON.stringify(res, null, 2);
});

document.getElementById('status')!.addEventListener('click', async () => {
  const txId = txInput.value.trim();
  if (!txId) {
    output.textContent = 'txId required';
    return;
  }
  const res = await api.getTransactionStatus(txId);
  output.textContent = JSON.stringify(res, null, 2);
});

document.getElementById('receipt')!.addEventListener('click', async () => {
  const txId = txInput.value.trim();
  if (!txId) {
    output.textContent = 'txId required';
    return;
  }
  const res = await api.getReceipt(txId);
  output.textContent = JSON.stringify(res, null, 2);
});

refresh();
