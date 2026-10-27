// =========================================================
// 寸法選択時のコンパクト設定パネル
// =========================================================
(function () {
  const dimStyle = window.v3DrawingDimStyle;
  if (!dimStyle) return;

  function $(id) { return document.getElementById(id); }

  let panel = null;
  let current = null;

  function ensurePanel() {
    if (panel) return panel;
    panel = $("draw-dim-inspector");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "draw-dim-inspector";
      panel.className = "draw-dim-inspector hidden";
      panel.innerHTML =
        '<div class="draw-dim-inspector-head"><span id="draw-dim-inspector-title">寸法</span>' +
        '<button type="button" id="draw-dim-inspector-close" aria-label="閉じる">×</button></div>' +
        '<div class="draw-dim-inspector-body">' +
        '<div class="draw-dim-row"><label>寸法値</label><span id="draw-dim-inspector-val" class="draw-dim-readonly">—</span></div>' +
        '<div class="draw-dim-row"><label for="draw-dim-side">文字位置</label><select id="draw-dim-side"></select></div>' +
        '<div class="draw-dim-row"><label for="draw-dim-font">文字サイズ</label><select id="draw-dim-font"></select></div>' +
        '<div class="draw-dim-row"><label for="draw-dim-gap">線と文字の間隔 (mm)</label><input id="draw-dim-gap" type="number" min="1" max="20" step="0.5" /></div>' +
        '<button type="button" id="draw-dim-reset" class="draw-dim-reset">配置を初期化</button>' +
        "</div>";
      const side = $("v3-draw-side") || document.querySelector(".v3-draw-side") || document.body;
      side.appendChild(panel);
    }
    if (!panel.__bound) {
      panel.__bound = true;
      const close = $("draw-dim-inspector-close");
      if (close) close.addEventListener("click", function () { hide(); });
      ["draw-dim-side", "draw-dim-font", "draw-dim-gap"].forEach(function (id) {
        const el = $(id);
        if (!el) return;
        el.addEventListener("change", applyField);
        el.addEventListener("input", applyField);
      });
      const reset = $("draw-dim-reset");
      if (reset) {
        reset.addEventListener("click", function () {
          if (!current) return;
          const map = stylesMap();
          const k = dimStyle.keyOf(current.viewKey, current.direction);
          delete map[k];
          const p = typeof window.__CR_getDrawingPayload === "function" ? window.__CR_getDrawingPayload() : null;
          if (p && p._dimOffsets) delete p._dimOffsets[k];
          if (p && p._dimStyles) delete p._dimStyles[k];
          show(current);
          persist();
        });
      }
    }
    return panel;
  }

  function stylesMap() {
    const p = typeof window.__CR_getDrawingPayload === "function" ? window.__CR_getDrawingPayload() : null;
    if (!p) return {};
    if (!p._dimStyles) p._dimStyles = {};
    return p._dimStyles;
  }

  function persist() {
    const sheet = window.v3DrawingSheet;
    if (sheet && typeof sheet.persistDocument === "function") sheet.persistDocument();
    if (typeof window.__CR_drawingRedraw === "function") window.__CR_drawingRedraw();
  }

  function applyField() {
    if (!current) return;
    const map = stylesMap();
    const k = dimStyle.keyOf(current.viewKey, current.direction);
    if (!map[k]) map[k] = dimStyle.defaultStyle(current.isHorizontal);
    const sideEl = $("draw-dim-side");
    const fontEl = $("draw-dim-font");
    const gapEl = $("draw-dim-gap");
    if (sideEl) map[k].textSide = sideEl.value;
    if (fontEl) map[k].fontSizeMm = parseFloat(fontEl.value) || 3.5;
    if (gapEl) map[k].gapMm = parseFloat(gapEl.value) || 4;
    persist();
  }

  function fillSelects(isHorizontal) {
    const sideEl = $("draw-dim-side");
    const fontEl = $("draw-dim-font");
    if (!sideEl || !fontEl) return;
    sideEl.innerHTML = "";
    const sides = isHorizontal ? dimStyle.SIDES_H : dimStyle.SIDES_V;
    sides.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s === "auto" ? "自動" : (s === "above" ? "上側" : s === "below" ? "下側" : s === "left" ? "左側" : "右側");
      sideEl.appendChild(opt);
    });
    fontEl.innerHTML = "";
    dimStyle.FONT_SIZES.forEach(function (mm) {
      const opt = document.createElement("option");
      opt.value = String(mm);
      opt.textContent = mm + " mm";
      fontEl.appendChild(opt);
    });
  }

  function show(selection) {
    if (!selection) { hide(); return; }
    current = selection;
    ensurePanel();
    fillSelects(!!selection.isHorizontal);
    const map = stylesMap();
    const st = dimStyle.getStyle(map, selection.viewKey, selection.direction, selection.isHorizontal);
    const title = $("draw-dim-inspector-title");
    const val = $("draw-dim-inspector-val");
    if (title) title.textContent = "寸法 " + (selection.directionLabel || selection.direction.toUpperCase());
    if (val) val.textContent = selection.valueText || "—";
    $("draw-dim-side").value = st.textSide || "auto";
    $("draw-dim-font").value = String(st.fontSizeMm || 3.5);
    $("draw-dim-gap").value = String(st.gapMm != null ? st.gapMm : 4);
    panel.classList.remove("hidden");
  }

  function hide() {
    current = null;
    if (panel) panel.classList.add("hidden");
  }

  window.v3DrawingDimInspector = {
    show: show,
    hide: hide,
  };
})();
