// =========================================================
// 自動レイアウト機能
// =========================================================

const RAISE_BOTTOM_POLE_MM = 100;
const RAISE_BOTTOM_POLE_OPTIONS = [50, 100, 200, 300, 400, 500, 600, 800];

function poleStagePitchMm(nominal) {
  if (typeof window.getPoleCenterPitchMm === "function") {
    const n = window.getPoleCenterPitchMm(nominal);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const raw = Number(nominal);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function resolveRaiseHeightMm(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return RAISE_BOTTOM_POLE_MM;
  for (let i = 0; i < RAISE_BOTTOM_POLE_OPTIONS.length; i++) {
    if (Math.abs(RAISE_BOTTOM_POLE_OPTIONS[i] - n) <= 1e-6) return RAISE_BOTTOM_POLE_OPTIONS[i];
  }
  return RAISE_BOTTOM_POLE_MM;
}

// cfg.raiseBottom / cfg.bottomBeams / cfg.raiseHeightMm を正規化する。
// 立ち上げONで下部Beam未指定なら「なし」。立ち上げOFFなら床ビームは常に生成する。
function resolveRaiseBottomOptions(cfg) {
  const src = cfg && typeof cfg === "object" ? cfg : {};
  const raiseRaw = src.raiseBottom;
  const raiseBottom = raiseRaw === true || raiseRaw === 1 || raiseRaw === "on" || raiseRaw === "true";

  let bottomBeams = raiseBottom ? false : true;
  const beamRaw = src.bottomBeams;
  if (beamRaw === false || beamRaw === 0 || beamRaw === "off" || beamRaw === "none" || beamRaw === "なし") {
    bottomBeams = false;
  }
  if (src.omitBottomBeams === true || src.omitBottomBeams === 1 || src.omitBottomBeams === "on") {
    bottomBeams = false;
  }
  if (beamRaw === true || beamRaw === 1 || beamRaw === "on" || beamRaw === "あり") {
    bottomBeams = true;
  }

  return {
    raiseBottom,
    bottomBeams,
    raiseHeightMm: resolveRaiseHeightMm(src.raiseHeightMm),
  };
}

const SHARED_COLUMN_Y_EPS = 0.05;

function uniqueSortedYs(ys, eps) {
  const e = Number.isFinite(eps) ? eps : SHARED_COLUMN_Y_EPS;
  const sorted = (Array.isArray(ys) ? ys : [])
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const y = sorted[i];
    if (!out.length || Math.abs(out[out.length - 1] - y) > e) out.push(y);
  }
  return out;
}

function ySetContains(fine, coarse, eps) {
  const e = Number.isFinite(eps) ? eps : SHARED_COLUMN_Y_EPS;
  if (!Array.isArray(fine) || !Array.isArray(coarse)) return false;
  for (let i = 0; i < coarse.length; i++) {
    const cy = coarse[i];
    let found = false;
    for (let j = 0; j < fine.length; j++) {
      if (Math.abs(fine[j] - cy) <= e) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function cellStageYLevels(pitchList, stageBaseY) {
  const ys = [Number(stageBaseY) || 0];
  let y = ys[0];
  const list = Array.isArray(pitchList) ? pitchList : [];
  for (let i = 0; i < list.length; i++) {
    const pitch = poleStagePitchMm(list[i]);
    if (!(pitch > 0)) continue;
    y += pitch;
    ys.push(y);
  }
  return uniqueSortedYs(ys, SHARED_COLUMN_Y_EPS);
}

function formatHeightsLabel(heights) {
  return (Array.isArray(heights) ? heights : []).map((h) => {
    const n = Number(h);
    return Number.isFinite(n) ? String(n) : String(h);
  }).join("+");
}

function normalizeStageMatrix(enabledMatrix, stageMatrix) {
  const depth = (enabledMatrix || []).length;
  const width = (enabledMatrix[0] || []).length;
  const makeDefaultCell = () => ({ stages: 1, heights: [300] });
  const src = Array.isArray(stageMatrix) ? stageMatrix : null;

  return Array.from({ length: depth }, (_, z) =>
    Array.from({ length: width }, (_, x) => {
      if (!enabledMatrix[z]?.[x]) return null;
      const cell = src?.[z]?.[x];
      if (!cell || !Array.isArray(cell.heights)) return makeDefaultCell();
      const heights = cell.heights
        .map((v) => parseFloat(v))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (!heights.length) return makeDefaultCell();
      return {
        stages: Number.isFinite(+cell.stages) ? +cell.stages : heights.length,
        heights,
      };
    })
  );
}

function collectSharedColumnChains(depthCount, widthCount, enabledMatrix, stageData, stageBaseY) {
  const columns = [];
  for (let zi = 0; zi <= depthCount; zi++) {
    for (let xi = 0; xi <= widthCount; xi++) {
      const chains = [];
      const neighbors = [
        [zi - 1, xi - 1],
        [zi - 1, xi],
        [zi, xi - 1],
        [zi, xi],
      ];
      for (let n = 0; n < neighbors.length; n++) {
        const zr = neighbors[n][0];
        const xc = neighbors[n][1];
        if (zr < 0 || xc < 0 || zr >= depthCount || xc >= widthCount) continue;
        if (!enabledMatrix[zr]?.[xc]) continue;
        const info = stageData[zr]?.[xc];
        const pitchList = info?.heights;
        if (!Array.isArray(pitchList) || !pitchList.length) continue;
        chains.push({
          zr,
          xc,
          heights: pitchList.slice(),
          ys: cellStageYLevels(pitchList, stageBaseY),
        });
      }
      if (!chains.length) continue;
      columns.push({ xi, zi, chains });
    }
  }
  return columns;
}

function resolveSharedColumnYs(chains, eps) {
  const list = Array.isArray(chains) ? chains : [];
  if (!list.length) return { ok: true, ys: [] };
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    let coversAll = true;
    for (let j = 0; j < list.length; j++) {
      if (!ySetContains(ch.ys, list[j].ys, eps)) {
        coversAll = false;
        break;
      }
    }
    if (coversAll && (!best || ch.ys.length > best.ys.length)) best = ch;
  }
  if (best) return { ok: true, ys: best.ys, source: best };
  return { ok: false, chains: list };
}

function planSharedColumnPoles(opts) {
  const src = opts && typeof opts === "object" ? opts : {};
  const depthCount = src.depthCount | 0;
  const widthCount = src.widthCount | 0;
  const columns = collectSharedColumnChains(
    depthCount,
    widthCount,
    src.enabledMatrix || [],
    src.stageData || [],
    Number(src.stageBaseY) || 0
  );
  const resolved = [];
  const conflicts = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const plan = resolveSharedColumnYs(col.chains);
    if (plan.ok) resolved.push({ xi: col.xi, zi: col.zi, ys: plan.ys, chains: col.chains });
    else conflicts.push({ xi: col.xi, zi: col.zi, chains: col.chains });
  }
  return {
    ok: conflicts.length === 0,
    columns: resolved,
    conflicts,
  };
}

function describeSharedColumnConflict(conflicts, xPos, zPos) {
  const lines = [
    "共有柱の段構成が一致しないため、自動レイアウトを中止しました。",
    "既存のCADは変更していません。",
    "",
    "中間ジョイントの高さが異なる柱があります。POLE600 と POLE200+400 のように一方が他方を分割できる場合は生成できますが、POLE200+400 と POLE300+300 のように中間位置がずれる場合は生成できません。",
    "",
    "競合する柱:",
  ];
  (conflicts || []).forEach((col, idx) => {
    const x = Array.isArray(xPos) && Number.isFinite(xPos[col.xi]) ? xPos[col.xi] : col.xi;
    const z = Array.isArray(zPos) && Number.isFinite(zPos[col.zi]) ? zPos[col.zi] : col.zi;
    const labels = [];
    (col.chains || []).forEach((ch) => {
      const label = "ベイ(" + (ch.xc + 1) + "列," + (ch.zr + 1) + "行) " + formatHeightsLabel(ch.heights);
      if (labels.indexOf(label) < 0) labels.push(label);
    });
    lines.push("・柱" + (idx + 1) + "（X=" + x + ", Z=" + z + "）: " + labels.join(" / "));
  });
  return lines.join("\n");
}

function notifySharedColumnConflict(message, conflicts) {
  window.__lastAutoLayoutConflict = {
    message,
    conflicts: conflicts || [],
  };
  if (typeof window.alert === "function") window.alert(message);
  console.warn("[autolayout] shared-column pole conflict", window.__lastAutoLayoutConflict);
}

function applySelectModeAfterAutolayout() {
  try {
    if (window.v3CadToolbar && typeof window.v3CadToolbar.runCommand === "function") {
      window.v3CadToolbar.runCommand("select");
      return;
    }
    if (typeof window.v3SetToolMode === "function") {
      window.v3SetToolMode("select");
      return;
    }
    window.__V3_TOOL_MODE__ = "select";
  } catch (e) {
    console.warn("[autolayout] failed to switch to select", e);
    window.__V3_TOOL_MODE__ = "select";
  }
}

// 軸判定（X/Y/Zのみ）と「同じ列・行」抽出
function getAlignedJointIndices(axis, baseJoint) {
  if (!axis || !baseJoint || !Array.isArray(joints)) return [];

  const eps = 1e-6; // 念のため（整数運用でも害なし）
  const eq = (u, v) => Math.abs((u ?? 0) - (v ?? 0)) < eps;

  return joints
    .map((j, i) => ({ j, i }))
    .filter(({ j }) => {
      if (!j) return false;
      if (axis === "x") return eq(j.y, baseJoint.y) && eq(j.z, baseJoint.z);
      if (axis === "y") return eq(j.x, baseJoint.x) && eq(j.z, baseJoint.z);
      if (axis === "z") return eq(j.x, baseJoint.x) && eq(j.y, baseJoint.y);
      return false;
    })
    .map((o) => o.i);
}

// 片側固定・片側シフト（境界座標1本方式）
function shiftClusterJointsOnSide(aIndex, bIndex, axis, delta, limitClusterId = -1) {
  const a = joints?.[aIndex];
  if (!a || !axis || !Number.isFinite(delta)) return;

  // a側を固定、aの座標を境界にする
  const boundary = a[axis];

  let movedCount = 0;

  for (let i = 0; i < joints.length; i++) {
  const j = joints[i];
  if (!j) continue;

  // ★別ラック遮断（ラック単位B）
  //  - limitClusterId が有効なときだけ制限する
  //  - jointClusterId が未整備でも落ちないようにガード
  if (limitClusterId >= 0) {
    if (!Array.isArray(jointClusterId) || jointClusterId[i] !== limitClusterId) {
      continue;
    }
  }

  // 境界より「大きい側」だけを動かす
  if (j[axis] > boundary) {
    j[axis] += delta;
    movedCount++;
  }
}

  console.log("[shiftClusterJointsOnSide FIXED]", {
    axis,
    delta,
    boundary,
    movedCount
  });

  if (movedCount > 0) {
    // メッシュ位置を更新
    if (typeof syncJointMeshesFromData === "function") {
      syncJointMeshesFromData();
    }
    if (typeof syncConnectorMeshesFromData === "function") {
      syncConnectorMeshesFromData();
    }
    if (typeof syncLegMeshesFromData === "function") {
      syncLegMeshesFromData();
    }
  }
}

// 全置換で消える Joint を参照する棚板・壁板を、データとメッシュから捨てる。
// remapBoardsForJointIndexMap を1回だけ使い、全要素 -1（残す Joint なし）にする。
// 新しい Joint を作ったあとに呼ぶと、古い j4 が新インデックスへ誤結線するので、必ずクリア前に呼ぶ。
function dropBoardsForReplacedJoints() {
  try { window.clearBoardSelection?.(); } catch (e) {}
  const n = Array.isArray(joints) ? joints.length : 0;
  const indexMap = new Array(Math.max(n, 1)).fill(-1);
  try {
    window.remapBoardsForJointIndexMap?.(indexMap);
  } catch (e) {
    console.warn("[autolayout] board j4 drop failed", e);
  }
}

// 指定のマトリクス設定からラックを自動生成（多段対応版）
function buildAutoLayoutFromMatrix(cfg, mode = "replace") {
  if (!cfg) return;
  if (window.v3WorkLayers && typeof window.v3WorkLayers.hasProtectedRack === "function" && window.v3WorkLayers.hasProtectedRack()) {
    console.warn("[work-layers] refused autolayout");
    return;
  }

  const widthLens     = cfg.widthLens || [];
  const depthLens     = cfg.depthLens || [];
  const enabledMatrix = cfg.enabledMatrix || [];
  const stageMatrix   = cfg.stageMatrix;

  const depthCount = depthLens.length; // 行数（Z方向）
  const widthCount = widthLens.length; // 列数（X方向）

  // ---- パフォーマンス対策：大量セル時の重複探索/接続追加を抑制 ----
  const jointIndexCache = new Map(); // "x|y|z" -> jointIndex
  const beamEdgeSet = new Set(); // "a|b"（昇順/降順問わず順序統一）
  const poleEdgeSet = new Set();

  const jointPosKey = (x, y, z) => `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
  const getOrCreateJointAt = (pos) => {
    const key = jointPosKey(pos.x, pos.y, pos.z);
    const cached = jointIndexCache.get(key);
    if (cached !== undefined) return cached;
    const idx = window.createJoint(pos);
    jointIndexCache.set(key, idx);
    return idx;
  };

  const edgeKey = (a, b) => {
    if (a == null || b == null) return null;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };

  const connectBeam = (a, b) => {
    const k = edgeKey(a, b);
    if (k == null || beamEdgeSet.has(k)) return;
    beamEdgeSet.add(k);
    if (typeof window.addBeamConnection === "function") window.addBeamConnection(a, b);
  };

  const connectPole = (a, b) => {
    const k = edgeKey(a, b);
    if (k == null || poleEdgeSet.has(k)) return;
    poleEdgeSet.add(k);
    if (typeof window.addPoleConnection === "function") window.addPoleConnection(a, b);
  };

  // ---- 0) 段データを正規化（CAD変更の前に柱構成を検証する） ----
  const cellStageData = normalizeStageMatrix(enabledMatrix, stageMatrix);

  const xPos = [0];
  widthLens.forEach((len) => {
    xPos.push(xPos[xPos.length - 1] + len);
  });

  const zPos = [0];
  depthLens.forEach((len) => {
    zPos.push(zPos[zPos.length - 1] + len);
  });

  const baseY = 0;
  const raiseOpts = resolveRaiseBottomOptions(cfg);
  const raiseBottom = !!raiseOpts.raiseBottom;
  const bottomBeams = raiseOpts.bottomBeams !== false;
  const raiseHeightMm = raiseOpts.raiseHeightMm; // SKU（既定 100）
  const raiseY = baseY + poleStagePitchMm(raiseHeightMm);
  const stageBaseYForPlan = raiseBottom ? raiseY : baseY;

  const columnPolePlan = planSharedColumnPoles({
    depthCount,
    widthCount,
    enabledMatrix,
    stageData: cellStageData,
    stageBaseY: stageBaseYForPlan,
  });
  if (!columnPolePlan.ok) {
    const message = describeSharedColumnConflict(columnPolePlan.conflicts, xPos, zPos);
    notifySharedColumnConflict(message, columnPolePlan.conflicts);
    return { ok: false, conflict: true, conflicts: columnPolePlan.conflicts };
  }
  window.__lastAutoLayoutConflict = null;

  // ★ 自動レイアウト開始：見積もり抑制ON（検証通過後だけシーンを触る）
  window.__buildingAutoLayout = true;
  globalThis.cellStageData = cellStageData;

  // ---- 1) 既存シーンをクリア（置き換えモードのときだけ） ----
  if (mode === "replace") {
    if (typeof saveHistory === "function") saveHistory();

    // Joint 配列を空にする前に、古い棚板・壁板を破棄する（j4 の誤結線防止）
    dropBoardsForReplacedJoints();

    // メッシュ削除
    jointMeshes.forEach((m, idx) => {
      if (!m) return;
      if (typeof disposeJointMeshByIndex === "function") disposeJointMeshByIndex(idx);
    });
    beams.forEach((b) => {
      if (typeof disposeBeamMesh === "function") disposeBeamMesh(b);
    });
    poles.forEach((p) => {
      if (typeof disposePoleMesh === "function") disposePoleMesh(p);
    });
    legs.forEach((l) => {
      if (typeof disposeLegMesh === "function") disposeLegMesh(l);
    });

    // 配列クリア
    joints.length      = 0;
    jointMeshes.length = 0;
    beams.length       = 0;
    poles.length       = 0;
    legs.length        = 0;
  }

  // ---- 1.5) append のときは右にずらして追加するためのオフセットを決める ----
  let baseOffsetX = 0;

  if (mode === "append" && joints.length > 0) {
    // 既存ジョイントの X 座標を見て一番右から+300mmの位置に追加
    const xs = joints.map((j, idx) =>
      j && jointMeshes[idx] ? jointMeshes[idx].position.x : 0
    );
    const maxX = Math.max(...xs);
    baseOffsetX = maxX + 300;
  }

  // ---- 3) どの交点にジョイントが必要かマークする（床レベル） ----
  // jointIndexGrid[zi][xi] = その位置の床ジョイントindex or null
  const usedJoint = [];
  for (let zi = 0; zi <= depthCount; zi++) {
    const row = [];
    for (let xi = 0; xi <= widthCount; xi++) {
      row.push(false);
    }
    usedJoint.push(row);
  }

  // 各マスが ON なら、その4つの角の交点を使用中としてマーク
  for (let zr = 0; zr < depthCount; zr++) {
    const rowFlags = enabledMatrix[zr] || [];
    for (let xc = 0; xc < widthCount; xc++) {
      if (!rowFlags[xc]) continue;

      usedJoint[zr][xc]         = true; // 手前・左
      usedJoint[zr][xc + 1]     = true; // 手前・右
      usedJoint[zr + 1][xc]     = true; // 奥・左
      usedJoint[zr + 1][xc + 1] = true; // 奥・右
    }
  }

  // ---- 4) usedJoint が true の交点にだけ床ジョイント＋脚を作る ----
  const jointIndexGrid = [];
  for (let zi = 0; zi <= depthCount; zi++) {
    const row = [];
    for (let xi = 0; xi <= widthCount; xi++) {
      if (usedJoint[zi][xi]) {
        const idx = getOrCreateJointAt({
          x: xPos[xi] + baseOffsetX,
          y: baseY,
          z: zPos[zi],
        });
        row.push(idx);
        // 床にある使用中ジョイントだけ脚を付ける
        if (typeof window.addLegIfNeeded === "function") window.addLegIfNeeded(idx);
      } else {
        row.push(null);
      }
    }
    jointIndexGrid.push(row);
  }

  // ---- 5) 床レベル（LEG直上）のマスごとにビームを張る（ONマスだけ） ----
  // 立ち上げ＋下部Beamなしのときだけ、この y=baseY のビームを省略する。
  // JointBall / LEG / 立ち上げPOLE / 上段ビームは省略しない。
  if (!raiseBottom || bottomBeams) {
    for (let zr = 0; zr < depthCount; zr++) {
      for (let xc = 0; xc < widthCount; xc++) {
        const rowFlags = enabledMatrix[zr] || [];
        const isOn = rowFlags[xc];
        if (!isOn) continue;

        const j00 = jointIndexGrid[zr][xc];         // 手前・左
        const j10 = jointIndexGrid[zr][xc + 1];     // 手前・右
        const j01 = jointIndexGrid[zr + 1][xc];     // 奥・左
        const j11 = jointIndexGrid[zr + 1][xc + 1]; // 奥・右

        if (j00 == null || j10 == null || j01 == null || j11 == null) continue;

        // 四辺にビームを張る（重複追加は local set で抑制）
        connectBeam(j00, j10); // 手前横
        connectBeam(j01, j11); // 奥横
        connectBeam(j00, j01); // 左縦
        connectBeam(j10, j11); // 右縦
      }
    }
  }

  // ---- 5.5) 最下段立ち上げ：LEG直上ジョイント → 選択SKUのPOLE → 上端ジョイント ----
  const raiseJointIndexGrid = [];
  if (raiseBottom) {
    for (let zi = 0; zi <= depthCount; zi++) {
      const row = [];
      for (let xi = 0; xi <= widthCount; xi++) {
        if (usedJoint[zi][xi]) {
          const floorIdx = jointIndexGrid[zi][xi];
          const idx = getOrCreateJointAt({
            x: xPos[xi] + baseOffsetX,
            y: raiseY,
            z: zPos[zi],
          });
          row.push(idx);
          if (floorIdx != null) connectPole(floorIdx, idx);
        } else {
          row.push(null);
        }
      }
      raiseJointIndexGrid.push(row);
    }

    // 立ち上げPOLE 上端側のビーム（下部Beam省略の対象外）
    for (let zr = 0; zr < depthCount; zr++) {
      for (let xc = 0; xc < widthCount; xc++) {
        const rowFlags = enabledMatrix[zr] || [];
        if (!rowFlags[xc]) continue;

        const j00 = raiseJointIndexGrid[zr][xc];
        const j10 = raiseJointIndexGrid[zr][xc + 1];
        const j01 = raiseJointIndexGrid[zr + 1][xc];
        const j11 = raiseJointIndexGrid[zr + 1][xc + 1];
        if (j00 == null || j10 == null || j01 == null || j11 == null) continue;

        connectBeam(j00, j10);
        connectBeam(j01, j11);
        connectBeam(j00, j01);
        connectBeam(j10, j11);
      }
    }
  }

  const stageBaseY = raiseBottom ? raiseY : baseY;
  const stageBaseGrid = raiseBottom ? raiseJointIndexGrid : jointIndexGrid;

  // ---- 6) 段設定から上方向にフレームを積み上げる（各段の「高さ＝ピッチ」として扱う） ----
  // JB / BEAM はセルの段Yを収集して生成する。POLE は共有柱を XZ 頂点単位で1回だけ繋ぐ。
  const stageData = globalThis.cellStageData;
  if (stageData && Array.isArray(stageData)) {
    const vertexKey = (xi, zi) => `${xi}|${zi}`;
    const parseVertexKey = (k) => {
      const [xs, zs] = String(k).split("|");
      return [parseInt(xs, 10), parseInt(zs, 10)];
    };
    const beamVKey = (a, b) => (a < b ? `${a}>${b}` : `${b}>${a}`);

    // yLevel -> Set(vertexKey)
    const verticesByY = new Map();
    // yLevel -> Set(beamVertexPairKey)
    const beamsByY = new Map();
    const yLevels = [];

    const addVertexAtY = (y, vKey) => {
      let set = verticesByY.get(y);
      if (!set) {
        set = new Set();
        verticesByY.set(y, set);
        yLevels.push(y);
      }
      set.add(vKey);
    };

    const addBeamAtY = (y, vA, vB) => {
      let set = beamsByY.get(y);
      if (!set) {
        set = new Set();
        beamsByY.set(y, set);
      }
      set.add(beamVKey(vA, vB));
    };

    // まず全セルから「必要なYレベル」と「そのYで必要な頂点/ビーム」を収集
    for (let zr = 0; zr < depthCount; zr++) {
      for (let xc = 0; xc < widthCount; xc++) {
        if (!enabledMatrix[zr]?.[xc]) continue;
        const info = stageData[zr]?.[xc];
        const pitchList = info?.heights;
        if (!Array.isArray(pitchList) || pitchList.length === 0) continue;

        const v00 = vertexKey(xc, zr);
        const v10 = vertexKey(xc + 1, zr);
        const v01 = vertexKey(xc, zr + 1);
        const v11 = vertexKey(xc + 1, zr + 1);

        let accumulatedY = stageBaseY;
        for (let i = 0; i < pitchList.length; i++) {
          accumulatedY += poleStagePitchMm(pitchList[i]);
          const y = accumulatedY;

          addVertexAtY(y, v00);
          addVertexAtY(y, v10);
          addVertexAtY(y, v01);
          addVertexAtY(y, v11);

          addBeamAtY(y, v00, v10);
          addBeamAtY(y, v01, v11);
          addBeamAtY(y, v00, v01);
          addBeamAtY(y, v10, v11);
        }
      }
    }

    // y昇順で処理（見た目/仕様には影響しないが、局所キャッシュが効く）
    yLevels.sort((a, b) => a - b);

    const getJointIndexAtVertexY = (vKey, y) => {
      const [xi, zi] = parseVertexKey(vKey);
      return getOrCreateJointAt({
        x: xPos[xi] + baseOffsetX,
        y,
        z: zPos[zi],
      });
    };

    // 1) 同一Yのジョイント生成をまとめる
    for (let yi = 0; yi < yLevels.length; yi++) {
      const y = yLevels[yi];
      const vSet = verticesByY.get(y);
      if (!vSet) continue;
      vSet.forEach((vKey) => {
        getJointIndexAtVertexY(vKey, y);
      });
    }

    // 2) 同一Yのビーム接続をまとめる
    for (let yi = 0; yi < yLevels.length; yi++) {
      const y = yLevels[yi];
      const eSet = beamsByY.get(y);
      if (!eSet) continue;
      eSet.forEach((pairKey) => {
        const [a, b] = String(pairKey).split(">");
        const ja = getJointIndexAtVertexY(a, y);
        const jb = getJointIndexAtVertexY(b, y);
        connectBeam(ja, jb);
      });
    }

    // 3) ポールは共有柱（XZ頂点）単位。包含関係は分割構成を採用済み。
    const poleCols = columnPolePlan.columns || [];
    for (let ci = 0; ci < poleCols.length; ci++) {
      const col = poleCols[ci];
      const baseJ = stageBaseGrid[col.zi]?.[col.xi];
      if (baseJ == null) continue;
      const vKey = vertexKey(col.xi, col.zi);
      const ys = col.ys || [];
      let prevJ = baseJ;
      for (let i = 1; i < ys.length; i++) {
        const nextJ = getJointIndexAtVertexY(vKey, ys[i]);
        connectPole(prevJ, nextJ);
        prevJ = nextJ;
      }
    }
  }

  // ---- 7) 何か1つ適当に選択状態にする ----
  let firstJointIndex = null;
  for (let zi = 0; zi <= depthCount && firstJointIndex == null; zi++) {
    for (let xi = 0; xi <= widthCount; xi++) {
      const idx = jointIndexGrid[zi][xi];
      if (idx != null) {
        firstJointIndex = idx;
        break;
      }
    }
  }

  // もし ON マスが1つも無かった場合は、原点に1個だけ作り直す
  if (firstJointIndex == null) {
    const idx = window.createJoint({ x: 0, y: 0, z: 0 });
    if (typeof window.addLegIfNeeded === "function") window.addLegIfNeeded(idx);
    firstJointIndex = idx;
  }

   if (typeof window.setSelectedJoint === "function") window.setSelectedJoint(firstJointIndex);

   window.__cubeRackHeightModel = (typeof window.getHeightModelVersion === "function")
     ? window.getHeightModelVersion()
     : "v31-h1";

   // ★ 自動レイアウト完了：見積もり抑制解除
   window.__buildingAutoLayout = false;

   // ★ 見積もりは「最後に1回だけ」確定実行
   if (typeof calcAndRenderEstimate === "function") {
     calcAndRenderEstimate();
   }

  // ★ クラスター再構築
   if (typeof rebuildJointClusters === "function") {
     rebuildJointClusters();
   }

   if (typeof saveHistory === "function") saveHistory();

   applySelectModeAfterAutolayout();
   return { ok: true };
}

// 外部（別ウィンドウ）からも呼べる 3D 自動レイアウト本体
function autoGenerateModulesFromConfig(cfg) {
  if (window.v3WorkLayers && typeof window.v3WorkLayers.hasProtectedRack === "function" && window.v3WorkLayers.hasProtectedRack()) {
    console.warn("[work-layers] refused autolayout");
    return;
  }
  const nx = Math.max(1, cfg.nx | 0 || 1);
  const nz = Math.max(1, cfg.nz | 0 || 1);
  const ny = Math.max(1, cfg.ny | 0 || 1);

  const lx = cfg.lx | 0 || 300;
  const lz = cfg.lz | 0 || 300;
  const ly = cfg.ly | 0 || 300;

  // 履歴に現在状態を保存
  if (typeof saveHistory === "function") saveHistory();

  // いったん全部クリア（clearAllDesign 内で棚板・壁板の j4 も破棄）
  if (typeof clearAllDesign === "function") clearAllDesign();

  // === グリッド座標を作る ===
  const xs = [0];
  for (let i = 0; i < nx; i++) {
    xs.push(xs[xs.length - 1] + lx);
  }

  const zs = [0];
  for (let i = 0; i < nz; i++) {
    zs.push(zs[zs.length - 1] + lz);
  }

  const ys = [0];
  for (let k = 0; k < ny; k++) {
    ys.push(ys[ys.length - 1] + ly);
  }

  // === ジョイント生成 ===
  const jointIndex = []; // jointIndex[x][y][z]

  for (let ix = 0; ix < xs.length; ix++) {
    jointIndex[ix] = [];
    for (let iy = 0; iy < ys.length; iy++) {
      jointIndex[ix][iy] = [];
      for (let iz = 0; iz < zs.length; iz++) {
        const pos = { x: xs[ix], y: ys[iy], z: zs[iz] };
        const idx = window.createJoint(pos);
        jointIndex[ix][iy][iz] = idx;

        // 床（y = 0）のジョイントには脚を付ける
        if (iy === 0) {
          if (typeof window.addLegIfNeeded === "function") window.addLegIfNeeded(idx);
        }
      }
    }
  }

  // === X方向ビーム（幅方向） ===
  for (let iy = 0; iy < ys.length; iy++) {
    for (let iz = 0; iz < zs.length; iz++) {
      for (let ix = 0; ix < xs.length - 1; ix++) {
        const a = jointIndex[ix][iy][iz];
        const b = jointIndex[ix + 1][iy][iz];
        window.addBeamConnection(a, b);
      }
    }
  }

  // === Z方向ビーム（奥行方向） ===
  for (let iy = 0; iy < ys.length; iy++) {
    for (let ix = 0; ix < xs.length; ix++) {
      for (let iz = 0; iz < zs.length - 1; iz++) {
        const a = jointIndex[ix][iy][iz];
        const b = jointIndex[ix][iy][iz + 1];
        window.addBeamConnection(a, b);
      }
    }
  }

  // === Y方向ポール（高さ方向） ===
  for (let ix = 0; ix < xs.length; ix++) {
    for (let iz = 0; iz < zs.length; iz++) {
      for (let iy = 0; iy < ys.length - 1; iy++) {
        const a = jointIndex[ix][iy][iz];
        const b = jointIndex[ix][iy + 1][iz];
        window.addPoleConnection(a, b);
      }
    }
  }

  // autoGenerateModulesFromConfig(cfg) の最後あたり
  if (typeof window.setSelectedJoint === "function") window.setSelectedJoint(jointIndex[0][0][0]);
  if (!window.__buildingAutoLayout) {
  if (typeof window.requestEstimateRender === "function") window.requestEstimateRender("after autolayout");
}

  // ★ クラスター再構築
  rebuildJointClusters();
  applySelectModeAfterAutolayout();
}

// joints / beams / poles から「ラックの島」を再計算する
function rebuildJointClusters() {
  jointClusters = [];
  jointClusterId = new Array(joints.length).fill(-1);

  // joints が存在しない・0個なら何もしない
  if (!Array.isArray(joints) || joints.length === 0) return;

  // ---- 1) ジョイント同士の隣接リストを作る（ビーム + ポール経由） ----
  const adj = Array.from({ length: joints.length }, () => []);

  // ビームでつながっているところを隣接として登録
  if (Array.isArray(beams)) {
    beams.forEach((b) => {
      if (!b) return;
      const a = b.a;
      const c = b.b;
      if (typeof a !== "number" || typeof c !== "number") return;
      if (!joints[a] || !joints[c]) return;
      adj[a].push(c);
      adj[c].push(a);
    });
  }

  // ポールも同様に
  if (Array.isArray(poles)) {
    poles.forEach((p) => {
      if (!p) return;
      const a = p.a;
      const c = p.b;
      if (typeof a !== "number" || typeof c !== "number") return;
      if (!joints[a] || !joints[c]) return;
      adj[a].push(c);
      adj[c].push(a);
    });
  }

  // ---- 2) BFS / DFS で「島」（= ラック）ごとに分割 ----
  let clusterIndex = 0;

  for (let i = 0; i < joints.length; i++) {
    // 無効ジョイント or すでにどこかのクラスターに所属しているならスキップ
    if (!joints[i]) continue;
    if (jointClusterId[i] !== -1) continue;

    const queue = [i];
    let qHead = 0;
    jointClusterId[i] = clusterIndex;

    const clusterJointIndices = [];

    while (qHead < queue.length) {
      const jIdx = queue[qHead++];
      clusterJointIndices.push(jIdx);

      const neighbors = adj[jIdx] || [];
      for (let ni = 0; ni < neighbors.length; ni++) {
        const nb = neighbors[ni];
        if (jointClusterId[nb] === -1) {
          jointClusterId[nb] = clusterIndex;
          queue.push(nb);
        }
      }
    }

    jointClusters.push({
      joints: clusterJointIndices,
      beams: [],
      poles: [],
    });

    clusterIndex++;
  }

  // ---- 3) ビーム/ポールを 1 回走査でクラスターに振り分け ----
  if (Array.isArray(beams)) {
    beams.forEach((b, bi) => {
      if (!b) return;
      const a = b.a;
      const c = b.b;
      if (typeof a !== "number" || typeof c !== "number") return;
      const cidA = jointClusterId[a];
      const cidC = jointClusterId[c];
      if (cidA >= 0 && cidA === cidC) {
        jointClusters[cidA]?.beams.push(bi);
      }
    });
  }

  if (Array.isArray(poles)) {
    poles.forEach((p, pi) => {
      if (!p) return;
      const a = p.a;
      const c = p.b;
      if (typeof a !== "number" || typeof c !== "number") return;
      const cidA = jointClusterId[a];
      const cidC = jointClusterId[c];
      if (cidA >= 0 && cidA === cidC) {
        jointClusters[cidA]?.poles.push(pi);
      }
    });
  }
}

// ラック（島）ID を取得（Length Edit 等で流用）
function getClusterIdFromJointIndex(jIdx) {
  if (!Array.isArray(jointClusterId)) return -1;
  if (typeof jIdx !== "number" || jIdx < 0 || jIdx >= jointClusterId.length) return -1;
  const cid = jointClusterId[jIdx];
  return (typeof cid === "number") ? cid : -1;
}

function getClusterIdFromConnector(conn) {
  // conn: { type:"beam"|"pole", index:n }
  if (!conn || typeof conn.index !== "number") return -1;

  if (conn.type === "pole") {
    const p = poles?.[conn.index];
    if (!p) return -1;
    return getClusterIdFromJointIndex(p.a); // a/b は同一島のはず
  }
  if (conn.type === "beam") {
    const b = beams?.[conn.index];
    if (!b) return -1;
    return getClusterIdFromJointIndex(b.a);
  }
  return -1;
}

function isSameClusterByConnector(conn, cid) {
  if (cid < 0) return true; // cid が取れないときはフィルタしない（安全側）
  if (!conn) return false;

  if (conn.type === "pole") {
    const p = poles?.[conn.index];
    if (!p) return false;
    return getClusterIdFromJointIndex(p.a) === cid || getClusterIdFromJointIndex(p.b) === cid;
  }
  if (conn.type === "beam") {
    const b = beams?.[conn.index];
    if (!b) return false;
    return getClusterIdFromJointIndex(b.a) === cid ||
 getClusterIdFromJointIndex(b.b) === cid;
  }
  return false;
}

// 自動レイアウトツールからの受け取り共通ハンドラ（唯一の正本）
window.handleAutoLayoutFromTool = function (cfg) {
  if (!cfg) return;

  const mode = cfg.mode === "append" ? "append" : "replace";

  try {
    buildAutoLayoutFromMatrix(cfg, mode);
  } catch (e) {
    console.error("[handleAutoLayoutFromTool] error", e, cfg);
  }
};

// 旧方式（直接呼び出し）用フック
window.onFlatLayoutMaskFromTool = window.handleAutoLayoutFromTool;

// postMessage 受信（自動レイアウト）— 1本化版
window.addEventListener("message", (event) => {
  const d = event.data;
  if (!d) return;

  // --- 新形式: { type: "cuberack-auto-layout", payload: cfg }
  if (d.type === "cuberack-auto-layout") {
  if (typeof window.handleAutoLayoutFromTool === "function") {
    window.handleAutoLayoutFromTool(d.payload);
  } else {
    console.warn("[message] window.handleAutoLayoutFromTool is not defined");
  }
  return;
}

  // --- 旧形式: { source: "cuberack-auto-layout", mode: "3d"|"plane"|"flat", config: {...} }
  if (d.source === "cuberack-auto-layout") {
    // 旧3D
    if (d.mode === "3d" && d.config) {
      if (typeof autoGenerateModulesFromConfig === "function") {
        autoGenerateModulesFromConfig(d.config);
      } else {
        console.warn("[message] autoGenerateModulesFromConfig is not defined");
      }
      return;
    }

    // 旧plane/flat
    if ((d.mode === "plane" || d.mode === "flat") && d.config) {
      if (typeof buildAutoLayoutFromMatrix === "function") {
        buildAutoLayoutFromMatrix(
          d.config,
          d.config.mode === "append" ? "append" : "replace"
        );
      } else {
        console.warn("[message] buildAutoLayoutFromMatrix is not defined");
      }
      return;
    }
  }
});

// 旧UI用の自動レイアウト
function autoGenerateModules() {
  // 旧UIブロック自体が存在しない構成でも落ちないようにする
  if (typeof hasAutoLayoutLegacyUI === "undefined") {
    console.warn("[AutoLayoutLegacyUI] hasAutoLayoutLegacyUI is undefined -> skipped");
    return;
  }
  if (typeof autoWidthLenSelect === "undefined") {
    console.warn("[AutoLayoutLegacyUI] length selects are undefined -> skipped");
    return;
  }

  if (!hasAutoLayoutLegacyUI) {
    console.warn("[AutoLayoutLegacyUI] not found -> autoGenerateModules skipped");
    return;
  }

  const autoWidthCountEl  = document.getElementById("auto-width-count");
  const autoDepthCountEl  = document.getElementById("auto-depth-count");
  const autoHeightCountEl = document.getElementById("auto-height-count");

  if (!autoWidthCountEl || !autoDepthCountEl || !autoHeightCountEl) {
    alert("自動レイアウトUI（count入力）が見つかりません。HTMLのIDを確認してください。");
    return;
  }

  const cfg = {
    nx: parseInt(autoWidthCountEl.value, 10) || 1,
    nz: parseInt(autoDepthCountEl.value, 10) || 1,
    ny: parseInt(autoHeightCountEl.value, 10) || 1,
    lx: parseInt(autoWidthLenSelect.value, 10) || 300,
    lz: parseInt(autoDepthLenSelect.value, 10) || 300,
    ly: parseInt(autoHeightLenSelect.value, 10) || 300,
  };

  autoGenerateModulesFromConfig(cfg);
}

// 自動レイアウトツールボタンの初期化
function initAutoLayoutToolButton() {
  let autoLayoutWindow = null;

  const btn = document.getElementById("open-auto-layout-tool");
  if (!btn) {
    console.warn("[AutoLayout] #open-auto-layout-tool が見つかりません");
    return;
  }

  // 二重登録防止（同じボタンに何回も addEventListener しない）
  if (btn.__autoLayoutBound) return;
  btn.__autoLayoutBound = true;

  btn.addEventListener("click", () => {
    if (window.v3AutoLayoutPanel && typeof window.v3AutoLayoutPanel.open === "function") {
      window.v3AutoLayoutPanel.open();
      return;
    }

    if (autoLayoutWindow && !autoLayoutWindow.closed) {
      autoLayoutWindow.focus();
      return;
    }

    autoLayoutWindow = window.open(
      "./auto-layout.html",
      "cuberackPlaneLayoutTool",
      "width=900,height=700"
    );

    if (!autoLayoutWindow) {
      alert("ポップアップがブロックされています。このサイトのポップアップを許可してください。");
    }
  });
}

// グローバルに公開
window.RAISE_BOTTOM_POLE_MM = RAISE_BOTTOM_POLE_MM;
window.RAISE_BOTTOM_POLE_OPTIONS = RAISE_BOTTOM_POLE_OPTIONS;
window.SHARED_COLUMN_Y_EPS = SHARED_COLUMN_Y_EPS;
window.resolveRaiseBottomOptions = resolveRaiseBottomOptions;
window.ySetContains = ySetContains;
window.cellStageYLevels = cellStageYLevels;
window.planSharedColumnPoles = planSharedColumnPoles;
window.resolveSharedColumnYs = resolveSharedColumnYs;
window.getAlignedJointIndices = getAlignedJointIndices;
window.shiftClusterJointsOnSide = shiftClusterJointsOnSide;
window.buildAutoLayoutFromMatrix = buildAutoLayoutFromMatrix;
window.autoGenerateModulesFromConfig = autoGenerateModulesFromConfig;
window.rebuildJointClusters = rebuildJointClusters;
window.getClusterIdFromJointIndex = getClusterIdFromJointIndex;
window.getClusterIdFromConnector = getClusterIdFromConnector;
window.isSameClusterByConnector = isSameClusterByConnector;
window.autoGenerateModules = autoGenerateModules;
window.initAutoLayoutToolButton = initAutoLayoutToolButton;
