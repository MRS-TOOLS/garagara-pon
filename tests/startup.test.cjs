const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const directory = path.join(__dirname, '..');
const originalHTML = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const kind = path.basename(directory);
const origin = 'https://app.example';
const never = () => new Promise(() => {});
const waitFor = async predicate => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('App did not reach expected state');
};
async function database(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open('mrs-photo-memo', 1);
    request.onupgradeneeded = () => {
      for (const name of ['projects','photos','images','categories','tags','settings']) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function seedDatabase(factory, seed) {
  const db = await database(factory);
  const stores = Object.keys(seed);
  if (stores.length) await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    for (const name of stores) for (const value of seed[name]) tx.objectStore(name).put(value);
  });
  db.close();
}
async function readDatabase(factory, store) {
  const db = await database(factory);
  const result = await new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  db.close(); return result;
}
async function openApp({ seed = {}, dbSeed = {}, factory = new IDBFactory(), registrationFails = false, machineMode = 'success' } = {}) {
  const errors = [], registrations = [], deadlines = [], moduleCache = new Map();
  let dom, adRequested = false, loaded = false, machineCreated = 0, releaseMachine;
  await seedDatabase(factory, dbSeed);
  function moduleFor(filename) {
    if (!moduleCache.has(filename)) moduleCache.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), {
      identifier: filename, context: dom.getInternalVMContext()
    }));
    return moduleCache.get(filename);
  }
  const source = fs.readFileSync(path.join(directory, 'script.js'), 'utf8');
  const html = kind === 'photo-memo'
    ? originalHTML.replace(/<script type="module" async src="script.js\?v=33"><\/script>/, '<script src="/__module-start.js"></script>')
    : originalHTML;
  const resources = { interceptors: [requestInterceptor(request => {
    const url = request.url;
    if (url.startsWith('https://adm.shinobi.jp/')) { adRequested = true; return never(); }
    const file = new URL(url).pathname.slice(1);
    let text = '';
    if (file === '__module-start.js') text = 'window.__runPhotoModule();';
    else if (file === 'script.js' && kind === 'garagara-pon') text = 'window.__runClassic();';
    else if (!file.endsWith('.css')) text = fs.readFileSync(path.join(directory, file), 'utf8');
    return new Response(text, { headers: { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'application/javascript' } });
  })] };
  const console = new VirtualConsole();
  console.on('jsdomError', e => errors.push(e));
  dom = new JSDOM(html, {
    url: origin + '/', runScripts: 'dangerously', resources, virtualConsole: console,
    beforeParse(w) {
      w.structuredClone = structuredClone; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      w.Blob = Blob; w.File = File; w.indexedDB = factory;
      w.confirm = () => true; w.alert = m => errors.push(new Error(m)); w.scrollTo = () => {};
      w.matchMedia = () => ({ matches: true, addEventListener() {} });
      w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
      w.HTMLDialogElement.prototype.close = function() { this.open = false; };
      Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => false });
      const nativeTimeout = w.setTimeout.bind(w);
      w.setTimeout = (fn, delay, ...args) => {
        if (delay === 8000) deadlines.push(delay);
        return nativeTimeout(fn, delay === 8000 ? 20 : delay, ...args);
      };
      for (const [key, value] of Object.entries(seed)) w.localStorage.setItem(key, JSON.stringify(value));
      Object.defineProperty(w.navigator, 'serviceWorker', {
        value: { ready: never(), register(url, options) {
          registrations.push({ url, options });
          return registrationFails ? Promise.reject(new Error('SW unavailable')) : never();
        } }
      });
      w.addEventListener('load', () => { loaded = true; });
      w.__runClassic = () => {
        new vm.Script(source, { filename: 'script.js', importModuleDynamically: async () => {
          if (machineMode === 'hang') return never();
          if (machineMode === 'late') await new Promise(resolve => { releaseMachine = resolve; });
          if (machineMode === 'failure') throw new Error('Module failed');
          const module = new vm.SyntheticModule(['createMachine'], function() {
            this.setExport('createMachine', () => {
              machineCreated++;
              return { setResult() {}, spin: async () => {} };
            });
          }, { context: dom.getInternalVMContext() });
          await module.link(() => {}); await module.evaluate(); return module;
        } }).runInContext(dom.getInternalVMContext());
      };
      w.__runPhotoModule = () => {
        (async () => {
          const module = moduleFor(path.join(directory, 'script.js'));
          await module.link((specifier, ref) => moduleFor(path.resolve(path.dirname(ref.identifier), specifier.split('?')[0])));
          await module.evaluate();
        })().catch(e => errors.push(e));
      };
    }
  });
  await waitFor(() => adRequested && (registrations.length || errors.length));
  return { dom, errors, registrations, deadlines, factory,
    get loaded() { return loaded; }, get adRequested() { return adRequested; },
    get machineCreated() { return machineCreated; }, releaseMachine: () => releaseMachine?.() };
}
test('application loader precedes original advertising tag', () => {
  const scripts = [...originalHTML.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1]);
  const ad = scripts.filter(s => s.startsWith('https://adm.shinobi.jp/'));
  assert.equal(ad.length, 1);
  assert.ok(scripts.findIndex(s => s.startsWith('script.js')) < scripts.indexOf(ad[0]));
  if (kind === 'photo-memo') assert.match(originalHTML, /<script type="module" async src="script.js\?v=33">/);
});

const saved = {
  version: 1, prizes: [{ id: 'one', name: '保存した賞', color: 'gold', count: 3, remaining: 2 }],
  history: [{ prizeId: 'one', name: '保存した賞', color: 'gold', number: 1, time: '2026-10-20T14:00:00Z' }], draws: 1
};
const key = 'mrs-garagara-pon-v1';
for (const registrationFails of [false, true]) {
  test('garapon restores prizes/count/history and draws while ad waits; SW failure=' + registrationFails, async () => {
    const app = await openApp({ seed: { [key]: saved, 'mrs-garagara-pon-view-settings-v1': { showRemaining: true, showHistory: true } }, registrationFails });
    try {
      const w = app.dom.window, d = w.document;
      await waitFor(() => app.machineCreated === 1);
      assert.equal(app.loaded, false); assert.equal(d.readyState, 'loading');
      assert.equal(app.errors.length, 0, app.errors.map(String).join('\n'));
      assert.equal(d.getElementById('total-remaining').textContent, '2');
      assert.match(d.getElementById('history-list').textContent, /保存した賞/);
      assert.deepEqual(JSON.parse(w.localStorage.getItem(key)), saved);
      d.getElementById('spin-button').click();
      await waitFor(() => d.getElementById('spin-button').disabled === false);
      const after = JSON.parse(w.localStorage.getItem(key));
      assert.equal(after.draws, 2); assert.equal(after.prizes[0].remaining, 1);
      assert.equal(after.history.length, 2); assert.equal(after.prizes[0].name, '保存した賞');
      w.dispatchEvent(new w.Event('load'));
      assert.equal(app.registrations.length, 1); assert.equal(app.machineCreated, 1);
    } finally { app.dom.window.close(); }
  });
}
for (const machineMode of ['hang', 'failure', 'late']) {
  test('3D preparation ' + machineMode + ' ends with recovery guidance and preserves saved draw data', async () => {
    const app = await openApp({ seed: { [key]: saved }, machineMode });
    try {
      const d = app.dom.window.document;
      await waitFor(() => /再読み込み/.test(d.getElementById('machine-stage').textContent));
      assert.equal(d.getElementById('spin-button').disabled, true);
      assert.equal(d.getElementById('settings-button').disabled, false);
      assert.deepEqual(JSON.parse(app.dom.window.localStorage.getItem(key)), saved);
      assert.ok(app.deadlines.includes(8000));
      if (machineMode === 'late') {
        app.releaseMachine();
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(app.machineCreated, 0);
        assert.equal(d.getElementById('spin-button').disabled, true);
      }
    } finally { app.dom.window.close(); }
  });
}
