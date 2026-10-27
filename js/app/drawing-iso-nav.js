// =========================================================
// 図面1ページ目 3D完成イメージのマウス操作・視点切替
// マウスは 3D 領域内のみ。CAD シーンは opener 側で描画する。
// =========================================================
(function () {
  const PRESET_BTNS = [
    { id: "iso", label: "アイソメ" },
    { id: "front", label: "正面" },
    { id: "back", label: "背面" },
    { id: "left", label: "左側面" },
    { id: "right", label: "右側面" },
    { id: "top", label: "上面" },
    { id: "bottom", label: "下面" },
    { id: "fit", label: "フィット" },
  ];

  let overlay = null;
  let hit = null;
  let preview = null;
  let warn = null;
  let nav = null;
  let view = null;
  let viewsByPage = {};
  let activeIsoPageId = null;
  let isoRect = null;
  let pageActive = false;
  let printing = false;
  let dragging = null;
  let reqSeq = 0;
  let hqTimer = 0;
  let previewRaf = 0;
  let previewPending = false;
  let lastPointer = { x: 0, y: 0 };

  function $(id) { return document.getElementById(id); }

  function math() { return window.v3DrawingView; }

  let channel = null;
  try { channel = new BroadcastChannel("cuberack-drawing"); } catch (e) { channel = null; }

  function hasOpener() {
    try { if (window.opener && !window.opener.closed) return true; } catch (e) {}
    return !!channel;
  }

  function aspectOf() {
    if (!isoRect || isoRect.h < 1) return 1.6;
    return isoRect.w / isoRect.h;
  }

  function payload() {
    if (typeof window.__CR_getDrawingPayload === "function") return window.__CR_getDrawingPayload();
    return null;
  }

  let hqWait = null;

  function canLocal() {
    return !!(window.v3DrawingPreview && window.v3DrawingPreview.hasScene());
  }

  function persistActiveView(saveDoc) {
    if (!activeIsoPageId || !view) return;
    viewsByPage[activeIsoPageId] = view;
    const p = payload();
    if (!p) return;
    if (!p._isoViews) p._isoViews = {};
    p._isoViews[activeIsoPageId] = window.v3DrawingView && window.v3DrawingView.serialize
      ? window.v3DrawingView.serialize(view)
      : Object.assign({}, view);
    if (saveDoc && window.v3DrawingSheet && typeof window.v3DrawingSheet.persistDocument === "function") {
      window.v3DrawingSheet.persistDocument();
    }
  }

  function applyLocalView(next, live) {
    view = next;
    persistActiveView(!live);
    if (window.v3DrawingPreview) {
      window.v3DrawingPreview.setView(view);
      window.v3DrawingPreview.setInteracting(!!live);
      window.v3DrawingPreview.renderSoon();
      if (preview) preview.style.display = "none";
    }
    if (live) {
      if (!canLocal()) schedulePreview();
    } else {
      scheduleHigh();
    }
    setNavActive();
  }

  function applyCapture(image, nextView, overflow, quality) {
    if (nextView) view = nextView;
    if (warn) {
      warn.hidden = !overflow;
      warn.textContent = overflow ? "3D枠からはみ出しています（クリッピング）" : "";
    }
    if (quality === "preview") {
      if (preview && image) {
        preview.src = image;
        preview.style.display = "block";
      }
      return;
    }
    if (preview) preview.style.display = "none";
    if (typeof window.__CR_setCapture === "function" && image) {
      window.__CR_setCapture(image, nextView, overflow);
    }
    if (hqWait) {
      const done = hqWait;
      hqWait = null;
      done();
    }
    setNavActive();
  }

  function requestFrame(quality, action, extra) {
    if (!hasOpener()) return;
    const msg = Object.assign({
      type: "CUBERACK_DRAWING_VIEW",
      requestId: ++reqSeq,
      action: action || "capture",
      quality: quality || "high",
      view: view,
      aspect: aspectOf(),
      preset: extra && extra.preset,
    }, extra || {});
    let sent = false;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(msg, "*");
        sent = true;
      }
    } catch (e) {}
    if (channel) {
      try { channel.postMessage(msg); sent = true; } catch (e2) {}
    }
    if (!sent) return;
  }

  function schedulePreview() {
    previewPending = true;
    if (previewRaf) return;
    previewRaf = requestAnimationFrame(function () {
      previewRaf = 0;
      if (!previewPending) return;
      previewPending = false;
      requestFrame("preview", "capture");
    });
  }

  function scheduleHigh() {
    if (hqTimer) clearTimeout(hqTimer);
    hqTimer = setTimeout(function () {
      hqTimer = 0;
      requestFrame("high", "capture");
    }, 140);
  }

  function setNavActive() {
    if (!nav) return;
    const preset = view && view.preset;
    nav.querySelectorAll("[data-view]").forEach(function (btn) {
      const id = btn.getAttribute("data-view");
      const on = id === "fit" ? false : id === preset;
      btn.classList.toggle("is-on", on);
    });
  }

  function ensureView() {
    const m = math();
    if (view) return view;
    const p = payload();
    if (p && p.captures && p.captures.view) {
      view = p.captures.view;
      return view;
    }
    view = m ? m.defaultState(null, aspectOf()) : null;
    return view;
  }

  function applyLocal(next, live) {
    applyLocalView(next, live);
  }

  function hitSize() {
    if (!hit) return { w: 1, h: 1 };
    const br = hit.getBoundingClientRect();
    return { w: Math.max(1, br.width), h: Math.max(1, br.height) };
  }

  function onPointerDown(ev) {
    if (!pageActive || printing) return;
    if (ev.button !== 0 && ev.button !== 2) return;
    ensureView();
    dragging = {
      button: ev.button,
      shift: !!ev.shiftKey,
      x: ev.clientX,
      y: ev.clientY,
    };
    lastPointer = { x: ev.clientX, y: ev.clientY };
    hit.style.cursor = (ev.button === 2 || ev.shiftKey) ? "move" : "grabbing";
    try { hit.setPointerCapture(ev.pointerId); } catch (e) {}
    if (window.v3DrawingPreview) window.v3DrawingPreview.setInteracting(true);
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    const size = hitSize();
    const dx = ev.clientX - lastPointer.x;
    const dy = ev.clientY - lastPointer.y;
    lastPointer = { x: ev.clientX, y: ev.clientY };
    const m = math();
    if (!m || !view) return;
    const pan = dragging.button === 2 || dragging.shift || ev.shiftKey;
    if (pan) applyLocal(m.pan(view, dx, dy, size.w, size.h), true);
    else if (dragging.button === 0) applyLocal(m.orbit(view, dx, dy, size.w, size.h), true);
    ev.preventDefault();
  }

  function onPointerUp(ev) {
    if (!dragging) return;
    dragging = null;
    hit.style.cursor = "grab";
    try { hit.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (window.v3DrawingPreview) window.v3DrawingPreview.setInteracting(false);
    persistActiveView(true);
    scheduleHigh();
    ev.preventDefault();
  }

  function onWheel(ev) {
    if (!pageActive || printing) return;
    ensureView();
    const m = math();
    if (!m || !view) return;
    applyLocal(m.zoomBy(view, ev.deltaY), true);
    scheduleHigh();
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onDblClick(ev) {
    if (!pageActive || printing) return;
    const m = math();
    view = m ? m.applyPreset("iso", null, aspectOf(), view) : view;
    requestFrame("high", "reset", { preset: "iso" });
    setNavActive();
    ev.preventDefault();
  }

  function onContext(ev) {
    if (!pageActive) return;
    ev.preventDefault();
  }

  function goPreset(id) {
    ensureView();
    const m = math();
    if (id === "fit") {
      view = m ? m.fitKeepAngle(view, null, aspectOf()) : view;
      if (window.v3DrawingPreview) {
        window.v3DrawingPreview.setView(view);
        window.v3DrawingPreview.renderSoon();
      }
      requestFrame("high", "fit");
    } else {
      view = m ? m.applyPreset(id, null, aspectOf(), view) : view;
      if (window.v3DrawingPreview) {
        window.v3DrawingPreview.setView(view);
        window.v3DrawingPreview.renderSoon();
      }
      requestFrame("high", "preset", { preset: id });
    }
    setNavActive();
  }

  function layout(rect, active) {
    isoRect = rect;
    pageActive = !!active && !printing;
    if (!overlay || !hit) return;
    overlay.style.display = pageActive ? "block" : "none";
    if (nav) nav.style.display = pageActive ? "flex" : "none";
    if (!rect) return;
    overlay.style.left = rect.x + "px";
    overlay.style.top = rect.y + "px";
    overlay.style.width = rect.w + "px";
    overlay.style.height = rect.h + "px";
    if (window.v3DrawingPreview) window.v3DrawingPreview.renderSoon();
  }

  function storedViewFor(pageId) {
    const p = payload();
    const raw = (p && p._isoViews && p._isoViews[pageId]) || viewsByPage[pageId] || null;
    const m = math();
    if (!raw || !m) return null;
    if (raw.theta != null || (raw.target && typeof raw.target === "object")) {
      return m.normalize(raw, null, aspectOf());
    }
    return null;
  }

  function syncPage(pageMeta) {
    if (activeIsoPageId && view) persistActiveView();
    const nextId = pageMeta && pageMeta.kind === "iso" ? pageMeta.pageId : null;
    activeIsoPageId = nextId;
    if (nextId) {
      view = storedViewFor(nextId);
      if (!view) ensureView();
      viewsByPage[nextId] = view;
      if (window.v3DrawingPreview && view) window.v3DrawingPreview.setView(view);
      setNavActive();
    }
    layout(isoRect, !!(pageMeta && pageMeta.kind === "iso"));
  }

  function setPrint(on) {
    printing = !!on;
    if (overlay) overlay.style.display = printing || !pageActive ? "none" : "block";
    if (nav) nav.style.display = printing || !pageActive ? "none" : "flex";
    if (window.v3DrawingPreview && typeof window.v3DrawingPreview.setPrint === "function") {
      window.v3DrawingPreview.setPrint(printing);
    }
  }

  function captureHighForPrint() {
    return new Promise(function (resolve) {
      let settled = false;
      function done() {
        if (settled) return;
        settled = true;
        hqWait = null;
        resolve();
      }
      hqWait = done;
      requestFrame("high", "capture");
      setTimeout(done, 1400);
    });
  }

  function onPaperChange() {
    if (!pageActive) return;
    ensureView();
    if (view) view.aspect = aspectOf();
    scheduleHigh();
  }

  function buildNav() {
    nav = $("iso-view-nav");
    if (!nav || nav.getAttribute("data-ready") === "1") return;
    nav.setAttribute("data-ready", "1");
    PRESET_BTNS.forEach(function (item) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "iso-view-btn";
      btn.setAttribute("data-view", item.id);
      btn.textContent = item.label;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        goPreset(item.id);
      });
      nav.appendChild(btn);
    });
  }

  function buildOverlay() {
    const stage = $("draw-stage");
    if (!stage) return;
    overlay = $("draw-iso-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "draw-iso-overlay";
      stage.appendChild(overlay);
    }
    overlay.innerHTML = "";
    if (window.v3DrawingPreview && typeof window.v3DrawingPreview.attach === "function") {
      window.v3DrawingPreview.attach(overlay);
    }
    preview = document.createElement("img");
    preview.id = "draw-iso-preview";
    preview.alt = "";
    overlay.appendChild(preview);
    hit = document.createElement("div");
    hit.id = "draw-iso-hit";
    hit.title = "左ドラッグで回転 / Shift+左ドラッグまたは右ドラッグで移動 / ホイールで拡大縮小 / ダブルクリックでフィット";
    overlay.appendChild(hit);
    warn = document.createElement("div");
    warn.id = "draw-iso-warn";
    warn.hidden = true;
    overlay.appendChild(warn);
    hit.addEventListener("pointerdown", onPointerDown);
    hit.addEventListener("pointermove", onPointerMove);
    hit.addEventListener("pointerup", onPointerUp);
    hit.addEventListener("pointercancel", onPointerUp);
    hit.addEventListener("wheel", onWheel, { passive: false });
    hit.addEventListener("dblclick", onDblClick);
    hit.addEventListener("contextmenu", onContext);
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.attachLegendStamp === "function") {
      window.v3DrawingSheet.attachLegendStamp();
    }
  }

  function onFrame(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type !== "CUBERACK_DRAWING_FRAME") return;
    if (msg.requestId && msg.requestId < reqSeq - 2 && msg.quality === "preview") return;
    applyCapture(msg.image, msg.view, msg.overflow, msg.quality);
  }

  window.addEventListener("message", function (ev) { onFrame(ev.data); });
  if (channel) channel.onmessage = function (ev) { onFrame(ev.data); };

  function bind() {
    buildNav();
    buildOverlay();
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.isoRect === "function") {
      const st = window.v3DrawingSheet.state;
      const ap = window.v3DrawingSheet.activePage && window.v3DrawingSheet.activePage();
      layout(window.v3DrawingSheet.isoRect(), !!(ap && ap.kind === "iso" && st && !st.legacyView));
    }
  }

  window.v3DrawingIsoNav = {
    layout: layout,
    syncPage: syncPage,
    setPrint: setPrint,
    onPaperChange: onPaperChange,
    getView: function () { return view; },
    activePageId: function () { return activeIsoPageId; },
    setView: function (v) {
      view = v;
      persistActiveView(true);
      if (window.v3DrawingPreview) window.v3DrawingPreview.setView(view);
      setNavActive();
    },
    seedIfEmpty: function (v) {
      if (view || (activeIsoPageId && viewsByPage[activeIsoPageId])) return;
      view = v;
      persistActiveView(false);
      if (window.v3DrawingPreview) window.v3DrawingPreview.setView(view);
      setNavActive();
    },
    captureHighForPrint: captureHighForPrint,
    canLocal: canLocal,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
