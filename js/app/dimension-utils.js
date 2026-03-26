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

  // 固定物理寸法（垂直方向・確定値）
  const V_JB_JC = 18.0;   // 高さ方向ジョイント厚（JOINTBALL）
  const V_LEG = 12.9;      // LEG（脚）厚み
  const V_TC = 2.2;        // TC（トップキャップ）厚み

  // 垂直定数 getter（estimate.js / drawing.js から参照用）
  window.getLegHeightMm = () => V_LEG;
  window.getTopCapHeightMm = () => V_TC;
  window.getVerticalJointThicknessMm = () => V_JB_JC;

  // Beam 名目長さ → 実効長（ジョイント間に効く長さ）テーブル
  const BEAM_EFFECTIVE_LENGTH_TABLE = {
    100: 90.8,
    150: 145.4,
    200: 200.0,
    300: 309.2,
    400: 418.3,
    600: 636.7,
    800: 855.1,
  };

  // テーブルのキーを数値配列として取得（ソート済み）
  const BEAM_NOMINAL_KEYS = Object.keys(BEAM_EFFECTIVE_LENGTH_TABLE)
    .map(Number)
    .sort((a, b) => a - b);

  // POLE 名目長さ → 実効長（図面値）テーブル
  const POLE_EFFECTIVE_LENGTH_TABLE = {
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

  /**
   * 外形高さ（床面〜最上面：LEGとTCを含む）
   * 公式: H_outer = Σ(L_i) + (N+1) × D + LEG + TC
   * 構成: LEG + D + POLE + D + TC (N=1の場合)
   * @param {number[]} poleNominalsMm - POLEの名目長さ（mm）の配列
   * @returns {number} 外形高さ（mm）
   */
  window.calcPoleOuterHeightMm = function calcPoleOuterHeightMm(poleNominalsMm) {
    const D = V_JB_JC; // 18.1 mm
    const effs = (Array.isArray(poleNominalsMm) ? poleNominalsMm : []).map(nominal => {
      return window.getPoleEffectiveLengthMm(nominal);
    }).filter(len => len > 0);
    
    const N = effs.length;
    if (N === 0) return 0;

    const sum = effs.reduce((s, v) => s + v, 0);
    // 外形高さ = Σ(L_i) + (N+1) × D + LEG + TC
    // N=1の場合: LEG + 2D + pole + TC = 12.8 + 36.2 + 200 + 2.25 = 251.25
    const outerHeight = sum + (N + 1) * D + V_LEG + V_TC;

    if (window.__CR_DBG_DIM__) {
      console.log(`[dim-utils] calcPoleOuterHeightMm: N=${N}, sum=${sum.toFixed(2)}, D=${D}, LEG=${V_LEG}, TC=${V_TC}, result=${outerHeight.toFixed(2)}`);
    }

    return outerHeight;
  };

  /**
   * 芯々高さ（最下端ジョイント中心〜最上端ジョイント中心）
   * 公式: H_c2c = Σ(L_i) + (N-1) × D（ポール間の継ぎ目は N-1 個）
   * N=1の場合: pole + 0×D = 200
   * @param {number[]} poleNominalsMm - POLEの名目長さ（mm）の配列
   * @returns {number} 芯々高さ（mm）
   */
  window.calcPoleCenterToCenterHeightMm = function calcPoleCenterToCenterHeightMm(poleNominalsMm) {
    const D = V_JB_JC; // 18.1 mm
    const effs = (Array.isArray(poleNominalsMm) ? poleNominalsMm : []).map(nominal => {
      return window.getPoleEffectiveLengthMm(nominal);
    }).filter(len => len > 0);
    
    const N = effs.length;
    if (N === 0) return 0;

    const sum = effs.reduce((s, v) => s + v, 0);
    // 芯々高さ = Σ(L_i) + (N-1) × D
    const centerToCenter = sum + Math.max(0, N - 1) * D;

    if (window.__CR_DBG_DIM__) {
      console.log(`[dim-utils] calcPoleCenterToCenterHeightMm: N=${N}, sum=${sum.toFixed(2)}, D=${D}, result=${centerToCenter.toFixed(2)}`);
    }

    return centerToCenter;
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
