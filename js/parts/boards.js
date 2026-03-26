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
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
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

  function disposeMesh(mesh) {
    if (!mesh) return;
    // プレビューメッシュは削除しない
    if (mesh === previewBoardMesh) return;
    try { mesh.geometry?.dispose?.(); } catch(e){}
    try { mesh.material?.dispose?.(); } catch(e){}
    try { mesh.parent?.remove?.(mesh); } catch(e){}
  }

  // -----------------------------
  // 再構築
  // -----------------------------
  function rebuildShelves() {
    const shelves = window.shelves || [];
    shelves.forEach(s => disposeMesh(s.mesh));

    shelves.forEach(s => {
      const b = computeBoundsFromJoints(s.j4, false);
      if (!b) return;

      const thickness = Math.max(1, Number(s.thicknessMm || 6));
      // beamの長さから決定したサイズを使用
      const w = b.widthMm || Math.max(1, b.maxX - b.minX);
      const d = b.depthMm || Math.max(1, b.maxZ - b.minZ);

      // 調整後の境界の中心を計算
      const centerX = (b.minX + b.maxX) / 2;
      const centerY = (b.minY + b.maxY) / 2;
      const centerZ = (b.minZ + b.maxZ) / 2;

      const geo = new THREE.BoxGeometry(w, thickness, d);
      const mat = getBoardMaterial(s.material || "足場板");
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(centerX, centerY, centerZ);
      mesh.userData = { type: "shelf", shelfIndex: shelves.indexOf(s) };

      // 既存のrackGroupに載せる
      if (window.rackGroup) window.rackGroup.add(mesh);

      s.mesh = mesh;
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

  function rebuildPanels() {
    const panels = window.panels || [];
    panels.forEach(p => disposeMesh(p.mesh));

    panels.forEach(p => {
      const b = computeBoundsFromJoints(p.j4, true);
      if (!b) return;

      const thickness = Math.max(1, Number(p.thicknessMm || 6));
      const h = b.heightMm || Math.max(1, b.maxY - b.minY);

      // sideが未設定の場合は自動判定、設定されている場合はそれを使用
      let side = p.side;
      if (!side || side === "auto") {
        side = detectPanelSide(p.j4);
        p.side = side; // 判定結果を保存
      }

      let geo=null;
      const mat = getBoardMaterial(p.material || "足場板");
      const mesh = new THREE.Mesh(undefined, mat);

      // 調整後の境界の中心を計算
      const centerX = (b.minX + b.maxX) / 2;
      const centerY = (b.minY + b.maxY) / 2;
      const centerZ = (b.minZ + b.maxZ) / 2;

      if (side === "back") {
        // Z方向の壁（奥行方向）：Z座標がほぼ一定、X方向とY方向に広がる
        // widthMmはX方向のbeamの長さ（判定が逆になったが、ジオメトリは同じ）
        const w = b.widthMm || Math.max(1, b.maxX - b.minX);
        geo = new THREE.BoxGeometry(w, h, thickness);
        mesh.geometry = geo;
        mesh.position.set(centerX, centerY, centerZ);
      } else if (side === "side") {
        // X方向の壁（幅方向）：X座標がほぼ一定、Z方向とY方向に広がる
        // widthMmはZ方向のbeamの長さ（computeBoundsFromJointsで計算済み）
        const w = b.widthMm || Math.max(1, b.maxZ - b.minZ);
        if (w < 1 || h < 1) {
          console.warn("[rebuildPanels] Invalid panel size:", { w, h, side, b });
          return;
        }
        geo = new THREE.BoxGeometry(thickness, h, w);
        mesh.geometry = geo;
        mesh.position.set(centerX, centerY, centerZ);
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

  function rebuildBoards() {
    rebuildShelves();
    rebuildPanels();
  }
  window.rebuildBoards = rebuildBoards;
  
  // 外部からも使用できるように公開
  window.computeBoardBoundsFromJoints = computeBoundsFromJoints;

  // -----------------------------
  // 追加API（UI/マウスから呼ぶ）
  // -----------------------------
  window.addShelfByJoints4 = function(j4, opts = {}) {
    if (!Array.isArray(j4) || j4.length !== 4) return;
    
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
      j4: [...j4],
      thicknessMm: Number(opts.thicknessMm || 6),
      material: opts.material || "足場板",
      mesh: null,
      cellKey: cellKey, // 隣接判定用
    });
    rebuildShelves();
    window.requestEstimateRender?.("add shelf");
  };

  window.addPanelByJoints4 = function(j4, opts = {}) {
    if (!Array.isArray(j4) || j4.length !== 4) return;
    
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

  // マウス位置から4本のbeam/poleに囲まれた領域を検出
  function findNearbyJoints4(worldPos, maxDistance = 1500) {
    const joints = window.joints || [];
    const beams = window.beams || [];
    const poles = window.poles || [];
    
    if (joints.length < 4) return null;

    const boardKindToggle = document.getElementById("board-kind-toggle");
    const isPanel = boardKindToggle?.checked || false;
    
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
      // 棚板：同じY座標のジョイントを選ぶ
      const targetY = startJoint1.y;
      const keyFn = (j) => j.y;
      
      function addDirectConnections(jointIdx) {
        // Beamをチェック（棚板の場合）
        beams.forEach((b) => {
          if (!b) return;
          const other = b.a === jointIdx ? b.b : (b.b === jointIdx ? b.a : null);
          if (other != null) {
            const otherJoint = joints[other];
            if (otherJoint && Math.abs(keyFn(otherJoint) - targetY) < tolerance) {
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
      return;
    }
    if (window.rackGroup) {
      window.rackGroup.remove(previewBoardMesh);
    }
    disposeMesh(previewBoardMesh);
    previewBoardMesh = null;
    previewBoardJ4 = null;
    window.previewBoardJ4 = null;
  }
  window.hideBoardPreview = hideBoardPreview;

  // プレビューを表示
  function showBoardPreview(worldPos) {
    if (!window.isBoardModeOn) {
      hideBoardPreview();
      return;
    }

    const j4 = findNearbyJoints4(worldPos);
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
  }
  window.showBoardPreview = showBoardPreview;

  // プレビュー位置から板を追加
  window.addBoardFromPreview = function() {
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
