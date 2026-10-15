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
    if (!src || !dst) return;
    const raw = (src.textContent || "").trim() || "合計：0 円";
    dst.title = raw + "（クリックで旧パネルの明細を表示）";
    const m = raw.match(/合計：\s*([0-9,]+)\s*円/);
    dst.textContent = m ? `合計 ${m[1]} 円` : raw;
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

  function runExistingSave(fn) {
    if (saveBusy || typeof fn !== "function") return;
    setSaveBusy(true);
    Promise.resolve(fn())
      .catch(function () {})
      .finally(function () {
        setSaveBusy(false);
        syncProjectName();
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

  function closeMenus() {
    ["v3-north-view-menu", "v3-north-more-menu"].forEach((id) => {
      const menu = $(id);
      if (menu) menu.classList.add("hidden");
    });
    ["v3-north-view", "v3-north-more"].forEach((id) => {
      const btn = $(id);
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
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
    }
  }

  function bindFileAndHistory() {
    const openBtn = $("v3-north-open");
    const saveBtn = $("v3-north-save");
    const saveAsBtn = $("v3-north-save-as");
    const undoBtn = $("v3-north-undo");
    const redoBtn = $("v3-north-redo");

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
    const viewBtn = $("v3-north-view");
    const moreBtn = $("v3-north-more");
    if (viewBtn) {
      viewBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleMenu("v3-north-view", "v3-north-view-menu");
      });
    }
    if (moreBtn) {
      moreBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleMenu("v3-north-more", "v3-north-more-menu");
      });
    }

    document.querySelectorAll(".v3-north-menu [data-click]").forEach((btn) => {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        const sel = btn.getAttribute("data-click");
        closeMenus();
        clickLegacy(sel);
      });
    });

    document.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest(".v3-north-menu-wrap")) return;
      closeMenus();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeMenus();
    });
  }

  function bindTotal() {
    const dst = $("v3-north-total");
    const src = $("total");
    if (dst) {
      dst.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof window.setV3LegacyPanelOpen === "function") {
          window.setV3LegacyPanelOpen(true);
        }
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
    if (prod) prod.textContent = info.productLabel();
    if (phase) phase.textContent = info.phase;
    const btn = $("v3-north-ver");
    if (btn) {
      const label = info.shortLabel();
      btn.title = label + "（バージョン情報）";
      btn.setAttribute("aria-label", "バージョン情報 " + label);
    }
    const legacy = document.querySelector("#panel .app-version");
    if (legacy) legacy.textContent = info.shortLabel();
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
        row("製品バージョン", info.product);
        row("実装フェーズ", info.phase);
        row("チャネル", info.isDev() ? "開発版" : "製品");
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

  bindFileAndHistory();
  bindMenus();
  bindTotal();
  bindProjectObserver();
  bindHistoryObserver();
  bindStaffObserver();
  bindVersion();
})();
