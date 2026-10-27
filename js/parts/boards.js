// =========================================================
// Boards（棚板 / 壁板） V1.1.1 最小実装
// - 4つのジョイントを選択して棚板/壁板を生成
// - BoxGeometry で表示
// =========================================================

(function initBoardsModule() {
  function getBoardMaterial(materialKey) {
    const m = materialKey || "足場板";

    // 新しい材質名に対応した色マッピング
    const materialColors = {
      "足場板": 0xD4A574,    // 薄い茶色
      "ウォールナット": 0x5C4033,  // 濃い茶色
      "オーク": 0xDEB887,    // ベージュ
      "チェリー": 0xB87333,  // 赤みがかった茶色
    };

    const color = materialColors[m] || materialColors["足場板"];

    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.0, // 木は金属ではない
    });
  }

  // beam/poleの長さを取得
  // 座標から計算した長さを優先（beamの長さ変更に追従するため）
  function getConnectorLength(aIdx, bIdx, isPole = false) {
    const a = window.joints?.[aIdx];
    const b = window.joints?.[bIdx];
    if (!a || !b) return 0;
    
    // 常に座標から計算（beamの長さ変更に確実に追従するため）
    if (typeof window.actualJointDistanceMm === "function") return window.actualJointDistanceMm(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.hypot(dx, dy, dz);
  }

  function computeBoundsFromJoints(j4, isPanel = false) {
    const pts = j4.map(i => window.joints?.[i]).filter(Boolean);
    if (pts.length !== 4) return null;

    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;

    pts.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    });

    // BEAM/POLEの内側に板をはめる
    // beam/poleの半径（4mm）+ 余裕（2mm）= 6mmを各方向から引く
    // ジョイントボールの半径（9.225mm）も考慮する必要があるが、
    // 実際にはbeam/poleの内側に入れるため、beam/poleの半径を基準にする
    const beamRadius = 4; // beam/poleの半径（CylinderGeometryの半径）
    const inset = beamRadius + 2; // 合計6mm（beam/poleの内側に2mm余裕）

    // 4つのジョイントを囲むbeam/poleの長さから板のサイズを決定
    // 順序: [j0, j1, j2, j3] で、j0-j1, j1-j2, j2-j3, j3-j0 が接続
    let widthMm = 0, depthMm = 0, heightMm = 0;
    
    if (isPanel) {
      // 壁板：平面を自動判定して、適切なサイズを計算
      // 4つのジョイントのX座標とZ座標の変化量を確認
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
      
      edges.forEach(([aIdx, bIdx]) => {
        const a = window.joints?.[aIdx];
        const b = window.joints?.[bIdx];
        if (!a || !b) return;
        
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const dz = Math.abs(b.z - a.z);
        
        // 壁板の平面を判定（判定を逆にした）
        if (xRange < tolerance && zRange >= tolerance) {
          // X方向の壁（幅方向）：Z方向のbeamが幅、Y方向のpoleが高さ
          if (dz > dx && dy < 1) {
            const len = getConnectorLength(aIdx, bIdx, false);
            if (len > widthMm) widthMm = len;
          }
          if (dy > dx && dy > dz) {
            const len = getConnectorLength(aIdx, bIdx, true);
            if (len > heightMm) heightMm = len;
          }
        } else if (zRange < tolerance && xRange >= tolerance) {
          // Z方向の壁（奥行方向）：X方向のbeamが幅、Y方向のpoleが高さ
          if (dx > dz && dy < 1) {
            const len = getConnectorLength(aIdx, bIdx, false);
            if (len > widthMm) widthMm = len;
          }
          if (dy > dx && dy > dz) {
            const len = getConnectorLength(aIdx, bIdx, true);
            if (len > heightMm) heightMm = len;
          }
        } else {
          // デフォルト（Z方向の壁として扱う）
          if (dx > dz && dy < 1) {
            const len = getConnectorLength(aIdx, bIdx, false);
            if (len > widthMm) widthMm = len;
          }
          if (dy > dx && dy > dz) {
            const len = getConnectorLength(aIdx, bIdx, true);
            if (len > heightMm) heightMm = len;
          }
        }
      });
    } else {
      // 棚板：X方向のbeamの長さが幅、Z方向のbeamの長さが奥行き
      // 4つの辺をチェックして、X方向とZ方向のbeamを特定
      const edges = [
        [j4[0], j4[1]],
        [j4[1], j4[2]],
        [j4[2], j4[3]],
        [j4[3], j4[0]]
      ];
      
      edges.forEach(([aIdx, bIdx]) => {
        const a = window.joints?.[aIdx];
        const b = window.joints?.[bIdx];
        if (!a || !b) return;
        
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const dz = Math.abs(b.z - a.z);
        
        // X方向のbeam（幅）
        if (dx > dz && dy < 1) {
          const len = getConnectorLength(aIdx, bIdx, false);
          if (len > widthMm) widthMm = len;
        }
        // Z方向のbeam（奥行き）
        if (dz > dx && dy < 1) {
          const len = getConnectorLength(aIdx, bIdx, false);
          if (len > depthMm) depthMm = len;
        }
      });
    }

    // beamの長さから板のサイズを決定（内側にはまるように、beam/poleの半径 + 余裕を引く）
    // beam/poleの半径（4mm）+ 余裕（2mm）= 6mmを両側から引く
    const boardInset = 6; // 内側にはまるように、より大きな値を使用
    
    if (isPanel) {
      // 壁板の場合、widthMmは幅方向の長さ、depthMmは奥行方向の長さを保持
      // 平面の判定に応じて、適切な値を使用
      const xRange = maxX - minX;
      const zRange = maxZ - minZ;
      const tolerance = 5;
      
      let depthMm = 0;
      if (xRange < tolerance && zRange >= tolerance) {
        // Z方向の壁（奥行方向）：widthMmはX方向、depthMmは不要（Z方向に薄い）
        depthMm = 0;
      } else if (zRange < tolerance && xRange >= tolerance) {
        // X方向の壁（幅方向）：widthMmはZ方向、depthMmは不要（X方向に薄い）
        depthMm = 0;
      }
      
      return {
        minX: minX + inset,
        minY: minY + inset,
        minZ: minZ + inset,
        maxX: maxX - inset,
        maxY: maxY - inset,
        maxZ: maxZ - inset,
        pts,
        widthMm: Math.max(1, widthMm - boardInset * 2),
        heightMm: Math.max(1, heightMm - boardInset * 2),
        depthMm: depthMm > 0 ? Math.max(1, depthMm - boardInset * 2) : 0,
      };
    } else {
      return {
        minX: minX + inset,
        minY: minY + inset,
        minZ: minZ + inset,
        maxX: maxX - inset,
        maxY: maxY - inset,
        maxZ: maxZ - inset,
        pts,
        widthMm: Math.max(1, widthMm - boardInset * 2),
        depthMm: Math.max(1, depthMm - boardInset * 2),
      };
    }
  }

  function vector3FromJoint(j) {
    return new THREE.Vector3(j.x, j.y, j.z);
  }

  function quadFrameFromJoints(j4) {
    const pts = (j4 || []).map((i) => window.joints?.[i]).filter(Boolean);
    if (pts.length !== 4) return null;
    const p = pts.map(vector3FromJoint);
    const center = new THREE.Vector3();
    p.forEach((v) => center.add(v));
    center.multiplyScalar(0.25);

    const edges = [
      p[1].clone().sub(p[0]),
      p[2].clone().sub(p[1]),
      p[3].clone().sub(p[2]),
      p[0].clone().sub(p[3]),
    ];
    const u = edges[0].clone();
    edges.forEach((e) => {
      if (e.lengthSq() > u.lengthSq()) u.copy(e);
    });
    if (u.lengthSq() < 1e-8) return null;
    u.normalize();

    let vEdge = edges[0].clone();
    let best = -1;
    edges.forEach((e) => {
      const cross = new THREE.Vector3().crossVectors(u, e).length();
      if (cross > best) {
        best = cross;
        vEdge.copy(e);
      }
    });
    if (best < 1e-6) return null;
    const n = new THREE.Vector3().crossVectors(u, vEdge).normalize();
    if (n.lengthSq() < 0.5) return null;
    const v = new THREE.Vector3().crossVectors(n, u).normalize();

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    p.forEach((pt) => {
      const d = pt.clone().sub(center);
      const du = d.dot(u);
      const dv = d.dot(v);
      minU = Math.min(minU, du); maxU = Math.max(maxU, du);
      minV = Math.min(minV, dv); maxV = Math.max(maxV, dv);
    });
    return { center, u, v, n, width: maxU - minU, depth: maxV - minV };
  }

  function cellKeyFromJoints(j4) {
    const b = computeBoundsFromJoints(j4, false);
    if (!b) return "";
    const round = (val) => Math.round(val * 2) / 2;
    return `${round(b.minY)}|${round(b.minZ)}|${round(b.minX)}`;
  }

  function sameJ4Set(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 4 || b.length !== 4) return false;
    const sa = a.slice().map(Number).sort((x, y) => x - y).join(",");
    const sb = b.slice().map(Number).sort((x, y) => x - y).join(",");
    return sa === sb;
  }

  function disposeMesh(mesh, allowPreview) {
    if (!mesh) return;
    if (!allowPreview && mesh === previewBoardMesh) return;
    if (mesh.children && mesh.children.length) {
      mesh.children.slice().forEach((child) => {
        try {
          if (child.geometry && child.geometry !== mesh.geometry) child.geometry.dispose();
        } catch (e) {}
        try {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { try { m && m.dispose && m.dispose(); } catch (e2) {} });
        } catch (e) {}
      });
    }
    try { mesh.geometry?.dispose?.(); } catch(e){}
    try {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => { try { m?.dispose?.(); } catch (e2) {} });
    } catch(e){}
    try { mesh.parent?.remove?.(mesh); } catch(e){}
  }

  // 削除前インデックス → 削除後インデックス。削除された番号は -1。
  // 1点でも削除対象なら板を破棄し、残る板は j4 の順序を保って付け替える。
  function remapBoardsForJointIndexMap(indexMap) {
    function remapList(list, indexKey) {
      if (!list) return 0;
      const kept = [];
      let dropped = 0;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const j4 = item && Array.isArray(item.j4) ? item.j4 : null;
        let dead = !j4 || j4.length !== 4;
        const next = [];
        if (!dead) {
          for (let k = 0; k < 4; k++) {
            const old = j4[k];
            const mapped = (typeof old === "number" && old >= 0 && old < indexMap.length) ? indexMap[old] : -1;
            if (typeof mapped !== "number" || mapped < 0) {
              dead = true;
              break;
            }
            next.push(mapped);
          }
        }
        if (dead) {
          if (item && item.mesh) disposeMesh(item.mesh, true);
          if (item) item.mesh = null;
          dropped++;
          continue;
        }
        item.j4 = next;
        if (item.mesh && item.mesh.userData) item.mesh.userData[indexKey] = kept.length;
        kept.push(item);
      }
      list.length = 0;
      for (let i = 0; i < kept.length; i++) list.push(kept[i]);
      return dropped;
    }

    if (!indexMap || !indexMap.length) return { droppedShelves: 0, droppedPanels: 0 };
    return {
      droppedShelves: remapList(window.shelves, "shelfIndex"),
      droppedPanels: remapList(window.panels, "panelIndex"),
    };
  }
  window.remapBoardsForJointIndexMap = remapBoardsForJointIndexMap;

  function jointSetFrom(jointIndices) {
    if (!jointIndices) return null;
    return jointIndices instanceof Set ? jointIndices : new Set(jointIndices);
  }

  function boardTouches(item, indexSet) {
    if (!indexSet) return true;
    if (!item || !Array.isArray(item.j4)) return false;
    return item.j4.some((idx) => indexSet.has(idx));
  }

  function isWorldAlignedNormal(n, axis) {
    if (!n) return false;
    const v = axis === "x" ? Math.abs(n.x) : axis === "z" ? Math.abs(n.z) : Math.abs(n.y);
    return v > 0.92;
  }

  // -----------------------------
  // 再構築
  // -----------------------------
  function rebuildShelves(jointIndices) {
    const indexSet = jointSetFrom(jointIndices);
    const shelves = window.shelves || [];
    shelves.forEach(s => {
      if (!boardTouches(s, indexSet)) return;
      disposeMesh(s.mesh);
    });

    shelves.forEach(s => {
      if (!boardTouches(s, indexSet)) return;
      const frame = quadFrameFromJoints(s.j4);
      const b = computeBoundsFromJoints(s.j4, false);
      if (!frame && !b) return;

      const thickness = Math.max(1, Number(s.thicknessMm || 6));
      const inset = 12;
      const mat = getBoardMaterial(s.material || "足場板");
      const mesh = new THREE.Mesh(undefined, mat);

      // 水平・ワールド軸に乗る棚板はAABBのまま置く。
      // 回転フレームに AABB の width/depth を載せると軸が入れ替わり、隣区画にはみ出す。
      if (frame && !isWorldAlignedNormal(frame.n, "y")) {
        if (frame.n.y < 0) {
          frame.n.negate();
          frame.v.negate();
        }
        const w = Math.max(1, frame.width - inset);
        const d = Math.max(1, frame.depth - inset);
        mesh.geometry = new THREE.BoxGeometry(w, thickness, d);
        mesh.position.copy(frame.center);
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.u, frame.n, frame.v));
      } else if (b) {
        const w = b.widthMm || Math.max(1, b.maxX - b.minX);
        const d = b.depthMm || Math.max(1, b.maxZ - b.minZ);
        mesh.geometry = new THREE.BoxGeometry(w, thickness, d);
        mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
        mesh.quaternion.identity();
      } else {
        return;
      }

      mesh.userData = { type: "shelf", shelfIndex: shelves.indexOf(s) };
      if (window.rackGroup) window.rackGroup.add(mesh);
      s.mesh = mesh;
      s.cellKey = cellKeyFromJoints(s.j4);
    });
  }
  window.rebuildShelves = rebuildShelves;

  // 4つのジョイントから壁板の平面（side）を自動判定
  function detectPanelSide(j4) {
    const pts = j4.map(i => window.joints?.[i]).filter(Boolean);
    if (pts.length !== 4) return "back"; // デフォルト

    // X座標とZ座標の変化量を計算
    const xCoords = pts.map(p => p.x);
    const zCoords = pts.map(p => p.z);
    const xRange = Math.max(...xCoords) - Math.min(...xCoords);
    const zRange = Math.max(...zCoords) - Math.min(...zCoords);

    // 判定を逆にする
    // X方向の変化が小さい → X方向の壁（幅方向）- "side"（X一定）
    // Z方向の変化が小さい → Z方向の壁（奥行方向）- "back"（Z一定）
    const tolerance = 5; // 5mm以下の変化は「同じ平面」とみなす
    
    if (xRange < tolerance && zRange >= tolerance) {
      // X座標がほぼ同じ → X方向の壁（幅方向）
      return "side";
    } else if (zRange < tolerance && xRange >= tolerance) {
      // Z座標がほぼ同じ → Z方向の壁（奥行方向）
      return "back";
    } else {
      // デフォルト
      return "back";
    }
  }

  function rebuildPanels(jointIndices) {
    const indexSet = jointSetFrom(jointIndices);
    const panels = window.panels || [];
    panels.forEach(p => {
      if (!boardTouches(p, indexSet)) return;
      disposeMesh(p.mesh);
    });

    panels.forEach(p => {
      if (!boardTouches(p, indexSet)) return;
      const b = computeBoundsFromJoints(p.j4, true);
      if (!b) return;

      const thickness = Math.max(1, Number(p.thicknessMm || 6));
      const h = b.heightMm || Math.max(1, b.maxY - b.minY);
      const side = detectPanelSide(p.j4);
      p.side = side;

      const mat = getBoardMaterial(p.material || "足場板");
      const mesh = new THREE.Mesh(undefined, mat);
      const frame = quadFrameFromJoints(p.j4);
      const centerX = (b.minX + b.maxX) / 2;
      const centerY = (b.minY + b.maxY) / 2;
      const centerZ = (b.minZ + b.maxZ) / 2;

      const alignedWall = frame && (isWorldAlignedNormal(frame.n, "x") || isWorldAlignedNormal(frame.n, "z"));
      if (frame && !alignedWall) {
        const worldY = new THREE.Vector3(0, 1, 0);
        const up = Math.abs(frame.u.dot(worldY)) >= Math.abs(frame.v.dot(worldY))
          ? frame.u.clone()
          : frame.v.clone();
        if (up.y < 0) up.negate();
        const across = new THREE.Vector3().crossVectors(up, frame.n).normalize();
        const n = new THREE.Vector3().crossVectors(across, up).normalize();
        const w = Math.max(1, frame.width - 12);
        const hh = Math.max(1, frame.depth - 12);
        mesh.geometry = new THREE.BoxGeometry(w, hh, thickness);
        mesh.position.copy(frame.center);
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up, n));
      } else if (side === "back") {
        const w = b.widthMm || Math.max(1, b.maxX - b.minX);
        mesh.geometry = new THREE.BoxGeometry(w, h, thickness);
        mesh.position.set(centerX, centerY, centerZ);
        mesh.quaternion.identity();
      } else if (side === "side") {
        const w = b.widthMm || Math.max(1, b.maxZ - b.minZ);
        if (w < 1 || h < 1) {
          console.warn("[rebuildPanels] Invalid panel size:", { w, h, side, b });
          return;
        }
        mesh.geometry = new THREE.BoxGeometry(thickness, h, w);
        mesh.position.set(centerX, centerY, centerZ);
        mesh.quaternion.identity();
      } else {
        console.warn("[rebuildPanels] Unknown side:", side);
        return;
      }

      mesh.userData = { type: "panel", panelIndex: panels.indexOf(p) };
      if (window.rackGroup) window.rackGroup.add(mesh);
      p.mesh = mesh;
    });
  }
  window.rebuildPanels = rebuildPanels;

  function rebuildBoards(jointIndices) {
    rebuildShelves(jointIndices);
    rebuildPanels(jointIndices);
  }
  window.rebuildBoards = rebuildBoards;

  window.deleteBoard = function (kind, index) {
    const list = (kind === "shelf" || kind === "shelves") ? window.shelves : window.panels;
    if (!list || typeof index !== "number" || index < 0 || index >= list.length) return false;
    const item = list[index];
    const guardKind = (kind === "shelf" || kind === "shelves") ? "shelf" : "panel";
    if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditItem === "function" && !window.v3WorkLayers.canEditItem(guardKind, index)) {
      console.warn("[work-layers] refused board delete");
      return false;
    }
    if (item && item.mesh) disposeMesh(item.mesh, true);
    list.splice(index, 1);
    rebuildBoards();
    try { window.v3StructuralAnalysis?.schedule?.("board delete"); } catch (e) {}
    return true;
  };
  
  // 外部からも使用できるように公開
  window.computeBoardBoundsFromJoints = computeBoundsFromJoints;

  // -----------------------------
  // 追加API（UI/マウスから呼ぶ）
  // -----------------------------
  window.addShelfByJoints4 = function(j4, opts = {}) {
    if (!Array.isArray(j4) || j4.length !== 4) return;
    if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditIndexes === "function" && !window.v3WorkLayers.canEditIndexes(j4)) {
      console.warn("[work-layers] refused shelf add");
      return;
    }
    if ((window.shelves || []).some((s) => sameJ4Set(s.j4, j4))) return;

    // cellKeyを生成（隣接判定用）
    const b = computeBoundsFromJoints(j4, false);
    let cellKey = "";
    if (b) {
      // 誤差吸収のため0.5mm単位で丸める
      const round = (v) => Math.round(v * 2) / 2;
      const minY = round(b.minY);
      const minZ = round(b.minZ);
      const minX = round(b.minX);
      cellKey = `${minY}|${minZ}|${minX}`;
    }
    
    window.shelves.push({
      // Shelf identity is optional for old files and only used by the Phase 5 analysis settings.
      id: typeof window.__v3IdGenerator === "function" ? window.__v3IdGenerator("shelf") : "shelf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      j4: [...j4],
      thicknessMm: Number(opts.thicknessMm || 6),
      material: opts.material || "足場板",
      mesh: null,
      cellKey: cellKey, // 隣接判定用
    });
    rebuildShelves();
    window.requestEstimateRender?.("add shelf");
    try { window.v3StructuralAnalysis?.schedule?.("shelf add"); } catch (e) {}
  };

  window.addPanelByJoints4 = function(j4, opts = {}) {
    if (!Array.isArray(j4) || j4.length !== 4) return;
    if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditIndexes === "function" && !window.v3WorkLayers.canEditIndexes(j4)) {
      console.warn("[work-layers] refused panel add");
      return;
    }
    if ((window.panels || []).some((p) => sameJ4Set(p.j4, j4))) return;

    // sideが指定されていない場合は自動判定
    let side = opts.side;
    if (!side || side === "auto") {
      side = detectPanelSide(j4);
    }
    
    window.panels.push({
      j4: [...j4],
      thicknessMm: Number(opts.thicknessMm || 6),
      material: opts.material || "足場板",
      side: side,
      mesh: null,
    });
    rebuildPanels();
    window.requestEstimateRender?.("add panel");
  };

  // モード切替（UIが呼ぶ）
  window.setBoardMode = function(on) {
    window.isBoardModeOn = !!on;
    if (!on) {
      hideBoardPreview();
    } else {
      // モードON時は既存のプレビューをクリア
      hideBoardPreview();
    }
    window.syncBoardUI?.();
  };

  // -----------------------------
  // 4点選択機能
  // -----------------------------
  let selectedJoints4 = []; // 選択中のジョイントインデックスの配列（最大4つ）
  let selectedJointMeshes = []; // 選択中のジョイントのハイライト用メッシュ

  // 選択されたジョイントをハイライト表示
  function highlightSelectedJoint(jointIndex) {
    const joints = window.joints || [];
    const jointMeshes = window.jointMeshes || [];
    
    if (jointIndex < 0 || jointIndex >= joints.length) return;
    if (!jointMeshes[jointIndex]) return;
    
    const mesh = jointMeshes[jointIndex];
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    
    for (const mat of mats) {
      if (!mat) continue;
      // 選択中のジョイントは緑色に発光
      if (mat.emissive && typeof mat.emissive.setHex === "function") {
        mat.emissive.setHex(0x00ff00); // 緑色
      }
      if (typeof mat.emissiveIntensity === "number") {
        mat.emissiveIntensity = 1.0;
      }
      mat.needsUpdate = true;
    }
  }

  // 選択されたジョイントのハイライトを解除
  function unhighlightSelectedJoint(jointIndex) {
    const joints = window.joints || [];
    const jointMeshes = window.jointMeshes || [];
    
    if (jointIndex < 0 || jointIndex >= joints.length) return;
    if (!jointMeshes[jointIndex]) return;
    
    const mesh = jointMeshes[jointIndex];
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    
    for (const mat of mats) {
      if (!mat) continue;
      // ハイライトを解除
      if (mat.emissive && typeof mat.emissive.setHex === "function") {
        mat.emissive.setHex(0x000000);
      }
      if (typeof mat.emissiveIntensity === "number") {
        mat.emissiveIntensity = 0;
      }
      mat.needsUpdate = true;
    }
  }

  // 4点選択にジョイントを追加
  window.addJointToBoardSelection = function(jointIndex) {
    if (!window.isBoardModeOn) return false;
    
    const joints = window.joints || [];
    if (jointIndex < 0 || jointIndex >= joints.length) return false;
    
    // 既に選択されている場合は無視
    if (selectedJoints4.includes(jointIndex)) return false;
    
    // 4点まで選択可能
    if (selectedJoints4.length >= 4) return false;
    
    selectedJoints4.push(jointIndex);
    highlightSelectedJoint(jointIndex);
    
    // 4点選択が完了したらプレビューを表示
    if (selectedJoints4.length === 4) {
      updatePreviewFromSelectedJoints4();
    } else {
      // 4点未満の場合は自動プレビューを非表示
      hideBoardPreview();
    }
    
    return true;
  };

  // 4点選択をクリア
  window.clearBoardSelection = function() {
    // ハイライトを解除
    const jointsToClear = [...selectedJoints4];
    jointsToClear.forEach(idx => {
      unhighlightSelectedJoint(idx);
    });
    
    selectedJoints4 = [];
    selectedJointMeshes = [];
    hideBoardPreview();
  };

  // 選択された4点からプレビューを更新
  function updatePreviewFromSelectedJoints4() {
    if (selectedJoints4.length !== 4) return;
    
    const boardKindToggle = document.getElementById("board-kind-toggle");
    const isPanel = boardKindToggle?.checked || false;
    
    const b = computeBoundsFromJoints(selectedJoints4, isPanel);
    if (!b) {
      hideBoardPreview();
      return;
    }

    const thickness = 6; // デフォルト厚み
    const material =
      document.getElementById("board-material")?.value || "足場板";

    const mat = getBoardMaterial(material);
    mat.transparent = true;
    mat.opacity = 0.5;

    let geo = null;
    const mesh = new THREE.Mesh(undefined, mat);

    // 調整後の境界の中心を計算
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    const centerZ = (b.minZ + b.maxZ) / 2;

    if (isPanel) {
      // 壁板：平面を自動判定
      const side = detectPanelSide(selectedJoints4);
      const h = b.heightMm || Math.max(1, b.maxY - b.minY);
      
      if (h < 1) {
        console.warn("[updatePreviewFromSelectedJoints4] Invalid panel height:", h);
        hideBoardPreview();
        return;
      }

      if (side === "back") {
        const w = b.widthMm || Math.max(1, b.maxX - b.minX);
        if (w < 1) {
          console.warn("[updatePreviewFromSelectedJoints4] Invalid panel width (back):", w);
          hideBoardPreview();
          return;
        }
        geo = new THREE.BoxGeometry(w, h, thickness);
        mesh.geometry = geo;
        mesh.position.set(centerX, centerY, centerZ);
      } else if (side === "side") {
        const w = b.widthMm || Math.max(1, b.maxZ - b.minZ);
        if (w < 1) {
          console.warn("[updatePreviewFromSelectedJoints4] Invalid panel width (side):", w);
          hideBoardPreview();
          return;
        }
        geo = new THREE.BoxGeometry(thickness, h, w);
        mesh.geometry = geo;
        mesh.position.set(centerX, centerY, centerZ);
      } else {
        console.warn("[updatePreviewFromSelectedJoints4] Unknown side:", side);
        hideBoardPreview();
        return;
      }
    } else {
      // 棚板：beamの長さから決定したサイズを使用
      const w = b.widthMm || Math.max(1, b.maxX - b.minX);
      const d = b.depthMm || Math.max(1, b.maxZ - b.minZ);
      geo = new THREE.BoxGeometry(w, thickness, d);
      mesh.geometry = geo;
      mesh.position.set(centerX, centerY, centerZ);
    }

    // 既存のプレビューを削除
    hideBoardPreview();

    if (window.rackGroup) {
      window.rackGroup.add(mesh);
    }
    previewBoardMesh = mesh;
    previewBoardJ4 = [...selectedJoints4];
    window.previewBoardJ4 = previewBoardJ4;
    if (window.v3PlacePick && typeof window.v3PlacePick.setBoardCandidate === "function") {
      window.v3PlacePick.setBoardCandidate({
        j4: previewBoardJ4,
        kind: isPanel ? "panel" : "shelf",
      });
    }
  }

  // モード切替時に4点選択をクリア
  const originalSetBoardMode = window.setBoardMode;
  window.setBoardMode = function(on) {
    if (!on) {
      window.clearBoardSelection?.();
    }
    if (originalSetBoardMode) {
      originalSetBoardMode(on);
    } else {
      window.isBoardModeOn = !!on;
      if (!on) {
        hideBoardPreview();
      } else {
        hideBoardPreview();
      }
      window.syncBoardUI?.();
    }
    if (window.v3LengthPanel && typeof window.v3LengthPanel.syncFromTool === "function") {
      window.v3LengthPanel.syncFromTool();
    }
  };
  
  // グローバルに公開（デバッグ用・外部アクセス用）
  Object.defineProperty(window, 'selectedJoints4', {
    get: function() { return selectedJoints4; },
    enumerable: true,
    configurable: true
  });

  // -----------------------------
  // プレビュー機能
  // -----------------------------
  let previewBoardMesh = null;
  let previewBoardJ4 = null;

  function orderShelfQuad(j4, j4joints) {
    const sortedByX = [...j4joints].sort((a, b) => a.x - b.x);
    const left = sortedByX.slice(0, 2).sort((a, b) => a.z - b.z);
    const right = sortedByX.slice(2, 4).sort((a, b) => a.z - b.z);
    const ordered = [left[0], right[0], right[1], left[1]];
    return ordered.map((j) => {
      const origIdx = j4joints.findIndex((orig) =>
        Math.abs(orig.x - j.x) < 0.1 &&
        Math.abs(orig.y - j.y) < 0.1 &&
        Math.abs(orig.z - j.z) < 0.1
      );
      return j4[origIdx];
    });
  }

  function shelfQuadMetrics(j4) {
    const pts = (j4 || []).map((i) => window.joints?.[i]).filter(Boolean);
    if (pts.length !== 4) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let cx = 0, cz = 0, cy = 0;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      cx += p.x; cy += p.y; cz += p.z;
    });
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (width < 40 || depth < 40) return null;
    return {
      j4,
      width,
      depth,
      cx: cx / 4,
      cy: cy / 4,
      cz: cz / 4,
      minX, maxX, minZ, maxZ,
    };
  }

  function findClosedShelfQuadsAtY(targetY, tolerance) {
    const joints = window.joints || [];
    const beams = window.beams || [];
    const yJoints = [];
    joints.forEach((j, idx) => {
      if (j && Math.abs(j.y - targetY) <= tolerance) yJoints.push(idx);
    });
    if (yJoints.length < 4) return [];
    const ySet = new Set(yJoints);
    const adj = new Map();
    function addEdge(a, b) {
      if (!adj.has(a)) adj.set(a, []);
      if (adj.get(a).indexOf(b) < 0) adj.get(a).push(b);
    }
    beams.forEach((b) => {
      if (!b || !ySet.has(b.a) || !ySet.has(b.b)) return;
      addEdge(b.a, b.b);
      addEdge(b.b, b.a);
    });
    const seen = new Set();
    const quads = [];
    yJoints.forEach((start) => {
      (adj.get(start) || []).forEach((n1) => {
        (adj.get(n1) || []).forEach((n2) => {
          if (n2 === start) return;
          (adj.get(n2) || []).forEach((n3) => {
            if (n3 === start || n3 === n1) return;
            const n3adj = adj.get(n3) || [];
            if (n3adj.indexOf(start) < 0) return;
            if (n3adj.indexOf(n1) >= 0) return;
            const key = [start, n1, n2, n3].slice().sort((a, b) => a - b).join(",");
            if (seen.has(key)) return;
            seen.add(key);
            const raw = [start, n1, n2, n3];
            const pts = raw.map((i) => joints[i]);
            const ordered = orderShelfQuad(raw, pts);
            if (ordered.some((i) => i == null || i < 0)) return;
            const metrics = shelfQuadMetrics(ordered);
            if (metrics) quads.push(metrics);
          });
        });
      });
    });
    return quads;
  }

  function pickShelfCellJ4(worldPos, startJoint1, startJoint2) {
    const aY = startJoint1.y;
    const bY = startJoint2.y;
    const da = Math.abs(aY - worldPos.y);
    const db = Math.abs(bY - worldPos.y);
    const targetY = Math.abs(da - db) < 1 ? Math.max(aY, bY) : (da < db ? aY : bY);
    const quads = findClosedShelfQuadsAtY(targetY, 1);
    if (!quads.length) return null;
    let best = null;
    let bestScore = Infinity;
    quads.forEach((q) => {
      const inside =
        worldPos.x >= q.minX - 8 && worldPos.x <= q.maxX + 8 &&
        worldPos.z >= q.minZ - 8 && worldPos.z <= q.maxZ + 8;
      const dx = q.cx - worldPos.x;
      const dz = q.cz - worldPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const score = dist - (inside ? 1000 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = q;
      }
    });
    return best ? best.j4 : null;
  }

  let boardPlaceMode = "auto";

  function sameJ4(a, b) {
    if (!a || !b || a.length !== 4 || b.length !== 4) return false;
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }

  function hasBoardEdge(a, b) {
    if (typeof window.hasBeamBetween === "function" && window.hasBeamBetween(a, b)) return true;
    if (typeof window.hasPoleBetween === "function" && window.hasPoleBetween(a, b)) return true;
    const beams = window.beams || [];
    const poles = window.poles || [];
    for (let i = 0; i < beams.length; i++) {
      const c = beams[i];
      if (c && ((c.a === a && c.b === b) || (c.a === b && c.b === a))) return true;
    }
    for (let i = 0; i < poles.length; i++) {
      const c = poles[i];
      if (c && ((c.a === a && c.b === b) || (c.a === b && c.b === a))) return true;
    }
    return false;
  }

  function clusterAxisKeys(joints, axis, tol) {
    const vals = [];
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (!j) continue;
      vals.push(axis === "x" ? j.x : j.z);
    }
    vals.sort(function (a, b) { return a - b; });
    const keys = [];
    for (let i = 0; i < vals.length; i++) {
      if (!keys.length || Math.abs(keys[keys.length - 1] - vals[i]) > tol) keys.push(vals[i]);
    }
    return keys;
  }

  function orderPanelQuad(j4, pts, axis) {
    if (axis === "x") {
      const byZ = pts.slice().sort(function (a, b) { return a.z - b.z; });
      const front = byZ.slice(0, 2).sort(function (a, b) { return a.y - b.y; });
      const back = byZ.slice(2, 4).sort(function (a, b) { return a.y - b.y; });
      const ordered = [front[0], back[0], back[1], front[1]];
      return ordered.map(function (j) {
        return j4[pts.findIndex(function (orig) {
          return Math.abs(orig.x - j.x) < 0.1 && Math.abs(orig.y - j.y) < 0.1 && Math.abs(orig.z - j.z) < 0.1;
        })];
      });
    }
    const byX = pts.slice().sort(function (a, b) { return a.x - b.x; });
    const left = byX.slice(0, 2).sort(function (a, b) { return a.y - b.y; });
    const right = byX.slice(2, 4).sort(function (a, b) { return a.y - b.y; });
    const ordered = [left[0], right[0], right[1], left[1]];
    return ordered.map(function (j) {
      return j4[pts.findIndex(function (orig) {
        return Math.abs(orig.x - j.x) < 0.1 && Math.abs(orig.y - j.y) < 0.1 && Math.abs(orig.z - j.z) < 0.1;
      })];
    });
  }

  function panelQuadMetrics(j4, axis) {
    const pts = (j4 || []).map(function (i) { return window.joints && window.joints[i]; }).filter(Boolean);
    if (pts.length !== 4) return null;
    let minY = Infinity, maxY = -Infinity, minU = Infinity, maxU = -Infinity;
    let cx = 0, cy = 0, cz = 0;
    pts.forEach(function (p) {
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      const u = axis === "x" ? p.z : p.x;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      cx += p.x; cy += p.y; cz += p.z;
    });
    const height = maxY - minY;
    const width = maxU - minU;
    if (height < 40 || width < 40) return null;
    return {
      j4: j4,
      axis: axis,
      width: width,
      height: height,
      cx: cx / 4,
      cy: cy / 4,
      cz: cz / 4,
      minY: minY,
      maxY: maxY,
      minU: minU,
      maxU: maxU,
    };
  }

  function findClosedPanelQuadsAt(axis, key, tolerance) {
    const joints = window.joints || [];
    const plane = [];
    joints.forEach(function (j, idx) {
      if (!j) return;
      const v = axis === "x" ? j.x : j.z;
      if (Math.abs(v - key) <= tolerance) plane.push(idx);
    });
    if (plane.length < 4) return [];
    const adj = new Map();
    function addEdge(a, b) {
      if (!adj.has(a)) adj.set(a, []);
      if (adj.get(a).indexOf(b) < 0) adj.get(a).push(b);
    }
    plane.forEach(function (idx) {
      plane.forEach(function (other) {
        if (other <= idx) return;
        if (hasBoardEdge(idx, other)) {
          addEdge(idx, other);
          addEdge(other, idx);
        }
      });
    });
    const seen = new Set();
    const quads = [];
    plane.forEach(function (start) {
      (adj.get(start) || []).forEach(function (n1) {
        (adj.get(n1) || []).forEach(function (n2) {
          if (n2 === start) return;
          (adj.get(n2) || []).forEach(function (n3) {
            if (n3 === start || n3 === n1) return;
            const n3adj = adj.get(n3) || [];
            if (n3adj.indexOf(start) < 0) return;
            if (n3adj.indexOf(n1) >= 0) return;
            const raw = [start, n1, n2, n3];
            const key4 = raw.slice().sort(function (a, b) { return a - b; }).join(",");
            if (seen.has(key4)) return;
            seen.add(key4);
            const pts = raw.map(function (i) { return joints[i]; });
            if (pts.some(function (p) { return !p; })) return;
            const ordered = orderPanelQuad(raw, pts, axis);
            if (ordered.some(function (i) { return i == null || i < 0; })) return;
            const edges = [[ordered[0], ordered[1]], [ordered[1], ordered[2]], [ordered[2], ordered[3]], [ordered[3], ordered[0]]];
            if (!edges.every(function (e) { return hasBoardEdge(e[0], e[1]); })) return;
            const metrics = panelQuadMetrics(ordered, axis);
            if (metrics) quads.push(metrics);
          });
        });
      });
    });
    return quads;
  }

  function findClosedPanelQuads() {
    const joints = window.joints || [];
    const tol = 1;
    const out = [];
    const seen = new Set();
    clusterAxisKeys(joints, "x", tol).forEach(function (x) {
      findClosedPanelQuadsAt("x", x, tol).forEach(function (q) {
        const k = q.j4.slice().sort(function (a, b) { return a - b; }).join(",");
        if (seen.has(k)) return;
        seen.add(k);
        out.push(q);
      });
    });
    clusterAxisKeys(joints, "z", tol).forEach(function (z) {
      findClosedPanelQuadsAt("z", z, tol).forEach(function (q) {
        const k = q.j4.slice().sort(function (a, b) { return a - b; }).join(",");
        if (seen.has(k)) return;
        seen.add(k);
        out.push(q);
      });
    });
    return out;
  }

  function panelHitScreen(q, clientX, clientY, project, padPx) {
    const pick = window.v3PlacePick;
    if (!pick || typeof project !== "function") return { hit: false, dist: Infinity };
    const corners = [];
    for (let i = 0; i < 4; i++) {
      const j = window.joints && window.joints[q.j4[i]];
      if (!j) return { hit: false, dist: Infinity };
      const p = project(j);
      if (!p) return { hit: false, dist: Infinity };
      corners.push(p);
    }
    const pad = padPx == null ? 12 : padPx;
    const pad2 = pad * pad;
    const inside = typeof pick.pointInQuad === "function" && pick.pointInQuad(clientX, clientY, corners);
    let edge = false;
    let bestEdge = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const d = typeof pick.distToSegSq === "function"
        ? pick.distToSegSq(clientX, clientY, a.x, a.y, b.x, b.y)
        : Infinity;
      if (d < bestEdge) bestEdge = d;
      if (d <= pad2) edge = true;
    }
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const dist = typeof pick.distSq === "function" ? pick.distSq(clientX, clientY, cx, cy) : 0;
    return { hit: !!(inside || edge), dist: dist, edgeDist: bestEdge };
  }

  function pickPanelCellJ4(opts) {
    opts = opts || {};
    const quads = findClosedPanelQuads();
    if (!quads.length) return null;
    const current = opts.currentJ4 || previewBoardJ4;
    const project = opts.project;
    const hasScreen = typeof opts.clientX === "number" && typeof opts.clientY === "number" && typeof project === "function";
    const cam = opts.cameraPos || (window.camera && window.camera.position);
    const pad = opts.padPx == null ? 12 : opts.padPx;
    const stickPad = opts.stickPadPx == null ? 18 : opts.stickPadPx;

    if (hasScreen) {
      if (current) {
        const cur = quads.filter(function (q) { return sameJ4(q.j4, current); })[0];
        if (cur && panelHitScreen(cur, opts.clientX, opts.clientY, project, stickPad).hit) return cur.j4;
      }
      let best = null;
      let bestScore = Infinity;
      quads.forEach(function (q) {
        const hit = panelHitScreen(q, opts.clientX, opts.clientY, project, pad);
        if (!hit.hit) return;
        const dx = cam ? (q.cx - cam.x) : 0;
        const dy = cam ? (q.cy - cam.y) : 0;
        const dz = cam ? (q.cz - cam.z) : 0;
        const depth = cam ? Math.sqrt(dx * dx + dy * dy + dz * dz) : 0;
        const score = depth * 1000 + hit.dist;
        if (score < bestScore) {
          bestScore = score;
          best = q;
        }
      });
      return best ? best.j4 : null;
    }

    const wp = opts.worldPos;
    if (!wp) return null;
    let best = null;
    let bestScore = Infinity;
    quads.forEach(function (q) {
      const plane = q.axis === "x" ? Math.abs(wp.x - q.cx) : Math.abs(wp.z - q.cz);
      const u = q.axis === "x" ? wp.z : wp.x;
      const inside =
        wp.y >= q.minY - 8 && wp.y <= q.maxY + 8 &&
        u >= q.minU - 8 && u <= q.maxU + 8 &&
        plane <= 12;
      const du = u - (q.minU + q.maxU) / 2;
      const dy = wp.y - q.cy;
      const dist = Math.sqrt(du * du + dy * dy + plane * plane);
      const score = dist - (inside ? 1000 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = q;
      }
    });
    if (!best || bestScore > 400) return null;
    return best.j4;
  }

  window.getBoardPlaceMode = function () {
    return boardPlaceMode === "pick4" ? "pick4" : "auto";
  };
  window.setBoardPlaceMode = function (mode) {
    const next = mode === "pick4" ? "pick4" : "auto";
    if (boardPlaceMode === next) return;
    boardPlaceMode = next;
    window.clearBoardSelection?.();
    if (next === "pick4") hideBoardPreview();
    if (window.v3LengthPanel && typeof window.v3LengthPanel.mountAdd === "function" && window.isBoardModeOn) {
      const rail = window.v3EastRail && window.v3EastRail.getOpenId && window.v3EastRail.getOpenId();
      if (rail === "add") window.v3LengthPanel.mountAdd();
    }
    if (window.v3CadToolbar && typeof window.v3CadToolbar.syncActive === "function") window.v3CadToolbar.syncActive();
  };
  window.isBoardKindWall = function () {
    return !!document.getElementById("board-kind-toggle")?.checked;
  };
  window.setBoardKindWall = function (isWall) {
    const tog = document.getElementById("board-kind-toggle");
    if (!tog) return;
    const next = !!isWall;
    if (tog.checked === next) return;
    tog.checked = next;
    tog.dispatchEvent(new Event("change", { bubbles: true }));
  };
  window.v3BoardPick = {
    findClosedPanelQuads: findClosedPanelQuads,
    pickPanelCellJ4: pickPanelCellJ4,
    sameJ4: sameJ4,
  };

  // マウス位置から4本のbeam/poleに囲まれた領域を検出
  function findNearbyJoints4(worldPos, maxDistance, screen) {
    const joints = window.joints || [];
    const beams = window.beams || [];
    const poles = window.poles || [];
    
    if (joints.length < 4) return null;

    const boardKindToggle = document.getElementById("board-kind-toggle");
    const isPanel = boardKindToggle?.checked || false;
    if (isPanel) {
      return pickPanelCellJ4({
        worldPos: worldPos,
        clientX: screen && screen.clientX,
        clientY: screen && screen.clientY,
        project: screen && screen.project,
        cameraPos: screen && screen.cameraPos,
        currentJ4: previewBoardJ4,
      });
    }
    if (!worldPos) return null;
    if (maxDistance == null) maxDistance = 1500;
    
    // 1. マウス位置に最も近いBeam/Poleを見つける（棚板はBeam、壁板はPoleを優先）
    let nearestConnector = null;
    let nearestDist = Infinity;
    let nearestType = null;
    
    const connectors = isPanel ? [...poles, ...beams] : [...beams, ...poles];
    
    connectors.forEach((conn) => {
      if (!conn || conn.a == null || conn.b == null) return;
      const a = joints[conn.a];
      const b = joints[conn.b];
      if (!a || !b) return;
      
      // 線分上の最近点を計算
      const lineStart = new THREE.Vector3(a.x, a.y, a.z);
      const lineEnd = new THREE.Vector3(b.x, b.y, b.z);
      const point = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
      
      const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
      const lineLen = lineDir.length();
      if (lineLen < 1) return;
      
      lineDir.normalize();
      const toPoint = new THREE.Vector3().subVectors(point, lineStart);
      const t = Math.max(0, Math.min(1, toPoint.dot(lineDir)));
      const closest = new THREE.Vector3().addVectors(
        lineStart,
        lineDir.multiplyScalar(t)
      );
      
      const dist = point.distanceTo(closest);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestConnector = conn;
        nearestType = isPanel ? (poles.includes(conn) ? "pole" : "beam") : (beams.includes(conn) ? "beam" : "pole");
      }
    });
    
    if (!nearestConnector || nearestDist > maxDistance) return null;
    
    // 2. そのBeam/Poleの両端のジョイントから、同じ平面で直接接続されているジョイントを探す
    const startJ1 = nearestConnector.a;
    const startJ2 = nearestConnector.b;
    const startJoint1 = joints[startJ1];
    const startJoint2 = joints[startJ2];
    if (!startJoint1 || !startJoint2) return null;
    
    // 同じ平面のジョイントを集める（直接接続のみ、深さ2まで）
    const samePlaneJoints = new Set([startJ1, startJ2]);
    const tolerance = 1;
    
    if (isPanel) {
      // 壁板：平面を自動判定（X座標またはZ座標がほぼ同じジョイントを選ぶ）
      // まず、最初の2つのジョイントから平面の向きを判定
      const dx = Math.abs(startJoint2.x - startJoint1.x);
      const dz = Math.abs(startJoint2.z - startJoint1.z);
      
      // 判定を逆にする
      // X方向の変化が小さい → X方向の壁（幅方向）- X座標で判定
      // Z方向の変化が小さい → Z方向の壁（奥行方向）- Z座標で判定
      const tolerance = 5;
      let keyFn, targetKey;
      
      if (dx < tolerance && dz >= tolerance) {
        // X方向の壁（幅方向）
        keyFn = (j => j.x);
        targetKey = keyFn(startJoint1);
      } else if (dz < tolerance && dx >= tolerance) {
        // Z方向の壁（奥行方向）
        keyFn = (j => j.z);
        targetKey = keyFn(startJoint1);
      } else {
        // デフォルト（Z方向の壁として扱う）
        keyFn = (j => j.z);
        targetKey = keyFn(startJoint1);
      }
      
      function addDirectConnections(jointIdx) {
        // Poleをチェック（壁板の場合）
        poles.forEach((p) => {
          if (!p) return;
          const other = p.a === jointIdx ? p.b : (p.b === jointIdx ? p.a : null);
          if (other != null) {
            const otherJoint = joints[other];
            if (otherJoint && Math.abs(keyFn(otherJoint) - targetKey) < tolerance) {
              samePlaneJoints.add(other);
            }
          }
        });
        // Beamもチェック（壁板の場合、Beamも使う可能性がある）
        beams.forEach((b) => {
          if (!b) return;
          const other = b.a === jointIdx ? b.b : (b.b === jointIdx ? b.a : null);
          if (other != null) {
            const otherJoint = joints[other];
            if (otherJoint && Math.abs(keyFn(otherJoint) - targetKey) < tolerance) {
              samePlaneJoints.add(other);
            }
          }
        });
      }
      
      addDirectConnections(startJ1);
      addDirectConnections(startJ2);
      
      // さらに、追加されたジョイントからも直接接続を探す（1回だけ）
      const added = Array.from(samePlaneJoints);
      added.forEach(jIdx => {
        if (jIdx !== startJ1 && jIdx !== startJ2) {
          addDirectConnections(jIdx);
        }
      });
    } else {
      return pickShelfCellJ4(worldPos, startJoint1, startJoint2);
    }
    
    // 3. 同じ平面のジョイントから、マウス位置に近い4つを選ぶ
    const candidates = Array.from(samePlaneJoints)
      .map(idx => ({ idx, joint: joints[idx] }))
      .filter(item => item.joint);
    
    if (candidates.length < 4) return null;
    
    // 距離でソート
    const sorted = candidates
      .map(item => ({
        idx: item.idx,
        joint: item.joint,
        dist: Math.sqrt(
          Math.pow(item.joint.x - worldPos.x, 2) +
          Math.pow(item.joint.y - worldPos.y, 2) +
          Math.pow(item.joint.z - worldPos.z, 2)
        )
      }))
      .sort((a, b) => a.dist - b.dist);
    
    // 4. 4つのジョイントが実際に4本のBeam/Poleで囲まれた四角形を形成しているかチェック
    const hasBeamBetween = window.hasBeamBetween || ((a, b) => {
      return beams.some(c => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    });
    const hasPoleBetween = window.hasPoleBetween || ((a, b) => {
      return poles.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    });
    
    // 近い順に4つずつ試す
    for (let i = 0; i <= sorted.length - 4; i++) {
      const j4candidates = sorted.slice(i, i + 4);
      const j4 = j4candidates.map(s => s.idx);
      const j4joints = j4candidates.map(s => s.joint);
      
      // 4点の位置関係から順序を決定（四角形の頂点順）
      if (isPanel) {
        // 壁板：平面を自動判定して順序を決定
        const xCoords = j4joints.map(j => j.x);
        const zCoords = j4joints.map(j => j.z);
        const xRange = Math.max(...xCoords) - Math.min(...xCoords);
        const zRange = Math.max(...zCoords) - Math.min(...zCoords);
        const tolerance = 5;
        
        let ordered;
        if (xRange < tolerance && zRange >= tolerance) {
          // X方向の壁（幅方向）：Z座標でソート、次にY座標でソート
          const sortedByZ = [...j4joints].sort((a, b) => a.z - b.z);
          const front = sortedByZ.slice(0, 2).sort((a, b) => a.y - b.y);
          const back = sortedByZ.slice(2, 4).sort((a, b) => a.y - b.y);
          ordered = [front[0], back[0], back[1], front[1]];
        } else if (zRange < tolerance && xRange >= tolerance) {
          // Z方向の壁（奥行方向）：X座標でソート、次にY座標でソート
          const sortedByX = [...j4joints].sort((a, b) => a.x - b.x);
          const left = sortedByX.slice(0, 2).sort((a, b) => a.y - b.y);
          const right = sortedByX.slice(2, 4).sort((a, b) => a.y - b.y);
          ordered = [left[0], right[0], right[1], left[1]];
        } else {
          // デフォルト（Z方向の壁として扱う）
          const sortedByX = [...j4joints].sort((a, b) => a.x - b.x);
          const left = sortedByX.slice(0, 2).sort((a, b) => a.y - b.y);
          const right = sortedByX.slice(2, 4).sort((a, b) => a.y - b.y);
          ordered = [left[0], right[0], right[1], left[1]];
        }
        
        // 順序に対応するインデックスを取得
        const orderedIdx = ordered.map(j => {
          const origIdx = j4joints.findIndex(orig => 
            Math.abs(orig.x - j.x) < 0.1 && 
            Math.abs(orig.y - j.y) < 0.1 && 
            Math.abs(orig.z - j.z) < 0.1
          );
          return j4[origIdx];
        });
        
        // 4本のPoleまたはBeamで囲まれているかチェック（壁板の場合、BeamとPoleの組み合わせもOK）
        const edges = [
          [orderedIdx[0], orderedIdx[1]],
          [orderedIdx[1], orderedIdx[2]],
          [orderedIdx[2], orderedIdx[3]],
          [orderedIdx[3], orderedIdx[0]]
        ];
        // 各辺がPoleまたはBeamで接続されているかチェック
        const allConnected = edges.every(([a, b]) => 
          hasPoleBetween(a, b) || hasBeamBetween(a, b)
        );
        if (allConnected) {
          return orderedIdx;
        }
      } else {
        // 棚板：X/Z座標でソートして、左上、右上、右下、左下の順に並べる
        const sortedByX = [...j4joints].sort((a, b) => a.x - b.x);
        const left = sortedByX.slice(0, 2).sort((a, b) => a.z - b.z);
        const right = sortedByX.slice(2, 4).sort((a, b) => a.z - b.z);
        const ordered = [left[0], right[0], right[1], left[1]];
        
        // 順序に対応するインデックスを取得
        const orderedIdx = ordered.map(j => {
          const origIdx = j4joints.findIndex(orig => 
            Math.abs(orig.x - j.x) < 0.1 && 
            Math.abs(orig.y - j.y) < 0.1 && 
            Math.abs(orig.z - j.z) < 0.1
          );
          return j4[origIdx];
        });
        
        // 4本のBeamで囲まれているかチェック
        const edges = [
          [orderedIdx[0], orderedIdx[1]],
          [orderedIdx[1], orderedIdx[2]],
          [orderedIdx[2], orderedIdx[3]],
          [orderedIdx[3], orderedIdx[0]]
        ];
        if (edges.every(([a, b]) => hasBeamBetween(a, b))) {
          return orderedIdx;
        }
      }
    }
    
    // 4本のBeam/Poleで囲まれた四角形が見つからなかった
    return null;
  }

  // プレビューを非表示
  function hideBoardPreview() {
    if (!previewBoardMesh) {
      previewBoardJ4 = null;
      window.previewBoardJ4 = null;
      if (window.v3PlacePick && typeof window.v3PlacePick.clearBoardCandidate === "function") {
        window.v3PlacePick.clearBoardCandidate();
      }
      return;
    }
    if (window.rackGroup) {
      window.rackGroup.remove(previewBoardMesh);
    }
    disposeMesh(previewBoardMesh, true);
    previewBoardMesh = null;
    previewBoardJ4 = null;
    window.previewBoardJ4 = null;
    if (window.v3PlacePick && typeof window.v3PlacePick.clearBoardCandidate === "function") {
      window.v3PlacePick.clearBoardCandidate();
    }
  }
  window.hideBoardPreview = hideBoardPreview;
  window.findNearbyJoints4 = findNearbyJoints4;

  // プレビューを表示
  function showBoardPreview(worldPos, screen) {
    if (!window.isBoardModeOn) {
      hideBoardPreview();
      return;
    }
    if (boardPlaceMode === "pick4") return;

    const j4 = findNearbyJoints4(worldPos, 1500, screen);
    if (!j4) {
      hideBoardPreview();
      return;
    }

    // 同じジョイントセットなら更新不要
    if (
      previewBoardJ4 &&
      previewBoardJ4.length === 4 &&
      previewBoardJ4.every((idx, i) => idx === j4[i])
    ) {
      return;
    }

    hideBoardPreview();

    const boardKindToggle = document.getElementById("board-kind-toggle");
    const isPanel = boardKindToggle?.checked || false;
    
    const b = computeBoundsFromJoints(j4, isPanel);
    if (!b) return;

    const thickness = 6; // デフォルト厚み
    const material =
      document.getElementById("board-material")?.value || "足場板";

    const mat = getBoardMaterial(material);
    mat.transparent = true;
    mat.opacity = 0.5;

    let geo = null;
    const mesh = new THREE.Mesh(undefined, mat);

    // 調整後の境界の中心を計算
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    const centerZ = (b.minZ + b.maxZ) / 2;

    if (isPanel) {
      // 壁板：平面を自動判定
      const side = detectPanelSide(j4);
      const h = b.heightMm || Math.max(1, b.maxY - b.minY);
      
      if (h < 1) {
        console.warn("[showBoardPreview] Invalid panel height:", h);
        return;
      }

      if (side === "back") {
        // Z方向の壁（奥行方向）：X方向とY方向に広がる
        // widthMmはX方向のbeamの長さ
        const w = b.widthMm || Math.max(1, b.maxX - b.minX);
        if (w < 1) {
          console.warn("[showBoardPreview] Invalid panel width (back):", w);
          return;
        }
        geo = new THREE.BoxGeometry(w, h, thickness);
        mesh.geometry = geo;
        mesh.position.set(centerX, centerY, centerZ);
      } else if (side === "side") {
        // X方向の壁（幅方向）：Z方向とY方向に広がる
        // widthMmはZ方向のbeamの長さ（computeBoundsFromJointsで計算済み）
        const w = b.widthMm || Math.max(1, b.maxZ - b.minZ);
        if (w < 1) {
          console.warn("[showBoardPreview] Invalid panel width (side):", w);
          return;
        }
        geo = new THREE.BoxGeometry(thickness, h, w);
        mesh.geometry = geo;
        mesh.position.set(centerX, centerY, centerZ);
      } else {
        console.warn("[showBoardPreview] Unknown side:", side);
        return;
      }
    } else {
      // 棚板：beamの長さから決定したサイズを使用
      const w = b.widthMm || Math.max(1, b.maxX - b.minX);
      const d = b.depthMm || Math.max(1, b.maxZ - b.minZ);
      geo = new THREE.BoxGeometry(w, thickness, d);
      mesh.geometry = geo;
      mesh.position.set(centerX, centerY, centerZ);
    }

    if (window.rackGroup) {
      window.rackGroup.add(mesh);
    }
    previewBoardMesh = mesh;
    previewBoardJ4 = j4;
    window.previewBoardJ4 = previewBoardJ4;
    if (window.v3PlacePick && typeof window.v3PlacePick.setBoardCandidate === "function") {
      const boardKindToggle = document.getElementById("board-kind-toggle");
      window.v3PlacePick.setBoardCandidate({
        j4: j4,
        kind: boardKindToggle && boardKindToggle.checked ? "panel" : "shelf",
      });
    }
  }
  window.showBoardPreview = showBoardPreview;

  // プレビュー位置から板を追加
  window.addBoardFromPreview = function(j4opt) {
    if (j4opt && j4opt.length === 4) previewBoardJ4 = j4opt.slice();
    if (!previewBoardJ4 || previewBoardJ4.length !== 4) return;

    const thickness = Number(
      document.getElementById("board-thickness")?.value || 6
    );
    const material =
      document.getElementById("board-material")?.value || "足場板";
    const boardKindToggle = document.getElementById("board-kind-toggle");
    const isPanel = boardKindToggle?.checked || false;

    // プレビューを一時的に保持
    const savedJ4 = [...previewBoardJ4];

    if (isPanel) {
      // 平面を自動判定（sideは未指定または"auto"）
      window.addPanelByJoints4?.(savedJ4, { thicknessMm: thickness, material, side: "auto" });
    } else {
      window.addShelfByJoints4?.(savedJ4, { thicknessMm: thickness, material });
    }

    // 履歴保存は追加後に実行（Undo/Redo対応）
    // 追加後の状態を保存することで、Undoで追加前の状態に戻る
    window.saveHistory?.("add board");

    // 4点選択をクリア
    window.clearBoardSelection?.();

    // プレビューを再表示（同じ位置に）- 4点選択モードの場合は再表示しない
    if (selectedJoints4.length === 0 && previewBoardMesh && previewBoardMesh.position) {
      const pos = previewBoardMesh.position;
      showBoardPreview({ x: pos.x, y: pos.y, z: pos.z });
    }
  };
})();
