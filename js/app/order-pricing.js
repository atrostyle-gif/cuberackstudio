// js/app/order-pricing.js
// CUBERACK Order pricing engine (Beam/Pole) - 合計メイン
// 1円単位：四捨五入（Math.round）
// 参考単価：100円単位四捨五入（Math.round(x/100)*100）

const STOCK_LENS_BEAM = [25, 50, 100, 150, 200, 300, 400, 600, 800];
const STOCK_LENS_POLE = [50, 100, 200, 300, 400, 500, 600, 800];

// 既製価格（あなたの表：材質別）
const STOCK_PRICE = {
  IRON: {
    BEAM: { 25:380, 50:420, 100:470, 150:470, 200:500, 300:580, 400:680, 600:800, 800:930 },
    POLE: { 50:410, 100:470, 200:500, 300:580, 400:680, 500:750, 600:800, 800:930 },
  },
  BS: {
    BEAM: { 25:500, 50:570, 100:650, 150:790, 200:920, 300:1200, 400:1380, 600:2200, 800:2570 },
    POLE: { 50:520, 100:580, 200:870, 300:1120, 400:1380, 500:1700, 600:2020, 800:2380 },
  },
  SUS: {
    BEAM: { 25:580, 50:670, 100:730, 150:780, 200:830, 300:1020, 400:1200, 600:1570, 800:2020 },
    POLE: { 50:600, 100:650, 200:830, 300:1020, 400:1200, 500:1400, 600:1570, 800:1830 },
  },
};

// パラメータ（IRONは確定、BS/SUSは暫定）
const PARAMS = {
  IRON: {
    BEAM: { A: 390.68, B: 0.6797, k_cut: 2.10, k_build: 1.92 },
    POLE: { A: 390.68, B: 0.6797, k_cut: 2.10, k_build: 1.92 },
  },
  BS: {
    BEAM: { A: 309.66, B: 2.9102, k_cut: 2.10, k_build: 1.92 }, // 暫定
    POLE: { A: 367.12, B: 2.5864, k_cut: 2.10, k_build: 1.92 }, // 暫定
  },
  SUS: {
    BEAM: { A: 406.95, B: 1.9915, k_cut: 2.10, k_build: 1.92 }, // 暫定
    POLE: { A: 545.42, B: 1.6373, k_cut: 2.10, k_build: 1.92 }, // 暫定
  },
};

function roundYen(x) { return Math.round(x); }
function round100Yen(x) { return Math.round(x / 100) * 100; }

function pickStockLen(type, L) {
  const lens = (type === "BEAM") ? STOCK_LENS_BEAM : STOCK_LENS_POLE;
  for (const s of lens) if (s >= L) return s;
  return lens[lens.length - 1];
}

/**
 * オーダー価格（合計メイン）
 * @param {object} args
 * @param {"BEAM"|"POLE"} args.type
 * @param {"IRON"|"BS"|"SUS"} args.material
 * @param {number} args.lengthMm  // L
 * @param {number} args.qty       // N（厳密ロット：同一Lの本数）
 * @returns {{
 *   total: number,
 *   unitRef: number, // 参考単価（100円丸め）
 *   variableEach: number,
 *   variableTotal: number,
 *   setupFee: number,
 *   mode: "CUT"|"BUILD",
 *   stockLen?: number,
 *   stockPrice?: number,
 * }}
 */
function calcOrderTotal({ type, material, lengthMm, qty }) {
  const L = Math.max(1, Math.round(Number(lengthMm) || 0));
  const N = Math.max(1, Math.round(Number(qty) || 0));

  const mat = material || "IRON";
  const p = PARAMS?.[mat]?.[type];
  const stockTable = STOCK_PRICE?.[mat]?.[type];

  if (!p || !stockTable) {
    // 保険：未知材質は0円扱いにせず、例外で気づけるようにする
    throw new Error(`[order-pricing] unknown material/type: ${mat}/${type}`);
  }

  const isCut = (L <= 800);
  const setupFee = isCut ? 3000 : 6000;

  let variableEach = 0;
  let stockLen, stockPrice;

  if (isCut) {
    stockLen = pickStockLen(type, L);
    stockPrice = stockTable[stockLen];
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

// グローバル公開（script タグ用）
window.calcOrderTotal = calcOrderTotal;
