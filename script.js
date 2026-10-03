"use strict";
(() => {
  const STORAGE_KEY = "mrs-garagara-pon-v1";
  const COLORS = [
    ["red", "赤", "#ed605b"], ["yellow", "黄", "#f3c64c"],
    ["blue", "青", "#609cea"], ["green", "緑", "#6dbb8d"],
    ["pink", "ピンク", "#ea89bc"], ["purple", "紫", "#aa88dc"],
    ["white", "白", "#f4f1e9"], ["gold", "金", "#d5aa4d"]
  ];
  const $ = (selector) => document.querySelector(selector);
  const colorInfo = (key) => COLORS.find((color) => color[0] === key);
  const freshState = () => ({version: 1, prizes: [
    {id: "first", name: "1等", color: "gold", count: 1, remaining: 1},
    {id: "second", name: "2等", color: "red", count: 3, remaining: 3},
    {id: "third", name: "3等", color: "blue", count: 6, remaining: 6},
    {id: "last", name: "参加賞", color: "white", count: 20, remaining: 20}
  ], history: [], draws: 0});
  let busy = false;
  let draftDirty = false;
  let stale = false;
  const storageNotice = (text) => {
    $("#storage-message").textContent = text;
    $("#storage-message").hidden = !text;
  };
  function validState(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.prizes) || data.prizes.length < 1 || data.prizes.length > 20 || !Array.isArray(data.history) || data.history.length > 200 || !Number.isSafeInteger(data.draws) || data.draws < 0) return false;
    const ids = new Set();
    for (const p of data.prizes) {
      if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 40 || !colorInfo(p.color) || !Number.isInteger(p.count) || p.count < 0 || p.count > 9999 || !Number.isInteger(p.remaining) || p.remaining < 0 || p.remaining > p.count) return false;
      ids.add(p.id);
    }
    const used = data.prizes.reduce((sum, p) => sum + p.count - p.remaining, 0);
    if (used !== data.draws || data.history.length !== Math.min(200, data.draws)) return false;
    return data.history.every((h, index) => h && ids.has(h.prizeId) && typeof h.name === "string" && h.name.length <= 40 && colorInfo(h.color) && h.number === data.draws - index && typeof h.time === "string" && Number.isFinite(Date.parse(h.time)));
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const data = JSON.parse(raw);
      if (validState(data)) return data;
      storageNotice("保存データを読み込めませんでした。初期設定で表示しています。保存・抽選すると新しいデータに置き換わります。");
    } catch {
      storageNotice("保存データを読み込めませんでした。この画面では抽選できますが、再読み込み後に引き継げない場合があります。");
    }
    return freshState();
  }
  let state = loadState();
  let machine = null;
  let machinePending = true;
  import('./machine-3d.js?v=4').then(({createMachine}) => {
    machine = createMachine($("#machine-stage"));
    machinePending = false;
    render();
  }).catch(() => {
    machinePending = false;
    $("#machine-stage").textContent = "この端末では3D表示を開始できませんでした。再読み込みしてください。";
    render();
  });
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageNotice(""); }
    catch { storageNotice("端末に保存できませんでした。現在の画面では使えますが、再読み込みすると今回の変更が失われる場合があります。"); }
  }
  const totalRemaining = () => state.prizes.reduce((sum, p) => sum + p.remaining, 0);
  function dot(color) {
    const element = document.createElement("span");
    element.className = "color-dot";
    element.style.setProperty("--ball-color", colorInfo(color)[2]);
    element.setAttribute("aria-hidden", "true");
    return element;
  }
  function showResult() {
    const latest = state.history[0];
    $("#result-label").textContent = latest ? `第${latest.number}回 · ${colorInfo(latest.color)[1]}玉` : "準備できました";
    $("#result-text").textContent = latest ? latest.name : "何が出るかな？";
    machine?.setResult(latest ? colorInfo(latest.color)[2] : null);
    if (!machinePending && !machine) { $("#result-label").textContent = "3D表示を開始できませんでした"; $("#result-text").textContent = "再読み込みしてください"; }
  }
  function render() {
    const total = totalRemaining();
    $("#total-remaining").textContent = total.toLocaleString("ja-JP");
    $("#draw-count").textContent = state.draws.toLocaleString("ja-JP");
    $("#spin-button").disabled = busy || !total || stale || !machine;
    $("#spin-button").textContent = busy ? "抽選中…" : machinePending ? "3D表示を準備中…" : !machine ? "3D表示を利用できません" : total ? "まわす ↻" : "すべての玉が出ました";
    $("#reset-button").disabled = busy || state.draws === 0 || stale;
    document.querySelectorAll(".tab").forEach((button) => { button.disabled = busy; });
    $("#prize-summary").replaceChildren(...state.prizes.map((p) => {
      const li = document.createElement("li");
      const name = document.createElement("span"); name.className = "prize-name"; name.textContent = `${p.name}（${colorInfo(p.color)[1]}）`;
      const count = document.createElement("span"); count.className = "prize-count";
      const strong = document.createElement("strong"); strong.textContent = p.remaining;
      count.append(strong, ` / ${p.count} 玉`); li.append(dot(p.color), name, count); return li;
    }));
    $("#history-empty").hidden = !!state.history.length;
    $("#history-list").replaceChildren(...state.history.map((h) => {
      const li = document.createElement("li");
      const number = document.createElement("span"); number.className = "history-number"; number.textContent = `#${h.number}`;
      const details = document.createElement("div"); details.className = "history-details";
      const name = document.createElement("strong"); name.textContent = `${h.name}（${colorInfo(h.color)[1]}玉）`;
      const time = document.createElement("time"); time.dateTime = h.time; time.textContent = new Date(h.time).toLocaleString("ja-JP");
      details.append(name, time); li.append(number, dot(h.color), details); return li;
    }));
    if (!busy) showResult();
  }
  function switchPanel(id) {
    document.querySelectorAll(".tool-panel").forEach((panel) => { panel.hidden = panel.id !== id; });
    document.querySelectorAll(".tab").forEach((button) => {
      const active = button.dataset.panel === id;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
  }
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => { if (!busy) switchPanel(button.dataset.panel); }));
  // Rejection sampling: every remaining ball has the same chance.
  function randomBelow(limit) {
    const values = new Uint32Array(1);
    const boundary = Math.floor(4294967296 / limit) * limit;
    do { crypto.getRandomValues(values); } while (values[0] >= boundary);
    return values[0] % limit;
  }
  $("#spin-button").addEventListener("click", async () => {
    if (busy || stale || !machine || totalRemaining() === 0) return;
    let ticket;
    try { ticket = randomBelow(totalRemaining()); }
    catch { $("#result-label").textContent = "抽選できませんでした"; $("#result-text").textContent = "ページを再読み込みしてください"; return; }
    const prize = state.prizes.find((p) => { if (ticket < p.remaining) return true; ticket -= p.remaining; return false; });
    busy = true;
    prize.remaining -= 1;
    state.draws += 1;
    state.history.unshift({prizeId: prize.id, name: prize.name, color: prize.color, number: state.draws, time: new Date().toISOString()});
    state.history = state.history.slice(0, 200);
    // Commit the result before animation, so reload never restores a drawn ball.
    saveState();
    render();
    $("#result-label").textContent = "ガラガラ、ガラガラ…";
    $("#result-text").textContent = "何が出るかな？";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { await machine.spin(colorInfo(prize.color)[2], reduced); }
    catch { storageNotice("3D演出を表示できませんでした。抽選結果は保存されています。"); }
    busy = false;
    render();
    if (stale) storageNotice("別のタブでデータが変更されました。再読み込みしてから続けてください。");
  });
  $("#reset-button").addEventListener("click", () => {
    if (busy || stale || !state.draws || !confirm("玉を元の個数に戻し、抽選履歴をすべて消します。賞の設定は残ります。よろしいですか？")) return;
    state.prizes.forEach((p) => { p.remaining = p.count; }); state.history = []; state.draws = 0;
    saveState(); render();
  });
  function updateEditor() {
    const rows = [...document.querySelectorAll(".prize-row")];
    let total = 0;
    rows.forEach((row, index) => {
      row.querySelector(".row-number").textContent = `賞 ${index + 1}`;
      row.querySelector(".delete-prize").disabled = rows.length === 1;
      const value = row.querySelector(".prize-quantity").valueAsNumber;
      if (Number.isInteger(value) && value >= 0 && value <= 9999) total += value;
    });
    $("#settings-total").textContent = total.toLocaleString("ja-JP");
    $("#add-prize").disabled = rows.length >= 20;
  }
  function addRow(prize) {
    const row = document.createElement("div"); row.className = "prize-row"; row.dataset.id = prize.id;
    const header = document.createElement("div"); header.className = "row-header";
    const number = document.createElement("span"); number.className = "row-number";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-prize"; remove.textContent = "削除";
    remove.addEventListener("click", () => {
      if (document.querySelectorAll(".prize-row").length <= 1) return;
      if (!confirm(`「${row.querySelector(".prize-title").value || "この賞"}」を設定から削除しますか？保存するまでは抽選に反映されません。`)) return;
      row.remove(); draftDirty = true; updateEditor();
    });
    header.append(number, remove);
    const nameLabel = document.createElement("label"); nameLabel.append("賞名");
    const name = document.createElement("input"); name.type = "text"; name.className = "prize-title"; name.maxLength = 40; name.required = true; name.value = prize.name; name.placeholder = "例：1等・参加賞"; nameLabel.append(name);
    const fields = document.createElement("div"); fields.className = "field-group";
    const colorLabel = document.createElement("label"); colorLabel.append("玉の色");
    const color = document.createElement("select"); color.className = "prize-color";
    COLORS.forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; color.append(option); }); color.value = prize.color; colorLabel.append(color);
    const countLabel = document.createElement("label"); countLabel.append("玉の個数");
    const count = document.createElement("input"); count.type = "number"; count.className = "prize-quantity"; count.min = "0"; count.max = "9999"; count.step = "1"; count.inputMode = "numeric"; count.required = true; count.value = prize.count; countLabel.append(count);
    fields.append(colorLabel, countLabel); row.append(header, nameLabel, fields);
    row.addEventListener("input", () => { draftDirty = true; $("#settings-error").textContent = ""; updateEditor(); });
    row.addEventListener("change", () => { draftDirty = true; });
    $("#prize-editor").append(row); updateEditor();
  }
  function fillEditor() { $("#prize-editor").replaceChildren(); state.prizes.forEach(addRow); draftDirty = false; }
  $("#add-prize").addEventListener("click", () => {
    if (document.querySelectorAll(".prize-row").length >= 20) return;
    addRow({id: `prize-${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : randomBelow(1000000000)}`, name: "", color: COLORS[document.querySelectorAll(".prize-row").length % COLORS.length][0], count: 1});
    draftDirty = true; $("#prize-editor").lastElementChild.querySelector("input").focus();
  });
  $("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || stale) return;
    const prizes = [...document.querySelectorAll(".prize-row")].map((row) => ({id: row.dataset.id, name: row.querySelector(".prize-title").value.trim(), color: row.querySelector(".prize-color").value, count: row.querySelector(".prize-quantity").valueAsNumber}));
    if (prizes.some((p) => !p.name || !Number.isInteger(p.count) || p.count < 0 || p.count > 9999)) { $("#settings-error").textContent = "賞名と、0〜9,999の整数の個数を入力してください。"; return; }
    if (prizes.reduce((sum, p) => sum + p.count, 0) === 0) { $("#settings-error").textContent = "合計1玉以上にしてください。"; return; }
    const changed = JSON.stringify(prizes) !== JSON.stringify(state.prizes.map(({id, name, color, count}) => ({id, name, color, count})));
    if (changed && state.draws && !confirm("設定を変更すると、玉の残数を元に戻し、抽選履歴をすべて消します。保存しますか？")) return;
    if (changed) { state = {version: 1, prizes: prizes.map((p) => ({...p, remaining: p.count})), history: [], draws: 0}; }
    saveState(); fillEditor(); render(); switchPanel("draw-panel");
  });
  // Avoid an older tab overwriting a newer draw or settings change.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    stale = true; render();
    $("#settings-form").querySelectorAll("button, input, select").forEach((element) => { element.disabled = true; });
    storageNotice("別のタブでデータが変更されました。再読み込みしてから続けてください。");
  });
  window.addEventListener("beforeunload", (event) => { if (draftDirty) { event.preventDefault(); event.returnValue = ""; } });
  fillEditor(); render();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", {updateViaCache: "none"}).catch(() => { console.warn("オフライン機能を準備できませんでした。"); });
  });
})();
