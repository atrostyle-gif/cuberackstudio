// =========================================================
// 脚操作
// =========================================================

const LEG_BASE_R = 12.5;
const LEG_BASE_H = 5;
const LEG_CONE_H = 7.5;
const LEG_CONE_R_TOP = 7.5;
const LEG_TOTAL_HEIGHT = LEG_BASE_H + LEG_CONE_H;

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

// 脚メッシュ破棄
function disposeLegMesh(leg) {
  if (!leg.mesh) return;
  leg.mesh.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      child.material.dispose();
    }
  });
  rackGroup.remove(leg.mesh);
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

  const offsetY = LEG_TOTAL_HEIGHT / 2 + jointRadius;
  group.position.set(j.x, j.y - offsetY, j.z);

  rackGroup.add(group);
  return group;
}

// 脚メッシュ位置更新
function updateLegMeshPosition(jointIndex) {
  const leg = legs.find((l) => l.jointIndex === jointIndex);
  if (leg && leg.mesh) {
    const j = joints[jointIndex];
    const offsetY = LEG_TOTAL_HEIGHT / 2 + jointRadius;
    leg.mesh.position.set(j.x, j.y - offsetY, j.z);
  }
}

// 底ジョイント判定
function isBottomJoint(jointIndex) {
  const j = joints[jointIndex];
  if (!j) return false;
  return Math.abs(j.y) < 1e-3;
}

// 脚の存在チェック
function hasLegAtJoint(jointIndex) {
  return legs.some((l) => l.jointIndex === jointIndex);
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

  legs.push({ jointIndex, material, mesh });

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

  const offsetY = LEG_TOTAL_HEIGHT / 2 + jointRadius;
    group.position.set(j.x, j.y - offsetY, j.z);

  rackGroup.add(group);              // ★
  window.previewLegMesh = group;

  window.previewLegJointIndex = jointIndex;
}

// 脚のON/OFF切り替え
function toggleLegForJoint(jointIndex) {
  // ★ 脚のON/OFFごとに履歴を分ける
  saveHistory();

  const j = joints[jointIndex];
  if (!j) return;
  if (!isBottomJoint(jointIndex)) return;

  const idx = legs.findIndex((l) => l.jointIndex === jointIndex);
  if (idx !== -1) {
    const leg = legs[idx];
    disposeLegMesh(leg);
    legs.splice(idx, 1);
  } else {
    addLegIfNeeded(jointIndex);
  }

  syncLegCountInput();
  window.requestEstimateRender?.("after toggle leg");

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
window.updateLegMeshPosition = updateLegMeshPosition;
window.isBottomJoint = isBottomJoint;
window.hasLegAtJoint = hasLegAtJoint;
window.addLegIfNeeded = addLegIfNeeded;
window.hideLegPreview = hideLegPreview;
window.showLegPreview = showLegPreview;
window.toggleLegForJoint = toggleLegForJoint;
