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

  let isoPitchDeg = 20; // ★初期値

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

  btnPrint?.addEventListener("click", () => window.print());

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

    if (mode === "top") return { u: j.x, v: j.z };
    if (mode === "front") return { u: j.x, v: -j.y };
    if (mode === "side") return { u: j.z, v: -j.y };

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
  function drawDimLine(ctx2, x1, y1, x2, y2, label) {
    ctx2.save();
    ctx2.strokeStyle = "#111827";
    ctx2.fillStyle = "#111827";
    ctx2.lineWidth = 1;

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
    const pad = 10;

    ctx2.font = "12px system-ui";

    if (isHorizontal) {
      ctx2.textAlign = "center";
      ctx2.textBaseline = "top";
      ctx2.fillText(label, mx, my + pad);
    } else {
      ctx2.textAlign = "left";
      ctx2.textBaseline = "middle";
      ctx2.fillText(label, mx + pad, my);
    }

    ctx2.restore();
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
    const joints = payload.joints || [];
    const beams = payload.beams || [];
    const polesPayload = payload.poles || [];

    if (!joints.length) return;
    if (rect.w <= 0 || rect.h <= 0) return;

    const pts = projectPoints(payload, mode);
    const { minU, maxU, minV, maxV } = getBoundsUV(pts);

    const sizeU = (maxU - minU) || 1;
    const sizeV = (maxV - minV) || 1;

    const innerMargin = 24;
    const usableW = rect.w - innerMargin * 2;
    const usableH = rect.h - innerMargin * 2;

    const denom = resolveDenomForView(viewKeyForScale, sizeU, sizeV, usableW, usableH);
    const pxPerMmReal = PX_PER_MM_PAPER / denom;

    const cu = (minU + maxU) / 2;
    const cvv = (minV + maxV) / 2;

    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    function toCanvasUV(u, v) {
      return { x: cx + (u - cu) * pxPerMmReal, y: cy + (v - cvv) * pxPerMmReal };
    }

    function toCanvas3D(x, y, z) {
      const p = projectJoint({ x, y, z }, mode);
      if (!p) return { x: cx, y: cy };
      return toCanvasUV(p.u, p.v);
    }

    // ---- ISO: 奥側を薄くする簡易デプス表現 ----
    // スケールに応じて線の太さを調整（実寸: BEAM/POLE φ13mm）
    const BEAM_POLE_DIAMETER_MM = 13; // φ13mm
    const scaledLineWidthBeam = BEAM_POLE_DIAMETER_MM * pxPerMmReal;
    const scaledLineWidthPole = BEAM_POLE_DIAMETER_MM * pxPerMmReal;
    
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
    ctx.font = "18px system-ui";
    ctx.fillText(title, rect.x + 10, rect.y + 24);

    ctx.font = "12px system-ui";
    const isAuto = String(scaleByView[viewKeyForScale] ?? "auto") === "auto";
    ctx.fillText(isAuto ? `SCALE Auto (1:${denom})` : `SCALE 1:${denom}`, rect.x + 10, rect.y + 42);

    const EPS = 0.001;

    // ---- Beam描画（viewごとに“見せたい向き”だけに絞る）----
    function beamAxisByPos(ja, jb) {
      const dx = Math.abs(ja.x - jb.x);
      const dy = Math.abs(ja.y - jb.y);
      const dz = Math.abs(ja.z - jb.z);
      if (dx >= dy && dx >= dz) return "x";
      if (dz >= dx && dz >= dy) return "z";
      return "y";
    }

    function shouldDrawBeamInMode(axis, mode2) {
      if (mode2 === "top") return (axis === "x" || axis === "z");
      if (mode2 === "front") return (axis === "x");
      if (mode2 === "side") return (axis === "z");
      if (mode2 === "iso") return (axis === "x" || axis === "z");
      return true;
    }

    beams.forEach((b) => {
      if (!b) return;

      const ia = (typeof b.a === "number") ? b.a : null;
      const ib = (typeof b.b === "number") ? b.b : null;
      if (ia === null || ib === null) return;

      const ja = joints[ia];
      const jb = joints[ib];
      if (!ja || !jb) return;

      const axis = (typeof b.axis === "string" && b.axis) ? b.axis : beamAxisByPos(ja, jb);
      if (!shouldDrawBeamInMode(axis, mode)) return;

      const A = projectJoint(ja, mode);
      const B = projectJoint(jb, mode);
      if (!A || !B) return;

      if (Math.abs(A.u - B.u) < EPS && Math.abs(A.v - B.v) < EPS) return;

      strokeIsoByDepth(A.u, A.v, B.u, B.v, "beam");

      const p1 = toCanvasUV(A.u, A.v);
      const p2 = toCanvasUV(B.u, B.v);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // ---- Pole描画（payload.poles を優先）----
    if (Array.isArray(polesPayload) && polesPayload.length) {
      polesPayload.forEach((p) => {
        if (!p) return;

        const ia = (typeof p.a === "number") ? p.a : null;
        const ib = (typeof p.b === "number") ? p.b : null;
        if (ia === null || ib === null) return;

        const ja = joints[ia];
        const jb = joints[ib];
        if (!ja || !jb) return;

        const A = projectJoint(ja, mode);
        const B = projectJoint(jb, mode);
        if (!A || !B) return;

        if (Math.abs(A.u - B.u) < EPS && Math.abs(A.v - B.v) < EPS) return;

        strokeIsoByDepth(A.u, A.v, B.u, B.v, "pole");

        const p1 = toCanvasUV(A.u, A.v);
        const p2 = toCanvasUV(B.u, B.v);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
    } else if (mode === "iso") {
      // 古いデータ対策：ISOだけ推定poleを補助で描く
      const inferred = buildVerticalSegments3D(payload);
      inferred.forEach((seg) => {
        const A = projectJoint(seg.a, mode);
        const B = projectJoint(seg.b, mode);
        if (!A || !B) return;

        strokeIsoByDepth(A.u, A.v, B.u, B.v, "pole");

        const p1 = toCanvasUV(A.u, A.v);
        const p2 = toCanvasUV(B.u, B.v);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
    }

    // LEG（脚）: 台形（ジョイント直下に“テーパー脚”）
    // 実寸: 底φ25×上部10×高さ16mm
    const legSegs = buildLegSegments3D(payload);
    if (legSegs.length) {
      const LEG_TOP_W_MM = 10;  // 上部φ10mm
      const LEG_BOT_W_MM = 25;  // 底φ25mm
      const LEG_HEIGHT_MM = 16; // 高さ16mm

      const topHalfPx = (LEG_TOP_W_MM * pxPerMmReal) / 2;
      const botHalfPx = (LEG_BOT_W_MM * pxPerMmReal) / 2;

      ctx.save();
      ctx.fillStyle = "#111827";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 1;

      function drawTrapezoid(pBase, pTip) {
        const dx = pTip.x - pBase.x;
        const dy = pTip.y - pBase.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return;

        const ux = dx / len;
        const uy = dy / len;

        const px = -uy;
        const py = ux;

        const topL = { x: pBase.x + px * topHalfPx, y: pBase.y + py * topHalfPx };
        const topR = { x: pBase.x - px * topHalfPx, y: pBase.y - py * topHalfPx };
        const botL = { x: pTip.x + px * botHalfPx, y: pTip.y + py * botHalfPx };
        const botR = { x: pTip.x - px * botHalfPx, y: pTip.y - py * botHalfPx };

        ctx.beginPath();
        ctx.moveTo(topL.x, topL.y);
        ctx.lineTo(topR.x, topR.y);
        ctx.lineTo(botR.x, botR.y);
        ctx.lineTo(botL.x, botL.y);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();
      }

      legSegs.forEach((seg) => {
        const pBase = toCanvas3D(seg.a.x, seg.a.y, seg.a.z);
        const pTip = toCanvas3D(seg.b.x, seg.b.y, seg.b.z);
        drawTrapezoid(pBase, pTip);
      });

      ctx.restore();
    }

    // Joint点（ジョイントボール）: 実寸 φ22.5mm
    const JOINT_BALL_DIAMETER_MM = 22.5; // φ22.5mm
    const jointBallRadiusPx = (JOINT_BALL_DIAMETER_MM * pxPerMmReal) / 2;
    
    joints.forEach((j) => {
      if (!j) return;
      const P = projectJoint(j, mode);
      if (!P) return;

      let alpha = 1;
      if (mode === "iso") {
        const t = Math.max(0, Math.min(1, (P.v - minV) / (maxV - minV || 1)));
        alpha = 0.25 + 0.75 * t;
      }

      const p = toCanvasUV(P.u, P.v);
      ctx.beginPath();
      ctx.fillStyle = (mode === "iso") ? `rgba(17,24,39,${alpha})` : "#111827";
      ctx.arc(p.x, p.y, jointBallRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      
      // 輪郭線も描画（見やすくするため）
      ctx.strokeStyle = (mode === "iso") ? `rgba(17,24,39,${alpha})` : "#111827";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 外形寸法（top/front/sideだけ）
    if (mode === "top" || mode === "front" || mode === "side") {
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
        
        if (bestGroup) {
          // 外形高さ = Σ(L_i) + (N+1) × D + LEG + TC
          Hmm = window.calcPoleOuterHeightMm(bestGroup);
        }
      }
      
      // フォールバック：座標から直接計算（dimension-utilsが使えない場合）
      if (typeof Wmm === "undefined") {
        Wmm = Math.round((maxU - minU) * 10) / 10;
      }
      if (typeof Hmm === "undefined") {
        Hmm = Math.round((maxV - minV) * 10) / 10;
      }
      if (typeof Dmm === "undefined") {
        Dmm = Hmm; // デフォルト
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
      const baseOffset = isMultiView ? 4 : 8;
      const off = baseOffset * denom;

      // 高さ方向の寸法線は、LEGの底面からTCの上面までを正確に表示
      // Hmmは外寸（LEGの底面からTCの上面まで）なので、実際の3D座標から計算
      let pHTop = pT; // デフォルトはpT
      let pHBottom = pB; // デフォルトはpB
      
      if (typeof Hmm !== "undefined" && Hmm > 0 && (mode === "front" || mode === "side")) {
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
          
          // LEGの底面・TCの上面は dimension-utils getter で算出
          const legMm = window.getLegHeightMm();
          const tcMm = window.getTopCapHeightMm();
          const bottomY = minY3D - legMm;
          const topY = maxY3D + tcMm;
          
          // 3D座標を投影
          const pBottom3D = toCanvas3D(centerX, bottomY, centerZ);
          const pTop3D = toCanvas3D(centerX, topY, centerZ);
          
          // front/sideモードでは、Y座標がV座標に対応
          if (mode === "front") {
            pHBottom = { x: pBottom3D.x, y: pBottom3D.y };
            pHTop = { x: pTop3D.x, y: pTop3D.y };
          } else if (mode === "side") {
            pHBottom = { x: pBottom3D.x, y: pBottom3D.y };
            pHTop = { x: pTop3D.x, y: pTop3D.y };
          }
        }
      }

      // 寸法線の位置を各ビューのrect内に収める
      const rectRight = rect.x + rect.w;
      const rectBottom = rect.y + rect.h;
      
      // 保存されたオフセットを取得
      const widthKey = `${viewKeyForScale}_width`;
      const depthKey = `${viewKeyForScale}_depth`;
      const heightKey = `${viewKeyForScale}_height`;
      
      const widthOffset = dimLineOffsets[widthKey] || { offsetX: 0, offsetY: off };
      const depthOffset = dimLineOffsets[depthKey] || { offsetX: off, offsetY: 0 };
      const heightOffset = dimLineOffsets[heightKey] || { offsetX: off, offsetY: 0 };
      
      // 右側の寸法線のX座標（rectの右端を超えないように）
      const dimLineRightX = Math.min(pR.x + depthOffset.offsetX, rectRight - 10);
      // 下側の寸法線のY座標（rectの下端を超えないように）
      const dimLineBottomY = Math.min(pB.y + widthOffset.offsetY, rectBottom - 10);
      
      // 高さ方向の寸法線のX座標
      const dimLineHeightX = Math.min(pR.x + heightOffset.offsetX, rectRight - 10);

      if (mode === "top") {
        drawDimLine(ctx, pL.x, dimLineBottomY, pR.x, dimLineBottomY, `W ${Wmm.toFixed(1)} mm`);
        drawDimLine(ctx, dimLineRightX, pT.y, dimLineRightX, pB.y, `D ${Dmm.toFixed(1)} mm`);
      }

      if (mode === "front") {
        drawDimLine(ctx, pL.x, dimLineBottomY, pR.x, dimLineBottomY, `W ${Wmm.toFixed(1)} mm`);
        drawDimLine(ctx, dimLineHeightX, pHTop.y, dimLineHeightX, pHBottom.y, `H ${Hmm.toFixed(1)} mm`);
      }

      if (mode === "side") {
        drawDimLine(ctx, pL.x, dimLineBottomY, pR.x, dimLineBottomY, `D ${Dmm.toFixed(1)} mm`);
        drawDimLine(ctx, dimLineHeightX, pHTop.y, dimLineHeightX, pHBottom.y, `H ${Hmm.toFixed(1)} mm`);
      }
    }
  }

  function renderAll(payload) {
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
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "CUBERACK_DRAWING_DATA") {
      const payload = msg.payload;

      if (!payload || typeof payload !== "object") {
        setStatus("data received but payload is invalid");
        return;
      }

      lastPayload = {
        joints: Array.isArray(payload.joints) ? payload.joints : [],
        beams: Array.isArray(payload.beams) ? payload.beams : [],
        poles: Array.isArray(payload.poles) ? payload.poles : [],
        legs: Array.isArray(payload.legs) ? payload.legs : [],
      };

      setStatus(`data received (joints=${lastPayload.joints.length})`);
      renderAll(lastPayload);
    }
  });

  // =========================================================
  // 寸法線ドラッグ機能
  // =========================================================
  let draggingDimLine = null; // { viewKey, direction, startX, startY, startOffset }
  let dimLineHitTolerance = 20; // クリック検出の許容範囲（px）を広げる
  let dimLineVerticalHitTolerance = 30; // 縦方向の寸法線用のより広い許容範囲（px）

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

  function findDimLineAtPoint(mouseX, mouseY, payload) {
    if (currentView === "iso") return null;
    
    // 現在のビューに応じて寸法線を検索
    const views = currentView === "multi" 
      ? [
          { mode: "top", viewKey: "multi_top", rect: null },
          { mode: "front", viewKey: "multi_front", rect: null },
          { mode: "side", viewKey: "multi_side", rect: null }
        ]
      : [{ mode: currentView, viewKey: currentView, rect: null }];
    
    // まずrectを計算
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
    
    // 各ビューで寸法線を検索
    for (const view of views) {
      if (!view.rect) continue;
      if (mouseX < view.rect.x || mouseX > view.rect.x + view.rect.w ||
          mouseY < view.rect.y || mouseY > view.rect.y + view.rect.h) continue;
      
      // このビュー内の寸法線を再計算して検出
      const pts = projectPoints(payload, view.mode);
      const { minU, maxU, minV, maxV } = getBoundsUV(pts);
      const sizeU = (maxU - minU) || 1;
      const sizeV = (maxV - minV) || 1;
      const innerMargin = 24;
      const usableW = view.rect.w - innerMargin * 2;
      const usableH = view.rect.h - innerMargin * 2;
      const denom = resolveDenomForView(view.viewKey, sizeU, sizeV, usableW, usableH);
      const pxPerMmReal = PX_PER_MM_PAPER / denom;
      const cu = (minU + maxU) / 2;
      const cvv = (minV + maxV) / 2;
      const cx = view.rect.x + view.rect.w / 2;
      const cy = view.rect.y + view.rect.h / 2;
      
      function toCanvasUV(u, v) {
        return { x: cx + (u - cu) * pxPerMmReal, y: cy + (v - cvv) * pxPerMmReal };
      }
      
      const pL = toCanvasUV(minU, (minV + maxV) / 2);
      const pR = toCanvasUV(maxU, (minV + maxV) / 2);
      const pT = toCanvasUV((minU + maxU) / 2, minV);
      const pB = toCanvasUV((minU + maxU) / 2, maxV);
      
      const isMultiView = view.viewKey && view.viewKey.startsWith("multi_");
      const baseOffset = isMultiView ? 4 : 8;
      const off = baseOffset * denom;
      
      const widthKey = getDimLineKey(view.viewKey, "width");
      const depthKey = getDimLineKey(view.viewKey, "depth");
      const heightKey = getDimLineKey(view.viewKey, "height");
      
      const widthOffset = dimLineOffsets[widthKey] || { offsetX: 0, offsetY: off };
      const depthOffset = dimLineOffsets[depthKey] || { offsetX: off, offsetY: 0 };
      const heightOffset = dimLineOffsets[heightKey] || { offsetX: off, offsetY: 0 };
      
      const rectRight = view.rect.x + view.rect.w;
      const rectBottom = view.rect.y + view.rect.h;
      const dimLineRightX = Math.min(pR.x + depthOffset.offsetX, rectRight - 10);
      const dimLineBottomY = Math.min(pB.y + widthOffset.offsetY, rectBottom - 10);
      const dimLineHeightX = Math.min(pR.x + heightOffset.offsetX, rectRight - 10);
      
      // 幅の寸法線（水平）- 検出範囲を広げる（ラベル部分も含む）
      if (view.mode === "top" || view.mode === "front" || view.mode === "side") {
        // 線分だけでなく、線分の両端から少し外側も検出範囲に含める
        const lineMinX = Math.min(pL.x, pR.x) - 20;
        const lineMaxX = Math.max(pL.x, pR.x) + 20;
        const lineY = dimLineBottomY;
        
        if (mouseX >= lineMinX && mouseX <= lineMaxX && 
            Math.abs(mouseY - lineY) <= dimLineHitTolerance) {
          return { viewKey: view.viewKey, direction: "width", offset: widthOffset, isHorizontal: true };
        }
      }
      
      // 奥行/高さの寸法線（垂直）- 検出範囲を広げる（ラベル部分も含む）
      if (view.mode === "top") {
        const lineX = dimLineRightX;
        const lineMinY = Math.min(pT.y, pB.y) - 30;
        const lineMaxY = Math.max(pT.y, pB.y) + 30;
        
        // TOPビューの奥行方向も縦方向の許容範囲を使用
        if (mouseY >= lineMinY && mouseY <= lineMaxY && 
            Math.abs(mouseX - lineX) <= dimLineVerticalHitTolerance) {
          return { viewKey: view.viewKey, direction: "depth", offset: depthOffset, isHorizontal: false };
        }
      } else if (view.mode === "front" || view.mode === "side") {
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
          const legMm = window.getLegHeightMm();
          const tcMm = window.getTopCapHeightMm();
          const bottomY = minY3D - legMm;
          const topY = maxY3D + tcMm;
          
          // 3D座標を投影（drawViewと同じロジックを使用）
          function projectJointForHit(j) {
            if (!j) return null;
            if (view.mode === "front") return { u: j.x, v: -j.y };
            if (view.mode === "side") return { u: j.z, v: -j.y };
            return null;
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
          if (mouseY >= lineMinY && mouseY <= lineMaxY && 
              Math.abs(mouseX - lineX) <= dimLineVerticalHitTolerance) {
            return { viewKey: view.viewKey, direction: "height", offset: heightOffset, isHorizontal: false };
          }
        } else {
          // フォールバック：pTとpBを使用
          const lineX = dimLineHeightX;
          const lineMinY = Math.min(pT.y, pB.y) - 30;
          const lineMaxY = Math.max(pT.y, pB.y) + 30;
          
          // 縦方向の寸法線はX方向の許容範囲を広げる
          if (mouseY >= lineMinY && mouseY <= lineMaxY && 
              Math.abs(mouseX - lineX) <= dimLineVerticalHitTolerance) {
            return { viewKey: view.viewKey, direction: "height", offset: heightOffset, isHorizontal: false };
          }
        }
      }
    }
    
    return null;
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
        startOffset: { ...hit.offset }
      };
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
      
      if (draggingDimLine.isHorizontal) {
        // 水平線（幅）：Y方向のみ移動
        dimLineOffsets[key] = {
          offsetX: draggingDimLine.startOffset.offsetX,
          offsetY: draggingDimLine.startOffset.offsetY + deltaY
        };
      } else {
        // 垂直線（奥行/高さ）：X方向のみ移動
        dimLineOffsets[key] = {
          offsetX: draggingDimLine.startOffset.offsetX + deltaX,
          offsetY: draggingDimLine.startOffset.offsetY
        };
      }
      
      renderAll(lastPayload);
      e.preventDefault();
    } else {
      // ホバー時のカーソル変更
      const hit = findDimLineAtPoint(mouseX, mouseY, lastPayload);
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
      cv.style.cursor = "default";
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
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "CUBERACK_DRAWING_READY" }, "*");
      setStatus("ready (notified opener)");
    } else {
      setStatus("ready (no opener)");
    }
  } catch (e) {
    setStatus("ready (opener notify failed)");
  }
})();
