// js/app/order-pricing.js
// CUBERACK Order pricing engine (Beam/Pole) - 合計メイン
// 1円単位：四捨五入（Math.round）
// 参考単価：100円単位四捨五入（Math.round(x/100)*100）

const STOCK_LENS_BEAM = [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
const STOCK_LENS_POLE = [50, 100, 200, 300, 400, 500, 600, 800];

const DEFAULT_SETUP_FEE_CUT = 3000;
const DEFAULT_SETUP_FEE_BUILD = 6000;

// 既製価格のフォールバック（PART_PRICE_BY_MATERIAL が正本。初期値はそれと一致）
const DEFAULT_STOCK_PRICE = {
  IRON: {
    BEAM: { 25:380, 50:420, 100:470, 150:470, 200:500, 300:580, 400:680, 500:850, 600:800, 800:930 },
    POLE: { 50:410, 100:470, 200:500, 300:580, 400:680, 500:750, 600:800, 800:930 },
  },
  BS: {
    BEAM: { 25:500, 50:570, 100:650, 150:790, 200:920, 300:1200, 400:1380, 500:1790, 600:2200, 800:2570 },
    POLE: { 50:520, 100:580, 200:870, 300:1120, 400:1380, 500:1700, 600:2020, 800:2380 },
  },
  SUS: {
    BEAM: { 25:580, 50:670, 100:730, 150:780, 200:830, 300:1020, 400:1200, 500:1385, 600:1570, 800:2020 },
    POLE: { 50:600, 100:650, 200:830, 300:1020, 400:1200, 500:1400, 600:1570, 800:1830 },
  },
};

let STOCK_PRICE = JSON.parse(JSON.stringify(DEFAULT_STOCK_PRICE));

// パラメータ（IRONは確定、BS/SUSは暫定）
const DEFAULT_PARAMS = {
  IRON: {
    BEAM: { A: 390.68, B: 0.6797, k_cut: 2.10, k_build: 1.92 },
    POLE: { A: 390.68, B: 0.6797, k_cut: 2.10, k_build: 1.92 },
  },
  BS: {
    BEAM: { A: 309.66, B: 2.9102, k_cut: 2.10, k_build: 1.92 },
    POLE: { A: 367.12, B: 2.5864, k_cut: 2.10, k_build: 1.92 },
  },
  SUS: {
    BEAM: { A: 406.95, B: 1.9915, k_cut: 2.10, k_build: 1.92 },
    POLE: { A: 545.42, B: 1.6373, k_cut: 2.10, k_build: 1.92 },
  },
};

let PARAMS = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
let SETUP_FEE_CUT = DEFAULT_SETUP_FEE_CUT;
let SETUP_FEE_BUILD = DEFAULT_SETUP_FEE_BUILD;

function mergeOrderPricingTable(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const out = JSON.parse(JSON.stringify(base));
  for (const mat of Object.keys(patch)) {
    if (!out[mat]) out[mat] = {};
    for (const type of Object.keys(patch[mat] || {})) {
      if (!out[mat][type]) out[mat][type] = {};
      const src = patch[mat][type] || {};
      ["A", "B", "k_cut", "k_build"].forEach(function (field) {
        if (src[field] === undefined) return;
        const n = Number(src[field]);
        if (Number.isFinite(n)) out[mat][type][field] = n;
      });
      Object.keys(src).forEach(function (k) {
        if (k === "A" || k === "B" || k === "k_cut" || k === "k_build") return;
        const n = Number(src[k]);
        if (Number.isFinite(n)) out[mat][type][k] = n;
      });
    }
  }
  return out;
}

function parseSetupFee(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

window.applyOrderPricingOverrides = function applyOrderPricingOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") return;
  if (overrides.stockPrice) {
    STOCK_PRICE = mergeOrderPricingTable(DEFAULT_STOCK_PRICE, overrides.stockPrice);
  } else {
    STOCK_PRICE = JSON.parse(JSON.stringify(DEFAULT_STOCK_PRICE));
  }
  if (overrides.params) {
    PARAMS = mergeOrderPricingTable(DEFAULT_PARAMS, overrides.params);
  } else {
    PARAMS = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
  }
  SETUP_FEE_CUT = parseSetupFee(overrides.setupFeeCut, DEFAULT_SETUP_FEE_CUT);
  SETUP_FEE_BUILD = parseSetupFee(overrides.setupFeeBuild, DEFAULT_SETUP_FEE_BUILD);
};

window.exportOrderPricingSnapshot = function exportOrderPricingSnapshot() {
  return {
    stockPrice: JSON.parse(JSON.stringify(STOCK_PRICE)),
    params: JSON.parse(JSON.stringify(PARAMS)),
    setupFeeCut: SETUP_FEE_CUT,
    setupFeeBuild: SETUP_FEE_BUILD,
  };
};

function roundYen(x) { return Math.round(x); }
function round100Yen(x) { return Math.round(x / 100) * 100; }

function pickStockLen(type, L) {
  const lens = (type === "BEAM") ? STOCK_LENS_BEAM : STOCK_LENS_POLE;
  for (let i = 0; i < lens.length; i++) if (lens[i] >= L) return lens[i];
  return lens[lens.length - 1];
}

function catalogCutPrice(type, mat, stockLen) {
  const prefix = type === "POLE" ? "pole_" : "beam_";
  const key = prefix + stockLen;
  const map = (typeof window !== "undefined" && window.PART_PRICE_BY_MATERIAL) || null;
  const byMat = map && map[key];
  if (byMat && typeof byMat === "object") {
    const v = Number(byMat[mat]);
    if (Number.isFinite(v) && v >= 0) return v;
    const iron = Number(byMat.IRON);
    if (Number.isFinite(iron) && iron >= 0) return iron;
  }
  const table = STOCK_PRICE?.[mat]?.[type] || DEFAULT_STOCK_PRICE?.[mat]?.[type];
  const fb = table ? table[stockLen] : null;
  return Number.isFinite(Number(fb)) ? Number(fb) : null;
}

/**
 * オーダー価格（合計メイン）
 * @param {object} args
 * @param {"BEAM"|"POLE"} args.type
 * @param {"IRON"|"BS"|"SUS"} args.material
 * @param {number} args.lengthMm
 * @param {number} args.qty
 */
function calcOrderTotal({ type, material, lengthMm, qty }) {
  const L = Math.max(1, Math.round(Number(lengthMm) || 0));
  const N = Math.max(1, Math.round(Number(qty) || 0));

  const mat = material || "IRON";
  const p = PARAMS?.[mat]?.[type];

  if (!p) {
    throw new Error("[order-pricing] unknown material/type: " + mat + "/" + type);
  }

  const isCut = (L <= 800);
  const setupFee = isCut ? SETUP_FEE_CUT : SETUP_FEE_BUILD;

  let variableEach = 0;
  let stockLen;
  let stockPrice;

  if (isCut) {
    stockLen = pickStockLen(type, L);
    stockPrice = catalogCutPrice(type, mat, stockLen);
    if (!Number.isFinite(Number(stockPrice))) {
      throw new Error("[order-pricing] missing cut price: " + type + "/" + mat + "/" + stockLen);
    }
    variableEach = roundYen(stockPrice * p.k_cut);
  } else {
    const base = p.A + p.B * L;
    variableEach = roundYen(base * p.k_build);
  }

  const variableTotal = variableEach * N;
  const total = variableTotal + setupFee;

  const unitRef = round100Yen(total / N);

  return {
    total,
    unitRef,
    variableEach,
    variableTotal,
    setupFee,
    mode: isCut ? "CUT" : "BUILD",
    ...(isCut ? { stockLen, stockPrice } : {}),
  };
}

function parseOrderPartKey(key) {
  const s = String(key || "");
  const m = /^(beam|pole)_custom_(?:(IRON|BS|SUS)_)?(\d+)$/i.exec(s);
  if (!m) return null;
  return {
    type: String(m[1]).toLowerCase() === "pole" ? "POLE" : "BEAM",
    material: m[2] ? String(m[2]).toUpperCase() : null,
    lengthMm: Number(m[3]),
  };
}

function priceOrderLineFromKey(key, material, qty) {
  const parsed = parseOrderPartKey(key);
  if (!parsed) return null;
  const mat = parsed.material || material || "IRON";
  return calcOrderTotal({
    type: parsed.type,
    material: mat,
    lengthMm: parsed.lengthMm,
    qty: qty,
  });
}

window.calcOrderTotal = calcOrderTotal;
window.parseOrderPartKey = parseOrderPartKey;
window.priceOrderLineFromKey = priceOrderLineFromKey;
window.DEFAULT_SETUP_FEE_CUT = DEFAULT_SETUP_FEE_CUT;
window.DEFAULT_SETUP_FEE_BUILD = DEFAULT_SETUP_FEE_BUILD;
window.DEFAULT_ORDER_PARAMS = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
