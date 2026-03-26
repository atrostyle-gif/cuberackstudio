// =========================================================
// 見積機能
// =========================================================

// 見積・自動レイアウト：window 正本（スコープ事故防止）
window.__buildingAutoLayout = false;
window.__estTimer = null;

// 見積更新：連続呼び出しを1回にまとめる（デバウンス）
window.requestEstimateRender = function requestEstimateRender(reason = "") {
  if (window.__buildingAutoLayout) return;
  if (window.__estTimer) return;

  window.__estTimer = setTimeout(() => {
    window.__estTimer = null;
    try {
      if (typeof window.calcAndRenderEstimate === "function") {
        window.calcAndRenderEstimate();
      }
    } catch (e) {
      console.warn("[EST] calc failed:", reason, e);
    }
  }, 0);
};

// 実寸定数（Beam/Pole テーブル・REAL_RADIUS 用。高さ系は dimension-utils getter を使用）
const REAL_DIM = {
  jointBallDia: 18.3,   // [mm] REAL_RADIUS 用
  beam: {
    50: 36.2,
    100: 90.8,
    150: 145.4,
    200: 200.0,
    300: 309.2,
    400: 418.3,
    600: 636.7,
    800: 855.1,
  },

  // Pole 名目長さ → 実寸（芯々 or 基本寸法）
  pole: {
    100: 90.8,
    200: 200.0,
    300: 309.2,
    400: 418.3,
    500: 527.6,
    600: 636.7,
    800: 855.1,
  },
};

// ★ jointBall 半径 [mm]（オブジェクトの「外」で定義する！）
const REAL_RADIUS = REAL_DIM.jointBallDia / 2;

// 名目長さ → 実寸（見つからなければ名目そのまま）ユーティリティ
function getRealBeamLength(nominal) {
  return REAL_DIM.beam[nominal] ?? nominal;
}

function getRealPoleLength(nominal) {
  return REAL_DIM.pole[nominal] ?? nominal;
}

// スタック定数（フォールバック専用：床→最下段ジョイント中心 / 床→TopCap上面）
const REAL_STACK = {
  floorToCenterWithLeg: 30.9,
  floorToTopCapWithLeg: 33.15,
};

// 現在の joints から、X/Y/Z の最小・最大（芯々）を出す
function computeFrameDimensions() {
  if (!joints.length) return null;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  joints.forEach((j) => {
    if (!j) return;
    if (j.x < minX) minX = j.x;
    if (j.x > maxX) maxX = j.x;
    if (j.y < minY) minY = j.y;
    if (j.y > maxY) maxY = j.y;
    if (j.z < minZ) minZ = j.z;
    if (j.z > maxZ) maxZ = j.z;
  });

  if (!isFinite(minX) || !isFinite(maxX)) return null;

  // --- 芯々寸法（ジョイント中心どうしの距離） ---
  // dimension-utils.js の calcCenterToCenterLengthMm を使用
  
  // X方向（幅）の直列ビーム列を抽出して有効長を取得
  // 同じY/Z座標で、minXからmaxXまで直列に並ぶBeam列を探す
  const xBeamsAll = (window.beams || []).filter(b => {
    const ja = joints?.[b.a];
    const jb = joints?.[b.b];
    if (!ja || !jb) return false;
    const dx = Math.abs(jb.x - ja.x);
    const dy = Math.abs(jb.y - ja.y);
    const dz = Math.abs(jb.z - ja.z);
    // X方向のBeam（X方向の移動が大きく、Y/Z方向の移動が小さい）
    return dx > 0 && dx > dz * 0.5 && dy < 5;
  });
  
  // X方向のビーム有効長配列を取得
  // 同じY/Z座標で、minXからmaxXまで直列に並ぶBeam列を構築
  let xBeamEffectiveLengths = [];
  let xBeams = []; // 後続のコードで使用するため、関数スコープで定義
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
    
    // 各グループで、minXからmaxXまで直列に並ぶBeam列を探す
    // 最も長いパス（実効長の合計が最大）を選ぶ
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
        const minXBeam = Math.min(ja.x, jb.x);
        const maxXBeam = Math.max(ja.x, jb.x);
        return { beam: b, effective, nominal, minX: minXBeam, maxX: maxXBeam, ja, jb };
      }).filter(x => x && x.effective > 0);
      
      if (beamData.length === 0) return;
      
      // 簡易版：すべてのBeamの実効長を合計（直列に並んでいることを前提）
      const totalEffective = beamData.reduce((sum, b) => sum + b.effective, 0);
      if (totalEffective > maxTotalEffective) {
        maxTotalEffective = totalEffective;
        bestGroup = beamData;
      }
    });
    
    if (bestGroup) {
      xBeamEffectiveLengths = bestGroup.map(b => b.effective);
      // 後続のコードで使用するため、xBeamsを保持
      xBeams = bestGroup.map(b => b.beam);
    }
  }
  
  // Z方向（奥行）の直列ビーム列を抽出して有効長を取得
  // 同じX/Y座標で、minZからmaxZまで直列に並ぶBeam列を探す
  const zBeamsAll = (window.beams || []).filter(b => {
    const ja = joints?.[b.a];
    const jb = joints?.[b.b];
    if (!ja || !jb) return false;
    const dx = Math.abs(jb.x - ja.x);
    const dy = Math.abs(jb.y - ja.y);
    const dz = Math.abs(jb.z - ja.z);
    // Z方向のBeam（Z方向の移動が大きく、X/Y方向の移動が小さい）
    return dz > 0 && dz > dx * 0.5 && dy < 5;
  });
  
  // Z方向のビーム有効長配列を取得
  let zBeamEffectiveLengths = [];
  let zBeams = []; // 後続のコードで使用するため、関数スコープで定義
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
      zBeamEffectiveLengths = bestGroup.map(b => b.effective);
      // 後続のコードで使用するため、zBeamsを保持
      zBeams = bestGroup.map(b => b.beam);
    }
  }
  
  // Y方向（高さ）の直列Pole列を抽出して名目長さを取得
  // 同じX/Z座標で、minYからmaxYまで直列に並ぶPole列を探す
  const yPolesAll = (window.poles || []).filter(p => {
    const ja = joints?.[p.a];
    const jb = joints?.[p.b];
    if (!ja || !jb) return false;
    const dx = Math.abs(jb.x - ja.x);
    const dy = Math.abs(jb.y - ja.y);
    const dz = Math.abs(jb.z - ja.z);
    // Y方向のPole（Y方向の移動が大きく、X/Z方向の移動が小さい）
    return dy > 0 && dy > dx * 0.5 && dy > dz * 0.5;
  });
  
  // Y方向のPole名目長さ配列を取得
  let yPoleNominals = [];
  let yPoles = []; // 後続のコードで使用するため、関数スコープで定義
  if (yPolesAll.length > 0) {
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
      yPoleNominals = bestGroup;
      // 後続のコードで使用するため、yPolesを保持
      // bestGroupは名目長さの配列なので、該当するPoleを抽出
      const bestGroupSet = new Set(bestGroup);
      yPoles = yPolesAll.filter(p => {
        const nominal = p.lengthMm || p.length || 0;
        return bestGroupSet.has(nominal);
      });
    }
  }
  
  // 芯々距離を計算（公式: Σ(L_i) + N × 18.3）
  let coreWidth, coreDepth, coreHeight;
  
  if (xBeamEffectiveLengths.length > 0 && typeof window.calcCenterToCenterLengthMm === "function") {
    coreWidth = window.calcCenterToCenterLengthMm(xBeamEffectiveLengths);
  } else {
    // フォールバック：座標差を使用
    coreWidth = maxX - minX;
  }
  
  if (zBeamEffectiveLengths.length > 0 && typeof window.calcCenterToCenterLengthMm === "function") {
    coreDepth = window.calcCenterToCenterLengthMm(zBeamEffectiveLengths);
  } else {
    // フォールバック：座標差を使用
    coreDepth = maxZ - minZ;
  }
  
  // Y方向（高さ）はPOLE用の関数を使用（公式: Σ(L_i) + N × 18.1）
  if (yPoleNominals.length > 0 && typeof window.calcPoleCenterToCenterHeightMm === "function") {
    coreHeight = window.calcPoleCenterToCenterHeightMm(yPoleNominals);
  } else {
    // フォールバック：座標差を使用
    coreHeight = maxY - minY;
  }
  
  if (window.__CR_DBG_DIM__) {
    console.log("[estimate] Beam/Pole selection:", {
      xBeamsCount: xBeams.length,
      xBeamsSelected: xBeamEffectiveLengths,
      zBeamsCount: zBeams.length,
      zBeamsSelected: zBeamEffectiveLengths,
      yPolesCount: yPoles.length,
      yPolesSelected: yPoleNominals,
      coreWidth, coreDepth, coreHeight
    });
  }

  // --- 外寸：幅・奥行 ---
  // dimension-utils.js を使用して正確な外形寸法を計算
  // 複数のBeamが直列に並んでいる場合を考慮
  // 外寸 = Σ(L_i) + (N+1) × JB + 2 × SC
  // ここで、N = Beam本数、Σ(L_i) = 実効長の合計、JB = 18.3, SC = 2.1
  
  const JB = 18.3; // JOINT_BALL_DIAMETER
  const SC = 2.1;  // SIDE_CAP_THICKNESS
  
  let outerWidth, outerDepth;
  
  // X方向（幅）の外寸計算
  if (xBeamEffectiveLengths.length > 0) {
    const N = xBeamEffectiveLengths.length;
    const sumEffective = xBeamEffectiveLengths.reduce((sum, len) => sum + len, 0);
    // 外寸 = Σ(L_i) + (N+1) × JB + 2 × SC
    outerWidth = sumEffective + (N + 1) * JB + 2 * SC;
  } else {
    // フォールバック：既存の計算方法
    if (window.__CR_DBG_DIM__) {
      console.warn("[estimate] xBeamEffectiveLengths not found, using fallback");
    }
    outerWidth = coreWidth + JB + 2 * SC;
  }
  
  // Z方向（奥行）の外寸計算
  if (zBeamEffectiveLengths.length > 0) {
    const N = zBeamEffectiveLengths.length;
    const sumEffective = zBeamEffectiveLengths.reduce((sum, len) => sum + len, 0);
    // 外寸 = Σ(L_i) + (N+1) × JB + 2 × SC
    outerDepth = sumEffective + (N + 1) * JB + 2 * SC;
  } else {
    // フォールバック：既存の計算方法
    if (window.__CR_DBG_DIM__) {
      console.warn("[estimate] zBeamEffectiveLengths not found, using fallback");
    }
    outerDepth = coreDepth + JB + 2 * SC;
  }
  
  // デバッグログ
  if (window.__CR_DBG_DIM__) {
    console.log("[estimate] computeFrameDimensions result:", {
      coreWidth, coreDepth, coreHeight,
      outerWidth, outerDepth, outerHeight,
      xBeamEffectiveLengths,
      zBeamEffectiveLengths,
      xBeamsCount: xBeams.length,
      zBeamsCount: zBeams.length
    });
  }

  // --- 外寸：高さ ---
  // dimension-utils.js の calcPoleOuterHeightMm を使用
  const hasLeg = legs.length > 0;
  
  let outerHeight;
  if (yPoleNominals.length > 0 && typeof window.calcPoleOuterHeightMm === "function") {
    // 外形高さ = Σ(L_i) + (N+1) × D + LEG + TC
    outerHeight = window.calcPoleOuterHeightMm(yPoleNominals);
    
    // 脚がない場合はLEG分を引く（dimension-utils getLegHeightMm 参照）
    if (!hasLeg) {
      outerHeight -= window.getLegHeightMm();
    }
  } else {
    // フォールバック：bottom は getter、top は旧 CENTER_TO_TOPCAP 相当（ジョイント中心→TopCap上面）
    const bottomOffsetWithLeg = REAL_STACK.floorToCenterWithLeg;
    const bottomOffsetNoLeg = REAL_STACK.floorToCenterWithLeg - window.getLegHeightMm();
    const bottomOffset = hasLeg ? bottomOffsetWithLeg : bottomOffsetNoLeg;
    const topOffset = REAL_STACK.floorToTopCapWithLeg - REAL_STACK.floorToCenterWithLeg;
    outerHeight = coreHeight + bottomOffset + topOffset;
  }

  return {
    coreWidth,
    coreDepth,
    coreHeight,
    outerWidth,
    outerDepth,
    outerHeight,
  };
}

// 表示用の mm 文字列（小数1桁）
function formatMm(val) {
  if (!isFinite(val)) return "-";
  return `${val.toFixed(1)} mm`;
}

// ポップアップ内の数字を書き換える
function updateDimensionPopup() {
  const dim = computeFrameDimensions();
  
  if (!dim) {
    // 寸法が計算できない場合、すべて"-"を表示
    const ids = [
      "dim-core-width",
      "dim-core-depth",
      "dim-core-height",
      "dim-outer-width",
      "dim-outer-depth",
      "dim-outer-height",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "-";
    });
    return;
  }

  const ids = [
    "dim-core-width",
    "dim-core-depth",
    "dim-core-height",
    "dim-outer-width",
    "dim-outer-depth",
    "dim-outer-height",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    // IDからキーを生成（例: "dim-core-width" -> "coreWidth"）
    let key = id.replace("dim-", "");
    // ハイフン区切りをキャメルケースに変換
    key = key.split("-").map((part, idx) => 
      idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    ).join("");
    
    const val = dim[key];
    el.textContent = formatMm(val);
  });
}

// 見積計算とレンダリング
function calcAndRenderEstimate() {
  const jointCount = joints.length;

  // --- A1: 小物材質（種類ごと一括） ---
  const matJointBall = window.getPartTypeMaterial("jointBall");
  const matLeg       = window.getPartTypeMaterial("leg");
  const matJointCap  = window.getPartTypeMaterial("jointCap");
  const matTopCap    = window.getPartTypeMaterial("topCap");
  const matSideCap   = window.getPartTypeMaterial("sideCap");
  const matBeamNut   = window.getPartTypeMaterial("beamNut");

    // --- ビーム（規格 / オーダー）長さ別集計（材種対応） ---
  // beamSummary  : 規格ビーム（通常）  ※ { [len]: {IRON:qty, BS:qty, SUS:qty} }
  // customSummary: オーダービーム      ※ { [len]: {IRON:qty, BS:qty, SUS:qty} }
const beamSummary = {};        // key: "len|mat"
const customSummary = {};      // key: "len|mat"

  // ループ内で使う材種順（ここはローカル固定でOK）
  const __MATS__ = ["IRON", "BS", "SUS"];

  function inc2D(summary, len, mat) {
    const m = window.normalizeMaterial(mat);
    if (!summary[len]) summary[len] = { IRON: 0, BS: 0, SUS: 0 };
    if (!summary[len][m]) summary[len][m] = 0;
    summary[len][m]++;
  }

beams.forEach((b) => {
  const aPos = joints[b.a];
  const bPos = joints[b.b];
  if (!aPos || !bPos) return;

  const dx = bPos.x - aPos.x;
  const dy = bPos.y - aPos.y;
  const dz = bPos.z - aPos.z;
  const nominalLen = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

const mat = window.normalizeMaterial(b.material);

if (b.isCustom && b.customLength != null) {
  const customLen = Math.round(b.customLength);
  const k = `${customLen}|${mat}`;
  if (!customSummary[k]) customSummary[k] = 0;
  customSummary[k]++;
} else {
  const k = `${nominalLen}|${mat}`;
  if (!beamSummary[k]) beamSummary[k] = 0;
  beamSummary[k]++;
}
});

  // --- ポール長さ別（通常 / オーダー）（材種対応） ---
const poleSummary = {};        // key: "len|mat"
const customPoleSummary = {};  // key: "len|mat"

poles.forEach((p) => {
  const aPos = joints[p.a];
  const bPos = joints[p.b];
  if (!aPos || !bPos) return;

  const dx = bPos.x - aPos.x;
  const dy = bPos.y - aPos.y;
  const dz = bPos.z - aPos.z;
  const nominalLen = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

const mat = window.normalizeMaterial(p.material);

if (p.isCustom && p.customLength != null) {
  const customLen = Math.round(p.customLength);
  const k = `${customLen}|${mat}`;
  if (!customPoleSummary[k]) customPoleSummary[k] = 0;
  customPoleSummary[k]++;
} else {
  const k = `${nominalLen}|${mat}`;
  if (!poleSummary[k]) poleSummary[k] = 0;
  poleSummary[k]++;
}
});

  // --- 脚本数 ---
  const legCount = legs.length;

  // ===== 細かい部材数計算 =====
  const eps = 1e-3;

  let jointCapCount = jointCount;
  let topCapCount = 0;
  let sideCapCount = 0;
  let m5ScrewCount = 0;

    // ビーム本数（BeamNut 用）
  let totalBeamCount = 0;

  // beamSummary / customSummary は key "len|mat" → 本数 なので値をそのまま合算
  Object.keys(beamSummary).forEach((k) => {
    totalBeamCount += Number(beamSummary[k]) || 0;
  });
  Object.keys(customSummary).forEach((k) => {
    totalBeamCount += Number(customSummary[k]) || 0;
  });

  const beamNutCount = totalBeamCount * 2;

  // 各ジョイントの向きと接続数
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (!j) continue;

    let hasPoleUp = false;
    let hasPoleDown = false;
    const usedDirs = new Set(); // "x+","x-","z+","z-"

    // ポール（上下）
    poles.forEach((p) => {
      if (p.a !== i && p.b !== i) return;

      const otherIndex = p.a === i ? p.b : p.a;
      const o = joints[otherIndex];
      if (!o) return;

      if (
        Math.abs(o.x - j.x) < eps &&
        Math.abs(o.z - j.z) < eps
      ) {
        if (o.y > j.y + eps) {
          hasPoleUp = true;
        } else if (o.y < j.y - eps) {
          hasPoleDown = true;
        }
      }
    });

    // ビーム（4方向）
    beams.forEach((b) => {
      if (b.a !== i && b.b !== i) return;

      const otherIndex = b.a === i ? b.b : b.a;
      const o = joints[otherIndex];
      if (!o) return;

      if (Math.abs(o.y - j.y) > eps) return;

      const dx = o.x - j.x;
      const dz = o.z - j.z;

      if (Math.abs(dx) >= Math.abs(dz)) {
        if (dx > 0) usedDirs.add("x+");
        else if (dx < 0) usedDirs.add("x-");
      } else {
        if (dz > 0) usedDirs.add("z+");
        else if (dz < 0) usedDirs.add("z-");
      }
    });

    // SideCap
    const dirs = ["x+", "x-", "z+", "z-"];
    dirs.forEach((dir) => {
      if (!usedDirs.has(dir)) {
        sideCapCount++;
      }
    });

    // TopCap
    if (!hasPoleUp) {
      topCapCount++;
    }

    // M5皿ネジ：下側になにか付いているジョイント
    const hasLegHere = legs.some((l) => l.jointIndex === i);
    if (hasLegHere || hasPoleDown) {
      m5ScrewCount++;
    }
  }

    // ===== テーブル描画 =====
  const tbody = document.querySelector("#parts-table tbody");
  if (!tbody) {
    console.warn("#parts-table tbody が見つかりません。");
    return;
  }
  tbody.innerHTML = "";

  const items = [];

  // ★ main.js 側では「key / qty / material」だけを正本として作る（価格計算しない）
  function pushItem(key, label, qty, material) {
    if (!qty) return;

    // 棚板/壁板/壁板金物の場合はnormalizeMaterialを通さない（材質名をそのまま使用）
    let mat;
    if (key.startsWith("wallBracket_")) {
      // 壁板金物は常に"AL"
      mat = "AL";
    } else if (key.startsWith("shelfBoard_") || key.startsWith("wallPanel_")) {
      // 棚板/壁板はそのまま使用（normalizeMaterialを通さない）
      mat = material || "足場板";
    } else {
      // その他の部材はnormalizeMaterialを通す
      mat = window.normalizeMaterial(material || "IRON");
    }

    items.push({
      key,         // ← 唯一の識別子（estimate.html で getPartInfo に当てる）
      name: label, // 3D側表示用（estimate側は getPartInfo.label を使う想定）
      qty: Number(qty) || 0,
      material: mat,
    });
  }

   // --- 細かい部材（キーは parts-catalog.js に合わせる） ---
pushItem("jointBall", "JointBall", jointCount, matJointBall);
pushItem("jointCap", "JointCap",      jointCapCount, matJointCap);
pushItem("topCap",   "TopCap",        topCapCount,   matTopCap);
pushItem("sideCap",  "SideCap",       sideCapCount,  matSideCap);

// legBoss は「脚系の小物」扱いで leg と同材質に寄せる（A1）
pushItem("legBoss",  "LegBoss",       legCount,      matLeg);
pushItem("leg",      "Leg", legCount,      matLeg);

// M5 は「必要なら」扱いだったので、まずは beamNut と同系統に揃えるか、別枠を後で追加
pushItem("m5Screw",  "M5皿ネジ",      m5ScrewCount,  matBeamNut);

pushItem("beamNut",  "BeamNut",       beamNutCount,  matBeamNut);

  // --- 板（V1.1.1）の集計処理（pushItemは後で実行） ---
  // 棚板をサイズごとに集計
  const shelfSummary = {}; // key: "widthxdepth|material"
  
  // beamの長さを取得する関数
  function getBeamLength(aIdx, bIdx) {
    const beams = window.beams || [];
    const beam = beams.find(b => 
      (b.a === aIdx && b.b === bIdx) || (b.a === bIdx && b.b === aIdx)
    );
    if (beam && beam.lengthMm) {
      return beam.lengthMm;
    }
    // lengthMmが無い場合は座標から計算
    const a = window.joints?.[aIdx];
    const b = window.joints?.[bIdx];
    if (!a || !b) return 0;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
  }
  
  // 棚板のサイズを計算する関数
  function getShelfSize(j4) {
    if (!j4 || j4.length !== 4) return null;
    
    const edges = [
      [j4[0], j4[1]],
      [j4[1], j4[2]],
      [j4[2], j4[3]],
      [j4[3], j4[0]]
    ];
    
    let widthMm = 0, depthMm = 0;
    edges.forEach(([aIdx, bIdx]) => {
      const a = window.joints?.[aIdx];
      const b = window.joints?.[bIdx];
      if (!a || !b) return;
      
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      const dz = Math.abs(b.z - a.z);
      
      // X方向のbeam（幅）- 条件を緩和
      if (dx > 0 && dx >= dz * 0.5 && dy < 5) {
        const len = getBeamLength(aIdx, bIdx);
        if (len > widthMm) widthMm = len;
      }
      // Z方向のbeam（奥行き）- 条件を緩和
      if (dz > 0 && dz >= dx * 0.5 && dy < 5) {
        const len = getBeamLength(aIdx, bIdx);
        if (len > depthMm) depthMm = len;
      }
    });
    
    if (widthMm > 0 && depthMm > 0) {
      return { widthMm, depthMm };
    }
    return null;
  }
  
  // 各棚板をサイズごとに集計
  (window.shelves || []).forEach(shelf => {
    const size = getShelfSize(shelf.j4);
    if (!size) return;
    
    // 棚板の材質は「足場板」「ウォールナット」「チェリー」「オーク」を直接使用（normalizeMaterialを通さない）
    const mat = shelf.material || "足場板";
    const sizeKey = `${size.widthMm}x${size.depthMm}|${mat}`;
    
    if (!shelfSummary[sizeKey]) {
      shelfSummary[sizeKey] = 0;
    }
    shelfSummary[sizeKey]++;
  });
  
  // 壁板をサイズごとに集計
  const panelSummary = {}; // key: "widthxheight|material"
  
  // beam/poleの長さを取得する関数（estimate.js用）
  // 壁板のサイズ計算では直接座標から計算するため、この関数は使用されていないが残しておく
  function getConnectorLength(aIdx, bIdx, isPole) {
    const a = window.joints?.[aIdx];
    const b = window.joints?.[bIdx];
    if (!a || !b) return 0;
    
    // 常に座標から計算（beamの長さ変更に確実に追従するため）
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
  }
  
  // 壁板のサイズを計算する関数（X方向とZ方向の両方に対応）
  // beam×poleの名目サイズ（座標から計算して丸めた値）を返す
  // boards.jsのcomputeBoardBoundsFromJointsと同じロジックを使用
  function getPanelSize(j4) {
    if (!j4 || j4.length !== 4) return null;
    
    // boards.jsのcomputeBoardBoundsFromJointsを使用してサイズを取得
    if (typeof window.computeBoardBoundsFromJoints === "function") {
      const b = window.computeBoardBoundsFromJoints(j4, true);
      if (b && b.widthMm > 0 && b.heightMm > 0) {
        // boardInset * 2 (12mm) を戻して名目サイズを取得
        const boardInset = 6;
        return {
          widthMm: b.widthMm + (boardInset * 2),
          heightMm: b.heightMm + (boardInset * 2)
        };
      }
    }
    
    // フォールバック：手動計算
    const pts = j4.map(i => window.joints?.[i]).filter(Boolean);
    if (pts.length !== 4) {
      console.warn("[getPanelSize] Invalid joints:", j4);
      return null;
    }
    
    // 平面を自動判定（X座標またはZ座標の変化量を確認）
    const xCoords = pts.map(p => p.x);
    const zCoords = pts.map(p => p.z);
    const xRange = Math.max(...xCoords) - Math.min(...xCoords);
    const zRange = Math.max(...zCoords) - Math.min(...zCoords);
    const tolerance = 5;
    
    const edges = [
      [j4[0], j4[1]],
      [j4[1], j4[2]],
      [j4[2], j4[3]],
      [j4[3], j4[0]]
    ];
    
    let widthMm = 0, heightMm = 0;
    
    // boards.jsのcomputeBoardBoundsFromJointsと同じロジックを使用
    edges.forEach(([aIdx, bIdx]) => {
      const a = window.joints?.[aIdx];
      const b = window.joints?.[bIdx];
      if (!a || !b) return;
      
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      const dz = Math.abs(b.z - a.z);
      
      // 平面に応じて幅方向のbeamと高さ方向のpoleを検出
      if (xRange < tolerance && zRange >= tolerance) {
        // X方向の壁（幅方向）：Z方向のbeamが幅、Y方向のpoleが高さ
        // boards.jsでは dy < 1 だが、より緩く dy < 5 を使用
        if (dz > dx && dy < 5) {
          const len = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          if (len > widthMm) widthMm = len;
        }
        // Y方向のpole（高さ）
        if (dy > dx && dy > dz) {
          const len = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          if (len > heightMm) heightMm = len;
        }
      } else if (zRange < tolerance && xRange >= tolerance) {
        // Z方向の壁（奥行方向）：X方向のbeamが幅、Y方向のpoleが高さ
        // boards.jsでは dy < 1 だが、より緩く dy < 5 を使用
        if (dx > dz && dy < 5) {
          const len = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          if (len > widthMm) widthMm = len;
        }
        // Y方向のpole（高さ）
        if (dy > dx && dy > dz) {
          const len = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          if (len > heightMm) heightMm = len;
        }
      } else {
        // デフォルト（Z方向の壁として扱う）
        // boards.jsでは dy < 1 だが、より緩く dy < 5 を使用
        if (dx > dz && dy < 5) {
          const len = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          if (len > widthMm) widthMm = len;
        }
        // Y方向のpole（高さ）
        if (dy > dx && dy > dz) {
          const len = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
          if (len > heightMm) heightMm = len;
        }
      }
    });
    
    if (widthMm > 0 && heightMm > 0) {
      return { widthMm, heightMm };
    }
    
    console.warn("[getPanelSize] Could not determine panel size:", {
      j4,
      widthMm,
      heightMm,
      xRange,
      zRange,
      pts: pts.map(p => ({ x: p.x, y: p.y, z: p.z }))
    });
    return null;
  }
  
  // 各壁板をサイズごとに集計
  (window.panels || []).forEach(panel => {
    const size = getPanelSize(panel.j4);
    if (!size || size.widthMm <= 0 || size.heightMm <= 0) {
      console.warn("[estimate] Invalid panel size:", { j4: panel.j4, size });
      return;
    }
    
    // 材質は直接使用（normalizeMaterialは通さない）
    const mat = panel.material || "足場板";
    const sizeKey = `${size.widthMm}x${size.heightMm}|${mat}`;
    
    if (!panelSummary[sizeKey]) {
      panelSummary[sizeKey] = 0;
    }
    panelSummary[sizeKey]++;
  });
  
  // ===== 棚受け金物の集計（pushItemは後で実行）=====
  const br = window.countShelfBracketsForEstimate?.();

  // ===== 壁板 金物の集計（pushItemは後で実行）=====
  const wb = window.countWallBracketsForEstimate?.();

    const MATERIAL_ORDER = ["IRON", "BS", "SUS"];

  // --- ビーム（規格長さ） ---
  Object.keys(beamSummary)
    .map((k) => {
      const [lenStr, matStr] = String(k).split("|");
      const len = parseInt(lenStr, 10);
      const mat = window.normalizeMaterial(matStr);
      return Number.isFinite(len) && len > 0 ? { len, mat, k } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.mat.localeCompare(b.mat))
    .forEach(({ len, mat, k }) => {
      const qty = beamSummary[k];
      const key = `beam_${len}`;
      const label = `Beam_${len}`;
      pushItem(key, label, qty, mat);
    });

  // --- ビーム（オーダー） ---
  // [order-pricing] integrated: key を type×material×L で一意に（厳密ロット）
  Object.keys(customSummary)
    .map((k) => {
      const [lenStr, matStr] = String(k).split("|");
      const len = parseInt(lenStr, 10);
      const mat = window.normalizeMaterial?.(matStr) || (matStr || "IRON");
      return Number.isFinite(len) && len > 0 ? { len, mat, k } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.mat.localeCompare(b.mat))
    .forEach(({ len, mat, k }) => {
      const qty = customSummary[k];
      const matNorm = window.normalizeMaterial?.(mat || "IRON") || (mat || "IRON");
      const key = `beam_custom_${matNorm}_${len}`;
      const label = `Beam_${len}［オーダー］`;
      pushItem(key, label, qty, mat);
    });

  // --- ポール（規格長さ） ---
  Object.keys(poleSummary)
    .map((k) => {
      const [lenStr, matStr] = String(k).split("|");
      const len = parseInt(lenStr, 10);
      const mat = window.normalizeMaterial(matStr);
      return Number.isFinite(len) && len > 0 ? { len, mat, k } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.mat.localeCompare(b.mat))
    .forEach(({ len, mat, k }) => {
      const qty = poleSummary[k];
      const key = `pole_${len}`;
      const label = `Pole_${len}`;
      pushItem(key, label, qty, mat);
    });

  // --- ポール（オーダー） ---
  // [order-pricing] integrated: key を type×material×L で一意に（厳密ロット）
  Object.keys(customPoleSummary)
    .map((k) => {
      const [lenStr, matStr] = String(k).split("|");
      const len = parseInt(lenStr, 10);
      const mat = window.normalizeMaterial?.(matStr) || (matStr || "IRON");
      return Number.isFinite(len) && len > 0 ? { len, mat, k } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.len - b.len) || a.mat.localeCompare(b.mat))
    .forEach(({ len, mat, k }) => {
      const qty = customPoleSummary[k];
      const matNorm = window.normalizeMaterial?.(mat || "IRON") || (mat || "IRON");
      const key = `pole_custom_${matNorm}_${len}`;
      const label = `Pole_${len}［オーダー］`;
      pushItem(key, label, qty, mat);
    });

  // --- 棚板 ---
  Object.keys(shelfSummary).forEach(sizeKey => {
    const [sizeStr, mat] = sizeKey.split("|");
    const [width, depth] = sizeStr.split("x").map(Number);
    
    if (width > 0 && depth > 0) {
      const shelfLabel = `棚板_${width}x${depth}`;
      const shelfKey = `shelfBoard_${width}x${depth}`;
      const qty = shelfSummary[sizeKey];
      pushItem(shelfKey, shelfLabel, qty, mat);
    }
  });

  // ===== 棚受け金物（棚板に応じて自動）=====
  if (br) {
    const mapSku = {
      "100": "shelfBracket_100",
      "200": "shelfBracket_200",
      "300": "shelfBracket_300",
      "400": "shelfBracket_400",
      "600": "shelfBracket_600",
    };

    // 形状ごとに集計して表示（標準、凸型、凹型）
    Object.keys(br).forEach(widthKey => {
      const data = br[widthKey];
      const sku = mapSku[widthKey];
      if (!sku) return;
      
      // 標準
      const stdQty = data.STD || 0;
      if (stdQty > 0) {
        pushItem(`${sku}_STD`, `棚受金物_${widthKey}（標準）`, stdQty, "IRON");
      }
      
      // 凸型
      const convexQty = data.CONVEX || 0;
      if (convexQty > 0) {
        pushItem(`${sku}_CONVEX`, `棚受金物_${widthKey}（凸型）`, convexQty, "IRON");
      }
      
      // 凹型
      const concaveQty = data.CONCAVE || 0;
      if (concaveQty > 0) {
        pushItem(`${sku}_CONCAVE`, `棚受金物_${widthKey}（凹型）`, concaveQty, "IRON");
      }
    });
  }

  // --- 壁板 ---
  Object.keys(panelSummary).forEach(sizeKey => {
    const [sizeStr, mat] = sizeKey.split("|");
    const [width, height] = sizeStr.split("x").map(Number);
    
    if (width > 0 && height > 0) {
      const panelLabel = `壁板_${width}x${height}`;
      const panelKey = `wallPanel_${width}x${height}`;
      const qty = panelSummary[sizeKey];
      pushItem(panelKey, panelLabel, qty, mat);
    }
  });

  // ===== 壁板 金物（壁板1枚につき両側2本）=====
  if (wb) {
    const mapSku = {
      "100": "wallBracket_100",
      "200": "wallBracket_200",
      "300": "wallBracket_300",
      "400": "wallBracket_400",
      "600": "wallBracket_600",
      "800": "wallBracket_800",
    };

    Object.keys(wb).forEach(widthKey => {
      const qty = wb[widthKey] || 0; // 本数
      const sku = mapSku[widthKey];
      if (sku && qty > 0) {
        pushItem(sku, `壁板金物_${widthKey}`, qty, "AL");
      }
    });
  }

// ===== 3D画面側の簡易テーブル描画（表示用に catalog から単価を引く）=====
let totalDisplay = 0;

// [order-pricing] integrated: lengthMm fallback hardened — key 末尾の数値を安全に抽出
function extractTrailingInt(str) {
  const m = String(str).match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

items.forEach((item) => {
  const tr = document.createElement("tr");

  const tdName = document.createElement("td");

  // ★ 3D側でも正式名称は getPartInfo().label を優先（材種対応）
  // ただし、item.nameが存在する場合はそれを優先（サイズ情報などが含まれる）
  const infoForLabel =
    (typeof window.getPartInfo === "function")
      ? window.getPartInfo(item.key, item.material)
      : null;

  const catalogLabel = infoForLabel?.label;
  // item.nameが存在する場合はそれを優先（サイズ情報が含まれる可能性がある）
  tdName.textContent =
    (item.name && item.name.trim())
      ? item.name
      : (typeof catalogLabel === "string" && catalogLabel.trim())
        ? catalogLabel
        : item.key;

  const tdQty = document.createElement("td");
  tdQty.textContent = String(item.qty);

  // ★材質列（3D側にも明示的に表示）
  // 棚板/壁板/壁板金物の場合は材質名をそのまま表示、それ以外は大文字に変換
  const tdMat = document.createElement("td");
  const key = String(item.key || "");
  let matDisplay;
  if (key.startsWith("wallBracket_")) {
    // 壁板金物は常に"AL"
    matDisplay = "AL";
  } else if (key.startsWith("shelfBoard_") || key.startsWith("wallPanel_")) {
    // 棚板/壁板はそのまま表示
    matDisplay = item.material || "足場板";
  } else {
    // その他の部材は大文字に変換
    matDisplay = String(item.material || "IRON").toUpperCase();
  }
  tdMat.textContent = matDisplay;

  // オーダー品（beam_custom_/pole_custom_）は3D側ではルール未適用なので "-" のままにする
  const isCustom =
    String(item.key).startsWith("beam_custom_") ||
    String(item.key).startsWith("pole_custom_");

  let unitPrice = 0;
  let sub = 0;

  // [order-pricing] integrated: オーダー（カスタム長さ）のみ calcOrderTotal の total を使用／key は type×material×L 形式をパース
  if (isCustom && typeof window.calcOrderTotal === "function") {
    const keyStr = String(item.key);
    const type = keyStr.startsWith("beam_custom_") ? "BEAM" : "POLE";
    const parts = keyStr.split("_");
    let material = "IRON";
    let lengthMm = 0;
    // 新形式: beam_custom_IRON_799 / pole_custom_BS_1000 → parts[2]=material, parts[3]=lengthMm
    if (parts.length >= 4 && parts[2] && parts[3] !== undefined) {
      material = window.normalizeMaterial?.(parts[2]) || parts[2] || "IRON";
      lengthMm = Number(parts[3]) || 0;
      // [order-pricing] integrated: lengthMm fallback hardened
      if (!lengthMm) lengthMm = extractTrailingInt(keyStr);
    } else {
      // 後方互換: 旧形式 beam_custom_799 — split に依存せず key 末尾の数値を拾う
      // [order-pricing] integrated: lengthMm fallback hardened
      material = "IRON";
      lengthMm = extractTrailingInt(keyStr);
    }
    const qty = Number(item.qty) || 0;
    if (lengthMm > 0 && qty > 0) {
      try {
        const result = window.calcOrderTotal({ type, material, lengthMm, qty });
        sub = result.total;
        unitPrice = result.unitRef || Math.round(result.total / qty);
      } catch (e) {
        console.warn("[estimate] calcOrderTotal failed:", e);
      }
    }
  } else {
    // ★ 表示用：getPartInfo から単価を参照（材種対応）— 既製品（定尺）は従来通り
    const info =
      (typeof window.getPartInfo === "function")
        ? window.getPartInfo(item.key, item.material)
        : null;
    unitPrice = info ? (Number(info.unitPrice) || 0) : 0;
    sub = unitPrice * (Number(item.qty) || 0);
  }

  const tdPrice = document.createElement("td");
  tdPrice.textContent = unitPrice > 0 ? unitPrice.toLocaleString() : "-";

  const tdSub = document.createElement("td");
  tdSub.textContent = sub > 0 ? sub.toLocaleString() : "-";

  if (sub > 0) totalDisplay += sub;

  tr.appendChild(tdName);
  tr.appendChild(tdQty);
  tr.appendChild(tdMat); // ★追加
  tr.appendChild(tdPrice);
  tr.appendChild(tdSub);
  tbody.appendChild(tr);
});

// =========================================================
// estimate.html へ渡す正本（key/name/qty/material）を確定して保存
// =========================================================
window.currentEstimateParts = items.map((it) => {
  const key = it.key || "";
  // 棚板/壁板/壁板金物の場合はnormalizeMaterialを通さない（材質名をそのまま使用）
  let material;
  if (key.startsWith("wallBracket_")) {
    // 壁板金物は常に"AL"
    material = "AL";
  } else if (key.startsWith("shelfBoard_") || key.startsWith("wallPanel_")) {
    // 棚板/壁板はそのまま使用（normalizeMaterialを通さない）
    material = it.material || "足場板";
  } else {
    // その他の部材はnormalizeMaterialを通す
    material = window.normalizeMaterial(it.material || "IRON");
  }
  
  return {
    key: key,
    name: it.name || null,
    qty: Number(it.qty) || 0,
    material: material,
  };
});

try {
  localStorage.setItem("currentEstimateParts", JSON.stringify(window.currentEstimateParts));
} catch (e) {
  console.warn("[estimate] failed to save currentEstimateParts", e);
}

// draftEstimate を使っている構成なら保険で同梱（既存がある場合だけ）
try {
  const draft = JSON.parse(localStorage.getItem("draftEstimate") || "{}");
  draft.currentEstimateParts = window.currentEstimateParts;
  localStorage.setItem("draftEstimate", JSON.stringify(draft));
} catch (_) {}

// 3D側合計（表示用）
const totalEl = document.getElementById("total");
if (totalEl) {
  totalEl.textContent = `合計：${totalDisplay.toLocaleString()} 円（税込・参考価格）`;
}

// ===== 見積もり画面へ渡すデータ（key+name+qty+material） =====
window.currentEstimateParts = (items || []).map((it) => {
  const key = it?.key || "";
  // 棚板/壁板/壁板金物の場合はnormalizeMaterialを通さない（材質名をそのまま使用）
  let material;
  if (key.startsWith("wallBracket_")) {
    // 壁板金物は常に"AL"
    material = "AL";
  } else if (key.startsWith("shelfBoard_") || key.startsWith("wallPanel_")) {
    // 棚板/壁板はそのまま使用（normalizeMaterialを通さない）
    material = it?.material || "足場板";
  } else {
    // その他の部材はnormalizeMaterialを通す
    material = window.normalizeMaterial(it?.material || "IRON");
  }
  
  return {
    key: key,
    name: it?.name || null,
    qty: Number(it?.qty) || 0,
    material: material,
  };
});

// ★ 3D側で算出した参考合計（estimate.html へ渡す）
window.currentEstimateTotal = totalDisplay;
  if (!window.hasEverRendered) {
    window.hasEverRendered = true;
    window.isDirty = false;
    if (typeof updateTabTitle === "function") updateTabTitle();
  } else {
    window.isDirty = true;
    if (typeof updateTabTitle === "function") updateTabTitle();
  }

  if (typeof updateDimensionPopup === "function") {
    updateDimensionPopup();
  }
  if (window.isColorChartOn) {
    if (typeof window.updateColorChartPopup === "function") window.updateColorChartPopup();
  }
  // 在庫照合テーブルを最新BOMで再描画（部材追加時に必要数・行が追従する）
  try {
    if (typeof window.refreshStockReconcileTable === "function") window.refreshStockReconcileTable();
  } catch (e) {
    console.warn("[estimate] refreshStockReconcileTable", e);
  }
}

// 見積データの構築
function buildEstimatePayload() {
  // 念のため、まだ一度も計算されていなければ実行
  if (!window.currentEstimateParts || !window.currentEstimateParts.length) {
    if (!window.__buildingAutoLayout) {
  window.requestEstimateRender("after autolayout");
}

  }

  const rawParts = window.currentEstimateParts || [];
  const total = window.currentEstimateTotal ?? 0;

  // estimate.html に渡す正規化データ
  const parts = rawParts.map((p) => ({
    key: p.key,          // ← パーツ識別子（正本）
    qty: Number(p.qty) || 0,
  }));

  return { parts, total };
}

/**
 * 見積もり画面（estimate.html）へデータを送って開く
 */
window.sendToEstimate = function (e) {
  // ★ ここが重要：他の click ハンドラを止める
  e?.preventDefault?.();
  e?.stopPropagation?.();
  e?.stopImmediatePropagation?.();

// ===== 見積書へ渡す（localStorage: draftEstimate）=====
// ★ material と name を必ず含める（estimate.html 側で材種別単価を引くため、nameは表示用）
// 棚板/壁板/壁板金物の場合はnormalizeMaterialを通さない（材質名をそのまま使用）
const partsWithMaterial = (window.currentEstimateParts || []).map((p) => {
  const key = p?.key || "";
  let material;
  if (key.startsWith("wallBracket_")) {
    // 壁板金物は常に"AL"
    material = "AL";
  } else if (key.startsWith("shelfBoard_") || key.startsWith("wallPanel_")) {
    // 棚板/壁板はそのまま使用（normalizeMaterialを通さない）
    material = p?.material || "足場板";
  } else {
    // その他の部材はnormalizeMaterialを通す
    material = window.normalizeMaterial(p?.material || "IRON");
  }
  
  return {
    key: key,
    name: p?.name || null,
    qty: Number(p?.qty) || 0,
    material: material,
  };
});

const payload = {
  parts: partsWithMaterial,
  total: Number(window.currentEstimateTotal) || 0,
};

localStorage.setItem("draftEstimate", JSON.stringify(payload));

  const win = window.open("estimate.html", "_blank"); // featuresは付けない
if (win) {
  try { win.opener = null; } catch (_) {}
} else {
  alert(
    "見積画面を別タブで開けませんでした（ポップアップがブロックされています）。\n" +
    "このサイトのポップアップを許可してください。"
  );
}
  return false;
};

// グローバルに公開
window.calcAndRenderEstimate = calcAndRenderEstimate;
window.buildEstimatePayload = buildEstimatePayload;
window.computeFrameDimensions = computeFrameDimensions;
window.formatMm = formatMm;
window.updateDimensionPopup = updateDimensionPopup;
window.getRealBeamLength = getRealBeamLength;
window.getRealPoleLength = getRealPoleLength;

// 定数も公開
window.REAL_DIM = REAL_DIM;
window.REAL_RADIUS = REAL_RADIUS;
window.REAL_STACK = REAL_STACK;
