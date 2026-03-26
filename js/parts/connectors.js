// =========================================================
// コネクタ（ビーム・ポール）操作
// =========================================================

const connectorRadius = 6.5;
const connectorGeometry = new THREE.CylinderGeometry(
  connectorRadius,
  connectorRadius,
  1,
  16
);

// ビーム/ポール存在チェック
function hasBeamBetween(aIndex, bIndex) {
  return beams.some(
    (c) =>
      (c.a === aIndex && c.b === bIndex) ||
      (c.a === bIndex && c.b === aIndex)
  );
}

function hasPoleBetween(aIndex, bIndex) {
  return poles.some(
    (c) =>
      (c.a === aIndex && c.b === bIndex) ||
      (c.a === bIndex && c.b === aIndex)
  );
}

// 2つのジョイント index 間の距離（mm）を計算
function getDistanceMmBetweenJoints(aIndex, bIndex) {
  const aPos = joints[aIndex];
  const bPos = joints[bIndex];
  if (!aPos || !bPos) return 0;

  const va = new THREE.Vector3(aPos.x, aPos.y, aPos.z);
  const vb = new THREE.Vector3(bPos.x, bPos.y, bPos.z);
  return Math.round(va.distanceTo(vb));
}

// ビーム接続追加
function addBeamConnection(aIndex, bIndex) {
  const aPos = joints[aIndex];
  const bPos = joints[bIndex];
  if (!aPos || !bPos) return;

  // ===== DUP GUARD: same beam pair already exists =====
  if (typeof hasBeamBetween === "function") {
    if (hasBeamBetween(aIndex, bIndex)) return;
  } else {
    const exists = (Array.isArray(beams) ? beams : []).some((b) =>
      (b?.a === aIndex && b?.b === bIndex) || (b?.a === bIndex && b?.b === aIndex)
    );
    if (exists) return;
  }

  // 3D メッシュ生成
  const mesh = createCylinderBetween(aPos, bPos, beamMaterial);

  // 実距離（ジョイント間距離）
  const lengthMm = getDistanceMmBetweenJoints(aIndex, bIndex);

  // ===== オーダーモード判定（UI状態から一意に決める）=====
  const ui = (typeof getUI === "function") ? getUI() : null;
  const orderOn = !!window.isOrderModeOn;
  let customLength = null;

  if (orderOn && ui?.orderLengthInput) {
    const v = parseInt(String(ui.orderLengthInput.value || "").trim(), 10);
    if (Number.isFinite(v) && v > 0) customLength = v;
  }

  // 見た目の長さ（mm）
  const displayLen = (orderOn && customLength != null) ? customLength : lengthMm;

  // 見た目へ反映
  applyConnectorDisplayLength(mesh, displayLen);

  // 材種（確定値）
  const material = getCurrentMaterial();
  applyMaterialColorToMesh(mesh, material);

  // ★ Beam として beams に積む
  beams.push({
    type: "beam",
    a: aIndex,
    b: bIndex,
    mesh,
    lengthMm,
    material, // ★確定値を保存
    isCustom: orderOn && customLength != null,
    customLength: orderOn && customLength != null ? customLength : null,
  });
}

// ポール接続追加
function addPoleConnection(aIndex, bIndex) {
  const aPos = joints[aIndex];
  const bPos = joints[bIndex];
  if (!aPos || !bPos) return;

  // ===== DUP GUARD: same pole pair already exists =====
  if (typeof hasPoleBetween === "function") {
    if (hasPoleBetween(aIndex, bIndex)) return;
  } else {
    const exists = (Array.isArray(poles) ? poles : []).some((p) =>
      (p?.a === aIndex && p?.b === bIndex) || (p?.a === bIndex && p?.b === aIndex)
    );
    if (exists) return;
  }

  const mesh = createCylinderBetween(aPos, bPos, poleMaterial);
  const lengthMm = getDistanceMmBetweenJoints(aIndex, bIndex);

  const ui = (typeof getUI === "function") ? getUI() : null;
  const orderOn = !!window.isOrderModeOn;
  let customLength = null;

  if (orderOn && ui?.orderLengthInput) {
    const v = parseInt(String(ui.orderLengthInput.value || "").trim(), 10);
    if (Number.isFinite(v) && v > 0) customLength = v;
  }

  const displayLen = (orderOn && customLength != null) ? customLength : lengthMm;

  applyConnectorDisplayLength(mesh, displayLen);

  // 材種（確定値）
  const material = getCurrentMaterial();
  applyMaterialColorToMesh(mesh, material);

  poles.push({
    type: "pole",
    a: aIndex,
    b: bIndex,
    mesh,
    lengthMm,
    material, // ★確定値を保存
    isCustom: orderOn && customLength != null,
    customLength: orderOn && customLength != null ? customLength : null,
  });
}

// ビーム / ポールをメッシュから削除する共通関数
function deleteConnectorByMesh(hitObject) {
  if (!hitObject) return;

  // hitObject の親方向にたどって candidate と一致するか調べるヘルパー
  function isSameOrAncestor(candidate, obj) {
    let cur = obj;
    while (cur) {
      if (cur === candidate) return true;
      cur = cur.parent;
    }
    return false;
  }

  // ---- 1) ビームを探す ----
  let idx = beams.findIndex(
    (b) => b.mesh && isSameOrAncestor(b.mesh, hitObject)
  );
  if (idx >= 0) {
    const beam = beams[idx];
    if (beam.mesh) {
      // ★ ここを scene → rackGroup に変更
      rackGroup.remove(beam.mesh);
      beam.mesh.geometry.dispose();
      beam.mesh.material.dispose();
    }
    beams.splice(idx, 1);
    applyColorChartToAllConnectors?.();
    if (!__buildingAutoLayout) {
  requestEstimateRender("after autolayout");
}

    saveHistory("delete beam");
    return;
  }

  // ---- 2) ポールを探す ----
  idx = poles.findIndex(
    (p) => p.mesh && isSameOrAncestor(p.mesh, hitObject)
  );
  if (idx >= 0) {
    const pole = poles[idx];
    if (pole.mesh) {
      // ★ ここも scene → rackGroup に変更
      rackGroup.remove(pole.mesh);
      pole.mesh.geometry.dispose();
      pole.mesh.material.dispose();
    }
    poles.splice(idx, 1);
    applyColorChartToAllConnectors?.();
    if (!__buildingAutoLayout) {
  requestEstimateRender("after autolayout");
}

    saveHistory("delete pole");
    return;
  }

  // ここまで来たらビーム/ポールではなかった → 何もしない
}

// 磁石スナップ（近いときだけSTEPに吸着）
function snapMagnet(value, step, magnetRange) {
  const snapped = Math.round(value / step) * step;
  return (Math.abs(snapped - value) <= magnetRange) ? snapped : value;
}

// ジョイント間でコネクタを作成
function createConnectorBetweenJoints(aIndex, bIndex) {
  const a = joints?.[aIndex];
  const b = joints?.[bIndex];
  if (!a || !b) return false;

  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  const dz = (b.z ?? 0) - (a.z ?? 0);

  const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);

  // 斜め禁止（2軸以上に差分があるならNG）
  const nonZeroAxes = (adx > 0.5 ? 1 : 0) + (ady > 0.5 ? 1 : 0) + (adz > 0.5 ? 1 : 0);
  if (nonZeroAxes >= 2) {
    alert("斜めの接続はできません（X/Z または Y のみ）。");
    return false;
  }

  // Pole or Beam 判定
  const type = (ady > 0.5) ? "pole" : "beam";

  // ★ここが唯一"環境依存"なので、あなたの既存関数名に合わせる
  // まず createBeam / createPole がある前提で呼びます。
  try {
        if (type === "beam") {
      if (typeof addBeamConnection === "function") {
        // 現行：ジョイントIndex同士を接続するBeam追加
        addBeamConnection(aIndex, bIndex);
      } else if (typeof createBeam === "function") {
        createBeam({ a: aIndex, b: bIndex });
      } else if (typeof addBeam === "function") {
        addBeam(aIndex, bIndex);
      } else {
        console.warn("[connect] no beam creator found");
        alert("Beam生成関数が見つかりません（addBeamConnection/createBeam/addBeam）。");
        return false;
      }

    } else {
      if (typeof createPole === "function") {
        createPole({ a: aIndex, b: bIndex });
      } else if (typeof addPole === "function") {
        addPole(aIndex, bIndex);
      } else {
        console.warn("[connect] no pole creator found");
        alert("Pole生成関数が見つかりません（createPole/addPole）。");
        return false;
      }
    }
  } catch (e) {
    console.error("[connect] create failed:", e);
    alert("接続生成に失敗しました。コンソールを確認してください。");
    return false;
  }

  // 生成後にシーン再構築が必要な実装なら、ここで呼ぶ
  // ※ 既存の createBeam/createPole がmeshまで作るなら不要
  if (typeof rebuildSceneFromData === "function") {
    rebuildSceneFromData();
  }

  return true;
}

// =========================================================
// FIX: window.addBeamConnection / window.addPoleConnection の参照ズレ補正
// - hot reload や過去パッチで window 側が入れ替わる事故を強制的に潰す
// =========================================================
(function fixConnectorFunctionBindings() {
  try {
    // ここで参照がズレていると「Beamを追加したのにPoleが増える」になる
    if (typeof addBeamConnection === "function") {
      window.addBeamConnection = addBeamConnection;
    }
    if (typeof addPoleConnection === "function") {
      window.addPoleConnection = addPoleConnection;
    }
  } catch (e) {
    console.warn("[material] fixConnectorFunctionBindings failed", e);
  }
})();

// グローバルに公開
window.hasBeamBetween = hasBeamBetween;
window.hasPoleBetween = hasPoleBetween;
window.getDistanceMmBetweenJoints = getDistanceMmBetweenJoints;
window.addBeamConnection = addBeamConnection;
window.addPoleConnection = addPoleConnection;
window.deleteConnectorByMesh = deleteConnectorByMesh;
window.snapMagnet = snapMagnet;
window.createConnectorBetweenJoints = createConnectorBetweenJoints;
window.connectorRadius = connectorRadius;
window.connectorGeometry = connectorGeometry;
