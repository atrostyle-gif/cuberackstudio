// =========================================================
// UI初期化とイベントハンドラー
// =========================================================

// UI要素取得
function getUI() {
  return {
    view: document.getElementById("view"),

    gridToggleBtn: document.getElementById("grid-toggle-btn"),
    lengthSelect: document.getElementById("length-select"),

    partTypeToggle: document.getElementById("part-type-toggle"),
    partSwitch: document.getElementById("part-switch"),

    orderModeBtn: document.getElementById("order-mode-btn"),
    orderLengthInput: document.getElementById("order-length-input"),

    colorChartToggleBtn:
      document.getElementById("color-chart-toggle-btn") ||
      document.getElementById("colorchart-toggle-btn"),
  };
}

// 長さオプション更新
function updateLengthOptions() {
  const ui = getUI();
  if (!ui.lengthSelect) return;

  const list = window.getCurrentLengthList();
  ui.lengthSelect.innerHTML = "";

  let def = list.includes(window.currentLengthMm) ? window.currentLengthMm : list[0];

  list.forEach((len) => {
    const opt = document.createElement("option");
    opt.value = String(len);
    opt.textContent = `${len} mm`;
    if (len === def) opt.selected = true;
    ui.lengthSelect.appendChild(opt);
  });

  window.currentLengthMm = def;
}

// パーツタイプ同期
function syncPartTypeFromToggle(ui) {
  ui = ui || getUI(); // ★ フォールバック

  if (!ui?.partTypeToggle || !ui?.partSwitch) return;

  // ★ checked=false → Beam, checked=true → Pole
  const isPole = ui.partTypeToggle.checked;
  const newPartType = isPole ? "pole" : "beam";
  
  // 正本変数を更新（window.currentPartType を唯一の正本とする）
  window.currentPartType = newPartType;
  
  // js/state/state.js の currentPartType も更新（互換性のため）
  // ただし、state.js の currentPartType は let でモジュールスコープなので、
  // window.currentPartType を参照するように統一する

  ui.partSwitch.classList.toggle("is-pole", isPole);

  const knob = ui.partSwitch.querySelector(".part-switch-knob");
  if (knob) {
    knob.textContent = isPole ? "Pole" : "Beam";
  }

  updateLengthOptions();

  // ★ 編集カードのプリセットも同じリストに更新
  if (typeof syncEditLenPreset === "function") syncEditLenPreset();
}

// グリッド表示適用
function applyGridVisibility() {
  if (
    typeof grid50 === "undefined" ||
    typeof grid100 === "undefined" ||
    typeof grid200 === "undefined"
  ) {
    console.warn("[grid] grid helpers not ready:", {
      grid50: typeof grid50,
      grid100: typeof grid100,
      grid200: typeof grid200,
    });
    return;
  }

  if (!window.gridEnabled) {
    // OFF: 全部消す
    grid50.visible = false;
    grid100.visible = false;
    grid200.visible = false;
  } else {
    // ON: updateGridVisibilityByDistance() が「全部falseならreturn」する仕様対策
    grid200.visible = true; // 仮で1枚だけONにしてから距離判定させる

    if (typeof updateGridVisibilityByDistance === "function") {
      updateGridVisibilityByDistance();
    } else {
      grid50.visible = false;
      grid100.visible = false;
      grid200.visible = true;
    }
  }
}

// グリッド表示更新（ラッパー）
function updateGridVisibility() {
  if (typeof updateGridVisibilityByDistance === "function") {
    updateGridVisibilityByDistance();
  } else {
    console.warn(
      "updateGridVisibilityByDistance is not defined, skipping grid toggle."
    );
  }
}

// カラーチャートUI同期
function syncColorChartUI() {
  window.__CR_DBG_UI__ && console.log("[syncColorChartUI] enter", {});

  const ui = (typeof getUI === "function") ? getUI() : null;
  const btn = ui?.colorChartToggleBtn || null;

  // パネルは実IDが不明なので候補で拾う（ログで確定 → まずこれを最優先）
  const panel =
    document.getElementById("colorchart-overlay") ||   // ★実ID（ログで確定）
    document.getElementById("color-chart-panel") ||
    document.getElementById("colorchart-panel") ||
    document.getElementById("color-chart") ||
    document.getElementById("colorchart");

  const existingIds = Array.from(document.querySelectorAll("[id]")).map(e => e.id);
  window.__CR_DBG_UI__ && console.log("[syncColorChartUI] resolved", {});

  // ===== ボタン見た目同期（CSS互換を全部揃える）=====
  if (btn) {
    // 既存の2系統に両対応
    btn.classList.toggle("is-on", !!window.isColorChartOn);
    btn.classList.toggle("is-off", !window.isColorChartOn);
    btn.classList.toggle("btn-toggle-on", !!window.isColorChartOn);

    btn.setAttribute("aria-pressed", window.isColorChartOn ? "true" : "false");

    // 表示文言がOFFのまま問題の対策（ボタンが <button> の場合だけ）
    if (btn.tagName === "BUTTON") {
      btn.textContent = window.isColorChartOn ? "カラーチャートON" : "カラーチャートOFF";
    }
  }

    // ===== パネル表示同期 =====
  if (panel) {
    panel.classList.toggle("hidden", !window.isColorChartOn);

    // 表示/非表示
    panel.style.display = window.isColorChartOn ? "block" : "none";

    // ★重要：overlay 全体はクリック透過（3Dビュー操作を殺さない）
    panel.style.pointerEvents = "none";

    // ★重要：ウィンドウ本体だけ操作可能にする
    const dlg = panel.querySelector(".dim-dialog");
    if (dlg) dlg.style.pointerEvents = "auto";
  } else {
    console.warn("[colorChart] panel not found (after resolve).");
  }
}

// セレクトに長さを設定
function fillSelectWithLengths(selectEl, list) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  list.forEach((len) => {
    const opt = document.createElement("option");
    opt.value = String(len);
    opt.textContent = `${len} mm`;
    selectEl.appendChild(opt);
  });
}

// 高さエディタウィンドウを開く
let heightEditorWin = null;

function openHeightEditorWindow() {
  // すでに開いてたら再利用
  if (heightEditorWin && !heightEditorWin.closed) {
    heightEditorWin.focus();
    return;
  }
  heightEditorWin = window.open(
    "height-editor.html",
    "heightEditor",
    "width=420,height=320"
  );
}

// 選択中コネクタの現在長さ（mm）を取得
function getSelectedConnectorLengthMm() {
  if (!window.selectedConnector) return null;

  if (window.selectedConnector.type === "beam") {
    const b = beams?.[window.selectedConnector.index];
    if (!b) return null;
    // customLength 優先。無ければ実寸
    if (b.isCustom && Number.isFinite(b.customLength) && b.customLength > 0) {
      return Math.round(b.customLength);
    }
    if (typeof getBeamLength === "function") return Math.round(getBeamLength(b));
    if (typeof getBeamLengthMmSafe === "function") return Math.round(getBeamLengthMmSafe(b));
    return null;
  }

  if (window.selectedConnector.type === "pole") {
    const p = poles?.[window.selectedConnector.index];
    if (!p) return null;
    if (p.isCustom && Number.isFinite(p.customLength) && p.customLength > 0) {
      return Math.round(p.customLength);
    }
    if (typeof getPoleLength === "function") return Math.round(getPoleLength(p));
    // fallback：ジョイント座標から
    const a = joints?.[p.a], b = joints?.[p.b];
    if (a && b) {
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      return Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
    }
    return null;
  }

  return null;
}

// UI初期化
function initUI() {
  const ui = getUI();

  // ===== グリッド =====
  if (ui.gridToggleBtn) {
    ui.gridToggleBtn.addEventListener("click", () => {
      window.gridEnabled = !window.gridEnabled;
      ui.gridToggleBtn.textContent = window.gridEnabled ? "グリッドON" : "グリッドOFF";
      ui.gridToggleBtn.classList.toggle("is-on", window.gridEnabled);
      ui.gridToggleBtn.classList.toggle("is-off", !window.gridEnabled);
      ui.gridToggleBtn.setAttribute("aria-pressed", window.gridEnabled ? "true" : "false");
      if (typeof applyGridVisibility === "function") applyGridVisibility();
    });
    ui.gridToggleBtn.textContent = "グリッドOFF";
    ui.gridToggleBtn.classList.add("is-off");
    ui.gridToggleBtn.setAttribute("aria-pressed", "false");
  }

  // ===== Beam / Pole 切替 =====
  if (ui.partTypeToggle && ui.partSwitch) {
    ui.partTypeToggle.addEventListener("change", () => syncPartTypeFromToggle(ui));
    syncPartTypeFromToggle(ui); // 初期同期
  }

  // ===== 接続モードUI =====
  (function initConnectModeUI(){
    const btn = document.getElementById("connect-mode-btn");
    if (!btn) return;
    btn.addEventListener("click", () => window.setConnectMode(!window.isConnectModeOn));
    window.setConnectMode(false);
  })();

  // ------------------------------------------------------
  // ★ Order状態の唯一の真実：ここだけでON/OFFとUIを同期する
  // ------------------------------------------------------
  function setOrderMode(on, uiRef = null) {
    const u = uiRef || ((typeof getUI === "function") ? getUI() : null);

    window.isOrderModeOn = !!on;

    // オーダーOFFなら、保持値はクリア（仕様：プリセット優先）
    if (!on) {
      if (typeof window.currentOrderLengthMm !== "undefined") window.currentOrderLengthMm = null;
    }

    // UI同期：青色（is-on / is-off）
    if (u?.orderModeBtn?.classList) {
      u.orderModeBtn.classList.toggle("is-on", !!on);
      u.orderModeBtn.classList.toggle("is-off", !on);
    }

    // 入力欄の活性/非活性（任意：OFF時は触れないように）
    if (u?.orderLengthInput) {
      u.orderLengthInput.disabled = !on;
    }
  }

  // ===== 長さプリセット =====
  if (ui.lengthSelect) {
    ui.lengthSelect.addEventListener("change", (e) => {
      const v = parseInt(e.target.value, 10);
      if (!Number.isFinite(v) || v <= 0) return;

      window.currentLengthMm = v;

      // ★要件③：プリセット選択＝Orderより優先 → Order OFF（青もOFFに戻す）
      setOrderMode(false, ui);

      if (typeof hidePreview === "function") hidePreview();
    });
  }

  // ===== オーダーモード =====
  if (ui.orderModeBtn) {
    // 初期状態のUI同期（念のため）
    setOrderMode(!!window.isOrderModeOn, ui);

    ui.orderModeBtn.addEventListener("click", () => {
      // トグル：ON/OFFを切り替え
      const nextOn = !window.isOrderModeOn;
      setOrderMode(nextOn, ui);

      // ONにした直後：入力が妥当なら currentOrderLengthMm にも入れる（確定時に使う）
      if (nextOn) {
  const v = parseInt(String(ui.orderLengthInput?.value || "").trim(), 10);
if (Number.isFinite(v) && v > 0) {
  window.currentOrderLengthMm = v;
}
}
      if (typeof hidePreview === "function") hidePreview();
    });
  }

if (ui.orderLengthInput) {
  ui.orderLengthInput.addEventListener("input", () => {
    const v = parseInt(String(ui.orderLengthInput.value || "").trim(), 10);
    if (Number.isFinite(v) && v > 0) {
      window.currentOrderLengthMm = v;
    } else {
      window.currentOrderLengthMm = null;
    }
    // window.currentOrderLengthMm は既に更新済み
    if (typeof hidePreview === "function") hidePreview(); // 既存の挙動方針に合わせて、プレビューは一旦消す（最小）
  });
}

  // ===== カラーチャート =====
  if (ui.colorChartToggleBtn) {
    ui.colorChartToggleBtn.addEventListener("click", () => {
      if (typeof window.toggleColorChart === "function") window.toggleColorChart();
    });
  }
    // ★ close ボタンでも OFF にする（状態の唯一の正本は isColorChartOn）
  const colorchartCloseBtn =
    document.getElementById("colorchart-close-btn") ||
    document.getElementById("color-chart-close-btn");

 if (colorchartCloseBtn) {
  colorchartCloseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 状態をOFF（正本の関数に寄せる）
    if (typeof window.toggleColorChart === "function") window.toggleColorChart(false);

    // 念のため：DOMも確実に閉じる（CSS差分の保険）
    const overlay = document.getElementById("colorchart-overlay");
    if (overlay) overlay.classList.add("hidden");
  }, true); // ★ capture
}

  updateLengthOptions();
  if (typeof syncColorChartUI === "function") syncColorChartUI();

    // ★ 長さ変更（編集カード）のプリセットを初期投入
  if (typeof syncEditLenPreset === "function") syncEditLenPreset();
}

// 自動レイアウトUI初期化（旧UI用）
const autoWidthLenSelect  = document.getElementById("auto-width-len");
const autoDepthLenSelect  = document.getElementById("auto-depth-len");
const autoHeightLenSelect = document.getElementById("auto-height-len");

// 旧UIが存在するページでだけ、このブロック配下を有効化する
const hasAutoLayoutLegacyUI =
  !!(autoWidthLenSelect && autoDepthLenSelect && autoHeightLenSelect);

if (hasAutoLayoutLegacyUI) {
  fillSelectWithLengths(autoWidthLenSelect, window.BEAM_LENGTH_OPTIONS);
  fillSelectWithLengths(autoDepthLenSelect, window.BEAM_LENGTH_OPTIONS);
  fillSelectWithLengths(autoHeightLenSelect, window.POLE_LENGTH_OPTIONS);
}

// 高さエディタボタンにイベントをつなぐ
const openHeightEditorBtn = document.getElementById("open-height-editor-btn");
if (openHeightEditorBtn) {
  openHeightEditorBtn.addEventListener("click", openHeightEditorWindow);
}

// カラーチャート切替（正本）
function toggleColorChart(forceState) {
  const before = window.isColorChartOn;

  if (typeof forceState === "boolean") {
    window.isColorChartOn = forceState;
  } else {
    window.isColorChartOn = !window.isColorChartOn;
  }

  console.log("[toggleColorChart]", { before, after: window.isColorChartOn });

  if (typeof window.reapplyConnectorVisuals === "function") {
    window.reapplyConnectorVisuals("toggleColorChart");
  }
  if (typeof syncColorChartUI === "function") {
    syncColorChartUI();
  }
}

// 材質選択UI初期化
function initMaterialSelectUI() {
  const sel  = document.getElementById("material-select");
  const hint = document.getElementById("material-hint"); // あれば使う
  if (!sel) return;

  // 二重登録防止
  if (sel.__matBound) return;
  sel.__matBound = true;

  window.syncMaterialSelectOptions?.(sel);

  function applyUI(mat) {
    let m = (typeof window.normalizeMaterial === "function")
      ? window.normalizeMaterial(mat || "IRON")
      : (mat || "IRON");
    if (typeof window.coerceSelectableMaterial === "function") {
      m = window.coerceSelectableMaterial(m);
    }
    window.__CR_CURRENT_MATERIAL__ = m;
    sel.value = m;

    if (hint) {
      hint.textContent =
        (m === "IRON") ? "黒" :
        (m === "BS")   ? "ゴールド" :
        (m === "SUS")  ? "シルバー" : "";
    }
  }

  // 初期値を現在状態に同期
  applyUI(window.__CR_CURRENT_MATERIAL__ || "IRON");

  sel.addEventListener("change", () => {
    applyUI(sel.value);

    // 見積/UI更新（既存の流儀に合わせる）
    try { 
      if (typeof window.requestEstimateRender === "function") {
        window.requestEstimateRender("material select changed");
      }
    } catch {}

    // ★見た目の最終適用（D1）：ColorChart優先／OFFなら材質色へ復帰
    try { 
      if (typeof window.reapplyConnectorVisuals === "function") {
        window.reapplyConnectorVisuals("material select changed");
      }
    } catch {}
  });
}

// オーバーレイとトグルUI初期化
function setupOverlaysAndToggles() {
  // --- ヘルプ ---
  const helpToggleBtn = document.getElementById("help-toggle-btn");
  const helpOverlay = document.getElementById("help-overlay");
  const helpCloseBtn = document.getElementById("help-close-btn");
  const helpDialog = helpOverlay ? helpOverlay.querySelector(".help-dialog") : null;
  const helpHeader = helpDialog ? helpDialog.querySelector(".help-header") : null;

  if (helpToggleBtn && helpOverlay && helpDialog) {
    // ボタンで開閉
    helpToggleBtn.addEventListener("click", () => {
      const isHidden = helpOverlay.classList.contains("hidden");
      if (isHidden) {
        helpOverlay.classList.remove("hidden");
        helpToggleBtn.classList.add("btn-toggle-on");
      } else {
        helpOverlay.classList.add("hidden");
        helpToggleBtn.classList.remove("btn-toggle-on");
      }
    });

    // 「閉じる」ボタン
    if (helpCloseBtn) {
      helpCloseBtn.addEventListener("click", () => {
        helpOverlay.classList.add("hidden");
        helpToggleBtn.classList.remove("btn-toggle-on");
      });
    }

    // ヘッダーをドラッグして移動
    if (helpHeader) {
      let dragging = false;
      let startX = 0, startY = 0;
      let startLeft = 0, startTop = 0;

      helpHeader.addEventListener("mousedown", (e) => {
        dragging = true;

        const rect = helpDialog.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = "none";

        const onMove = (ev) => {
          if (!dragging) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          helpDialog.style.left = `${startLeft + dx}px`;
          helpDialog.style.top = `${startTop + dy}px`;
          helpDialog.style.right = "auto";
        };

        const onUp = () => {
          dragging = false;
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    }
  }

  // --- 寸法ポップアップ ---
  const dimOverlay = document.getElementById("dimension-overlay");
  const dimOpenBtn = document.getElementById("dimension-open-btn");
  const dimCloseBtn = document.getElementById("dimension-close-btn");
  const dimDialog = dimOverlay ? dimOverlay.querySelector(".dim-dialog") : null;
  const dimHeader = dimDialog ? dimDialog.querySelector(".dim-header") : null;

  if (dimOverlay && dimOpenBtn && dimCloseBtn && dimDialog) {
    // ボタンでトグル
    dimOpenBtn.addEventListener("click", () => {
      if (typeof window.setDimensionPopup === "function") {
        const isOn = window.isDimensionPopupOn || false;
        window.setDimensionPopup(!isOn, "toggle-button");
      }
    });

    // ×で閉じる（ボタンもOFFへ）
    dimCloseBtn.addEventListener("click", () => {
      if (typeof window.setDimensionPopup === "function") {
        window.setDimensionPopup(false, "popup-close");
      }
    });

    // 背景クリックで閉じる（ボタンもOFFへ）
    dimOverlay.addEventListener("click", (e) => {
      if (e.target === dimOverlay) {
        if (typeof window.setDimensionPopup === "function") {
          window.setDimensionPopup(false, "overlay-click");
        }
      }
    });

    // ドラッグ移動
    if (dimHeader) {
      let dragging = false;
      let startX = 0, startY = 0;
      let startLeft = 0, startTop = 0;

      dimHeader.addEventListener("mousedown", (e) => {
        dragging = true;

        const rect = dimDialog.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = "none";

        const onMove = (ev) => {
          if (!dragging) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          dimDialog.style.left = `${startLeft + dx}px`;
          dimDialog.style.top = `${startTop + dy}px`;
          dimDialog.style.right = "auto";
        };

        const onUp = () => {
          dragging = false;
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    }
  }

  // --- カラーチャート ---
  const colorToggleBtn =
    document.getElementById("color-chart-toggle-btn") ||
    document.getElementById("color-toggle-btn") ||
    document.getElementById("colorchart-toggle-btn");

  const chartOverlay = document.getElementById("colorchart-overlay");
  const chartCloseBtn = document.getElementById("colorchart-close-btn");
  const chartDialog = chartOverlay ? chartOverlay.querySelector(".dim-dialog") : null;
  const chartHeader = chartDialog ? chartDialog.querySelector(".dim-header") : null;

  // カラーチャート：ドラッグ移動（ヘッダで掴む）
  (function bindColorChartDrag() {
    if (window.__CR_COLORCHART_DRAG_BOUND__) return;
    window.__CR_COLORCHART_DRAG_BOUND__ = true;

    const overlay = document.getElementById("colorchart-overlay");
    if (!overlay) return;

    const dialog = overlay.querySelector(".dim-dialog");
    const header = dialog ? dialog.querySelector(".dim-header") : null;
    if (!dialog || !header) return;

    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    // 位置を absolute で動かす前提
    dialog.style.position = "absolute";

    header.style.cursor = "move";

    header.addEventListener("pointerdown", (e) => {
      // 右クリック等は無視
      if (e.button !== 0) return;

      dragging = true;
      header.setPointerCapture?.(e.pointerId);

      const rect = dialog.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;

      // left/top が未設定なら現在位置から初期化
      const left = parseFloat(dialog.style.left);
      const top  = parseFloat(dialog.style.top);

      startLeft = Number.isFinite(left) ? left : rect.left;
      startTop  = Number.isFinite(top)  ? top  : rect.top;

      // ドラッグ開始時点で left/top を確定
      dialog.style.left = `${startLeft}px`;
      dialog.style.top  = `${startTop}px`;

      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      dialog.style.left = `${startLeft + dx}px`;
      dialog.style.top  = `${startTop + dy}px`;
    }, { passive: true });

    window.addEventListener("pointerup", () => {
      dragging = false;
    }, { passive: true });
  })();

  function updateColorButtonLabel() {
    if (!colorToggleBtn) return;
    colorToggleBtn.textContent = window.isColorChartOn ? "カラーチャートON" : "カラーチャートOFF";
    colorToggleBtn.classList.toggle("btn-toggle-on", window.isColorChartOn);
  }
  // ★ 初期表示（ボタン表示＋表描画）
  updateColorButtonLabel();

  // ★ 表（ポップアップ内 tbody）を描画：正本は updateColorChartPopup()
  //   - HTML側に <tbody id="colorchart-tbody"> がある前提
  if (typeof window.updateColorChartPopup === "function") {
    window.updateColorChartPopup();
  }
}

// グローバルに公開
window.getUI = getUI;
window.initUI = initUI;
window.updateLengthOptions = updateLengthOptions;
window.syncPartTypeFromToggle = syncPartTypeFromToggle;
window.applyGridVisibility = applyGridVisibility;
window.updateGridVisibility = updateGridVisibility;
window.syncColorChartUI = syncColorChartUI;
window.fillSelectWithLengths = fillSelectWithLengths;
window.openHeightEditorWindow = openHeightEditorWindow;
window.getSelectedConnectorLengthMm = getSelectedConnectorLengthMm;
window.toggleColorChart = toggleColorChart;
window.initMaterialSelectUI = initMaterialSelectUI;
window.setupOverlaysAndToggles = setupOverlaysAndToggles;

// ===== 板モードUI（V1.1.1）=====
(function initBoardModeUI(){
  const btn = document.getElementById("board-mode-btn");
  if (!btn) return;

  window.syncBoardUI = function() {
    const on = !!window.isBoardModeOn;
    btn.textContent = "棚板・壁板モード";
    btn.classList.toggle("btn-toggle-off", !on);
    btn.classList.toggle("btn-toggle-on", on);

    // トグルスイッチの状態を同期
    const boardKindToggle = document.getElementById("board-kind-toggle");
    const isPanel = boardKindToggle?.checked || false;
    const boardSwitch = document.getElementById("board-switch");
    if (boardSwitch) {
      boardSwitch.classList.toggle("is-panel", isPanel);
    }
  };

  btn.addEventListener("click", () => {
    window.setBoardMode?.(!window.isBoardModeOn);
    window.syncBoardUI?.();
  });

  // トグルスイッチのイベント
  const boardKindToggle = document.getElementById("board-kind-toggle");
  if (boardKindToggle) {
    boardKindToggle.addEventListener("change", () => {
      window.syncBoardUI?.();
      window.hideBoardPreview?.();
      // 壁板/棚板切り替え時に4点選択をクリア
      window.clearBoardSelection?.();
    });
  }

  // 設定変更時にプレビューを更新
  document.getElementById("board-material")?.addEventListener("change", () => {
    window.hideBoardPreview?.();
  });

  // 初期同期
  window.syncBoardUI?.();
})();