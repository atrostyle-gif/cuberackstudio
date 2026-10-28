// =========================================================
// Dimension Utilities (V1.1.1)
// - 寸法計算の唯一の正（3D表示・図面で共通使用）
// =========================================================

(function initDimensionUtils() {
  // 固定物理寸法（水平方向）
  const SIDE_CAP_THICKNESS = 2.0;  // mm
  const JOINT_BALL_DIAMETER = 18.35; // mm
  // 外形オフセット = 2*サイドキャップ厚み + 2*ジョイントボール直径
  // = 2*2.0 + 2*18.35 = 4.0 + 36.7 = 40.7 mm
  const OUTER_OFFSET = 2 * SIDE_CAP_THICKNESS + 2 * JOINT_BALL_DIAMETER; // 40.7 mm

  // 固定物理寸法（垂直方向・製品実測 2026-10-27）
  // 正本: HEIGHT_DIMENSION_REPORT.md
  const HEIGHT_MODEL_VERSION = "v31-m109";
  const V_JB_BODY = 18.2;  // JB（Body＋Cap）実測全高
  const V_JB_FIT = 0.2;    // JB底部への Pole 嵌合
  const V_JB_JC = 18.0;    // 組付け有効高さ = 18.2 − 0.2
  const V_JB_HALF = 9.1;   // 18.2 / 2。ジョイント中心〜外形端
  const V_LEG = 12.9;      // LEG＋LegBoss 組付け追加高さ（実測。31.1 − 18.2）
  const V_TC = 2.2;        // TopCap 追加高さ（20.4 − 18.2）
  const V_FLOOR_TO_JB_CENTER = V_LEG + V_JB_HALF; // 22.0
  const V_LEG_JB_STACK = V_LEG + V_JB_BODY;       // 31.1
  const POLE_PITCH_EPS_MM = 0.05;
  const POLE_CAD_MODULE_MM = 109;
  // 新規配置の CAD 中心間。POLE200 基準 100 サイズあたり 109mm。
  // POLE50 は 0.5 モジュール（54.5）。Custom は含めない（丸めない）。
  const POLE_CAD_PITCH_TABLE = {
    50: 54.5,
    100: 109,
    200: 218,
    300: 327,
    400: 436,
    500: 545,
    600: 654,
    800: 872,
  };
  // 既存 V3.1 (v31-h1) の実測ピッチ。SKU 復元専用。座標は書き換えない。
  const POLE_CAD_PITCH_LEGACY_V31H1 = {
    50: 54.3,
    100: 108.8,
    600: 654.7,
  };
  const POLE_CENTER_PITCH_TABLE = POLE_CAD_PITCH_TABLE;

  // 垂直定数 getter（estimate.js / drawing.js / 測定から参照）
  window.HEIGHT_MODEL_VERSION = HEIGHT_MODEL_VERSION;
  window.getHeightModelVersion = () => HEIGHT_MODEL_VERSION;
  window.getLegHeightMm = () => V_LEG;
  window.getTopCapHeightMm = () => V_TC;
  window.getVerticalJointThicknessMm = () => V_JB_JC;
  window.getVerticalJbHeightMm = () => V_JB_BODY;
  window.getVerticalJbHalfMm = () => V_JB_HALF;
  window.getVerticalJbFitMm = () => V_JB_FIT;
  window.getFloorToBottomJbCenterMm = () => V_FLOOR_TO_JB_CENTER;
  window.getLegJbStackMm = () => V_LEG_JB_STACK;
  window.POLE_CAD_MODULE_MM = POLE_CAD_MODULE_MM;

  // Beam 名目長さ → 実効長（ジョイント間に効く長さ）テーブル
  const BEAM_EFFECTIVE_LENGTH_TABLE = {
    100: 90.8,
    150: 145.4,
    200: 200.0,
    300: 309.2,
    400: 418.3,
    500: 527.6,
    600: 636.7,
    800: 855.1,
  };

  // テーブルのキーを数値配列として取得（ソート済み）
  const BEAM_NOMINAL_KEYS = Object.keys(BEAM_EFFECTIVE_LENGTH_TABLE)
    .map(Number)
    .sort((a, b) => a - b);

  // POLE 名目長さ → 実効長（図面値）テーブル
  const POLE_EFFECTIVE_LENGTH_TABLE = {
    50: 36.3,
    100: 90.8,
    200: 200.0,
    300: 309.2,
    400: 418.3,
    500: 527.6,
    600: 636.7,
    800: 855.1,
  };

  // POLEテーブルのキーを数値配列として取得（ソート済み）
  const POLE_NOMINAL_KEYS = Object.keys(POLE_EFFECTIVE_LENGTH_TABLE)
    .map(Number)
    .sort((a, b) => a - b);

  /**
   * Beamの名目長さから実効長を取得（線形補間対応）
   * @param {number} nominalMm - 名目長さ（mm）
   * @returns {number} 実効長（mm）
   */
  window.getBeamEffectiveLengthMm = function getBeamEffectiveLengthMm(nominalMm) {
    const nominal = Number(nominalMm);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      if (window.__CR_DBG_DIM__) {
        console.warn("[dim-utils] Invalid nominal length:", nominalMm);
      }
      return 0;
    }

    // テーブルに完全一致する場合
    if (BEAM_EFFECTIVE_LENGTH_TABLE[nominal]) {
      return BEAM_EFFECTIVE_LENGTH_TABLE[nominal];
    }

    // テーブル範囲内：線形補間
    if (nominal > BEAM_NOMINAL_KEYS[0] && nominal < BEAM_NOMINAL_KEYS[BEAM_NOMINAL_KEYS.length - 1]) {
      // 近傍2点を探す
      let lowerIdx = -1;
      for (let i = 0; i < BEAM_NOMINAL_KEYS.length - 1; i++) {
        if (BEAM_NOMINAL_KEYS[i] <= nominal && nominal <= BEAM_NOMINAL_KEYS[i + 1]) {
          lowerIdx = i;
          break;
        }
      }

      if (lowerIdx >= 0) {
        const n1 = BEAM_NOMINAL_KEYS[lowerIdx];
        const n2 = BEAM_NOMINAL_KEYS[lowerIdx + 1];
        const e1 = BEAM_EFFECTIVE_LENGTH_TABLE[n1];
        const e2 = BEAM_EFFECTIVE_LENGTH_TABLE[n2];

        // 線形補間
        const ratio = (nominal - n1) / (n2 - n1);
        const effective = e1 + (e2 - e1) * ratio;

        if (window.__CR_DBG_DIM__) {
          console.log(`[dim-utils] Interpolated: nominal=${nominal} -> effective=${effective.toFixed(2)} (between ${n1}->${e1} and ${n2}->${e2})`);
        }

        return effective;
      }
    }

    // 範囲外：端の傾きで線形外挿
    if (nominal < BEAM_NOMINAL_KEYS[0]) {
      // 最小値より小さい：最初の2点の傾きで外挿
      const n1 = BEAM_NOMINAL_KEYS[0];
      const n2 = BEAM_NOMINAL_KEYS[1];
      const e1 = BEAM_EFFECTIVE_LENGTH_TABLE[n1];
      const e2 = BEAM_EFFECTIVE_LENGTH_TABLE[n2];
      const slope = (e2 - e1) / (n2 - n1);
      const effective = e1 + (nominal - n1) * slope;

      if (window.__CR_DBG_DIM__) {
        console.log(`[dim-utils] Extrapolated (below): nominal=${nominal} -> effective=${effective.toFixed(2)}`);
      }

      return effective;
    }

    if (nominal > BEAM_NOMINAL_KEYS[BEAM_NOMINAL_KEYS.length - 1]) {
      // 最大値より大きい：最後の2点の傾きで外挿
      const n1 = BEAM_NOMINAL_KEYS[BEAM_NOMINAL_KEYS.length - 2];
      const n2 = BEAM_NOMINAL_KEYS[BEAM_NOMINAL_KEYS.length - 1];
      const e1 = BEAM_EFFECTIVE_LENGTH_TABLE[n1];
      const e2 = BEAM_EFFECTIVE_LENGTH_TABLE[n2];
      const slope = (e2 - e1) / (n2 - n1);
      const effective = e2 + (nominal - n2) * slope;

      if (window.__CR_DBG_DIM__) {
        console.log(`[dim-utils] Extrapolated (above): nominal=${nominal} -> effective=${effective.toFixed(2)}`);
      }

      return effective;
    }

    // フォールバック（通常は到達しない）
    return nominal;
  };

  /**
   * Beamの名目長さから外形寸法（サイドキャップ外〜外）を取得
   * @param {number} nominalMm - 名目長さ（mm）
   * @returns {number} 外形寸法（mm）
   */
  window.getBeamOuterToOuterLengthMm = function getBeamOuterToOuterLengthMm(nominalMm) {
    const effective = window.getBeamEffectiveLengthMm(nominalMm);
    const outer = effective + OUTER_OFFSET;

    if (window.__CR_DBG_DIM__) {
      console.log(`[dim-utils] Outer: nominal=${nominalMm}, effective=${effective.toFixed(2)}, outer=${outer.toFixed(2)}`);
    }

    return outer;
  };

  /**
   * Beamオブジェクトから名目長さを安全に取得
   * @param {object} beam - Beamオブジェクト
   * @returns {number} 名目長さ（mm）、取得できない場合は0
   */
  window.getBeamNominalLengthMmSafe = function getBeamNominalLengthMmSafe(beam) {
    if (!beam) {
      if (window.__CR_DBG_DIM__) {
        console.warn("[dim-utils] getBeamNominalLengthMmSafe: beam is null/undefined");
      }
      return 0;
    }

    // オーダー状態ならオーダー長を優先
    if (window.isOrderModeOn && beam.lengthMm) {
      const orderLen = Number(beam.lengthMm);
      if (Number.isFinite(orderLen) && orderLen > 0) {
        return orderLen;
      }
    }

    // 通常の長さ
    if (beam.lengthMm) {
      const len = Number(beam.lengthMm);
      if (Number.isFinite(len) && len > 0) {
        return len;
      }
    }

    if (beam.length) {
      const len = Number(beam.length);
      if (Number.isFinite(len) && len > 0) {
        return len;
      }
    }

    if (window.__CR_DBG_DIM__) {
      console.warn("[dim-utils] getBeamNominalLengthMmSafe: No valid length found in beam:", beam);
    }

    return 0;
  };

  /**
   * 芯々距離（ジョイント中心〜中心）を計算
   * 公式: 芯々距離 = Σ(L_i) + N × 18.35
   * ここで、L_i は各ビームの有効長、N はビーム本数
   * 
   * @param {number[]} beamLengthsMm - 直列に並ぶビームの有効長（mm）の配列
   * @returns {number} 芯々距離（mm）
   */
  window.calcCenterToCenterLengthMm = function calcCenterToCenterLengthMm(beamLengthsMm) {
    const JB = JOINT_BALL_DIAMETER; // 18.35 mm
    const N = Array.isArray(beamLengthsMm) ? beamLengthsMm.length : 0;
    
    if (N === 0) return 0;
    
    // 有効長の合計
    const sum = beamLengthsMm.reduce((a, b) => {
      const val = Number(b);
      return a + (Number.isFinite(val) && val > 0 ? val : 0);
    }, 0);
    
    // 芯々距離 = Σ(L_i) + N × 18.35
    const centerToCenter = sum + N * JB;
    
    if (window.__CR_DBG_DIM__) {
      console.log(`[dim-utils] calcCenterToCenterLengthMm: N=${N}, sum=${sum.toFixed(2)}, result=${centerToCenter.toFixed(2)}`);
    }
    
    return centerToCenter;
  };

  /**
   * POLEの名目長さから実効長を取得（線形補間対応）
   * @param {number} nominalMm - 名目長さ（mm）
   * @returns {number} 実効長（mm）
   */
  window.getPoleEffectiveLengthMm = function getPoleEffectiveLengthMm(nominalMm) {
    const nominal = Number(nominalMm);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      if (window.__CR_DBG_DIM__) {
        console.warn("[dim-utils] Invalid pole nominal length:", nominalMm);
      }
      return 0;
    }

    // テーブルに完全一致する場合
    if (POLE_EFFECTIVE_LENGTH_TABLE[nominal]) {
      return POLE_EFFECTIVE_LENGTH_TABLE[nominal];
    }

    // テーブル範囲内：線形補間
    if (nominal > POLE_NOMINAL_KEYS[0] && nominal < POLE_NOMINAL_KEYS[POLE_NOMINAL_KEYS.length - 1]) {
      let lowerIdx = -1;
      for (let i = 0; i < POLE_NOMINAL_KEYS.length - 1; i++) {
        if (POLE_NOMINAL_KEYS[i] <= nominal && nominal <= POLE_NOMINAL_KEYS[i + 1]) {
          lowerIdx = i;
          break;
        }
      }

      if (lowerIdx >= 0) {
        const n1 = POLE_NOMINAL_KEYS[lowerIdx];
        const n2 = POLE_NOMINAL_KEYS[lowerIdx + 1];
        const e1 = POLE_EFFECTIVE_LENGTH_TABLE[n1];
        const e2 = POLE_EFFECTIVE_LENGTH_TABLE[n2];
        const ratio = (nominal - n1) / (n2 - n1);
        const effective = e1 + (e2 - e1) * ratio;

        if (window.__CR_DBG_DIM__) {
          console.log(`[dim-utils] Pole interpolated: nominal=${nominal} -> effective=${effective.toFixed(2)}`);
        }

        return effective;
      }
    }

    // 範囲外：端の傾きで線形外挿
    if (nominal < POLE_NOMINAL_KEYS[0]) {
      const n1 = POLE_NOMINAL_KEYS[0];
      const n2 = POLE_NOMINAL_KEYS[1];
      const e1 = POLE_EFFECTIVE_LENGTH_TABLE[n1];
      const e2 = POLE_EFFECTIVE_LENGTH_TABLE[n2];
      const slope = (e2 - e1) / (n2 - n1);
      const effective = e1 + (nominal - n1) * slope;

      if (window.__CR_DBG_DIM__) {
        console.log(`[dim-utils] Pole extrapolated (below): nominal=${nominal} -> effective=${effective.toFixed(2)}`);
      }

      return effective;
    }

    if (nominal > POLE_NOMINAL_KEYS[POLE_NOMINAL_KEYS.length - 1]) {
      const n1 = POLE_NOMINAL_KEYS[POLE_NOMINAL_KEYS.length - 2];
      const n2 = POLE_NOMINAL_KEYS[POLE_NOMINAL_KEYS.length - 1];
      const e1 = POLE_EFFECTIVE_LENGTH_TABLE[n1];
      const e2 = POLE_EFFECTIVE_LENGTH_TABLE[n2];
      const slope = (e2 - e1) / (n2 - n1);
      const effective = e2 + (nominal - n2) * slope;

      if (window.__CR_DBG_DIM__) {
        console.log(`[dim-utils] Pole extrapolated (above): nominal=${nominal} -> effective=${effective.toFixed(2)}`);
      }

      return effective;
    }

    return nominal;
  };

  function listedPoleCadPitch(nominalMm) {
    const nominal = Number(nominalMm);
    if (!Number.isFinite(nominal) || nominal <= 0) return null;
    if (Object.prototype.hasOwnProperty.call(POLE_CAD_PITCH_TABLE, String(nominal))) {
      return POLE_CAD_PITCH_TABLE[nominal];
    }
    if (POLE_CAD_PITCH_TABLE[nominal]) return POLE_CAD_PITCH_TABLE[nominal];
    return null;
  }

  function listedPoleEffective(nominalMm) {
    const nominal = Number(nominalMm);
    if (!Number.isFinite(nominal) || nominal <= 0) return null;
    if (Object.prototype.hasOwnProperty.call(POLE_EFFECTIVE_LENGTH_TABLE, String(nominal))) {
      return POLE_EFFECTIVE_LENGTH_TABLE[nominal];
    }
    if (POLE_EFFECTIVE_LENGTH_TABLE[nominal]) return POLE_EFFECTIVE_LENGTH_TABLE[nominal];
    return null;
  }

  /**
   * POLE 名目（SKU）→ CAD 中心間ピッチ。
   * 規格 50〜800 は 109mm モジュール（50 は 0.5 モジュール）。Custom は丸めない。
   */
  window.getPoleCenterPitchMm = function getPoleCenterPitchMm(nominalMm) {
    const nominal = Number(nominalMm);
    if (!Number.isFinite(nominal) || nominal <= 0) return 0;
    const pitch = listedPoleCadPitch(nominal);
    return pitch != null ? pitch : nominal;
  };

  window.getPoleCadMmFromSku = function getPoleCadMmFromSku(skuMm) {
    return window.getPoleCenterPitchMm(skuMm);
  };

  /**
   * CAD 中心間 → SKU。
   * 109モジュール → v31-h1 実測 → 旧 SKU=CAD の順。Custom/未知は丸めない。
   */
  window.getPoleSkuFromCadMm = function getPoleSkuFromCadMm(cadMm) {
    const d = Number(cadMm);
    if (!Number.isFinite(d) || d <= 0) return 0;
    const modKeys = Object.keys(POLE_CAD_PITCH_TABLE);
    for (let i = 0; i < modKeys.length; i++) {
      const sku = Number(modKeys[i]);
      if (Math.abs(d - POLE_CAD_PITCH_TABLE[sku]) <= POLE_PITCH_EPS_MM) return sku;
    }
    const legacyKeys = Object.keys(POLE_CAD_PITCH_LEGACY_V31H1);
    for (let i = 0; i < legacyKeys.length; i++) {
      const sku = Number(legacyKeys[i]);
      if (Math.abs(d - POLE_CAD_PITCH_LEGACY_V31H1[sku]) <= POLE_PITCH_EPS_MM) return sku;
    }
    const presets = poleSkuPresets();
    for (let i = 0; i < presets.length; i++) {
      const sku = Number(presets[i]);
      if (Math.abs(d - sku) <= POLE_PITCH_EPS_MM) return sku;
    }
    return d;
  };

  /** 部品表示用の図面有効長。未掲載 SKU（Custom）は補間せずそのまま。 */
  window.getPoleProductLengthMm = function getPoleProductLengthMm(skuMm) {
    const sku = Number(skuMm);
    if (!Number.isFinite(sku) || sku <= 0) return 0;
    const listed = listedPoleEffective(sku);
    return listed != null ? listed : sku;
  };

  const POLE_SKU_PRESETS = [50, 100, 200, 300, 400, 500, 600, 800];

  function poleSkuPresets() {
    const list = window.POLE_LENGTH_OPTIONS;
    return (Array.isArray(list) && list.length) ? list : POLE_SKU_PRESETS;
  }

  function isPoleSkuPreset(len) {
    const n = Number(len);
    if (!Number.isFinite(n) || n <= 0) return false;
    const presets = poleSkuPresets();
    if (typeof window.isPresetLengthMm === "function") return window.isPresetLengthMm(n, presets);
    for (let i = 0; i < presets.length; i++) {
      if (Math.abs(Number(presets[i]) - n) <= 1e-6) return true;
    }
    return false;
  }

  /**
   * 見積・BOM 用の Pole SKU。CAD 座標は使わず製品番号を返す。
   * Custom は規格へ丸めない。
   */
  window.resolvePoleSkuForEstimate = function resolvePoleSkuForEstimate(pole, cadMm) {
    const p = pole && typeof pole === "object" ? pole : {};
    if (p.isCustom && p.customLength != null && Number(p.customLength) > 0) {
      return { skuMm: Number(p.customLength), custom: true };
    }
    const stored = Number(p.lengthMm);
    if (stored > 0 && isPoleSkuPreset(stored)) {
      return { skuMm: stored, custom: false };
    }
    const cad = Number(cadMm);
    let mapped = stored;
    if (typeof window.getPoleSkuFromCadMm === "function" && Number.isFinite(cad) && cad > 0) {
      mapped = window.getPoleSkuFromCadMm(cad);
    } else if (!(mapped > 0) && Number.isFinite(cad) && cad > 0) {
      mapped = cad;
    }
    if (mapped > 0 && isPoleSkuPreset(mapped)) {
      return { skuMm: mapped, custom: false };
    }
    const customLen = Number(p.customLength);
    const skuMm = (Number.isFinite(customLen) && customLen > 0)
      ? customLen
      : (mapped > 0 ? mapped : cad);
    return { skuMm: skuMm, custom: true };
  };

  /**
   * カラーチャート用の Pole 長さ。CAD 中心間ではなく製品 SKU。
   * Custom は規格へ丸めない。
   */
  window.getPoleColorLengthMm = function getPoleColorLengthMm(pole, cadMm) {
    const resolved = window.resolvePoleSkuForEstimate(pole, cadMm);
    if (resolved && Number(resolved.skuMm) > 0) return Number(resolved.skuMm);
    const stored = Number(pole && pole.lengthMm);
    if (stored > 0) return stored;
    const cad = Number(cadMm);
    return cad > 0 ? cad : 0;
  };

  function poleProductGapMm(skuMm) {
    const sku = Number(skuMm);
    if (!Number.isFinite(sku) || sku <= 0) return 0;
    const listed = listedPoleEffective(sku);
    if (listed != null) return listed - V_JB_FIT;
    return sku;
  }

  /**
   * 外形高さ（床〜TopCap）。製品実寸。
   * H = LEG 12.9 + (N+1)×JB 18.2 + Σ(図面有効長 − 0.2) + TopCap 2.2
   * 未掲載 SKU（Custom）は有効長を補間せず、その数値をギャップとして使う。
   */
  window.calcPoleOuterHeightMm = function calcPoleOuterHeightMm(poleNominalsMm) {
    const gaps = (Array.isArray(poleNominalsMm) ? poleNominalsMm : [])
      .map(function (nominal) { return poleProductGapMm(nominal); })
      .filter(function (len) { return len > 0; });
    const N = gaps.length;
    if (N === 0) return 0;
    const sum = gaps.reduce(function (s, v) { return s + v; }, 0);
    const outerHeight = V_LEG + (N + 1) * V_JB_BODY + sum + V_TC;
    if (window.__CR_DBG_DIM__) {
      console.log("[dim-utils] calcPoleOuterHeightMm: N=" + N + ", sum=" + sum + ", result=" + outerHeight);
    }
    return outerHeight;
  };

  /**
   * CAD 芯々高さ = Σ(CAD 中心間ピッチ)
   */
  window.calcPoleCenterToCenterHeightMm = function calcPoleCenterToCenterHeightMm(poleNominalsMm) {
    const pitches = (Array.isArray(poleNominalsMm) ? poleNominalsMm : [])
      .map(function (nominal) { return window.getPoleCenterPitchMm(nominal); })
      .filter(function (len) { return len > 0; });
    if (!pitches.length) return 0;
    return pitches.reduce(function (s, v) { return s + v; }, 0);
  };

  window.collectVerticalPoleSkuColumns = function collectVerticalPoleSkuColumns(jointList, poleList) {
    const js = jointList || window.joints || [];
    const ps = poleList || window.poles || [];
    const byEnds = {};
    function endKey(i, j) { return i + "_" + j; }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p) continue;
      if (Number.isFinite(p.a) && Number.isFinite(p.b)) {
        if (!byEnds[endKey(p.a, p.b)]) byEnds[endKey(p.a, p.b)] = p;
        if (!byEnds[endKey(p.b, p.a)]) byEnds[endKey(p.b, p.a)] = p;
      }
    }
    const groups = {};
    for (let idx = 0; idx < js.length; idx++) {
      const j = js[idx];
      if (!j) continue;
      const key = (Math.round((Number(j.x) || 0) / 5) * 5) + "_" + (Math.round((Number(j.z) || 0) / 5) * 5);
      if (!groups[key]) groups[key] = [];
      groups[key].push({ idx: idx, y: Number(j.y) || 0 });
    }
    const columns = [];
    Object.keys(groups).forEach(function (key) {
      const pts = groups[key].slice().sort(function (a, b) { return a.y - b.y; });
      const skus = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = byEnds[endKey(pts[i].idx, pts[i + 1].idx)];
        if (!p) continue;
        const a = js[p.a];
        const b = js[p.b];
        if (!a || !b) continue;
        const cad = Math.hypot(
          (Number(b.x) || 0) - (Number(a.x) || 0),
          (Number(b.y) || 0) - (Number(a.y) || 0),
          (Number(b.z) || 0) - (Number(a.z) || 0)
        );
        const resolved = window.resolvePoleSkuForEstimate(p, cad);
        const sku = resolved && Number(resolved.skuMm) > 0 ? Number(resolved.skuMm) : 0;
        if (sku > 0) skus.push(sku);
      }
      if (skus.length) columns.push(skus);
    });
    return columns;
  };

  window.summarizeRackProductHeightMm = function summarizeRackProductHeightMm(columns, hasLeg, hasTopCap) {
    const cols = Array.isArray(columns) ? columns : [];
    const heights = [];
    for (let i = 0; i < cols.length; i++) {
      let h = window.calcPoleOuterHeightMm(cols[i]);
      if (!(h > 0)) continue;
      if (hasLeg === false) h -= V_LEG;
      if (hasTopCap === false) h -= V_TC;
      heights.push(h);
    }
    if (!heights.length) {
      return { unique: false, value: null, min: null, max: null, text: null, note: null };
    }
    const min = Math.min.apply(null, heights);
    const max = Math.max.apply(null, heights);
    const unique = Math.abs(max - min) <= POLE_PITCH_EPS_MM;
    if (unique) {
      return { unique: true, value: min, min: min, max: max, text: null, note: null };
    }
    return {
      unique: false,
      value: null,
      min: min,
      max: max,
      text: min.toFixed(1) + "〜" + max.toFixed(1),
      note: "CAD接続位置は一致。実寸高さは構成により " + min.toFixed(1) + "〜" + max.toFixed(1) + " mm",
    };
  };

  /**
   * CAD ジョイント中心の高低差から外々高さを求める。
   * 新旧データとも同じ端部定数を使う（座標は変換しない）。
   */
  window.calcFrameOuterHeightMm = function calcFrameOuterHeightMm(spanY, hasLeg, hasTopCap) {
    const span = Number(spanY);
    if (!Number.isFinite(span) || span < 0) return 0;
    let h = span + V_JB_HALF;
    if (hasTopCap !== false) h += V_TC;
    if (hasLeg !== false) h += V_FLOOR_TO_JB_CENTER;
    else h += V_JB_HALF;
    return h;
  };

  window.getFloorYFromBottomJointMm = function getFloorYFromBottomJointMm(jointY) {
    return (Number(jointY) || 0) - V_FLOOR_TO_JB_CENTER;
  };

  window.getTopOuterYFromJointMm = function getTopOuterYFromJointMm(jointY, hasTopCap) {
    return (Number(jointY) || 0) + V_JB_HALF + (hasTopCap ? V_TC : 0);
  };

  window.inferHeightModelFromGeometry = function inferHeightModelFromGeometry(jointList, poleList) {
    const js = jointList || window.joints || [];
    const ps = poleList || window.poles || [];
    let sawM109 = false;
    let sawH1 = false;
    let sawLegacy = false;
    const modKeys = Object.keys(POLE_CAD_PITCH_TABLE);
    const h1Keys = Object.keys(POLE_CAD_PITCH_LEGACY_V31H1);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p || p.isCustom) continue;
      const a = js[p.a];
      const b = js[p.b];
      if (!a || !b) continue;
      const d = Math.hypot(
        (Number(b.x) || 0) - (Number(a.x) || 0),
        (Number(b.y) || 0) - (Number(a.y) || 0),
        (Number(b.z) || 0) - (Number(a.z) || 0)
      );
      for (let k = 0; k < modKeys.length; k++) {
        const sku = Number(modKeys[k]);
        if (Math.abs(d - POLE_CAD_PITCH_TABLE[sku]) <= POLE_PITCH_EPS_MM) sawM109 = true;
        else if (Math.abs(d - sku) <= POLE_PITCH_EPS_MM) sawLegacy = true;
      }
      for (let k = 0; k < h1Keys.length; k++) {
        const sku = Number(h1Keys[k]);
        if (Math.abs(d - POLE_CAD_PITCH_LEGACY_V31H1[sku]) <= POLE_PITCH_EPS_MM) sawH1 = true;
      }
    }
    const n = (sawM109 ? 1 : 0) + (sawH1 ? 1 : 0) + (sawLegacy ? 1 : 0);
    if (n > 1) return "mixed";
    if (sawM109) return "v31-m109";
    if (sawH1) return "v31-h1";
    if (sawLegacy) return "legacy";
    return window.__cubeRackHeightModel || "legacy";
  };

  /**
   * 寸法を表示用にフォーマット（丸め）
   * @param {number} mm - 寸法（mm）
   * @param {number} decimals - 小数桁数（デフォルト: 1）
   * @returns {string} フォーマット済み文字列（例: "240.9 mm"）
   */
  window.formatDim = function formatDim(mm, decimals = 1) {
    const val = Number(mm);
    if (!Number.isFinite(val)) return "-";
    return `${val.toFixed(decimals)} mm`;
  };

  // 開発用：検算ログ出力
  if (window.__CR_DBG_DIM__) {
    console.log("[dim-utils] Initialized");
    console.log("[dim-utils] Testing Beam table values:");
    [100, 150, 200, 300, 400, 600, 800].forEach(nominal => {
      const effective = window.getBeamEffectiveLengthMm(nominal);
      const outer = window.getBeamOuterToOuterLengthMm(nominal);
      console.log(`  Beam nominal=${nominal}: effective=${effective.toFixed(2)}, outer=${outer.toFixed(2)}`);
    });
    console.log("[dim-utils] Testing Pole table values:");
    [100, 200, 300, 400, 500, 600, 800].forEach(nominal => {
      const effective = window.getPoleEffectiveLengthMm(nominal);
      const outer = window.calcPoleOuterHeightMm([nominal]);
      const c2c = window.calcPoleCenterToCenterHeightMm([nominal]);
      console.log(`  Pole nominal=${nominal}: effective=${effective.toFixed(2)}, outer=${outer.toFixed(2)}, c2c=${c2c.toFixed(2)}`);
    });
    // 検算：LEG + JB + JC = 12.8 + 18.1 = 30.9
    console.log(`[dim-utils] Verification: LEG + JB + JC = ${V_LEG} + ${V_JB_JC} = ${(V_LEG + V_JB_JC).toFixed(2)} (expected: 30.9)`);
    // 検算：LEG + JB + JC + TC = 12.8 + 18.1 + 2.25 = 33.15
    console.log(`[dim-utils] Verification: LEG + JB + JC + TC = ${V_LEG} + ${V_JB_JC} + ${V_TC} = ${(V_LEG + V_JB_JC + V_TC).toFixed(2)} (expected: 33.15)`);
    // 検算：pole200単発
    const pole200Outer = window.calcPoleOuterHeightMm([200]);
    const pole200C2c = window.calcPoleCenterToCenterHeightMm([200]);
    console.log(`[dim-utils] Verification: pole200 single - outer=${pole200Outer.toFixed(2)} (expected: 251.25), c2c=${pole200C2c.toFixed(2)} (expected: 218.1)`);
  }
})();
