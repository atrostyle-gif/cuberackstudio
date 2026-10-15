// =========================================================
// CUI-3A: ドッキングツールバー + 自由配置ポップアップ
// - Pointer Events / pointer capture
// - 既存 Joint/Beam コマンドは移植しない（試作のみ）
// - 3D キャンバスへドラッグを渡さない
// =========================================================

(function () {
  const DRAG_THRESHOLD = 6;
  const DOCK_BAND = 40;
  const MARGIN = 8;
  const TOOLBAR_ID = "tools";
  const DEMO_POPUP_ID = "demo";

  let state = window.v3LayoutStore ? window.v3LayoutStore.load() : null;
  let drag = null;
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
  }

  function resizeView() {
    if (typeof window.resizeV3View === "function") window.resizeV3View();
    else window.dispatchEvent(new Event("resize"));
  }

  function persist() {
    if (window.v3LayoutStore) state = window.v3LayoutStore.save(state);
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
      tb.classList.add("is-floating", "is-horizontal");
      const w = tb.offsetWidth || 280;
      const h = tb.offsetHeight || 48;
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
    }
    markSlots();
    resizeView();
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
      north: { left: box.left, top: box.top, width: box.width, height: 48 },
      south: { left: box.left, top: box.bottom - 48, width: box.width, height: 48 },
      west: { left: box.left, top: box.top, width: 48, height: box.height },
      east: { left: box.right - 48, top: box.top, width: 48, height: box.height },
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

  function finishDrag(ev, cancelled) {
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
    const w = tb ? tb.offsetWidth : 280;
    const h = tb ? tb.offsetHeight : 48;
    const c = clampPos(x, y, w, h);
    state.toolbars.tools.mode = "float";
    state.toolbars.tools.x = c.x;
    state.toolbars.tools.y = c.y;
    applyToolbar();
    persist();
  }

  function bindToolbarDrag() {
    const tb = toolbarEl();
    if (!tb) return;
    bindDrag(tb, ".v3-tb-grip, .v3-tb-title", {
      onStart(d) {
        tb.classList.add("is-dragging", "is-floating", "is-horizontal");
        tb.classList.remove("is-vertical");
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

  function setPopupPos(id) {
    const el = popupEl();
    if (!el) return;
    const saved = state.popups[id];
    const tb = toolbarEl();
    let x = 72;
    let y = northHeight() + 16;
    if (saved) {
      x = saved.x;
      y = saved.y;
    } else if (tb) {
      const r = tb.getBoundingClientRect();
      x = r.right + 12;
      y = r.top;
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
    if (reason === "apply" && typeof popupApply === "function") popupApply();
    if ((reason === "cancel" || reason === "close") && typeof popupCancel === "function") popupCancel();
    el.classList.add("hidden");
    openPopupId = null;
    popupApply = null;
    popupCancel = null;
    const btn = $("v3-demo-cmd-btn");
    if (btn) {
      btn.classList.remove("is-on");
      btn.setAttribute("aria-expanded", "false");
      if (reason !== "apply") btn.focus();
    }
    persist();
    return id;
  }

  function openPopup(id, opts) {
    opts = opts || {};
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
    el.classList.remove("hidden");
    setPopupPos(id);
    const btn = $("v3-demo-cmd-btn");
    if (btn) {
      btn.classList.add("is-on");
      btn.setAttribute("aria-expanded", "true");
    }
    const first = body.querySelector("input, select, textarea, button");
    if (first) first.focus();
    persist();
  }

  function openDemoPopup() {
    if (openPopupId === DEMO_POPUP_ID) {
      closePopup("cancel");
      return;
    }
    openPopup(DEMO_POPUP_ID, {
      title: "試作コマンド",
      render(body) {
        const lab = document.createElement("label");
        lab.setAttribute("for", "v3-demo-input");
        lab.textContent = "試作値";
        const input = document.createElement("input");
        input.id = "v3-demo-input";
        input.type = "number";
        input.value = "100";
        const note = document.createElement("p");
        note.className = "v3-cmd-pop-note";
        note.textContent = "CUI-3A の動作確認用です。適用しても Joint / Beam などの既存データは変更しません。";
        body.appendChild(lab);
        body.appendChild(input);
        body.appendChild(note);
      },
      onApply() {},
      onCancel() {},
    });
  }

  function bindPopup() {
    const el = popupEl();
    if (!el) return;
    $("v3-cmd-pop-x").addEventListener("click", function (ev) {
      ev.preventDefault();
      closePopup("close");
    });
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
      if (ev.key === "Enter" && ev.target && ev.target.tagName !== "TEXTAREA") {
        ev.preventDefault();
        closePopup("apply");
      }
    });
  }

  function resetLayout() {
    closePopup("cancel");
    state = window.v3LayoutStore ? window.v3LayoutStore.reset() : state;
    applyToolbar();
    persist();
    const more = $("v3-north-more-menu");
    if (more) more.classList.add("hidden");
    const moreBtn = $("v3-north-more");
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
  }

  function bindChrome() {
    const demoBtn = $("v3-demo-cmd-btn");
    if (demoBtn) {
      demoBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        openDemoPopup();
      });
    }
    const resetBtn = $("v3-north-layout-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        resetLayout();
      });
    }
    window.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && drag) {
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
      clampPopup();
      persist();
    });
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", function (ev) { finishDrag(ev, false); });
  document.addEventListener("pointercancel", function (ev) { finishDrag(ev, true); });

  if (!state) state = { v: 1, toolbars: { tools: { mode: "dock", edge: "west", x: 72, y: 96 } }, popups: {} };

  applyToolbar();
  bindToolbarDrag();
  bindPopup();
  bindChrome();

  window.v3WorkspaceUi = {
    getState() { return state; },
    applyToolbar,
    dockToolbar,
    floatToolbar,
    resetLayout,
    openDemoPopup,
    closePopup,
    clampPopup,
  };
})();
