// =========================================================
// CUI-2: NORTH 操作バー
// - 新アイコンは既存 ID / 既存関数へ委譲する（処理の二重実装なし）
// - .click() と関数呼び出しを同時に行わない
// - 共同編集は自動開始しない
// - UI 非表示 ≠ 認証
// =========================================================

(function () {
  let dispatching = false;
  let saveBusy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function clickLegacy(selector) {
    if (dispatching) return;
    if (!selector) return;
    const el = selector.charAt(0) === "#"
      ? $(selector.slice(1))
      : document.querySelector(selector);
    if (!el) return;
    dispatching = true;
    try {
      el.click();
    } finally {
      dispatching = false;
    }
  }

  function wrapFn(name, after) {
    const orig = window[name];
    if (typeof orig !== "function" || orig.__v3NorthWrapped) return;
    const wrapped = function () {
      const result = orig.apply(this, arguments);
      if (typeof after === "function") after();
      return result;
    };
    wrapped.__v3NorthWrapped = true;
    window[name] = wrapped;
  }

  function syncProjectName() {
    const el = $("v3-north-project");
    if (!el) return;
    const name = window.currentFileName || "未保存のデザイン";
    const text = window.isDirty ? `${name} *` : name;
    el.textContent = text;
    el.title = `プロジェクト名: ${text}`;
  }

  function formatTotalFromLegacy() {
    const src = $("total");
    const dst = $("v3-north-total");
    if (!dst) return;
    const raw = ((src && src.textContent) || "").trim() || "合計：0 円";
    let text;
    if (window.currentEstimateIncomplete === true || raw.indexOf("算出不可") >= 0) {
      text = "合計 算出不可";
    } else {
      const m = raw.match(/合計：\s*([0-9,]+)\s*円/);
      text = m ? "合計 " + m[1] + " 円" : raw.replace("：", " ");
    }
    const label = $("v3-north-total-text");
    if (label) label.textContent = text;
    else dst.textContent = text;
    dst.title = "見積明細を表示";
    dst.setAttribute("aria-label", "見積明細 " + text);
  }

  function canUndo() {
    return Number(window.historyIndex) > 0;
  }

  function canRedo() {
    const list = window.history;
    if (!list || typeof list.length !== "number") return false;
    return Number(window.historyIndex) < list.length - 1;
  }

  function syncHistoryButtons() {
    const undoBtn = $("v3-north-undo");
    const redoBtn = $("v3-north-redo");
    const undoOk = canUndo();
    const redoOk = canRedo();
    if (undoBtn) {
      undoBtn.disabled = !undoOk;
      undoBtn.setAttribute("aria-disabled", undoOk ? "false" : "true");
    }
    if (redoBtn) {
      redoBtn.disabled = !redoOk;
      redoBtn.setAttribute("aria-disabled", redoOk ? "false" : "true");
    }
  }

  function setSaveBusy(on) {
    saveBusy = !!on;
    ["v3-north-save", "v3-north-save-as"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.disabled = saveBusy;
      btn.setAttribute("aria-busy", saveBusy ? "true" : "false");
    });
  }

  function setSaveStatus(kind) {
    const saveBtn = $("v3-north-save");
    const saveAsBtn = $("v3-north-save-as");
    const msg = kind === "busy" ? "保存中…"
      : kind === "ok" ? "保存しました"
      : kind === "fail" ? "保存に失敗しました"
      : "";
    if (saveBtn) {
      saveBtn.title = msg || "保存";
      saveBtn.setAttribute("aria-label", msg || "保存");
    }
    if (saveAsBtn && kind !== "idle") {
      saveAsBtn.title = msg || "別名保存";
    }
    if (kind === "idle" && saveAsBtn) {
      saveAsBtn.title = "別名保存";
      saveAsBtn.setAttribute("aria-label", "別名保存");
    }
  }

  function runExistingSave(fn) {
    if (saveBusy || typeof fn !== "function") return;
    setSaveBusy(true);
    setSaveStatus("busy");
    Promise.resolve(fn())
      .then(function (status) {
        if (status === "fail") setSaveStatus("fail");
        else if (status === "abort") setSaveStatus("idle");
        else setSaveStatus("ok");
      })
      .catch(function () {
        setSaveStatus("fail");
      })
      .finally(function () {
        setSaveBusy(false);
        syncProjectName();
        setTimeout(function () {
          if (!saveBusy) setSaveStatus("idle");
        }, 1800);
      });
  }

  function syncStaffState() {
    const btn = $("v3-staff-entry-btn");
    if (!btn) return;
    const on = typeof window.isCubeRackStaffMode === "function" && window.isCubeRackStaffMode();
    btn.classList.toggle("is-staff", !!on);
    const label = on ? "STAFFモード（ログイン済み）" : "STAFFログイン";
    btn.setAttribute("title", label);
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  const NORTH_MENUS = [
    { btn: "v3-north-view", menu: "v3-north-view-menu" },
    { btn: "v3-north-more", menu: "v3-north-more-menu" },
  ];

  function closeMenus() {
    NORTH_MENUS.forEach(function (pair) {
      const menu = $(pair.menu);
      const btn = $(pair.btn);
      if (menu) {
        menu.classList.add("hidden");
        menu.style.transform = "";
        menu.style.top = "";
        menu.style.bottom = "";
      }
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function menuItems(menu) {
    return Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
  }

  function placeMenu(menu) {
    if (!menu) return;
    menu.style.transform = "none";
    menu.style.top = "calc(100% + 6px)";
    menu.style.bottom = "auto";
    menu.style.right = "0";
    menu.style.left = "auto";
    const r = menu.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let tx = 0;
    let ty = 0;
    if (r.right > vw - pad) tx = (vw - pad) - r.right;
    if (r.left + tx < pad) tx = pad - r.left;
    if (r.bottom > vh - pad) {
      const wrap = menu.parentElement ? menu.parentElement.getBoundingClientRect() : r;
      if (wrap.top - 6 - r.height >= pad) {
        menu.style.top = "auto";
        menu.style.bottom = "calc(100% + 6px)";
      } else {
        ty = (vh - pad) - r.bottom;
      }
    }
    menu.style.transform = "translate(" + Math.round(tx) + "px," + Math.round(ty) + "px)";
  }

  function toggleMenu(btnId, menuId) {
    const btn = $(btnId);
    const menu = $(menuId);
    if (!btn || !menu) return;
    const willOpen = menu.classList.contains("hidden");
    closeMenus();
    if (willOpen) {
      menu.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      placeMenu(menu);
      const items = menuItems(menu);
      if (items[0]) items[0].focus();
    } else {
      btn.focus();
    }
  }

  function bindFileAndHistory() {
    const newBtn = $("v3-north-new");
    const openBtn = $("v3-north-open");
    const saveBtn = $("v3-north-save");
    const saveAsBtn = $("v3-north-save-as");
    const undoBtn = $("v3-north-undo");
    const redoBtn = $("v3-north-redo");

    if (newBtn) {
      newBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof window.newDesign === "function") {
          window.newDesign();
          return;
        }
        clickLegacy("#reset-btn");
      });
    }

    if (openBtn) {
      openBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof window.openDesignFromFilePicker === "function") {
          window.openDesignFromFilePicker();
          return;
        }
        clickLegacy("#load-design-btn");
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof window.saveDesignOverwrite === "function") {
          runExistingSave(window.saveDesignOverwrite);
          return;
        }
        clickLegacy("#save-design-btn");
      });
    }

    if (saveAsBtn) {
      saveAsBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof window.saveDesignAs === "function") {
          runExistingSave(window.saveDesignAs);
          return;
        }
        clickLegacy("#save-as-design-btn");
      });
    }

    if (undoBtn) {
      undoBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (!canUndo()) return;
        clickLegacy("#undo-btn");
        syncHistoryButtons();
      });
    }

    if (redoBtn) {
      redoBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (!canRedo()) return;
        clickLegacy("#redo-btn");
        syncHistoryButtons();
      });
    }
  }

  function bindMenus() {
    NORTH_MENUS.forEach(function (pair) {
      const btn = $(pair.btn);
      const menu = $(pair.menu);
      if (btn) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleMenu(pair.btn, pair.menu);
        });
      }
      if (menu) {
        menu.addEventListener("keydown", function (ev) {
          const items = menuItems(menu);
          if (!items.length) return;
          const i = items.indexOf(document.activeElement);
          if (ev.key === "ArrowDown") {
            ev.preventDefault();
            items[(i < 0 ? 0 : i + 1) % items.length].focus();
          } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            items[(i < 0 ? items.length - 1 : i - 1 + items.length) % items.length].focus();
          } else if (ev.key === "Home") {
            ev.preventDefault();
            items[0].focus();
          } else if (ev.key === "End") {
            ev.preventDefault();
            items[items.length - 1].focus();
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            closeMenus();
            const trigger = $(pair.btn);
            if (trigger) trigger.focus();
          }
        });
      }
    });

    document.querySelectorAll(".v3-north-menu [data-click]").forEach((btn) => {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        const sel = btn.getAttribute("data-click");
        closeMenus();
        clickLegacy(sel);
      });
    });

    const layoutReset = $("v3-north-layout-reset");
    if (layoutReset) {
      layoutReset.addEventListener("click", function () {
        closeMenus();
      });
    }

    document.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest(".v3-north-menu-wrap")) return;
      closeMenus();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeMenus();
    });
    window.addEventListener("resize", closeMenus);
  }

  function openEstimate(anchor) {
    if (window.v3EstimatePanel && typeof window.v3EstimatePanel.open === "function") {
      window.v3EstimatePanel.open({ anchor: anchor || $("v3-north-total") });
    }
  }

  function bindTotal() {
    const dst = $("v3-north-total");
    const src = $("total");
    if (dst) {
      dst.addEventListener("click", function (ev) {
        ev.preventDefault();
        openEstimate(dst);
      });
    }
    formatTotalFromLegacy();
    if (src && typeof MutationObserver === "function") {
      const mo = new MutationObserver(formatTotalFromLegacy);
      mo.observe(src, { childList: true, characterData: true, subtree: true });
    }
  }

  function bindProjectObserver() {
    syncProjectName();
    wrapFn("updateTabTitle", syncProjectName);
    const title = $("page-title");
    if (title && typeof MutationObserver === "function") {
      const mo = new MutationObserver(syncProjectName);
      mo.observe(title, { childList: true, characterData: true, subtree: true });
    }
  }

  function bindHistoryObserver() {
    wrapFn("saveHistory", syncHistoryButtons);
    wrapFn("loadHistory", syncHistoryButtons);
    wrapFn("undo", syncHistoryButtons);
    wrapFn("redo", syncHistoryButtons);
    syncHistoryButtons();
  }

  function bindStaffObserver() {
    syncStaffState();
    document.addEventListener("cuberack:staff-mode-enabled", syncStaffState);
    const logout = $("admin-menu-logout-btn");
    if (logout) {
      logout.addEventListener("click", function () {
        requestAnimationFrame(syncStaffState);
      });
    }
    const overlay = $("admin-menu-overlay");
    if (overlay && typeof MutationObserver === "function") {
      const mo = new MutationObserver(syncStaffState);
      mo.observe(overlay, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
    }
  }

  function fillVersionChrome() {
    const info = window.v3AppInfo;
    if (!info) return;
    const prod = $("v3-north-ver-product");
    const phase = $("v3-north-ver-phase");
    const label = info.productLabel();
    if (prod) prod.textContent = label;
    if (phase) {
      phase.textContent = "";
      phase.hidden = true;
    }
    const btn = $("v3-north-ver");
    if (btn) {
      btn.title = label + "（バージョン情報）";
      btn.setAttribute("aria-label", "バージョン情報 " + label);
    }
    const legacy = document.querySelector("#panel .app-version");
    if (legacy) legacy.textContent = label;
  }

  function syncVersionBtn() {
    const btn = $("v3-north-ver");
    if (!btn) return;
    const open = window.v3WorkspaceUi && window.v3WorkspaceUi.getOpenPopupId() === "about";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function openAboutPopup() {
    const info = window.v3AppInfo;
    const ui = window.v3WorkspaceUi;
    if (!info || !ui || typeof ui.openPopup !== "function") return;
    if (ui.getOpenPopupId && ui.getOpenPopupId() === "about") {
      ui.closePopup("cancel");
      syncVersionBtn();
      return;
    }
    ui.openPopup("about", {
      title: "バージョン情報",
      hideApply: true,
      render(body) {
        const dl = document.createElement("dl");
        dl.className = "v3-about-dl";
        function row(key, value) {
          const dt = document.createElement("dt");
          dt.textContent = key;
          const dd = document.createElement("dd");
          dd.textContent = value;
          dl.appendChild(dt);
          dl.appendChild(dd);
        }
        row("アプリ名", info.name);
        row("製品バージョン", info.productLabel());
        const staff = typeof window.isCubeRackStaffMode === "function" && window.isCubeRackStaffMode();
        if (staff) {
          row("実装フェーズ", info.phase);
          row("チャネル", info.isDev() ? "開発版" : "製品");
        }
        body.appendChild(dl);
      },
    });
    syncVersionBtn();
  }

  function bindVersion() {
    fillVersionChrome();
    const btn = $("v3-north-ver");
    if (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        openAboutPopup();
      });
    }
    const pop = $("v3-cmd-pop");
    if (pop && typeof MutationObserver === "function") {
      const mo = new MutationObserver(syncVersionBtn);
      mo.observe(pop, { attributes: true, attributeFilter: ["class"] });
    }
  }

  const NORTH_DRAG_SLOP = 6;
  let northDrag = null;
  let clickShield = null;

  function headerStore() {
    return window.v3LayoutStore || null;
  }

  function defaultHeaderOrder() {
    const store = headerStore();
    if (store && store.DEFAULT_HEADER_ICONS) return store.DEFAULT_HEADER_ICONS.slice();
    return ["new", "open", "save", "save-as", "undo", "redo", "gap", "view", "more", "staff", "legacy", "version"];
  }

  function mergeHeaderOrder(saved) {
    const store = headerStore();
    if (store && typeof store.mergeHeaderIconOrder === "function") {
      return store.mergeHeaderIconOrder(saved);
    }
    return defaultHeaderOrder();
  }

  function readHeaderOrder() {
    const store = headerStore();
    let raw = null;
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getState === "function") {
      const st = window.v3WorkspaceUi.getState();
      raw = st && st.headerIcons && st.headerIcons.order;
    } else if (store) {
      const st = store.load();
      raw = st && st.headerIcons && st.headerIcons.order;
    }
    return mergeHeaderOrder(raw);
  }

  function persistHeaderOrder(order) {
    const payload = { order: mergeHeaderOrder(order), fileOpsMigrated: true };
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.patchState === "function") {
      window.v3WorkspaceUi.patchState({ headerIcons: payload });
      return;
    }
    const store = headerStore();
    if (!store) return;
    const st = store.load();
    st.headerIcons = payload;
    store.save(st);
  }

  function headerUnit(id) {
    const sort = $("v3-north-sort");
    if (!sort || !id) return null;
    return sort.querySelector('[data-north-id="' + id + '"]');
  }

  function applyHeaderOrder(order) {
    const sort = $("v3-north-sort");
    if (!sort) return mergeHeaderOrder(order);
    const total = $("v3-north-total");
    const merged = mergeHeaderOrder(order);
    merged.forEach(function (id) {
      const el = headerUnit(id);
      if (!el) return;
      sort.appendChild(el);
      if (id === "gap" && total) sort.appendChild(total);
    });
    if (total && total.parentNode !== sort) sort.appendChild(total);
    return merged;
  }

  function currentHeaderOrder() {
    const sort = $("v3-north-sort");
    if (!sort) return defaultHeaderOrder();
    const ids = [];
    Array.prototype.forEach.call(sort.children, function (el) {
      const id = el.getAttribute && el.getAttribute("data-north-id");
      if (id) ids.push(id);
    });
    return mergeHeaderOrder(ids);
  }

  function visibleDropTargets(dragEl) {
    const sort = $("v3-north-sort");
    if (!sort) return [];
    return Array.prototype.filter.call(sort.children, function (el) {
      if (el === dragEl) return false;
      if (el.id === "v3-north-total" || el.id === "v3-north-insert") return false;
      if (!el.getAttribute("data-north-id")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
  }

  function slotAtPoint(x, dragEl) {
    const store = headerStore();
    const targets = visibleDropTargets(dragEl);
    const centers = targets.map(function (el) {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const idx = store && typeof store.headerInsertIndex === "function"
      ? store.headerInsertIndex(centers, x)
      : centers.length;
    const before = idx < targets.length ? targets[idx] : null;
    let lineX = x;
    if (before) lineX = before.getBoundingClientRect().left;
    else if (targets.length) lineX = targets[targets.length - 1].getBoundingClientRect().right;
    return { before: before, lineX: lineX, idx: idx };
  }

  function pointInNorth(x, y) {
    const north = $("v3-north");
    if (!north) return false;
    const r = north.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function placeInsertLine(x, y, dragEl) {
    const insert = $("v3-north-insert");
    const north = $("v3-north");
    if (!insert || !north) return;
    if (!pointInNorth(x, y)) {
      insert.hidden = true;
      return;
    }
    const slot = slotAtPoint(x, dragEl);
    const nr = north.getBoundingClientRect();
    insert.hidden = false;
    insert.style.left = Math.round(slot.lineX - nr.left) + "px";
  }

  function armClickShield(pointerType) {
    if (clickShield) {
      document.removeEventListener("click", clickShield, true);
      clickShield = null;
    }
    const shield = function (ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    clickShield = shield;
    document.addEventListener("click", shield, true);
    const hold = pointerType === "touch" ? 400 : 50;
    setTimeout(function () {
      document.removeEventListener("click", shield, true);
      if (clickShield === shield) clickShield = null;
    }, hold);
  }

  function endNorthDrag(ev, cancel) {
    if (!northDrag || (ev && northDrag.pointerId !== ev.pointerId)) return;
    const d = northDrag;
    northDrag = null;
    try {
      if (d.el && d.el.releasePointerCapture) d.el.releasePointerCapture(d.pointerId);
    } catch (err) {}
    d.el.classList.remove("is-dragging");
    document.body.classList.remove("v3-north-reordering");
    const insert = $("v3-north-insert");
    if (insert) insert.hidden = true;
    if (!d.moved) return;
    if (ev && ev.cancelable) ev.preventDefault();
    armClickShield(d.pointerType);
    if (cancel || !pointInNorth(d.lastX, d.lastY)) {
      applyHeaderOrder(d.originOrder);
      return;
    }
    const slot = slotAtPoint(d.lastX, d.el);
    const order = d.originOrder.slice();
    const from = order.indexOf(d.id);
    if (from < 0) return;
    order.splice(from, 1);
    let to = order.length;
    if (slot.before) {
      const beforeId = slot.before.getAttribute("data-north-id");
      const idx = order.indexOf(beforeId);
      if (idx >= 0) to = idx;
    }
    order.splice(to, 0, d.id);
    persistHeaderOrder(applyHeaderOrder(order));
  }

  function bindHeaderReorder() {
    const sort = $("v3-north-sort");
    if (!sort) return;
    const merged = applyHeaderOrder(readHeaderOrder());
    persistHeaderOrder(merged);

    sort.addEventListener("dragstart", function (ev) {
      ev.preventDefault();
    });

    sort.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest(".v3-north-menu")) return;
      if (ev.target && ev.target.closest && ev.target.closest("#v3-north-total")) return;
      const unit = ev.target && ev.target.closest && ev.target.closest("#v3-north-sort [data-north-id]");
      if (!unit || unit.getAttribute("data-north-fixed") === "1") return;
      const id = unit.getAttribute("data-north-id");
      if (!id) return;
      northDrag = {
        id: id,
        el: unit,
        pointerId: ev.pointerId,
        pointerType: ev.pointerType || "mouse",
        startX: ev.clientX,
        startY: ev.clientY,
        lastX: ev.clientX,
        lastY: ev.clientY,
        originOrder: currentHeaderOrder(),
        moved: false,
      };
      // しきい値前に capture すると click が親へリターゲットされ、
      // フォルダ等のヘッダーボタンが反応しなくなる。
    });

    document.addEventListener("pointermove", function (ev) {
      if (!northDrag || northDrag.pointerId !== ev.pointerId) return;
      northDrag.lastX = ev.clientX;
      northDrag.lastY = ev.clientY;
      const dx = ev.clientX - northDrag.startX;
      const dy = ev.clientY - northDrag.startY;
      if (!northDrag.moved) {
        if ((dx * dx) + (dy * dy) < NORTH_DRAG_SLOP * NORTH_DRAG_SLOP) return;
        northDrag.moved = true;
        closeMenus();
        northDrag.el.classList.add("is-dragging");
        document.body.classList.add("v3-north-reordering");
        try {
          northDrag.el.setPointerCapture(ev.pointerId);
        } catch (err) {}
      }
      if (ev.cancelable) ev.preventDefault();
      placeInsertLine(ev.clientX, ev.clientY, northDrag.el);
    }, { passive: false });

    document.addEventListener("pointerup", function (ev) { endNorthDrag(ev, false); });
    document.addEventListener("pointercancel", function (ev) { endNorthDrag(ev, true); });

    window.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || !northDrag) return;
      endNorthDrag({ pointerId: northDrag.pointerId, cancelable: true, preventDefault: function () {} }, true);
    });
    window.addEventListener("v3-layout-reset", function () {
      applyHeaderOrder(defaultHeaderOrder());
    });
  }

  bindFileAndHistory();
  bindMenus();
  bindTotal();
  bindProjectObserver();
  bindHistoryObserver();
  bindStaffObserver();
  bindVersion();
  bindHeaderReorder();

  window.v3NorthSyncTotal = formatTotalFromLegacy;
  window.v3NorthCloseMenus = closeMenus;
  window.v3NorthApplyHeaderIcons = function (reset) {
    const order = reset ? defaultHeaderOrder() : readHeaderOrder();
    return applyHeaderOrder(order);
  };
})();
