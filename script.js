"use strict";
(() => {
  const STORAGE_KEY = "mrs-garagara-pon-v1";
  const VIEW_SETTINGS_KEY = "mrs-garagara-pon-view-settings-v1";
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
  function loadViewSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY));
      return {showRemaining: typeof saved?.showRemaining === "boolean" ? saved.showRemaining : true, showHistory: typeof saved?.showHistory === "boolean" ? saved.showHistory : true};
    } catch { return {showRemaining: true, showHistory: true}; }
  }
  let {showRemaining, showHistory} = loadViewSettings();
  function saveViewSettings() {
    try { localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify({showRemaining, showHistory})); }
    catch { storageNotice("表示設定を保存できませんでした。再読み込み後に引き継げない場合があります。"); }
  }
  let machine = null;
  let machinePending = true;
  import('./machine-3d.js?v=7').then(({createMachine}) => {
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
    $("#result-text").textContent = latest ? `${colorInfo(latest.color)[1]}・${latest.name}` : "";
    $("#result-text").classList.toggle("has-result", !!latest);
    machine?.setResult(latest ? colorInfo(latest.color)[2] : null);
    if (!machinePending && !machine) $("#result-text").textContent = "3D表示を開始できませんでした。再読み込みしてください";
  }

  function render() {
    const total = totalRemaining();
    $("#total-remaining").textContent = total.toLocaleString("ja-JP");
    $("#remaining-button").hidden = !showRemaining;
    $("#remaining-button").disabled = busy;
    $("#remaining-button").setAttribute("aria-label", `残り${total.toLocaleString("ja-JP")}玉。色別の残数を表示`);
    $("#spin-button").disabled = busy || !total || stale || !machine;
    const spinLabel = busy ? "抽選中" : machinePending ? "3D表示を準備中" : !machine ? "3D表示を利用できません" : total ? "抽選をスタート" : "すべての玉が出ました";
    $("#spin-button").setAttribute("aria-label", spinLabel);
    $("#spin-button").title = spinLabel;
    $("#spin-button").classList.toggle("is-spinning", busy);
    $("#settings-button").disabled = busy || stale;
    $("#reset-button").disabled = busy || state.draws === 0 || stale;
    $("#history-section").hidden = !showHistory;
    const visibleHistory = busy ? state.history.slice(1) : state.history;
    $("#history-empty").hidden = !!visibleHistory.length;
    $("#history-list").replaceChildren(...visibleHistory.map((h) => {
      const li = document.createElement("li");
      const number = document.createElement("span"); number.className = "history-number"; number.textContent = `#${h.number}`;
      const details = document.createElement("div"); details.className = "history-details";
      const name = document.createElement("strong"); name.textContent = `${colorInfo(h.color)[1]}・${h.name}`;
      const time = document.createElement("time"); time.dateTime = h.time; time.textContent = new Date(h.time).toLocaleString("ja-JP");
      details.append(name, time); li.append(number, dot(h.color), details); return li;
    }));
    renderRemaining();
    if (!busy) showResult();
  }
  const settingsDialog = $("#settings-dialog");
  function closeSettings() {
    settingsDialog.close();
    document.body.classList.remove("settings-open");
    fillEditor();
    $("#settings-error").textContent = "";
  }
  $("#settings-button").addEventListener("click", (event) => {
    if (busy || stale) return;
    fillEditor();
    $("#settings-error").textContent = "";
    settingsDialog.showModal();
    if (event.detail > 0) $("#settings-title").focus({preventScroll: true});
    document.body.classList.add("settings-open");
  });
  $("#settings-cancel").addEventListener("click", closeSettings);
  settingsDialog.addEventListener("cancel", event => { event.preventDefault(); closeSettings(); });
  settingsDialog.addEventListener("click", event => {
    const bounds = settingsDialog.getBoundingClientRect();
    if (event.target === settingsDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeSettings();
  });
  const remainingDialog = $("#remaining-dialog");
  function renderRemaining() {
    const counts = new Map();
    state.prizes.forEach(p => {
      const total = counts.get(p.color) || {remaining: 0, initial: 0};
      total.remaining += p.remaining; total.initial += p.count; counts.set(p.color, total);
    });
    $("#remaining-list").replaceChildren(...COLORS.filter(([color]) => counts.has(color)).map(([color, name]) => {
      const li = document.createElement("li");
      const label = document.createElement("span"); label.textContent = name;
      const count = document.createElement("strong"); count.textContent = `${counts.get(color).remaining.toLocaleString("ja-JP")} / ${counts.get(color).initial.toLocaleString("ja-JP")} 玉`;
      li.append(dot(color), label, count); return li;
    }));
    $("#remaining-total").textContent = `${totalRemaining().toLocaleString("ja-JP")} / ${state.prizes.reduce((sum, p) => sum + p.count, 0).toLocaleString("ja-JP")} 玉`;
  }
  $("#remaining-button").addEventListener("click", (event) => {
    if (busy || !showRemaining) return;
    renderRemaining(); remainingDialog.showModal();
    if (event.detail > 0) $("#remaining-title").focus({preventScroll: true});
    document.body.classList.add("remaining-open");
  });
  $("#remaining-close").addEventListener("click", () => remainingDialog.close());
  remainingDialog.addEventListener("close", () => document.body.classList.remove("remaining-open"));
  remainingDialog.addEventListener("click", event => {
    const bounds = remainingDialog.getBoundingClientRect();
    if (event.target === remainingDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) remainingDialog.close();
  });
  ["#show-remaining", "#show-history"].forEach(selector => $(selector).addEventListener("change", () => { draftDirty = true; }));
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
    catch { $("#result-text").textContent = "抽選できませんでした。再読み込みしてください"; return; }
    const prize = state.prizes.find((p) => { if (ticket < p.remaining) return true; ticket -= p.remaining; return false; });
    busy = true;
    prize.remaining -= 1;
    state.draws += 1;
    state.history.unshift({prizeId: prize.id, name: prize.name, color: prize.color, number: state.draws, time: new Date().toISOString()});
    state.history = state.history.slice(0, 200);
    // Commit the result before animation, so reload never restores a drawn ball.
    saveState();
    render();
    $("#result-text").textContent = "抽選中…";
    $("#result-text").classList.remove("has-result");
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
    const nameLabel = document.createElement("label"); nameLabel.className = "prize-name-field"; nameLabel.append("賞名");
    const name = document.createElement("input"); name.type = "text"; name.className = "prize-title"; name.maxLength = 40; name.required = true; name.value = prize.name; name.placeholder = "例：1等・参加賞"; nameLabel.append(name);
    const fields = document.createElement("div"); fields.className = "field-group";
    const colorLabel = document.createElement("label"); colorLabel.append("玉色");
    const color = document.createElement("select"); color.className = "prize-color";
    COLORS.forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; color.append(option); }); color.value = prize.color; colorLabel.append(color);
    const countLabel = document.createElement("label"); countLabel.append("個数");
    const count = document.createElement("input"); count.type = "number"; count.className = "prize-quantity"; count.min = "0"; count.max = "9999"; count.step = "1"; count.inputMode = "numeric"; count.required = true; count.value = prize.count; countLabel.append(count);
    fields.append(colorLabel, countLabel); row.append(header, nameLabel, fields);
    row.addEventListener("input", () => { draftDirty = true; $("#settings-error").textContent = ""; updateEditor(); });
    row.addEventListener("change", () => { draftDirty = true; });
    $("#prize-editor").append(row); updateEditor();
  }
  function fillEditor() { $("#prize-editor").replaceChildren(); state.prizes.forEach(addRow); $("#show-remaining").checked = showRemaining; $("#show-history").checked = showHistory; draftDirty = false; }
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
    showRemaining = $("#show-remaining").checked;
    showHistory = $("#show-history").checked;
    if (changed) saveState();
    saveViewSettings(); closeSettings(); render();
  });
  // Avoid an older tab overwriting a newer draw or settings change.
  window.addEventListener("storage", (event) => {
    if (event.key === VIEW_SETTINGS_KEY) {
      ({showRemaining, showHistory} = loadViewSettings());
      if (!draftDirty) { $("#show-remaining").checked = showRemaining; $("#show-history").checked = showHistory; }
      render();
      if (!showRemaining && remainingDialog.open) remainingDialog.close();
      return;
    }
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    stale = true; render();
    $("#settings-form").querySelectorAll("button:not(#settings-cancel), input, select").forEach((element) => { element.disabled = true; });
    storageNotice("別のタブでデータが変更されました。再読み込みしてから続けてください。");
  });
  window.addEventListener("beforeunload", (event) => { if (draftDirty) { event.preventDefault(); event.returnValue = ""; } });
  fillEditor(); render();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", {updateViaCache: "none"}).catch(() => { console.warn("オフライン機能を準備できませんでした。"); });
  });
})();
