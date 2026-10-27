// =========================================================
// 図面サイドバー：固定8種の一覧・印刷チェック・プレビュー切替
// =========================================================
(function () {
  const store = window.v3DrawingPageStore;
  if (!store) return;

  function $(id) { return document.getElementById(id); }

  function getDoc() {
    const sheet = window.v3DrawingSheet;
    return sheet && sheet.getDocument ? sheet.getDocument() : null;
  }

  function setDoc(doc, opts) {
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.setDocument === "function") {
      window.v3DrawingSheet.setDocument(doc, opts);
    }
  }

  function currentIndex() {
    const st = window.v3DrawingSheet && window.v3DrawingSheet.state;
    return st ? st.pageIndex : 0;
  }

  function persistPrintOnly() {
    const doc = getDoc();
    if (!doc) return;
    setDoc(doc, { skipRedraw: true });
    renderList();
  }

  function renderSettings(page) {
    const box = $("draw-page-settings");
    const doc = getDoc();
    if (!box) return;
    if (!page || !doc) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.dataset.pageId = page.id;
    const name = $("draw-edit-name");
    if (name) name.value = page.title || store.pageLabel(page);
    const no = $("draw-edit-no");
    if (no) no.textContent = store.fullDrawingNo(doc, page);
    const dims = $("draw-edit-dims");
    if (dims) dims.checked = page.showDims !== false;
    const viewBox = $("draw-edit-view-box");
    if (viewBox) viewBox.hidden = page.kind === "bom";
  }

  function applySettings() {
    const box = $("draw-page-settings");
    const doc = getDoc();
    if (!box || box.hidden || !doc) return;
    const pageId = box.dataset.pageId;
    const page = doc.pages.find(function (p) { return p.id === pageId; });
    if (!page) return;
    const nameEl = $("draw-edit-name");
    store.updatePage(doc, pageId, {
      title: nameEl ? nameEl.value : page.title,
      showDims: $("draw-edit-dims") ? $("draw-edit-dims").checked : page.showDims,
    });
    setDoc(doc);
    renderSettings(doc.pages.find(function (p) { return p.id === pageId; }));
  }

  function renderList() {
    const list = $("draw-page-list");
    const countEl = $("draw-page-count");
    const doc = getDoc();
    if (!list || !doc) return;
    list.innerHTML = "";
    const printN = store.printPages(doc).length;
    if (countEl) countEl.textContent = "印刷 " + printN + " / " + doc.pages.length;
    const cur = currentIndex();
    doc.pages.forEach(function (page, index) {
      const row = document.createElement("div");
      row.className = "draw-page-row";
      row.dataset.index = String(index);
      row.dataset.id = page.id;

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "draw-page-print";
      check.checked = store.isPrintEnabled(page);
      check.title = "印刷する";
      check.setAttribute("aria-label", store.pageLabel(page) + "を印刷");
      check.addEventListener("click", function (ev) { ev.stopPropagation(); });
      check.addEventListener("change", function (ev) {
        ev.stopPropagation();
        store.setPagePrint(doc, page.id, check.checked);
        persistPrintOnly();
      });

      const label = document.createElement("span");
      label.className = "draw-page-label";
      label.textContent = store.pageLabel(page);

      row.appendChild(check);
      row.appendChild(label);
      row.addEventListener("click", function (ev) {
        if (ev.target === check) return;
        if (window.v3DrawingSheet && typeof window.v3DrawingSheet.showPage === "function") {
          window.v3DrawingSheet.showPage(index);
        }
      });
      if (cur === index) row.classList.add("is-current");
      list.appendChild(row);
    });
    const active = doc.pages[cur];
    renderSettings(active || null);
  }

  function bindToolbar() {
    const all = $("draw-print-all");
    const none = $("draw-print-none");
    if (all && !all.__bound) {
      all.__bound = true;
      all.addEventListener("click", function () {
        const doc = getDoc();
        if (!doc) return;
        store.setAllPrint(doc, true);
        persistPrintOnly();
      });
    }
    if (none && !none.__bound) {
      none.__bound = true;
      none.addEventListener("click", function () {
        const doc = getDoc();
        if (!doc) return;
        store.setAllPrint(doc, false);
        persistPrintOnly();
      });
    }
  }

  function bindRev() {
    const rev = $("draw-rev");
    if (!rev) return;
    rev.addEventListener("input", function () {
      const doc = getDoc();
      if (!doc) return;
      doc.rev = rev.value || "";
      setDoc(doc, { skipRedraw: true });
    });
  }

  function bindSettings() {
    ["draw-edit-name", "draw-edit-dims"].forEach(function (id) {
      const el = $(id);
      if (!el || el.__bound) return;
      el.__bound = true;
      el.addEventListener("change", applySettings);
      if (el.tagName === "INPUT" && el.type === "text") el.addEventListener("blur", applySettings);
    });
    const resetView = $("draw-edit-reset-view");
    if (resetView && !resetView.__bound) {
      resetView.__bound = true;
      resetView.addEventListener("click", function () {
        const doc = getDoc();
        const box = $("draw-page-settings");
        if (!doc || !box) return;
        store.updatePage(doc, box.dataset.pageId, { resetView: true });
        const p = typeof window.__CR_getDrawingPayload === "function" ? window.__CR_getDrawingPayload() : null;
        if (p && p._orthoSlots) delete p._orthoSlots[box.dataset.pageId];
        if (p && p._isoViews) delete p._isoViews[box.dataset.pageId];
        if (window.v3DrawingOrthoNav && window.v3DrawingOrthoNav.getStates) {
          const st = window.v3DrawingOrthoNav.getStates();
          delete st[box.dataset.pageId];
        }
        setDoc(doc);
      });
    }
    const resetDim = $("draw-edit-reset-dim");
    if (resetDim && !resetDim.__bound) {
      resetDim.__bound = true;
      resetDim.addEventListener("click", function () {
        const doc = getDoc();
        const box = $("draw-page-settings");
        if (!doc || !box) return;
        store.clearDimKeysForPage(doc, box.dataset.pageId);
        const p = typeof window.__CR_getDrawingPayload === "function" ? window.__CR_getDrawingPayload() : null;
        if (p) {
          if (p._dimOffsets) {
            Object.keys(p._dimOffsets).forEach(function (k) {
              if (k.indexOf(box.dataset.pageId + "_") === 0) delete p._dimOffsets[k];
            });
          }
          if (p._dimStyles) {
            Object.keys(p._dimStyles).forEach(function (k) {
              if (k.indexOf(box.dataset.pageId + "_") === 0) delete p._dimStyles[k];
            });
          }
        }
        setDoc(doc);
      });
    }
  }

  window.v3DrawingPagesUi = {
    refresh: renderList,
    bind: function () {
      bindToolbar();
      bindRev();
      bindSettings();
      renderList();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.v3DrawingPagesUi.bind();
    });
  } else {
    window.v3DrawingPagesUi.bind();
  }
})();
