// =========================================================
// 脚操作
// =========================================================

const LEG_BASE_R = 12.5;
const LEG_BASE_H = 5;
const LEG_CONE_H = 7.9;
const LEG_CONE_R_TOP = 7.5;
const LEG_TOTAL_HEIGHT = LEG_BASE_H + LEG_CONE_H;

function verticalJbHalfMm() {
  if (typeof window.getVerticalJbHalfMm === "function") {
    const n = Number(window.getVerticalJbHalfMm());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 9.1;
}

const legBaseGeometry = new THREE.CylinderGeometry(
  LEG_BASE_R,
  LEG_BASE_R,
  LEG_BASE_H,
  48
);
const legConeGeometry = new THREE.CylinderGeometry(
  LEG_CONE_R_TOP,
  LEG_BASE_R,
  LEG_CONE_H,
  48
);

// 脚メッシュ破棄（InstancedMesh ハンドルもプールから外す）
function disposeLegMesh(leg) {
  if (!leg || !leg.mesh) return;
  if (window.v3InstancePool && typeof window.v3InstancePool.disposeHandle === "function"
      && leg.mesh.userData && leg.mesh.userData.v3InstancedLeg) {
    window.v3InstancePool.disposeHandle(leg.mesh);
    if (leg.mesh.parent) leg.mesh.parent.remove(leg.mesh);
    leg.mesh = null;
    return;
  }
  leg.mesh.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry && !(child.geometry.userData && child.geometry.userData.v3Shared)) child.geometry.dispose();
      if (child.material && child.material.dispose) child.material.dispose();
    }
  });
  if (leg.mesh.parent) leg.mesh.parent.remove(leg.mesh);
  else if (typeof rackGroup !== "undefined" && rackGroup) rackGroup.remove(leg.mesh);
  leg.mesh = null;
}

// 脚メッシュ作成
function createLegMeshForJointIndex(jointIndex) {
  const j = joints[jointIndex];
  if (!j) return null;

  const group = new THREE.Group();

  const base = new THREE.Mesh(legBaseGeometry, legMaterial.clone());
  base.position.y = -LEG_TOTAL_HEIGHT / 2 + LEG_BASE_H / 2;
  group.add(base);

  const cone = new THREE.Mesh(legConeGeometry, legMaterial.clone());
  cone.position.y = base.position.y + LEG_BASE_H / 2 + LEG_CONE_H / 2;
  group.add(cone);

  const offsetY = LEG_TOTAL_HEIGHT / 2 + verticalJbHalfMm();
  group.position.set(j.x, j.y - offsetY, j.z);
  group.userData = {
    type: "leg",
    jointIndex: jointIndex,
    jointId: (j && typeof j.id === "string") ? j.id : null,
  };

  if (window.v3InstancePool && window.v3InstancePool.enabled && typeof window.v3InstancePool.registerLeg === "function") {
    window.v3InstancePool.registerLeg(group);
    return group;
  }
  rackGroup.add(group);
  return group;
}

// Leg の接続先 Joint を jointId 優先、なければ jointIndex で解決する。
// 長さ変更は Joint を付け替えず座標だけ動かすので、ID を維持したまま index を揃える。
function resolveLegJointIndex(leg) {
  if (!leg) return -1;
  if (typeof leg.jointId === "string" && leg.jointId) {
    const byId = joints.findIndex((j) => j && j.id === leg.jointId);
    if (byId >= 0) {
      if (leg.jointIndex !== byId) leg.jointIndex = byId;
      return byId;
    }
  }
  if (typeof leg.jointIndex === "number" && joints[leg.jointIndex]) {
    const j = joints[leg.jointIndex];
    if (!leg.jointId && j && typeof j.id === "string") leg.jointId = j.id;
    return leg.jointIndex;
  }
  return -1;
}

function getLegMeshBounds(leg) {
  if (!leg) return null;
  const mesh = leg.mesh;
  let x;
  let y;
  let z;
  if (mesh && mesh.position) {
    x = Number(mesh.position.x) || 0;
    y = Number(mesh.position.y) || 0;
    z = Number(mesh.position.z) || 0;
  } else {
    const idx = typeof resolveLegJointIndex === "function" ? resolveLegJointIndex(leg) : (typeof leg.jointIndex === "number" ? leg.jointIndex : -1);
    const j = (typeof joints !== "undefined" && joints) ? joints[idx] : null;
    if (!j) return null;
    x = Number(j.x) || 0;
    y = (Number(j.y) || 0) - (LEG_TOTAL_HEIGHT / 2 + verticalJbHalfMm());
    z = Number(j.z) || 0;
  }
  const half = LEG_TOTAL_HEIGHT / 2;
  const r = LEG_BASE_R;
  return {
    minX: x - r,
    maxX: x + r,
    minY: y - half,
    maxY: y + half,
    minZ: z - r,
    maxZ: z + r,
    cx: x,
    cy: y,
    cz: z,
  };
}

function placeLegMeshAtJoint(leg, jointIndex) {
  if (!leg || !leg.mesh) return;
  const j = joints[jointIndex];
  if (!j) return;
  const offsetY = LEG_TOTAL_HEIGHT / 2 + verticalJbHalfMm();
  leg.mesh.position.set(j.x, j.y - offsetY, j.z);
  if (!leg.mesh.userData) leg.mesh.userData = {};
  leg.mesh.userData.type = "leg";
  leg.mesh.userData.jointIndex = jointIndex;
  if (leg.jointId) leg.mesh.userData.jointId = leg.jointId;
}

// 脚メッシュ位置更新（接続先 Joint の現在座標へ追従。新規生成しない）
function updateLegMeshPosition(jointIndex) {
  const j = joints[jointIndex];
  const leg = legs.find((l) => {
    if (!l) return false;
    if (typeof l.jointIndex === "number" && l.jointIndex === jointIndex) return true;
    return !!(j && l.jointId && j.id === l.jointId);
  });
  if (!leg) return;
  const idx = resolveLegJointIndex(leg);
  if (idx < 0) return;
  placeLegMeshAtJoint(leg, idx);
}

// 全 Leg を接続先 Joint へ同期する。ON/OFF や重複生成はしない。
function syncLegsToConnectedJoints() {
  if (!Array.isArray(legs)) return;
  for (let i = 0; i < legs.length; i++) {
    const idx = resolveLegJointIndex(legs[i]);
    if (idx < 0) continue;
    placeLegMeshAtJoint(legs[i], idx);
  }
}

// Joint 統合前: jointId 優先で旧 index を解決し、同じ生存 Joint の Leg は1本に統合する。
// dropSet の Joint 側より、残す側の Leg を優先する。jointId はここでは書き換えない。
function remapLegsForJointIndexMap(indexMap, dropSet) {
  if (!Array.isArray(legs) || !Array.isArray(indexMap)) return;
  dropSet = dropSet || {};
  const winner = Object.create(null);
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg) continue;
    let oldIdx = -1;
    if (typeof leg.jointId === "string" && leg.jointId) {
      oldIdx = joints.findIndex((j) => j && j.id === leg.jointId);
    }
    if (oldIdx < 0 && typeof leg.jointIndex === "number") oldIdx = leg.jointIndex;
    const mapped = (typeof oldIdx === "number" && oldIdx >= 0) ? indexMap[oldIdx] : -1;
    if (typeof mapped !== "number" || mapped < 0) continue;
    const keepSource = !dropSet[oldIdx];
    const prev = winner[mapped];
    if (!prev || (keepSource && !prev.keepSource)) {
      winner[mapped] = { leg: leg, keepSource: keepSource };
    }
  }
  const keepSet = new Set();
  Object.keys(winner).forEach((m) => { keepSet.add(winner[m].leg); });
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i];
    if (!leg || !keepSet.has(leg)) {
      if (leg) disposeLegMesh(leg);
      legs.splice(i, 1);
    }
  }
  Object.keys(winner).forEach((m) => {
    winner[m].leg.jointIndex = Number(m);
  });
}

// Joint splice 後: 生存 Joint の id に jointId を揃え、メッシュをその座標へ置く。
function syncLegConnectionsAfterJointPack() {
  if (!Array.isArray(legs)) return;
  const seen = Object.create(null);
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i];
    const idx = resolveLegJointIndex(leg);
    if (idx < 0 || seen[idx]) {
      if (leg) disposeLegMesh(leg);
      legs.splice(i, 1);
      continue;
    }
    seen[idx] = true;
    const j = joints[idx];
    if (j && typeof j.id === "string") leg.jointId = j.id;
    leg.jointIndex = idx;
    if (!leg.mesh) {
      const mesh = createLegMeshForJointIndex(idx);
      if (mesh) {
        if (typeof applyMaterialColorToMesh === "function") {
          applyMaterialColorToMesh(mesh, normalizeMaterial(leg.material));
        }
        leg.mesh = mesh;
      }
    } else {
      if (leg.mesh.visible === false) leg.mesh.visible = true;
      placeLegMeshAtJoint(leg, idx);
    }
  }
  const manual = new Set();
  legs.forEach((leg) => {
    if (leg && typeof leg.jointIndex === "number") manual.add(leg.jointIndex);
  });
  window.manualLegJointSet = manual;
}

// 底ジョイント判定
function isBottomJoint(jointIndex) {
  const j = joints[jointIndex];
  if (!j) return false;
  return Math.abs(j.y) < 1e-3;
}

// 脚の存在チェック（jointId 優先、なければ jointIndex）
function hasLegAtJoint(jointIndex) {
  const j = joints[jointIndex];
  return legs.some((l) => {
    if (!l) return false;
    if (j && l.jointId && j.id === l.jointId) return true;
    return typeof l.jointIndex === "number" && l.jointIndex === jointIndex;
  });
}

// 脚を追加（必要に応じて）
function addLegIfNeeded(jointIndex) {
  const j = joints[jointIndex];
  if (!j) return;

  if (!isBottomJoint(jointIndex)) return;
  if (hasLegAtJoint(jointIndex)) return;

  // ---- Material（材種）: 原則ジョイントの材種を引き継ぐ（無ければIRON）----
  const material = normalizeMaterial(j.material);

  const mesh = createLegMeshForJointIndex(jointIndex);

  // ★材種色を適用（ベース色）
  applyMaterialColorToMesh(mesh, material);

  // V3 Phase 1: 安定ID (id / jointId) を併記する。jointIndex も引き続き保持。
  const _newLegId = (typeof window.newLegClientId === "function") ? window.newLegClientId() : null;
  const _jointIdForLeg = (joints[jointIndex] && typeof joints[jointIndex].id === "string")
    ? joints[jointIndex].id
    : null;

  legs.push({ id: _newLegId, jointIndex, jointId: _jointIdForLeg, material, mesh });

  syncLegCountInput();
  window.requestEstimateRender?.("after add leg");
}

// 脚プレビュー非表示
function hideLegPreview() {
    if (!window.previewLegMesh) return;
  rackGroup.remove(window.previewLegMesh);   // ★
  window.previewLegMesh.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      child.material.dispose();
    }
  });
  window.previewLegMesh = null;
  window.previewLegJointIndex = null;
}

// 脚プレビュー表示
function showLegPreview(jointIndex) {
  const j = joints[jointIndex];
  if (!j || !isBottomJoint(jointIndex)) {
    hideLegPreview();
    return;
  }

  if (window.previewLegMesh && window.previewLegJointIndex === jointIndex) return;

  hideLegPreview();

  const group = new THREE.Group();

  const baseMat = legMaterial.clone();
  baseMat.transparent = true;
  baseMat.opacity = 0.4;
  const coneMat = legMaterial.clone();
  coneMat.transparent = true;
  coneMat.opacity = 0.4;

  const base = new THREE.Mesh(legBaseGeometry, baseMat);
  base.position.y = -LEG_TOTAL_HEIGHT / 2 + LEG_BASE_H / 2;
  group.add(base);

  const cone = new THREE.Mesh(legConeGeometry, coneMat);
  cone.position.y = base.position.y + LEG_BASE_H / 2 + LEG_CONE_H / 2;
  group.add(cone);

  const offsetY = LEG_TOTAL_HEIGHT / 2 + verticalJbHalfMm();
    group.position.set(j.x, j.y - offsetY, j.z);

  rackGroup.add(group);              // ★
  window.previewLegMesh = group;

  window.previewLegJointIndex = jointIndex;
}

// 脚のON/OFF切り替え
function toggleLegForJoint(jointIndex) {
  if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditJoint === "function" && !window.v3WorkLayers.canEditJoint(jointIndex)) {
    console.warn("[work-layers] refused leg toggle");
    return false;
  }

  const j = joints[jointIndex];
  if (!j) return false;

  const idx = legs.findIndex((l) => {
    if (!l) return false;
    if (j && l.jointId && j.id === l.jointId) return true;
    return typeof l.jointIndex === "number" && l.jointIndex === jointIndex;
  });
  const had = idx !== -1;
  if (!had && !isBottomJoint(jointIndex)) return false;

  if (had) {
    const leg = legs[idx];
    disposeLegMesh(leg);
    legs.splice(idx, 1);
    try { window.manualLegJointSet && window.manualLegJointSet.delete(jointIndex); } catch (e) {}
  } else {
    addLegIfNeeded(jointIndex);
    try { window.manualLegJointSet && window.manualLegJointSet.add(jointIndex); } catch (e) {}
  }

  // 変更後に履歴を積む（同一スナップショット比較のスキップを避ける）
  if (typeof saveHistory === "function") saveHistory("toggle leg");
  else if (typeof window.saveHistory === "function") window.saveHistory("toggle leg");
  syncLegCountInput();
  window.requestEstimateRender?.("after toggle leg");
  return true;
}

function tryToggleLegAtClient(clientX, clientY, radiusPx) {
  const idx = (typeof pickJointIndexByClientPos === "function")
    ? pickJointIndexByClientPos(clientX, clientY, radiusPx || 28)
    : -1;
  if (typeof idx !== "number" || idx < 0) return false;
  toggleLegForJoint(idx);
  if (typeof hidePreview === "function") hidePreview();
  if (typeof hideLegPreview === "function") hideLegPreview();
  return true;
}

// グローバルに公開
window.LEG_BASE_R = LEG_BASE_R;
window.LEG_BASE_H = LEG_BASE_H;
window.LEG_CONE_H = LEG_CONE_H;
window.LEG_CONE_R_TOP = LEG_CONE_R_TOP;
window.LEG_TOTAL_HEIGHT = LEG_TOTAL_HEIGHT;
window.legBaseGeometry = legBaseGeometry;
window.legConeGeometry = legConeGeometry;
window.disposeLegMesh = disposeLegMesh;
window.createLegMeshForJointIndex = createLegMeshForJointIndex;
window.getLegMeshBounds = getLegMeshBounds;
window.resolveLegJointIndex = resolveLegJointIndex;
window.updateLegMeshPosition = updateLegMeshPosition;
window.syncLegsToConnectedJoints = syncLegsToConnectedJoints;
window.remapLegsForJointIndexMap = remapLegsForJointIndexMap;
window.syncLegConnectionsAfterJointPack = syncLegConnectionsAfterJointPack;
window.isBottomJoint = isBottomJoint;
window.hasLegAtJoint = hasLegAtJoint;
window.addLegIfNeeded = addLegIfNeeded;
window.hideLegPreview = hideLegPreview;
window.showLegPreview = showLegPreview;
window.toggleLegForJoint = toggleLegForJoint;
window.tryToggleLegAtClient = tryToggleLegAtClient;
