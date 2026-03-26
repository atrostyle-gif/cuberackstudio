// =========================================================
// 自動レイアウト機能
// =========================================================

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

// 指定のマトリクス設定からラックを自動生成（多段対応版）
function buildAutoLayoutFromMatrix(cfg, mode = "replace") {
  if (!cfg) return;

  // ★ 自動レイアウト開始：見積もり抑制ON
  window.__buildingAutoLayout = true;

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

    // ---- 0) 段データをグローバルに保持（あとで使えるように） ----
  // cellStageData が未宣言でも保持できるよう、globalThis を正本にする
  // ※ ここで enabledMatrix と同じサイズに正規化しておく（参照ズレ防止）
  {
    const depth = enabledMatrix.length;                 // = depthCount
    const width = (enabledMatrix[0] || []).length;      // = widthCount

    const makeDefaultCell = () => ({ stages: 1, heights: [300] });

    const normalizeStageMatrix = (src) => {
      const out = Array.from({ length: depth }, (_, z) =>
        Array.from({ length: width }, (_, x) => {
          // OFF マスは必ず null
          const isOn = !!enabledMatrix[z]?.[x];
          if (!isOn) return null;

          const cell = src?.[z]?.[x];
          if (!cell || !Array.isArray(cell.heights)) return makeDefaultCell();

          // heights を数値化・正の値のみ採用（順番は維持）
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
      return out;
    };

    if (Array.isArray(stageMatrix)) {
      // 平面ツールから stageMatrix が来た場合：deep copy + 正規化
      globalThis.cellStageData = normalizeStageMatrix(stageMatrix);
    } else {
      // 互換用：stageMatrix が無い場合は ON マスだけ 1段 300mm で初期化
      globalThis.cellStageData = normalizeStageMatrix(null);
    }

    // 以降の処理は cellStageData ローカル参照で読む（正本は globalThis）
    var cellStageData = globalThis.cellStageData;
  }

  // ---- 1) 既存シーンをクリア（置き換えモードのときだけ） ----
  if (mode === "replace") {
    if (typeof saveHistory === "function") saveHistory();

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

  // ---- 2) グリッド座標を計算（X/Z） ----
  const xPos = [0];
  widthLens.forEach((len) => {
    xPos.push(xPos[xPos.length - 1] + len);
  });

  const zPos = [0];
  depthLens.forEach((len) => {
    zPos.push(zPos[zPos.length - 1] + len);
  });

  const baseY = 0;

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

  // ---- 5) 床レベルのマスごとにビームを張る（ONマスだけ） ----
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

  // ---- 6) 段設定から上方向にフレームを積み上げる（各段の「高さ＝ピッチ」として扱う） ----
  // 仕様維持のため「ポールの繋ぎ方（prev→next）」はセル単位で従来どおり。
  // 最適化として、同一Yレベルのジョイント生成/ビーム接続をまとめて処理する。
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

        let accumulatedY = baseY; // 0
        for (let i = 0; i < pitchList.length; i++) {
          accumulatedY += pitchList[i];
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

    // 3) ポールはセル単位で従来どおり（ただしジョイント生成は再利用）
    for (let zr = 0; zr < depthCount; zr++) {
      for (let xc = 0; xc < widthCount; xc++) {
        if (!enabledMatrix[zr]?.[xc]) continue;

        const info = stageData[zr]?.[xc];
        const pitchList = info?.heights;
        if (!Array.isArray(pitchList) || pitchList.length === 0) continue;

        // 床の4隅（ポールを立てる起点）
        const baseJ00 = jointIndexGrid[zr][xc];
        const baseJ10 = jointIndexGrid[zr][xc + 1];
        const baseJ01 = jointIndexGrid[zr + 1][xc];
        const baseJ11 = jointIndexGrid[zr + 1][xc + 1];
        if (
          baseJ00 == null ||
          baseJ10 == null ||
          baseJ01 == null ||
          baseJ11 == null
        ) {
          continue;
        }

        const v00 = vertexKey(xc, zr);
        const v10 = vertexKey(xc + 1, zr);
        const v01 = vertexKey(xc, zr + 1);
        const v11 = vertexKey(xc + 1, zr + 1);

        let accumulatedY = baseY; // 0
        let prevJ00 = baseJ00;
        let prevJ10 = baseJ10;
        let prevJ01 = baseJ01;
        let prevJ11 = baseJ11;

        for (let i = 0; i < pitchList.length; i++) {
          accumulatedY += pitchList[i];
          const y = accumulatedY;

          const j00 = getJointIndexAtVertexY(v00, y);
          const j10 = getJointIndexAtVertexY(v10, y);
          const j01 = getJointIndexAtVertexY(v01, y);
          const j11 = getJointIndexAtVertexY(v11, y);

          connectPole(prevJ00, j00);
          connectPole(prevJ10, j10);
          connectPole(prevJ01, j01);
          connectPole(prevJ11, j11);

          prevJ00 = j00;
          prevJ10 = j10;
          prevJ01 = j01;
          prevJ11 = j11;
        }
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
}

// 外部（別ウィンドウ）からも呼べる 3D 自動レイアウト本体
function autoGenerateModulesFromConfig(cfg) {
  const nx = Math.max(1, cfg.nx | 0 || 1);
  const nz = Math.max(1, cfg.nz | 0 || 1);
  const ny = Math.max(1, cfg.ny | 0 || 1);

  const lx = cfg.lx | 0 || 300;
  const lz = cfg.lz | 0 || 300;
  const ly = cfg.ly | 0 || 300;

  // 履歴に現在状態を保存
  if (typeof saveHistory === "function") saveHistory();

  // いったん全部クリア
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
