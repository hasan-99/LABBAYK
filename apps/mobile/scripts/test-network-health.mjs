import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/network-health.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const network = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const storageValues = new Map();
globalThis.__networkTestStorage = {
  getOfflineItem: async (key) => storageValues.get(key) ?? null,
  setOfflineItem: async (key, value) => { storageValues.set(key, value); },
  removeOfflineItem: async (key) => { storageValues.delete(key); },
};
const importStorageModule = async (path) => {
  const file = new URL(path, import.meta.url);
  const text = (await readFile(file, 'utf8')).replace(
    /^import \{ getOfflineItem, removeOfflineItem, setOfflineItem \} from '\.\/offline-storage';\r?\n/m,
    'const { getOfflineItem, removeOfflineItem, setOfflineItem } = globalThis.__networkTestStorage;\n',
  );
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const customerDraft = await importStorageModule('../src/lib/customer-order-draft.ts');
const driverCache = await importStorageModule('../src/lib/driver-orders-cache.ts');

const response = (status) => new Response(null, { status });
for (const status of [401, 403, 429]) {
  await network.createMonitoredFetch(async () => response(status))('/rest/v1/orders');
  assert.equal(network.getBackendHealth(), 'reachable', `HTTP ${status} proves the server responded`);
}

await network.createMonitoredFetch(async () => response(503))('/rest/v1/orders');
assert.equal(network.getBackendHealth(), 'degraded', 'server errors are distinct from no connection');

await assert.rejects(network.createMonitoredFetch(async () => { throw new Error('offline'); })('/rest/v1/orders'));
assert.equal(network.getBackendHealth(), 'unreachable');

const slowFetch = (_input, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
});
await assert.rejects(network.createMonitoredFetch(slowFetch, 10)('/rest/v1/orders'));
assert.equal(network.getBackendHealth(), 'unreachable', 'timed-out requests mark the backend unreachable');

await network.createMonitoredFetch(async () => response(200))('/rest/v1/orders');
const controller = new AbortController();
const canceled = network.createMonitoredFetch(slowFetch, 1000)('/rest/v1/orders', { signal: controller.signal });
controller.abort();
await assert.rejects(canceled);
assert.equal(network.getBackendHealth(), 'reachable', 'caller cancellation does not report a network outage');

const userId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
await driverCache.saveDriverOrdersSnapshot(userId, [{
  id: orderId, status: 'assigned', category: 'groceries', request_text: 'Private customer notes', delivery_fee_minor: 1000,
  budget_ceiling_minor: 5000, purchase_amount_minor: null, purchase_approved_at: null, created_at: new Date().toISOString(),
  address_id: '33333333-3333-4333-8333-333333333333', address: { id: '33333333-3333-4333-8333-333333333333', label: 'Home', street: 'Private street', city: 'Damascus', neighborhood: 'Private area', contact_phone: '+963900000000', building: null, landmark: null },
}]);
const driverStorage = JSON.stringify([...storageValues.values()]);
assert(!driverStorage.includes('+963900000000') && !driverStorage.includes('Private street') && !driverStorage.includes('Private customer notes'), 'driver cache removes address, phone, and request text');
const cachedDriver = await driverCache.loadDriverOrdersSnapshot(userId);
assert.equal(cachedDriver.orders[0].address, null);
assert.equal(cachedDriver.orders[0].request_text, '');
assert.equal(cachedDriver.orders[0].budget_ceiling_minor, 0, 'driver snapshots do not keep stale financial values');

await customerDraft.saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request: 'Test order', category: 'groceries', budgetCeiling: '5000', addressId: '33333333-3333-4333-8333-333333333333', idempotencyKey: '44444444-4444-4444-8444-444444444444' });
assert.equal((await customerDraft.loadCustomerOrderDraft(userId)).request, 'Test order');
await assert.rejects(customerDraft.saveCustomerOrderDraft(userId, { schemaVersion: 1, savedAt: new Date().toISOString(), request: 'x'.repeat(16_000), category: '', budgetCeiling: '', addressId: '', idempotencyKey: '44444444-4444-4444-8444-444444444444' }), /storage limit/);

console.log('network-health: 13 checks passed');
