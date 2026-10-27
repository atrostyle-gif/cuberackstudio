// =========================================================
// メッシュ生成 / 破棄ヘルパー
// =========================================================

function createCylinderBetween(aPos, bPos, material, kind) {
  const start = new THREE.Vector3(aPos.x, aPos.y, aPos.z);
  const end   = new THREE.Vector3(bPos.x, bPos.y, bPos.z);

  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len === 0) return null;

  const type = kind === "pole" ? "pole" : (kind === "beam" ? "beam" : (material === window.poleMaterial ? "pole" : "beam"));
  const pool = window.v3InstancePool;
  if (pool && pool.enabled && typeof pool.createConnector === "function") {
    const mesh = pool.createConnector(type, material, window.getCurrentMaterial ? window.getCurrentMaterial() : "IRON");
    mesh.userData.baseLengthMm = 1;
    if (typeof window.updateConnectorMesh === "function") window.updateConnectorMesh(mesh, aPos, bPos);
    else {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      mesh.scale.set(1, len, 1);
    }
    pool.note();
    return mesh;
  }

  const geom = window.connectorGeometry || new THREE.CylinderGeometry(4, 4, 1, 12);
  const mesh = new THREE.Mesh(geom, material.clone());
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  mesh.userData.baseLengthMm = geom.parameters && geom.parameters.height ? geom.parameters.height : 1;
  const sx = mesh.scale.x, sz = mesh.scale.z;
  mesh.scale.set(sx, len / mesh.userData.baseLengthMm, sz);
  rackGroup.add(mesh);
  return mesh;
}

// =========================================================
// 長さ適用（共通）
//  - Cylinder が「ローカルYが長手」前提
//  - createCylinderBetween は「向きと位置」を作る
//  - この関数は「見た目の長さ（mm）」を確実に反映する
// =========================================================
function applyConnectorDisplayLength(mesh, displayLengthMm) {
  if (!mesh || !mesh.geometry) return;

  const L = Number(displayLengthMm);
  if (!Number.isFinite(L) || L <= 0) return;

  // 基準長：createCylinderBetween が固定長で作った baseLen を使う
  let baseLen = mesh.userData?.baseLengthMm;

  // 無い場合は geometry.height を拾う（保険）
  if (!baseLen) {
    baseLen = mesh.geometry?.parameters?.height;
    if (!Number.isFinite(baseLen) || baseLen <= 0) baseLen = 200;
    mesh.userData.baseLengthMm = baseLen;
  }

  // ★重要：太さは保持、長さはYだけ変更
  const sx = mesh.scale?.x ?? 1;
  const sz = mesh.scale?.z ?? 1;

  mesh.scale.set(sx, L / baseLen, sz);

  // Three.js の更新ヒント（不要なことも多いが安全）
  mesh.updateMatrixWorld?.(true);
}

// =========================================================
// コネクタの「太さ」だけ変更（長さ scale.y は絶対に保持）
// =========================================================
function setConnectorThicknessPreserveLength(mesh, sx = 1, sz = 1) {
  if (!mesh) return;
  const y = mesh.scale?.y ?? 1;
  mesh.scale.set(Number(sx) || 1, y, Number(sz) || 1);
}

// ジョイントメッシュ破棄
function disposeSharedSafe(obj) {
  if (!obj) return;
  if (window.v3InstancePool && typeof window.v3InstancePool.disposeHandle === "function") {
    if (obj.userData && (obj.userData.v3Instanced || obj.userData.v3Unique || obj.userData.v3InstancedLeg)) {
      window.v3InstancePool.disposeHandle(obj);
      return;
    }
  }
  if (obj.geometry && !(obj.geometry.userData && obj.geometry.userData.v3Shared) && obj.geometry !== window.jointGeometry && obj.geometry !== window.connectorGeometry) {
    obj.geometry.dispose();
  }
  if (obj.material && obj.material.dispose) obj.material.dispose();
  if (obj.parent) obj.parent.remove(obj);
}

function disposeJointMeshByIndex(idx) {
  const m = jointMeshes[idx];
  if (!m) return;
  disposeSharedSafe(m);
  jointMeshes[idx] = null;
}

// ビームメッシュ破棄
function disposeBeamMesh(beam) {
  if (!beam || !beam.mesh) return;
  disposeSharedSafe(beam.mesh);
  beam.mesh = null;
}

// ポールメッシュ破棄
function disposePoleMesh(pole) {
  if (!pole || !pole.mesh) return;
  disposeSharedSafe(pole.mesh);
  pole.mesh = null;
}

// 脚メッシュ破棄
function disposeLegMesh(leg) {
  if (!leg || !leg.mesh) return;
  if (window.v3InstancePool && typeof window.v3InstancePool.disposeHandle === "function" && leg.mesh.userData && leg.mesh.userData.v3InstancedLeg) {
    window.v3InstancePool.disposeHandle(leg.mesh);
    leg.mesh = null;
    return;
  }
  if (leg.mesh.traverse) {
    leg.mesh.traverse(function (child) {
      if (!child || !child.isMesh) return;
      if (child.geometry && !(child.geometry.userData && child.geometry.userData.v3Shared)) child.geometry.dispose();
      if (child.material && child.material.dispose) child.material.dispose();
    });
  } else {
    disposeSharedSafe(leg.mesh);
  }
  if (leg.mesh.parent) leg.mesh.parent.remove(leg.mesh);
  leg.mesh = null;
}

// メッシュを親から外すだけの簡易削除
function removeMeshFromParent(mesh) {
  if (!mesh) return;
  const parent = mesh.parent;
  if (parent) {
    parent.remove(mesh);
  }
}

// 全メッシュをクリア
function clearAllMeshes() {
  if (window.v3InstancePool && typeof window.v3InstancePool.clear === "function") {
    window.v3InstancePool.clear();
  }
  jointMeshes.forEach((m) => rackGroup.remove(m));
  jointMeshes.length = 0;

  beams.forEach((b) => {
    if (b.mesh) rackGroup.remove(b.mesh);
    b.mesh = null;
  });

  poles.forEach((p) => {
    if (p.mesh) rackGroup.remove(p.mesh);
    p.mesh = null;
  });

  legs.forEach((l) => {
    if (l.mesh) rackGroup.remove(l.mesh);
    l.mesh = null;
  });

  // 板のメッシュも削除
  if (window.shelves) {
    window.shelves.forEach((s) => {
      if (s.mesh) {
        try {
          rackGroup.remove(s.mesh);
          s.mesh.geometry?.dispose?.();
          s.mesh.material?.dispose?.();
        } catch (e) {
          console.warn("[clearAllMeshes] failed to remove shelf mesh", e);
        }
        s.mesh = null;
      }
    });
  }

  if (window.panels) {
    window.panels.forEach((p) => {
      if (p.mesh) {
        try {
          rackGroup.remove(p.mesh);
          p.mesh.geometry?.dispose?.();
          p.mesh.material?.dispose?.();
        } catch (e) {
          console.warn("[clearAllMeshes] failed to remove panel mesh", e);
        }
        p.mesh = null;
      }
    });
  }
}

// グローバルに公開
window.createCylinderBetween = createCylinderBetween;
window.applyConnectorDisplayLength = applyConnectorDisplayLength;
window.setConnectorThicknessPreserveLength = setConnectorThicknessPreserveLength;
window.disposeJointMeshByIndex = disposeJointMeshByIndex;
window.disposeBeamMesh = disposeBeamMesh;
window.disposePoleMesh = disposePoleMesh;
window.disposeLegMesh = disposeLegMesh;
window.removeMeshFromParent = removeMeshFromParent;
window.clearAllMeshes = clearAllMeshes;