// =========================================================
// 図面共通計算（Nodeテスト可 / ブラウザでも使用）
// - 設計寸法は 0.1mm 表示。見積の整数丸めは使わない
// =========================================================
(function (root) {
  const PAPER_MM = {
    A4: { w: 297, h: 210 },
    A3: { w: 420, h: 297 },
  };
  const PX_PER_MM = 96 / 25.4;

  function formatDesignMm(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    const t = Math.round(n * 10) / 10;
    if (Math.abs(t - Math.round(t)) < 0.049) return String(Math.round(t));
    return t.toFixed(1);
  }

  function paperMm(size, orient) {
    const key = size === "A3" ? "A3" : "A4";
    const base = PAPER_MM[key];
    const landscape = orient !== "portrait";
    return landscape
      ? { w: base.w, h: base.h, landscape: true }
      : { w: base.h, h: base.w, landscape: false };
  }

  function paperCssPx(size, orient) {
    const mm = paperMm(size, orient);
    return {
      w: Math.round(mm.w * PX_PER_MM),
      h: Math.round(mm.h * PX_PER_MM),
      mm: mm,
    };
  }

  function uniqueSorted(vals, eps) {
    const e = typeof eps === "number" ? eps : 0.4;
    const nums = (vals || [])
      .map(Number)
      .filter(function (n) { return Number.isFinite(n); })
      .sort(function (a, b) { return a - b; });
    const out = [];
    nums.forEach(function (v) {
      if (!out.length || Math.abs(out[out.length - 1] - v) > e) out.push(v);
    });
    return out;
  }

  function baySpans(coords) {
    const c = coords || [];
    const out = [];
    for (let i = 1; i < c.length; i += 1) out.push(c[i] - c[i - 1]);
    return out;
  }

  function summarizeSpans(spans) {
    const list = Array.isArray(spans) ? spans.filter(function (n) { return Number.isFinite(n); }) : [];
    if (!list.length) return "—";
    const first = list[0];
    const same = list.every(function (s) { return Math.abs(s - first) < 0.15; });
    if (same) return formatDesignMm(first) + " mm × " + list.length;
    return list.map(formatDesignMm).join(" / ") + " mm";
  }

  function bomRowsPerPage(paper) {
    return paper === "A3" ? 28 : 20;
  }

  function planSheetPages(bomCount, showBom) {
    const pages = ["iso"];
    const n = Number(bomCount) || 0;
    if (showBom !== false && n > 0) {
      const per = 20;
      const chunks = Math.max(1, Math.ceil(n / per));
      for (let i = 0; i < chunks; i += 1) pages.push("bom:" + i);
    }
    return pages;
  }

  function designAxes(joints) {
    const list = Array.isArray(joints) ? joints.filter(Boolean) : [];
    return {
      xs: uniqueSorted(list.map(function (j) { return j.x; })),
      ys: uniqueSorted(list.map(function (j) { return j.y; })),
      zs: uniqueSorted(list.map(function (j) { return j.z; })),
    };
  }

  function mergeBom(modelRows, estimateRows) {
    const out = [];
    const seen = {};
    (modelRows || []).forEach(function (row) {
      if (!row || !row.qty) return;
      const key = String(row.key || row.kind + "|" + row.lengthMm + "|" + row.material);
      seen[key] = true;
      if (row.kind) seen[String(row.kind).toLowerCase()] = true;
      out.push(row);
    });
    (estimateRows || []).forEach(function (row) {
      if (!row || !row.qty) return;
      const key = String(row.key || "");
      const kind = String(row.kind || "");
      if (seen[key]) return;
      if (/^beam/i.test(key) || /^pole/i.test(key) || key === "jointBall" || key === "leg") return;
      if (kind === "Beam" || kind === "Pole" || kind === "JointBall" || kind === "Leg") return;
      out.push(row);
    });
    return out;
  }

  function matLabel(code) {
    const c = String(code || "IRON").toUpperCase();
    if (c === "IRON") return "Iron";
    if (c === "SUS") return "SUS";
    if (c === "BS" || c === "BR") return "Brass";
    if (c === "AL") return "AL";
    return String(code || "—");
  }

  // 完成ラック外々（製品実寸）。見積・図面で共通。
  // 水平: Σ(実効長) + (N+1)×JointBall + 2×SideCap
  const JOINT_BALL_MM = 18.3;
  const SIDE_CAP_MM = 2.1;

  function chainOuterMm(effectiveLengths) {
    const lens = (effectiveLengths || []).map(Number).filter(function (n) {
      return Number.isFinite(n) && n > 0;
    });
    if (!lens.length) return null;
    const sum = lens.reduce(function (s, v) { return s + v; }, 0);
    return sum + (lens.length + 1) * JOINT_BALL_MM + 2 * SIDE_CAP_MM;
  }

  function longestChain(joints, items, axis, valueOf) {
    const list = Array.isArray(items) ? items : [];
    const js = Array.isArray(joints) ? joints : [];
    const tol = 5;
    const groups = {};
    list.forEach(function (item) {
      if (!item) return;
      const ja = js[item.a];
      const jb = js[item.b];
      if (!ja || !jb) return;
      const dx = Math.abs(jb.x - ja.x);
      const dy = Math.abs(jb.y - ja.y);
      const dz = Math.abs(jb.z - ja.z);
      let along = 0;
      if (axis === "x") along = dx;
      else if (axis === "z") along = dz;
      else along = dy;
      if (along <= 0) return;
      if (axis === "x" && !(dx > dy * 0.5 && dx > dz * 0.5)) return;
      if (axis === "z" && !(dz > dx * 0.5 && dy < 5)) return;
      if (axis === "y" && !(dy > dx * 0.5 && dy > dz * 0.5)) return;
      let key;
      if (axis === "x") {
        key = Math.round(((ja.y + jb.y) / 2) / tol) * tol + "_" + Math.round(((ja.z + jb.z) / 2) / tol) * tol;
      } else if (axis === "z") {
        key = Math.round(((ja.x + jb.x) / 2) / tol) * tol + "_" + Math.round(((ja.y + jb.y) / 2) / tol) * tol;
      } else {
        key = Math.round(((ja.x + jb.x) / 2) / tol) * tol + "_" + Math.round(((ja.z + jb.z) / 2) / tol) * tol;
      }
      if (!groups[key]) groups[key] = [];
      const val = valueOf ? valueOf(item) : Number(item.lengthMm);
      if (Number.isFinite(val) && val > 0) groups[key].push(val);
    });
    let best = [];
    let bestSum = 0;
    Object.keys(groups).forEach(function (k) {
      const arr = groups[k];
      const sum = arr.reduce(function (s, v) { return s + v; }, 0);
      if (sum > bestSum) {
        bestSum = sum;
        best = arr;
      }
    });
    return best;
  }

  function computeRackOverall(payload, hooks) {
    const p = payload || {};
    const h = hooks || {};
    const joints = p.joints || [];
    const beamEff = function (item) {
      if (typeof h.beamEffective === "function") return h.beamEffective(item);
      return Number(item && item.lengthMm) || 0;
    };
    const poleNom = function (item) {
      if (typeof h.poleNominal === "function") return h.poleNominal(item);
      return Number(item && (item.colorLengthMm || item.lengthMm)) || 0;
    };
    const xEff = longestChain(joints, p.beams, "x", beamEff);
    const zEff = longestChain(joints, p.beams, "z", beamEff);
    const yNom = longestChain(joints, p.poles, "y", poleNom);
    const axes = designAxes(joints);
    const spanX = axes.xs.length ? axes.xs[axes.xs.length - 1] - axes.xs[0] : 0;
    const spanY = axes.ys.length ? axes.ys[axes.ys.length - 1] - axes.ys[0] : 0;
    const spanZ = axes.zs.length ? axes.zs[axes.zs.length - 1] - axes.zs[0] : 0;
    let W = chainOuterMm(xEff);
    let D = chainOuterMm(zEff);
    if (W == null && spanX) W = spanX + JOINT_BALL_MM + 2 * SIDE_CAP_MM;
    if (D == null && spanZ) D = spanZ + JOINT_BALL_MM + 2 * SIDE_CAP_MM;
    let H = null;
    const g = (typeof window !== "undefined") ? window : root;
    if (g && typeof g.calcFrameOuterHeightMm === "function" && spanY >= 0 && joints.length) {
      H = g.calcFrameOuterHeightMm(spanY, h.hasLeg !== false, true);
    } else if (yNom.length && typeof h.poleOuter === "function") {
      H = h.poleOuter(yNom);
      if (h.hasLeg === false && typeof h.legMm === "number") H -= h.legMm;
    } else if (spanY) {
      H = spanY;
    }
    return { W: W, D: D, H: H };
  }

  const api = {
    PX_PER_MM,
    JOINT_BALL_MM,
    SIDE_CAP_MM,
    formatDesignMm,
    paperMm,
    paperCssPx,
    uniqueSorted,
    baySpans,
    summarizeSpans,
    bomRowsPerPage,
    planSheetPages,
    designAxes,
    mergeBom,
    matLabel,
    chainOuterMm,
    longestChain,
    computeRackOverall,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.v3DrawingMath = api;
})(typeof window !== "undefined" ? window : globalThis);
