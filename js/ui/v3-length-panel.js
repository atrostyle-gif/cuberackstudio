// =========================================================
// V3 Beam / Pole 長さUI
// - East Rail「長さ設定」が通常操作の正本
// - 追加は currentLengthMm / isOrderModeOn を再利用
// - 変更は setSelectedConnectorLengthMm を再利用
// - 浮動ポップアップはレールがない場合のフォールバックのみ
// =========================================================
(function () {
  const ADD_ID = "length-add";
  const EDIT_ID = "length";
  const MIN_MM = 1;
  const MAX_MM = 100000;
  const prefs = {
    beam: { order: false, preset: 200, orderMm: "" },
    pole: { order: false, preset: 200, orderMm: "" },
  };
  const edit = {
    kind: "beam",
    currentMm: null,
    order: false,
    preset: 200,
    orderMm: "",
  };
  let addKind = "beam";
  let addMsg = "";
  let editMsg = "";
  let closingEdit = false;
  let suppressPopupCancel = false;
  let lastEditKey = "";
  let lastHostKey = "";
  const RAIL_ADD = "add";
  const RAIL_EDIT = "length";
  const ADD_W_MIN = 220;
  const ADD_W_MAX = 420;
  const ADD_W_DEF = 300;
  const NARROW_W = 260;
  const DRAG_PX = 6;
  let addW = ADD_W_DEF;
  let chipXY = null;
  let addResize = null;
  let chipDrag = null;
  let addWidthObs = null;

  function $(id) {
    return document.getElementById(id);
  }

  function ui() {
    return window.v3WorkspaceUi;
  }

  function openId() {
    const w = ui();
    return w && w.getOpenPopupId ? w.getOpenPopupId() : null;
  }

  function railOpenId() {
    return window.v3EastRail && typeof window.v3EastRail.getOpenId === "function"
      ? window.v3EastRail.getOpenId()
      : null;
  }

  function isRailAddOpen() {
    return railOpenId() === RAIL_ADD;
  }

  function isRailEditOpen() {
    return railOpenId() === RAIL_EDIT;
  }

  function isHostedAdd() {
    const root = $("v3-len-root-add");
    return !!(root && root.closest && root.closest("#v3-east-rail"));
  }

  function isHostedEdit() {
    const root = $("v3-len-root-edit");
    return !!(root && root.closest && root.closest("#v3-east-rail"));
  }

  function panelMode() {
    if (addToolKind()) return "add";
    if (window.isLengthEditModeOn) return "edit";
    return "idle";
  }

  function isAddOpen() {
    if (isRailAddOpen() || isHostedAdd()) return true;
    return openId() === ADD_ID;
  }

  function isEditOpen() {
    if (isRailEditOpen() || isHostedEdit()) return true;
    return openId() === EDIT_ID;
  }

  function hideFloatingLengthUi() {
    const w = ui();
    if (!w || typeof w.getOpenPopupId !== "function") return;
    const id = w.getOpenPopupId();
    if (id !== ADD_ID && id !== EDIT_ID) return;
    suppressPopupCancel = true;
    try { w.closePopup("cancel"); } catch (e) {}
    suppressPopupCancel = false;
  }

  function listFor(k) {
    return k === "pole"
      ? (window.POLE_LENGTH_OPTIONS || [50, 100, 200, 300, 400, 500, 600, 800])
      : (window.BEAM_LENGTH_OPTIONS || [25, 50, 100, 150, 200, 300, 400, 500, 600, 800]);
  }

  function parseMm(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return { ok: false, reason: "empty" };
    const n = (typeof window.parseLengthMm === "function")
      ? window.parseLengthMm(s)
      : Number(s);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "not-number" };
    if (n < MIN_MM || n > MAX_MM) return { ok: false, reason: "range" };
    return { ok: true, mm: n };
  }

  function invalidReason(parsed) {
    if (parsed.ok) return "";
    if (parsed.reason === "empty") return "オーダー長さを入力してください。";
    if (parsed.reason === "not-number") return "オーダー長さは数値の mm で入力してください。";
    return "オーダー長さは " + MIN_MM + "〜" + MAX_MM + " mm にしてください。";
  }

  function fmtMm(n) {
    if (!Number.isFinite(n)) return "—";
    if (typeof window.formatDesignMm === "function") return window.formatDesignMm(n);
    return String(n);
  }

  function currentKind() {
    return window.currentPartType === "pole" ? "pole" : "beam";
  }

  function addToolKind() {
    const mode = window.v3GetActiveToolMode ? window.v3GetActiveToolMode() : window.__V3_TOOL_MODE__;
    if (mode === "pole") return "pole";
    if (mode === "beam") return "beam";
    return null;
  }

  function prefMm(k) {
    const pref = prefs[k] || prefs.beam;
    if (pref.order) {
      const parsed = parseMm(pref.orderMm);
      if (parsed.ok) return parsed.mm;
    }
    return pref.preset;
  }

  function displayAddMm(k) {
    if (k === currentKind()) {
      if (window.isOrderModeOn) {
        const order = Number(window.currentOrderLengthMm);
        if (Number.isFinite(order) && order > 0) return order;
      }
      const cur = Number(window.currentLengthMm);
      if (Number.isFinite(cur) && cur > 0) return cur;
    }
    return prefMm(k);
  }

  function selected() {
    return window.selectedConnector || null;
  }

  function selectedLen() {
    if (typeof window.getSelectedConnectorLengthMm === "function") {
      const n = window.getSelectedConnectorLengthMm();
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  function canEditSelected() {
    const sc = selected();
    if (!sc) return false;
    const list = sc.type === "pole" ? window.poles : window.beams;
    const item = list && list[sc.index];
    if (!item) return false;
    const wl = window.v3WorkLayers;
    if (wl && typeof wl.canEditJoint === "function") {
      if (!wl.canEditJoint(item.a) || !wl.canEditJoint(item.b)) return false;
    }
    return true;
  }

  function pushToLegacy(k) {
    const pref = prefs[k];
    const list = listFor(k);
    const preset = list.indexOf(pref.preset) >= 0 ? pref.preset : list[0];
    pref.preset = preset;
    if (pref.order) {
      const parsed = parseMm(pref.orderMm);
      window.isOrderModeOn = parsed.ok;
      window.currentOrderLengthMm = parsed.ok ? parsed.mm : null;
      window.currentLengthMm = parsed.ok ? parsed.mm : preset;
    } else {
      window.isOrderModeOn = false;
      window.currentOrderLengthMm = null;
      window.currentLengthMm = preset;
    }
    const sel = $("length-select");
    if (sel) {
      if (!sel.options || !sel.options.length) {
        if (typeof window.updateLengthOptions === "function") window.updateLengthOptions();
      }
      if (sel.querySelector('option[value="' + preset + '"]')) sel.value = String(preset);
    }
    const inp = $("order-length-input");
    if (inp) {
      inp.disabled = !pref.order;
      inp.value = pref.order && pref.orderMm ? String(pref.orderMm) : "";
    }
    const btn = $("order-mode-btn");
    if (btn) {
      btn.classList.toggle("is-on", !!pref.order && !!window.isOrderModeOn);
      btn.classList.toggle("is-off", !(pref.order && window.isOrderModeOn));
    }
  }

  function restoreForCurrentType() {
    pushToLegacy(currentKind());
  }

  function commitAdd(k) {
    const pref = prefs[k];
    if (pref.order) {
      const live = $("v3-len-add-order");
      if (live) pref.orderMm = live.value;
      const parsed = parseMm(pref.orderMm);
      if (!parsed.ok) return parsed;
      pref.orderMm = String(parsed.mm);
    }
    if (k === currentKind() || addToolKind() === k) pushToLegacy(k);
    return { ok: true, mm: prefMm(k) };
  }

  function seedEditFromSelection(force) {
    const sc = selected();
    const key = sc && (sc.type === "beam" || sc.type === "pole") ? sc.type + ":" + sc.index : "";
    if (!force && key && key === lastEditKey) {
      edit.currentMm = selectedLen();
      return;
    }
    lastEditKey = key;
    if (!sc || (sc.type !== "beam" && sc.type !== "pole")) {
      edit.kind = "beam";
      edit.currentMm = null;
      return;
    }
    edit.kind = sc.type;
    const len = selectedLen();
    edit.currentMm = len;
    const list = listFor(edit.kind);
    const isPreset = (typeof window.isPresetLengthMm === "function")
      ? window.isPresetLengthMm(len, list)
      : (len && list.indexOf(len) >= 0);
    if (len && isPreset) {
      edit.order = false;
      edit.preset = list.find(function (p) { return Math.abs(Number(p) - len) <= 1e-6; }) || len;
    } else if (len) {
      edit.order = true;
      edit.orderMm = fmtMm(len);
    }
  }

  function editAfterMm() {
    if (edit.order) {
      const live = $("v3-len-edit-order");
      const raw = live ? live.value : edit.orderMm;
      const parsed = parseMm(raw);
      return parsed.ok ? parsed.mm : null;
    }
    return edit.preset;
  }

  function applyToSelected(mm) {
    const sc = selected();
    if (!sc) return { ok: false, reason: "none" };
    if (!canEditSelected()) return { ok: false, reason: "protected" };
    if (typeof window.setSelectedConnectorLengthMm !== "function") return { ok: false, reason: "missing" };
    if (window.v3BsStock && typeof window.v3BsStock.gateNewPart === "function") {
      const list = sc.type === "pole" ? window.poles : window.beams;
      const data = list && list[sc.index];
      const mat = typeof window.normalizeMaterial === "function"
        ? window.normalizeMaterial(data && data.material)
        : (data && data.material);
      if (data && mat === "BS") {
        const key = String(sc.type === "pole" ? "pole_" : "beam_") + Math.round(Number(mm) || 0);
        const gate = window.v3BsStock.gateNewPart(key, "BS", 1, (sc.type === "pole" ? "Pole_" : "Beam_") + mm);
        if (!gate || gate.ok === false) return { ok: false, reason: "bs-stock" };
      }
    }
    const ok = window.setSelectedConnectorLengthMm(mm);
    if (!ok) return { ok: false, reason: "unsafe" };
    // 変更後の状態を積む。変更前保存だと現行スナップショットと同一判定でスキップされ Undo が1本分戻る。
    if (typeof window.saveHistory === "function") window.saveHistory("edit length");
    try { window.normalizeCustomFlagsByActualLength?.(); } catch (e) {}
    try { window.rebuildBoards?.(); } catch (e) {}
    try { window.requestEstimateRender?.("after length edit"); } catch (e) {}
    try { window.updateSelectedConnectorUI?.(); } catch (e) {}
    return { ok: true };
  }

  function applyEdit() {
    const mm = editAfterMm();
    if (edit.order) {
      const live = $("v3-len-edit-order");
      if (live) edit.orderMm = live.value;
      const parsed = parseMm(edit.orderMm);
      if (!parsed.ok) {
        editMsg = invalidReason(parsed);
        fillEdit($("v3-len-edit-root"));
        return false;
      }
    }
    if (mm == null) {
      editMsg = "変更後の長さを指定してください。";
      fillEdit($("v3-len-edit-root"));
      return false;
    }
    const sc = selected();
    if (!sc || (sc.type !== "beam" && sc.type !== "pole")) {
      editMsg = "Beam または Pole を選択してください。";
      fillEdit($("v3-len-edit-root"));
      return false;
    }
    const result = applyToSelected(mm);
    if (!result.ok) {
      if (result.reason === "protected") editMsg = "ロック中または非表示のラックは長さを変更できません。";
      else if (result.reason === "unsafe") editMsg = "この部材は安全に長さ変更できないため、変更しませんでした。";
      else if (result.reason === "none") editMsg = "Beam または Pole を選択してください。";
      else editMsg = "長さを変更できませんでした。";
      fillEdit($("v3-len-edit-root"));
      return false;
    }
    editMsg = "";
    seedEditFromSelection(true);
    fillEdit($("v3-len-edit-root"));
    return true;
  }

  let switchingAddKind = false;

  function selectAddKind(kind) {
    kind = kind === "pole" ? "pole" : "beam";
    if (switchingAddKind) return;
    if (addKind === kind && addToolKind() === kind) return;
    switchingAddKind = true;
    try {
      addKind = kind;
      const cad = window.v3CadToolbar;
      if (cad && typeof cad.runCommand === "function") {
        cad.runCommand(kind);
        return;
      }
      window.currentPartType = kind;
      if (typeof window.v3SetToolMode === "function") window.v3SetToolMode(kind);
      else window.__V3_TOOL_MODE__ = kind;
      restoreForCurrentType();
      if (isRailAddOpen() || isHostedAdd()) renderAddHost();
      else fillAdd($("v3-len-add-root"));
      syncChip();
      if (cad && typeof cad.syncActive === "function") cad.syncActive();
    } finally {
      switchingAddKind = false;
    }
  }

  function kindRow(activeKind, onBeam, onPole) {
    const row = document.createElement("div");
    row.className = "v3-len-modes v3-len-kinds";
    row.setAttribute("role", "tablist");
    row.setAttribute("aria-label", "追加する部材");
    const beam = document.createElement("button");
    beam.type = "button";
    beam.className = "v3-len-mode" + (activeKind !== "pole" ? " is-on" : "");
    beam.textContent = "BEAM";
    beam.setAttribute("aria-pressed", activeKind !== "pole" ? "true" : "false");
    beam.addEventListener("click", function (ev) {
      ev.preventDefault();
      onBeam();
    });
    const pole = document.createElement("button");
    pole.type = "button";
    pole.className = "v3-len-mode" + (activeKind === "pole" ? " is-on" : "");
    pole.textContent = "POLE";
    pole.setAttribute("aria-pressed", activeKind === "pole" ? "true" : "false");
    pole.addEventListener("click", function (ev) {
      ev.preventDefault();
      onPole();
    });
    row.appendChild(beam);
    row.appendChild(pole);
    return row;
  }

  function modeRow(activeOrder, onStd, onOrder) {
    const row = document.createElement("div");
    row.className = "v3-len-modes";
    const std = document.createElement("button");
    std.type = "button";
    std.className = "v3-len-mode" + (!activeOrder ? " is-on" : "");
    std.textContent = "規格長さ";
    std.addEventListener("click", function (ev) {
      ev.preventDefault();
      onStd();
    });
    const ord = document.createElement("button");
    ord.type = "button";
    ord.className = "v3-len-mode" + (activeOrder ? " is-on" : "");
    ord.textContent = "オーダー長さ";
    ord.addEventListener("click", function (ev) {
      ev.preventDefault();
      onOrder();
    });
    row.appendChild(std);
    row.appendChild(ord);
    return row;
  }

  function presetGrid(kind, selectedMm, onPick) {
    const grid = document.createElement("div");
    grid.className = "v3-len-grid";
    listFor(kind).forEach(function (mm) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v3-len-btn" + (selectedMm === mm ? " is-on" : "");
      btn.textContent = mm + " mm";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        onPick(mm);
      });
      grid.appendChild(btn);
    });
    return grid;
  }

  function orderInput(id, value, onInput, onEnter, onBlur) {
    const inp = document.createElement("input");
    inp.id = id;
    inp.type = "number";
    inp.min = String(MIN_MM);
    inp.max = String(MAX_MM);
    inp.step = "0.1";
    inp.inputMode = "decimal";
    inp.placeholder = "mm";
    inp.value = value || "";
    inp.addEventListener("input", function () {
      onInput(inp.value);
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onEnter();
      }
    });
    if (typeof onBlur === "function") {
      inp.addEventListener("blur", function (ev) {
        onBlur(ev);
      });
    }
    return inp;
  }

  function twoBtnRow(label, aText, bText, aOn, onA, onB) {
    const wrap = document.createElement("div");
    wrap.className = "v3-len-board-field";
    const lab = document.createElement("div");
    lab.className = "v3-len-board-label";
    lab.textContent = label;
    wrap.appendChild(lab);
    const row = document.createElement("div");
    row.className = "v3-len-board-seg";
    row.setAttribute("role", "tablist");
    row.setAttribute("aria-label", label);
    const a = document.createElement("button");
    a.type = "button";
    a.className = "v3-len-mode" + (aOn ? " is-on" : "");
    a.textContent = aText;
    a.setAttribute("aria-pressed", aOn ? "true" : "false");
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      onA();
    });
    const b = document.createElement("button");
    b.type = "button";
    b.className = "v3-len-mode" + (!aOn ? " is-on" : "");
    b.textContent = bText;
    b.setAttribute("aria-pressed", !aOn ? "true" : "false");
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      onB();
    });
    row.appendChild(a);
    row.appendChild(b);
    wrap.appendChild(row);
    return wrap;
  }

  function fillBoardAdd(root) {
    if (!root) return;
    if (root.classList) root.classList.add("is-board");
    root.innerHTML = "";
    const isWall = !!(window.isBoardKindWall && window.isBoardKindWall());
    const place = window.getBoardPlaceMode ? window.getBoardPlaceMode() : "auto";
    root.appendChild(twoBtnRow("パーツの種類", "棚板", "壁板", !isWall, function () {
      if (typeof window.setBoardKindWall === "function") window.setBoardKindWall(false);
      fillBoardAdd($("v3-len-add-root") || root);
      if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") window.v3CadToolbar.syncActive();
    }, function () {
      if (typeof window.setBoardKindWall === "function") window.setBoardKindWall(true);
      fillBoardAdd($("v3-len-add-root") || root);
      if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") window.v3CadToolbar.syncActive();
    }));
    root.appendChild(twoBtnRow("配置方法", "自動配置", "4点選択", place !== "pick4", function () {
      if (typeof window.setBoardPlaceMode === "function") window.setBoardPlaceMode("auto");
      fillBoardAdd($("v3-len-add-root") || root);
    }, function () {
      if (typeof window.setBoardPlaceMode === "function") window.setBoardPlaceMode("pick4");
      fillBoardAdd($("v3-len-add-root") || root);
    }));
    const note = document.createElement("p");
    note.className = "v3-len-board-note";
    note.textContent = place === "pick4"
      ? "ジョイントを4つ選んで配置します。"
      : "完成した区画にマウスを合わせ、プレビューをクリックして配置します。";
    root.appendChild(note);
  }

  function fillAdd(root) {
    if (!root) return;
    if (window.isBoardModeOn) {
      fillBoardAdd(root);
      return;
    }
    root.innerHTML = "";
    const pref = prefs[addKind];
    root.appendChild(kindRow(addKind, function () {
      selectAddKind("beam");
    }, function () {
      selectAddKind("pole");
    }));
    const current = document.createElement("p");
    current.className = "v3-len-current";
    const shown = displayAddMm(addKind);
    current.textContent = fmtMm(shown) + " mm";
    root.appendChild(current);

    root.appendChild(modeRow(!!pref.order, function () {
      pref.order = false;
      addMsg = "";
      commitAdd(addKind);
      fillAdd($("v3-len-add-root"));
      syncChip();
    }, function () {
      pref.order = true;
      addMsg = "";
      fillAdd($("v3-len-add-root"));
      const inp = $("v3-len-add-order");
      if (inp) inp.focus();
    }));

    if (!pref.order) {
      root.appendChild(presetGrid(addKind, pref.preset, function (mm) {
        pref.order = false;
        pref.preset = mm;
        addMsg = "";
        commitAdd(addKind);
        fillAdd($("v3-len-add-root"));
        syncChip();
      }));
    } else {
      const wrap = document.createElement("div");
      wrap.className = "v3-len-order-only";
      const inp = orderInput("v3-len-add-order", pref.orderMm, function (v) {
        pref.orderMm = v;
        addMsg = "";
        inp.classList.remove("is-err");
        const msg = root.querySelector(".v3-len-msg");
        if (msg) msg.remove();
      }, function () {
        confirmAdd();
      }, function (ev) {
        const next = ev && ev.relatedTarget;
        if (next && next.closest && next.closest("#v3-cmd-pop, #v3-len-root-add, #v3-east-rail")) return;
        confirmAdd();
      });
      if (addMsg) inp.classList.add("is-err");
      wrap.appendChild(inp);
      root.appendChild(wrap);
    }

    if (addMsg) {
      const p = document.createElement("p");
      p.className = "v3-len-msg is-err";
      p.textContent = addMsg;
      root.appendChild(p);
    }
  }

  let addConfirming = false;
  function confirmAdd() {
    if (addConfirming) return false;
    addConfirming = true;
    try {
      const result = commitAdd(addKind);
      if (!result.ok) {
        addMsg = invalidReason(result);
        fillAdd($("v3-len-add-root"));
        return false;
      }
      addMsg = "";
      fillAdd($("v3-len-add-root"));
      syncChip();
      return true;
    } finally {
      addConfirming = false;
    }
  }

  function fillEdit(root) {
    if (!root) return;
    root.innerHTML = "";
    const sc = selected();
    const kindEl = document.createElement("p");
    kindEl.className = "v3-len-kind";
    if (sc && (sc.type === "beam" || sc.type === "pole")) {
      kindEl.textContent = sc.type === "pole" ? "Pole" : "Beam";
    } else {
      kindEl.textContent = "部材未選択";
    }
    root.appendChild(kindEl);

    const after = editAfterMm();
    const io = document.createElement("div");
    io.className = "v3-len-io";
    io.innerHTML =
      '<div class="v3-len-io-col"><span class="v3-len-k">現在</span><strong>' +
      (edit.currentMm != null ? fmtMm(edit.currentMm) + " mm" : "—") +
      '</strong></div><span class="v3-len-arrow">→</span><div class="v3-len-io-col"><span class="v3-len-k">変更後</span><strong>' +
      (after != null ? fmtMm(after) + " mm" : "—") +
      "</strong></div>";
    root.appendChild(io);

    if (sc && !canEditSelected()) {
      const lock = document.createElement("p");
      lock.className = "v3-len-msg is-err";
      lock.textContent = "ロック中または非表示のラックは長さを変更できません。";
      root.appendChild(lock);
    }

    root.appendChild(modeRow(!!edit.order, function () {
      edit.order = false;
      editMsg = "";
      fillEdit($("v3-len-edit-root"));
    }, function () {
      edit.order = true;
      editMsg = "";
      fillEdit($("v3-len-edit-root"));
      const inp = $("v3-len-edit-order");
      if (inp) inp.focus();
    }));

    if (!edit.order) {
      root.appendChild(presetGrid(edit.kind, edit.preset, function (mm) {
        edit.order = false;
        edit.preset = mm;
        editMsg = "";
        fillEdit($("v3-len-edit-root"));
      }));
    } else {
      const wrap = document.createElement("div");
      wrap.className = "v3-len-order-only";
      wrap.appendChild(orderInput("v3-len-edit-order", edit.orderMm, function (v) {
        edit.orderMm = v;
        const afterEl = root.querySelector(".v3-len-io-col:last-child strong");
        const parsed = parseMm(v);
        if (afterEl) afterEl.textContent = parsed.ok ? fmtMm(parsed.mm) + " mm" : "—";
      }, function () {
        applyEdit();
      }));
      root.appendChild(wrap);
    }

    if (editMsg) {
      const p = document.createElement("p");
      p.className = "v3-len-msg is-err";
      p.textContent = editMsg;
      root.appendChild(p);
    }

    if (isHostedEdit() || isRailEditOpen() || (root.closest && root.closest("#v3-east-pane-length"))) {
      appendEditActions(root);
    }
  }

  function appendEditActions(root) {
    if (!root || root.querySelector(".v3-len-actions")) return;
    const row = document.createElement("div");
    row.className = "v3-len-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "v3-len-cancel";
    cancel.textContent = "キャンセル";
    cancel.title = "未適用の長さ指定を取り消す（CADは変更しません）";
    cancel.addEventListener("click", function (ev) {
      ev.preventDefault();
      cancelEdit();
    });
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "v3-len-apply";
    apply.textContent = "適用";
    apply.title = "選択部材の長さを変更する";
    apply.addEventListener("click", function (ev) {
      ev.preventDefault();
      applyEdit();
    });
    row.appendChild(cancel);
    row.appendChild(apply);
    root.appendChild(row);
  }

  function cancelEdit() {
    editMsg = "";
    const live = $("v3-len-edit-order");
    if (live && edit.order) edit.orderMm = live.value;
    seedEditFromSelection(true);
    const root = $("v3-len-edit-root");
    if (root) fillEdit(root);
    return true;
  }

  function renderAdd(body) {
    const root = document.createElement("div");
    root.id = "v3-len-add-root";
    root.className = "v3-len-add-root";
    body.appendChild(root);
    fillAdd(root);
  }

  function renderEdit(body) {
    const root = document.createElement("div");
    root.id = "v3-len-edit-root";
    root.className = "v3-len-edit-root";
    body.appendChild(root);
    seedEditFromSelection(true);
    fillEdit(root);
  }

  function setPopupTitle(text) {
    const el = $("v3-cmd-pop-title");
    if (el) el.textContent = text;
  }

  function ensureRoot(pane, rootId) {
    if (!pane) return null;
    let root = $(rootId);
    if (root && root.parentElement !== pane) {
      pane.appendChild(root);
      return root;
    }
    if (root) return root;
    root = document.createElement("div");
    root.id = rootId;
    root.className = "v3-len-root";
    pane.appendChild(root);
    return root;
  }

  function addHostKey() {
    if (window.isBoardModeOn) {
      const kind = window.isBoardKindWall && window.isBoardKindWall() ? "panel" : "shelf";
      const place = window.getBoardPlaceMode ? window.getBoardPlaceMode() : "auto";
      return "add:board:" + kind + ":" + place;
    }
    return "add:" + (addToolKind() || addKind || currentKind());
  }

  function editHostKey() {
    const sc = selected();
    return "edit:" + ((sc && sc.type) || "") + ":" + (sc ? sc.index : "") + ":" + (window.isLengthEditModeOn ? "on" : "off");
  }

  function renderAddHost(host) {
    const pane = host || $("v3-east-pane-add");
    const root = ensureRoot(pane, "v3-len-root-add");
    if (!root) return;
    lastHostKey = addHostKey();
    addKind = addToolKind() || addKind;
    root.innerHTML = "";
    const isBoard = !!window.isBoardModeOn;
    if (root.classList) {
      root.classList.toggle("is-board", isBoard);
    }
    const badge = document.createElement("div");
    badge.className = isBoard ? "v3-len-board-title" : "v3-len-badge";
    badge.textContent = isBoard ? "板を追加" : "新規追加";
    root.appendChild(badge);
    const body = document.createElement("div");
    body.id = "v3-len-add-root";
    body.className = isBoard ? "v3-len-add-root is-board" : "v3-len-add-root";
    root.appendChild(body);
    if (!window.isBoardModeOn) restoreForCurrentType();
    fillAdd(body);
  }

  function renderEditHost(host) {
    const pane = host || $("v3-east-pane-length");
    const root = ensureRoot(pane, "v3-len-root-edit");
    if (!root) return;
    lastHostKey = editHostKey();
    root.innerHTML = "";
    const badge = document.createElement("div");
    badge.className = "v3-len-badge";
    badge.textContent = "長さ変更";
    root.appendChild(badge);
    const body = document.createElement("div");
    body.id = "v3-len-edit-root";
    body.className = "v3-len-edit-root";
    root.appendChild(body);
    seedEditFromSelection(false);
    fillEdit(body);
  }

  function syncAddHostIfNeeded() {
    if (!(isRailAddOpen() || isHostedAdd())) return;
    const key = addHostKey();
    if (key === lastHostKey && $("v3-len-add-root")) return;
    renderAddHost();
  }

  function syncEditHostIfNeeded(force) {
    if (!(isRailEditOpen() || isHostedEdit())) return;
    const key = editHostKey();
    if (!force && key === lastHostKey && $("v3-len-edit-root")) return;
    if (force) {
      seedEditFromSelection(true);
      const body = $("v3-len-edit-root");
      if (body) {
        lastHostKey = key;
        fillEdit(body);
        return;
      }
    }
    renderEditHost();
  }

  function mountAdd(host) {
    hideFloatingLengthUi();
    renderAddHost(host);
    syncChip();
  }

  function mountEdit(host) {
    hideFloatingLengthUi();
    renderEditHost(host);
    syncChip();
  }

  function mount(host) {
    if (host && host.id === "v3-east-pane-add") mountAdd(host);
    else mountEdit(host);
  }

  function openOnRail(tab) {
    if (!window.v3EastRail || typeof window.v3EastRail.open !== "function") return false;
    if (railOpenId() === tab) {
      if (tab === RAIL_ADD) renderAddHost();
      else renderEditHost();
      return true;
    }
    window.v3EastRail.open(tab);
    return true;
  }

  function openAdd(opts) {
    opts = opts || {};
    if (opts.board || window.isBoardModeOn) {
      addMsg = "";
      hideFloatingLengthUi();
      if (openOnRail(RAIL_ADD)) {
        syncChip();
        return;
      }
    }
    addKind = opts.kind === "pole" ? "pole" : "beam";
    addMsg = "";
    restoreForCurrentType();
    hideFloatingLengthUi();
    if (openOnRail(RAIL_ADD)) {
      syncChip();
      return;
    }
    const w = ui();
    if (!w || typeof w.openPopup !== "function") return;
    if (isAddOpen()) {
      setPopupTitle(addKind === "pole" ? "Pole追加" : "Beam追加");
      fillAdd($("v3-len-add-root"));
      applyAddShell();
      syncChip();
      return;
    }
    w.openPopup(ADD_ID, {
      title: addKind === "pole" ? "Pole追加" : "Beam追加",
      compact: true,
      hideActions: true,
      skipFocus: true,
      render: renderAdd,
      onCancel: function () {
        syncChip();
      },
    });
    applyAddShell();
    syncChip();
  }

  function openEdit(opts) {
    opts = opts || {};
    editMsg = "";
    seedEditFromSelection(false);
    hideFloatingLengthUi();
    if (openOnRail(RAIL_EDIT)) return;
    const w = ui();
    if (!w || typeof w.openPopup !== "function") return;
    if (openId() === EDIT_ID) {
      fillEdit($("v3-len-edit-root"));
      return;
    }
    w.openPopup(EDIT_ID, {
      title: "長さ変更",
      compact: true,
      skipFocus: true,
      applyLabel: "長さを適用",
      cancelLabel: "キャンセル",
      anchor: (opts && opts.anchor) || $("v3-cad-length"),
      render: renderEdit,
      onApply: function () {
        applyEdit();
        return false;
      },
      onCancel: function () {
        if (closingEdit || suppressPopupCancel) return;
        closingEdit = true;
        try {
          if (window.isLengthEditModeOn) window.setLengthEditMode(false);
        } finally {
          closingEdit = false;
        }
      },
    });
  }

  function refreshEdit(force) {
    if (isRailEditOpen() || isHostedEdit()) {
      syncEditHostIfNeeded(!!force);
      return;
    }
    if (openId() !== EDIT_ID) return;
    seedEditFromSelection(!!force);
    fillEdit($("v3-len-edit-root"));
  }

  function syncFromTool() {
    if (isRailAddOpen() || isHostedAdd()) syncAddHostIfNeeded();
    else if (isRailEditOpen() || isHostedEdit()) syncEditHostIfNeeded();
    else closeAddIfInactive();
    syncChip();
  }

  function setUiDragging(on) {
    document.body.classList.toggle("v3-ui-dragging", !!on);
    window.__v3UiDragging = !!on;
  }

  function maxAddWidth() {
    return Math.max(ADD_W_MIN, Math.min(ADD_W_MAX, window.innerWidth - 24));
  }

  function shownAddWidth() {
    return Math.min(maxAddWidth(), Math.max(ADD_W_MIN, addW));
  }

  function applyAddWidth(opts) {
    if (isRailAddOpen() || isHostedAdd()) return;
    const el = $("v3-cmd-pop");
    if (!el || openId() !== ADD_ID) return;
    const w = shownAddWidth();
    el.style.width = w + "px";
    el.classList.toggle("is-narrow", w < NARROW_W);
    if (opts && opts.clamp === false) return;
    if (ui() && typeof ui().clampPopup === "function") ui().clampPopup();
  }

  function observeAddWidth() {
    const el = $("v3-cmd-pop");
    if (!el) return;
    if (typeof ResizeObserver !== "function") {
      el.classList.toggle("is-narrow", el.offsetWidth < NARROW_W);
      return;
    }
    if (!addWidthObs) {
      addWidthObs = new ResizeObserver(function () {
        const pop = $("v3-cmd-pop");
        if (!pop || openId() !== ADD_ID) return;
        pop.classList.toggle("is-narrow", pop.getBoundingClientRect().width < NARROW_W);
      });
    }
    addWidthObs.disconnect();
    addWidthObs.observe(el);
  }

  function samePtr(ev, id) {
    return ev.pointerId == null || id == null || ev.pointerId === id;
  }

  function moveAddResize(ev) {
    if (!addResize || !samePtr(ev, addResize.pointerId)) return;
    const el = $("v3-cmd-pop");
    if (!el) return;
    const dx = ev.clientX - addResize.startX;
    const next = addResize.edge === "left"
      ? Math.round(addResize.startW - dx)
      : Math.round(addResize.startW + dx);
    let maxW = maxAddWidth();
    if (addResize.edge === "left") {
      maxW = Math.min(maxW, Math.max(ADD_W_MIN, addResize.startRight - 8));
    }
    addW = Math.min(maxW, Math.max(ADD_W_MIN, next));
    if (addResize.edge === "left") {
      el.style.left = Math.round(addResize.startRight - addW) + "px";
    } else {
      el.style.left = addResize.startLeft + "px";
    }
    el.style.top = addResize.startTop + "px";
    applyAddWidth({ clamp: false });
  }

  function endAddResize(ev, cancelled) {
    if (!addResize || (ev && !samePtr(ev, addResize.pointerId))) return;
    const handle = addResize.handle;
    addResize = null;
    if (handle && ev) {
      try { handle.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    setUiDragging(false);
    document.body.classList.remove("v3-ui-resizing");
    if (!cancelled) applyAddWidth();
  }

  function bindAddResize() {
    const el = $("v3-cmd-pop");
    if (!el) return;
    el.querySelectorAll(".v3-len-resize").forEach(function (handle) {
      if (handle.__v3LenBound) return;
      handle.__v3LenBound = true;
      handle.addEventListener("pointerdown", function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (!isAddOpen()) return;
        const pop = $("v3-cmd-pop");
        if (!pop) return;
        ev.preventDefault();
        ev.stopPropagation();
        const r = pop.getBoundingClientRect();
        addResize = {
          pointerId: ev.pointerId,
          handle: handle,
          edge: handle.getAttribute("data-edge") === "left" ? "left" : "right",
          startX: ev.clientX,
          startW: r.width,
          startLeft: r.left,
          startTop: r.top,
          startRight: r.right,
        };
        try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
        setUiDragging(true);
        document.body.classList.add("v3-ui-resizing");
      });
    });
  }

  function applyAddShell() {
    if (isRailAddOpen() || isHostedAdd() || isRailEditOpen() || isHostedEdit()) return;
    const pop = $("v3-cmd-pop");
    if (pop) {
      pop.querySelectorAll(".v3-len-resize").forEach(function (rz) {
        rz.hidden = openId() !== ADD_ID;
      });
    }
    applyAddWidth();
    bindAddResize();
    observeAddWidth();
  }

  function northBottom() {
    const north = $("v3-north");
    let top = north ? north.getBoundingClientRect().bottom + 12 : 56;
    const dockN = $("v3-dock-north");
    if (dockN && !dockN.classList.contains("v3-dock-empty")) {
      top = Math.max(top, dockN.getBoundingClientRect().bottom + 12);
    }
    const tb = $("v3-tb-tools") || $("tools");
    if (tb && tb.classList.contains("is-horizontal") && !tb.classList.contains("is-floating")) {
      top = Math.max(top, tb.getBoundingClientRect().bottom + 12);
    }
    return top;
  }

  function eastUiLeft() {
    const rail = $("v3-east-rail");
    const pane = $("v3-east-pane");
    if (pane && !pane.hidden) {
      const pr = pane.getBoundingClientRect();
      if (pr.width > 0 && pr.left > 0) return pr.left;
    }
    if (rail) {
      const rr = rail.getBoundingClientRect();
      if (rr.left > 0) return rr.left;
    }
    return window.innerWidth;
  }

  function canvasRight() {
    let right = window.innerWidth - 16;
    right = Math.min(right, eastUiLeft() - 8);
    const east = $("v3-dock-east");
    if (east && !east.classList.contains("v3-dock-empty")) {
      right = Math.min(right, east.getBoundingClientRect().left - 12);
    }
    const tb = $("v3-tb-tools") || $("tools");
    if (tb && !tb.classList.contains("is-floating")) {
      const r = tb.getBoundingClientRect();
      if (r.left > window.innerWidth * 0.55) right = Math.min(right, r.left - 12);
    }
    return right;
  }

  function clampChipBox(x, y, w, h) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: Math.round(Math.min(Math.max(8, x), Math.max(8, vw - w - 8))),
      y: Math.round(Math.min(Math.max(8, y), Math.max(8, vh - h - 8))),
    };
  }

  function defaultChipPos(chip) {
    const w = chip.offsetWidth || 128;
    const h = chip.offsetHeight || 28;
    return clampChipBox(canvasRight() - w, northBottom(), w, h);
  }

  function openChipPanel() {
    const k = addToolKind() || currentKind();
    openAdd({ kind: k });
  }

  function moveChipDrag(ev) {
    if (!chipDrag || !samePtr(ev, chipDrag.pointerId)) return;
    const chip = $("v3-len-chip");
    if (!chip) return;
    const dx = ev.clientX - chipDrag.startX;
    const dy = ev.clientY - chipDrag.startY;
    if (!chipDrag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!chipDrag.moved) {
      chipDrag.moved = true;
      chip.classList.add("is-dragging");
      setUiDragging(true);
    }
    const pos = clampChipBox(
      chipDrag.origX + dx,
      chipDrag.origY + dy,
      chip.offsetWidth || 128,
      chip.offsetHeight || 28
    );
    chipXY = pos;
    chip.style.left = pos.x + "px";
    chip.style.top = pos.y + "px";
  }

  function endChipDrag(ev, cancelled) {
    if (!chipDrag || (ev && !samePtr(ev, chipDrag.pointerId))) return;
    const chip = $("v3-len-chip");
    const moved = chipDrag.moved;
    chipDrag = null;
    if (chip) {
      chip.classList.remove("is-dragging");
      if (ev) {
        try { chip.releasePointerCapture(ev.pointerId); } catch (e) {}
      }
    }
    setUiDragging(false);
    if (!cancelled && !moved) openChipPanel();
  }

  function bindChipDrag(chip) {
    if (!chip || chip.__v3LenBound) return;
    chip.__v3LenBound = true;
    chip.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const r = chip.getBoundingClientRect();
      chipDrag = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        origX: r.left,
        origY: r.top,
        moved: false,
      };
      try { chip.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    chip.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    });
  }

  function ensureChip() {
    let chip = $("v3-len-chip");
    if (chip) {
      bindChipDrag(chip);
      return chip;
    }
    chip = document.createElement("button");
    chip.type = "button";
    chip.id = "v3-len-chip";
    chip.className = "v3-len-chip";
    chip.hidden = true;
    const layer = $("v3-float-layer") || document.body;
    layer.appendChild(chip);
    bindChipDrag(chip);
    return chip;
  }

  function placeChip(chip) {
    if (!chip || chip.hidden) return;
    const w = chip.offsetWidth || 128;
    const h = chip.offsetHeight || 28;
    const pos = chipXY
      ? clampChipBox(chipXY.x, chipXY.y, w, h)
      : defaultChipPos(chip);
    if (chipXY) chipXY = pos;
    chip.style.left = pos.x + "px";
    chip.style.top = pos.y + "px";
  }

  function syncChip() {
    const chip = ensureChip();
    const k = addToolKind();
    const show = !!k;
    chip.hidden = !show;
    if (show) {
      const label = k === "pole" ? "Pole" : "Beam";
      chip.textContent = label + " " + displayAddMm(k) + " mm";
      chip.setAttribute("aria-label", label + " " + displayAddMm(k) + " mm（右側の長さ設定を開く）");
      chip.title = "追加長さの状態表示。クリックで長さ設定を開きます";
      placeChip(chip);
    }
  }

  function closeAddIfInactive() {
    if (isRailAddOpen() || isHostedAdd()) {
      syncAddHostIfNeeded();
      return;
    }
    const k = addToolKind();
    if (!k && openId() === ADD_ID) {
      const w = ui();
      if (w) w.closePopup("cancel");
    }
  }

  function wrap(name, after) {
    const orig = window[name];
    if (typeof orig !== "function" || orig.__v3LenWrapped) return;
    const wrapped = function () {
      const result = orig.apply(this, arguments);
      after();
      return result;
    };
    wrapped.__v3LenWrapped = true;
    window[name] = wrapped;
  }

  wrap("syncPartTypeFromToggle", restoreForCurrentType);
  wrap("updateSelectedConnectorUI", refreshEdit);
  wrap("setLengthEditMode", function () {
    if (window.isLengthEditModeOn) refreshEdit();
    else if (isRailEditOpen() || isHostedEdit()) {
      lastEditKey = "";
      renderEditHost();
    }
    else if (openId() === EDIT_ID && !closingEdit && !suppressPopupCancel) {
      closingEdit = true;
      try { ui() && ui().closePopup("cancel"); } catch (e) {}
      closingEdit = false;
    }
  });
  wrap("undo", function () { refreshEdit(true); });
  wrap("redo", function () { refreshEdit(true); });

  function hookToolbarSync() {
    const cad = window.v3CadToolbar;
    if (!cad || typeof cad.syncActive !== "function" || cad.syncActive.__v3LenChip) return;
    const orig = cad.syncActive;
    cad.syncActive = function () {
      const result = orig.apply(this, arguments);
      if (isRailAddOpen() || isHostedAdd()) syncAddHostIfNeeded();
      else if (isRailEditOpen() || isHostedEdit()) syncEditHostIfNeeded();
      else closeAddIfInactive();
      syncChip();
      return result;
    };
    cad.syncActive.__v3LenChip = true;
  }
  function migrateAddPos() {
    try {
      if (window.localStorage.getItem("cuberack.v3.lenAddUi") === "3c") return;
      const w = ui();
      const st = w && typeof w.getState === "function" ? w.getState() : null;
      if (st && st.popups && st.popups[ADD_ID]) delete st.popups[ADD_ID];
      window.localStorage.setItem("cuberack.v3.lenAddUi", "3c");
      if (w && typeof w.persist === "function") w.persist();
    } catch (e) {}
  }
  migrateAddPos();
  hookToolbarSync();
  document.addEventListener("pointermove", function (ev) {
    if (addResize) moveAddResize(ev);
    if (chipDrag) moveChipDrag(ev);
  }, true);
  document.addEventListener("mousemove", function (ev) {
    if (addResize) moveAddResize(ev);
    if (chipDrag) moveChipDrag(ev);
  }, true);
  document.addEventListener("pointerup", function (ev) {
    if (addResize) endAddResize(ev, false);
    if (chipDrag) endChipDrag(ev, false);
  }, true);
  document.addEventListener("mouseup", function (ev) {
    if (addResize) endAddResize(ev, false);
    if (chipDrag) endChipDrag(ev, false);
  }, true);
  document.addEventListener("pointercancel", function (ev) {
    if (addResize) endAddResize(ev, true);
    if (chipDrag) endChipDrag(ev, true);
  }, true);
  window.addEventListener("resize", function () {
    if (isAddOpen()) applyAddWidth();
    const chip = $("v3-len-chip");
    if (chip && !chip.hidden) placeChip(chip);
  });
  ensureChip();
  if (isRailAddOpen()) mountAdd($("v3-east-pane-add"));
  else if (isRailEditOpen()) mountEdit($("v3-east-pane-length"));
  else syncChip();

  window.v3LengthPanel = {
    open: openEdit,
    openAdd: openAdd,
    openEdit: openEdit,
    refresh: refreshEdit,
    restoreForCurrentType: restoreForCurrentType,
    isOpen: isEditOpen,
    isAddOpen: isAddOpen,
    syncChip: syncChip,
    mount: mount,
    mountAdd: mountAdd,
    mountEdit: mountEdit,
    hideFloating: hideFloatingLengthUi,
    panelMode: panelMode,
    syncFromTool: syncFromTool,
    applyEdit: applyEdit,
    cancelEdit: cancelEdit,
    commitAdd: commitAdd,
    selectAddKind: selectAddKind,
  };
})();
