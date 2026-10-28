// =========================================================
// V3 統合図面シート（複数ページ）
// 既存 drawing.js の drawView を再利用する。エンジン置換ではない。
// 1: 3D完成イメージ（追加可）
// 2+: 正投影（1ビュー/ページ・追加可）
// 末尾: 部材一覧（自動分割可）
// =========================================================
(function () {
  const math = window.v3DrawingMath;
  const pageStore = window.v3DrawingPageStore;
  const state = {
    paper: "A4",
    orient: "landscape",
    title: "",
    drawingNo: "",
    date: "",
    scale: "auto",
    showDims: true,
    showBom: true,
    legacyView: false,
    pageIndex: 0,
    legendNx: 1,
    legendNy: 0,
  };

  let lastPayload = null;
  let lastCore = null;
  let planned = [];
  let drawingDoc = null;
  let lastIsoRect = null;
  let lastOrthoRects = null;
  let lastIsoRectByPage = {};
  let lastOrthoRectsByPage = {};
  let activePageMeta = null;
  const imageCache = {};

  function $(id) { return document.getElementById(id); }

  function shouldRenderSheet() {
    return !state.legacyView;
  }

  function paperBox() {
    return math.paperCssPx(state.paper, state.orient);
  }

  function applyPrintPage() {
    const mm = math.paperMm(state.paper, state.orient);
    const tag = $("v3-draw-print-page");
    const css = "@page{ size:" + state.paper + " " + (mm.landscape ? "landscape" : "portrait") + "; margin:0; }";
    if (tag) tag.textContent = css;
  }

  function applyCanvasCss() {
    const cv = $("cv");
    const box = paperBox();
    document.body.classList.toggle("is-legacy", !!state.legacyView);
    if (cv) {
      cv.style.width = box.w + "px";
      cv.style.height = box.h + "px";
    }
    applyPrintPage();
    return box;
  }

  function applyTypeVisibility() {
    const viewTabs = $("view-tabs");
    if (viewTabs) viewTabs.style.display = state.legacyView ? "flex" : "none";
    const isoBox = $("iso-control");
    if (isoBox && !state.legacyView) isoBox.style.display = "none";
    const dimHint = document.querySelector(".dim-hint");
    if (dimHint) dimHint.style.display = state.legacyView ? "" : "";
    const pageNav = $("page-nav");
    if (pageNav) pageNav.style.display = state.legacyView ? "none" : "flex";
    const scaleHint = $("draw-scale-hint");
    if (scaleHint && !state.legacyView) {
      scaleHint.textContent = "3D：左ドラッグ回転／右ドラッグ移動／ホイール拡大。正投影：パン・ズーム・寸法ドラッグ。チェックした図面だけ印刷します。";
    }
  }

  function readUi() {
    const paperEl = $("draw-paper");
    if (paperEl) state.paper = paperEl.value === "A3" ? "A3" : "A4";
    const oriEl = $("draw-orient");
    if (oriEl) state.orient = oriEl.value === "portrait" ? "portrait" : "landscape";
    state.title = ($("draw-title") && $("draw-title").value) || state.title;
    state.drawingNo = ($("draw-no") && $("draw-no").value) || state.drawingNo;
    state.date = ($("draw-date") && $("draw-date").value) || state.date;
    const scaleEl = $("draw-scale") || $("scale-select");
    if (scaleEl) state.scale = scaleEl.value || "auto";
    state.showDims = !$("draw-dims") || $("draw-dims").checked;
    state.showBom = !$("draw-bom") || $("draw-bom").checked;
    const legacy = $("draw-legacy");
    state.legacyView = !!(legacy && legacy.checked);
    applyTypeVisibility();
    applyCanvasCss();
  }

  function recomputeOverallOnPayload(payload) {
    if (!payload || !math || typeof math.computeRackOverall !== "function") return payload;
    if (!payload.joints || !payload.beams) return payload;
    try {
      const computed = math.computeRackOverall(payload, {
        beamEffective: function (b) {
          return Number(b && b.lengthMm) || 0;
        },
        poleNominal: function (p) {
          return Number(p && (p.lengthMm != null ? p.lengthMm : p.length)) || 0;
        },
      });
      if (computed) {
        payload.overall = Object.assign({}, payload.overall || {}, computed);
      }
      if (!payload.dims && payload.joints.length) {
        const axes = math.designAxes(payload.joints);
        payload.dims = {
          axes: axes,
          bayX: math.baySpans(axes.xs),
          bayZ: math.baySpans(axes.zs),
          levels: math.baySpans(axes.ys),
          spanX: axes.xs.length ? axes.xs[axes.xs.length - 1] - axes.xs[0] : 0,
          spanY: axes.ys.length ? axes.ys[axes.ys.length - 1] - axes.ys[0] : 0,
          spanZ: axes.zs.length ? axes.zs[axes.zs.length - 1] - axes.zs[0] : 0,
        };
      }
    } catch (e) {}
    return payload;
  }

  function ensureDocument(payload) {
    const p = payload || lastPayload || {};
    if (p.drawingDocument && pageStore) {
      drawingDoc = pageStore.loadDocument(p.drawingDocument, { drawingNoBase: state.drawingNo });
    } else if (!drawingDoc && pageStore) {
      drawingDoc = pageStore.createDefaultDocument({ drawingNoBase: state.drawingNo || (p.meta && p.meta.drawingNo) });
    }
    if (pageStore && drawingDoc) {
      pageStore.syncDrawingNoBase(drawingDoc, state.drawingNo || (p.meta && p.meta.drawingNo));
      if (drawingDoc.legend && Number.isFinite(drawingDoc.legend.nx)) state.legendNx = drawingDoc.legend.nx;
      if (drawingDoc.legend && Number.isFinite(drawingDoc.legend.ny)) state.legendNy = drawingDoc.legend.ny;
      pageStore.attachToPayload(drawingDoc, p);
    }
    return drawingDoc;
  }

  function persistDocument() {
    if (!drawingDoc || !lastPayload || !pageStore) return;
    pageStore.persistFromPayload(drawingDoc, lastPayload);
    drawingDoc.legend = { nx: state.legendNx, ny: state.legendNy };
    lastPayload.drawingDocument = drawingDoc;
    try {
      localStorage.setItem("cuberack.v3.drawingDocument", JSON.stringify(drawingDoc));
    } catch (e) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.v3DrawingDocumentCache = drawingDoc;
      }
    } catch (e2) {}
  }

  function setDocument(doc, opts) {
    drawingDoc = doc;
    if (lastPayload && pageStore) pageStore.attachToPayload(drawingDoc, lastPayload);
    const revEl = $("draw-rev");
    if (revEl && drawingDoc) revEl.value = drawingDoc.rev || "";
    if (!opts || !opts.skipRedraw) redraw();
    else persistDocument();
    if (window.v3DrawingPagesUi && typeof window.v3DrawingPagesUi.refresh === "function") {
      window.v3DrawingPagesUi.refresh();
    }
  }

  function getDocument() {
    return drawingDoc;
  }

  function fillFromPayload(payload) {
    lastPayload = recomputeOverallOnPayload(payload || lastPayload);
    const meta = (lastPayload && lastPayload.meta) || {};
    if ($("draw-title") && !$("draw-title").dataset.touched) {
      $("draw-title").value = meta.title || "Cube Rack";
      state.title = $("draw-title").value;
    }
    if ($("draw-no") && !$("draw-no").dataset.touched) {
      $("draw-no").value = meta.drawingNo || "";
      state.drawingNo = $("draw-no").value;
    }
    if (drawingDoc && pageStore && state.drawingNo && !drawingDoc.drawingNoBase) {
      pageStore.syncDrawingNoBase(drawingDoc, state.drawingNo);
    }
    if ($("draw-date") && !$("draw-date").dataset.touched) {
      $("draw-date").value = meta.date || "";
      state.date = $("draw-date").value;
    }
    try {
      const cached = localStorage.getItem("cuberack.v3.drawingDocument");
      if (cached && !lastPayload.drawingDocument) {
        lastPayload.drawingDocument = JSON.parse(cached);
      }
    } catch (e) {}
    ensureDocument(lastPayload);
    const revEl = $("draw-rev");
    if (revEl && drawingDoc) revEl.value = drawingDoc.rev || "";
  }

  function planPages(payload) {
    if (!pageStore) {
      const per = math.bomRowsPerPage(state.paper);
      const bom = (payload && payload.bom) || [];
      const pages = [{ kind: "iso", pageId: "iso1", branch: "01" }];
      if (state.showBom && bom.length) {
        const n = Math.max(1, Math.ceil(bom.length / per));
        for (let i = 0; i < n; i += 1) {
          pages.push({ kind: "bom", pageId: "bom" + i, branch: (i + 2 < 10 ? "0" : "") + (i + 2), start: i * per, per: per });
        }
      }
      return pages;
    }
    ensureDocument(payload);
    if (!drawingDoc || !drawingDoc.pages.length) return [];
    const per = math.bomRowsPerPage(state.paper);
    return drawingDoc.pages.map(function (pg) {
      if (pg.kind === "bom") {
        return {
          kind: "bom",
          pageId: pg.id,
          branch: pg.branch,
          start: pg.bomStart || 0,
          per: per,
          showDims: pg.showDims !== false,
          title: pg.title || "",
          print: pg.print !== false,
        };
      }
      if (pg.kind === "ortho") {
        return {
          kind: "ortho",
          pageId: pg.id,
          branch: pg.branch,
          orthoMode: pg.orthoMode || "front",
          showDims: pg.showDims !== false,
          title: pg.title || "",
          print: pg.print !== false,
        };
      }
      return {
        kind: "iso",
        pageId: pg.id,
        branch: pg.branch,
        showDims: pg.showDims !== false,
        title: pg.title || "",
        print: pg.print !== false,
      };
    });
  }

  function currentPlannedPage() {
    return planned[state.pageIndex] || null;
  }

  function activeOrthoRects(pageMeta) {
    if (!pageMeta || pageMeta.kind !== "ortho") return null;
    const stored = (pageMeta.pageId && lastOrthoRectsByPage[pageMeta.pageId]) || lastOrthoRects;
    const viewRect = stored && stored.active;
    if (!viewRect) return null;
    return {
      pageId: pageMeta.pageId,
      active: viewRect,
      mode: pageMeta.orthoMode || "front",
    };
  }

  function keepPageIndexById(pageId) {
    if (!pageId || !planned.length) return;
    const idx = planned.findIndex(function (p) { return p.pageId === pageId; });
    if (idx >= 0) state.pageIndex = idx;
  }

  function fitStage() {
    const sheet = $("sheet");
    const stage = $("draw-stage");
    const fit = $("draw-fit");
    if (!sheet || !stage || state.legacyView) return;
    const box = paperBox();
    if (document.body.classList.contains("is-printing")) {
      stage.style.transform = "none";
      if (fit) {
        fit.style.width = box.w + "px";
        fit.style.height = box.h + "px";
      }
      return;
    }
    const pad = 8;
    const availW = Math.max(80, sheet.clientWidth - pad);
    const availH = Math.max(80, sheet.clientHeight - pad);
    const s = Math.min(availW / box.w, availH / box.h);
    stage.style.transform = "scale(" + s + ")";
    if (fit) {
      fit.style.width = Math.round(box.w * s) + "px";
      fit.style.height = Math.round(box.h * s) + "px";
    }
  }

  function ensureCanvases(count) {
    const stage = $("draw-stage");
    if (!stage) return [];
    const box = paperBox();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const overlay = $("draw-iso-overlay");
    let canvases = Array.prototype.slice.call(stage.querySelectorAll("canvas.draw-page"));
    while (canvases.length > count) {
      const extra = canvases.pop();
      if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
    }
    for (let i = 0; i < count; i += 1) {
      let cv = canvases[i];
      if (!cv) {
        cv = document.createElement("canvas");
        cv.className = "draw-page";
        if (overlay) stage.insertBefore(cv, overlay);
        else stage.appendChild(cv);
        canvases[i] = cv;
      }
      cv.style.width = box.w + "px";
      cv.style.height = box.h + "px";
      const pw = Math.max(1, Math.round(box.w * dpr));
      const ph = Math.max(1, Math.round(box.h * dpr));
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
    }
    return canvases.slice(0, count);
  }

  function showPage(index) {
    if (!planned.length) {
      state.pageIndex = 0;
      activePageMeta = null;
      const pages = document.querySelectorAll(".draw-page");
      pages.forEach(function (cv, i) {
        cv.classList.toggle("is-current", i === 0);
      });
      const label = $("page-label");
      if (label) label.textContent = "0 / 0";
      const prev = $("page-prev");
      const next = $("page-next");
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
      if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.syncPage === "function") {
        window.v3DrawingIsoNav.syncPage(null);
      }
      if (window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.syncPage === "function") {
        window.v3DrawingOrthoNav.syncPage(null, null);
      }
      if (window.v3DrawingPagesUi && typeof window.v3DrawingPagesUi.refresh === "function") {
        window.v3DrawingPagesUi.refresh();
      }
      return;
    }
    state.pageIndex = Math.max(0, Math.min(index, planned.length - 1));
    activePageMeta = planned[state.pageIndex] || null;
    if (drawingDoc && activePageMeta) {
      drawingDoc.activePageId = activePageMeta.pageId;
      persistDocument();
    }
    const pages = document.querySelectorAll(".draw-page");
    pages.forEach(function (cv, i) {
      cv.classList.toggle("is-current", i === state.pageIndex);
    });
    const label = $("page-label");
    if (label) label.textContent = (state.pageIndex + 1) + " / " + Math.max(1, planned.length);
    const prev = $("page-prev");
    const next = $("page-next");
    if (prev) prev.disabled = state.pageIndex <= 0;
    if (next) next.disabled = state.pageIndex >= planned.length - 1;
    fitStage();
    if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.syncPage === "function") {
      window.v3DrawingIsoNav.syncPage(activePageMeta);
    }
    if (window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.syncPage === "function") {
      window.v3DrawingOrthoNav.syncPage(
        activePageMeta && activePageMeta.kind === "ortho" ? activePageMeta : null,
        activeOrthoRects(activePageMeta)
      );
    }
    if (window.v3DrawingPagesUi && typeof window.v3DrawingPagesUi.refresh === "function") {
      window.v3DrawingPagesUi.refresh();
    }
  }

  function overallValues(payload) {
    const dims = (payload && payload.dims) || {};
    const ov = (payload && payload.overall) || {};
    return {
      W: ov.W != null ? ov.W : dims.spanX,
      D: ov.D != null ? ov.D : dims.spanZ,
      H: ov.Htext ? ov.Htext : (ov.H != null ? ov.H : dims.spanY),
      outer: !!(ov.W || ov.D || ov.H || ov.Htext),
    };
  }

  function overallText(payload) {
    const fmt = math.formatDesignMm;
    const v = overallValues(payload);
    const prefix = v.outer ? "全体外形：" : "芯々：";
    const hStr = (typeof v.H === "string") ? v.H : fmt(v.H);
    return prefix + "W " + fmt(v.W) + " × D " + fmt(v.D) + " × H " + hStr + " mm";
  }

  function dimLines(payload) {
    const dims = (payload && payload.dims) || {};
    return [
      { label: "区画幅", value: math.summarizeSpans(dims.bayX) },
      { label: "区画奥行", value: math.summarizeSpans(dims.bayZ) },
      { label: "段高さ", value: math.summarizeSpans(dims.levels) },
    ];
  }

  function loadLegendPos() {
    try {
      const raw = sessionStorage.getItem("cuberack.v3.drawLegendPos");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && Number.isFinite(p.nx) && Number.isFinite(p.ny)) {
        state.legendNx = Math.max(0, Math.min(1, p.nx));
        state.legendNy = Math.max(0, Math.min(1, p.ny));
      }
    } catch (e) {}
  }

  function saveLegendPos() {
    try {
      sessionStorage.setItem("cuberack.v3.drawLegendPos", JSON.stringify({
        nx: state.legendNx,
        ny: state.legendNy,
      }));
    } catch (e2) {}
  }

  function stampSize(rows) {
    const n = (rows && rows.length) || 0;
    return { w: 118, h: Math.max(28, 22 + n * 16) };
  }

  function stampRect(isoRect, rows) {
    if (!isoRect) return null;
    const sz = stampSize(rows);
    const pad = 8;
    const maxX = Math.max(isoRect.x + pad, isoRect.x + isoRect.w - sz.w - pad);
    const maxY = Math.max(isoRect.y + pad, isoRect.y + isoRect.h - sz.h - pad);
    const x = isoRect.x + pad + (maxX - (isoRect.x + pad)) * (Number.isFinite(state.legendNx) ? state.legendNx : 1);
    const y = isoRect.y + pad + (maxY - (isoRect.y + pad)) * (Number.isFinite(state.legendNy) ? state.legendNy : 0);
    return {
      x: Math.min(Math.max(isoRect.x + pad, x), maxX),
      y: Math.min(Math.max(isoRect.y + pad, y), maxY),
      w: sz.w,
      h: sz.h,
    };
  }

  function drawPaper(ctx, W, H) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const dpr = ctx.canvas.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(10, 10, W - 20, H - 20);
  }

  function drawTitleBlock(ctx, payload, x, y, w, h, pageIndex, pageCount, scaleNote, pageMeta) {
    ctx.save();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);

    const brandW = Math.round(w * 0.22);
    const rest = w - brandW;
    const cols = [rest * 0.32, rest * 0.22, rest * 0.1, rest * 0.14, rest * 0.12, rest * 0.1];
    ctx.beginPath();
    ctx.moveTo(x + brandW, y);
    ctx.lineTo(x + brandW, y + h);
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "700 13px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CUBE RACK STUDIO", x + 12, y + 10);
    ctx.font = "10px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("V3.0  統合図面", x + 12, y + 28);

    const baseNo = (drawingDoc && drawingDoc.drawingNoBase) || state.drawingNo || (payload.meta && payload.meta.drawingNo) || "—";
    const branchNo = pageMeta && pageMeta.branch
      ? (pageStore ? pageStore.fullDrawingNo(drawingDoc, { branch: pageMeta.branch }) : baseNo + "-" + pageMeta.branch)
      : baseNo;
    const rev = (drawingDoc && drawingDoc.rev) ? String(drawingDoc.rev) : "—";
    const labels = ["図名", "図面番号", "Rev.", "作成日", "縮尺", "頁"];
    const vals = [
      state.title || (payload.meta && payload.meta.title) || "Cube Rack",
      branchNo,
      rev,
      state.date || (payload.meta && payload.meta.date) || "—",
      scaleNote || (state.scale === "auto" ? "AUTO" : "1:" + state.scale),
      (pageIndex + 1) + " / " + pageCount,
    ];
    let cx = x + brandW;
    cols.forEach(function (cw, i) {
      if (i) {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, y + h);
        ctx.stroke();
      }
      ctx.fillStyle = "#6b7280";
      ctx.font = "9px 'Segoe UI', 'Hiragino Sans', sans-serif";
      ctx.fillText(labels[i], cx + 8, y + 8);
      ctx.fillStyle = "#111827";
      ctx.font = "12px 'Segoe UI', 'Hiragino Sans', sans-serif";
      const text = String(vals[i] || "—");
      ctx.fillText(text.length > 28 ? text.slice(0, 27) + "…" : text, cx + 8, y + 26);
      cx += cw;
    });
    ctx.restore();
  }

  function usedLegendRows(payload) {
    const on = !!(payload && (payload.colorChartOn || (payload.preview && payload.preview.colorChartOn)));
    if (!on) return [];
    const fromSnap = payload.preview && Array.isArray(payload.preview.usedLengths) ? payload.preview.usedLengths : null;
    if (fromSnap && fromSnap.length) return fromSnap;
    const map = payload.preview && payload.preview.lengthColors;
    if (!map) return [];
    const used = {};
    function add(item) {
      if (!item) return;
      if (item.isCustom || item.isOrder) {
        used.order = map.order || "#7c3aed";
        return;
      }
      const len = Number(item.lengthMm) > 0 ? item.lengthMm : item.colorLengthMm;
      if (len == null) return;
      const keys = Object.keys(map);
      let key = "order";
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === "order") continue;
        if (Math.abs(Number(keys[i]) - Number(len)) <= 1e-3) {
          key = keys[i];
          break;
        }
      }
      used[key] = map[key] || map.order;
    }
    (payload.beams || []).forEach(add);
    (payload.poles || []).forEach(add);
    const rows = [];
    [25, 50, 100, 150, 200, 300, 400, 500, 600, 800].forEach(function (n) {
      const k = String(n);
      if (used[k]) rows.push({ key: k, color: used[k], label: k + " mm" });
    });
    if (used.order) rows.push({ key: "order", color: used.order, label: "オーダー" });
    return rows;
  }

  function drawPrintedLegend(ctx, rows, x, y, w, h) {
    if (!rows || !rows.length) return;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#334155";
    ctx.font = "700 9px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("使用長さ", x + 7, y + 5);
    rows.forEach(function (row, i) {
      const ry = y + 20 + i * 16;
      if (ry + 12 > y + h - 3) return;
      ctx.fillStyle = row.color || "#9ca3af";
      ctx.fillRect(x + 7, ry, 10, 10);
      ctx.strokeStyle = "#111827";
      ctx.strokeRect(x + 7, ry, 10, 10);
      ctx.fillStyle = "#111827";
      ctx.font = "10px 'Segoe UI', 'Hiragino Sans', sans-serif";
      ctx.fillText(row.label || row.key, x + 22, ry - 1);
    });
    ctx.restore();
  }

  function measureText(ctx, text, font) {
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  }

  function dimPanelHeight(ctx, payload, w) {
    const chunks = [];
    chunks.push(overallText(payload));
    dimLines(payload).forEach(function (row) {
      chunks.push(row.label + "：" + row.value);
    });
    ctx.save();
    ctx.font = "11px 'Segoe UI', 'Hiragino Sans', sans-serif";
    const inner = w - 20;
    let lineW = 0;
    let lines = 1;
    chunks.forEach(function (text, i) {
      const tw = ctx.measureText(text).width + (i ? 18 : 0);
      if (lineW && lineW + tw > inner) {
        lines += 1;
        lineW = tw - 18;
      } else {
        lineW += tw;
      }
    });
    ctx.restore();
    return Math.max(36, 14 + lines * 16);
  }

  function drawDimPanel(ctx, payload, x, y, w, h, withOverall) {
    ctx.save();
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const chunks = [];
    if (withOverall) chunks.push({ kind: "overall", text: overallText(payload) });
    dimLines(payload).forEach(function (row) {
      chunks.push({ kind: "span", text: row.label + "：" + row.value });
    });
    ctx.textBaseline = "top";
    const inner = w - 20;
    let cx = x + 10;
    let cy = y + 8;
    chunks.forEach(function (chunk, i) {
      ctx.font = chunk.kind === "overall"
        ? "700 11px 'Segoe UI', 'Hiragino Sans', sans-serif"
        : "11px 'Segoe UI', 'Hiragino Sans', sans-serif";
      const tw = ctx.measureText(chunk.text).width;
      if (i && cx + 16 + tw > x + 10 + inner) {
        cx = x + 10;
        cy += 16;
      } else if (i) {
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(cx + 5, cy + 4, 1, 10);
        cx += 16;
      }
      ctx.fillStyle = chunk.kind === "overall" ? "#111827" : "#334155";
      ctx.fillText(chunk.text, cx, cy);
      cx += tw;
    });
    ctx.restore();
  }

  function imageOf(captures, key) {
    const src = captures && captures[key];
    if (!src) return null;
    if (imageCache[key] && imageCache[key].src === src) return imageCache[key].el;
    const img = new Image();
    img.src = src;
    imageCache[key] = { src: src, el: img };
    img.onload = function () {
      if (window.v3DrawingSheet && typeof window.v3DrawingSheet.redraw === "function") {
        window.v3DrawingSheet.redraw();
      }
    };
    return img;
  }

  function drawCapture(ctx, img, x, y, w, h, caption) {
    ctx.save();
    ctx.fillStyle = "#f4f4f5";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    if (img && img.complete && img.naturalWidth) {
      const ir = img.naturalWidth / img.naturalHeight;
      const rr = w / h;
      let dw = w, dh = h, dx = x, dy = y;
      if (ir > rr) {
        dh = w / ir;
        dy = y + (h - dh) / 2;
      } else {
        dw = h * ir;
        dx = x + (w - dw) / 2;
      }
      const pad = 4;
      ctx.drawImage(img, dx + pad, dy + pad, dw - pad * 2, dh - pad * 2);
    } else {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "13px 'Segoe UI', 'Hiragino Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("3D完成イメージを準備中…", x + w / 2, y + h / 2);
    }
    if (caption) {
      ctx.fillStyle = "#64748b";
      ctx.font = "11px 'Segoe UI', 'Hiragino Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(caption, x + 10, y + h - 10);
    }
    ctx.restore();
  }

  function drawBomTable(ctx, rows, x, y, w, h, startNo) {
    ctx.save();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#111827";
    ctx.font = "700 13px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("部材一覧", x + 10, y + 10);

    const heads = ["No", "部材", "種類", "長さ", "材質", "数量"];
    const cols = [w * 0.08, w * 0.36, w * 0.16, w * 0.16, w * 0.12, w * 0.10];
    const headY = y + 34;
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(x + 1, headY - 6, w - 2, 22);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px 'Segoe UI', 'Hiragino Sans', sans-serif";
    let hx = x + 10;
    heads.forEach(function (name, i) {
      ctx.fillText(name, hx, headY);
      hx += cols[i];
    });

    const rowH = 20;
    rows.forEach(function (row, idx) {
      const yy = headY + 24 + idx * rowH;
      if (yy > y + h - 16) return;
      if (idx % 2 === 1) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(x + 1, yy - 4, w - 2, rowH);
      }
      const vals = [
        String((startNo || 1) + idx),
        row.name || row.key || "—",
        row.kind || "—",
        row.lengthMm == null ? "—" : math.formatDesignMm(row.lengthMm) + " mm",
        math.matLabel(row.material),
        String(row.qty || 0),
      ];
      let vx = x + 10;
      vals.forEach(function (val, i) {
        ctx.fillStyle = i === 5 ? "#111827" : "#1f2937";
        ctx.font = (i === 5 ? "700 " : "") + "11px 'Segoe UI', 'Hiragino Sans', sans-serif";
        ctx.fillText(String(val), vx, yy);
        vx += cols[i];
      });
    });
    ctx.restore();
  }

  function withThinView(payload, fn, pageMeta) {
    const prevHide = payload._hideDims;
    const prevScale = payload._lineScale;
    const prevPad = payload._viewPad;
    payload._lineScale = 0.28;
    payload._viewPad = 52;
    payload._hideDims = !state.showDims || (pageMeta && pageMeta.showDims === false);
    try { fn(); }
    finally {
      payload._hideDims = prevHide;
      payload._lineScale = prevScale;
      payload._viewPad = prevPad;
    }
  }

  function renderIsoPage(ctx, payload, core, W, H, pageIndex, pageCount, pageMeta) {
    const m = Math.max(22, Math.round(W * 0.028));
    const blockH = 48;
    const blockY = H - m - blockH;
    drawPaper(ctx, W, H);
    ctx.fillStyle = "#111827";
    ctx.font = "700 18px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(state.title || (payload.meta && payload.meta.title) || "Cube Rack", m, m);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.fillText("3D完成図 ／ 参考図（縮尺なし） ／ 床グリッド・選択枠・補助線は非表示", m, m + 24);

    const panelH = dimPanelHeight(ctx, payload, W - 2 * m);
    const isoY = m + 40;
    const isoH = blockY - isoY - panelH - 12;
    const legendRows = usedLegendRows(payload);
    lastIsoRect = { x: m, y: isoY, w: W - 2 * m, h: isoH };
    if (pageMeta && pageMeta.pageId) lastIsoRectByPage[pageMeta.pageId] = lastIsoRect;
    drawCapture(ctx, imageOf(payload.captures, "iso"), lastIsoRect.x, lastIsoRect.y, lastIsoRect.w, lastIsoRect.h, "");
    if (legendRows.length) {
      const st = stampRect(lastIsoRect, legendRows);
      if (st) drawPrintedLegend(ctx, legendRows, st.x, st.y, st.w, st.h);
    }
    drawDimPanel(ctx, payload, m, isoY + isoH + 8, W - 2 * m, panelH, true);
    drawTitleBlock(ctx, payload, m, blockY, W - 2 * m, blockH, pageIndex, pageCount, "参考図（縮尺なし）", pageMeta);
    syncLegendStamp(payload);
  }

  function orthoDimKind(mode) {
    if (mode === "left" || mode === "right") return "side";
    if (mode === "top" || mode === "bottom") return "top";
    return "front";
  }

  function renderOrthoSingle(ctx, payload, core, W, H, pageIndex, pageCount, pageMeta) {
    const m = Math.max(20, Math.round(W * 0.024));
    const blockH = 48;
    const blockY = H - m - blockH;
    const mode = (pageMeta && pageMeta.orthoMode) || "front";
    const title = (pageStore && pageStore.ORTHO_LABELS[mode]) || "正投影図";
    drawPaper(ctx, W, H);
    ctx.fillStyle = "#111827";
    ctx.font = "700 16px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(title, m, m);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Segoe UI', 'Hiragino Sans', sans-serif";
    ctx.fillText("投影法：第三角法    単位：mm    設計寸法（見積の整数丸めは使用しない）    モデルに無い情報は記載していません。", m, m + 22);

    const panelH = dimPanelHeight(ctx, payload, W - 2 * m);
    const gridY = m + 42;
    const gridH = blockY - gridY - panelH - 14;
    const viewRect = { x: m, y: gridY, w: W - 2 * m, h: gridH };
    const pageId = (pageMeta && pageMeta.pageId) || "ortho";
    lastOrthoRects = {
      pageId: pageId,
      active: viewRect,
      mode: mode,
    };
    lastOrthoRectsByPage[pageId] = lastOrthoRects;
    if (core && core.drawView) {
      payload._sheetCtx = ctx;
      const printing = document.body.classList.contains("is-printing");
      payload._skipOrthoMembers = !printing && !!(window.v3DrawingPreview && window.v3DrawingPreview.hasScene());
      withThinView(payload, function () {
        core.drawView(payload, mode, viewRect, title, pageId);
      }, pageMeta);
      payload._skipOrthoMembers = false;
      payload._sheetCtx = null;
    }
    drawDimPanel(ctx, payload, m, gridY + gridH + 8, W - 2 * m, panelH, true);
    const scaleTxt = state.scale === "auto" ? "AUTO" : "1:" + state.scale;
    drawTitleBlock(ctx, payload, m, blockY, W - 2 * m, blockH, pageIndex, pageCount, scaleTxt, pageMeta);
  }

  function renderBom(ctx, payload, page, W, H, pageIndex, pageCount) {
    const m = Math.max(22, Math.round(W * 0.028));
    const blockH = 48;
    const blockY = H - m - blockH;
    drawPaper(ctx, W, H);
    const all = payload.bom || [];
    const rows = all.slice(page.start, page.start + page.per);
    drawBomTable(ctx, rows, m, m, W - 2 * m, blockY - m - 10, page.start + 1);
    const scaleTxt = state.scale === "auto" ? "AUTO" : "1:" + state.scale;
    drawTitleBlock(ctx, payload, m, blockY, W - 2 * m, blockH, pageIndex, pageCount, scaleTxt, page);
  }

  function printNumbering(page, index) {
    const printing = document.body.classList.contains("is-printing");
    if (!printing) return { index: index, count: Math.max(1, planned.length) };
    const targets = planned.filter(function (p) { return p.print !== false; });
    const pi = targets.findIndex(function (p) { return p.pageId === page.pageId; });
    return { index: Math.max(0, pi), count: Math.max(1, targets.length) };
  }

  function applyPrintMarks() {
    const canvases = document.querySelectorAll(".draw-page");
    const targets = planned.filter(function (p) { return p.print !== false; });
    canvases.forEach(function (cv, i) {
      const page = planned[i];
      const on = !!(page && page.print !== false);
      cv.classList.toggle("is-print", on);
      cv.classList.toggle("is-print-last", on && targets.length && page.pageId === targets[targets.length - 1].pageId);
    });
  }

  function render(ctxIgnored, payload, core) {
    const stayId = (activePageMeta && activePageMeta.pageId)
      || (drawingDoc && drawingDoc.activePageId);
    lastPayload = payload || lastPayload;
    lastCore = core || lastCore;
    applyCanvasCss();
    if (!shouldRenderSheet()) return;
    const box = paperBox();
    planned = planPages(lastPayload || {});
    keepPageIndexById(stayId);
    if (state.pageIndex >= planned.length) state.pageIndex = Math.max(0, planned.length - 1);
    if (!planned.length) {
      const canvases = ensureCanvases(1);
      const cv = canvases[0];
      if (cv) {
        const ctx = cv.getContext("2d");
        drawPaper(ctx, box.w, box.h);
        ctx.fillStyle = "#64748b";
        ctx.font = "16px 'Segoe UI', 'Hiragino Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("図面がありません。", box.w / 2, box.h / 2);
      }
      persistDocument();
      showPage(0);
      fitStage();
      if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.syncPage === "function") {
        window.v3DrawingIsoNav.syncPage(null);
      }
      if (window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.syncPage === "function") {
        window.v3DrawingOrthoNav.syncPage(null, null);
      }
      if (window.v3DrawingPagesUi && typeof window.v3DrawingPagesUi.refresh === "function") {
        window.v3DrawingPagesUi.refresh();
      }
      return;
    }
    const canvases = ensureCanvases(planned.length);
    planned.forEach(function (page, i) {
      const cv = canvases[i];
      if (!cv) return;
      const ctx = cv.getContext("2d");
      const num = printNumbering(page, i);
      if (page.kind === "iso") renderIsoPage(ctx, lastPayload || {}, lastCore || {}, box.w, box.h, num.index, num.count, page);
      else if (page.kind === "ortho") renderOrthoSingle(ctx, lastPayload || {}, lastCore || {}, box.w, box.h, num.index, num.count, page);
      else renderBom(ctx, lastPayload || {}, page, box.w, box.h, num.index, num.count);
    });
    applyPrintMarks();
    persistDocument();
    showPage(state.pageIndex);
    fitStage();
    const active = currentPlannedPage();
    if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.syncPage === "function") {
      window.v3DrawingIsoNav.syncPage(active && active.kind === "iso" ? active : null);
    } else if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.layout === "function") {
      const isoRect = (active && active.pageId && lastIsoRectByPage[active.pageId]) || lastIsoRect;
      window.v3DrawingIsoNav.layout(isoRect, !!(active && active.kind === "iso" && !state.legacyView));
    }
    if (window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.syncPage === "function") {
      window.v3DrawingOrthoNav.syncPage(
        active && active.kind === "ortho" ? active : null,
        activeOrthoRects(active)
      );
    }
    syncLegendStamp(lastPayload);
  }

  function redraw() {
    if (typeof window.__CR_drawingRedraw === "function") window.__CR_drawingRedraw();
  }

  function printAll() {
    planned = planPages(lastPayload || {});
    const targets = planned.filter(function (p) { return p.print !== false; });
    if (!targets.length) {
      window.alert("印刷する図面がありません。左側のチェックを入れてください。");
      return;
    }
    document.body.classList.add("is-printing");
    const stage = $("draw-stage");
    if (stage) stage.style.transform = "none";
    if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.setPrint === "function") {
      window.v3DrawingIsoNav.setPrint(true);
    }
    if (window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.setPrint === "function") {
      window.v3DrawingOrthoNav.setPrint(true);
    }
    if (window.v3DrawingPreview && typeof window.v3DrawingPreview.setPrint === "function") {
      window.v3DrawingPreview.setPrint(true);
    }
    const go = function () {
      redraw();
      applyPrintMarks();
      window.print();
    };
    const needIso = targets.some(function (p) { return p.kind === "iso"; });
    if (needIso && window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.captureHighForPrint === "function") {
      window.v3DrawingIsoNav.captureHighForPrint().then(go);
    } else {
      go();
    }
  }

  function bind() {
    ["draw-paper", "draw-orient", "draw-scale", "scale-select", "draw-dims", "draw-bom", "draw-legacy"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        const paperChanged = id === "draw-paper" || id === "draw-orient";
        readUi();
        redraw();
        if (paperChanged && window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.onPaperChange === "function") {
          window.v3DrawingIsoNav.onPaperChange();
        }
        if (paperChanged && window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.onPaperChange === "function") {
          window.v3DrawingOrthoNav.onPaperChange();
        }
      });
    });
    ["draw-title", "draw-no", "draw-date"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", function () {
        el.dataset.touched = "1";
        readUi();
        if (id === "draw-no" && drawingDoc && pageStore) {
          drawingDoc.drawingNoBase = state.drawingNo;
        }
        redraw();
      });
    });
    const prev = $("page-prev");
    const next = $("page-next");
    if (prev) prev.addEventListener("click", function () { showPage(state.pageIndex - 1); });
    if (next) next.addEventListener("click", function () { showPage(state.pageIndex + 1); });
    const colorEl = $("draw-colorchart");
    if (colorEl) {
      colorEl.addEventListener("change", function () {
        const msg = { type: "CUBERACK_DRAWING_COLORCHART", on: !!colorEl.checked };
        try {
          if (window.opener && !window.opener.closed) window.opener.postMessage(msg, "*");
        } catch (e) {}
        try {
          const ch = window.__crDrawClientChannel || new BroadcastChannel("cuberack-drawing");
          window.__crDrawClientChannel = ch;
          ch.postMessage(msg);
        } catch (e2) {}
      });
    }
    const qualityEl = $("draw-quality");
    if (qualityEl) {
      qualityEl.addEventListener("change", function () {
        if (window.v3DrawingPreview && typeof window.v3DrawingPreview.setQuality === "function") {
          window.v3DrawingPreview.setQuality(qualityEl.value === "low" ? "low" : "high");
        }
      });
    }
    window.addEventListener("resize", fitStage);
    window.addEventListener("afterprint", function () {
      document.body.classList.remove("is-printing");
      if (window.v3DrawingIsoNav && typeof window.v3DrawingIsoNav.setPrint === "function") {
        window.v3DrawingIsoNav.setPrint(false);
      }
      if (window.v3DrawingOrthoNav && typeof window.v3DrawingOrthoNav.setPrint === "function") {
        window.v3DrawingOrthoNav.setPrint(false);
      }
      if (window.v3DrawingPreview && typeof window.v3DrawingPreview.setPrint === "function") {
        window.v3DrawingPreview.setPrint(false);
      }
      redraw();
      fitStage();
    });
    readUi();
    loadLegendPos();
    bindLegendStamp();
  }

  let stampEl = null;
  let stampDrag = null;

  function ensureStampEl() {
    const overlay = $("draw-iso-overlay");
    if (!overlay) return null;
    let el = $("draw-legend-stamp");
    if (!el) {
      el = document.createElement("div");
      el.id = "draw-legend-stamp";
      overlay.appendChild(el);
    }
    stampEl = el;
    return el;
  }

  function fillStamp(rows) {
    const el = ensureStampEl();
    if (!el) return;
    el.innerHTML = "";
    if (!rows || !rows.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const title = document.createElement("div");
    title.className = "draw-stamp-title";
    title.textContent = "使用長さ";
    el.appendChild(title);
    rows.forEach(function (row) {
      const line = document.createElement("div");
      line.className = "draw-stamp-row";
      const sw = document.createElement("span");
      sw.className = "draw-stamp-swatch";
      sw.style.background = row.color || "#9ca3af";
      const lab = document.createElement("span");
      lab.textContent = row.label || row.key;
      line.appendChild(sw);
      line.appendChild(lab);
      el.appendChild(line);
    });
  }

  function placeStamp(payload) {
    const el = ensureStampEl();
    if (!el || !lastIsoRect) return;
    const rows = usedLegendRows(payload);
    const printing = document.body.classList.contains("is-printing");
    const onPage = activePageMeta && activePageMeta.kind === "iso" && !state.legacyView;
    if (!rows.length || printing || !onPage) {
      el.hidden = true;
      return;
    }
    fillStamp(rows);
    const st = stampRect(lastIsoRect, rows);
    if (!st) {
      el.hidden = true;
      return;
    }
    el.style.left = (st.x - lastIsoRect.x) + "px";
    el.style.top = (st.y - lastIsoRect.y) + "px";
    el.style.width = st.w + "px";
    el.hidden = false;
  }

  function syncLegendStamp(payload) {
    placeStamp(payload || lastPayload);
  }

  function bindLegendStamp() {
    const el = ensureStampEl();
    if (!el || el.__crStampBound) return;
    el.__crStampBound = true;
    el.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      stampDrag = {
        x: ev.clientX,
        y: ev.clientY,
        nx: state.legendNx,
        ny: state.legendNy,
      };
      try { el.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
      ev.stopPropagation();
    });
    el.addEventListener("pointermove", function (ev) {
      if (!stampDrag || !lastIsoRect) return;
      const rows = usedLegendRows(lastPayload);
      const sz = stampSize(rows);
      const pad = 8;
      const spanX = Math.max(1, lastIsoRect.w - sz.w - pad * 2);
      const spanY = Math.max(1, lastIsoRect.h - sz.h - pad * 2);
      const overlay = $("draw-iso-overlay");
      const obr = overlay ? overlay.getBoundingClientRect() : null;
      const cssScale = obr && overlay.clientWidth
        ? obr.width / Math.max(1, overlay.clientWidth)
        : 1;
      const dx = (ev.clientX - stampDrag.x) / Math.max(0.05, cssScale);
      const dy = (ev.clientY - stampDrag.y) / Math.max(0.05, cssScale);
      state.legendNx = Math.max(0, Math.min(1, stampDrag.nx + dx / spanX));
      state.legendNy = Math.max(0, Math.min(1, stampDrag.ny + dy / spanY));
      placeStamp(lastPayload);
      ev.preventDefault();
      ev.stopPropagation();
    });
    el.addEventListener("pointerup", function (ev) {
      if (!stampDrag) return;
      stampDrag = null;
      saveLegendPos();
      redraw();
      ev.preventDefault();
      ev.stopPropagation();
    });
    el.addEventListener("pointercancel", function () {
      stampDrag = null;
    });
  }

  function renderLegend(map) {
    const box = $("draw-color-legend");
    if (!box) return;
    box.innerHTML = "";
    if (!map) return;
    Object.keys(map).forEach(function (key) {
      const row = document.createElement("div");
      row.className = "draw-legend-row";
      const sw = document.createElement("span");
      sw.className = "draw-legend-swatch";
      sw.style.background = map[key];
      const lab = document.createElement("span");
      lab.textContent = key === "order" ? "オーダー" : key + " mm";
      row.appendChild(sw);
      row.appendChild(lab);
      box.appendChild(row);
    });
  }

  function syncColorChart(payload) {
    const colorEl = $("draw-colorchart");
    const on = !!(payload && (payload.colorChartOn || (payload.preview && payload.preview.colorChartOn)));
    if (colorEl) colorEl.checked = on;
    const used = usedLegendRows(payload);
    if (used.length) {
      const map = {};
      used.forEach(function (row) { map[row.key] = row.color; });
      renderLegend(map);
    } else {
      const map = payload && payload.preview && payload.preview.lengthColors;
      renderLegend(on ? map : null);
    }
  }

  window.v3DrawingSheet = {
    state: state,
    shouldRenderSheet: shouldRenderSheet,
    render: render,
    redraw: redraw,
    fillFromPayload: fillFromPayload,
    applyCanvasCss: applyCanvasCss,
    bind: bind,
    paperBox: paperBox,
    planPages: planPages,
    getDocument: getDocument,
    setDocument: setDocument,
    persistDocument: persistDocument,
    printAll: printAll,
    showPage: showPage,
    fitStage: fitStage,
    isoRect: function () { return lastIsoRect; },
    orthoRects: function () { return activeOrthoRects(activePageMeta) || lastOrthoRects; },
    activePage: function () { return activePageMeta; },
    attachLegendStamp: function () { bindLegendStamp(); syncLegendStamp(lastPayload); },
    syncColorChart: syncColorChart,
    currentType: function () { return state.legacyView ? "legacy" : "unified"; },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
