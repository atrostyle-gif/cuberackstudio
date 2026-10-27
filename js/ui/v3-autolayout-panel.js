// =========================================================
// V3 自動レイアウト：CAD内フローティングエディター
// - 生成は js/features/autolayout.js が正本
// - 平面設定は cuberack_plane_layout_v1 と互換
// - セル配置は固定ビューポート＋ズーム／パン（DOMセルは使わない）
// =========================================================

(function () {
  const STORAGE_KEY = "cuberack_plane_layout_v1";
  const MAX_COUNT = 50;
  const WIN_W = 440;
  const TITLE_H = 32;
  const MARGIN = 8;
  const DEFAULT_LEN = 200;
  const DEFAULT_H = 300;
  const MAX_STAGES = 10;
  const VIEW_H = 210;
  const PAD_L = 40;
  const PAD_T = 18;
  const PAD_R = 6;
  const PAD_B = 6;
  const CELL_MIN = 2;
  const CELL_MAX = 36;
  const PAN_SLOP = 4;

  const BEAM_PRESETS = [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
  const POLE_PRESETS = [50, 100, 200, 300, 400, 500, 600, 800];

  let model = null;
  let bound = false;
  let canvasBound = false;
  let drag = null;
  let popover = null;
  const view = {
    cellPx: 12,
    ox: PAD_L,
    oy: PAD_T,
    needFit: true,
  };
  let pointer = null;
  let rectMode = false;
  let rectSel = null;

  function $(id) {
    return document.getElementById(id);
  }

  function beamPresets() {
    return window.BEAM_LENGTH_OPTIONS || BEAM_PRESETS;
  }

  function polePresets() {
    return window.POLE_LENGTH_OPTIONS || POLE_PRESETS;
  }

  function parseLen(raw, fallback) {
    const n = window.parseLengthMm ? window.parseLengthMm(raw) : Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
    return fallback;
  }

  function fmt(n) {
    if (window.formatDesignMm) return window.formatDesignMm(n);
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    const r = Math.round(v);
    return Math.abs(v - r) < 1e-6 ? String(r) : String(Number(v.toFixed(4)));
  }

  function clampInt(n, min, max) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function defaultStage() {
    return { stages: 1, heights: [DEFAULT_H] };
  }

  // heights[0] = 1段目（最下段）。増減は末尾＝最上段側。
  function copyStage(src) {
    const stages = clampInt(src && src.stages, 1, MAX_STAGES);
    const heights = [];
    for (let i = 0; i < stages; i++) {
      heights.push(parseLen(src && src.heights && src.heights[i], DEFAULT_H));
    }
    return { stages, heights };
  }

  function defaultModel() {
    return {
      cols: 2,
      rows: 2,
      widthLens: [DEFAULT_LEN, DEFAULT_LEN],
      depthLens: [DEFAULT_LEN, DEFAULT_LEN],
      enabled: [[true, true], [true, true]],
      stages: [[copyStage(), copyStage()], [copyStage(), copyStage()]],
      raiseBottom: false,
      bottomBeams: true,
      bulkStages: 1,
      bulkHeights: [DEFAULT_H],
      sel: { r: 0, c: 0 },
    };
  }

  function resizeModel(m, rows, cols) {
    const nextRows = clampInt(rows, 1, MAX_COUNT);
    const nextCols = clampInt(cols, 1, MAX_COUNT);
    const widthLens = [];
    const depthLens = [];
    const enabled = [];
    const stages = [];
    for (let c = 0; c < nextCols; c++) {
      widthLens.push(parseLen(m.widthLens && m.widthLens[c], DEFAULT_LEN));
    }
    for (let r = 0; r < nextRows; r++) {
      depthLens.push(parseLen(m.depthLens && m.depthLens[r], DEFAULT_LEN));
      const enRow = [];
      const stRow = [];
      for (let c = 0; c < nextCols; c++) {
        const prevEn = m.enabled && m.enabled[r] && m.enabled[r][c];
        enRow.push(prevEn !== false);
        stRow.push(copyStage(m.stages && m.stages[r] && m.stages[r][c]));
      }
      enabled.push(enRow);
      stages.push(stRow);
    }
    m.rows = nextRows;
    m.cols = nextCols;
    m.widthLens = widthLens;
    m.depthLens = depthLens;
    m.enabled = enabled;
    m.stages = stages;
    if (m.sel && (m.sel.r >= nextRows || m.sel.c >= nextCols)) m.sel = { r: 0, c: 0 };
    if (rectSel) {
      if (rectSel.r0 >= nextRows || rectSel.c0 >= nextCols) rectSel = null;
      else {
        rectSel.r1 = Math.min(rectSel.r1, nextRows - 1);
        rectSel.c1 = Math.min(rectSel.c1, nextCols - 1);
      }
    }
    view.needFit = true;
    return m;
  }

  function loadModel() {
    const m = defaultModel();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return m;
      const data = JSON.parse(raw);
      const rows = clampInt(data.rows, 1, MAX_COUNT);
      const cols = clampInt(data.cols, 1, MAX_COUNT);
      m.widthLens = Array.isArray(data.widthLens) ? data.widthLens.slice() : m.widthLens;
      m.depthLens = Array.isArray(data.depthLens) ? data.depthLens.slice() : m.depthLens;
      m.enabled = Array.isArray(data.enabledMatrix) ? data.enabledMatrix : m.enabled;
      m.stages = Array.isArray(data.stageMatrix) ? data.stageMatrix : m.stages;
      const bulk = data.faceStageBulk;
      if (bulk && Array.isArray(bulk.heights) && bulk.heights.length) {
        m.bulkStages = clampInt(bulk.stageCount || bulk.heights.length, 1, MAX_STAGES);
        m.bulkHeights = bulk.heights.map((h) => parseLen(h, DEFAULT_H)).slice(0, m.bulkStages);
        while (m.bulkHeights.length < m.bulkStages) m.bulkHeights.push(DEFAULT_H);
      }
      const raise = window.resolveRaiseBottomOptions
        ? window.resolveRaiseBottomOptions(data)
        : { raiseBottom: !!data.raiseBottom, bottomBeams: data.bottomBeams !== false };
      m.raiseBottom = !!raise.raiseBottom;
      m.bottomBeams = raise.bottomBeams !== false;
      resizeModel(m, rows, cols);
    } catch (e) {
      console.warn("[v3-al] layout load failed", e);
    }
    return m;
  }

  function saveModel() {
    if (!model) return;
    const payload = {
      rows: model.rows,
      cols: model.cols,
      widthLens: model.widthLens.slice(),
      depthLens: model.depthLens.slice(),
      enabledMatrix: model.enabled.map((row) => row.slice()),
      stageMatrix: model.stages.map((row) => row.map(copyStage)),
      raiseBottom: !!model.raiseBottom,
      bottomBeams: model.bottomBeams !== false,
      faceStageBulk: {
        stageCount: model.bulkStages,
        heights: model.bulkHeights.slice(),
      },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("[v3-al] layout save failed", e);
    }
  }

  function setRaiseBottom(on) {
    if (!model) model = defaultModel();
    model.raiseBottom = !!on;
    // 新しく立ち上げをONにしたときの下部Beam初期値は「なし」。手動の「あり」は data-al-bb で維持する。
    if (model.raiseBottom) model.bottomBeams = false;
  }

  function getRaiseOptions() {
    if (!model) model = defaultModel();
    return {
      raiseBottom: !!model.raiseBottom,
      bottomBeams: model.bottomBeams !== false,
    };
  }

  function collectCfg(mode) {
    return {
      rows: model.rows,
      cols: model.cols,
      widthLens: model.widthLens.slice(),
      depthLens: model.depthLens.slice(),
      enabledMatrix: model.enabled.map((row) => row.slice()),
      stageMatrix: model.stages.map((row) => row.map(copyStage)),
      raiseBottom: !!model.raiseBottom,
      bottomBeams: model.bottomBeams !== false,
      mode: mode === "append" ? "append" : "replace",
    };
  }

  function northH() {
    const el = $("v3-north");
    return el ? el.getBoundingClientRect().height : 48;
  }

  function clampBox(x, y, w, h) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = MARGIN;
    const minY = MARGIN;
    const maxX = Math.max(minX, vw - w - MARGIN);
    const maxY = Math.max(minY, vh - h - MARGIN);
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }

  function defaultPos(w, h) {
    const viewEl = $("view");
    const r = viewEl ? viewEl.getBoundingClientRect() : {
      right: window.innerWidth,
      top: northH() + 8,
    };
    const x = Math.round(r.right - w - 16);
    const y = Math.round((r.top || northH() + 8) + 12);
    return clampBox(x, y, w, h);
  }

  function savedPos() {
    const st = window.v3WorkspaceUi && window.v3WorkspaceUi.getState && window.v3WorkspaceUi.getState();
    const p = st && st.popups && st.popups.autolayout;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
    return null;
  }

  function persistPos() {
    const win = $("v3-al-win");
    if (!win || !window.v3WorkspaceUi) return;
    const st = window.v3WorkspaceUi.getState ? window.v3WorkspaceUi.getState() : null;
    if (!st) return;
    if (!st.popups) st.popups = {};
    st.popups.autolayout = { x: win.offsetLeft, y: win.offsetTop };
    if (typeof window.v3WorkspaceUi.persist === "function") window.v3WorkspaceUi.persist();
  }

  function fitWinHeight() {
    const win = $("v3-al-win");
    if (!win) return;
    if (win.classList.contains("is-minimized")) {
      win.style.maxHeight = "";
      return;
    }
    const y = parseFloat(win.style.top) || win.offsetTop || 0;
    const cap = Math.round(window.innerHeight * 0.9);
    const remain = window.innerHeight - y - MARGIN;
    const maxH = Math.max(220, Math.min(cap, remain));
    win.style.maxHeight = maxH + "px";
  }

  function applyPos(x, y) {
    const win = $("v3-al-win");
    if (!win) return;
    const w = win.offsetWidth || WIN_W;
    fitWinHeight();
    const h = win.classList.contains("is-minimized") ? TITLE_H : Math.min(win.offsetHeight || 480, Math.round(window.innerHeight * 0.9));
    const c = clampBox(x, y, w, h);
    win.style.left = c.x + "px";
    win.style.top = c.y + "px";
    win.style.right = "auto";
    fitWinHeight();
  }

  function placeOnOpen() {
    const win = $("v3-al-win");
    if (!win) return;
    const saved = savedPos();
    if (saved) applyPos(saved.x, saved.y);
    else {
      const pos = defaultPos(win.offsetWidth || WIN_W, win.offsetHeight || 520);
      applyPos(pos.x, pos.y);
    }
  }

  function setDragging(on) {
    document.body.classList.toggle("v3-ui-dragging", !!on);
    window.__v3UiDragging = !!on;
  }

  function hidePop() {
    const pop = $("v3-al-pop");
    if (pop) {
      pop.hidden = true;
      pop.innerHTML = "";
    }
    popover = null;
  }

  function showLenPopAt(clientX, clientY, value, presets, onApply) {
    const pop = $("v3-al-pop");
    const win = $("v3-al-win");
    if (!pop || !win) return;
    popover = { onApply };
    const cur = parseLen(value, DEFAULT_LEN);
    pop.innerHTML =
      '<div class="v3-al-chips">' +
      presets.map((n) => {
        const on = Math.abs(n - cur) < 1e-6 ? " is-on" : "";
        return '<button type="button" data-al-chip="' + n + '" class="' + on.trim() + '">' + n + "</button>";
      }).join("") +
      "</div>" +
      '<div class="v3-al-pop-row">' +
      '<input id="v3-al-pop-len" type="text" inputmode="decimal" value="' + fmt(cur) + '" aria-label="長さ mm">' +
      '<button type="button" id="v3-al-pop-ok" class="is-primary">OK</button>' +
      "</div>";
    pop.hidden = false;
    const wr = win.getBoundingClientRect();
    let left = clientX - wr.left;
    let top = clientY - wr.top + 6;
    const pw = 220;
    const ph = pop.offsetHeight || 120;
    if (left + pw > wr.width - 8) left = wr.width - pw - 8;
    if (top + ph > wr.height - 8) top = clientY - wr.top - ph - 6;
    pop.style.left = Math.max(8, left) + "px";
    pop.style.top = Math.max(8, top) + "px";
    const input = $("v3-al-pop-len");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function showLenPop(anchor, value, presets, onApply) {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    showLenPopAt(r.left, r.bottom, value, presets, onApply);
  }

  function applyPopValue(raw) {
    if (!popover) return;
    const n = parseLen(raw, null);
    if (n == null) return;
    popover.onApply(n);
    hidePop();
    saveModel();
    render();
  }

  function cellTitle(r, c) {
    return "選択セル：幅" + (c + 1) + "列目・奥行" + (r + 1) + "行目";
  }

  function selectedCell() {
    if (!model || !model.sel) return null;
    const r = model.sel.r;
    const c = model.sel.c;
    if (r < 0 || c < 0 || r >= model.rows || c >= model.cols) return null;
    return { r, c, on: !!model.enabled[r][c], stage: model.stages[r][c] };
  }

  function canvasEl() {
    return $("v3-al-canvas");
  }

  function cssSize(cv) {
    return { w: cv.clientWidth || 400, h: cv.clientHeight || VIEW_H };
  }

  function sizeCanvas(cv) {
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = cssSize(cv);
    const tw = Math.max(1, Math.round(w * dpr));
    const th = Math.max(1, Math.round(h * dpr));
    if (cv.width !== tw || cv.height !== th) {
      cv.width = tw;
      cv.height = th;
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fitView(cv) {
    if (!cv || !model) return;
    const { w, h } = cssSize(cv);
    const availW = Math.max(8, w - PAD_L - PAD_R);
    const availH = Math.max(8, h - PAD_T - PAD_B);
    const cell = Math.min(availW / model.cols, availH / model.rows);
    view.cellPx = Math.min(CELL_MAX, Math.max(CELL_MIN, cell));
    view.ox = PAD_L + (availW - view.cellPx * model.cols) / 2;
    view.oy = PAD_T + (availH - view.cellPx * model.rows) / 2;
    view.needFit = false;
  }

  function clampPan() {
    const cv = canvasEl();
    if (!cv || !model) return;
    const { w, h } = cssSize(cv);
    const gw = view.cellPx * model.cols;
    const gh = view.cellPx * model.rows;
    const availW = w - PAD_L - PAD_R;
    const availH = h - PAD_T - PAD_B;
    if (gw <= availW) view.ox = PAD_L + (availW - gw) / 2;
    else view.ox = Math.min(PAD_L, Math.max(w - PAD_R - gw, view.ox));
    if (gh <= availH) view.oy = PAD_T + (availH - gh) / 2;
    else view.oy = Math.min(PAD_T, Math.max(h - PAD_B - gh, view.oy));
  }

  function zoomAt(cssX, cssY, factor) {
    const beforeX = (cssX - view.ox) / view.cellPx;
    const beforeY = (cssY - view.oy) / view.cellPx;
    view.cellPx = Math.min(CELL_MAX, Math.max(CELL_MIN, view.cellPx * factor));
    view.ox = cssX - beforeX * view.cellPx;
    view.oy = cssY - beforeY * view.cellPx;
    clampPan();
  }

  function hitCell(mx, my) {
    const s = view.cellPx;
    if (s <= 0 || !model) return null;
    const c = Math.floor((mx - view.ox) / s);
    const visR = Math.floor((my - view.oy) / s);
    const r = model.rows - 1 - visR;
    if (c < 0 || c >= model.cols || r < 0 || r >= model.rows) return null;
    return { r, c };
  }

  function cellAtClamped(mx, my) {
    if (!model || view.cellPx <= 0) return null;
    const s = view.cellPx;
    let c = Math.floor((mx - view.ox) / s);
    let visR = Math.floor((my - view.oy) / s);
    let r = model.rows - 1 - visR;
    c = Math.max(0, Math.min(model.cols - 1, c));
    r = Math.max(0, Math.min(model.rows - 1, r));
    return { r, c };
  }

  function rectFromCells(a, b) {
    if (!a || !b) return null;
    return {
      r0: Math.min(a.r, b.r),
      r1: Math.max(a.r, b.r),
      c0: Math.min(a.c, b.c),
      c1: Math.max(a.c, b.c),
    };
  }

  function rectCellCount(sel) {
    const s = sel || rectSel;
    if (!s) return 0;
    return (s.r1 - s.r0 + 1) * (s.c1 - s.c0 + 1);
  }

  function layoutHint() {
    return rectMode
      ? "ドラッグ:範囲選択　ホイール:ズーム　Esc:選択解除　奥↑ 手前↓"
      : "クリック:選択　ドラッグ:パン　Shift+ドラッグ:範囲ON/OFF　ホイール:ズーム　奥↑ 手前↓";
  }

  function setRectSel(a, b) {
    rectSel = rectFromCells(a, b);
    if (rectSel) model.sel = { r: b.r, c: b.c };
    updateRectChrome();
    renderChrome();
    drawPlan();
  }

  function clearRectSel() {
    if (!rectSel) {
      updateRectChrome();
      drawPlan();
      return;
    }
    rectSel = null;
    updateRectChrome();
    drawPlan();
  }

  function applyRectEnabled(on) {
    if (!rectSel || !model) return;
    applyRange(
      { r: rectSel.r0, c: rectSel.c0 },
      { r: rectSel.r1, c: rectSel.c1 },
      !!on
    );
    saveModel();
    updateRectChrome();
    renderChrome();
    drawPlan();
  }

  function setRectMode(on) {
    rectMode = !!on;
    if (!rectMode) rectSel = null;
    pointer = null;
    const host = $("v3-al-viewport");
    if (host) {
      host.classList.toggle("is-rect", rectMode);
      host.classList.remove("is-marquee", "is-pan");
    }
    updateRectChrome();
    drawPlan();
  }

  function updateRectChrome() {
    const bar = $("v3-al-rect-bar");
    const count = $("v3-al-rect-count");
    const btn = document.querySelector("[data-al-rect-mode]");
    const n = rectCellCount();
    if (btn) {
      btn.classList.toggle("is-on", rectMode);
      btn.setAttribute("aria-pressed", rectMode ? "true" : "false");
    }
    if (bar) bar.hidden = !rectMode;
    if (count) count.textContent = "選択 " + n + " セル";
    const onBtn = document.querySelector('[data-al-rect-act="on"]');
    const offBtn = document.querySelector('[data-al-rect-act="off"]');
    if (onBtn) onBtn.disabled = !n;
    if (offBtn) offBtn.disabled = !n;
    const host = $("v3-al-viewport");
    if (host) host.classList.toggle("is-rect", rectMode);
    const hint = $("v3-al-hint");
    if (hint) hint.textContent = layoutHint();
  }

  function hitDim(mx, my) {
    const s = view.cellPx;
    if (my >= view.oy - 16 && my < view.oy && mx >= view.ox && mx < view.ox + model.cols * s) {
      const c = Math.floor((mx - view.ox) / s);
      if (c >= 0 && c < model.cols) return { kind: "w", i: c };
    }
    if (mx >= view.ox - 38 && mx < view.ox && my >= view.oy && my < view.oy + model.rows * s) {
      const visR = Math.floor((my - view.oy) / s);
      const r = model.rows - 1 - visR;
      if (r >= 0 && r < model.rows) return { kind: "d", i: r };
    }
    return null;
  }

  function dimStep(n, px) {
    if (px >= 18) return 1;
    if (px >= 12) return 2;
    if (px >= 7) return Math.max(2, Math.ceil(n / 16));
    return Math.max(4, Math.ceil(n / 10));
  }

  function showIndex(i, n, step, keep) {
    return i === 0 || i === n - 1 || i % step === 0 || i === keep;
  }

  function drawPlan() {
    const cv = canvasEl();
    if (!cv || !model) return;
    sizeCanvas(cv);
    const ctx = cv.getContext("2d");
    const { w, h } = cssSize(cv);
    const s = view.cellPx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, w, h);

    const gap = s >= 10 ? 1 : (s >= 5 ? 0.5 : 0);
    for (let r = 0; r < model.rows; r++) {
      const y = view.oy + (model.rows - 1 - r) * s;
      for (let c = 0; c < model.cols; c++) {
        const x = view.ox + c * s;
        const on = !!model.enabled[r][c];
        ctx.fillStyle = on ? "#1d4ed8" : "#1e293b";
        ctx.fillRect(x, y, Math.max(0.5, s - gap), Math.max(0.5, s - gap));
      }
    }

    if (rectSel) {
      const rx = view.ox + rectSel.c0 * s;
      const ry = view.oy + (model.rows - 1 - rectSel.r1) * s;
      const rw = (rectSel.c1 - rectSel.c0 + 1) * s;
      const rh = (rectSel.r1 - rectSel.r0 + 1) * s;
      ctx.fillStyle = "rgba(56,189,248,0.20)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(0.5, rw - 1), Math.max(0.5, rh - 1));
    }

    const sel = selectedCell();
    if (sel) {
      const x = view.ox + sel.c * s;
      const y = view.oy + (model.rows - 1 - sel.r) * s;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = Math.max(1.5, Math.min(2.5, s * 0.18));
      ctx.strokeRect(x + 0.75, y + 0.75, Math.max(0.5, s - gap - 1.5), Math.max(0.5, s - gap - 1.5));
    }

    ctx.fillStyle = "#7dd3fc";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wStep = dimStep(model.cols, s);
    const dStep = dimStep(model.rows, s);
    const keepC = sel ? sel.c : -1;
    const keepR = sel ? sel.r : -1;
    if (s >= 6) {
      for (let c = 0; c < model.cols; c++) {
        if (!showIndex(c, model.cols, wStep, keepC)) continue;
        ctx.fillText(fmt(model.widthLens[c]), view.ox + c * s + s * 0.5, Math.max(8, view.oy - 9));
      }
      ctx.textAlign = "right";
      for (let r = 0; r < model.rows; r++) {
        if (!showIndex(r, model.rows, dStep, keepR)) continue;
        const y = view.oy + (model.rows - 1 - r) * s + s * 0.5;
        ctx.fillText(fmt(model.depthLens[r]), view.ox - 4, y);
      }
    }

    if (pointer && pointer.marquee) {
      const m = pointer.marquee;
      const x = Math.min(m.x0, m.x1);
      const y = Math.min(m.y0, m.y1);
      const pick = !!pointer.rectPick;
      ctx.strokeStyle = pick ? "#38bdf8" : "#fbbf24";
      ctx.fillStyle = pick ? "rgba(56,189,248,0.16)" : "rgba(251,191,36,0.12)";
      ctx.lineWidth = pick ? 1.5 : 1;
      ctx.fillRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, Math.abs(m.x1 - m.x0) - 1), Math.max(0, Math.abs(m.y1 - m.y0) - 1));
    }
  }

  function applyRange(a, b, on) {
    const r0 = Math.min(a.r, b.r);
    const r1 = Math.max(a.r, b.r);
    const c0 = Math.min(a.c, b.c);
    const c1 = Math.max(a.c, b.c);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) model.enabled[r][c] = on;
    }
    model.sel = { r: b.r, c: b.c };
  }

  function updateSelLabel() {
    const el = $("v3-al-sel-label");
    if (!el) return;
    const sel = selectedCell();
    if (!sel) {
      el.textContent = "セルをクリックして選択";
      return;
    }
    el.textContent = cellTitle(sel.r, sel.c) + (sel.on ? "" : "（無効）");
  }

  function localXY(ev, cv) {
    const r = cv.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function bindCanvas(cv) {
    if (!cv || canvasBound) return;
    canvasBound = true;
    const host = $("v3-al-viewport");

    cv.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const p = localXY(ev, cv);
      zoomAt(p.x, p.y, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
      drawPlan();
    }, { passive: false });

    cv.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      hidePop();
      const p = localXY(ev, cv);
      const cell = hitCell(p.x, p.y);
      const dim = hitDim(p.x, p.y);
      const shift = !!ev.shiftKey;
      const useRect = rectMode || shift;
      pointer = {
        pointerId: ev.pointerId,
        x0: p.x,
        y0: p.y,
        ox: view.ox,
        oy: view.oy,
        shift: shift,
        rectPick: rectMode && !shift,
        cell: cell,
        dim: dim,
        moved: false,
        marquee: useRect ? { x0: p.x, y0: p.y, x1: p.x, y1: p.y } : null,
      };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
      if (host) host.classList.toggle("is-marquee", useRect);
      if (host) host.classList.toggle("is-pan", !useRect);
    });

    cv.addEventListener("pointermove", function (ev) {
      if (!pointer || ev.pointerId !== pointer.pointerId) return;
      const p = localXY(ev, cv);
      if (!pointer.moved && (Math.abs(p.x - pointer.x0) > PAN_SLOP || Math.abs(p.y - pointer.y0) > PAN_SLOP)) {
        pointer.moved = true;
      }
      if (pointer.marquee) {
        pointer.marquee.x1 = p.x;
        pointer.marquee.y1 = p.y;
        if (pointer.rectPick && pointer.moved) {
          const a = cellAtClamped(pointer.marquee.x0, pointer.marquee.y0);
          const b = cellAtClamped(p.x, p.y);
          const live = $("v3-al-rect-count");
          if (live) live.textContent = "選択 " + rectCellCount(rectFromCells(a, b)) + " セル";
        }
        drawPlan();
        return;
      }
      if (pointer.moved) {
        view.ox = pointer.ox + (p.x - pointer.x0);
        view.oy = pointer.oy + (p.y - pointer.y0);
        clampPan();
        drawPlan();
      }
    });

    function endPointer(ev) {
      if (!pointer || (ev && ev.pointerId !== pointer.pointerId)) return;
      const p = localXY(ev, cv);
      const was = pointer;
      pointer = null;
      if (host) host.classList.remove("is-marquee", "is-pan");
      if (was.marquee && was.moved) {
        const a = cellAtClamped(was.marquee.x0, was.marquee.y0) || was.cell;
        const b = cellAtClamped(p.x, p.y) || a;
        if (a && b) {
          if (was.rectPick) {
            setRectSel(a, b);
          } else {
            const on = !model.enabled[a.r][a.c];
            applyRange(a, b, on);
            saveModel();
            renderChrome();
            drawPlan();
          }
        } else {
          drawPlan();
        }
        return;
      }
      if (was.moved) {
        drawPlan();
        return;
      }
      if (was.dim && !was.cell) {
        const isW = was.dim.kind === "w";
        const i = was.dim.i;
        const cur = isW ? model.widthLens[i] : model.depthLens[i];
        showLenPopAt(ev.clientX, ev.clientY, cur, beamPresets(), function (n) {
          if (isW) model.widthLens[i] = n;
          else model.depthLens[i] = n;
        });
        return;
      }
      if (was.rectPick) {
        if (was.cell) setRectSel(was.cell, was.cell);
        else drawPlan();
        return;
      }
      if (was.cell) {
        const { r, c } = was.cell;
        model.sel = { r, c };
        renderChrome();
        drawPlan();
      }
    }
    cv.addEventListener("pointerup", endPointer);
    cv.addEventListener("pointercancel", endPointer);
  }

  // 最上段がリスト先頭、最下段（1段目）が末尾。データ index 0 は最下段のまま。
  function renderHeightRows(prefix, count, heights) {
    let html = '<div class="v3-al-heights">';
    for (let i = count - 1; i >= 0; i--) {
      html += '<div class="v3-al-hrow"><em>' + (i + 1) + "段目</em>" +
        '<button type="button" class="v3-al-dim" data-al-h="' + prefix + '" data-i="' + i +
        '" title="下から' + (i + 1) + '段目の高さ">' + fmt(heights[i] || DEFAULT_H) + "</button></div>";
    }
    html += "</div>";
    return html;
  }

  function renderRaise() {
    const on = !!model.raiseBottom;
    const beamsOn = model.bottomBeams !== false;
    let html = '<label class="v3-al-check" title="LEG直上に POLE100 を挿入">' +
      '<input id="v3-al-raise" type="checkbox"' + (on ? " checked" : "") + ">" +
      "最下段の立ち上げ</label>";
    if (!on) return html;
    html += '<div class="v3-al-inline"><span>下部Beam</span><div class="v3-al-seg">' +
      '<button type="button" data-al-bb="1" class="' + (beamsOn ? "is-on" : "") +
      '" title="LEG直上の幅・奥行Beamを生成">あり</button>' +
      '<button type="button" data-al-bb="0" class="' + (!beamsOn ? "is-on" : "") +
      '" title="LEG直上のBeamのみ省略">なし</button>' +
      "</div></div>";
    html += '<div class="v3-al-side">' + raiseSvg(beamsOn) + "</div>";
    return html;
  }

  function raiseSvg(beamsOn) {
    const beam0 = beamsOn
      ? '<line x1="14" y1="52" x2="66" y2="52" stroke="#38bdf8" stroke-width="2.5"/>'
      : '<line x1="14" y1="52" x2="66" y2="52" stroke="#334155" stroke-width="1.5" stroke-dasharray="3 3"/>';
    return '<svg width="80" height="68" viewBox="0 0 80 68" aria-hidden="true">' +
      '<line x1="18" y1="66" x2="18" y2="52" stroke="#94a3b8" stroke-width="2.5"/>' +
      '<line x1="62" y1="66" x2="62" y2="52" stroke="#94a3b8" stroke-width="2.5"/>' +
      '<circle cx="18" cy="52" r="4" fill="#e2e8f0"/>' +
      '<circle cx="62" cy="52" r="4" fill="#e2e8f0"/>' +
      beam0 +
      '<line x1="18" y1="52" x2="18" y2="20" stroke="#a78bfa" stroke-width="2.5"/>' +
      '<line x1="62" y1="52" x2="62" y2="20" stroke="#a78bfa" stroke-width="2.5"/>' +
      '<circle cx="18" cy="20" r="4" fill="#e2e8f0"/>' +
      '<circle cx="62" cy="20" r="4" fill="#e2e8f0"/>' +
      '<line x1="14" y1="20" x2="66" y2="20" stroke="#38bdf8" stroke-width="2.5"/>' +
      "</svg>";
  }

  function skeleton() {
    return '<section class="v3-al-sec">' +
      '<div class="v3-al-h"><span>基本構成</span></div>' +
      '<div class="v3-al-counts">' +
      '<div class="v3-al-field"><span>幅セル</span><div class="v3-al-step">' +
      '<button type="button" data-al-step="cols" data-dir="-1" aria-label="幅を減らす">−</button>' +
      '<input id="v3-al-cols" type="number" min="1" max="' + MAX_COUNT + '" aria-label="幅方向のセル数">' +
      '<button type="button" data-al-step="cols" data-dir="1" aria-label="幅を増やす">+</button></div></div>' +
      '<div class="v3-al-field"><span>奥行セル</span><div class="v3-al-step">' +
      '<button type="button" data-al-step="rows" data-dir="-1" aria-label="奥行を減らす">−</button>' +
      '<input id="v3-al-rows" type="number" min="1" max="' + MAX_COUNT + '" aria-label="奥行方向のセル数">' +
      '<button type="button" data-al-step="rows" data-dir="1" aria-label="奥行を増やす">+</button></div></div>' +
      "</div></section>" +

      '<section class="v3-al-sec">' +
      '<div class="v3-al-h"><span>セル配置</span></div>' +
      '<div class="v3-al-toolbar">' +
      '<button type="button" class="v3-al-ghost" data-al-fit="1" title="全体を表示">フィット</button>' +
      '<button type="button" class="v3-al-ghost" data-al-all="1" title="すべてのセルを有効">全ON</button>' +
      '<button type="button" class="v3-al-ghost" data-al-all="0" title="すべてのセルを無効">全OFF</button>' +
      '<button type="button" class="v3-al-ghost" data-al-rect-mode="1" title="矩形選択" aria-pressed="false">矩形選択</button>' +
      "</div>" +
      '<div id="v3-al-viewport" class="v3-al-viewport">' +
      '<canvas id="v3-al-canvas" width="400" height="210"></canvas></div>' +
      '<div id="v3-al-hint" class="v3-al-hint">クリック:選択　ドラッグ:パン　Shift+ドラッグ:範囲ON/OFF　ホイール:ズーム　奥↑ 手前↓</div>' +
      '<div id="v3-al-rect-bar" class="v3-al-rect-bar" hidden>' +
      '<span id="v3-al-rect-count">選択 0 セル</span>' +
      '<button type="button" data-al-rect-act="on" title="選択範囲をすべてON" disabled>範囲をON</button>' +
      '<button type="button" data-al-rect-act="off" title="選択範囲をすべてOFF" disabled>範囲をOFF</button>' +
      '<button type="button" data-al-rect-act="clear" title="選択を解除">選択解除</button>' +
      "</div>" +
      "</section>" +

      '<section class="v3-al-sec">' +
      '<div class="v3-al-h"><span>高さ・段数</span></div>' +
      '<div class="v3-al-toolbar">' +
      '<button type="button" id="v3-al-apply-bulk" title="有効セルすべてに適用">ONセルへ適用</button>' +
      "</div>" +
      '<div class="v3-al-field"><span>全体段数</span><div class="v3-al-step">' +
      '<button type="button" data-al-step="bulk" data-dir="-1" aria-label="段数を減らす">−</button>' +
      '<input id="v3-al-bulk" type="number" min="1" max="' + MAX_STAGES + '" aria-label="全体の段数">' +
      '<button type="button" data-al-step="bulk" data-dir="1" aria-label="段数を増やす">+</button></div></div>' +
      '<div id="v3-al-bulk-heights"></div>' +
      '<details class="v3-al-more"><summary>個別セル</summary>' +
      '<div class="v3-al-cell-edit">' +
      '<div class="v3-al-sel" id="v3-al-sel-label">セルをクリックして選択</div>' +
      '<div id="v3-al-cell-body"></div>' +
      "</div></details></section>" +

      '<details class="v3-al-sec v3-al-more"><summary>最下段</summary>' +
      '<div class="v3-al-raise" id="v3-al-raise-box"></div></details>';
  }

  function renderChrome() {
    if (!model) return;
    const cols = $("v3-al-cols");
    const rows = $("v3-al-rows");
    const bulk = $("v3-al-bulk");
    if (cols && document.activeElement !== cols) cols.value = String(model.cols);
    if (rows && document.activeElement !== rows) rows.value = String(model.rows);
    if (bulk && document.activeElement !== bulk) bulk.value = String(model.bulkStages);
    const bulkH = $("v3-al-bulk-heights");
    if (bulkH) bulkH.innerHTML = renderHeightRows("bulk", model.bulkStages, model.bulkHeights);
    const cellBody = $("v3-al-cell-body");
    const sel = selectedCell();
    if (cellBody) {
      if (!sel) {
        cellBody.innerHTML = "";
      } else {
        const on = !!sel.on;
        cellBody.innerHTML =
          '<div class="v3-al-inline"><span>セル有効／無効</span><div class="v3-al-seg">' +
          '<button type="button" data-al-cell-en="1" class="' + (on ? "is-on" : "") +
          '" title="このセルを有効">有効</button>' +
          '<button type="button" data-al-cell-en="0" class="' + (!on ? "is-on" : "") +
          '" title="このセルを無効">無効</button></div></div>' +
          '<div class="v3-al-field"><span>個別 段数</span><div class="v3-al-step">' +
          '<button type="button" data-al-step="cell" data-dir="-1" aria-label="セル段数を減らす">−</button>' +
          '<input id="v3-al-cell-st" type="number" min="1" max="' + MAX_STAGES + '" value="' + sel.stage.stages + '" aria-label="セルの段数">' +
          '<button type="button" data-al-step="cell" data-dir="1" aria-label="セル段数を増やす">+</button></div></div>' +
          renderHeightRows("cell", sel.stage.stages, sel.stage.heights);
      }
    }
    updateSelLabel();
    updateRectChrome();
    const raiseBox = $("v3-al-raise-box");
    if (raiseBox) raiseBox.innerHTML = renderRaise();
  }

  function render() {
    const body = $("v3-al-body");
    if (!body || !model) return;
    if (!body.querySelector("#v3-al-canvas")) {
      canvasBound = false;
      body.innerHTML = skeleton();
    }
    renderChrome();
    const cv = canvasEl();
    bindCanvas(cv);
    sizeCanvas(cv);
    if (view.needFit) fitView(cv);
    else clampPan();
    drawPlan();
  }

  function setCount(kind, value) {
    if (kind === "cols") resizeModel(model, model.rows, value);
    else if (kind === "rows") resizeModel(model, value, model.cols);
    else if (kind === "bulk") {
      model.bulkStages = clampInt(value, 1, MAX_STAGES);
      const next = [];
      for (let i = 0; i < model.bulkStages; i++) next.push(parseLen(model.bulkHeights[i], DEFAULT_H));
      model.bulkHeights = next;
    } else if (kind === "cell") {
      const sel = selectedCell();
      if (!sel) return;
      const st = copyStage(sel.stage);
      st.stages = clampInt(value, 1, MAX_STAGES);
      const heights = [];
      for (let i = 0; i < st.stages; i++) heights.push(parseLen(st.heights[i], DEFAULT_H));
      st.heights = heights;
      model.stages[sel.r][sel.c] = st;
    }
    saveModel();
    render();
  }

  function applyBulk() {
    const info = {
      stages: model.bulkStages,
      heights: model.bulkHeights.slice(),
    };
    let n = 0;
    for (let r = 0; r < model.rows; r++) {
      for (let c = 0; c < model.cols; c++) {
        if (!model.enabled[r][c]) continue;
        model.stages[r][c] = copyStage(info);
        n += 1;
      }
    }
    saveModel();
    render();
    if (!n) window.alert("有効なセルがありません。");
  }

  function run(mode) {
    saveModel();
    hidePop();
    if (typeof window.handleAutoLayoutFromTool === "function") {
      window.handleAutoLayoutFromTool(collectCfg(mode));
    }
  }

  function resetAll() {
    if (!window.confirm("マス・寸法・段設定を初期状態に戻します。")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    model = defaultModel();
    rectMode = false;
    rectSel = null;
    view.needFit = true;
    saveModel();
    render();
  }

  function onBodyClick(ev) {
    const t = ev.target.closest("[data-al-step], [data-al-h], [data-al-all], [data-al-bb], [data-al-fit], [data-al-rect-mode], [data-al-rect-act], [data-al-cell-en], #v3-al-apply-bulk");
    if (!t) return;
    if (t.id === "v3-al-apply-bulk") {
      applyBulk();
      return;
    }
    if (t.dataset.alRectMode != null) {
      setRectMode(!rectMode);
      return;
    }
    if (t.dataset.alRectAct === "on") {
      applyRectEnabled(true);
      return;
    }
    if (t.dataset.alRectAct === "off") {
      applyRectEnabled(false);
      return;
    }
    if (t.dataset.alRectAct === "clear") {
      clearRectSel();
      return;
    }
    if (t.dataset.alCellEn != null) {
      const sel = selectedCell();
      if (!sel) return;
      model.enabled[sel.r][sel.c] = t.dataset.alCellEn !== "0";
      saveModel();
      renderChrome();
      drawPlan();
      return;
    }
    if (t.dataset.alFit) {
      view.needFit = true;
      render();
      return;
    }
    if (t.dataset.alBb != null) {
      model.bottomBeams = t.dataset.alBb !== "0";
      saveModel();
      render();
      return;
    }
    if (t.dataset.alAll != null) {
      const on = t.dataset.alAll === "1";
      for (let r = 0; r < model.rows; r++) {
        for (let c = 0; c < model.cols; c++) model.enabled[r][c] = on;
      }
      saveModel();
      drawPlan();
      renderChrome();
      return;
    }
    if (t.dataset.alStep) {
      const kind = t.dataset.alStep;
      const dir = Number(t.dataset.dir) || 0;
      const map = { cols: model.cols, rows: model.rows, bulk: model.bulkStages };
      if (kind === "cell") {
        const sel = selectedCell();
        map.cell = sel && sel.stage ? sel.stage.stages : 1;
      }
      setCount(kind, (map[kind] || 1) + dir);
      return;
    }
    if (t.dataset.alH) {
      const i = +t.dataset.i;
      if (t.dataset.alH === "bulk") {
        showLenPop(t, model.bulkHeights[i], polePresets(), function (n) {
          model.bulkHeights[i] = n;
        });
      } else {
        const sel = selectedCell();
        if (!sel) return;
        showLenPop(t, sel.stage.heights[i], polePresets(), function (n) {
          model.stages[sel.r][sel.c] = copyStage(sel.stage);
          model.stages[sel.r][sel.c].heights[i] = n;
        });
      }
    }
  }

  function onBodyChange(ev) {
    const t = ev.target;
    if (t.id === "v3-al-cols") setCount("cols", t.value);
    else if (t.id === "v3-al-rows") setCount("rows", t.value);
    else if (t.id === "v3-al-bulk") setCount("bulk", t.value);
    else if (t.id === "v3-al-cell-st") setCount("cell", t.value);
    else if (t.id === "v3-al-raise") {
      setRaiseBottom(t.checked);
      saveModel();
      render();
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    const win = $("v3-al-win");
    const bar = $("v3-al-titlebar");
    const body = $("v3-al-body");
    if (!win || !bar || !body) return;

    win.addEventListener("pointerdown", function (ev) {
      ev.stopPropagation();
    });

    $("v3-al-min").addEventListener("click", function (ev) {
      ev.preventDefault();
      win.classList.toggle("is-minimized");
      $("v3-al-min").textContent = win.classList.contains("is-minimized") ? "□" : "–";
      applyPos(win.offsetLeft, win.offsetTop);
      persistPos();
    });
    $("v3-al-x").addEventListener("click", function (ev) {
      ev.preventDefault();
      if (isDocked() && window.v3EastRail && typeof window.v3EastRail.close === "function") {
        window.v3EastRail.close();
        return;
      }
      close();
    });
    $("v3-al-replace").addEventListener("click", function (ev) {
      ev.preventDefault();
      run("replace");
    });
    $("v3-al-append").addEventListener("click", function (ev) {
      ev.preventDefault();
      run("append");
    });
    $("v3-al-reset").addEventListener("click", function (ev) {
      ev.preventDefault();
      resetAll();
    });

    body.addEventListener("click", onBodyClick);
    body.addEventListener("change", onBodyChange);

    win.addEventListener("click", function (ev) {
      const pop = $("v3-al-pop");
      if (!pop || pop.hidden) return;
      if (ev.target.closest("#v3-al-pop")) {
        const chip = ev.target.closest("[data-al-chip]");
        if (chip) applyPopValue(chip.dataset.alChip);
        else if (ev.target.id === "v3-al-pop-ok") applyPopValue(($("v3-al-pop-len") || {}).value);
        return;
      }
      if (!ev.target.closest("[data-al-dim], [data-al-h], #v3-al-canvas")) hidePop();
    });
    win.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && ev.target && ev.target.id === "v3-al-pop-len") {
        ev.preventDefault();
        applyPopValue(ev.target.value);
      }
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      const w = $("v3-al-win");
      if (!w || w.classList.contains("hidden")) return;
      if (popover) {
        ev.preventDefault();
        hidePop();
        return;
      }
      if (rectSel) {
        ev.preventDefault();
        clearRectSel();
        return;
      }
      if (rectMode) {
        ev.preventDefault();
        setRectMode(false);
        return;
      }
      if (w.contains(ev.target)) {
        ev.preventDefault();
        if (isDocked() && window.v3EastRail && typeof window.v3EastRail.close === "function") {
          window.v3EastRail.close();
        } else {
          close();
        }
      }
    });

    bar.addEventListener("pointerdown", function (ev) {
      if (isDocked()) return;
      if (ev.button != null && ev.button !== 0) return;
      if (ev.target.closest("button")) return;
      ev.preventDefault();
      drag = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        origX: win.offsetLeft,
        origY: win.offsetTop,
      };
      try { bar.setPointerCapture(ev.pointerId); } catch (e) {}
      setDragging(true);
      win.classList.add("is-dragging");
    });
    bar.addEventListener("pointermove", function (ev) {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      applyPos(drag.origX + (ev.clientX - drag.startX), drag.origY + (ev.clientY - drag.startY));
    });
    function endDrag(ev) {
      if (!drag || (ev && ev.pointerId !== drag.pointerId)) return;
      drag = null;
      setDragging(false);
      win.classList.remove("is-dragging");
      persistPos();
    }
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", function () {
      if (win.classList.contains("hidden")) return;
      if (!isDocked()) applyPos(win.offsetLeft, win.offsetTop);
      const cv = canvasEl();
      if (cv) {
        sizeCanvas(cv);
        clampPan();
        drawPlan();
      }
    });
  }

  function isDocked() {
    const win = $("v3-al-win");
    return !!(win && (win.classList.contains("is-docked") || win.closest("#v3-east-rail")));
  }

  function open(opts) {
    const docked = !!(opts && opts.docked);
    if (!docked && window.v3EastRail && typeof window.v3EastRail.open === "function") {
      window.v3EastRail.open("autolayout");
      return;
    }
    const win = $("v3-al-win");
    if (!win) return;
    if (!model) model = loadModel();
    bind();
    win.classList.remove("hidden");
    win.classList.remove("is-minimized");
    const minBtn = $("v3-al-min");
    if (minBtn) minBtn.textContent = "–";
    if (docked) {
      win.classList.add("is-docked");
      win.style.left = "";
      win.style.top = "";
      win.style.right = "";
      win.style.maxHeight = "";
    } else {
      win.classList.remove("is-docked");
    }
    view.needFit = true;
    render();
    if (!docked) {
      placeOnOpen();
      fitWinHeight();
      persistPos();
    }
  }

  function close() {
    if (isDocked() && window.v3EastRail && typeof window.v3EastRail.close === "function") {
      window.v3EastRail.close();
      return;
    }
    const win = $("v3-al-win");
    if (!win) return;
    hidePop();
    rectMode = false;
    rectSel = null;
    pointer = null;
    win.classList.add("hidden");
    win.classList.remove("is-minimized");
    win.classList.remove("is-docked");
  }

  function toggle() {
    if (window.v3EastRail && typeof window.v3EastRail.toggle === "function") {
      window.v3EastRail.toggle("autolayout");
      return;
    }
    const win = $("v3-al-win");
    if (!win || win.classList.contains("hidden") || win.classList.contains("is-minimized")) open();
    else close();
  }

  window.v3AutoLayoutPanel = {
    open,
    close,
    toggle,
    isDocked,
    isOpen() {
      if (window.v3EastRail && typeof window.v3EastRail.getOpenId === "function") {
        return window.v3EastRail.getOpenId() === "autolayout";
      }
      const win = $("v3-al-win");
      return !!(win && !win.classList.contains("hidden"));
    },
    collectCfg,
    setRaiseBottom,
    getRaiseOptions,
    fitView() {
      view.needFit = true;
      render();
    },
    onHostResize() {
      const win = $("v3-al-win");
      if (!win || win.classList.contains("hidden")) return;
      const cv = canvasEl();
      if (!cv) return;
      sizeCanvas(cv);
      clampPan();
      drawPlan();
    },
    getView() {
      return {
        cellPx: view.cellPx,
        ox: view.ox,
        oy: view.oy,
        cols: model && model.cols,
        rows: model && model.rows,
      };
    },
    isRectMode() { return !!rectMode; },
    getRectSel() { return rectSel ? { r0: rectSel.r0, r1: rectSel.r1, c0: rectSel.c0, c1: rectSel.c1 } : null; },
  };
})();
