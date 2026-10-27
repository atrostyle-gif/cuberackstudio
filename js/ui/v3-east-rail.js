// =========================================================
// V3 右側収納パネル（自動レイアウト / レイヤー / パーツ追加 / 長さ変更）
// - #v3-dock-east（CADツールバードック）とは別物
// - 既存パネルの DOM / イベントを再利用し、浮動ポップアップは出さない
// =========================================================

(function () {
  const TABS = { autolayout: 1, layers: 1, add: 1, length: 1 };
  const TAB_IDS = ["autolayout", "layers", "add", "length"];
  const TAB_W = 36;
  const DEFAULT_W = 280;
  const MIN_W = 220;
  const MAX_W = 420;
  const MIN_CAD = 640;

  let openId = null;
  let width = DEFAULT_W;
  let bound = false;
  let resizeDrag = null;

  function $(id) {
    return document.getElementById(id);
  }

  function clampWidth(w) {
    const n = Math.round(Number(w));
    if (!Number.isFinite(n)) return DEFAULT_W;
    return Math.min(MAX_W, Math.max(MIN_W, n));
  }

  function shouldOverlay(expandedW, rowW, westW, eastDockW, minCad) {
    if ((eastDockW || 0) > 8) return false;
    const cad = (rowW || 0) - (westW || 0) - (eastDockW || 0) - (expandedW || 0);
    return cad < (minCad || MIN_CAD);
  }

  function slotWidth(el) {
    if (!el || el.classList.contains("v3-dock-empty")) return 0;
    return el.offsetWidth || 0;
  }

  function measure() {
    const row = document.querySelector(".v3-shell-row");
    return {
      row: row ? row.clientWidth : window.innerWidth || 0,
      west: slotWidth($("v3-west")),
      eastDock: slotWidth($("v3-dock-east")),
    };
  }

  function isOverlayNow() {
    if (!openId) return false;
    const m = measure();
    return shouldOverlay(width, m.row, m.west, m.eastDock, MIN_CAD);
  }

  function readState() {
    const st = window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getState === "function"
      ? window.v3WorkspaceUi.getState()
      : null;
    const raw = st && st.eastRail;
    return {
      open: raw && TABS[raw.open] ? raw.open : null,
      width: clampWidth(raw && raw.width),
    };
  }

  function writeState() {
    if (!window.v3WorkspaceUi || typeof window.v3WorkspaceUi.patchState !== "function") return;
    window.v3WorkspaceUi.patchState({
      eastRail: { open: openId, width: width },
    });
  }

  let cadSyncQueued = false;

  // レール自身が CAD 幅を変えたときだけ描画サイズを更新する。
  // window.resize は発行しない（受信側が applyLayout するため循環する）。
  function scheduleCadSync() {
    if (cadSyncQueued) return;
    cadSyncQueued = true;
    const raf = window.requestAnimationFrame || function (fn) { fn(); };
    raf(function () {
      cadSyncQueued = false;
      if (typeof window.resizeV3View === "function") window.resizeV3View();
      if (openId === "autolayout" && window.v3AutoLayoutPanel
          && typeof window.v3AutoLayoutPanel.onHostResize === "function") {
        window.v3AutoLayoutPanel.onHostResize();
      }
      if (window.v3LengthPanel && typeof window.v3LengthPanel.syncChip === "function") {
        window.v3LengthPanel.syncChip();
      }
    });
  }

  function syncToolbar() {
    if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") {
      window.v3CadToolbar.syncActive();
    }
  }

  function setDragging(on) {
    document.body.classList.toggle("v3-ui-dragging", !!on);
    document.body.classList.toggle("v3-east-resizing", !!on);
    window.__v3UiDragging = !!on;
  }

  function mountAutolayout() {
    const pane = $("v3-east-pane-autolayout");
    const win = $("v3-al-win");
    if (!pane || !win) return;
    if (win.parentElement !== pane) pane.appendChild(win);
    const already = win.classList.contains("is-docked") && !win.classList.contains("hidden");
    if (already) return;
    if (window.v3AutoLayoutPanel && typeof window.v3AutoLayoutPanel.open === "function") {
      window.v3AutoLayoutPanel.open({ docked: true });
    }
  }

  function mountAdd() {
    const pane = $("v3-east-pane-add");
    if (!pane) return;
    if (window.v3LengthPanel && typeof window.v3LengthPanel.mountAdd === "function") {
      window.v3LengthPanel.mountAdd(pane);
    }
  }

  function mountLength() {
    const pane = $("v3-east-pane-length");
    if (!pane) return;
    if (window.v3LengthPanel && typeof window.v3LengthPanel.mountEdit === "function") {
      window.v3LengthPanel.mountEdit(pane);
    } else if (window.v3LengthPanel && typeof window.v3LengthPanel.mount === "function") {
      window.v3LengthPanel.mount(pane);
    }
  }

  function mountLayers() {
    const pane = $("v3-east-pane-layers");
    if (!pane) return;
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getOpenPopupId === "function"
        && window.v3WorkspaceUi.getOpenPopupId() === "layers"
        && typeof window.v3WorkspaceUi.closePopup === "function") {
      window.v3WorkspaceUi.closePopup("cancel");
    }
    if (window.v3LayerPanel && typeof window.v3LayerPanel.mount === "function") {
      window.v3LayerPanel.mount(pane);
    }
  }

  function applyChrome() {
    const rail = $("v3-east-rail");
    const pane = $("v3-east-pane");
    if (!rail || !pane) return false;
    const expanded = !!openId;
    const overlay = expanded && isOverlayNow();
    const nextOpen = openId || "";
    const nextW = width + "px";
    const changed =
      rail.classList.contains("is-open") !== expanded ||
      rail.classList.contains("is-overlay") !== overlay ||
      rail.classList.contains("is-push") !== (expanded && !overlay) ||
      pane.hidden !== !expanded ||
      rail.getAttribute("data-east-open") !== nextOpen ||
      rail.style.getPropertyValue("--v3-east-rail-w") !== nextW;

    rail.style.setProperty("--v3-east-rail-w", nextW);
    rail.classList.toggle("is-open", expanded);
    rail.classList.toggle("is-collapsed", !expanded);
    rail.classList.toggle("is-overlay", overlay);
    rail.classList.toggle("is-push", expanded && !overlay);
    rail.setAttribute("data-east-open", nextOpen);

    pane.hidden = !expanded;
    TAB_IDS.forEach(function (tab) {
      const btn = rail.querySelector('[data-east-tab="' + tab + '"]');
      if (btn) {
        const on = tab === openId;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }
      const panel = $("v3-east-pane-" + tab);
      if (panel) panel.hidden = tab !== openId;
    });
    return changed;
  }

  // source "host": タブ操作・幅ドラッグなどレール起点。CAD サイズを更新する。
  // source "window": 実ウィンドウリサイズ。overlay/push の見た目だけ合わせ、resize は再発行しない。
  function applyLayout(persistNow, source) {
    const rail = $("v3-east-rail");
    const pane = $("v3-east-pane");
    if (!rail || !pane) return;
    const fromWindow = source === "window";
    const geometryChanged = applyChrome();
    const expanded = !!openId;

    if (!fromWindow) {
      if (expanded && openId === "autolayout") mountAutolayout();
      if (expanded && openId === "layers") mountLayers();
      if (expanded && openId === "add") mountAdd();
      if (expanded && openId === "length") mountLength();
      if (!expanded) {
        const ae = document.activeElement;
        if (ae && rail.contains(ae) && typeof ae.blur === "function") ae.blur();
      }
      syncToolbar();
      scheduleCadSync();
    } else if (geometryChanged) {
      scheduleCadSync();
    }

    if (persistNow) writeState();
  }

  function open(id) {
    if (!TABS[id]) return;
    openId = id;
    applyLayout(true, "host");
  }

  function close() {
    if (!openId) return;
    openId = null;
    applyLayout(true, "host");
  }

  function toggle(id) {
    if (!TABS[id]) return;
    if (openId === id) close();
    else open(id);
  }

  function getOpenId() {
    return openId;
  }

  function isOpen() {
    return !!openId;
  }

  function bind() {
    if (bound) return;
    const rail = $("v3-east-rail");
    const handle = $("v3-east-resize");
    if (!rail) return;
    bound = true;

    rail.addEventListener("click", function (ev) {
      const tab = ev.target.closest && ev.target.closest("[data-east-tab]");
      if (!tab || !rail.contains(tab)) return;
      ev.preventDefault();
      toggle(tab.getAttribute("data-east-tab"));
    });

    if (handle) {
      handle.addEventListener("pointerdown", function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (!openId) return;
        ev.preventDefault();
        ev.stopPropagation();
        resizeDrag = {
          pointerId: ev.pointerId,
          startX: ev.clientX,
          startW: width,
        };
        try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
        setDragging(true);
      });
      handle.addEventListener("pointermove", function (ev) {
        if (!resizeDrag || ev.pointerId !== resizeDrag.pointerId) return;
        width = clampWidth(resizeDrag.startW + (resizeDrag.startX - ev.clientX));
        applyLayout(false, "host");
      });
      function endResize(ev) {
        if (!resizeDrag || (ev && ev.pointerId !== resizeDrag.pointerId)) return;
        resizeDrag = null;
        setDragging(false);
        applyLayout(true, "host");
      }
      handle.addEventListener("pointerup", endResize);
      handle.addEventListener("pointercancel", endResize);
    }

    window.addEventListener("resize", function () {
      if (resizeDrag) return;
      applyLayout(false, "window");
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (!openId) return;
      if (openId === "autolayout") return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      ev.preventDefault();
      close();
    });

    window.addEventListener("v3-layout-reset", function () {
      const st = readState();
      openId = st.open;
      width = st.width;
      applyLayout(false, "host");
    });
  }

  function init() {
    const rail = $("v3-east-rail");
    if (!rail) return;
    const st = readState();
    openId = st.open;
    width = st.width;
    bind();
    applyLayout(false, "host");
  }

  window.v3EastRail = {
    TABS: TAB_IDS,
    TAB_W,
    DEFAULT_W,
    MIN_W,
    MAX_W,
    MIN_CAD,
    clampWidth,
    shouldOverlay,
    open,
    close,
    toggle,
    getOpenId,
    isOpen,
    applyLayout: function () { applyLayout(false, "host"); },
  };

  init();
})();
