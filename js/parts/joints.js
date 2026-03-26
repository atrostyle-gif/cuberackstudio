// =========================================================
// ジョイント操作
// =========================================================

// ジョイント検索
function findJointIndexAt(pos) {
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (
      Math.abs(j.x - pos.x) < 1e-3 &&
      Math.abs(j.y - pos.y) < 1e-3 &&
      Math.abs(j.z - pos.z) < 1e-3
    ) {
      return i;
    }
  }
  return -1;
}

// ジョイント作成
function createJoint(pos) {
  const existing = findJointIndexAt(pos);
  if (existing !== -1) return existing;

  // ---- Material（材種）: A1（種類ごと一括）なので jointBall の材質を使う ----
  const material = getPartTypeMaterial("jointBall");

  joints.push({ x: pos.x, y: pos.y, z: pos.z }); // ★materialは保持しない（混乱回避）

  const mesh = new THREE.Mesh(jointGeometry, jointMaterialNormal.clone());
  mesh.position.set(pos.x, pos.y, pos.z);

  // ★材質色を適用（ベース色）
  applyMaterialColorToMesh(mesh, material);

  rackGroup.add(mesh);
  jointMeshes.push(mesh);

  // ★脚：ジョイント生成時に必ず付ける（idx未定義事故を避ける）
  try {
    const createdJointIndex = joints.length - 1; // push直後ならこれが確実
    if (createdJointIndex >= 0) addLegIfNeeded?.(createdJointIndex);
  } catch (e) {
    console.warn("[leg] addLegIfNeeded failed", e);
  }

  if (typeof requestEstimateRender === "function") requestEstimateRender("after autolayout");
  else if (typeof calcAndRenderEstimate === "function") calcAndRenderEstimate();

  return joints.length - 1;
}

// ジョイント選択
function setSelectedJoint(index) {
  // 以前選択されていたジョイントの見た目を戻す
  if (selectedJointIndex !== null && jointMeshes[selectedJointIndex]) {
    const prevMesh = jointMeshes[selectedJointIndex];

    // 選択表現だけ戻す（材質色は維持）
    const mats = Array.isArray(prevMesh.material) ? prevMesh.material : [prevMesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.emissive && typeof mat.emissive.setHex === "function") mat.emissive.setHex(0x000000);
      if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = 0;
      mat.needsUpdate = true;
    }

    // ★材質色を確実に再適用（JointSet材質適用モード中は最新の材質を使用）
    let baseMat;
    if (window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
      // JointSet材質適用モード中は、UIから最新の材質を取得
      const sel = document.getElementById("mat-jointSet");
      if (sel) {
        const normalizedMat = (typeof window.normalizeMaterial === "function" ? window.normalizeMaterial : normalizeMaterial)(sel.value || "IRON");
        baseMat = normalizedMat;
      } else {
        baseMat = (typeof getPartTypeMaterial === "function" ? getPartTypeMaterial("jointBall") : null) ||
                  joints?.[selectedJointIndex]?.material ||
                  "IRON";
      }
    } else {
      baseMat = (typeof getPartTypeMaterial === "function" ? getPartTypeMaterial("jointBall") : null) ||
                joints?.[selectedJointIndex]?.material ||
                "IRON";
    }
    applyMaterialColorToMesh(prevMesh, baseMat);
  }

  selectedJointIndex = index;
  window.__CR_ACTIVE_JOINT_INDEX__ = index;

  const infoEl = document.getElementById("selected-info");

  if (index === null) {
    if (infoEl) infoEl.textContent = "選択中のジョイント: なし";
    return;
  }

  const mesh = jointMeshes[index];
  const j = joints[index];

  // ★まず材質色を適用（JointSet材質適用モード中は最新の材質を使用）
  let baseMat;
  if (window.__CR_JOINTSET_MATERIAL_APPLY_MODE__) {
    // JointSet材質適用モード中は、UIから最新の材質を取得
    const sel = document.getElementById("mat-jointSet");
    if (sel) {
      const normalizedMat = (typeof window.normalizeMaterial === "function" ? window.normalizeMaterial : normalizeMaterial)(sel.value || "IRON");
      baseMat = normalizedMat;
    } else {
      baseMat = (typeof getPartTypeMaterial === "function" ? getPartTypeMaterial("jointBall") : null) ||
                j?.material ||
                "IRON";
    }
  } else {
    baseMat = (typeof getPartTypeMaterial === "function" ? getPartTypeMaterial("jointBall") : null) ||
              j?.material ||
              "IRON";
  }
  
  // applyMaterialColorToMeshを確実に呼び出す
  const applyMat = typeof window.applyMaterialColorToMesh === "function" 
    ? window.applyMaterialColorToMesh 
    : (typeof applyMaterialColorToMesh === "function" ? applyMaterialColorToMesh : null);
  
  if (applyMat) {
    applyMat(mesh, baseMat);
  } else if (typeof applyMaterialColorToMesh === "function") {
    applyMaterialColorToMesh(mesh, baseMat);
  }

  // ★選択表現（赤色の発光）：material差し替えではなく emissive で表現
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    if (mat.emissive && typeof mat.emissive.setHex === "function") mat.emissive.setHex(0xef4444);
    // emissiveIntensity がない material もあるので安全に
    if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = 1.2;
    mat.needsUpdate = true;
  }

  if (infoEl && j) {
    infoEl.textContent = `選択中のジョイント: #${index} (x=${j.x}, y=${j.y}, z=${j.z})`;
  }
}

// ジョイント削除
function deleteJoint(index) {
  saveHistory();

  // ビーム削除
  for (let i = beams.length - 1; i >= 0; i--) {
    if (beams[i].a === index || beams[i].b === index) {
       rackGroup.remove(beams[i].mesh);   // ★
      beams.splice(i, 1);
    }
  }

  // ポール削除
  for (let i = poles.length - 1; i >= 0; i--) {
    if (poles[i].a === index || poles[i].b === index) {
      rackGroup.remove(poles[i].mesh);
      poles.splice(i, 1);
    }
  }

  // 脚削除
  for (let i = legs.length - 1; i >= 0; i--) {
    if (legs[i].jointIndex === index) {
      disposeLegMesh(legs[i]);
      legs.splice(i, 1);
    }
  }

  // ジョイントメッシュ削除
  rackGroup.remove(jointMeshes[index]);
  jointMeshes.splice(index, 1);
  joints.splice(index, 1);

  // インデックス詰め替え
  function fixIndexInList(list) {
    list.forEach((item) => {
      if (item.a !== undefined && item.a > index) item.a--;
      if (item.b !== undefined && item.b > index) item.b--;
      if (item.jointIndex !== undefined && item.jointIndex > index) item.jointIndex--;
    });
  }
  fixIndexInList(beams);
  fixIndexInList(poles);
  fixIndexInList(legs);

  setSelectedJoint(null);
  rrequestEstimateRender("after delete joint");

  // 全部消えちゃったときは原点に1個だけ作り直す
  if (joints.length === 0) {
    const newIndex = createJoint({ x: 0, y: 0, z: 0 });
    setSelectedJoint(newIndex);
    addLegIfNeeded(newIndex);
    syncLegCountInput();
    if (!__buildingAutoLayout) {
  requestEstimateRender("after autolayout");
}

  }
}

// 指定ジョイントに繋がるコネクタのメッシュだけ更新
function updateConnectorsForJoint(jointIndex) {
  const j = joints[jointIndex];
  if (!j) return;

  beams.forEach((b) => {
    if (!b.mesh) return;
    if (b.a === jointIndex || b.b === jointIndex) {
      const aPos = joints[b.a];
      const bPos = joints[b.b];
      if (!aPos || !bPos) return;
      updateConnectorMesh(b.mesh, aPos, bPos);
    }
  });

  poles.forEach((p) => {
    if (!p.mesh) return;
    if (p.a === jointIndex || p.b === jointIndex) {
      const aPos = joints[p.a];
      const bPos = joints[p.b];
      if (!aPos || !bPos) return;
      updateConnectorMesh(p.mesh, aPos, bPos);
    }
  });

  // 位置が変わったあとも色はそのままなので、再計算不要
}

// 干渉チェック関連
function isPointInsideExistingConnector(pos) {
  const p = new THREE.Vector3(pos.x, pos.y, pos.z);
  const eps = 1e-3;

  function onSegmentInterior(aPos, bPos) {
    const a = new THREE.Vector3(aPos.x, aPos.y, aPos.z);
    const b = new THREE.Vector3(bPos.x, bPos.y, bPos.z);
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    const len2 = ab.lengthSq();
    if (len2 < eps) return false;

    const t = ab.dot(ap) / len2;
    if (t <= eps || t >= 1 - eps) return false;

    const proj = new THREE.Vector3().copy(ab).multiplyScalar(t).add(a);
    return proj.distanceTo(p) < 0.5;
  }

  for (const b of beams) {
    if (onSegmentInterior(joints[b.a], joints[b.b])) return true;
  }
  for (const po of poles) {
    if (onSegmentInterior(joints[po.a], joints[po.b])) return true;
  }
  return false;
}

function isSegmentOverlappingExisting(basePos, targetPos, partType) {
  const eps = 1e-3;

  const bx = basePos.x, by = basePos.y, bz = basePos.z;
  const tx = targetPos.x, ty = targetPos.y, tz = targetPos.z;

  function overlap1D(n1, n2, c1, c2) {
    const nmin = Math.min(n1, n2);
    const nmax = Math.max(n1, n2);
    const cmin = Math.min(c1, c2);
    const cmax = Math.max(c1, c2);
    const left = Math.max(nmin, cmin);
    const right = Math.min(nmax, cmax);
    return right - left > eps;
  }

  if (partType === "beam") {
    const dx = tx - bx;
    const dz = tz - bz;
    const alongX = Math.abs(dx) > Math.abs(dz);

    if (alongX) {
      for (const b of beams) {
        const a = joints[b.a], c = joints[b.b];
        if (Math.abs(a.y - by) > eps || Math.abs(a.z - bz) > eps) continue;
        if (Math.abs(c.y - by) > eps || Math.abs(c.z - bz) > eps) continue;
        if (overlap1D(bx, tx, a.x, c.x)) return true;
      }
    } else {
      for (const b of beams) {
        const a = joints[b.a], c = joints[b.b];
        if (Math.abs(a.y - by) > eps || Math.abs(a.x - bx) > eps) continue;
        if (Math.abs(c.y - by) > eps || Math.abs(c.x - bx) > eps) continue;
        if (overlap1D(bz, tz, a.z, c.z)) return true;
      }
    }
  } else if (partType === "pole") {
    for (const po of poles) {
      const a = joints[po.a], c = joints[po.b];
      if (Math.abs(a.x - bx) > eps || Math.abs(a.z - bz) > eps) continue;
      if (Math.abs(c.x - bx) > eps || Math.abs(c.z - bz) > eps) continue;
      if (overlap1D(by, ty, a.y, c.y)) return true;
    }
  }

  return false;
}

function doesSegmentPassThroughJoint(basePos, targetPos, partType) {
  const eps = 1e-3;

  const bx = basePos.x, by = basePos.y, bz = basePos.z;
  const tx = targetPos.x, ty = targetPos.y, tz = targetPos.z;

  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (!j) continue;

    const isStart =
      Math.abs(j.x - bx) < eps &&
      Math.abs(j.y - by) < eps &&
      Math.abs(j.z - bz) < eps;
    const isEnd =
      Math.abs(j.x - tx) < eps &&
      Math.abs(j.y - ty) < eps &&
      Math.abs(j.z - tz) < eps;

    if (isStart || isEnd) continue;

    if (partType === "beam") {
      const dx = tx - bx;
      const dz = tz - bz;
      const alongX = Math.abs(dx) > Math.abs(dz);

      if (alongX) {
        if (Math.abs(j.y - by) > eps || Math.abs(j.z - bz) > eps) continue;
        const minX = Math.min(bx, tx) + eps;
        const maxX = Math.max(bx, tx) - eps;
        if (j.x > minX && j.x < maxX) return true;
      } else {
        if (Math.abs(j.y - by) > eps || Math.abs(j.x - bx) > eps) continue;
        const minZ = Math.min(bz, tz) + eps;
        const maxZ = Math.max(bz, tz) - eps;
        if (j.z > minZ && j.z < maxZ) return true;
      }
    } else if (partType === "pole") {
      if (Math.abs(j.x - bx) > eps || Math.abs(j.z - bz) > eps) continue;
      const minY = Math.min(by, ty) + eps;
      const maxY = Math.max(by, ty) - eps;
      if (j.y > minY && j.y < maxY) return true;
    }
  }

  return false;
}

// クライアント座標からジョイントインデックスを取得
function pickJointIndexByClientPos(clientX, clientY, maxPixelDist = 28) {
  // ---------------------------------------------
  // ★ 長さ変更モード中は Joint を絶対に拾わない
  //   （Beam/Poleだけ選択できる状態を作る）
  // ---------------------------------------------
  try {
    const lengthModeOn =
      !!window.isLengthEditModeOn ||
      !!window.isLengthEditMode ||
      !!window.isEditLengthMode ||
      !!window.isLengthModeOn ||
      !!window.isLengthMode;

    if (lengthModeOn) return -1;
  } catch (e) {}

  const rect = renderer.domElement.getBoundingClientRect();

  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(jointMeshes, false);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const idx = jointMeshes.indexOf(hit);
    if (idx !== -1) return idx;
  }

  let bestIndex = -1;
  let bestDistSq = maxPixelDist * maxPixelDist;

  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (!j) continue;

    const pos = new THREE.Vector3(j.x, j.y, j.z);
    const projected = pos.project(camera);

    const sx = rect.left + (projected.x + 1) * 0.5 * rect.width;
    const sy = rect.top + (1 - (projected.y + 1) * 0.5) * rect.height;

    const dx = clientX - sx;
    const dy = clientY - sy;
    const distSq = dx * dx + dy * dy;

    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }

  return bestIndex;
}

// 選択中ジョイントの「画面上の近さ」で判定（px）
function isClientPosNearSelectedJoint(clientX, clientY, radiusPx = 80) {
  try {
    const sel =
      (typeof selectedJointIndex !== "undefined")
        ? selectedJointIndex
        : (typeof window.selectedJointIndex !== "undefined" ? window.selectedJointIndex : -1);

    if (typeof sel !== "number" || sel < 0) return false;

    const j = joints?.[sel];
    if (!j) return false;

    const rect = renderer.domElement.getBoundingClientRect();

    const v = new THREE.Vector3(j.x, j.y, j.z).project(camera);
    const sx = rect.left + (v.x + 1) * 0.5 * rect.width;
    const sy = rect.top + (1 - (v.y + 1) * 0.5) * rect.height;

    const dx = clientX - sx;
    const dy = clientY - sy;
    const distSq = dx * dx + dy * dy;

    return distSq <= radiusPx * radiusPx;
  } catch (e) {
    return false;
  }
}

// グローバルに公開
window.findJointIndexAt = findJointIndexAt;
window.createJoint = createJoint;
window.setSelectedJoint = setSelectedJoint;
window.deleteJoint = deleteJoint;
window.updateConnectorsForJoint = updateConnectorsForJoint;
window.isPointInsideExistingConnector = isPointInsideExistingConnector;
window.isSegmentOverlappingExisting = isSegmentOverlappingExisting;
window.doesSegmentPassThroughJoint = doesSegmentPassThroughJoint;
window.pickJointIndexByClientPos = pickJointIndexByClientPos;
window.isClientPosNearSelectedJoint = isClientPosNearSelectedJoint;
