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
  if (typeof window.actualJointDistanceMm === "function") {
    return window.actualJointDistanceMm(aPos, bPos);
  }
  return va.distanceTo(vb);
}

function poleSkuFromCad(dist) {
  if (typeof window.getPoleSkuFromCadMm === "function") return window.getPoleSkuFromCadMm(dist);
  return dist;
}

function syncDesignLengthFromJoints() {
  const js = window.joints || joints;
  const beamPresets = window.BEAM_LENGTH_OPTIONS || [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
  const polePresets = window.POLE_LENGTH_OPTIONS || [50, 100, 200, 300, 400, 500, 600, 800];
  function one(item, presets, asPole) {
    if (!item) return;
    const dist = getDistanceMmBetweenJoints(item.a, item.b);
    if (!(dist > 0)) return;
    const sku = asPole ? poleSkuFromCad(dist) : dist;
    item.lengthMm = sku;
    if (typeof window.isPresetLengthMm === "function" && window.isPresetLengthMm(sku, presets)) {
      item.isCustom = false;
      item.customLength = null;
    } else {
      item.isCustom = true;
      item.customLength = sku;
    }
  }
  (window.beams || beams || []).forEach(function (b) { one(b, beamPresets, false); });
  (window.poles || poles || []).forEach(function (p) { one(p, polePresets, true); });
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

  if (typeof window.v3WorkLayers?.canConnectJoints === "function" && !window.v3WorkLayers.canConnectJoints(aIndex, bIndex)) {
    console.warn("[work-layers] refused cross-layer beam");
    return;
  }
  if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditJoint === "function" && (!window.v3WorkLayers.canEditJoint(aIndex) || !window.v3WorkLayers.canEditJoint(bIndex))) {
    console.warn("[work-layers] refused beam edit");
    return;
  }

  const lengthMm = getDistanceMmBetweenJoints(aIndex, bIndex);
  const material = getCurrentMaterial();

  // ===== オーダーモード判定（UI状態から一意に決める）=====
  const ui = (typeof getUI === "function") ? getUI() : null;
  const orderOn = !!window.isOrderModeOn;
  let customLength = null;

  if (orderOn && ui?.orderLengthInput) {
    const parsed = (typeof window.parseLengthMm === "function")
      ? window.parseLengthMm(ui.orderLengthInput.value)
      : Number(String(ui.orderLengthInput.value || "").trim());
    if (Number.isFinite(parsed) && parsed > 0) customLength = parsed;
  }

  const displayLen = (orderOn && customLength != null) ? customLength : lengthMm;
  if (window.v3BsStock && typeof window.v3BsStock.gateConnectorAdd === "function") {
    const gate = window.v3BsStock.gateConnectorAdd("beam", displayLen, material);
    if (!gate || gate.ok === false) return;
  }

  // 3D メッシュは Joint 間の実距離が正本（rebuildSceneFromData と同じ）
  const mesh = createCylinderBetween(aPos, bPos, beamMaterial);
  if (mesh && typeof updateConnectorMesh === "function") updateConnectorMesh(mesh, aPos, bPos);
  applyMaterialColorToMesh(mesh, material);

  // V3 Phase 1: 安定ID (id / aId / bId) を併記する。インデックス参照は維持。
  const _newBeamId = (typeof window.newBeamClientId === "function") ? window.newBeamClientId() : null;
  const _aIdForBeam = (joints[aIndex] && typeof joints[aIndex].id === "string") ? joints[aIndex].id : null;
  const _bIdForBeam = (joints[bIndex] && typeof joints[bIndex].id === "string") ? joints[bIndex].id : null;

  const beamPresets = window.BEAM_LENGTH_OPTIONS || [];
  const beamIsPreset = (typeof window.isPresetLengthMm === "function")
    ? window.isPresetLengthMm(lengthMm, beamPresets)
    : beamPresets.indexOf(lengthMm) >= 0;
  beams.push({
    id: _newBeamId,
    type: "beam",
    a: aIndex,
    b: bIndex,
    aId: _aIdForBeam,
    bId: _bIdForBeam,
    mesh,
    lengthMm,
    material, // ★確定値を保存
    isCustom: !beamIsPreset,
    customLength: beamIsPreset ? null : lengthMm,
  });
  try { window.v3WorkLayers?.syncRackIds?.(); } catch (e) {}
  try { window.v3BsStock?.refreshUi?.(); } catch (e) {}
  try { window.v3StructuralAnalysis?.schedule?.("beam add"); } catch (e) {}
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

  if (typeof window.v3WorkLayers?.canConnectJoints === "function" && !window.v3WorkLayers.canConnectJoints(aIndex, bIndex)) {
    console.warn("[work-layers] refused cross-layer pole");
    return;
  }
  if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditJoint === "function" && (!window.v3WorkLayers.canEditJoint(aIndex) || !window.v3WorkLayers.canEditJoint(bIndex))) {
    console.warn("[work-layers] refused pole edit");
    return;
  }

  const cadLen = getDistanceMmBetweenJoints(aIndex, bIndex);
  const lengthMm = poleSkuFromCad(cadLen);
  const material = getCurrentMaterial();

  const ui = (typeof getUI === "function") ? getUI() : null;
  const orderOn = !!window.isOrderModeOn;
  let customLength = null;

  if (orderOn && ui?.orderLengthInput) {
    const parsed = (typeof window.parseLengthMm === "function")
      ? window.parseLengthMm(ui.orderLengthInput.value)
      : Number(String(ui.orderLengthInput.value || "").trim());
    if (Number.isFinite(parsed) && parsed > 0) customLength = parsed;
  }

  const displayLen = (orderOn && customLength != null) ? customLength : lengthMm;
  if (window.v3BsStock && typeof window.v3BsStock.gateConnectorAdd === "function") {
    const gate = window.v3BsStock.gateConnectorAdd("pole", displayLen, material);
    if (!gate || gate.ok === false) return;
  }

  const mesh = createCylinderBetween(aPos, bPos, poleMaterial);
  if (mesh && typeof updateConnectorMesh === "function") updateConnectorMesh(mesh, aPos, bPos);
  applyMaterialColorToMesh(mesh, material);

  // V3 Phase 1: 安定ID (id / aId / bId) を併記する。インデックス参照は維持。
  const _newPoleId = (typeof window.newPoleClientId === "function") ? window.newPoleClientId() : null;
  const _aIdForPole = (joints[aIndex] && typeof joints[aIndex].id === "string") ? joints[aIndex].id : null;
  const _bIdForPole = (joints[bIndex] && typeof joints[bIndex].id === "string") ? joints[bIndex].id : null;

  const polePresets = window.POLE_LENGTH_OPTIONS || [];
  const poleIsPreset = (typeof window.isPresetLengthMm === "function")
    ? window.isPresetLengthMm(lengthMm, polePresets)
    : polePresets.indexOf(lengthMm) >= 0;
  poles.push({
    id: _newPoleId,
    type: "pole",
    a: aIndex,
    b: bIndex,
    aId: _aIdForPole,
    bId: _bIdForPole,
    mesh,
    lengthMm,
    material, // ★確定値を保存
    isCustom: !poleIsPreset,
    customLength: poleIsPreset ? null : lengthMm,
  });
  try { window.v3WorkLayers?.syncRackIds?.(); } catch (e) {}
  try { window.v3BsStock?.refreshUi?.(); } catch (e) {}
  try { window.v3StructuralAnalysis?.schedule?.("pole add"); } catch (e) {}
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
    if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditJoint === "function" && (!window.v3WorkLayers.canEditJoint(beam.a) || !window.v3WorkLayers.canEditJoint(beam.b))) {
      console.warn("[work-layers] refused beam delete");
      return;
    }
    if (typeof disposeBeamMesh === "function") {
      disposeBeamMesh(beam);
    } else if (beam.mesh) {
      rackGroup.remove(beam.mesh);
      if (beam.mesh.geometry && !(beam.mesh.geometry.userData && beam.mesh.geometry.userData.v3Shared)) {
        beam.mesh.geometry.dispose();
      }
      if (beam.mesh.material && beam.mesh.material.dispose) beam.mesh.material.dispose();
    }
    beams.splice(idx, 1);
    try { window.v3WorkLayers?.syncRackIds?.(); } catch (e) {}
    applyColorChartToAllConnectors?.();
    if (!__buildingAutoLayout) {
  requestEstimateRender("after autolayout");
}

    saveHistory("delete beam");
    try { window.v3StructuralAnalysis?.schedule?.("beam delete"); } catch (e) {}
    return;
  }

  // ---- 2) ポールを探す ----
  idx = poles.findIndex(
    (p) => p.mesh && isSameOrAncestor(p.mesh, hitObject)
  );
  if (idx >= 0) {
    const pole = poles[idx];
    if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditJoint === "function" && (!window.v3WorkLayers.canEditJoint(pole.a) || !window.v3WorkLayers.canEditJoint(pole.b))) {
      console.warn("[work-layers] refused pole delete");
      return;
    }
    if (typeof disposePoleMesh === "function") {
      disposePoleMesh(pole);
    } else if (pole.mesh) {
      rackGroup.remove(pole.mesh);
      if (pole.mesh.geometry && !(pole.mesh.geometry.userData && pole.mesh.geometry.userData.v3Shared)) {
        pole.mesh.geometry.dispose();
      }
      if (pole.mesh.material && pole.mesh.material.dispose) pole.mesh.material.dispose();
    }
    poles.splice(idx, 1);
    try { window.v3WorkLayers?.syncRackIds?.(); } catch (e) {}
    applyColorChartToAllConnectors?.();
    if (!__buildingAutoLayout) {
  requestEstimateRender("after autolayout");
}

    saveHistory("delete pole");
    try { window.v3StructuralAnalysis?.schedule?.("pole delete"); } catch (e) {}
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
window.syncDesignLengthFromJoints = syncDesignLengthFromJoints;
window.addBeamConnection = addBeamConnection;
window.addPoleConnection = addPoleConnection;
window.deleteConnectorByMesh = deleteConnectorByMesh;
window.snapMagnet = snapMagnet;
window.createConnectorBetweenJoints = createConnectorBetweenJoints;
window.connectorRadius = connectorRadius;
window.connectorGeometry = connectorGeometry;
