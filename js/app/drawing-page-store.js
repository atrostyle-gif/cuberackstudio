// =========================================================
// 図面ドキュメント（固定8種・枝番・視点状態・印刷対象）
// =========================================================
(function (root) {
  const ORTHO_MODES = ["front", "back", "left", "right", "top", "bottom"];
  const ORTHO_LABELS = {
    front: "正面図",
    back: "背面図",
    left: "左側面図",
    right: "右側面図",
    top: "上面図",
    bottom: "下面図",
  };
  const FIXED_SLOTS = [
    { key: "iso", kind: "iso", label: "3D完成図" },
    { key: "bom", kind: "bom", label: "部材一覧" },
    { key: "front", kind: "ortho", orthoMode: "front", label: "正面図" },
    { key: "back", kind: "ortho", orthoMode: "back", label: "背面図" },
    { key: "left", kind: "ortho", orthoMode: "left", label: "左側面図" },
    { key: "right", kind: "ortho", orthoMode: "right", label: "右側面図" },
    { key: "top", kind: "ortho", orthoMode: "top", label: "上面図" },
    { key: "bottom", kind: "ortho", orthoMode: "bottom", label: "下面図" },
  ];

  function uid() {
    return "pg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function padBranch(n) {
    const v = Math.max(1, Math.floor(Number(n) || 1));
    return v < 10 ? "0" + v : String(v);
  }

  function defaultOrthoState(mode) {
    const m = ORTHO_MODES.indexOf(mode) >= 0 ? mode : "front";
    return { mode: m, panU: 0, panV: 0, zoom: 1 };
  }

  function defaultIsoView() {
    return { preset: "iso", pitchDeg: 20, yawDeg: 35, panX: 0, panY: 0, zoom: 1 };
  }

  function slotKeyOf(page) {
    if (!page) return null;
    if (page.kind === "iso") return "iso";
    if (page.kind === "bom") return "bom";
    if (page.kind === "ortho") {
      const mode = page.orthoMode || "front";
      return ORTHO_MODES.indexOf(mode) >= 0 ? mode : null;
    }
    return null;
  }

  function createPage(kind, branch, extra) {
    const p = {
      id: (extra && extra.id) || uid(),
      kind: kind,
      branch: padBranch(branch),
      title: (extra && extra.title) || "",
      showDims: extra && extra.showDims === false ? false : true,
      print: extra && extra.print === false ? false : true,
    };
    if (kind === "ortho") {
      p.orthoMode = (extra && extra.orthoMode) || "front";
      p.orthoState = (extra && extra.orthoState) ? Object.assign({}, extra.orthoState) : defaultOrthoState(p.orthoMode);
    }
    if (kind === "iso") {
      p.isoView = (extra && extra.isoView) ? Object.assign({}, extra.isoView) : defaultIsoView();
    }
    if (kind === "bom") {
      p.bomStart = Number(extra && extra.bomStart) || 0;
    }
    return p;
  }

  function createDefaultDocument(opts) {
    const o = opts || {};
    const pages = FIXED_SLOTS.map(function (slot, i) {
      return createPage(slot.kind, i + 1, {
        id: "pg_" + slot.key,
        orthoMode: slot.orthoMode,
        print: true,
      });
    });
    return {
      version: 1,
      fixedSet: 8,
      nextBranch: 9,
      rev: o.rev || "",
      drawingNoBase: o.drawingNoBase || "",
      activePageId: pages[0].id,
      legend: { nx: 1, ny: 0 },
      archivedPages: [],
      pages: pages,
    };
  }

  function pageLabel(page) {
    if (!page) return "—";
    if (page.title && String(page.title).trim()) return String(page.title).trim();
    const slot = FIXED_SLOTS.find(function (s) { return s.key === slotKeyOf(page); });
    if (slot) return slot.label;
    if (page.kind === "iso") return "3D完成図";
    if (page.kind === "bom") return "部材一覧";
    if (page.kind === "ortho") return ORTHO_LABELS[page.orthoMode] || "正投影図";
    return page.kind;
  }

  function fullDrawingNo(doc, page) {
    const base = (doc && doc.drawingNoBase) || "";
    const br = page && page.branch ? page.branch : "01";
    if (!base) return "—-" + br;
    return base + "-" + br;
  }

  function allocateBranch(doc) {
    const n = Math.max(1, doc.nextBranch || 1);
    doc.nextBranch = n + 1;
    return padBranch(n);
  }

  function isPrintEnabled(page) {
    return !!(page && page.print !== false);
  }

  function printPages(doc) {
    return ((doc && doc.pages) || []).filter(isPrintEnabled);
  }

  function setPagePrint(doc, pageId, on) {
    const page = doc && doc.pages && doc.pages.find(function (p) { return p.id === pageId; });
    if (!page) return null;
    page.print = !!on;
    return page;
  }

  function setAllPrint(doc, on) {
    if (!doc || !doc.pages) return;
    doc.pages.forEach(function (p) { p.print = !!on; });
  }

  function addPage(doc, spec) {
    const kind = spec.kind;
    const insertBeforeBom = spec.insertBeforeBom !== false;
    const branch = allocateBranch(doc);
    let page;
    if (kind === "iso") page = createPage("iso", branch, spec);
    else if (kind === "bom") page = createPage("bom", branch, { bomStart: spec.bomStart });
    else if (kind === "ortho") page = createPage("ortho", branch, { orthoMode: spec.orthoMode || "front", title: spec.title });
    else return null;

    const pages = doc.pages.slice();
    if (kind === "bom") {
      pages.push(page);
    } else if (insertBeforeBom) {
      let idx = pages.length;
      for (let i = 0; i < pages.length; i += 1) {
        if (pages[i].kind === "bom") {
          idx = i;
          break;
        }
      }
      pages.splice(idx, 0, page);
    } else {
      pages.push(page);
    }
    doc.pages = pages;
    return page;
  }

  function removePage(doc, pageId) {
    const pages = doc.pages.filter(function (p) { return p.id !== pageId; });
    if (pages.length === doc.pages.length) return false;
    doc.pages = pages;
    return true;
  }

  function movePage(doc, fromIndex, toIndex) {
    const pages = doc.pages.slice();
    if (fromIndex < 0 || fromIndex >= pages.length || toIndex < 0 || toIndex >= pages.length) return false;
    const moving = pages.splice(fromIndex, 1)[0];
    pages.splice(toIndex, 0, moving);
    doc.pages = pages;
    return true;
  }

  function clearPageViewState(page) {
    if (!page) return page;
    if (page.kind === "ortho") page.orthoState = defaultOrthoState(page.orthoMode);
    if (page.kind === "iso") page.isoView = defaultIsoView();
    return page;
  }

  function updatePage(doc, pageId, patch) {
    const page = doc.pages.find(function (p) { return p.id === pageId; });
    if (!page || !patch) return null;
    const prevKind = page.kind;
    const prevMode = page.orthoMode;
    if (patch.title != null) page.title = String(patch.title);
    if (patch.rev != null) doc.rev = String(patch.rev);
    if (patch.showDims != null) page.showDims = !!patch.showDims;
    if (patch.print != null) page.print = !!patch.print;
    if (patch.kind && patch.kind !== page.kind) {
      page.kind = patch.kind;
      if (page.kind === "ortho") {
        page.orthoMode = patch.orthoMode || prevMode || "front";
        page.orthoState = defaultOrthoState(page.orthoMode);
        delete page.isoView;
        delete page.bomStart;
      } else if (page.kind === "iso") {
        page.isoView = defaultIsoView();
        delete page.orthoMode;
        delete page.orthoState;
        delete page.bomStart;
      } else if (page.kind === "bom") {
        page.bomStart = Number(patch.bomStart) || 0;
        delete page.orthoMode;
        delete page.orthoState;
        delete page.isoView;
      }
    } else if (page.kind === "ortho" && patch.orthoMode && patch.orthoMode !== prevMode) {
      page.orthoMode = patch.orthoMode;
      page.orthoState = defaultOrthoState(page.orthoMode);
    }
    if (patch.resetView) clearPageViewState(page);
    page._viewKindChanged = prevKind !== page.kind || (page.kind === "ortho" && prevMode !== page.orthoMode);
    return page;
  }

  function clearDimKeysForPage(doc, pageId) {
    if (!doc || !pageId) return;
    ["dimOffsets", "dimStyles"].forEach(function (field) {
      const map = doc[field];
      if (!map) return;
      Object.keys(map).forEach(function (k) {
        if (k.indexOf(pageId + "_") === 0) delete map[k];
      });
    });
  }

  function expandBomPages(doc, payload, rowsPerPage) {
    return doc && doc.pages ? doc.pages.slice() : [];
  }

  function migrateToFixedSet(raw) {
    const src = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : {};
    const incoming = Array.isArray(src.pages) ? src.pages : [];
    const prevArchived = Array.isArray(src.archivedPages) ? src.archivedPages : [];
    const bySlot = {};
    const extras = prevArchived.slice();
    incoming.forEach(function (p) {
      const key = slotKeyOf(p);
      if (!key) {
        extras.push(p);
        return;
      }
      if (!bySlot[key]) bySlot[key] = p;
      else extras.push(p);
    });

    const usedBranches = {};
    function keepBranch(p) {
      if (p && p.branch) usedBranches[padBranch(p.branch)] = true;
    }
    incoming.forEach(keepBranch);
    extras.forEach(keepBranch);
    let next = Math.max(1, Number(src.nextBranch) || 1);
    function nextFreeBranch() {
      while (usedBranches[padBranch(next)]) next += 1;
      const br = padBranch(next);
      usedBranches[br] = true;
      next += 1;
      return br;
    }

    const pages = FIXED_SLOTS.map(function (slot) {
      let p = bySlot[slot.key];
      if (p) {
        if (p.print == null) p.print = true;
        if (p.showDims == null) p.showDims = true;
        if (p.kind === "ortho" && !p.orthoState) p.orthoState = defaultOrthoState(p.orthoMode || slot.orthoMode);
        if (p.kind === "iso" && !p.isoView) p.isoView = defaultIsoView();
        if (p.kind === "ortho") p.orthoMode = slot.orthoMode;
        return p;
      }
      return createPage(slot.kind, nextFreeBranch(), {
        id: "pg_" + slot.key,
        orthoMode: slot.orthoMode,
        print: true,
      });
    });

    const activeStillThere = pages.some(function (p) { return p.id === src.activePageId; });
    return {
      version: 1,
      fixedSet: 8,
      nextBranch: next,
      rev: src.rev || "",
      drawingNoBase: src.drawingNoBase || "",
      activePageId: activeStillThere ? src.activePageId : pages[0].id,
      legend: src.legend && typeof src.legend === "object" ? src.legend : { nx: 1, ny: 0 },
      dimOffsets: src.dimOffsets && typeof src.dimOffsets === "object" ? src.dimOffsets : {},
      dimStyles: src.dimStyles && typeof src.dimStyles === "object" ? src.dimStyles : {},
      archivedPages: extras,
      pages: pages,
    };
  }

  function migrateLegacyPlan(showBom) {
    const doc = createDefaultDocument({});
    if (showBom === false) {
      const bom = doc.pages.find(function (p) { return p.kind === "bom"; });
      if (bom) bom.print = false;
    }
    return doc;
  }

  function loadDocument(raw, opts) {
    const o = opts || {};
    if (raw && typeof raw === "object") {
      const doc = migrateToFixedSet(raw);
      if (!doc.drawingNoBase && o.drawingNoBase) doc.drawingNoBase = o.drawingNoBase;
      return doc;
    }
    return createDefaultDocument({ drawingNoBase: o.drawingNoBase || "" });
  }

  function syncDrawingNoBase(doc, drawingNo) {
    if (!doc) return;
    if (drawingNo && !doc.drawingNoBase) doc.drawingNoBase = String(drawingNo).replace(/-\d{2}$/, "");
  }

  function applyOrthoToPayload(doc, payload) {
    if (!payload) return;
    const slots = {};
    doc.pages.forEach(function (p) {
      if (p.kind === "ortho" && p.orthoState) {
        const st = Object.assign({}, p.orthoState);
        if (p.orthoMode) st.mode = p.orthoMode;
        slots[p.id] = st;
      }
    });
    payload._orthoSlots = slots;
  }

  function applyIsoViewsToPayload(doc, payload) {
    if (!payload) return;
    const map = {};
    doc.pages.forEach(function (p) {
      if (p.kind === "iso" && p.isoView) map[p.id] = Object.assign({}, p.isoView);
    });
    payload._isoViews = map;
  }

  function persistFromPayload(doc, payload) {
    if (!payload || !doc) return doc;
    const slots = payload._orthoSlots || {};
    doc.pages.forEach(function (p) {
      if (p.kind === "ortho" && slots[p.id]) {
        p.orthoState = Object.assign({}, slots[p.id]);
        if (p.orthoMode) p.orthoState.mode = p.orthoMode;
      }
    });
    const isoMap = payload._isoViews || {};
    doc.pages.forEach(function (p) {
      if (p.kind === "iso" && isoMap[p.id]) {
        p.isoView = Object.assign({}, isoMap[p.id]);
      }
    });
    if (payload._dimOffsets) doc.dimOffsets = Object.assign({}, payload._dimOffsets);
    if (payload._dimStyles) doc.dimStyles = Object.assign({}, payload._dimStyles);
    if (!doc.legend) doc.legend = { nx: 1, ny: 0 };
    if (Number.isFinite(payload._legendNx)) doc.legend.nx = payload._legendNx;
    if (Number.isFinite(payload._legendNy)) doc.legend.ny = payload._legendNy;
    return doc;
  }

  function attachToPayload(doc, payload) {
    if (!doc || !payload) return payload;
    persistFromPayload(doc, payload);
    payload.drawingDocument = doc;
    applyOrthoToPayload(doc, payload);
    applyIsoViewsToPayload(doc, payload);
    if (!payload._dimOffsets) payload._dimOffsets = Object.assign({}, doc.dimOffsets || {});
    if (!payload._dimStyles) payload._dimStyles = Object.assign({}, doc.dimStyles || {});
    if (doc.legend) {
      if (!Number.isFinite(payload._legendNx)) payload._legendNx = doc.legend.nx;
      if (!Number.isFinite(payload._legendNy)) payload._legendNy = doc.legend.ny;
    }
    return payload;
  }

  const api = {
    ORTHO_MODES: ORTHO_MODES,
    ORTHO_LABELS: ORTHO_LABELS,
    FIXED_SLOTS: FIXED_SLOTS,
    createDefaultDocument: createDefaultDocument,
    migrateLegacyPlan: migrateLegacyPlan,
    migrateToFixedSet: migrateToFixedSet,
    loadDocument: loadDocument,
    pageLabel: pageLabel,
    fullDrawingNo: fullDrawingNo,
    slotKeyOf: slotKeyOf,
    isPrintEnabled: isPrintEnabled,
    printPages: printPages,
    setPagePrint: setPagePrint,
    setAllPrint: setAllPrint,
    addPage: addPage,
    removePage: removePage,
    movePage: movePage,
    updatePage: updatePage,
    clearPageViewState: clearPageViewState,
    clearDimKeysForPage: clearDimKeysForPage,
    expandBomPages: expandBomPages,
    syncDrawingNoBase: syncDrawingNoBase,
    persistFromPayload: persistFromPayload,
    attachToPayload: attachToPayload,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.v3DrawingPageStore = api;
})(typeof window !== "undefined" ? window : globalThis);
