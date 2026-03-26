// js/data/parts-catalog.js
window.PARTS_CATALOG = {
  // ===== 基本パーツ =====
  jointBall: {
    label: "Joint Ball",
    unitPrice: 600,
    unitWeightG: 17.1,
  },
  jointCap: {
    label: "Joint Cap",
    unitPrice: 150,
    unitWeightG: 2.8,
  },
  topCap: {
    label: "Top Cap",
    unitPrice: 70,
    unitWeightG: 3.7,
  },
  sideCap: {
    label: "Side Cap",
    unitPrice: 50,
    unitWeightG: 2.7,
  },
  legBoss: {
    label: "Leg Boss",
    unitPrice: 370,
    unitWeightG: 7.3,
  },
  leg: {
    label: "Leg",
    unitPrice: 320,
    unitWeightG: 23.0,
  },
  beamNut: {
    label: "Beam Nut",
    unitPrice: 70,
    unitWeightG: 2.2,
  },
  m5Screw: {
    label: "M5 皿ネジ",
    unitPrice: 30,
    unitWeightG: 1.7,
  },

  // ===== Beam / Pole（長さ別・重量正本）=====
  // ※ unitPrice は仮。必要なら後で調整
  beam_25:  { label: "Beam_25",  unitPrice: 380, unitWeightG: 12.3 },
  
  beam_50:  { label: "Beam_50",  unitPrice: 420, unitWeightG: 37.1 },
  pole_50:  { label: "Pole_50",  unitPrice: 410, unitWeightG: 37.1 },

  beam_100: { label: "Beam_100", unitPrice: 470, unitWeightG: 106.5 },
  pole_100: { label: "Pole_100", unitPrice: 470, unitWeightG: 106.5 },

  beam_150: { label: "Beam_150", unitPrice: 470, unitWeightG: 152.2 },
 
  beam_200: { label: "Beam_200", unitPrice: 500, unitWeightG: 203.2 },
  pole_200: { label: "Pole_200", unitPrice: 500, unitWeightG: 203.2 },

  beam_300: { label: "Beam_300", unitPrice: 580, unitWeightG: 312.9 },
  pole_300: { label: "Pole_300", unitPrice: 580, unitWeightG: 312.9 },

  beam_400: { label: "Beam_400", unitPrice: 680, unitWeightG: 425.1 },
  pole_400: { label: "Pole_400", unitPrice: 680, unitWeightG: 425.1 },

  pole_500: { label: "Pole_500", unitPrice: 750, unitWeightG: 537.4 },

  beam_600: { label: "Beam_600", unitPrice: 800, unitWeightG: 642.9 },
  pole_600: { label: "Pole_600", unitPrice: 800, unitWeightG: 642.9 },

  beam_800: { label: "Beam_800", unitPrice: 930, unitWeightG: 869.9 },
  pole_800: { label: "Pole_800", unitPrice: 930, unitWeightG: 869.9 },

  shelfBoard: { label: "棚板_", unitPrice: 1200, unitWeightG: 500 },
  wallPanel:  { label: "壁板_",  unitPrice: 1500, unitWeightG: 700 },
  
  // 棚受け金物（幅別）
  shelfBracket_100: { label: "棚受け金物（標準） 100幅用", unitPrice: 330, unitWeightG: 0 },
  shelfBracket_200: { label: "棚受け金物（標準） 200幅用", unitPrice: 440, unitWeightG: 0 },
  shelfBracket_300: { label: "棚受け金物（標準） 300幅用", unitPrice: 610, unitWeightG: 0 },
  shelfBracket_400: { label: "棚受け金物（標準） 400幅用", unitPrice: 680, unitWeightG: 0 },
  shelfBracket_600: { label: "棚受け金物（標準） 600幅用", unitPrice: 800, unitWeightG: 0 },

  // 壁板 金物（幅別）
  wallBracket_100: { label: "壁板 金物 100幅用（1本）", unitPrice: 420, unitWeightG: 0 },
  wallBracket_200: { label: "壁板 金物 200幅用（1本）", unitPrice: 700, unitWeightG: 0 },
  wallBracket_300: { label: "壁板 金物 300幅用（1本）", unitPrice: 990, unitWeightG: 0 },
  wallBracket_400: { label: "壁板 金物 400幅用（1本）", unitPrice: 1270, unitWeightG: 0 },
  wallBracket_600: { label: "壁板 金物 600幅用（1本）", unitPrice: 1880, unitWeightG: 0 },
  wallBracket_800: { label: "壁板 金物 800幅用（1本）", unitPrice: 2490, unitWeightG: 0 },
};

// ================================
// 足場板のサイズ別価格表（表記サイズ → 価格）
// ================================
window.SCAFFOLD_BOARD_PRICE_TABLE = {
  // 棚板
  "100×100": 990,
  "100×200": 1210,
  "100×300": 1540,
  "100×400": 1870,
  "100×500": 2200,
  "100×600": 2420,
  "100×700": 2750,
  "100×800": 3080,
  "200×200": 1210,
  "200×300": 1540,
  "200×400": 1870,
  "200×500": 2200,
  "200×600": 2420,
  "200×700": 2750,
  "200×800": 3080,
  "300×300": 3080,
  "300×400": 3960,
  "300×500": 4510,
  "300×600": 5280,
  "300×700": 5940,
  "300×800": 6710,
  "400×400": 6160,
  "400×500": 6830,
  "400×600": 7500,
  "400×700": 9085,
  "400×800": 10670,
};

// ================================
// 足場板の壁板サイズ別価格表（表記サイズ → 価格）
// ================================
window.SCAFFOLD_PANEL_PRICE_TABLE = {
  "100×100": 550,
  "100×200": 1100,
  "100×300": 1540,
  "100×400": 2090,
  "100×500": 2530,
  "100×600": 2970,
  "100×700": 3410,
  "100×800": 3850,
  "200×200": 1210,
  "200×300": 1870,
  "200×400": 2420,
  "200×500": 2920,
  "200×600": 3410,
  "200×700": 3960,
  "200×800": 4510,
  "300×300": 3410,
  "300×400": 4510,
  "300×500": 5450,
  "300×600": 6380,
  "300×700": 7480,
  "300×800": 8580,
  "400×400": 6270,
  "400×500": 8470,
  "400×600": 9130,
  "400×700": 10760,
  "400×800": 12100,
};

// ================================
// 材種コード正規化 & 材種別単価（正本）
// ================================
// normalizeMaterial は js/utils/common.js で定義

// key -> { IRON: price, BS: price, SUS: price }（未定義は IRON にフォールバック）
window.PART_PRICE_BY_MATERIAL = {
  // ===== 基本パーツ =====
  jointBall: { IRON: 600, BS: 700, SUS: 730 },
  jointCap:  { IRON: 150, BS: 170, SUS: 180 },
  topCap:    { IRON: 70,  BS: 100, SUS: 110 },
  sideCap:   { IRON: 50,  BS: 70,  SUS: 100 },

  leg:       { IRON: 320, BS: 350, SUS: 370 },

  // LegBoss は Iron だけ提示だったので、未定義材種は IRON へフォールバックさせる
  legBoss:   { IRON: 370 },

  // M5皿ネジ：表では材種指定なし → 共通単価扱い
  m5Screw:   { IRON: 30, BS: 30, SUS: 30 },

  // BeamNut
  beamNut:   { IRON: 70,  BS: 100, SUS: 120 },

  // ===== Beam（規格）=====
  beam_25:  { IRON: 380, BS: 500,  SUS: 580 },
  beam_50:  { IRON: 420, BS: 570,  SUS: 670 },
  beam_100: { IRON: 470, BS: 650,  SUS: 730 },
  beam_150: { IRON: 470, BS: 790,  SUS: 780 },
  beam_200: { IRON: 500, BS: 920,  SUS: 830 },
  beam_300: { IRON: 580, BS: 1200, SUS: 1020 },
  beam_400: { IRON: 680, BS: 1380, SUS: 1200 },
  beam_600: { IRON: 800, BS: 2200, SUS: 1570 },
  beam_800: { IRON: 930, BS: 2570, SUS: 2020 },

  // ===== Pole（規格）=====
  pole_50:  { IRON: 410, BS: 520,  SUS: 600 },
  pole_100: { IRON: 470, BS: 580,  SUS: 650 },
  pole_200: { IRON: 500, BS: 870,  SUS: 830 },
  pole_300: { IRON: 580, BS: 1120, SUS: 1020 },
  pole_400: { IRON: 680, BS: 1380, SUS: 1200 },
  pole_500: { IRON: 750, BS: 1700, SUS: 1400 },
  pole_600: { IRON: 800, BS: 2020, SUS: 1570 },
  pole_800: { IRON: 930, BS: 2380, SUS: 1830 },
};

// =========================================================
// Material（材種）: IRON / BS / SUS
//  - normalizeMaterial は js/utils/common.js で定義
// =========================================================

// unitPrice が数値 or {IRON,BS,SUS} のどちらでも取れるようにする
function resolveUnitPriceByMaterial(unitPrice, material) {
  const mat = (typeof window.normalizeMaterial === "function")
    ? window.normalizeMaterial(material)
    : "IRON";

  // 旧：数値のみ
  if (typeof unitPrice === "number") return unitPrice;

  // 新：材種別オブジェクト
  if (unitPrice && typeof unitPrice === "object") {
    const v = unitPrice[mat];
    if (typeof v === "number") return v;

    // フォールバック（IRONがあればIRON）
    const iron = unitPrice.IRON;
    if (typeof iron === "number") return iron;
  }
  return 0;
}

// ================================
// 動的キー（beam_200 / pole_300 等）を正本で解決する
// ================================

// 価格・重量テーブル（必要な長さから埋めていく）
// ★単価は材種別を許容： { IRON, BS, SUS }
const BEAM_PRICE_BY_MM = {
  200: { IRON: 800, BS: 1200, SUS: 1000 },
};
const POLE_PRICE_BY_MM = {
  200: { IRON: 700, BS: 1050, SUS: 900 },
};

const BEAM_WEIGHT_BY_MM = {
  // 200: 0,
};
const POLE_WEIGHT_BY_MM = {
  // 200: 0,
};

// ================================
// Material（材種）
//  - normalizeMaterial と MATERIALS は js/utils/common.js で定義
// ================================

// ================================
// 材種別単価テーブル（Beam / Pole）
// - ここはあなたが後で「本単価表」で埋める想定
// - まず動作確認のために、例として beam_200 だけ差を付ける
// ================================
const PRICE_BY_MATERIAL = {
  IRON: {
    // 例（IRONは現状の catalog.unitPrice があるので未設定でもOK）
  },
  BS: {
    // ★動作確認用：beam_200 だけ変えて差が出るか見る
    beam_200: 650,
  },
  SUS: {
    // ★動作確認用
    beam_200: 720,
  },
};

// key -> { label, unitPrice, unitWeightG } を返す「唯一の正本」
// material を受け取り、材種別単価を返す
window.getPartInfo = function getPartInfo(partKey, material) {
  const key = String(partKey || "");
  const mat = (typeof window.normalizeMaterial === "function")
    ? window.normalizeMaterial(material)
    : "IRON";

  const cat = window.PARTS_CATALOG || {};
  const priceMap = window.PART_PRICE_BY_MATERIAL || {};

  // 単価：材種別があればそれを優先、無ければ PARTS_CATALOG.unitPrice
  function resolveUnitPrice(k, m) {
    const byMat = priceMap?.[k];
    if (byMat) {
      const v = Number(byMat[m]);
      if (Number.isFinite(v) && v > 0) return v;

      // フォールバック：IRON
      const v0 = Number(byMat.IRON);
      if (Number.isFinite(v0) && v0 > 0) return v0;
    }
    const fixed = cat?.[k];
    return Number(fixed?.unitPrice) || 0;
  }

  // 1) 棚板（shelfBoard_100x200 形式）
  const shelfBoardMatch = /^shelfBoard_(\d+)x(\d+)$/.exec(key);
  if (shelfBoardMatch) {
    const width = Number(shelfBoardMatch[1]);
    const depth = Number(shelfBoardMatch[2]);
    if (width > 0 && depth > 0) {
      // 表記サイズを取得（小さい方を先に）
      const sizeKey = width <= depth ? `${width}×${depth}` : `${depth}×${width}`;
      const priceTable = window.SCAFFOLD_BOARD_PRICE_TABLE || {};
      const price = priceTable[sizeKey] || 0;
      
      return {
        label: `棚板_${width}x${depth}`,
        unitPrice: price,
        unitWeightG: 500, // デフォルト重量
      };
    }
  }

  // 1-2) 壁板（wallPanel_100x200 形式）
  const wallPanelMatch = /^wallPanel_(\d+)x(\d+)$/.exec(key);
  if (wallPanelMatch) {
    const width = Number(wallPanelMatch[1]);
    const height = Number(wallPanelMatch[2]);
    if (width > 0 && height > 0) {
      // 表記サイズを取得（小さい方を先に）
      const sizeKey = width <= height ? `${width}×${height}` : `${height}×${width}`;
      const priceTable = window.SCAFFOLD_PANEL_PRICE_TABLE || {};
      const price = priceTable[sizeKey] || 0;
      
      return {
        label: `壁板_${width}x${height}`,
        unitPrice: price,
        unitWeightG: 700, // デフォルト重量
      };
    }
  }

  // 1-3) 棚受け金物（shelfBracket_100_STD / shelfBracket_100_CONVEX / shelfBracket_100_CONCAVE 形式）
  const bracketMatch = /^shelfBracket_(\d+)_(STD|CONVEX|CONCAVE)$/.exec(key);
  if (bracketMatch) {
    const width = bracketMatch[1];
    const shape = bracketMatch[2];
    const baseKey = `shelfBracket_${width}`;
    const baseInfo = cat[baseKey];
    if (baseInfo) {
      const shapeLabel = shape === "STD" ? "標準" : shape === "CONVEX" ? "凸型" : "凹型";
      return {
        label: `棚受け金物（${shapeLabel}） ${width}幅用`,
        unitPrice: baseInfo.unitPrice || 0,
        unitWeightG: baseInfo.unitWeightG || 0,
      };
    }
  }
  
  // 1-4) 棚受け金物（旧形式：shelfBracket_100 のみ、後方互換性のため）
  const bracketSimpleMatch = /^shelfBracket_(\d+)$/.exec(key);
  if (bracketSimpleMatch && !bracketMatch) {
    const width = bracketSimpleMatch[1];
    const baseKey = `shelfBracket_${width}`;
    const baseInfo = cat[baseKey];
    if (baseInfo) {
      return {
        label: baseInfo.label || `棚受け金物（標準） ${width}幅用`,
        unitPrice: baseInfo.unitPrice || 0,
        unitWeightG: baseInfo.unitWeightG || 0,
      };
    }
  }

  // 2) 固定キー（jointBall, jointCap, leg...）
  const fixed = cat?.[key];
  if (fixed) {
    return {
      label: fixed.label ?? key,
      unitPrice: resolveUnitPrice(key, mat),
      unitWeightG: Number(fixed.unitWeightG) || 0,
    };
  }

  // 規格へ丸める（len以上で最小の規格）
  function pickBaseCatalogKey(kindPrefix, lenMm) {
    const targets = Object.keys(cat)
      .filter((k) => k.startsWith(kindPrefix))
      .map((k) => {
        const n = parseInt(k.slice(kindPrefix.length), 10);
        return Number.isFinite(n) ? { k, n } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.n - b.n);

    const found = targets.find((t) => t.n >= lenMm);
    return found ? found.k : null;
  }

  // 2) ビーム（beam_200 / beam_custom_450）
  let m = /^beam_(custom_)?(\d+)$/.exec(key);
  if (m) {
    const isCustom = !!m[1];
    const len = Number(m[2]) || 0;

    if (!isCustom) {
      // 規格Beam（通常はここへ来ないが念のため）
      const base = cat?.[key] || null;
      return {
        label: base?.label ?? `Beam_${len}`,
        unitPrice: resolveUnitPrice(key, mat),
        unitWeightG: Number(base?.unitWeightG) || 0,
      };
    }

    // オーダーBeam（beam_custom_450）
    const baseKey = pickBaseCatalogKey("beam_", len); // 例: beam_200 / beam_300...
    const base = baseKey ? cat?.[baseKey] : null;
    const basePrice = baseKey ? resolveUnitPrice(baseKey, mat) : 0;

    return {
      label: `Beam_${len}`,
      unitPrice: Math.round(basePrice + (window._orderSurchargePerPiece || 0)),
      unitWeightG: 0, // オーダー重量ルール未定なら0でOK
    };
  }

  // 3) ポール（pole_200 / pole_custom_450）
  m = /^pole_(custom_)?(\d+)$/.exec(key);
  if (m) {
    const isCustom = !!m[1];
    const len = Number(m[2]) || 0;

    if (!isCustom) {
      const base = cat?.[key] || null;
      return {
        label: base?.label ?? `Pole_${len}`,
        unitPrice: resolveUnitPrice(key, mat),
        unitWeightG: Number(base?.unitWeightG) || 0,
      };
    }

    const baseKey = pickBaseCatalogKey("pole_", len);
    const base = baseKey ? cat?.[baseKey] : null;
    const basePrice = baseKey ? resolveUnitPrice(baseKey, mat) : 0;

    return {
      label: `Pole_${len}`,
      unitPrice: Math.round(basePrice + (window._orderSurchargePerPiece || 0)),
      unitWeightG: 0,
    };
  }

  // 4) 不明キー
  return { label: key, unitPrice: 0, unitWeightG: 0 };
};

// ===== Order rule（オーダー価格ルール）=====
// 基本：単価 = baseFee + (perMm * 長さmm)
// 端数：roundToMm 単位で切り上げ（例: 10mm単位に揃える）
window.ORDER_RULES = {
  beam: {
    baseFee: 200,     // 加工/手配の固定費（仮）
    perMm: 2.2,       // 1mmあたり（仮）
    roundToMm: 10,    // 10mm単位に切り上げ
    minMm: 25,
  },
  pole: {
    baseFee: 200,
    perMm: 2.2,
    roundToMm: 10,
    minMm: 50,
  },
};
