// =========================================================
// 図面2ページ目 正投影ビューの独立パン・ズーム・視点切替
// 自由回転はしない。セッション中のみ保持。
// =========================================================
(function () {
  const SLOT = "active";
  let activePageId = null;
  const PRESET_BTNS = [
    { id: "front", label: "正" },
    { id: "back", label: "背" },
    { id: "left", label: "左" },
    { id: "right", label: "右" },
    { id: "top", label: "上" },
    { id: "bottom", label: "下" },
  ];
  let overlay = null;
  let slots = {};
  let states = {};
  let rects = null;
  let pageActive = false;
  let printing = false;
  let dragging = null;
  let lastPointer = { x: 0, y: 0 };

  function $(id) { return document.getElementById(id); }
  function math() { return window.v3DrawingView; }

  function defaultState(mode) {
    const m = math();
    const id = mode || "front";
    return m ? m.orthoDefault(id) : { mode: id, panU: 0, panV: 0, zoom: 1 };
  }

  function ensureState(pageId, mode) {
    const k = pageId || SLOT;
    if (!states[k]) states[k] = defaultState(mode || "front");
    return states[k];
  }

  function clampStatesToPages() {
    const p = payload();
    const doc = p && p.drawingDocument;
    if (!doc || !Array.isArray(doc.pages)) return;
    doc.pages.forEach(function (pg) {
      if (pg.kind === "ortho" && pg.id && states[pg.id]) {
        states[pg.id].mode = pg.orthoMode || "front";
      }
    });
  }

  function payload() {
    if (typeof window.__CR_getDrawingPayload === "function") return window.__CR_getDrawingPayload();
    return null;
  }

  function applyToPayload() {
    const p = payload();
    if (!p) return;
    if (!p._orthoSlots) p._orthoSlots = {};
    Object.keys(states).forEach(function (k) {
      if (k === SLOT && k !== activePageId) return;
      p._orthoSlots[k] = Object.assign({}, states[k]);
    });
  }

  function redraw() {
    applyToPayload();
    if (typeof window.__CR_drawingRedraw === "function") window.__CR_drawingRedraw();
    syncButtons();
  }

  function pxPerMmOf(rect) {
    if (!rect || rect.h < 1) return 1;
    return Math.max(0.2, (rect.h - 80) / 800);
  }

  function hitSize(el) {
    const br = el.getBoundingClientRect();
    return { w: Math.max(1, br.width), h: Math.max(1, br.height) };
  }

  function layoutSlot(rect) {
    const node = slots[SLOT];
    if (!node || !rect) return;
    node.root.style.left = rect.x + "px";
    node.root.style.top = rect.y + "px";
    node.root.style.width = rect.w + "px";
    node.root.style.height = rect.h + "px";
    node.root.style.display = pageActive && !printing ? "block" : "none";
    if (node.nav) node.nav.style.display = "none";
    syncGl(rect);
  }

  function syncGl(rect) {
    if (!pageActive || printing) return;
    const preview = window.v3DrawingPreview;
    if (!preview || typeof preview.attachOrtho !== "function") return;
    const node = slots[SLOT];
    if (!node) return;
    preview.attachOrtho(SLOT, node.root);
    const p = payload();
    const st = ensureState(activePageId, rects && rects.mode);
    const m = math();
    if (!p || !rect || !m || typeof m.orthoFrame !== "function") return;
    const metrics = window.__CR_orthoViewMetrics
      ? window.__CR_orthoViewMetrics(p, st.mode, rect, activePageId || SLOT)
      : null;
    const uv = metrics
      ? { minU: metrics.minU, maxU: metrics.maxU, minV: metrics.minV, maxV: metrics.maxV }
      : { minU: 0, maxU: 1, minV: 0, maxV: 1 };
    const ppm = metrics ? metrics.pxPerMmReal : pxPerMmOf(rect);
    const box = p.preview && p.preview.box;
    const frame = m.orthoFrame(st, box, rect, ppm, uv);
    preview.setOrthoFrame(SLOT, frame);
  }

  function layout(nextRects, active) {
    if (nextRects && nextRects.active) {
      const pageMode = (activePageId && states[activePageId] && states[activePageId].mode)
        || nextRects.mode;
      rects = {
        pageId: activePageId || nextRects.pageId,
        active: nextRects.active,
        mode: pageMode,
      };
    }
    pageActive = !!active && !printing;
    if (!overlay) return;
    overlay.style.display = pageActive ? "block" : "none";
    layoutSlot(rects && rects.active);
  }

  function syncPage(pageMeta, orthoRects) {
    const isOrtho = !!(pageMeta && pageMeta.kind === "ortho");
    activePageId = isOrtho && pageMeta.pageId ? pageMeta.pageId : null;
    const want = isOrtho ? (pageMeta.orthoMode || (orthoRects && orthoRects.mode) || "front") : null;
    if (orthoRects && orthoRects.active) {
      rects = {
        pageId: activePageId,
        active: orthoRects.active,
        mode: want || orthoRects.mode,
      };
    } else if (rects && want) {
      rects = Object.assign({}, rects, { pageId: activePageId, mode: want });
    }
    pageActive = !!(isOrtho && rects && rects.active);
    const p = payload();
    if (p && p._orthoSlots) {
      Object.keys(p._orthoSlots).forEach(function (k) {
        if (p._orthoSlots[k]) states[k] = Object.assign({}, p._orthoSlots[k]);
      });
    }
    clampStatesToPages();
    if (pageActive && activePageId) {
      const st = ensureState(activePageId, want);
      if (want) st.mode = want;
    }
    if (!overlay) return;
    overlay.style.display = pageActive && !printing ? "block" : "none";
    layoutSlot(rects && rects.active);
  }

  function setPrint(on) {
    printing = !!on;
    if (overlay) overlay.style.display = printing || !pageActive ? "none" : "block";
  }

  function onPaperChange() {
    if (!pageActive) return;
    redraw();
  }

  function canvasXY(ev) {
    if (typeof window.__CR_pageCanvasPoint === "function") return window.__CR_pageCanvasPoint(ev.clientX, ev.clientY);
    return { x: ev.clientX, y: ev.clientY };
  }

  function paperDelta(dxClient, dyClient) {
    const rect = rects && rects.active;
    const hit = slots[SLOT] && slots[SLOT].hit;
    if (!rect || !hit) return { x: dxClient, y: dyClient };
    const br = hit.getBoundingClientRect();
    const sx = br.width > 0 ? rect.w / br.width : 1;
    const sy = br.height > 0 ? rect.h / br.height : 1;
    return { x: dxClient * sx, y: dyClient * sy };
  }

  function modelPpm() {
    const rect = rects && rects.active;
    const p = payload();
    const st = ensureState(activePageId, rects && rects.mode);
    const metrics = window.__CR_orthoViewMetrics && rect
      ? window.__CR_orthoViewMetrics(p, st.mode, rect, activePageId || SLOT)
      : null;
    return metrics && metrics.pxPerMmReal > 0 ? metrics.pxPerMmReal : pxPerMmOf(rect);
  }

  function uvBounds() {
    const rect = rects && rects.active;
    const p = payload();
    const st = ensureState(activePageId, rects && rects.mode);
    const metrics = window.__CR_orthoViewMetrics && rect
      ? window.__CR_orthoViewMetrics(p, st.mode, rect, activePageId || SLOT)
      : null;
    if (!metrics) return { minU: 0, maxU: 1, minV: 0, maxV: 1 };
    return { minU: metrics.minU, maxU: metrics.maxU, minV: metrics.minV, maxV: metrics.maxV };
  }

  function onPointerDown(ev) {
    const slot = SLOT;
    if (!pageActive || printing) return;
    if (ev.button !== 0) return;
    const pt = canvasXY(ev);
    const dimHit = !ev.shiftKey && window.__CR_hitDimLine ? window.__CR_hitDimLine(pt.x, pt.y, payload()) : null;
    const hit = slots[slot] && slots[slot].hit;
    if (dimHit && window.__CR_beginDimDrag) {
      dragging = { type: "dim", slot: slot, horizontal: dimHit.isHorizontal };
      window.__CR_beginDimDrag(dimHit, pt.x, pt.y);
      if (hit) {
        hit.style.cursor = dimHit.isHorizontal ? "ns-resize" : "ew-resize";
        try { hit.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    dragging = { type: "pan", slot: slot, x: ev.clientX, y: ev.clientY };
    lastPointer = { x: ev.clientX, y: ev.clientY };
    if (hit) {
      hit.style.cursor = "grabbing";
      try { hit.setPointerCapture(ev.pointerId); } catch (e) {}
    }
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onPointerMove(ev) {
    const slot = SLOT;
    if (dragging && dragging.type === "dim") {
      const pt = canvasXY(ev);
      if (window.__CR_moveDimDrag) window.__CR_moveDimDrag(pt.x, pt.y);
      ev.preventDefault();
      return;
    }
    if (!dragging || dragging.type !== "pan" || dragging.slot !== slot) {
      if (!dragging) {
        const pt = canvasXY(ev);
        const dimHit = window.__CR_hoverDimLine ? window.__CR_hoverDimLine(pt.x, pt.y, payload()) : null;
        const hit = slots[slot] && slots[slot].hit;
        if (hit) hit.style.cursor = dimHit ? (dimHit.isHorizontal ? "ns-resize" : "ew-resize") : "grab";
      }
      return;
    }
    const m = math();
    const st = ensureState(activePageId, rects && rects.mode);
    const dClient = { x: ev.clientX - lastPointer.x, y: ev.clientY - lastPointer.y };
    lastPointer = { x: ev.clientX, y: ev.clientY };
    const d = paperDelta(dClient.x, dClient.y);
    const ppm = modelPpm();
    states[activePageId || SLOT] = m ? m.orthoPan(st, d.x, d.y, ppm) : st;
    redraw();
    ev.preventDefault();
  }

  function onPointerUp(ev) {
    const slot = SLOT;
    if (dragging && dragging.type === "dim") {
      if (window.__CR_endDimDrag) window.__CR_endDimDrag();
      dragging = null;
      const hit = slots[slot] && slots[slot].hit;
      if (hit) {
        hit.style.cursor = "grab";
        try { hit.releasePointerCapture(ev.pointerId); } catch (e) {}
      }
      ev.preventDefault();
      return;
    }
    if (!dragging || dragging.slot !== slot) return;
    dragging = null;
    const hit = slots[slot] && slots[slot].hit;
    if (hit) {
      hit.style.cursor = "grab";
      try { hit.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    ev.preventDefault();
  }

  function onWheel(ev) {
    if (!pageActive || printing) return;
    const m = math();
    const st = ensureState(activePageId, rects && rects.mode);
    const rect = rects && rects.active;
    const pt = canvasXY(ev);
    const ppm = modelPpm();
    const uv = uvBounds();
    const cu = (uv.minU + uv.maxU) * 0.5;
    const cv = (uv.minV + uv.maxV) * 0.5;
    const zoom = Math.max(0.001, st.zoom || 1);
    const cx = rect ? rect.x + rect.w / 2 : pt.x;
    const cy = rect ? rect.y + rect.h / 2 : pt.y;
    const keep = {
      u: cu + (st.panU || 0) + (pt.x - cx) / (ppm * zoom),
      v: cv + (st.panV || 0) + (pt.y - cy) / (ppm * zoom),
    };
    states[activePageId || SLOT] = m && typeof m.orthoZoomAt === "function"
      ? m.orthoZoomAt(st, ev.deltaY, keep, cu, cv)
      : (m ? m.orthoZoom(st, ev.deltaY) : st);
    redraw();
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onDblClick(ev) {
    const slot = SLOT;
    if (!pageActive || printing) return;
    const m = math();
    const st = ensureState(activePageId, rects && rects.mode);
    states[activePageId || SLOT] = m ? m.orthoFit(st) : st;
    redraw();
    ev.preventDefault();
  }

  function syncButtons() {}

  function buildSlot() {
    const slot = SLOT;
    const root = document.createElement("div");
    root.className = "draw-ortho-slot";
    root.setAttribute("data-slot", slot);
    const nav = document.createElement("div");
    nav.className = "draw-ortho-nav";
    PRESET_BTNS.forEach(function (item) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "draw-ortho-btn";
      btn.setAttribute("data-ortho-view", item.id);
      btn.textContent = item.label;
      btn.title = item.id;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
      });
      nav.appendChild(btn);
    });
    const hit = document.createElement("div");
    hit.className = "draw-ortho-hit";
    hit.title = "左ドラッグで移動 / 寸法線ドラッグで位置調整 / ホイールで拡大縮小 / ダブルクリックでフィット";
    hit.addEventListener("pointerdown", onPointerDown);
    hit.addEventListener("pointermove", onPointerMove);
    hit.addEventListener("pointerup", onPointerUp);
    hit.addEventListener("pointercancel", onPointerUp);
    hit.addEventListener("wheel", onWheel, { passive: false });
    hit.addEventListener("dblclick", onDblClick);
    hit.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    root.appendChild(hit);
    root.appendChild(nav);
    overlay.appendChild(root);
    slots[slot] = { root: root, hit: hit, nav: nav };
    ensureState(SLOT, "front");
  }

  function build() {
    const stage = $("draw-stage");
    if (!stage) return;
    overlay = $("draw-ortho-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "draw-ortho-overlay";
      stage.appendChild(overlay);
    }
    overlay.innerHTML = "";
    slots = {};
    buildSlot();
    syncButtons();
  }

  window.v3DrawingOrthoNav = {
    layout: layout,
    syncPage: syncPage,
    setPrint: setPrint,
    onPaperChange: onPaperChange,
    getStates: function () { return states; },
    activePageId: function () { return activePageId; },
    overlayMode: function () {
      return (activePageId && states[activePageId] && states[activePageId].mode)
        || (rects && rects.mode)
        || null;
    },
    setStates: function (next) {
      states = next || states;
      redraw();
    },
    captureStamps: function () {
      const out = {};
      const preview = window.v3DrawingPreview;
      if (!preview || typeof preview.captureOrtho !== "function") return out;
      out[SLOT] = preview.captureOrtho(SLOT);
      return out;
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
