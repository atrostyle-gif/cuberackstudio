// File: v1.0.8-dev/js/app/drawing.js
(() => {
  const statusEl = document.getElementById("status");
  const btnPrint = document.getElementById("btn-print");

  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");

  // Single view scale UI
  const singleScaleBox = document.getElementById("single-scale-box");
  const scaleSel = document.getElementById("scale-select");

  // Multi view scale UI (3 selects)
  const multiScaleBox = document.getElementById("multi-scale-box");
  const scaleMultiTopSel = document.getElementById("scale-multi-top");
  const scaleMultiFrontSel = document.getElementById("scale-multi-front");
  const scaleMultiSideSel = document.getElementById("scale-multi-side");

  // =========================================================
  // State
  // =========================================================
  let lastPayload = null;

  // tabs: "top" | "front" | "side" | "iso" | "multi"
  let currentView = "top";

  // canvas の「CSS上のサイズ」（px）を保持（cv.width ではない）
  let canvasW = 0;
  let canvasH = 0;

  // 許容縮尺（Auto のときに使う）
  const ALLOWED_DENOMS = [2, 5, 10, 20, 30, 50, 100];

  // 印刷を意識した px/mm（96dpi想定）
  const PX_PER_MM_PAPER = 96 / 25.4;

  // view別スケール（"auto" or 数字文字列）
  // singleタブ: top/front/side/iso
  // multi内3枠: multi_top / multi_front / multi_side
  const scaleByView = {
    top: "auto",
    front: "auto",
    side: "auto",
    iso: "auto",
    multi_top: "auto",
    multi_front: "auto",
    multi_side: "auto",
  };
  
  // 寸法線の位置オフセット（ドラッグで調整可能）
  // key: "viewKey_direction" (例: "top_width", "front_height")
  // value: { offsetX: number, offsetY: number } または null（デフォルト）
  const dimLineOffsets = {};
  let dimHoverKey = null;
  let dimActiveKey = null;

  let isoPitchDeg = 20; // ★初期値

  function persistDimOffsets(payload) {
    if (!payload) return;
    payload._dimOffsets = Object.assign({}, dimLineOffsets);
  }

  function restoreDimOffsets(payload) {
    if (!payload || !payload._dimOffsets) return;
    Object.keys(payload._dimOffsets).forEach(function (key) {
      dimLineOffsets[key] = payload._dimOffsets[key];
    });
  }

  function cssColorForPart(kind, item, payload) {
    const chart = !!(payload && (payload.colorChartOn || (payload.preview && payload.preview.colorChartOn)));
    if (chart && (kind === "beam" || kind === "pole")) {
      const map = payload.preview && payload.preview.lengthColors;
      if (item && (item.isCustom || item.isOrder)) return (map && map.order) || "#7c3aed";
      const len = kind === "pole" && item && Number(item.lengthMm) > 0
        ? item.lengthMm
        : (item && (item.colorLengthMm || item.lengthMm));
      if (map && len != null) {
        const keys = Object.keys(map);
        for (let i = 0; i < keys.length; i++) {
          if (keys[i] === "order") continue;
          if (Math.abs(Number(keys[i]) - Number(len)) <= 1e-3) return map[keys[i]];
        }
        return map.order || "#7c3aed";
      }
    }
    const mats = payload && payload.preview && payload.preview.materials;
    const code = (item && item.material) || (kind === "joint" ? "IRON" : "IRON");
    const hex = mats && mats[code];
    if (typeof hex === "number") return "#" + hex.toString(16).padStart(6, "0");
    if (typeof hex === "string" && hex.charAt(0) === "#") return hex;
    if (kind === "joint") return "#6b7280";
    if (kind === "leg") return "#57534e";
    return "#4b5563";
  }

  function depthW(x, y, z, mode) {
    if (mode === "back") return -z;
    if (mode === "left") return -x;
    if (mode === "right" || mode === "side") return x;
    if (mode === "top") return y;
    if (mode === "bottom") return -y;
    if (mode === "front") return z;
    return (x + y + z) / 3;
  }

  function drawCapsule(ctx2, x1, y1, x2, y2, r, fill) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    ctx2.save();
    ctx2.fillStyle = fill || "#4b5563";
    ctx2.strokeStyle = "#111827";
    ctx2.lineWidth = Math.max(0.7, Math.min(1.4, r * 0.22));
    if (len < 0.4) {
      ctx2.beginPath();
      ctx2.arc(x1, y1, r, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.stroke();
      ctx2.restore();
      return;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const ang = Math.atan2(ny, nx);
    ctx2.beginPath();
    ctx2.moveTo(x1 + nx * r, y1 + ny * r);
    ctx2.lineTo(x2 + nx * r, y2 + ny * r);
    ctx2.arc(x2, y2, r, ang, ang + Math.PI);
    ctx2.lineTo(x1 - nx * r, y1 - ny * r);
    ctx2.arc(x1, y1, r, ang + Math.PI, ang + Math.PI * 2);
    ctx2.closePath();
    ctx2.fill();
    ctx2.stroke();
    ctx2.restore();
  }

  // =========================================================
  // Canvas resize (CSS size -> real pixel size, DPR対応)
  // =========================================================
  function syncCanvasSize() {
    const cssW = Math.max(1, Math.floor(cv.clientWidth));
    const cssH = Math.max(1, Math.floor(cv.clientHeight));
    const dpr = window.devicePixelRatio || 1;

    const realW = Math.floor(cssW * dpr);
    const realH = Math.floor(cssH * dpr);

    if (cv.width !== realW || cv.height !== realH) {
      cv.width = realW;
      cv.height = realH;
    }

    // 以降の描画は「CSS px基準」で扱う
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    canvasW = cssW;
    canvasH = cssH;
  }

  window.addEventListener("resize", () => {
    syncCanvasSize();
    if (lastPayload) renderAll(lastPayload);
  });

  // =========================================================
  // UI
  // =========================================================
  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  btnPrint?.addEventListener("click", () => {
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.printAll === "function" && window.v3DrawingSheet.shouldRenderSheet()) {
      window.v3DrawingSheet.printAll();
      return;
    }
    window.print();
  });

  // Multi時にUIを切り替える
  function updateScaleUI() {
    const isMulti = currentView === "multi";
    if (singleScaleBox) singleScaleBox.style.display = isMulti ? "none" : "flex";
    if (multiScaleBox) multiScaleBox.style.display = isMulti ? "flex" : "none";
    // ISOのときだけ視点スライダーを表示
if (isoControlBox) isoControlBox.style.display = (currentView === "iso") ? "flex" : "none";

  }

  function setActiveTab(view) {
    currentView = view;

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === currentView);
    });

    updateScaleUI();

    // タブ切替時に、そのタブのスケール状態をUIへ反映
    if (currentView !== "multi") {
      if (scaleSel) scaleSel.value = scaleByView[currentView] ?? "auto";
    } else {
      if (scaleMultiTopSel) scaleMultiTopSel.value = scaleByView.multi_top ?? "auto";
      if (scaleMultiFrontSel) scaleMultiFrontSel.value = scaleByView.multi_front ?? "auto";
      if (scaleMultiSideSel) scaleMultiSideSel.value = scaleByView.multi_side ?? "auto";
    }
  }

  document.getElementById("view-tabs")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".tab-btn");
    if (!btn) return;

    const view = btn.dataset.view; // "top"|"front"|"side"|"iso"|"multi"
    setActiveTab(view);

    syncCanvasSize();
    if (lastPayload) renderAll(lastPayload);
  });

  // Single view scale: 現在タブ(top/front/side/iso)に保存
  scaleSel?.addEventListener("change", () => {
    if (currentView === "multi") return; // 念のため
    const v = String(scaleSel.value || "auto");
    scaleByView[currentView] = v;
    if (lastPayload) renderAll(lastPayload);
  });

  // Multi view scales: 3枠それぞれに保存
  scaleMultiTopSel?.addEventListener("change", () => {
    scaleByView.multi_top = String(scaleMultiTopSel.value || "auto");
    if (lastPayload) renderAll(lastPayload);
  });

  scaleMultiFrontSel?.addEventListener("change", () => {
    scaleByView.multi_front = String(scaleMultiFrontSel.value || "auto");
    if (lastPayload) renderAll(lastPayload);
  });

  scaleMultiSideSel?.addEventListener("change", () => {
    scaleByView.multi_side = String(scaleMultiSideSel.value || "auto");
    if (lastPayload) renderAll(lastPayload);
  });

  // ISO pitch UI
const isoControlBox = document.getElementById("iso-control");
const isoPitchSlider = document.getElementById("iso-pitch-slider");
const isoPitchVal = document.getElementById("iso-pitch-val");

// ISO pitch slider
if (isoPitchSlider) {
  // 初期表示をStateと同期
  isoPitchSlider.value = String(isoPitchDeg);
  if (isoPitchVal) isoPitchVal.textContent = isoPitchDeg + "°";

  isoPitchSlider.addEventListener("input", () => {
    isoPitchDeg = Number(isoPitchSlider.value);
    if (isoPitchVal) isoPitchVal.textContent = isoPitchDeg + "°";
    if (lastPayload) renderAll(lastPayload);
  });
}

  // 初期化
  setActiveTab(currentView);
  syncCanvasSize();

  // =========================================================
  // Canvas helpers
  // =========================================================
  function clear() {
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // =========================================================
  // Projection (3D -> 2D in mm)
  //   - top   : (u,v) = (x, z)
  //   - front : (u,v) = (x, -y)
  //   - side  : (u,v) = (z, -y)
  //   - iso   : isometric-ish (擬似3D)
  // =========================================================
  function projectJoint(j, mode) {
    if (!j) return null;
    if (window.v3DrawingView && typeof window.v3DrawingView.projectUv === "function"
        && mode && mode !== "iso") {
      return window.v3DrawingView.projectUv(j.x, j.y, j.z, mode === "side" ? "right" : mode);
    }

    if (mode === "top") return { u: j.x, v: j.z };
    if (mode === "bottom") return { u: j.x, v: -j.z };
    if (mode === "front") return { u: j.x, v: -j.y };
    if (mode === "back") return { u: -j.x, v: -j.y };
    if (mode === "side" || mode === "right") return { u: j.z, v: -j.y };
    if (mode === "left") return { u: -j.z, v: -j.y };

if (mode === "iso") {
  // CAD向け：純粋な軸測投影（パースなし）

  const yawDeg = -35;   // 左右（青を手前にする向き）
  const pitchDeg = isoPitchDeg;

  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Y軸回転（平面回転）
  const x1 = j.x * cy - j.z * sy;
  const z1 = j.x * sy + j.z * cy;

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // ★重要：奥(Z)は上へ → マイナス
  const u = x1;
  const v = (-j.y) * cp - z1 * sp;

  return { u, v };
}

    // fallback
    return { u: j.x, v: j.z };
  }

  function projectPoints(payload, mode) {
    const joints = payload.joints || [];
    return joints.map((j) => projectJoint(j, mode));
  }

  function getBoundsUV(points) {
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const p of points) {
      if (!p) continue;
      minU = Math.min(minU, p.u);
      maxU = Math.max(maxU, p.u);
      minV = Math.min(minV, p.v);
      maxV = Math.max(maxV, p.v);
    }

    if (!isFinite(minU)) {
      minU = 0; maxU = 1;
      minV = 0; maxV = 1;
    }
    return { minU, maxU, minV, maxV };
  }

  function chooseScaleDenom(sizeUmm, sizeVmm, rectWpx, rectHpx) {
    for (const denom of ALLOWED_DENOMS) {
      const pxPerMmReal = PX_PER_MM_PAPER / denom;
      const wpx = sizeUmm * pxPerMmReal;
      const hpx = sizeVmm * pxPerMmReal;
      if (wpx <= rectWpx && hpx <= rectHpx) return denom;
    }
    return ALLOWED_DENOMS[ALLOWED_DENOMS.length - 1];
  }

  function resolveDenomForView(viewKey, sizeU, sizeV, usableW, usableH) {
    const v = String(scaleByView[viewKey] ?? "auto");
    if (v !== "auto") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return chooseScaleDenom(sizeU, sizeV, usableW, usableH);
  }

  // =========================================================
  // Dimension line
  // =========================================================
  function drawDimLine(ctx2, x1, y1, x2, y2, label, opt) {
    ctx2.save();
    const hi = !!(opt && (opt.hover || opt.active));
    ctx2.strokeStyle = hi ? "#2563eb" : "#111827";
    ctx2.fillStyle = hi ? "#2563eb" : "#111827";
    ctx2.lineWidth = hi ? 2 : 1;

    ctx2.beginPath();
    ctx2.moveTo(x1, y1);
    ctx2.lineTo(x2, y2);
    ctx2.stroke();

    const head = 6;
    const ang = Math.atan2(y2 - y1, x2 - x1);

    function reflect(p, headLen, ang2, isX) {
      return isX ? (p - headLen * Math.cos(ang2)) : (p - headLen * Math.sin(ang2));
    }

    function arrow(px, py, a) {
      ctx2.beginPath();
      ctx2.moveTo(px, py);
      ctx2.lineTo(
        reflect(px, head, a - Math.PI / 6, true),
        reflect(py, head, a - Math.PI / 6, false)
      );
      ctx2.lineTo(
        reflect(px, head, a + Math.PI / 6, true),
        reflect(py, head, a + Math.PI / 6, false)
      );
      ctx2.closePath();
      ctx2.fill();
    }

    arrow(x1, y1, ang);
    arrow(x2, y2, ang + Math.PI);

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;

    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const style = opt && opt.style;
    const pxPerMm = opt && opt.pxPerMmPaper ? opt.pxPerMmPaper : (96 / 25.4);
    const fontMm = style && style.fontSizeMm ? style.fontSizeMm : 3.5;
    const gapMm = style && style.gapMm != null ? style.gapMm : 4;
    const gapPx = window.v3DrawingDimStyle
      ? window.v3DrawingDimStyle.gapPx(gapMm, pxPerMm)
      : Math.max(2, gapMm * pxPerMm);
    const fontPx = window.v3DrawingDimStyle
      ? window.v3DrawingDimStyle.fontPxFromMm(fontMm, pxPerMm)
      : Math.max(8, fontMm * pxPerMm);
    const side = window.v3DrawingDimStyle
      ? window.v3DrawingDimStyle.resolveTextSide(style || {}, isHorizontal)
      : (isHorizontal ? "below" : "right");
    ctx2.font = fontPx + "px system-ui";
    const pos = dimLabelPos(x1, y1, x2, y2, style, pxPerMm);
    const box = dimLabelBox(x1, y1, x2, y2, label, ctx2, style, pxPerMm);

    if (isHorizontal) {
      ctx2.textAlign = "center";
      ctx2.textBaseline = side === "above" ? "bottom" : "top";
      ctx2.fillText(label, pos.x, pos.y);
    } else {
      ctx2.translate(pos.x, pos.y);
      ctx2.rotate(-Math.PI / 2);
      ctx2.textAlign = "center";
      ctx2.textBaseline = side === "left" ? "top" : "bottom";
      ctx2.fillText(label, 0, 0);
    }

    ctx2.restore();
    return box;
  }

  function dimLabelPos(x1, y1, x2, y2, style, pxPerMm) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const ppm = pxPerMm > 0 ? pxPerMm : PX_PER_MM_PAPER;
    const gapMm = style && style.gapMm != null ? style.gapMm : 4;
    const gapPx = window.v3DrawingDimStyle ? window.v3DrawingDimStyle.gapPx(gapMm, ppm) : gapMm * ppm;
    const side = window.v3DrawingDimStyle
      ? window.v3DrawingDimStyle.resolveTextSide(style || {}, horiz)
      : (horiz ? "below" : "right");
    const alongPx = ((style && style.labelOffsetAlongMm) || 0) * ppm;
    const crossPx = ((style && style.labelOffsetCrossMm) || 0) * ppm;
    if (horiz) {
      const ty = side === "above" ? my - gapPx : my + gapPx;
      return { x: mx + alongPx, y: ty + crossPx, horiz: true, side: side };
    }
    const tx = side === "left" ? mx - gapPx : mx + gapPx;
    return { x: tx + crossPx, y: my + alongPx, horiz: false, side: side };
  }

  function dimLabelBox(x1, y1, x2, y2, label, ctx2, style, pxPerMm) {
    const pos = dimLabelPos(x1, y1, x2, y2, style, pxPerMm);
    const ppm = pxPerMm > 0 ? pxPerMm : PX_PER_MM_PAPER;
    const fontMm = style && style.fontSizeMm ? style.fontSizeMm : 3.5;
    const fontPx = window.v3DrawingDimStyle
      ? window.v3DrawingDimStyle.fontPxFromMm(fontMm, ppm)
      : Math.max(8, fontMm * ppm);
    let tw = String(label || "").length * fontPx * 0.55;
    if (ctx2 && ctx2.measureText) {
      const prev = ctx2.font;
      try {
        ctx2.font = fontPx + "px system-ui";
        tw = ctx2.measureText(label).width;
        ctx2.font = prev;
      } catch (e) {}
    }
    const th = fontPx;
    const pad = Math.max(4, fontPx * 0.35);
    if (pos.horiz) {
      return { x: pos.x - tw / 2 - pad, y: pos.y - (pos.side === "above" ? th + pad : 0), w: tw + pad * 2, h: th + pad };
    }
    return { x: pos.x - (pos.side === "left" ? th + pad : 0), y: pos.y - tw / 2 - pad, w: th + pad + 4, h: tw + pad * 2 };
  }

  function distToRect(px, py, r) {
    if (!r) return Infinity;
    const cx = Math.max(r.x, Math.min(px, r.x + r.w));
    const cy = Math.max(r.y, Math.min(py, r.y + r.h));
    return Math.hypot(px - cx, py - cy);
  }

  // =========================================================
  // Utility
  // =========================================================
  function quantize(v, step = 1) {
    return Math.round(v / step) * step;
  }

  // =========================================================
  // Pole reconstruction for ISO (fallback)
  //  - 同一(x,z)の点をyでソートして縦に繋ぐ
  // =========================================================
  function buildVerticalSegments3D(payload) {
    const joints = payload.joints || [];
    const map = new Map(); // key "x|z" -> array of {x,y,z}
    for (const j of joints) {
      if (!j) continue;
      const kx = quantize(j.x, 1);
      const kz = quantize(j.z, 1);
      const key = `${kx}|${kz}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ x: j.x, y: j.y, z: j.z });
    }

    const segs = [];
    for (const arr of map.values()) {
      arr.sort((a, b) => a.y - b.y);
      for (let i = 0; i < arr.length - 1; i++) {
        const a = arr[i];
        const b = arr[i + 1];
        if (Math.abs(a.y - b.y) < 0.001) continue;
        segs.push({ a, b });
      }
    }
    return segs;
  }

  // =========================================================
  // Legs
  // 期待: payload.legs = [{ jointIndex, lengthMm }, ...]
  // 無ければ「最下段より下へ少し」だけ推定で描く（最低限）
  //
  // ★重要：座標系の上下が反転していても「必ず床方向へ伸びる」ように
  //   bottomY(底面) を推定し、そこへ向かう符号 downSign を決める
  // =========================================================
  function buildLegSegments3D(payload) {
    const joints = payload.joints || [];
    const legs = payload.legs || null;
    const segs = [];

    // ---- 床方向の判定（joints から推定）----
    const ysAll = [];
    for (const jj of joints) if (jj) ysAll.push(jj.y);

    if (!ysAll.length) return segs;

    const EPSY = 0.001;
    const minY = Math.min(...ysAll);
    const maxY = Math.max(...ysAll);

    let countMin = 0, countMax = 0;
    for (const yv of ysAll) {
      if (Math.abs(yv - minY) < EPSY) countMin++;
      if (Math.abs(yv - maxY) < EPSY) countMax++;
    }

    // 点が多い側を「底面（床側）」とみなす
    const bottomY = (countMax > countMin) ? maxY : minY;

    // bottomY が maxY の場合、床方向は +Y 側、minY の場合は -Y 側
    const downSign = (bottomY === maxY) ? +1 : -1;

    // ---- 1) payload.legs がある場合：それを優先して描く ----
    if (Array.isArray(legs) && legs.length) {
      for (const lg of legs) {
        if (!lg) continue;
        const ji = lg.jointIndex;
        const base = joints[ji];
        if (!base) continue;

        let len =
          (typeof lg.lengthMm === "number" && lg.lengthMm > 0) ? lg.lengthMm :
          (typeof lg.length === "number" && lg.length > 0) ? lg.length :
          0;

        if (len <= 0) len = 13;

        segs.push({
          a: { x: base.x, y: base.y, z: base.z },
          b: { x: base.x, y: base.y + downSign * len, z: base.z },
        });
      }
      return segs;
    }

    // ---- 2) fallback：底面らしい点だけ、短い脚を推定で描く ----
    const guessLen = 13;

    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (!j) continue;

      if (Math.abs(j.y - bottomY) < EPSY) {
        const JOINT_R_MM = 6;
        const LEG_TOP_INSET_MM = 1;
        const LEG_TOP_DROP_MM = Math.max(0, JOINT_R_MM - LEG_TOP_INSET_MM);

        const a = { x: j.x, y: j.y + downSign * LEG_TOP_DROP_MM, z: j.z };
        const b = { x: j.x, y: j.y + downSign * guessLen,        z: j.z };

        segs.push({ a, b });
      }
    }

    return segs;
  }

  // =========================================================
  // Drawing core
  // =========================================================
  function drawView(payload, mode, rect, title, viewKeyForScale) {
    const ctx = (payload && payload._sheetCtx) || cv.getContext("2d");
    const joints = payload.joints || [];
    const beams = payload.beams || [];
    const polesPayload = payload.poles || [];

    if (!joints.length) return;
    if (rect.w <= 0 || rect.h <= 0) return;

    const slotCamEarly = (payload._orthoSlots && viewKeyForScale && payload._orthoSlots[viewKeyForScale]) || null;
    if (slotCamEarly && slotCamEarly.mode && slotCamEarly.mode !== mode) slotCamEarly.mode = mode;

    const MODE_TITLE = {
      front: "正面図 FRONT",
      back: "背面図 BACK",
      left: "左側面図 LEFT",
      right: "右側面図 SIDE",
      side: "側面図 SIDE",
      top: "上面図 TOP",
      bottom: "下面図 BOTTOM",
    };
    if (slotCamEarly && MODE_TITLE[mode]) title = MODE_TITLE[mode];

    const pts = projectPoints(payload, mode);
    const { minU, maxU, minV, maxV } = getBoundsUV(pts);

    const sizeU = (maxU - minU) || 1;
    const sizeV = (maxV - minV) || 1;

    const innerMargin = typeof payload._viewPad === "number" ? payload._viewPad : 52;
    const usableW = rect.w - innerMargin * 2;
    const usableH = rect.h - innerMargin * 2;

    const denom = resolveDenomForView(viewKeyForScale, sizeU, sizeV, usableW, usableH);
    const pxPerMmReal = PX_PER_MM_PAPER / denom;
    const slotCam = slotCamEarly;
    const camZoom = slotCam && slotCam.zoom > 0 ? slotCam.zoom : 1;
    const camPanU = slotCam && Number.isFinite(slotCam.panU) ? slotCam.panU : 0;
    const camPanV = slotCam && Number.isFinite(slotCam.panV) ? slotCam.panV : 0;

    const cu = (minU + maxU) / 2;
    const cvv = (minV + maxV) / 2;

    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    function toCanvasUV(u, v) {
      return {
        x: cx + (u - cu - camPanU) * pxPerMmReal * camZoom,
        y: cy + (v - cvv - camPanV) * pxPerMmReal * camZoom,
      };
    }

    function toCanvas3D(x, y, z) {
      const p = projectJoint({ x, y, z }, mode);
      if (!p) return { x: cx, y: cy };
      return toCanvasUV(p.u, p.v);
    }

    // ---- ISO: 奥側を薄くする簡易デプス表現 ----
    // スケールに応じて線の太さを調整（実寸: BEAM/POLE φ13mm）
    const BEAM_POLE_DIAMETER_MM = 13; // φ13mm
    const lineMul = typeof payload._lineScale === "number" ? payload._lineScale : 1;
    const scaledLineWidthBeam = Math.max(0.55, Math.min(2.4, BEAM_POLE_DIAMETER_MM * pxPerMmReal * lineMul));
    const scaledLineWidthPole = Math.max(0.55, Math.min(2.4, BEAM_POLE_DIAMETER_MM * pxPerMmReal * lineMul));
    
    function strokeIsoByDepth(Au, Av, Bu, Bv, kind /* "beam"|"pole" */) {
      if (mode !== "iso") {
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = (kind === "beam") ? scaledLineWidthBeam : scaledLineWidthPole;
        return;
      }

      const vAvg = (Av + Bv) * 0.5;
      const t = Math.max(0, Math.min(1, (vAvg - minV) / (maxV - minV || 1)));

      const aBase = (kind === "beam") ? 0.22 : 0.16;
      const aGain = (kind === "beam") ? 0.78 : 0.60;
      const alpha = aBase + aGain * t;

      ctx.strokeStyle = `rgba(17,24,39,${alpha})`;
      ctx.lineWidth = (kind === "beam") ? scaledLineWidthBeam : scaledLineWidthPole;
    }

    // 枠
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    // タイトル / 縮尺
    ctx.fillStyle = "#111827";
    ctx.font = lineMul < 1 ? "12px system-ui" : "18px system-ui";
    ctx.fillText(title, rect.x + 10, rect.y + (lineMul < 1 ? 16 : 24));

    ctx.font = lineMul < 1 ? "10px system-ui" : "12px system-ui";
    const isAuto = String(scaleByView[viewKeyForScale] ?? "auto") === "auto";
    ctx.fillText(isAuto ? `SCALE Auto (1:${denom})` : `SCALE 1:${denom}`, rect.x + 10, rect.y + (lineMul < 1 ? 30 : 42));

    ctx.save();
    ctx.beginPath();
    const titleBand = lineMul < 1 ? 36 : 48;
    ctx.rect(rect.x + 1, rect.y + titleBand, rect.w - 2, rect.h - titleBand - 1);
    ctx.clip();

    const EPS = 0.001;
    const skipMembers = !!payload._skipOrthoMembers;
    const BEAM_R_MM = 6.5;
    const JOINT_R_MM = 10;
    const ppmZoom = pxPerMmReal * camZoom;
    const beamR = Math.max(2.4, BEAM_R_MM * ppmZoom);
    const jointR = Math.max(3.2, JOINT_R_MM * ppmZoom);

    if (!skipMembers) {
      const solids = [];
      function pushSeg(kind, item, ax, ay, az, bx, by, bz, r) {
        solids.push({
          kind: kind,
          item: item,
          depth: (depthW(ax, ay, az, mode) + depthW(bx, by, bz, mode)) * 0.5,
          a: toCanvas3D(ax, ay, az),
          b: toCanvas3D(bx, by, bz),
          r: r,
        });
      }
      beams.forEach(function (b) {
        if (!b) return;
        const ja = joints[b.a];
        const jb = joints[b.b];
        if (!ja || !jb) return;
        pushSeg("beam", b, ja.x, ja.y, ja.z, jb.x, jb.y, jb.z, beamR);
      });
      const polesToDraw = (Array.isArray(polesPayload) && polesPayload.length)
        ? polesPayload
        : (mode === "iso" ? buildVerticalSegments3D(payload).map(function (seg) {
          return { aPos: seg.a, bPos: seg.b };
        }) : []);
      polesToDraw.forEach(function (p) {
        if (!p) return;
        const ja = p.aPos || joints[p.a];
        const jb = p.bPos || joints[p.b];
        if (!ja || !jb) return;
        pushSeg("pole", p, ja.x, ja.y, ja.z, jb.x, jb.y, jb.z, beamR);
      });
      const legSegs = buildLegSegments3D(payload);
      const LEG_TOP_W_MM = 10;
      const LEG_BOT_W_MM = 25;
      const topHalfPx = Math.max(1.6, (LEG_TOP_W_MM * ppmZoom) / 2);
      const botHalfPx = Math.max(2.4, (LEG_BOT_W_MM * ppmZoom) / 2);
      const jointMat = { material: "IRON" };
      joints.forEach(function (j) {
        if (!j) return;
        solids.push({
          kind: "joint",
          item: jointMat,
          depth: depthW(j.x, j.y, j.z, mode) + 0.4,
          a: toCanvas3D(j.x, j.y, j.z),
          b: null,
          r: jointR,
        });
      });
      if (legSegs.length) {
        const legFill = cssColorForPart("leg", payload.legs && payload.legs[0], payload);
        ctx.save();
        ctx.fillStyle = legFill;
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 0.8;
        legSegs.forEach(function (seg) {
          const pBase = toCanvas3D(seg.a.x, seg.a.y, seg.a.z);
          const pTip = toCanvas3D(seg.b.x, seg.b.y, seg.b.z);
          const dx = pTip.x - pBase.x;
          const dy = pTip.y - pBase.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.001) return;
          const px = -dy / len;
          const py = dx / len;
          ctx.beginPath();
          ctx.moveTo(pBase.x + px * topHalfPx, pBase.y + py * topHalfPx);
          ctx.lineTo(pBase.x - px * topHalfPx, pBase.y - py * topHalfPx);
          ctx.lineTo(pTip.x - px * botHalfPx, pTip.y - py * botHalfPx);
          ctx.lineTo(pTip.x + px * botHalfPx, pTip.y + py * botHalfPx);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      }
      solids.sort(function (a, b) { return a.depth - b.depth; });
      solids.forEach(function (s) {
        const fill = cssColorForPart(s.kind, s.item, payload);
        if (s.kind === "joint") {
          ctx.beginPath();
          ctx.fillStyle = fill;
          ctx.strokeStyle = "#111827";
          ctx.lineWidth = 0.8;
          ctx.arc(s.a.x, s.a.y, s.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          return;
        }
        drawCapsule(ctx, s.a.x, s.a.y, s.b.x, s.b.y, s.r, fill);
      });
    }

    const dimKind = (mode === "back") ? "front"
      : (mode === "left" || mode === "right") ? "side"
      : (mode === "bottom") ? "top"
      : mode;

    // 外形寸法（正投影）
    if (dimKind === "top" || dimKind === "front" || dimKind === "side") {
      // dimension-utils.js を使用して正確な外形寸法を計算
      let Wmm, Hmm, Dmm;
      
      // X方向（幅）のBeamを探して名目長さを取得
      // 同じY/Z座標でグループ化して、最も長いパスを選ぶ
      const xBeamsAll = beams.filter(b => {
        const ja = joints?.[b.a];
        const jb = joints?.[b.b];
        if (!ja || !jb) return false;
        const dx = Math.abs(jb.x - ja.x);
        const dy = Math.abs(jb.y - ja.y);
        const dz = Math.abs(jb.z - ja.z);
        return dx > 0 && dx > dz * 0.5 && dy < 5;
      });
      
      if (xBeamsAll.length > 0) {
        const yTolerance = 5;
        const zTolerance = 5;
        
        // 同じY/Z座標でグループ化
        const beamGroups = new Map();
        xBeamsAll.forEach(b => {
          const ja = joints?.[b.a];
          const jb = joints?.[b.b];
          if (!ja || !jb) return;
          const avgY = Math.round((ja.y + jb.y) / 2 / yTolerance) * yTolerance;
          const avgZ = Math.round((ja.z + jb.z) / 2 / zTolerance) * zTolerance;
          const key = `${avgY}_${avgZ}`;
          if (!beamGroups.has(key)) beamGroups.set(key, []);
          beamGroups.get(key).push(b);
        });
        
        // 各グループで、最も長いパスを選ぶ
        let maxTotalEffective = 0;
        let bestGroup = null;
        
        beamGroups.forEach((beams, key) => {
          const beamData = beams.map(b => {
            const ja = joints?.[b.a];
            const jb = joints?.[b.b];
            if (!ja || !jb) return null;
            const nominal = typeof window.getBeamNominalLengthMmSafe === "function"
              ? window.getBeamNominalLengthMmSafe(b)
              : (b.lengthMm || b.length || 0);
            if (nominal <= 0) return null;
            const effective = typeof window.getBeamEffectiveLengthMm === "function"
              ? window.getBeamEffectiveLengthMm(nominal)
              : nominal;
            return { beam: b, effective, nominal };
          }).filter(x => x && x.effective > 0);
          
          if (beamData.length === 0) return;
          
          const totalEffective = beamData.reduce((sum, b) => sum + b.effective, 0);
          if (totalEffective > maxTotalEffective) {
            maxTotalEffective = totalEffective;
            bestGroup = beamData;
          }
        });
        
        if (bestGroup) {
          const N = bestGroup.length;
          const sumEffective = bestGroup.reduce((sum, b) => sum + b.effective, 0);
          const JB = 18.3;
          const SC = 2.1;
          // 外寸 = Σ(L_i) + (N+1) × JB + 2 × SC
          Wmm = sumEffective + (N + 1) * JB + 2 * SC;
        }
      }
      
      // Z方向（奥行）のBeamを探して名目長さを取得
      // 同じX/Y座標でグループ化して、最も長いパスを選ぶ
      const zBeamsAll = beams.filter(b => {
        const ja = joints?.[b.a];
        const jb = joints?.[b.b];
        if (!ja || !jb) return false;
        const dx = Math.abs(jb.x - ja.x);
        const dy = Math.abs(jb.y - ja.y);
        const dz = Math.abs(jb.z - ja.z);
        return dz > 0 && dz > dx * 0.5 && dy < 5;
      });
      
      if (zBeamsAll.length > 0) {
        const xTolerance = 5;
        const yTolerance = 5;
        
        // 同じX/Y座標でグループ化
        const beamGroups = new Map();
        zBeamsAll.forEach(b => {
          const ja = joints?.[b.a];
          const jb = joints?.[b.b];
          if (!ja || !jb) return;
          const avgX = Math.round((ja.x + jb.x) / 2 / xTolerance) * xTolerance;
          const avgY = Math.round((ja.y + jb.y) / 2 / yTolerance) * yTolerance;
          const key = `${avgX}_${avgY}`;
          if (!beamGroups.has(key)) beamGroups.set(key, []);
          beamGroups.get(key).push(b);
        });
        
        // 各グループで、最も長いパスを選ぶ
        let maxTotalEffective = 0;
        let bestGroup = null;
        
        beamGroups.forEach((beams, key) => {
          const beamData = beams.map(b => {
            const ja = joints?.[b.a];
            const jb = joints?.[b.b];
            if (!ja || !jb) return null;
            const nominal = typeof window.getBeamNominalLengthMmSafe === "function"
              ? window.getBeamNominalLengthMmSafe(b)
              : (b.lengthMm || b.length || 0);
            if (nominal <= 0) return null;
            const effective = typeof window.getBeamEffectiveLengthMm === "function"
              ? window.getBeamEffectiveLengthMm(nominal)
              : nominal;
            return { beam: b, effective, nominal };
          }).filter(x => x && x.effective > 0);
          
          if (beamData.length === 0) return;
          
          const totalEffective = beamData.reduce((sum, b) => sum + b.effective, 0);
          if (totalEffective > maxTotalEffective) {
            maxTotalEffective = totalEffective;
            bestGroup = beamData;
          }
        });
        
        if (bestGroup) {
          const N = bestGroup.length;
          const sumEffective = bestGroup.reduce((sum, b) => sum + b.effective, 0);
          const JB = 18.3;
          const SC = 2.1;
          // 外寸 = Σ(L_i) + (N+1) × JB + 2 × SC
          Dmm = sumEffective + (N + 1) * JB + 2 * SC;
        }
      }
      
      // Y方向（高さ）のPoleを探して名目長さを取得
      // 同じX/Z座標でグループ化して、最も長いパスを選ぶ
      const yPolesAll = polesPayload.filter(p => {
        const ja = joints?.[p.a];
        const jb = joints?.[p.b];
        if (!ja || !jb) return false;
        const dx = Math.abs(jb.x - ja.x);
        const dy = Math.abs(jb.y - ja.y);
        const dz = Math.abs(jb.z - ja.z);
        return dy > 0 && dy > dx * 0.5 && dy > dz * 0.5;
      });
      
      if (yPolesAll.length > 0 && typeof window.calcPoleOuterHeightMm === "function") {
        const xTolerance = 5;
        const zTolerance = 5;
        
        // 同じX/Z座標でグループ化
        const poleGroups = new Map();
        yPolesAll.forEach(p => {
          const ja = joints?.[p.a];
          const jb = joints?.[p.b];
          if (!ja || !jb) return;
          const avgX = Math.round((ja.x + jb.x) / 2 / xTolerance) * xTolerance;
          const avgZ = Math.round((ja.z + jb.z) / 2 / zTolerance) * zTolerance;
          const key = `${avgX}_${avgZ}`;
          if (!poleGroups.has(key)) poleGroups.set(key, []);
          poleGroups.get(key).push(p);
        });
        
        // 各グループで、最も長いパスを選ぶ
        let maxTotalNominal = 0;
        let bestGroup = null;
        
        poleGroups.forEach((poles, key) => {
          const poleLengths = poles.map(p => {
            const nominal = p.lengthMm || p.length || 0;
            return nominal > 0 ? nominal : null;
          }).filter(n => n !== null);
          
          if (poleLengths.length === 0) return;
          
          const totalNominal = poleLengths.reduce((sum, n) => sum + n, 0);
          if (totalNominal > maxTotalNominal) {
            maxTotalNominal = totalNominal;
            bestGroup = poleLengths;
          }
        });
        
        if (bestGroup && typeof window.calcPoleOuterHeightMm === "function") {
          Hmm = window.calcPoleOuterHeightMm(bestGroup);
        }
      }
      let Hlabel = null;
      if (typeof window.summarizeRackProductHeightMm === "function"
          && typeof window.collectVerticalPoleSkuColumns === "function") {
        const hasLeg = !!(payload.legs && payload.legs.length);
        const sum = window.summarizeRackProductHeightMm(
          window.collectVerticalPoleSkuColumns(joints, polesPayload),
          hasLeg,
          true
        );
        if (sum && sum.unique && Number.isFinite(sum.value)) {
          Hmm = sum.value;
        } else if (sum && !sum.unique && sum.text) {
          if (Number.isFinite(sum.max)) Hmm = sum.max;
          Hlabel = sum.text;
        }
      }
      
      if (payload.overall) {
        if (payload.overall.W != null) Wmm = payload.overall.W;
        if (payload.overall.D != null) Dmm = payload.overall.D;
        if (payload.overall.H != null) Hmm = payload.overall.H;
        if (payload.overall.Htext) Hlabel = payload.overall.Htext;
      }

      // フォールバック：座標から直接計算（見積の整数丸めは使わない）
      if (typeof Wmm === "undefined") {
        Wmm = Math.round((maxU - minU) * 10) / 10;
      }
      if (typeof Hmm === "undefined") {
        Hmm = Math.round((maxV - minV) * 10) / 10;
      }
      if (typeof Dmm === "undefined") {
        Dmm = Hmm;
      }

      const pL = toCanvasUV(minU, (minV + maxV) / 2);
      const pR = toCanvasUV(maxU, (minV + maxV) / 2);
      const pT = toCanvasUV((minU + maxU) / 2, minV);
      const pB = toCanvasUV((minU + maxU) / 2, maxV);

      // スケールに応じてオフセットを調整（denomが大きいほどオフセットも大きく）
      // ただし、マルチビューの場合は各ビューが小さいので、オフセットを小さくする
      // 1:1の時は8px、1:2の時は16px、1:5の時は40pxなど
      // マルチビューの場合はさらに小さく（約半分）
      const isMultiView = viewKeyForScale && viewKeyForScale.startsWith("multi_");
      const ppmZ = pxPerMmReal * camZoom;
      const offMm = Math.max(isMultiView ? 22 : 32, dimScreenTol() * 2.2 / Math.max(0.2, ppmZ));
      const defaultOffMm = offMm;

      // 高さ方向の寸法線は、LEGの底面からTCの上面までを正確に表示
      // Hmmは外寸（LEGの底面からTCの上面まで）なので、実際の3D座標から計算
      let pHTop = pT; // デフォルトはpT
      let pHBottom = pB; // デフォルトはpB
      
      if (typeof Hmm !== "undefined" && Hmm > 0 && (dimKind === "front" || dimKind === "side")) {
        // 実際の3D座標から、LEGの底面とTCの上面を計算
        const joints = payload.joints || [];
        if (joints.length > 0) {
          // minYとmaxYを取得
          let minY3D = Infinity;
          let maxY3D = -Infinity;
          let centerX = 0;
          let centerZ = 0;
          joints.forEach(j => {
            if (j && typeof j.y === "number") {
              if (j.y < minY3D) minY3D = j.y;
              if (j.y > maxY3D) maxY3D = j.y;
            }
            if (j && typeof j.x === "number") centerX += j.x;
            if (j && typeof j.z === "number") centerZ += j.z;
          });
          centerX /= joints.length;
          centerZ /= joints.length;
          
          const floorFn = window.getFloorYFromBottomJointMm;
          const topFn = window.getTopOuterYFromJointMm;
          const bottomY = typeof floorFn === "function"
            ? floorFn(minY3D)
            : minY3D - ((typeof window.getFloorToBottomJbCenterMm === "function") ? window.getFloorToBottomJbCenterMm() : 22);
          const topY = typeof topFn === "function"
            ? topFn(maxY3D, true)
            : maxY3D + 9.1 + ((typeof window.getTopCapHeightMm === "function") ? window.getTopCapHeightMm() : 2.2);
          
          // 3D座標を投影
          const pBottom3D = toCanvas3D(centerX, bottomY, centerZ);
          const pTop3D = toCanvas3D(centerX, topY, centerZ);
          
          // front/sideモードでは、Y座標がV座標に対応
          if (dimKind === "front" || dimKind === "side") {
            pHBottom = { x: pBottom3D.x, y: pBottom3D.y };
            pHTop = { x: pTop3D.x, y: pTop3D.y };
          }
        }
      }

      const widthKey = `${viewKeyForScale}_width`;
      const depthKey = `${viewKeyForScale}_depth`;
      const heightKey = `${viewKeyForScale}_height`;

      function offsetMmOf(key, fallback) {
        const stored = dimLineOffsets[key];
        if (stored && Number.isFinite(Number(stored.offsetMm))) return Number(stored.offsetMm);
        if (stored && Number.isFinite(Number(stored.offsetY)) && fallback > 0 && stored.offsetY !== 0 && Math.abs(stored.offsetX || 0) < 1e-6) {
          return Number(stored.offsetY) / Math.max(0.001, ppmZ);
        }
        if (stored && Number.isFinite(Number(stored.offsetX)) && fallback > 0 && stored.offsetX !== 0 && Math.abs(stored.offsetY || 0) < 1e-6) {
          return Number(stored.offsetX) / Math.max(0.001, ppmZ);
        }
        return fallback;
      }

      const widthMm = offsetMmOf(widthKey, defaultOffMm);
      const depthMm = offsetMmOf(depthKey, defaultOffMm);
      const heightMm = offsetMmOf(heightKey, defaultOffMm);
      const dimLineRightX = pR.x + depthMm * ppmZ;
      const dimLineBottomY = pB.y + widthMm * ppmZ;
      const dimLineHeightX = pR.x + heightMm * ppmZ;

      const fmtMm = (window.v3DrawingMath && window.v3DrawingMath.formatDesignMm)
        ? window.v3DrawingMath.formatDesignMm
        : function (v) { return Number(v).toFixed(1); };

      function dimOpt(key, isHorizontal, direction) {
        const dir = direction || (key.indexOf("width") >= 0 ? "width" : key.indexOf("depth") >= 0 ? "depth" : "height");
        const style = window.v3DrawingDimStyle
          ? window.v3DrawingDimStyle.getStyle(payload._dimStyles, viewKeyForScale, dir, isHorizontal)
          : null;
        return {
          hover: dimHoverKey === key,
          active: dimActiveKey === key,
          style: style,
          pxPerMmPaper: PX_PER_MM_PAPER,
        };
      }

      function drawExt(ax, ay, bx, by, opt) {
        ctx.save();
        ctx.strokeStyle = opt && (opt.hover || opt.active) ? "#93c5fd" : "#94a3b8";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
      }

      if (!payload._hideDims) {
        if (dimKind === "top") {
          drawExt(pL.x, pB.y, pL.x, dimLineBottomY, dimOpt(widthKey));
          drawExt(pR.x, pB.y, pR.x, dimLineBottomY, dimOpt(widthKey));
          drawDimLine(ctx, pL.x, dimLineBottomY, pR.x, dimLineBottomY, `W ${fmtMm(Wmm)} mm`, dimOpt(widthKey));
          drawExt(pR.x, pT.y, dimLineRightX, pT.y, dimOpt(depthKey));
          drawExt(pR.x, pB.y, dimLineRightX, pB.y, dimOpt(depthKey));
          drawDimLine(ctx, dimLineRightX, pT.y, dimLineRightX, pB.y, `D ${fmtMm(Dmm)} mm`, dimOpt(depthKey));
        }

        if (dimKind === "front") {
          drawExt(pL.x, pB.y, pL.x, dimLineBottomY, dimOpt(widthKey));
          drawExt(pR.x, pB.y, pR.x, dimLineBottomY, dimOpt(widthKey));
          drawDimLine(ctx, pL.x, dimLineBottomY, pR.x, dimLineBottomY, `W ${fmtMm(Wmm)} mm`, dimOpt(widthKey));
          drawExt(pR.x, pHTop.y, dimLineHeightX, pHTop.y, dimOpt(heightKey));
          drawExt(pR.x, pHBottom.y, dimLineHeightX, pHBottom.y, dimOpt(heightKey));
          drawDimLine(ctx, dimLineHeightX, pHTop.y, dimLineHeightX, pHBottom.y, `H ${Hlabel || fmtMm(Hmm)} mm`, dimOpt(heightKey));
        }

        if (dimKind === "side") {
          drawExt(pL.x, pB.y, pL.x, dimLineBottomY, dimOpt(widthKey));
          drawExt(pR.x, pB.y, pR.x, dimLineBottomY, dimOpt(widthKey));
          drawDimLine(ctx, pL.x, dimLineBottomY, pR.x, dimLineBottomY, `D ${fmtMm(Dmm)} mm`, dimOpt(widthKey));
          drawExt(pR.x, pHTop.y, dimLineHeightX, pHTop.y, dimOpt(heightKey));
          drawExt(pR.x, pHBottom.y, dimLineHeightX, pHBottom.y, dimOpt(heightKey));
          drawDimLine(ctx, dimLineHeightX, pHTop.y, dimLineHeightX, pHBottom.y, `H ${Hlabel || fmtMm(Hmm)} mm`, dimOpt(heightKey));
        }
      }
    }
    ctx.restore();
  }

  function renderAll(payload) {
    if (window.v3DrawingSheet && window.v3DrawingSheet.shouldRenderSheet()) {
      window.v3DrawingSheet.render(ctx, payload, {
        canvasW: canvasW,
        canvasH: canvasH,
        drawView: drawView,
      });
      return;
    }
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.applyCanvasCss === "function") {
      window.v3DrawingSheet.applyCanvasCss();
    }
    syncCanvasSize();
    clear();

    const Wc = canvasW;
    const Hc = canvasH;

    const M = 30;

    if (currentView === "top") {
      drawView(payload, "top", { x: M, y: M, w: Wc - 2 * M, h: Hc - 2 * M }, "TOP VIEW", "top");
      return;
    }

    if (currentView === "front") {
      drawView(payload, "front", { x: M, y: M, w: Wc - 2 * M, h: Hc - 2 * M }, "FRONT VIEW", "front");
      return;
    }

    if (currentView === "side") {
      drawView(payload, "side", { x: M, y: M, w: Wc - 2 * M, h: Hc - 2 * M }, "SIDE VIEW", "side");
      return;
    }

    if (currentView === "iso") {
      drawView(payload, "iso", { x: M, y: M, w: Wc - 2 * M, h: Hc - 2 * M }, "ISO VIEW", "iso");
      return;
    }

    // multi：上=Top、左下=Front、右下=Side
    const gap = 16;

    const totalW = Wc - 2 * M;
    const totalH = Hc - 2 * M;

    const baseX = M;
    const baseY = M;

    const topRatio = 0.52;

    const topRect = {
      x: baseX,
      y: baseY,
      w: totalW,
      h: Math.floor(totalH * topRatio),
    };

    const botY = topRect.y + topRect.h + gap;
    const botH = totalH - topRect.h - gap;

    const leftRect = {
      x: baseX,
      y: botY,
      w: Math.floor((totalW - gap) / 2),
      h: botH,
    };

    const rightRect = {
      x: leftRect.x + leftRect.w + gap,
      y: botY,
      w: totalW - leftRect.w - gap,
      h: botH,
    };

    drawView(payload, "top", topRect, "TOP VIEW", "multi_top");
    drawView(payload, "front", leftRect, "FRONT VIEW", "multi_front");
    drawView(payload, "side", rightRect, "SIDE VIEW", "multi_side");
  }

  // =========================================================
  // postMessage receive
  // =========================================================
  function ingestPayload(payload) {
    if (!payload || typeof payload !== "object") {
      setStatus("data received but payload is invalid");
      return false;
    }
    lastPayload = {
      joints: Array.isArray(payload.joints) ? payload.joints : [],
      beams: Array.isArray(payload.beams) ? payload.beams : [],
      poles: Array.isArray(payload.poles) ? payload.poles : [],
      legs: Array.isArray(payload.legs) ? payload.legs : [],
      meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
      bom: Array.isArray(payload.bom) ? payload.bom : [],
      dims: payload.dims && typeof payload.dims === "object" ? payload.dims : {},
      overall: payload.overall && typeof payload.overall === "object" ? payload.overall : {},
      captures: payload.captures && typeof payload.captures === "object" ? payload.captures : {},
      preview: payload.preview && typeof payload.preview === "object" ? payload.preview : null,
      colorChartOn: !!payload.colorChartOn,
      drawingDocument: payload.drawingDocument || (lastPayload && lastPayload.drawingDocument) || null,
      _orthoSlots: payload._orthoSlots || (lastPayload && lastPayload._orthoSlots) || null,
      _isoViews: payload._isoViews || (lastPayload && lastPayload._isoViews) || null,
      _dimOffsets: payload._dimOffsets || (lastPayload && lastPayload._dimOffsets) || null,
      _dimStyles: payload._dimStyles || (lastPayload && lastPayload._dimStyles) || null,
    };
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.fillFromPayload === "function") {
      window.v3DrawingSheet.fillFromPayload(lastPayload);
    }
    restoreDimOffsets(lastPayload);
    setStatus(`data received (joints=${lastPayload.joints.length})`);
    if (window.v3DrawingPreview && lastPayload.preview) {
      window.v3DrawingPreview.setSnapshot(lastPayload.preview);
    }
    if (window.v3DrawingIsoNav && lastPayload.captures && lastPayload.captures.view
        && typeof window.v3DrawingIsoNav.seedIfEmpty === "function") {
      window.v3DrawingIsoNav.seedIfEmpty(lastPayload.captures.view);
    }
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.syncColorChart === "function") {
      window.v3DrawingSheet.syncColorChart(lastPayload);
    }
    renderAll(lastPayload);
    return true;
  }

  window.__CR_getDrawingPayload = function () { return lastPayload; };
  window.__CR_setCapture = function (image, view, overflow) {
    if (!lastPayload) return;
    lastPayload.captures = lastPayload.captures || {};
    if (image) lastPayload.captures.iso = image;
    if (view) lastPayload.captures.view = view;
    lastPayload.captures.overflow = !!overflow;
    renderAll(lastPayload);
  };

  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "CUBERACK_DRAWING_DATA") {
      ingestPayload(msg.payload);
    }
    if (msg.type === "CUBERACK_DRAWING_SNAPSHOT" && msg.preview && lastPayload) {
      lastPayload.preview = msg.preview;
      lastPayload.colorChartOn = !!msg.colorChartOn;
      if (msg.overall && typeof msg.overall === "object") lastPayload.overall = msg.overall;
      if (msg.dims && typeof msg.dims === "object") lastPayload.dims = msg.dims;
      if (window.v3DrawingPreview) window.v3DrawingPreview.setSnapshot(msg.preview);
      if (window.v3DrawingSheet && typeof window.v3DrawingSheet.syncColorChart === "function") {
        window.v3DrawingSheet.syncColorChart(lastPayload);
      }
      renderAll(lastPayload);
    }
  });

  try {
    const raw = localStorage.getItem("__cr_drawing_payload");
    if (raw) ingestPayload(JSON.parse(raw));
  } catch (e) {}

  // =========================================================
  // 寸法線ドラッグ機能
  // =========================================================
  let draggingDimLine = null; // { viewKey, direction, startX, startY, startOffset }
  let dimLineHitTolerance = 12;
  let dimLineVerticalHitTolerance = 12;

  function getDimLineKey(viewKey, direction) {
    return `${viewKey}_${direction}`;
  }

  function isPointNearLine(px, py, x1, y1, x2, y2, tolerance) {
    // 線分と点の距離を計算
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.001) {
      // 点として扱う
      const dist = Math.hypot(px - x1, py - y1);
      return dist <= tolerance;
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dist = Math.hypot(px - projX, py - projY);
    return dist <= tolerance;
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.001) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function dimScreenTol() {
    const page = document.querySelector(".draw-page.is-current") || cv;
    if (!page) return 12;
    const br = page.getBoundingClientRect();
    const cssW = page.clientWidth || br.width || 1;
    return 12 * (cssW / Math.max(1, br.width));
  }

  function sheetOrthoViews(payload) {
    const sheet = window.v3DrawingSheet;
    if (!sheet || !sheet.shouldRenderSheet || !sheet.shouldRenderSheet()) return null;
    const rects = typeof sheet.orthoRects === "function" ? sheet.orthoRects() : null;
    const active = typeof sheet.activePage === "function" ? sheet.activePage() : null;
    if (!rects || !active || active.kind !== "ortho" || !rects.active) return null;
    const pageId = active.pageId || rects.pageId || "ortho";
    const slots = (payload && payload._orthoSlots) || {};
    const mode = (slots[pageId] && slots[pageId].mode) || active.orthoMode || rects.mode || "front";
    return [{ mode: mode, viewKey: pageId, rect: rects.active }];
  }

  function findDimLineAtPoint(mouseX, mouseY, payload) {
    if (currentView === "iso") return null;

    const sheetViews = sheetOrthoViews(payload);
    const views = sheetViews || (currentView === "multi"
      ? [
          { mode: "top", viewKey: "multi_top", rect: null },
          { mode: "front", viewKey: "multi_front", rect: null },
          { mode: "side", viewKey: "multi_side", rect: null }
        ]
      : [{ mode: currentView, viewKey: currentView, rect: null }]);

    if (!sheetViews) {
      const Wc = canvasW;
      const Hc = canvasH;
      const M = 30;
      if (currentView === "multi") {
        const gap = 16;
        const totalW = Wc - 2 * M;
        const totalH = Hc - 2 * M;
        const topRatio = 0.52;
        views[0].rect = { x: M, y: M, w: totalW, h: Math.floor(totalH * topRatio) };
        const botY = views[0].rect.y + views[0].rect.h + gap;
        const botH = totalH - views[0].rect.h - gap;
        views[1].rect = { x: M, y: botY, w: Math.floor((totalW - gap) / 2), h: botH };
        views[2].rect = { x: views[1].rect.x + views[1].rect.w + gap, y: botY, w: totalW - views[1].rect.w - gap, h: botH };
      } else {
        views[0].rect = { x: M, y: M, w: Wc - 2 * M, h: Hc - 2 * M };
      }
    }
    
    const candidates = [];
    const screenTol = dimScreenTol();
    function consider(x1, y1, x2, y2, hit, tol, label) {
      const dLine = distToSeg(mouseX, mouseY, x1, y1, x2, y2);
      const style = window.v3DrawingDimStyle
        ? window.v3DrawingDimStyle.getStyle(payload._dimStyles, hit.viewKey, hit.direction, hit.isHorizontal)
        : null;
      const box = dimLabelBox(x1, y1, x2, y2, label || "", ctx, style, PX_PER_MM_PAPER);
      const dLab = distToRect(mouseX, mouseY, box);
      if (dLab <= tol && dLab <= dLine + 1) {
        candidates.push({ dist: dLab, hit: Object.assign({}, hit, { hitPart: "label" }) });
      } else if (dLine <= tol) {
        candidates.push({ dist: dLine, hit: Object.assign({}, hit, { hitPart: "line" }) });
      }
    }

    // 各ビューで寸法線を検索
    for (const view of views) {
      if (!view.rect) continue;
      const hitPad = screenTol;
      if (mouseX < view.rect.x - hitPad || mouseX > view.rect.x + view.rect.w + hitPad ||
          mouseY < view.rect.y - hitPad || mouseY > view.rect.y + view.rect.h + hitPad) continue;
      
      // このビュー内の寸法線を再計算して検出
      const pts = projectPoints(payload, view.mode);
      const { minU, maxU, minV, maxV } = getBoundsUV(pts);
      const sizeU = (maxU - minU) || 1;
      const sizeV = (maxV - minV) || 1;
      const innerMargin = typeof payload._viewPad === "number" ? payload._viewPad : 52;
      const usableW = view.rect.w - innerMargin * 2;
      const usableH = view.rect.h - innerMargin * 2;
      const denom = resolveDenomForView(view.viewKey, sizeU, sizeV, usableW, usableH);
      const pxPerMmReal = PX_PER_MM_PAPER / denom;
      const slotCam = payload._orthoSlots && payload._orthoSlots[view.viewKey];
      const camZoom = slotCam && slotCam.zoom > 0 ? slotCam.zoom : 1;
      const camPanU = slotCam && Number.isFinite(slotCam.panU) ? slotCam.panU : 0;
      const camPanV = slotCam && Number.isFinite(slotCam.panV) ? slotCam.panV : 0;
      const cu = (minU + maxU) / 2;
      const cvv = (minV + maxV) / 2;
      const cx = view.rect.x + view.rect.w / 2;
      const cy = view.rect.y + view.rect.h / 2;
      const ppmZ = pxPerMmReal * camZoom;
      
      function toCanvasUV(u, v) {
        return {
          x: cx + (u - cu - camPanU) * ppmZ,
          y: cy + (v - cvv - camPanV) * ppmZ,
        };
      }
      
      const pL = toCanvasUV(minU, (minV + maxV) / 2);
      const pR = toCanvasUV(maxU, (minV + maxV) / 2);
      const pT = toCanvasUV((minU + maxU) / 2, minV);
      const pB = toCanvasUV((minU + maxU) / 2, maxV);
      
      const isMultiView = view.viewKey && view.viewKey.startsWith("multi_");
      const defaultOffMm = Math.max(isMultiView ? 22 : 32, dimScreenTol() * 2.2 / Math.max(0.2, ppmZ));
      
      const widthKey = getDimLineKey(view.viewKey, "width");
      const depthKey = getDimLineKey(view.viewKey, "depth");
      const heightKey = getDimLineKey(view.viewKey, "height");

      function offsetMmOf(key) {
        const stored = dimLineOffsets[key];
        if (stored && Number.isFinite(Number(stored.offsetMm))) return Number(stored.offsetMm);
        return defaultOffMm;
      }
      
      const dimLineRightX = pR.x + offsetMmOf(depthKey) * ppmZ;
      const dimLineBottomY = pB.y + offsetMmOf(widthKey) * ppmZ;
      const dimLineHeightX = pR.x + offsetMmOf(heightKey) * ppmZ;
      
      const dimKind = (view.mode === "back") ? "front"
        : (view.mode === "left" || view.mode === "right") ? "side"
        : (view.mode === "bottom") ? "top"
        : view.mode;

      // 幅の寸法線（水平）- 検出範囲を広げる（ラベル部分も含む）
      if (dimKind === "top" || dimKind === "front" || dimKind === "side") {
        // 線分だけでなく、線分の両端から少し外側も検出範囲に含める
        const lineMinX = Math.min(pL.x, pR.x) - 20;
        const lineMaxX = Math.max(pL.x, pR.x) + 20;
        const lineY = dimLineBottomY;
        
        consider(pL.x, lineY, pR.x, lineY, {
          viewKey: view.viewKey,
          direction: "width",
          offsetMm: offsetMmOf(widthKey),
          ppmZ: ppmZ,
          isHorizontal: true,
        }, screenTol, dimKind === "side" ? "D" : "W");
      }
      
      // 奥行/高さの寸法線（垂直）- 検出範囲を広げる（ラベル部分も含む）
      if (dimKind === "top") {
        const lineX = dimLineRightX;
        const lineMinY = Math.min(pT.y, pB.y) - 30;
        const lineMaxY = Math.max(pT.y, pB.y) + 30;
        
        // TOPビューの奥行方向も縦方向の許容範囲を使用
        consider(lineX, pT.y, lineX, pB.y, {
          viewKey: view.viewKey,
          direction: "depth",
          offsetMm: offsetMmOf(depthKey),
          ppmZ: ppmZ,
          isHorizontal: false,
        }, screenTol, "D");
      } else if (dimKind === "front" || dimKind === "side") {
        // 高さ方向の寸法線を検出
        // pHTopとpHBottomを計算（LEGの底面とTCの上面）
        const joints = payload.joints || [];
        if (joints.length > 0) {
          let minY3D = Infinity;
          let maxY3D = -Infinity;
          let centerX = 0;
          let centerZ = 0;
          joints.forEach(j => {
            if (j && typeof j.y === "number") {
              if (j.y < minY3D) minY3D = j.y;
              if (j.y > maxY3D) maxY3D = j.y;
            }
            if (j && typeof j.x === "number") centerX += j.x;
            if (j && typeof j.z === "number") centerZ += j.z;
          });
          centerX /= joints.length;
          centerZ /= joints.length;
          const floorFn = window.getFloorYFromBottomJointMm;
          const topFn = window.getTopOuterYFromJointMm;
          const bottomY = typeof floorFn === "function"
            ? floorFn(minY3D)
            : minY3D - ((typeof window.getFloorToBottomJbCenterMm === "function") ? window.getFloorToBottomJbCenterMm() : 22);
          const topY = typeof topFn === "function"
            ? topFn(maxY3D, true)
            : maxY3D + 9.1 + ((typeof window.getTopCapHeightMm === "function") ? window.getTopCapHeightMm() : 2.2);
          
          // 3D座標を投影（drawViewと同じロジックを使用）
          function projectJointForHit(j) {
            return projectJoint(j, view.mode === "side" ? "right" : view.mode);
          }
          
          function toCanvas3D(x, y, z) {
            const p = projectJointForHit({ x, y, z });
            if (!p) return { x: cx, y: cy };
            return toCanvasUV(p.u, p.v);
          }
          
          const pBottom3D = toCanvas3D(centerX, bottomY, centerZ);
          const pTop3D = toCanvas3D(centerX, topY, centerZ);
          const pHBottom = { x: pBottom3D.x, y: pBottom3D.y };
          const pHTop = { x: pTop3D.x, y: pTop3D.y };
          
          // 線分だけでなく、線分の両端から少し外側も検出範囲に含める
          // 縦方向の寸法線は検出範囲を広げる
          const lineX = dimLineHeightX;
          const lineMinY = Math.min(pHTop.y, pHBottom.y) - 30;
          const lineMaxY = Math.max(pHTop.y, pHBottom.y) + 30;
          
          // 縦方向の寸法線はX方向の許容範囲を広げる
          consider(lineX, pHTop.y, lineX, pHBottom.y, {
            viewKey: view.viewKey,
            direction: "height",
            offsetMm: offsetMmOf(heightKey),
            ppmZ: ppmZ,
            isHorizontal: false,
          }, screenTol, "H");
        } else {
          const lineX = dimLineHeightX;
          consider(lineX, pT.y, lineX, pB.y, {
            viewKey: view.viewKey,
            direction: "height",
            offsetMm: offsetMmOf(heightKey),
            ppmZ: ppmZ,
            isHorizontal: false,
          }, screenTol, "H");
        }
      }
    }

    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return a.dist - b.dist; });
    return candidates[0].hit;
  }

  cv.addEventListener("mousedown", (e) => {
    if (!lastPayload) return;
    
    const rect = cv.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const hit = findDimLineAtPoint(mouseX, mouseY, lastPayload);
    if (hit) {
      draggingDimLine = {
        viewKey: hit.viewKey,
        direction: hit.direction,
        isHorizontal: hit.isHorizontal,
        startX: mouseX,
        startY: mouseY,
        startMm: hit.offsetMm,
        ppmZ: hit.ppmZ || 1,
      };
      dimActiveKey = getDimLineKey(hit.viewKey, hit.direction);
      cv.style.cursor = hit.isHorizontal ? "ns-resize" : "ew-resize";
      e.preventDefault();
    }
  });

  cv.addEventListener("mousemove", (e) => {
    if (!lastPayload) return;
    
    const rect = cv.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (draggingDimLine) {
      const key = getDimLineKey(draggingDimLine.viewKey, draggingDimLine.direction);
      const deltaX = mouseX - draggingDimLine.startX;
      const deltaY = mouseY - draggingDimLine.startY;
      
      const ppmZ = draggingDimLine.ppmZ || 1;
      if (draggingDimLine.isHorizontal) {
        dimLineOffsets[key] = { offsetMm: draggingDimLine.startMm + deltaY / ppmZ };
      } else {
        dimLineOffsets[key] = { offsetMm: draggingDimLine.startMm + deltaX / ppmZ };
      }
      persistDimOffsets(lastPayload);
      dimActiveKey = key;
      renderAll(lastPayload);
      e.preventDefault();
    } else {
      // ホバー時のカーソル変更
      const hit = findDimLineAtPoint(mouseX, mouseY, lastPayload);
      const nextHover = hit ? getDimLineKey(hit.viewKey, hit.direction) : null;
      if (nextHover !== dimHoverKey) {
        dimHoverKey = nextHover;
        renderAll(lastPayload);
      }
      if (hit) {
        cv.style.cursor = hit.isHorizontal ? "ns-resize" : "ew-resize";
      } else {
        cv.style.cursor = "default";
      }
    }
  });

  cv.addEventListener("mouseup", (e) => {
    if (draggingDimLine) {
      draggingDimLine = null;
      dimActiveKey = null;
      cv.style.cursor = "default";
      persistDimOffsets(lastPayload);
      renderAll(lastPayload);
      e.preventDefault();
    }
  });

  cv.addEventListener("mouseleave", () => {
    if (draggingDimLine) {
      draggingDimLine = null;
      cv.style.cursor = "default";
    }
  });

  // =========================================================
  // Handshake to opener
  // =========================================================
  window.__CR_drawingRedraw = function () {
    if (lastPayload) renderAll(lastPayload);
  };

  window.__CR_orthoViewMetrics = function (payload, mode, rect, viewKeyForScale) {
    const p = payload || lastPayload;
    if (!p || !rect) return null;
    const slotCamEarly = (p._orthoSlots && viewKeyForScale && p._orthoSlots[viewKeyForScale]) || null;
    let useMode = mode;
    if (slotCamEarly && slotCamEarly.mode && slotCamEarly.mode !== useMode) slotCamEarly.mode = useMode;
    const pts = projectPoints(p, useMode);
    const b = getBoundsUV(pts);
    const sizeU = (b.maxU - b.minU) || 1;
    const sizeV = (b.maxV - b.minV) || 1;
    const innerMargin = typeof p._viewPad === "number" ? p._viewPad : 52;
    const usableW = rect.w - innerMargin * 2;
    const usableH = rect.h - innerMargin * 2;
    const denom = resolveDenomForView(viewKeyForScale, sizeU, sizeV, usableW, usableH);
    const pxPerMmReal = PX_PER_MM_PAPER / denom;
    return {
      mode: useMode,
      minU: b.minU,
      maxU: b.maxU,
      minV: b.minV,
      maxV: b.maxV,
      pxPerMmReal: pxPerMmReal,
      camZoom: slotCamEarly && slotCamEarly.zoom > 0 ? slotCamEarly.zoom : 1,
      camPanU: slotCamEarly && Number.isFinite(slotCamEarly.panU) ? slotCamEarly.panU : 0,
      camPanV: slotCamEarly && Number.isFinite(slotCamEarly.panV) ? slotCamEarly.panV : 0,
      denom: denom,
    };
  };

  window.__CR_orthoAlignDebug = function (mode, rect, viewKey, payload, stOverride) {
    const p = payload || lastPayload;
    const m = window.v3DrawingView;
    if (!p || !rect || !m) return null;
    const useMode = mode || "front";
    const key = viewKey || useMode;
    const metrics = window.__CR_orthoViewMetrics(p, useMode, rect, key);
    if (!metrics) return null;
    const st = stOverride || (p._orthoSlots && p._orthoSlots[key]) || m.orthoDefault(useMode);
    const uv = { minU: metrics.minU, maxU: metrics.maxU, minV: metrics.minV, maxV: metrics.maxV };
    const ppm = metrics.pxPerMmReal;
    const frame = m.orthoFrame(st, p.preview && p.preview.box, rect, ppm, uv);
    const joints = p.joints || [];
    let maxJ = null;
    let maxU = -Infinity;
    let minJ = null;
    let minU = Infinity;
    joints.forEach(function (j) {
      if (!j) return;
      const q = projectJoint(j, useMode);
      if (!q) return;
      if (q.u > maxU) { maxU = q.u; maxJ = j; }
      if (q.u < minU) { minU = q.u; minJ = j; }
    });
    if (!maxJ) return null;
    const dimRight = m.orthoPaperFromUv(st, rect, ppm, uv, metrics.maxU, (metrics.minV + metrics.maxV) * 0.5);
    const dimLeft = m.orthoPaperFromUv(st, rect, ppm, uv, metrics.minU, (metrics.minV + metrics.maxV) * 0.5);
    const rackRight = m.orthoPaperFromWorld(frame, rect, maxJ);
    const rackLeft = m.orthoPaperFromWorld(frame, rect, minJ);
    return {
      mode: useMode,
      flipX: !!frame.flipX,
      denom: metrics.denom,
      dimRight: dimRight,
      rackRight: rackRight,
      dimLeft: dimLeft,
      rackLeft: rackLeft,
      errRightX: rackRight.x - dimRight.x,
      errLeftX: rackLeft.x - dimLeft.x,
      errRightY: rackRight.y - dimRight.y,
    };
  };

  window.__CR_hitDimLine = function (mouseX, mouseY, payload) {
    return findDimLineAtPoint(mouseX, mouseY, payload || lastPayload);
  };

  window.__CR_beginDimDrag = function (hit, mouseX, mouseY) {
    if (!hit) return;
    draggingDimLine = {
      viewKey: hit.viewKey,
      direction: hit.direction,
      isHorizontal: hit.isHorizontal,
      hitPart: hit.hitPart || "line",
      startX: mouseX,
      startY: mouseY,
      startMm: hit.offsetMm,
      startLabelCrossMm: 0,
      startLabelAlongMm: 0,
      ppmZ: hit.ppmZ || 1,
    };
    const styleKey = getDimLineKey(hit.viewKey, hit.direction);
    if (hit.hitPart === "label" && lastPayload) {
      if (!lastPayload._dimStyles) lastPayload._dimStyles = {};
      const st = lastPayload._dimStyles[styleKey] || {};
      draggingDimLine.startLabelCrossMm = Number(st.labelOffsetCrossMm) || 0;
      draggingDimLine.startLabelAlongMm = Number(st.labelOffsetAlongMm) || 0;
    }
    dimActiveKey = styleKey;
    if (window.v3DrawingDimInspector && typeof window.v3DrawingDimInspector.show === "function") {
      window.v3DrawingDimInspector.show({
        viewKey: hit.viewKey,
        direction: hit.direction,
        directionLabel: hit.direction === "width" ? "W" : hit.direction === "depth" ? "D" : "H",
        isHorizontal: hit.isHorizontal,
        valueText: "—",
      });
    }
  };

  window.__CR_moveDimDrag = function (mouseX, mouseY) {
    if (!draggingDimLine || !lastPayload) return false;
    const key = getDimLineKey(draggingDimLine.viewKey, draggingDimLine.direction);
    const ppmZ = draggingDimLine.ppmZ || 1;
    const deltaX = mouseX - draggingDimLine.startX;
    const deltaY = mouseY - draggingDimLine.startY;
    if (draggingDimLine.hitPart === "label") {
      if (!lastPayload._dimStyles) lastPayload._dimStyles = {};
      if (!lastPayload._dimStyles[key]) {
        lastPayload._dimStyles[key] = window.v3DrawingDimStyle
          ? window.v3DrawingDimStyle.defaultStyle(draggingDimLine.isHorizontal)
          : {};
      }
      const st = lastPayload._dimStyles[key];
      const paperPpm = PX_PER_MM_PAPER;
      if (draggingDimLine.isHorizontal) {
        st.labelOffsetAlongMm = draggingDimLine.startLabelAlongMm + deltaX / paperPpm;
        st.labelOffsetCrossMm = draggingDimLine.startLabelCrossMm + deltaY / paperPpm;
      } else {
        st.labelOffsetAlongMm = draggingDimLine.startLabelAlongMm + deltaY / paperPpm;
        st.labelOffsetCrossMm = draggingDimLine.startLabelCrossMm + deltaX / paperPpm;
      }
    } else if (draggingDimLine.isHorizontal) {
      dimLineOffsets[key] = { offsetMm: draggingDimLine.startMm + deltaY / ppmZ };
    } else {
      dimLineOffsets[key] = { offsetMm: draggingDimLine.startMm + deltaX / ppmZ };
    }
    persistDimOffsets(lastPayload);
    dimActiveKey = key;
    renderAll(lastPayload);
    return true;
  };

  window.__CR_endDimDrag = function () {
    const was = !!draggingDimLine;
    draggingDimLine = null;
    dimActiveKey = null;
    if (lastPayload) persistDimOffsets(lastPayload);
    if (window.v3DrawingSheet && typeof window.v3DrawingSheet.persistDocument === "function") {
      window.v3DrawingSheet.persistDocument();
    }
    if (was && lastPayload) renderAll(lastPayload);
    return was;
  };

  window.__CR_hoverDimLine = function (mouseX, mouseY, payload) {
    const hit = findDimLineAtPoint(mouseX, mouseY, payload || lastPayload);
    const nextHover = hit ? getDimLineKey(hit.viewKey, hit.direction) : null;
    if (nextHover !== dimHoverKey) {
      dimHoverKey = nextHover;
      if (lastPayload) renderAll(lastPayload);
    }
    return hit;
  };

  window.__CR_pageCanvasPoint = function (clientX, clientY) {
    const page = document.querySelector(".draw-page.is-current") || cv;
    if (!page) return { x: 0, y: 0 };
    const br = page.getBoundingClientRect();
    const scaleX = (page.width && br.width) ? (page.width / (window.devicePixelRatio || 1)) / br.width : 1;
    const cssW = page.clientWidth || br.width;
    const cssH = page.clientHeight || br.height;
    return {
      x: (clientX - br.left) * (cssW / Math.max(1, br.width)),
      y: (clientY - br.top) * (cssH / Math.max(1, br.height)),
    };
  };

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "CUBERACK_DRAWING_READY" }, "*");
      if (!lastPayload) setStatus("ready (notified opener)");
    } else {
      if (!lastPayload) setStatus("ready (no opener)");
    }
  } catch (e) {
    setStatus("ready (opener notify failed)");
  }
})();
