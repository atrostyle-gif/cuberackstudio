// =========================================================
// V3 STEP⑦ ラック全体の複製
// - JointBall が属するラックを独立ラックとしてコピーする
// - Move / Joint結合 / STEP⑤-C 正規化の既存処理は呼ばない
// =========================================================
(function () {
  const GAP_MM = 300;
  const STEP_MM = 50;
  const EPS = 0.5;
  const POP_ID = "duplicate";
  const HINT = "複製するラックの JointBall をクリックしてください。";

  window.isDuplicateModeOn = false;

  function joints() { return window.joints || []; }
  function jointMeshes() { return window.jointMeshes || []; }
  function beams() { return window.beams || []; }
  function poles() { return window.poles || []; }
  function legs() { return window.legs || []; }
  function shelves() { return window.shelves || []; }
  function panels() { return window.panels || []; }
  function wl() { return window.v3WorkLayers; }
  function ui() { return window.v3WorkspaceUi; }
  function THREE() { return window.THREE; }

  function snap50(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n / STEP_MM) * STEP_MM;
  }

  function newRawId(prefix) {
    if (typeof window.__v3IdGenerator === "function") return prefix + "-" + window.__v3IdGenerator(prefix);
    try {
      if (crypto && typeof crypto.randomUUID === "function") return prefix + "-" + crypto.randomUUID();
    } catch (e) {}
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function uniqueId(factory, used) {
    let id = null;
    for (let i = 0; i < 24; i++) {
      id = typeof factory === "function" ? factory() : newRawId("id");
      if (id && !used.has(id)) {
        used.add(id);
        return id;
      }
    }
    id = newRawId("id") + "-" + used.size;
    used.add(id);
    return id;
  }

  function collectUsedIds() {
    const used = new Set();
    function add(id) {
      if (typeof id === "string" && id) used.add(id);
    }
    joints().forEach(function (j) { add(j && j.id); add(j && j.rackId); });
    beams().forEach(function (b) { add(b && b.id); });
    poles().forEach(function (p) { add(p && p.id); });
    legs().forEach(function (l) { add(l && l.id); });
    const st = wl() && typeof wl().getState === "function" ? wl().getState() : null;
    if (st && st.rackAssignments) {
      Object.keys(st.rackAssignments).forEach(function (id) { add(id); });
    }
    return used;
  }

  function rackIdOf(index) {
    const j = joints()[index];
    return j && typeof j.rackId === "string" && j.rackId ? j.rackId : null;
  }

  function indicesOfRack(rackId) {
    const out = [];
    if (!rackId) return out;
    const js = joints();
    for (let i = 0; i < js.length; i++) {
      if (js[i] && js[i].rackId === rackId) out.push(i);
    }
    return out;
  }

  function clusterOf(jointIndex) {
    const gz = window.v3MoveGizmo;
    if (gz && typeof gz.clusterOf === "function") return gz.clusterOf(jointIndex);
    const js = joints();
    const adj = {};
    function link(a, b) {
      if (typeof a !== "number" || typeof b !== "number") return;
      if (!js[a] || !js[b]) return;
      if (!adj[a]) adj[a] = [];
      if (!adj[b]) adj[b] = [];
      adj[a].push(b);
      adj[b].push(a);
    }
    beams().forEach(function (b) { if (b) link(b.a, b.b); });
    poles().forEach(function (p) { if (p) link(p.a, p.b); });
    const seen = {};
    const q = [jointIndex];
    seen[jointIndex] = true;
    const out = [];
    while (q.length) {
      const i = q.shift();
      out.push(i);
      (adj[i] || []).forEach(function (n) {
        if (!seen[n]) {
          seen[n] = true;
          q.push(n);
        }
      });
    }
    return out.length ? out : [jointIndex];
  }

  function sourceIndices(jointIndex) {
    const rackId = rackIdOf(jointIndex);
    if (rackId) {
      const byId = indicesOfRack(rackId);
      if (byId.length) return { rackId: rackId, indices: byId };
    }
    return { rackId: null, indices: clusterOf(jointIndex) };
  }

  function aabbOf(indices, offset) {
    if (window.v3MoveGap && typeof window.v3MoveGap.aabbOf === "function") {
      return window.v3MoveGap.aabbOf(indices, offset);
    }
    const js = joints();
    const ox = offset && Number.isFinite(offset.x) ? offset.x : 0;
    const oy = offset && Number.isFinite(offset.y) ? offset.y : 0;
    const oz = offset && Number.isFinite(offset.z) ? offset.z : 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let minY = Infinity, maxY = -Infinity, n = 0;
    for (let i = 0; i < indices.length; i++) {
      const j = js[indices[i]];
      if (!j) continue;
      minX = Math.min(minX, j.x + ox); maxX = Math.max(maxX, j.x + ox);
      minZ = Math.min(minZ, j.z + oz); maxZ = Math.max(maxZ, j.z + oz);
      minY = Math.min(minY, j.y + oy); maxY = Math.max(maxY, j.y + oy);
      n++;
    }
    if (!n || !Number.isFinite(minX)) return null;
    return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, minY: minY, maxY: maxY };
  }

  function overlaps(a, b) {
    if (!a || !b) return false;
    const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > EPS;
    const z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > EPS;
    const y = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > EPS;
    return x && z && y;
  }

  function collides(indices, offset) {
    if (window.v3MoveGap && typeof window.v3MoveGap.collisions === "function") {
      return (window.v3MoveGap.collisions(indices, offset) || []).length > 0;
    }
    const moving = aabbOf(indices, offset);
    if (!moving) return true;
    const exclude = {};
    indices.forEach(function (i) { exclude[i] = true; });
    const buckets = {};
    const js = joints();
    for (let i = 0; i < js.length; i++) {
      if (exclude[i] || !js[i]) continue;
      const id = (typeof js[i].rackId === "string" && js[i].rackId) ? js[i].rackId : ("j:" + i);
      if (!buckets[id]) buckets[id] = [];
      buckets[id].push(i);
    }
    const ids = Object.keys(buckets);
    for (let i = 0; i < ids.length; i++) {
      if (overlaps(moving, aabbOf(buckets[ids[i]]))) return true;
    }
    return false;
  }

  function pickOffset(indices) {
    const box = aabbOf(indices);
    if (!box) return { ok: false, reason: "複製するラックが見つかりません。" };
    const spanX = Math.max(STEP_MM, snap50((box.maxX - box.minX) + GAP_MM));
    const spanZ = Math.max(STEP_MM, snap50((box.maxZ - box.minZ) + GAP_MM));
    const cands = [];
    for (let k = 1; k <= 8; k++) cands.push({ x: spanX * k, y: 0, z: 0 });
    for (let k = 1; k <= 8; k++) cands.push({ x: 0, y: 0, z: spanZ * k });
    for (let k = 1; k <= 4; k++) cands.push({ x: -spanX * k, y: 0, z: 0 });
    for (let k = 1; k <= 4; k++) cands.push({ x: 0, y: 0, z: -spanZ * k });
    for (let i = 0; i < cands.length; i++) {
      if (!collides(indices, cands[i])) return { ok: true, offset: cands[i] };
    }
    return { ok: false, reason: "周囲に空きがなく、既存ラックと重ならずに複製できません。" };
  }

  function boardBelongs(item, srcSet) {
    if (!item || !Array.isArray(item.j4) || item.j4.length !== 4) return false;
    for (let i = 0; i < item.j4.length; i++) {
      if (!srcSet.has(item.j4[i])) return false;
    }
    return true;
  }

  function cellKeyOf(j4) {
    if (typeof window.computeBoardBoundsFromJoints !== "function") return "";
    const b = window.computeBoardBoundsFromJoints(j4, false);
    if (!b) return "";
    const round = function (v) { return Math.round(v * 2) / 2; };
    return round(b.minY) + "|" + round(b.minZ) + "|" + round(b.minX);
  }

  function cloneJoint(src, offset, rackId, used) {
    const T = THREE();
    const id = uniqueId(window.newJointClientId, used);
    const joint = {
      id: id,
      x: (src.x || 0) + offset.x,
      y: (src.y || 0) + offset.y,
      z: (src.z || 0) + offset.z,
      rackId: rackId,
    };
    if (src.material !== undefined) joint.material = src.material;
    joints().push(joint);
    const idx = joints().length - 1;
    let mesh = null;
    if (T && window.jointGeometry && window.jointMaterialNormal) {
      mesh = new T.Mesh(window.jointGeometry, window.jointMaterialNormal.clone());
      mesh.position.set(joint.x, joint.y, joint.z);
      if (typeof window.applyMaterialColorToMesh === "function") {
        window.applyMaterialColorToMesh(mesh, window.normalizeMaterial ? window.normalizeMaterial(joint.material) : joint.material);
      }
      if (window.rackGroup) window.rackGroup.add(mesh);
    }
    jointMeshes().push(mesh);
    if (mesh && mesh.userData) mesh.userData.jointIndex = idx;
    return idx;
  }

  function cloneConnector(kind, src, a, b, used) {
    const js = joints();
    const ja = js[a];
    const jb = js[b];
    if (!ja || !jb) return null;
    const list = kind === "pole" ? poles() : beams();
    const factory = kind === "pole" ? window.newPoleClientId : window.newBeamClientId;
    const matObj = kind === "pole" ? window.poleMaterial : window.beamMaterial;
    let mesh = null;
    if (typeof window.createCylinderBetween === "function") {
      mesh = window.createCylinderBetween(ja, jb, matObj);
      if (mesh && typeof window.applyMaterialColorToMesh === "function") {
        window.applyMaterialColorToMesh(mesh, src && src.material);
      }
      if (mesh && typeof window.updateConnectorMesh === "function") {
        window.updateConnectorMesh(mesh, ja, jb);
      }
    }
    const dx = (jb.x || 0) - (ja.x || 0);
    const dy = (jb.y || 0) - (ja.y || 0);
    const dz = (jb.z || 0) - (ja.z || 0);
    let lengthMm = (typeof window.actualJointDistanceMm === "function")
      ? window.actualJointDistanceMm(ja, jb)
      : Math.hypot(dx, dy, dz);
    if (kind === "pole" && typeof window.getPoleSkuFromCadMm === "function") {
      lengthMm = window.getPoleSkuFromCadMm(lengthMm);
    }
    const presets = kind === "pole" ? (window.POLE_LENGTH_OPTIONS || []) : (window.BEAM_LENGTH_OPTIONS || []);
    const isPreset = (typeof window.isPresetLengthMm === "function")
      ? window.isPresetLengthMm(lengthMm, presets)
      : presets.indexOf(lengthMm) >= 0;
    const item = {
      id: uniqueId(factory, used),
      type: kind,
      a: a,
      b: b,
      aId: typeof ja.id === "string" ? ja.id : null,
      bId: typeof jb.id === "string" ? jb.id : null,
      mesh: mesh,
      lengthMm: lengthMm,
      material: src && src.material,
      isCustom: !isPreset,
      customLength: isPreset ? null : lengthMm,
    };
    list.push(item);
    return item;
  }

  function cloneLeg(src, jointIndex, used) {
    const js = joints();
    const j = js[jointIndex];
    if (!j) return null;
    const mesh = typeof window.createLegMeshForJointIndex === "function"
      ? window.createLegMeshForJointIndex(jointIndex)
      : null;
    const material = src && src.material;
    if (mesh && typeof window.applyMaterialColorToMesh === "function") {
      window.applyMaterialColorToMesh(mesh, material);
    }
    const leg = {
      id: uniqueId(window.newLegClientId, used),
      jointIndex: jointIndex,
      jointId: typeof j.id === "string" ? j.id : null,
      material: material,
      mesh: mesh,
    };
    if (Number.isFinite(src && src.height)) leg.height = src.height;
    legs().push(leg);
    return leg;
  }

  function showHint(message) {
    const host = ui();
    if (!host || typeof host.openPopup !== "function") return;
    host.openPopup(POP_ID, {
      title: "複製",
      hideApply: true,
      render: function (body) {
        const note = document.createElement("p");
        note.className = "v3-cmd-pop-note";
        note.textContent = message || HINT;
        body.appendChild(note);
      },
    });
  }

  function closeHint() {
    const host = ui();
    if (host && typeof host.getOpenPopupId === "function" && host.getOpenPopupId() === POP_ID) {
      host.closePopup("cancel");
    }
  }

  function finishToMove(jointIndex) {
    window.setDuplicateMode(false);
    if (typeof window.setMoveMode === "function") window.setMoveMode(true);
    const gz = window.v3MoveGizmo;
    if (gz && typeof gz.selectJoint === "function") gz.selectJoint(jointIndex);
    if (typeof window.setSelectedJoint === "function") window.setSelectedJoint(jointIndex);
    window.__CR_ACTIVE_JOINT_INDEX__ = jointIndex;
  }

  function duplicateByJointIndex(jointIndex) {
    const js = joints();
    if (typeof jointIndex !== "number" || jointIndex < 0 || !js[jointIndex]) {
      return { ok: false, reason: "JointBall をクリックしてください。" };
    }
    if (wl() && typeof wl().canSelectJoint === "function" && !wl().canSelectJoint(jointIndex)) {
      return { ok: false, reason: "非表示または選択できないラックです。" };
    }
    if (wl() && typeof wl().canEditJoint === "function" && !wl().canEditJoint(jointIndex)) {
      return { ok: false, reason: "ロック中のラックは複製できません。" };
    }

    const src = sourceIndices(jointIndex);
    if (!src.indices.length) return { ok: false, reason: "複製するラックが見つかりません。" };

    const srcSet = new Set(src.indices);
    const place = pickOffset(src.indices);
    if (!place.ok) return place;
    const offset = place.offset;

    const srcLayer = (function () {
      const st = wl() && typeof wl().getState === "function" ? wl().getState() : null;
      const rackId = src.rackId || rackIdOf(jointIndex);
      if (st && rackId && st.rackAssignments && st.rackAssignments[rackId]) return st.rackAssignments[rackId];
      return st && st.activeLayerId ? st.activeLayerId : null;
    })();

    const pre = typeof window.createSnapshot === "function" ? window.createSnapshot() : null;
    const used = collectUsedIds();
    const srcIds = {};
    src.indices.forEach(function (oldIdx) {
      const old = js[oldIdx];
      if (old && typeof old.id === "string") srcIds[old.id] = true;
    });
    const newRackId = uniqueId(function () { return newRawId("rack"); }, used);
    const indexMap = {};
    try {
    src.indices.forEach(function (oldIdx) {
      indexMap[oldIdx] = cloneJoint(js[oldIdx], offset, newRackId, used);
    });

    beams().slice().forEach(function (b) {
      if (!b) return;
      if (!srcSet.has(b.a) || !srcSet.has(b.b)) return;
      cloneConnector("beam", b, indexMap[b.a], indexMap[b.b], used);
    });
    poles().slice().forEach(function (p) {
      if (!p) return;
      if (!srcSet.has(p.a) || !srcSet.has(p.b)) return;
      cloneConnector("pole", p, indexMap[p.a], indexMap[p.b], used);
    });

    const manual = window.manualLegJointSet || new Set();
    legs().slice().forEach(function (leg) {
      if (!leg) return;
      let oldIdx = -1;
      if (typeof leg.jointId === "string" && leg.jointId) {
        oldIdx = js.findIndex(function (j) { return j && j.id === leg.jointId; });
      }
      if (oldIdx < 0 && typeof leg.jointIndex === "number") oldIdx = leg.jointIndex;
      if (!srcSet.has(oldIdx)) return;
      const copied = cloneLeg(leg, indexMap[oldIdx], used);
      if (copied && manual.has(oldIdx)) manual.add(copied.jointIndex);
    });

    shelves().slice().forEach(function (s) {
      if (!boardBelongs(s, srcSet)) return;
      const j4 = s.j4.map(function (i) { return indexMap[i]; });
      shelves().push({
        j4: j4,
        thicknessMm: Number(s.thicknessMm || 6),
        material: s.material || "足場板",
        mesh: null,
        cellKey: cellKeyOf(j4),
      });
    });
    panels().slice().forEach(function (p) {
      if (!boardBelongs(p, srcSet)) return;
      const j4 = p.j4.map(function (i) { return indexMap[i]; });
      panels().push({
        j4: j4,
        thicknessMm: Number(p.thicknessMm || 6),
        material: p.material || "足場板",
        side: p.side || "back",
        mesh: null,
      });
    });

    try { wl() && wl().syncRackIds && wl().syncRackIds(); } catch (e) {}
    if (srcLayer && wl() && typeof wl().assignRack === "function") {
      const liveId = joints()[indexMap[jointIndex]] && joints()[indexMap[jointIndex]].rackId;
      if (liveId) wl().assignRack(liveId, srcLayer);
    }
    try { window.rebuildBoards && window.rebuildBoards(); } catch (e) {}
    try { wl() && wl().refreshVisibility && wl().refreshVisibility(); } catch (e) {}
    try { window.syncLegsToConnectedJoints && window.syncLegsToConnectedJoints(); } catch (e) {}
    try { window.calcAndRenderEstimate && window.calcAndRenderEstimate(); } catch (e) {}
    try { window.requestEstimateRender && window.requestEstimateRender("duplicate rack"); } catch (e2) {}

    const newIndex = indexMap[jointIndex];
    const copied = joints()[newIndex];
    const srcNow = joints()[jointIndex];
    const copiedRackId = copied && copied.rackId;
    if (copied && srcIds[copied.id]) {
      throw new Error("id-collision");
    }
    if (srcNow && copiedRackId && srcNow.rackId === copiedRackId) {
      throw new Error("rack-collision");
    }
    return {
      ok: true,
      offset: offset,
      srcRackId: src.rackId || (srcNow && srcNow.rackId) || null,
      newRackId: copiedRackId,
      newJointIndex: newIndex,
      indexMap: indexMap,
    };
    } catch (e) {
      if (pre && typeof window.applySnapshotFromString === "function") {
        try { window.applySnapshotFromString(pre); } catch (e2) {}
      }
      return {
        ok: false,
        reason: e && e.message === "id-collision"
          ? "部材IDの再割当に失敗しました。"
          : e && e.message === "rack-collision"
            ? "複製先の rackId が元ラックと独立になりませんでした。"
            : "複製に失敗したため、元のラックを維持します。",
      };
    }
  }

  function runAt(jointIndex) {
    const result = duplicateByJointIndex(jointIndex);
    if (!result || !result.ok) {
      showHint((result && result.reason) || "複製できませんでした。");
      return result;
    }
    if (typeof window.saveHistory === "function") window.saveHistory("duplicate rack");
    finishToMove(result.newJointIndex);
    return result;
  }

  window.setDuplicateMode = function (on) {
    const next = !!on;
    const prev = !!window.isDuplicateModeOn;
    window.isDuplicateModeOn = next;
    if (prev && !next) closeHint();
    if (!prev && next) {
      try { if (window.isBoardModeOn) window.setBoardMode?.(false); } catch (e) {}
      try { if (window.isConnectModeOn) window.setConnectMode?.(false); } catch (e) {}
      try { if (window.isMoveModeOn) window.setMoveMode?.(false); } catch (e) {}
      try { if (window.isLengthEditModeOn) window.setLengthEditMode?.(false); } catch (e) {}
      try { if (window.isDeleteModeOn) window.setDeleteMode?.(false); } catch (e) {}
      try { if (window.isRotateModeOn) window.setRotateMode?.(false); } catch (e) {}
      try { window.setSelectedJoint?.(null); } catch (e2) {}
      try { window.hidePreview?.(); } catch (e3) {}
      try { window.hideLegPreview?.(); } catch (e4) {}
      try { window.hideBoardPreview?.(); } catch (e5) {}
      try { window.clearBoardSelection?.(); } catch (e6) {}
      showHint(HINT);
    }
    try { window.v3CadToolbar?.syncActive?.(); } catch (e7) {}
  };

  function isViewEvent(ev) {
    if (!ev || !ev.target) return false;
    if (ev.target.closest && ev.target.closest("#v3-cmd-pop, #v3-east-rail, .v3-toolbar, #v3-view-nav, #v3-layer-panel, #v3-radial, #v3-north")) {
      return false;
    }
    const canvas = window.v3CadOps && window.v3CadOps.canvas();
    if (canvas && (ev.target === canvas || (canvas.contains && canvas.contains(ev.target)))) return true;
    if (ev.target.id === "view") return true;
    if (ev.target.closest && ev.target.closest("#view")) return true;
    return false;
  }

  function jointIndexFromHit(hit) {
    if (!hit) return -1;
    if (hit.kind === "joint" && typeof hit.index === "number") return hit.index;
    return -1;
  }

  function onPointerDown(ev) {
    if (!window.isDuplicateModeOn) return;
    if (ev.button !== 0) return;
    if (!isViewEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const hit = window.v3CadOps && window.v3CadOps.pickAt(ev.clientX, ev.clientY);
    const idx = jointIndexFromHit(hit);
    if (idx < 0) {
      showHint("JointBall をクリックしてください。");
      return;
    }
    runAt(idx);
  }

  function onClick(ev) {
    if (!window.isDuplicateModeOn) return;
    if (!isViewEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && window.isDuplicateModeOn) {
      ev.preventDefault();
      window.setDuplicateMode(false);
    }
  }, true);

  window.v3Duplicate = {
    duplicateByJointIndex: duplicateByJointIndex,
    duplicateAt: runAt,
    pickOffset: pickOffset,
    sourceIndices: sourceIndices,
  };
})();
