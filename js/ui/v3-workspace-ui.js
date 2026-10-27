// =========================================================
// CUI-3A/3B: ドッキングツールバー + 自由配置ポップアップ
// - Pointer Events / pointer capture
// - CUI-3B の CAD アイコンは v3-cad-toolbar.js が担当
// - 3D キャンバスへドラッグを渡さない
// =========================================================

(function () {
  const DRAG_THRESHOLD = 6;
  const DOCK_BAND = 40;
  const MARGIN = 8;
  const TOOLBAR_ID = "tools";
  const SIDE_W = 112;
  const EDGE_H = 56;
  const MIN_W = (window.v3LayoutStore && window.v3LayoutStore.MIN_W) || 64;
  const MAX_W = (window.v3LayoutStore && window.v3LayoutStore.MAX_W) || 196;
  const COL_WIDTHS = { 1: 64, 2: 112, 3: 160 };
  const COL_LABELS = { auto: "Auto", "1": "1 Column", "2": "2 Columns", "3": "3 Columns" };

  let state = window.v3LayoutStore ? window.v3LayoutStore.load() : null;
  let drag = null;
  let resize = null;
  let openPopupId = null;
  let popupApply = null;
  let popupCancel = null;

  function $(id) {
    return document.getElementById(id);
  }

  function northHeight() {
    const el = $("v3-north");
    return el ? el.getBoundingClientRect().height : 48;
  }

  function setDragging(on) {
    document.body.classList.toggle("v3-ui-dragging", !!on);
    window.__v3UiDragging = !!on;
    if (on && window.v3CadToolbar && typeof window.v3CadToolbar.hideTip === "function") {
      window.v3CadToolbar.hideTip();
    }
  }

  function resizeView() {
    if (typeof window.resizeV3View === "function") window.resizeV3View();
    else window.dispatchEvent(new Event("resize"));
  }

  function persist() {
    if (!window.v3LayoutStore) return state;
    const clean = window.v3LayoutStore.save(state);
    if (!clean) return state;
    Object.keys(clean).forEach(function (key) {
      state[key] = clean[key];
    });
    return state;
  }

  function slot(edge) {
    if (edge === "west") return $("v3-west");
    if (edge === "east") return $("v3-dock-east");
    if (edge === "north") return $("v3-dock-north");
    if (edge === "south") return $("v3-dock-south");
    return null;
  }

  function markSlots() {
    ["v3-west", "v3-dock-east", "v3-dock-north", "v3-dock-south"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const occupied = !!el.querySelector(".v3-toolbar");
      el.classList.toggle("v3-dock-empty", !occupied);
    });
  }

  function clampBox(x, y, w, h, keepVisiblePx) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const vis = keepVisiblePx || 0;
    const minX = vis ? MARGIN - Math.max(0, w - vis) : MARGIN;
    const minY = MARGIN;
    const maxX = vw - (vis ? Math.min(w, vis) : w) - MARGIN;
    const maxY = vh - (vis ? Math.min(h, vis) : h) - MARGIN;
    return {
      x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
    };
  }

  function clampPos(x, y, w, h) {
    return clampBox(x, y, w, h, 48);
  }

  function clampPopupBox(x, y, w, h) {
    return clampBox(x, y, w, h, 0);
  }

  function toolbarEl() {
    return $("v3-tb-tools");
  }

  function cadCols() {
    const pose = state && state.toolbars && state.toolbars.tools;
    const raw = pose && pose.cols != null ? String(pose.cols) : "auto";
    return COL_LABELS[raw] ? raw : "auto";
  }

  function minWidthForCols(cols) {
    if (cols === "1" || cols === "2" || cols === "3") return COL_WIDTHS[cols];
    return MIN_W;
  }

  function clampCadWidth(w, cols) {
    const min = minWidthForCols(cols || cadCols());
    const n = typeof w === "number" && Number.isFinite(w) ? Math.round(w) : SIDE_W;
    return Math.min(MAX_W, Math.max(min, n));
  }

  function currentCadWidth() {
    const pose = state && state.toolbars && state.toolbars.tools;
    return clampCadWidth(pose && pose.w, cadCols());
  }

  function resizeEdgeForPose(pose) {
    if (!pose) return "none";
    if (pose.mode === "float") return "right";
    if (pose.edge === "west") return "right";
    if (pose.edge === "east") return "left";
    return "none";
  }

  function applyCadWidth(w) {
    const pose = state.toolbars.tools;
    const next = clampCadWidth(w != null ? w : pose.w, cadCols());
    pose.w = next;
    document.documentElement.style.setProperty("--v3-cad-side-w", next + "px");
    document.documentElement.style.setProperty("--v3-west-w", next + "px");
    const tb = toolbarEl();
    if (!tb) return next;
    const vertical = tb.classList.contains("is-vertical") || tb.classList.contains("is-floating");
    if (vertical) {
      tb.style.width = next + "px";
      tb.style.maxWidth = "min(" + MAX_W + "px, calc(100vw - 24px))";
    } else {
      tb.style.width = "";
      tb.style.maxWidth = "";
    }
    return next;
  }

  function syncColsUi() {
    const cols = cadCols();
    const btn = $("v3-cad-cols-btn");
    if (btn) {
      btn.textContent = cols === "auto" ? "Auto" : cols;
      btn.title = "列数: " + (COL_LABELS[cols] || cols);
      btn.setAttribute("aria-label", "CAD列数 " + (COL_LABELS[cols] || cols));
    }
    document.querySelectorAll("[data-v3-cad-cols]").forEach((el) => {
      const on = el.getAttribute("data-v3-cad-cols") === cols;
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function setCadCols(cols) {
    const next = COL_LABELS[String(cols)] ? String(cols) : "auto";
    state.toolbars.tools.cols = next;
    if (next !== "auto") {
      const need = COL_WIDTHS[next];
      if (clampCadWidth(state.toolbars.tools.w, "auto") < need) {
        state.toolbars.tools.w = need;
      }
    }
    applyToolbar();
    persist();
    syncColsUi();
  }

  function setCadWidth(w, persistNow) {
    applyCadWidth(w);
    if (persistNow) persist();
    if (window.v3CadToolbar && typeof window.v3CadToolbar.onLayout === "function") {
      window.v3CadToolbar.onLayout();
    }
    resizeView();
  }

  function applyToolbar() {
    const tb = toolbarEl();
    const pose = state.toolbars.tools;
    const layer = $("v3-float-layer");
    if (!tb || !pose) return;

    tb.classList.remove("is-vertical", "is-horizontal", "is-floating", "is-dragging");
    tb.style.left = "";
    tb.style.top = "";

    if (pose.mode === "float") {
      if (layer) layer.appendChild(tb);
      tb.classList.add("is-floating", "is-vertical");
      applyCadWidth();
      const w = tb.offsetWidth || currentCadWidth();
      const h = tb.offsetHeight || 320;
      const c = clampPos(pose.x, pose.y, w, h);
      pose.x = c.x;
      pose.y = c.y;
      tb.style.left = c.x + "px";
      tb.style.top = c.y + "px";
    } else {
      const host = slot(pose.edge) || slot("west");
      if (host) host.appendChild(tb);
      const horiz = pose.edge === "north" || pose.edge === "south";
      tb.classList.add(horiz ? "is-horizontal" : "is-vertical");
      applyCadWidth();
    }
    tb.setAttribute("data-resize-edge", resizeEdgeForPose(pose));
    markSlots();
    syncColsUi();
    resizeView();
    requestAnimationFrame(function () {
      if (window.v3CadToolbar && typeof window.v3CadToolbar.onLayout === "function") {
        window.v3CadToolbar.onLayout();
      }
    });
  }

  function workspaceRect() {
    const north = northHeight();
    const panelOpen = document.body.classList.contains("v3-legacy-panel-open");
    const panelW = panelOpen ? 380 : 0;
    return {
      left: 0,
      top: north,
      right: window.innerWidth - panelW,
      bottom: window.innerHeight,
      width: window.innerWidth - panelW,
      height: window.innerHeight - north,
    };
  }

  function hitDockEdge(clientX, clientY) {
    const r = workspaceRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
      return null;
    }
    const dN = clientY - r.top;
    const dS = r.bottom - clientY;
    const dW = clientX - r.left;
    const dE = r.right - clientX;
    const nearest = Math.min(dN, dS, dW, dE);
    if (nearest > DOCK_BAND) return null;
    if (nearest === dN) return "north";
    if (nearest === dS) return "south";
    if (nearest === dW) return "west";
    return "east";
  }

  function layoutGhosts() {
    const box = workspaceRect();
    const map = {
      north: { left: box.left, top: box.top, width: box.width, height: EDGE_H },
      south: { left: box.left, top: box.bottom - EDGE_H, width: box.width, height: EDGE_H },
      west: { left: box.left, top: box.top, width: currentCadWidth(), height: box.height },
      east: { left: box.right - currentCadWidth(), top: box.top, width: currentCadWidth(), height: box.height },
    };
    document.querySelectorAll(".v3-dock-ghost").forEach((g) => {
      const m = map[g.getAttribute("data-edge")];
      if (!m) return;
      g.style.left = m.left + "px";
      g.style.top = m.top + "px";
      g.style.width = m.width + "px";
      g.style.height = m.height + "px";
    });
  }

  function showGhost(edge) {
    const host = $("v3-dock-previews");
    if (!host) return;
    host.hidden = !edge;
    document.querySelectorAll(".v3-dock-ghost").forEach((g) => {
      g.classList.toggle("is-active", g.getAttribute("data-edge") === edge);
    });
  }

  function isDragHandle(target, root, handleSelector) {
    if (!target || !root.contains(target)) return false;
    if (target.closest("input, textarea, select, option, button, a, [data-no-drag]")) return false;
    return !!target.closest(handleSelector);
  }

  function bindDrag(root, handleSelector, handlers) {
    root.addEventListener("pointerdown", (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      if (!isDragHandle(ev.target, root, handleSelector)) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const rect = root.getBoundingClientRect();
      drag = {
        pointerId: ev.pointerId,
        root,
        startX,
        startY,
        origX: rect.left,
        origY: rect.top,
        moved: false,
        edge: null,
        handlers,
      };
      try {
        root.setPointerCapture(ev.pointerId);
      } catch (e) {}
    });
  }

  function onPointerMove(ev) {
    if (resize && ev.pointerId === resize.pointerId) {
      const dx = ev.clientX - resize.startX;
      const signed = resize.edge === "left" ? -dx : dx;
      setCadWidth(resize.startW + signed, false);
      return;
    }
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      setDragging(true);
      if (drag.handlers.onStart) drag.handlers.onStart(drag);
    }
    if (drag.handlers.onMove) drag.handlers.onMove(drag, ev);
  }

  function finishResize(ev, cancelled) {
    if (!resize || (ev && ev.pointerId !== resize.pointerId)) return;
    const current = resize;
    resize = null;
    try {
      current.handle.releasePointerCapture(current.pointerId);
    } catch (e) {}
    setDragging(false);
    document.body.classList.remove("v3-ui-resizing");
    if (cancelled) {
      state.toolbars.tools.w = current.startW;
      applyToolbar();
    } else {
      persist();
    }
    resizeView();
  }

  function finishDrag(ev, cancelled) {
    if (resize) {
      finishResize(ev, cancelled);
      return;
    }
    if (!drag || (ev && ev.pointerId !== drag.pointerId)) return;
    const current = drag;
    drag = null;
    try {
      current.root.releasePointerCapture(current.pointerId);
    } catch (e) {}
    showGhost(null);
    setDragging(false);
    current.root.classList.remove("is-dragging");
    if (cancelled) {
      if (current.handlers.onCancel) current.handlers.onCancel(current);
    } else if (current.moved) {
      if (current.handlers.onEnd) current.handlers.onEnd(current, ev);
    }
  }

  function dockToolbar(edge) {
    state.toolbars.tools.mode = "dock";
    state.toolbars.tools.edge = edge;
    applyToolbar();
    persist();
  }

  function floatToolbar(x, y) {
    const tb = toolbarEl();
    const w = tb ? tb.offsetWidth : SIDE_W;
    const h = tb ? tb.offsetHeight : 320;
    const c = clampPos(x, y, w, h);
    state.toolbars.tools.mode = "float";
    state.toolbars.tools.x = c.x;
    state.toolbars.tools.y = c.y;
    applyToolbar();
    persist();
  }

  function bindToolbarResize() {
    const tb = toolbarEl();
    const handle = $("v3-tb-resize");
    if (!tb || !handle) return;
    handle.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      const pose = state.toolbars.tools;
      const edge = resizeEdgeForPose(pose);
      if (edge === "none") return;
      ev.preventDefault();
      ev.stopPropagation();
      resize = {
        pointerId: ev.pointerId,
        handle,
        startX: ev.clientX,
        startW: currentCadWidth(),
        edge,
      };
      try {
        handle.setPointerCapture(ev.pointerId);
      } catch (e) {}
      setDragging(true);
      document.body.classList.add("v3-ui-resizing");
    });
  }

  function closeColsMenu() {
    const menu = $("v3-cad-cols-menu");
    const btn = $("v3-cad-cols-btn");
    if (menu) menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function bindColsUi() {
    const btn = $("v3-cad-cols-btn");
    const menu = $("v3-cad-cols-menu");
    if (btn && menu) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const open = menu.classList.contains("hidden");
        menu.classList.toggle("hidden", !open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    document.querySelectorAll("[data-v3-cad-cols]").forEach((el) => {
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setCadCols(el.getAttribute("data-v3-cad-cols"));
        closeColsMenu();
        if (typeof window.v3NorthCloseMenus === "function") window.v3NorthCloseMenus();
      });
    });
    document.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest(".v3-cad-cols-wrap")) return;
      closeColsMenu();
    });
  }

  function bindToolbarDrag() {
    const tb = toolbarEl();
    if (!tb) return;
    bindDrag(tb, ".v3-tb-grip, .v3-tb-title", {
      onStart(d) {
        tb.classList.add("is-dragging", "is-floating", "is-vertical");
        tb.classList.remove("is-horizontal");
        const layer = $("v3-float-layer");
        if (layer && tb.parentElement !== layer) layer.appendChild(tb);
        layoutGhosts();
        const r = tb.getBoundingClientRect();
        tb.style.left = r.left + "px";
        tb.style.top = r.top + "px";
        d.origX = r.left;
        d.origY = r.top;
        markSlots();
      },
      onMove(d, ev) {
        const x = d.origX + (ev.clientX - d.startX);
        const y = d.origY + (ev.clientY - d.startY);
        const c = clampPos(x, y, tb.offsetWidth, tb.offsetHeight);
        tb.style.left = c.x + "px";
        tb.style.top = c.y + "px";
        d.edge = hitDockEdge(ev.clientX, ev.clientY);
        showGhost(d.edge);
      },
      onEnd(d) {
        if (d.edge) dockToolbar(d.edge);
        else {
          const r = tb.getBoundingClientRect();
          floatToolbar(r.left, r.top);
        }
      },
      onCancel() {
        applyToolbar();
      },
    });
  }

  function popupEl() {
    return $("v3-cmd-pop");
  }

  function clearExtraActions(actions) {
    const root = actions || (popupEl() && popupEl().querySelector(".v3-cmd-pop-actions"));
    if (!root) return;
    root.querySelectorAll("[data-extra-action]").forEach(function (btn) {
      btn.remove();
    });
  }

  function syncExtraActions(items) {
    const el = popupEl();
    const actions = el && el.querySelector(".v3-cmd-pop-actions");
    const cancelBtn = $("v3-cmd-pop-cancel");
    clearExtraActions(actions);
    if (!actions || !cancelBtn || !Array.isArray(items) || !items.length) return;
    items.forEach(function (item) {
      if (!item || !item.label) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-extra-action", "1");
      if (item.id) btn.id = item.id;
      btn.className = item.className || "";
      btn.textContent = item.label;
      if (item.title) btn.title = item.title;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof item.onClick === "function") item.onClick(ev);
      });
      actions.insertBefore(btn, cancelBtn);
    });
  }

  function clampPopup() {
    const el = popupEl();
    if (!el || el.classList.contains("hidden")) return;
    const c = clampPopupBox(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight);
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    if (openPopupId) {
      state.popups[openPopupId] = { x: c.x, y: c.y };
    }
  }

  function placeByAnchor(anchor, el) {
    const ar = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 280;
    const h = el.offsetHeight || 240;
    const gap = 10;
    const vw = window.innerWidth;
    const spots = {
      below: { x: ar.left, y: ar.bottom + gap },
      above: { x: ar.left, y: ar.top - h - gap },
      right: { x: ar.right + gap, y: ar.top },
      left: { x: ar.left - w - gap, y: ar.top },
    };
    const tb = toolbarEl();
    const host = tb && tb.parentElement ? tb.parentElement.id : "";
    const floating = !!(tb && tb.classList.contains("is-floating"));
    let order = ["below", "right", "left", "above"];
    if (host === "v3-dock-east") order = ["left", "above", "below", "right"];
    else if (host === "v3-dock-south") order = ["above", "right", "left", "below"];
    else if (host === "v3-west" || (floating && ar.left < vw / 2)) order = ["right", "below", "above", "left"];
    else if (floating) order = ["left", "below", "above", "right"];
    for (let i = 0; i < order.length; i++) {
      const c = spots[order[i]];
      if (c.x >= 8 && c.y >= 8 && c.x + w <= vw - 8 && c.y + h <= window.innerHeight - 8) {
        return c;
      }
    }
    return clampPopupBox(spots[order[0]].x, spots[order[0]].y, w, h);
  }

  function canvasTopRightPos(el) {
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 160;
    let top = northHeight() + 12;
    const dockN = $("v3-dock-north");
    if (dockN && !dockN.classList.contains("v3-dock-empty")) {
      top = Math.max(top, dockN.getBoundingClientRect().bottom + 12);
    }
    const tb = toolbarEl();
    if (tb && tb.classList.contains("is-horizontal") && !tb.classList.contains("is-floating")) {
      top = Math.max(top, tb.getBoundingClientRect().bottom + 12);
    }
    let right = window.innerWidth - 16;
    const east = $("v3-dock-east");
    if (east && !east.classList.contains("v3-dock-empty")) {
      right = Math.min(right, east.getBoundingClientRect().left - 12);
    }
    if (tb && !tb.classList.contains("is-floating")) {
      const r = tb.getBoundingClientRect();
      if (r.left > window.innerWidth * 0.55) right = Math.min(right, r.left - 12);
    }
    return clampPopupBox(right - w, top, w, h);
  }

  function setPopupPos(id, anchor) {
    const el = popupEl();
    if (!el) return;
    let x = 72;
    let y = northHeight() + 16;
    if (id === "length-add") {
      const saved = state.popups[id];
      if (saved) {
        x = saved.x;
        y = saved.y;
      } else {
        const pos = canvasTopRightPos(el);
        x = pos.x;
        y = pos.y;
      }
    } else if (anchor && anchor.getBoundingClientRect) {
      const near = placeByAnchor(anchor, el);
      x = near.x;
      y = near.y;
    } else {
      const saved = state.popups[id];
      const tb = toolbarEl();
      if (saved) {
        x = saved.x;
        y = saved.y;
      } else if (tb) {
        const r = tb.getBoundingClientRect();
        x = r.right + 12;
        y = r.top;
      }
    }
    const c = clampPopupBox(x, y, el.offsetWidth || 280, el.offsetHeight || 160);
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
    state.popups[id] = { x: c.x, y: c.y };
  }

  function closePopup(reason) {
    const el = popupEl();
    const id = openPopupId;
    if (!el) return;
    if (reason === "apply" && typeof popupApply === "function") {
      const ok = popupApply();
      if (ok === false) return id;
    }
    if ((reason === "cancel" || reason === "close") && typeof popupCancel === "function") popupCancel();
    el.classList.add("hidden");
    el.classList.remove("is-wide");
    el.classList.remove("is-compact");
    el.classList.remove("is-len-add");
    el.classList.remove("is-narrow");
    el.classList.remove("is-measure");
    el.classList.remove("is-minimized");
    el.classList.remove("is-estimate");
    const minBtn = $("v3-cmd-pop-min");
    if (minBtn) minBtn.hidden = true;
    el.style.width = "";
    el.querySelectorAll(".v3-len-resize").forEach(function (rz) {
      rz.hidden = true;
    });
    openPopupId = null;
    popupApply = null;
    popupCancel = null;
    const actions = el.querySelector(".v3-cmd-pop-actions");
    if (actions) actions.hidden = false;
    clearExtraActions(actions);
    const printBtn = $("v3-cmd-pop-print");
    if (printBtn) printBtn.hidden = true;
    const applyBtn = $("v3-cmd-pop-apply");
    const cancelBtn = $("v3-cmd-pop-cancel");
    if (applyBtn) {
      applyBtn.hidden = false;
      applyBtn.textContent = "適用";
    }
    if (cancelBtn) cancelBtn.textContent = "キャンセル";
    persist();
    if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") {
      window.v3CadToolbar.syncActive();
    }
    return id;
  }

  function openPopup(id, opts) {
    opts = opts || {};
    if (id === "leg-hint" || opts.title === "脚の切り替え") {
      try {
        if (typeof window.v3ForceLegToolMode === "function") window.v3ForceLegToolMode();
        else if (typeof window.v3SetToolMode === "function") window.v3SetToolMode("leg");
        else window.__V3_TOOL_MODE__ = "leg";
      } catch (e) {
        window.__V3_TOOL_MODE__ = "leg";
      }
      return;
    }
    const el = popupEl();
    if (!el) return;
    if (openPopupId && openPopupId !== id) closePopup("cancel");
    openPopupId = id;
    popupApply = opts.onApply || null;
    popupCancel = opts.onCancel || null;
    $("v3-cmd-pop-title").textContent = opts.title || "コマンド";
    const body = $("v3-cmd-pop-body");
    body.innerHTML = "";
    if (typeof opts.render === "function") opts.render(body);
    const applyBtn = $("v3-cmd-pop-apply");
    const cancelBtn = $("v3-cmd-pop-cancel");
    if (applyBtn) {
      applyBtn.hidden = !!opts.hideApply;
      applyBtn.textContent = opts.applyLabel || "適用";
    }
    if (cancelBtn) {
      cancelBtn.textContent = opts.hideApply
        ? (opts.cancelLabel || "閉じる")
        : (opts.cancelLabel || "キャンセル");
    }
    el.classList.toggle("is-wide", !!opts.wide);
    el.classList.toggle("is-compact", !!opts.compact);
    el.classList.toggle("is-len-add", id === "length-add");
    el.classList.toggle("is-measure", id === "measure");
    el.classList.toggle("is-estimate", id === "estimate");
    el.classList.remove("is-minimized");
    if (id !== "length-add") el.style.width = "";
    const minBtn = $("v3-cmd-pop-min");
    if (minBtn) {
      minBtn.hidden = !opts.minimizable;
      minBtn.textContent = "–";
      minBtn.title = "最小化";
      minBtn.setAttribute("aria-label", "最小化");
      minBtn.setAttribute("aria-pressed", "false");
    }
    const actions = el.querySelector(".v3-cmd-pop-actions");
    if (actions) actions.hidden = !!opts.hideActions;
    const printBtn = $("v3-cmd-pop-print");
    if (printBtn) {
      printBtn.hidden = id !== "estimate";
      printBtn.title = "見積書を確認して印刷します";
      if (id === "estimate" && typeof window.syncEstimatePrintButton === "function") {
        window.syncEstimatePrintButton();
      } else {
        printBtn.disabled = false;
        printBtn.removeAttribute("aria-disabled");
      }
    }
    syncExtraActions(opts.extraActions);
    el.classList.remove("hidden");
    setPopupPos(id, opts.anchor || null);
    if (!opts.skipFocus) {
      const first = body.querySelector("input, select, textarea, button");
      if (first) first.focus();
    }
    persist();
    if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") {
      window.v3CadToolbar.syncActive();
    }
  }

  function setPopupMinimized(on) {
    const el = popupEl();
    if (!el) return;
    const minimized = !!on;
    el.classList.toggle("is-minimized", minimized);
    const btn = $("v3-cmd-pop-min");
    if (btn) {
      btn.textContent = minimized ? "▢" : "–";
      btn.title = minimized ? "元に戻す" : "最小化";
      btn.setAttribute("aria-label", minimized ? "元に戻す" : "最小化");
      btn.setAttribute("aria-pressed", minimized ? "true" : "false");
    }
    if (openPopupId === "measure" && window.v3Measure && typeof window.v3Measure.setMinimized === "function") {
      window.v3Measure.setMinimized(minimized);
    }
    clampPopup();
  }

  function bindPopup() {
    const el = popupEl();
    if (!el) return;
    $("v3-cmd-pop-x").addEventListener("click", function (ev) {
      ev.preventDefault();
      closePopup("close");
    });
    const minBtn = $("v3-cmd-pop-min");
    if (minBtn) {
      minBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const el = popupEl();
        if (!el || minBtn.hidden) return;
        setPopupMinimized(!el.classList.contains("is-minimized"));
      });
    }
    const printBtn = $("v3-cmd-pop-print");
    if (printBtn) {
      printBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (printBtn.disabled) return;
        if (typeof window.sendToEstimate === "function") window.sendToEstimate(ev);
      });
    }
    $("v3-cmd-pop-cancel").addEventListener("click", function (ev) {
      ev.preventDefault();
      closePopup("cancel");
    });
    $("v3-cmd-pop-apply").addEventListener("click", function (ev) {
      ev.preventDefault();
      closePopup("apply");
    });

    bindDrag(el, ".v3-cmd-pop-titlebar", {
      onStart(d) {
        el.classList.add("is-dragging");
      },
      onMove(d, ev) {
        const x = d.origX + (ev.clientX - d.startX);
        const y = d.origY + (ev.clientY - d.startY);
        const c = clampPopupBox(x, y, el.offsetWidth, el.offsetHeight);
        el.style.left = c.x + "px";
        el.style.top = c.y + "px";
      },
      onEnd() {
        el.classList.remove("is-dragging");
        if (openPopupId) {
          state.popups[openPopupId] = { x: el.offsetLeft, y: el.offsetTop };
          persist();
        }
      },
      onCancel() {
        el.classList.remove("is-dragging");
        clampPopup();
      },
    });

    el.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closePopup("cancel");
        return;
      }
      if (openPopupId === "layers" || openPopupId === "cad-settings" || openPopupId === "estimate" || openPopupId === "length" || openPopupId === "length-add" || openPopupId === "measure") return;
      if (ev.key === "Enter" && ev.target && ev.target.tagName !== "TEXTAREA") {
        ev.preventDefault();
        closePopup("apply");
      }
    });
    window.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (openPopupId !== "layers" && openPopupId !== "cad-settings" && openPopupId !== "estimate" && openPopupId !== "length" && openPopupId !== "length-add" && openPopupId !== "measure") return;
      ev.preventDefault();
      ev.stopPropagation();
      closePopup("cancel");
    }, true);
  }

  function resetLayout() {
    closePopup("cancel");
    state = window.v3LayoutStore ? window.v3LayoutStore.reset() : state;
    applyToolbar();
    persist();
    if (typeof window.v3NorthCloseMenus === "function") window.v3NorthCloseMenus();
    if (typeof window.v3NorthApplyHeaderIcons === "function") window.v3NorthApplyHeaderIcons(true);
    if (window.v3CadToolbar && typeof window.v3CadToolbar.applyCadIcons === "function") {
      window.v3CadToolbar.applyCadIcons(true);
    } else if (window.v3CadToolbar && typeof window.v3CadToolbar.applyGroups === "function") {
      window.v3CadToolbar.applyGroups();
    }
    window.dispatchEvent(new CustomEvent("v3-layout-reset"));
  }

  function patchState(partial) {
    if (!partial || typeof partial !== "object") return state;
    Object.keys(partial).forEach((key) => {
      state[key] = partial[key];
    });
    persist();
    return state;
  }

  function setGroupOpen(id, open) {
    if (!state.groups) {
      state.groups = window.v3LayoutStore
        ? window.v3LayoutStore.defaultGroups()
        : {};
    }
    state.groups[id] = !!open;
    persist();
  }

  function bindChrome() {
    const resetBtn = $("v3-north-layout-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        resetLayout();
      });
    }
    window.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && (drag || resize)) {
        finishDrag(ev, true);
        return;
      }
      if (ev.ctrlKey && ev.altKey && (ev.key === "0" || ev.code === "Digit0")) {
        ev.preventDefault();
        resetLayout();
      }
    });
    window.addEventListener("resize", function () {
      layoutGhosts();
      if (state.toolbars.tools.mode === "float") applyToolbar();
      else if (window.v3CadToolbar && typeof window.v3CadToolbar.onLayout === "function") {
        window.v3CadToolbar.onLayout();
      }
      clampPopup();
      persist();
    });
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", function (ev) { finishDrag(ev, false); });
  document.addEventListener("pointercancel", function (ev) { finishDrag(ev, true); });

  if (!state) {
    state = window.v3LayoutStore
      ? window.v3LayoutStore.defaultState()
      : { v: 1, toolbars: { tools: { mode: "dock", edge: "north", x: 72, y: 96, w: SIDE_W, cols: "auto" } }, popups: {}, groups: {}, radial: {}, viewport: { showViewNav: true, radialEnabled: true }, layers: { frame: true, beam: true, pole: true, joint: true, leg: true, shelf: true, wall: true }, layerPanel: { open: false }, eastRail: { open: null, width: 280 } };
  }

  applyToolbar();
  bindToolbarDrag();
  bindToolbarResize();
  bindColsUi();
  bindPopup();
  bindChrome();

  window.v3WorkspaceUi = {
    getState() { return state; },
    applyToolbar,
    dockToolbar,
    floatToolbar,
    resetLayout,
    openPopup,
    closePopup,
    clampPopup,
    setPopupMinimized,
    getOpenPopupId() { return openPopupId; },
    setGroupOpen,
    setCadCols,
    setCadWidth,
    cadCols,
    currentCadWidth,
    persist,
    patchState,
  };
})();
