// =========================================================
// V3 Connection パネル
// ① ビームで接続 = 既存 isConnectModeOn 処理をそのまま使う
// ② ジョイントで接続 = ラック結合（プレビュー後に確定）
// =========================================================
(function () {
  const POP_ID = "connect";
  const EPS = 0.5;
  const OFFSET_Y = function () {
    const half = (window.LEG_TOTAL_HEIGHT || 12.9) / 2;
    const jb = (typeof window.getVerticalJbHalfMm === "function")
      ? window.getVerticalJbHalfMm()
      : 9.1;
    return half + jb;
  };

  let method = "beam";
  let step = "idle";
  let parentIdx = -1;
  let childIdx = -1;
  let delta = { x: 0, y: 0, z: 0 };
  let overlapCount = 0;
  let msg = "";
  let previewGroup = null;
  let hiddenMeshes = [];
  let marked = [];
  let selfRefresh = false;
  let lastPickAt = 0;
  let lastPickIdx = -999;
  let fromModeOff = false;

  function $(id) { return document.getElementById(id); }
  function ui() { return window.v3WorkspaceUi; }
  function joints() { return window.joints || []; }
  function wl() { return window.v3WorkLayers; }

  function isJoinActive() {
    return !!window.isConnectModeOn && method === "join";
  }

  function rackIdOf(index) {
    const j = joints()[index];
    return j && typeof j.rackId === "string" ? j.rackId : null;
  }

  function jointsOfRack(rackId) {
    const list = [];
    if (!rackId) return list;
    const js = joints();
    for (let i = 0; i < js.length; i++) {
      if (js[i] && js[i].rackId === rackId) list.push(i);
    }
    return list;
  }

  function dist3(a, b) {
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0), (a.z || 0) - (b.z || 0));
  }

  function samePos(a, b) {
    return a && b && dist3(a, b) <= EPS;
  }

  function clearMarks() {
    marked.forEach(function (item) {
      const mesh = item.mesh;
      if (!mesh || !mesh.material) return;
      try {
        if (item.color != null) mesh.material.color.setHex(item.color);
        if (mesh.material.emissive && item.emissive != null) {
          mesh.material.emissive.setHex(item.emissive);
          mesh.material.emissiveIntensity = item.intensity || 0;
        }
        if (item.scale) mesh.scale.copy(item.scale);
      } catch (e) {}
    });
    marked = [];
  }

  function markJoint(index, hex) {
    const mesh = (window.jointMeshes || [])[index];
    if (!mesh || !mesh.material) return;
    marked.push({
      mesh: mesh,
      color: mesh.material.color ? mesh.material.color.getHex() : null,
      emissive: mesh.material.emissive ? mesh.material.emissive.getHex() : null,
      intensity: mesh.material.emissiveIntensity || 0,
      scale: mesh.scale.clone(),
    });
    try {
      mesh.material.color.setHex(hex);
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(hex);
        mesh.material.emissiveIntensity = 0.9;
      }
      mesh.scale.set(1.25, 1.25, 1.25);
    } catch (e) {}
  }

  function disposePreview() {
    if (!previewGroup) return;
    const rg = window.rackGroup;
    previewGroup.traverse(function (obj) {
      if (obj.geometry && obj.geometry.dispose) {
        try { obj.geometry.dispose(); } catch (e) {}
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) { try { m.dispose && m.dispose(); } catch (e2) {} });
      }
    });
    if (rg && previewGroup.parent === rg) rg.remove(previewGroup);
    previewGroup = null;
    hiddenMeshes.forEach(function (mesh) {
      if (mesh) mesh.visible = true;
    });
    hiddenMeshes = [];
  }

  function cloneForPreview(mesh) {
    if (!mesh) return null;
    const cloned = mesh.clone(true);
    cloned.traverse(function (obj) {
      if (obj.userData) {
        obj.userData = Object.assign({}, obj.userData, { joinPreview: true });
        delete obj.userData.jointIndex;
      }
      if (obj.material) {
        const src = obj.material;
        const mats = Array.isArray(src) ? src : [src];
        const next = mats.map(function (m) {
          const c = m.clone();
          c.transparent = true;
          c.opacity = 0.42;
          c.depthWrite = false;
          if (c.color) c.color.offsetHSL(0.08, 0.15, 0.05);
          return c;
        });
        obj.material = Array.isArray(src) ? next : next[0];
      }
    });
    return cloned;
  }

  function hideAndClone(mesh, group) {
    if (!mesh) return;
    const cloned = cloneForPreview(mesh);
    if (cloned) group.add(cloned);
    if (mesh.visible !== false) {
      mesh.visible = false;
      hiddenMeshes.push(mesh);
    }
  }

  function belongsToChild(index, childSet) {
    return childSet.has(index);
  }

  function showPreview() {
    disposePreview();
    const childId = rackIdOf(childIdx);
    const parentJ = joints()[parentIdx];
    const childJ = joints()[childIdx];
    if (!parentJ || !childJ || !childId) return;
    delta = {
      x: parentJ.x - childJ.x,
      y: parentJ.y - childJ.y,
      z: parentJ.z - childJ.z,
    };
    const childSet = new Set(jointsOfRack(childId));
    const parentSet = new Set(jointsOfRack(rackIdOf(parentIdx)));
    overlapCount = 0;
    childSet.forEach(function (ci) {
      const cj = joints()[ci];
      if (!cj) return;
      const moved = { x: cj.x + delta.x, y: cj.y + delta.y, z: cj.z + delta.z };
      parentSet.forEach(function (pi) {
        if (samePos(moved, joints()[pi])) overlapCount += 1;
      });
    });

    const group = new window.THREE.Group();
    group.userData = { type: "join-preview" };
    (window.jointMeshes || []).forEach(function (mesh, i) {
      if (belongsToChild(i, childSet)) hideAndClone(mesh, group);
    });
    (window.beams || []).forEach(function (b) {
      if (b && (childSet.has(b.a) || childSet.has(b.b))) hideAndClone(b.mesh, group);
    });
    (window.poles || []).forEach(function (p) {
      if (p && (childSet.has(p.a) || childSet.has(p.b))) hideAndClone(p.mesh, group);
    });
    (window.legs || []).forEach(function (l) {
      let idx = -1;
      if (typeof window.resolveLegJointIndex === "function") idx = window.resolveLegJointIndex(l);
      else if (l && typeof l.jointIndex === "number") idx = l.jointIndex;
      if (idx >= 0 && childSet.has(idx)) hideAndClone(l.mesh, group);
    });
    function boardChild(item) {
      const j4 = item && Array.isArray(item.j4) ? item.j4 : [];
      return j4.some(function (idx) { return childSet.has(idx); });
    }
    (window.shelves || []).forEach(function (s) { if (boardChild(s)) hideAndClone(s.mesh, group); });
    (window.panels || []).forEach(function (p) { if (boardChild(p)) hideAndClone(p.mesh, group); });

    group.position.set(delta.x, delta.y, delta.z);
    if (window.rackGroup) window.rackGroup.add(group);
    previewGroup = group;
  }

  function resetJoin(keepMethod) {
    disposePreview();
    clearMarks();
    parentIdx = -1;
    childIdx = -1;
    delta = { x: 0, y: 0, z: 0 };
    overlapCount = 0;
    msg = "";
    step = keepMethod === false ? "idle" : (method === "join" ? "parent" : "idle");
  }

  function setMethod(next) {
    if (next === method && step !== "idle") {
      fillBody();
      return;
    }
    resetJoin();
    method = next === "join" ? "join" : "beam";
    if (method === "join") {
      try {
        if (typeof window.clearConnectFromHighlight === "function") window.clearConnectFromHighlight();
        window.connectFromJointIndex = null;
        if (typeof window.clearConnectMarks === "function") window.clearConnectMarks();
      } catch (e) {}
      step = "parent";
      msg = "";
    } else {
      step = "idle";
    }
    fillBody();
  }

  function refuse(reason) {
    msg = reason;
    fillBody();
  }

  function pairKey(a, b) {
    return a < b ? a + ":" + b : b + ":" + a;
  }

  function boardsWouldBreak(dropToKeep) {
    function check(list) {
      if (!list) return false;
      for (let i = 0; i < list.length; i++) {
        const j4 = list[i] && Array.isArray(list[i].j4) ? list[i].j4 : null;
        if (!j4 || j4.length !== 4) continue;
        const next = [];
        const seen = {};
        for (let k = 0; k < 4; k++) {
          let idx = j4[k];
          if (dropToKeep[idx] != null) idx = dropToKeep[idx];
          if (typeof idx !== "number" || idx < 0) return true;
          next.push(idx);
          seen[idx] = true;
        }
        if (Object.keys(seen).length !== 4) return true;
      }
      return false;
    }
    return check(window.shelves) || check(window.panels);
  }

  function findOverlaps(parentSet, childSet, d) {
    const dropToKeep = {};
    childSet.forEach(function (ci) {
      const cj = joints()[ci];
      if (!cj) return;
      const moved = { x: cj.x + d.x, y: cj.y + d.y, z: cj.z + d.z };
      let keep = -1;
      parentSet.forEach(function (pi) {
        if (keep >= 0) return;
        if (samePos(moved, joints()[pi])) keep = pi;
      });
      if (keep >= 0) dropToKeep[ci] = keep;
    });
    return dropToKeep;
  }

  function validateJoin(pIdx, cIdx) {
    if (typeof pIdx !== "number") pIdx = parentIdx;
    if (typeof cIdx !== "number") cIdx = childIdx;
    const js = joints();
    const parent = js[pIdx];
    const child = js[cIdx];
    if (!parent || !child) return "接続先Jointが存在しません。";
    const parentId = rackIdOf(pIdx);
    const childId = rackIdOf(cIdx);
    if (!parentId || !childId) return "ラックIDを解決できないため結合できません。";
    if (parentId === childId) return "親と子が同一ラックのため結合できません。";
    const layers = wl();
    if (layers) {
      if (typeof layers.canEditJoint === "function") {
        if (!layers.canEditJoint(pIdx)) return "親ラックがロック中または非表示のため結合できません。";
        if (!layers.canEditJoint(cIdx)) return "子ラックがロック中または非表示のため結合できません。";
      }
      const childList = jointsOfRack(childId);
      for (let i = 0; i < childList.length; i++) {
        if (typeof layers.canEditJoint === "function" && !layers.canEditJoint(childList[i])) {
          return "子ラックがロック中または非表示のため結合できません。";
        }
      }
    }
    const d = {
      x: parent.x - child.x,
      y: parent.y - child.y,
      z: parent.z - child.z,
    };
    if (![d.x, d.y, d.z].every(function (v) { return Number.isFinite(v); })) {
      return "子ラックを安全に移動できません。";
    }
    const dropToKeep = findOverlaps(new Set(jointsOfRack(parentId)), new Set(jointsOfRack(childId)), d);
    if (boardsWouldBreak(dropToKeep)) {
      return "棚板または壁板の接続が壊れるため結合できません。";
    }
    return null;
  }

  function disposeConnector(item, kind) {
    if (!item) return;
    if (kind === "beam" && typeof window.disposeBeamMesh === "function") window.disposeBeamMesh(item);
    if (kind === "pole" && typeof window.disposePoleMesh === "function") window.disposePoleMesh(item);
  }

  function mappedPair(item, indexMap) {
    if (!item) return { a: -1, b: -1 };
    const a = (typeof item.a === "number" && item.a >= 0) ? indexMap[item.a] : -1;
    const b = (typeof item.b === "number" && item.b >= 0) ? indexMap[item.b] : -1;
    return {
      a: (typeof a === "number" ? a : -1),
      b: (typeof b === "number" ? b : -1),
    };
  }

  function originalSpanMm(item) {
    if (!item) return -1;
    const ja = joints()[item.a];
    const jb = joints()[item.b];
    if (!ja || !jb) return -1;
    return Math.hypot((jb.x || 0) - (ja.x || 0), (jb.y || 0) - (ja.y || 0), (jb.z || 0) - (ja.z || 0));
  }

  function syncConnectorEndpointIds(list) {
    const js = joints();
    (list || []).forEach(function (item) {
      if (!item) return;
      const ja = js[item.a];
      const jb = js[item.b];
      item.aId = (ja && typeof ja.id === "string") ? ja.id : null;
      item.bId = (jb && typeof jb.id === "string") ? jb.id : null;
    });
  }

  // 重複は「同じ端点を結ぶ同一部材」だけ。同一直線上や長さ違いだけでは消さない。
  function applyIndexMapToConnectors(list, indexMap, kind) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const mapped = mappedPair(item, indexMap);
      if (item) {
        item.__mapA = mapped.a;
        item.__mapB = mapped.b;
      }
    }

    const drop = {};
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) {
        drop[i] = true;
        continue;
      }
      const a = item.__mapA;
      const b = item.__mapB;
      if (a < 0 || b < 0 || a === b) drop[i] = true;
    }

    const keepOf = {};
    for (let i = 0; i < list.length; i++) {
      if (drop[i]) continue;
      const item = list[i];
      const key = pairKey(item.__mapA, item.__mapB);
      if (keepOf[key] == null) {
        keepOf[key] = i;
        continue;
      }
      const kept = list[keepOf[key]];
      const span = originalSpanMm(item);
      const errKeep = Math.abs(Math.round(kept.lengthMm || 0) - Math.round(span));
      const errItem = Math.abs(Math.round(item.lengthMm || 0) - Math.round(span));
      if (errItem < errKeep) {
        drop[keepOf[key]] = true;
        keepOf[key] = i;
      } else {
        drop[i] = true;
      }
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (drop[i]) {
        disposeConnector(item, kind);
        list.splice(i, 1);
        continue;
      }
      item.a = item.__mapA;
      item.b = item.__mapB;
      delete item.__mapA;
      delete item.__mapB;
    }
  }

  function joinRacksByJoints(pIdx, cIdx) {
    const reason = validateJoin(pIdx, cIdx);
    if (reason) return { ok: false, reason: reason };
    let preJoinSnap = null;
    try { preJoinSnap = window.createSnapshot ? window.createSnapshot() : null; } catch (e) { preJoinSnap = null; }
    const js = joints();
    const parentId = rackIdOf(pIdx);
    const childId = rackIdOf(cIdx);
    const parentSet = new Set(jointsOfRack(parentId));
    const childSet = new Set(jointsOfRack(childId));
    const d = {
      x: js[pIdx].x - js[cIdx].x,
      y: js[pIdx].y - js[cIdx].y,
      z: js[pIdx].z - js[cIdx].z,
    };

    childSet.forEach(function (i) {
      const j = js[i];
      if (!j) return;
      j.x += d.x;
      j.y += d.y;
      j.z += d.z;
    });

    const dropToKeep = findOverlaps(parentSet, childSet, { x: 0, y: 0, z: 0 });
    if (boardsWouldBreak(dropToKeep)) {
      childSet.forEach(function (i) {
        const j = js[i];
        if (!j) return;
        j.x -= d.x;
        j.y -= d.y;
        j.z -= d.z;
      });
      return { ok: false, reason: "棚板または壁板の接続が壊れるため結合できません。" };
    }

    const n = js.length;
    const dropSet = {};
    Object.keys(dropToKeep).forEach(function (k) { dropSet[Number(k)] = true; });
    const packed = new Array(n);
    let next = 0;
    for (let i = 0; i < n; i++) packed[i] = dropSet[i] ? -1 : next++;
    const indexMap = new Array(n);
    for (let i = 0; i < n; i++) {
      if (dropSet[i]) indexMap[i] = packed[dropToKeep[i]];
      else indexMap[i] = packed[i];
    }

    applyIndexMapToConnectors(window.beams || [], indexMap, "beam");
    applyIndexMapToConnectors(window.poles || [], indexMap, "pole");

    if (typeof window.remapLegsForJointIndexMap === "function") {
      window.remapLegsForJointIndexMap(indexMap, dropSet);
    } else {
      const seenLeg = {};
      const legs = window.legs || [];
      for (let i = legs.length - 1; i >= 0; i--) {
        const leg = legs[i];
        let oldIdx = -1;
        if (leg && typeof leg.jointId === "string" && leg.jointId) {
          oldIdx = js.findIndex(function (j) { return j && j.id === leg.jointId; });
        }
        if (oldIdx < 0 && leg && typeof leg.jointIndex === "number") oldIdx = leg.jointIndex;
        const mapped = (typeof oldIdx === "number" && oldIdx >= 0) ? indexMap[oldIdx] : -1;
        if (typeof mapped !== "number" || mapped < 0 || seenLeg[mapped]) {
          if (typeof window.disposeLegMesh === "function") window.disposeLegMesh(leg);
          legs.splice(i, 1);
          continue;
        }
        seenLeg[mapped] = true;
        leg.jointIndex = mapped;
      }
    }

    if (typeof window.remapBoardsForJointIndexMap === "function") {
      window.remapBoardsForJointIndexMap(indexMap);
    }

    const meshes = window.jointMeshes || [];
    for (let i = n - 1; i >= 0; i--) {
      if (!dropSet[i]) continue;
      if (typeof window.disposeJointMeshByIndex === "function") window.disposeJointMeshByIndex(i);
      else if (meshes[i] && meshes[i].parent) meshes[i].parent.remove(meshes[i]);
      js.splice(i, 1);
      meshes.splice(i, 1);
    }

    const parentRack = parentId;
    for (let i = 0; i < js.length; i++) {
      if (js[i] && (js[i].rackId === childId || js[i].rackId === parentId)) {
        js[i].rackId = parentRack;
      }
    }

    syncConnectorEndpointIds(window.beams || []);
    syncConnectorEndpointIds(window.poles || []);

    try {
      if (typeof window.v3NormalizeConnectors?.apply === "function") {
        const norm = window.v3NormalizeConnectors.apply({ rackId: parentRack });
        if (!norm || !norm.ok) {
          if (preJoinSnap && typeof window.applySnapshotFromString === "function") {
            try { window.applySnapshotFromString(preJoinSnap); } catch (e2) {}
          }
          return { ok: false, reason: (norm && norm.reason) || "部材の正規化に失敗したため結合できません。" };
        }
      }
    } catch (e) {
      if (preJoinSnap && typeof window.applySnapshotFromString === "function") {
        try { window.applySnapshotFromString(preJoinSnap); } catch (e2) {}
      }
      return { ok: false, reason: "部材の正規化に失敗したため結合できません。" };
    }

    (window.jointMeshes || []).forEach(function (mesh, i) {
      if (mesh && mesh.userData) mesh.userData.jointIndex = i;
    });

    try {
      if (typeof window.syncLegConnectionsAfterJointPack === "function") {
        window.syncLegConnectionsAfterJointPack();
      } else {
        const manual = new Set();
        (window.legs || []).forEach(function (leg) {
          const j = js[leg && leg.jointIndex];
          if (j && typeof j.id === "string") leg.jointId = j.id;
          if (leg && typeof leg.jointIndex === "number") manual.add(leg.jointIndex);
        });
        window.manualLegJointSet = manual;
        window.syncLegsToConnectedJoints?.() || window.syncLegMeshesFromData?.();
      }
    } catch (e) {}

    try { wl() && wl().syncRackIds && wl().syncRackIds(); } catch (e) {}
    try { window.syncJointMeshesFromData?.(); } catch (e) {}
    try { window.syncConnectorMeshesFromData?.(); } catch (e) {}
    try { window.syncLegsToConnectedJoints?.(); } catch (e) {}
    try { window.rebuildBoards?.(); } catch (e) {}
    try { wl() && wl().refreshVisibility && wl().refreshVisibility(); } catch (e) {}
    try { window.calcAndRenderEstimate?.(); } catch (e) {}
    try { window.saveHistory?.("join racks by joint"); } catch (e) {}

    const newParent = (typeof packed[pIdx] === "number") ? packed[pIdx] : -1;
    return { ok: true, parentIndex: newParent, parentId: parentRack };
  }

  function commitJoin() {
    disposePreview();
    clearMarks();
    const result = joinRacksByJoints(parentIdx, childIdx);
    if (!result.ok) {
      refuse(result.reason);
      return false;
    }
    method = "join";
    parentIdx = -1;
    childIdx = -1;
    step = "parent";
    msg = "結合しました。次の親Jointを選択できます。";
    fillBody();
    return true;
  }

  function onJointPicked(index) {
    if (!isJoinActive()) return false;
    const now = Date.now();
    if (now - lastPickAt < 40 && index === lastPickIdx) return true;
    lastPickAt = now;
    lastPickIdx = index;
    if (step === "preview" || step === "done") return true;
    if (typeof index !== "number" || index < 0 || !joints()[index]) {
      refuse("Jointをクリックしてください。");
      return true;
    }
    const layers = wl();
    if (layers && typeof layers.canSelectJoint === "function" && !layers.canSelectJoint(index)) {
      refuse("非表示または選択できないJointです。");
      return true;
    }
    if (step === "parent") {
      if (layers && typeof layers.canEditJoint === "function" && !layers.canEditJoint(index)) {
        refuse("親ラックがロック中または非表示のため選択できません。");
        return true;
      }
      parentIdx = index;
      childIdx = -1;
      step = "child";
      msg = "";
      clearMarks();
      markJoint(parentIdx, 0x38bdf8);
      fillBody();
      return true;
    }
    if (step === "child") {
      if (index === parentIdx) {
        refuse("別のラックのJointを選択してください。");
        return true;
      }
      if (rackIdOf(index) === rackIdOf(parentIdx)) {
        refuse("親と子が同一ラックのため結合できません。");
        return true;
      }
      if (layers && typeof layers.canEditJoint === "function" && !layers.canEditJoint(index)) {
        refuse("子ラックがロック中または非表示のため選択できません。");
        return true;
      }
      childIdx = index;
      const reason = validateJoin();
      if (reason) {
        childIdx = -1;
        refuse(reason);
        return true;
      }
      markJoint(childIdx, 0x4ade80);
      showPreview();
      step = "preview";
      msg = "";
      fillBody();
      return true;
    }
    return true;
  }

  function fillBody(body) {
    const el = body || $("v3-cmd-pop-body");
    if (!el) return;
    el.innerHTML = "";
    const root = document.createElement("div");
    root.className = "v3-connect-root";

    const modes = document.createElement("div");
    modes.className = "v3-len-modes";
    function modeBtn(id, label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v3-len-mode" + (method === id ? " is-on" : "");
      btn.textContent = label;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        setMethod(id);
      });
      return btn;
    }
    modes.appendChild(modeBtn("beam", "① ビームで接続"));
    modes.appendChild(modeBtn("join", "② ジョイントで接続"));
    root.appendChild(modes);

    const status = document.createElement("p");
    status.className = "v3-connect-status";
    if (method === "beam") {
      status.textContent = "接続元のJointを選んでから、接続先のJointをクリックします。";
    } else if (step === "parent") {
      status.textContent = "親ラックのジョイントを選択";
    } else if (step === "child") {
      status.textContent = "接続するラックのジョイントを選択";
    } else if (step === "preview") {
      status.textContent = "結合プレビュー。親ラックは固定、子ラックだけを移動しています。";
    } else if (step === "done") {
      status.textContent = "結合が完了しました。";
    } else {
      status.textContent = "接続方法を選んでください。";
    }
    root.appendChild(status);

    if (method === "join" && step === "preview") {
      const meta = document.createElement("div");
      meta.className = "v3-connect-meta";
      meta.innerHTML =
        "<div>移動量 X " + Math.round(delta.x) + " / Y " + Math.round(delta.y) + " / Z " + Math.round(delta.z) + " mm</div>" +
        "<div>重なるJoint " + overlapCount + " 箇所</div>" +
        "<div>結合後は親ラックの rackId / 作業レイヤーを使います。</div>";
      root.appendChild(meta);
      const actions = document.createElement("div");
      actions.className = "v3-connect-actions";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "v3-len-apply";
      ok.textContent = "結合する";
      ok.addEventListener("click", function (ev) {
        ev.preventDefault();
        commitJoin();
      });
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "v3-len-mode";
      cancel.textContent = "キャンセル";
      cancel.addEventListener("click", function (ev) {
        ev.preventDefault();
        resetJoin();
        method = "join";
        step = "parent";
        fillBody();
      });
      actions.appendChild(ok);
      actions.appendChild(cancel);
      root.appendChild(actions);
    }

    if (msg) {
      const note = document.createElement("p");
      note.className = "v3-connect-msg";
      note.textContent = msg;
      root.appendChild(note);
    }
    el.appendChild(root);
  }

  function openPanel() {
    const host = ui();
    if (!host || typeof host.openPopup !== "function") return;
    if (method === "join" && step === "idle") step = "parent";
    if (host.getOpenPopupId && host.getOpenPopupId() === POP_ID) {
      fillBody();
      return;
    }
    host.openPopup(POP_ID, {
      title: "接続",
      hideApply: true,
      hideActions: true,
      compact: true,
      skipFocus: true,
      anchor: $("v3-cad-connect"),
      onCancel: function () {
        if (selfRefresh) return;
        resetJoin(false);
        if (window.isConnectModeOn && !fromModeOff) {
          fromModeOff = true;
          try { window.setConnectMode?.(false); } catch (e) {}
          fromModeOff = false;
        }
      },
      render: fillBody,
    });
  }

  function closePanel() {
    const host = ui();
    if (host && host.getOpenPopupId && host.getOpenPopupId() === POP_ID) {
      selfRefresh = true;
      try { host.closePopup("cancel"); } catch (e) {}
      selfRefresh = false;
    }
  }

  function onJoinPointer(ev) {
    if (!isJoinActive()) return;
    if (ev.button != null && ev.button !== 0) return;
    const t = ev.target;
    if (t && t.closest && t.closest("#v3-cmd-pop, #v3-east-rail, .v3-toolbar, #v3-north, #v3-layer-panel, #v3-view-nav, #v3-sel-hud, #v3-rotate-hud, #v3-radial")) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    const idx = (typeof window.pickJointIndexByClientPos === "function")
      ? window.pickJointIndexByClientPos(ev.clientX, ev.clientY, 28)
      : -1;
    onJointPicked(idx);
  }

  function hookMode() {
    if (window.__v3JoinModeHooked) return;
    const orig = window.setConnectMode;
    if (typeof orig !== "function") return;
    window.__v3JoinModeHooked = true;
    const wrapped = function (on) {
      const result = orig.apply(this, arguments);
      if (window.isConnectModeOn) {
        openPanel();
      } else {
        resetJoin(false);
        if (!fromModeOff) closePanel();
      }
      return result;
    };
    window.setConnectMode = wrapped;
  }

  document.addEventListener("pointerdown", onJoinPointer, true);

  hookMode();
  window.addEventListener("load", hookMode);

  window.v3JoinRacks = {
    validate: validateJoin,
    commit: joinRacksByJoints,
    rackIdOf: rackIdOf,
  };

  window.v3ConnectPanel = {
    open: openPanel,
    isJoinActive: isJoinActive,
    onJointPicked: onJointPicked,
    setMethod: setMethod,
    commitJoin: commitJoin,
    joinRacksByJoints: joinRacksByJoints,
    cancelJoin: function () {
      resetJoin();
      method = "join";
      step = "parent";
      fillBody();
    },
    getMethod: function () { return method; },
    getStep: function () { return step; },
    getDelta: function () { return { x: delta.x, y: delta.y, z: delta.z }; },
    getParentIndex: function () { return parentIdx; },
    getChildIndex: function () { return childIdx; },
  };
})();
