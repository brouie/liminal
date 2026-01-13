export {};

const api = (window as any).liminal;
const ctxLabel = document.getElementById('contexts')!;
const output = document.getElementById('output') as HTMLPreElement;
const txInput = document.getElementById('txid') as HTMLInputElement;

function show(data: unknown) {
  output.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

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
    show('txId required');
    return;
  }
  try {
    const res = await api.submitTransaction(txId);
    if (res?.ok === false) {
      show(res);
    } else {
      show(res);
    }
  } catch (err: any) {
    show(`Error: ${err?.message ?? String(err)}`);
  }
});

document.getElementById('status')!.addEventListener('click', async () => {
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

document.getElementById('receipt')!.addEventListener('click', async () => {
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

refresh();
