// 作業レイヤーとラック安定ID。
// visible / locked の親子判定と、部材レイヤーを重ねた表示更新をここで行う。
(function () {
  const state = {
    workLayers: [],
    activeLayerId: null,
    rackAssignments: {},
  };

  function newId(prefix) {
    let uuid = null;
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        uuid = crypto.randomUUID();
      }
    } catch (e) {}
    if (!uuid) uuid = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    return prefix + "-" + uuid;
  }

  function layerExists(id) {
    return state.workLayers.some((layer) => layer && layer.id === id);
  }

  function ensureDefaultLayer() {
    if (!state.workLayers.length) {
      const id = newId("layer");
      state.workLayers.push({
        id: id,
        parentId: null,
        name: "メイン",
        order: 0,
        visible: true,
        locked: false,
      });
      state.activeLayerId = id;
    }
    if (!layerExists(state.activeLayerId)) {
      state.activeLayerId = state.workLayers[0].id;
    }
  }

  function sanitizeLayers(raw) {
    if (!Array.isArray(raw)) return null;
    const list = [];
    const seen = {};
    raw.forEach((item) => {
      if (!item || typeof item.id !== "string" || !item.id || seen[item.id]) return;
      seen[item.id] = true;
      list.push({
        id: item.id,
        parentId: typeof item.parentId === "string" && item.parentId ? item.parentId : null,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 80) : "レイヤー",
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : list.length,
        visible: item.visible !== false,
        locked: item.locked === true,
      });
    });
    if (!list.length) return null;
    const ids = {};
    list.forEach((layer) => { ids[layer.id] = true; });
    list.forEach((layer) => {
      if (!layer.parentId || !ids[layer.parentId] || layer.parentId === layer.id) layer.parentId = null;
    });
    list.forEach((layer) => {
      const walked = {};
      let cur = layer;
      while (cur && cur.parentId) {
        if (walked[cur.id]) {
          layer.parentId = null;
          break;
        }
        walked[cur.id] = true;
        const parentId = cur.parentId;
        cur = null;
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === parentId) { cur = list[i]; break; }
        }
      }
    });
    return list;
  }

  function loadFromSnapshot(data) {
    const layers = sanitizeLayers(data && data.workLayers);
    if (!layers) {
      state.workLayers = [];
      state.activeLayerId = null;
      state.rackAssignments = {};
      ensureDefaultLayer();
      return;
    }
    state.workLayers = layers;
    state.activeLayerId = layerExists(data.activeLayerId) ? data.activeLayerId : layers[0].id;
    const assignments = {};
    const raw = data.rackAssignments;
    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach((rackId) => {
        const layerId = raw[rackId];
        if (typeof rackId === "string" && rackId && typeof layerId === "string" && layerExists(layerId)) {
          assignments[rackId] = layerId;
        }
      });
    }
    state.rackAssignments = assignments;
  }

  function componentsOf(joints, beams, poles) {
    const n = joints.length;
    const adj = new Array(n);
    for (let i = 0; i < n; i++) adj[i] = [];
    function link(list) {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item) continue;
        const a = item.a;
        const b = item.b;
        if (typeof a !== "number" || typeof b !== "number") continue;
        if (a < 0 || b < 0 || a >= n || b >= n || a === b) continue;
        adj[a].push(b);
        adj[b].push(a);
      }
    }
    link(beams);
    link(poles);
    const seen = new Array(n).fill(false);
    const comps = [];
    for (let i = 0; i < n; i++) {
      if (seen[i] || !joints[i]) continue;
      const indices = [];
      const queue = [i];
      seen[i] = true;
      while (queue.length) {
        const cur = queue.pop();
        indices.push(cur);
        const next = adj[cur];
        for (let k = 0; k < next.length; k++) {
          const nb = next[k];
          if (!seen[nb]) {
            seen[nb] = true;
            queue.push(nb);
          }
        }
      }
      indices.sort((a, b) => a - b);
      const counts = new Map();
      for (let k = 0; k < indices.length; k++) {
        const rackId = joints[indices[k]] && joints[indices[k]].rackId;
        if (typeof rackId === "string" && rackId) counts.set(rackId, (counts.get(rackId) || 0) + 1);
      }
      comps.push({ indices: indices, counts: counts, minIndex: indices[0] });
    }
    return comps;
  }

  function syncRackIds() {
    ensureDefaultLayer();
    const joints = window.joints || [];
    const comps = componentsOf(joints, window.beams, window.poles);
    const rackToComps = {};
    comps.forEach((comp, ci) => {
      comp.counts.forEach((_n, rackId) => {
        if (!rackToComps[rackId]) rackToComps[rackId] = [];
        rackToComps[rackId].push(ci);
      });
    });
    const keeper = {};
    Object.keys(rackToComps).forEach((rackId) => {
      const list = rackToComps[rackId];
      let best = list[0];
      for (let i = 1; i < list.length; i++) {
        const ci = list[i];
        const bestN = comps[best].counts.get(rackId) || 0;
        const n = comps[ci].counts.get(rackId) || 0;
        if (n > bestN || (n === bestN && comps[ci].minIndex < comps[best].minIndex)) best = ci;
      }
      keeper[rackId] = best;
    });

    comps.forEach((comp, ci) => {
      let bestId = null;
      let bestN = -1;
      comp.counts.forEach((n, rackId) => {
        if (keeper[rackId] !== ci) return;
        if (n > bestN || (n === bestN && (bestId == null || rackId < bestId))) {
          bestN = n;
          bestId = rackId;
        }
      });
      let layerId = bestId ? state.rackAssignments[bestId] : null;
      if (!layerId) {
        comp.counts.forEach((_n, rackId) => {
          if (!layerId && state.rackAssignments[rackId]) layerId = state.rackAssignments[rackId];
        });
      }
      if (!layerId || !layerExists(layerId)) layerId = state.activeLayerId;
      if (!bestId) bestId = newId("rack");
      state.rackAssignments[bestId] = layerId;
      for (let i = 0; i < comp.indices.length; i++) {
        const joint = joints[comp.indices[i]];
        if (joint) joint.rackId = bestId;
      }
    });

    const used = {};
    for (let i = 0; i < joints.length; i++) {
      const rackId = joints[i] && joints[i].rackId;
      if (typeof rackId === "string" && rackId) used[rackId] = true;
    }
    Object.keys(state.rackAssignments).forEach((rackId) => {
      if (!used[rackId]) delete state.rackAssignments[rackId];
    });
  }

  function assignNewJoint(joint) {
    if (!joint || typeof joint !== "object") return;
    ensureDefaultLayer();
    if (typeof joint.rackId === "string" && joint.rackId && state.rackAssignments[joint.rackId]) return;
    const rackId = newId("rack");
    joint.rackId = rackId;
    state.rackAssignments[rackId] = state.activeLayerId;
  }

  function canConnectJoints(aIndex, bIndex) {
    const joints = window.joints || [];
    const a = joints[aIndex];
    const b = joints[bIndex];
    if (!a || !b) return false;
    if (!a.rackId || !b.rackId || a.rackId === b.rackId) return true;
    const layerA = state.rackAssignments[a.rackId];
    const layerB = state.rackAssignments[b.rackId];
    if (layerA && layerB && layerA !== layerB) return false;
    return true;
  }

  function snapshotFields() {
    return {
      workLayers: state.workLayers.map((layer) => ({
        id: layer.id,
        parentId: layer.parentId,
        name: layer.name,
        order: layer.order,
        visible: layer.visible !== false,
        locked: layer.locked === true,
      })),
      activeLayerId: state.activeLayerId,
      rackAssignments: Object.assign({}, state.rackAssignments),
    };
  }

  function addLayer(opts) {
    ensureDefaultLayer();
    const parentId = opts && typeof opts.parentId === "string" ? opts.parentId : null;
    if (parentId && !layerExists(parentId)) return null;
    const id = newId("layer");
    const siblings = childrenOf(parentId);
    let nextOrder = 0;
    for (let i = 0; i < siblings.length; i++) {
      const n = Number(siblings[i].order);
      if (Number.isFinite(n) && n >= nextOrder) nextOrder = n + 1;
    }
    state.workLayers.push({
      id: id,
      parentId: parentId,
      name: opts && typeof opts.name === "string" && opts.name.trim() ? opts.name.trim().slice(0, 80) : "レイヤー",
      order: nextOrder,
      visible: opts && opts.visible === false ? false : true,
      locked: !!(opts && opts.locked),
    });
    return id;
  }

  function assignRack(rackId, layerId) {
    if (typeof rackId !== "string" || !state.rackAssignments[rackId]) return false;
    if (!layerExists(layerId)) return false;
    state.rackAssignments[rackId] = layerId;
    return true;
  }

  function uniqueRackIdsFromIndexes(indexes) {
    const seen = {};
    const ids = [];
    const joints = window.joints || [];
    (indexes || []).forEach((index) => {
      const joint = joints[index];
      const rackId = joint && joint.rackId;
      if (typeof rackId === "string" && rackId && !seen[rackId]) {
        seen[rackId] = true;
        ids.push(rackId);
      }
    });
    return ids;
  }

  function selectedRackIds() {
    const indexes = [];
    const ms = window.v3MultiSelect;
    const selected = ms && typeof ms.get === "function" ? ms.get() : [];
    if (selected && selected.length) {
      selected.forEach((item) => {
        const found = indexesOf(item.kind, item.index);
        for (let i = 0; i < found.length; i++) indexes.push(found[i]);
      });
    } else {
      const active = window.__CR_ACTIVE_JOINT_INDEX__;
      if (typeof active === "number" && active >= 0) indexes.push(active);
    }
    return uniqueRackIdsFromIndexes(indexes);
  }

  function moveRacksToLayer(rackIds, destLayerId) {
    if (!layerExists(destLayerId)) {
      console.warn("[work-layers] refused rack move: missing dest");
      return { ok: false, moved: 0, reason: "missing-dest" };
    }
    if (!effectiveVisible(destLayerId) || effectiveLocked(destLayerId)) {
      console.warn("[work-layers] refused rack move: dest protected");
      return { ok: false, moved: 0, reason: "dest-protected" };
    }
    const ids = [];
    const seen = {};
    (Array.isArray(rackIds) ? rackIds : []).forEach((rackId) => {
      if (typeof rackId === "string" && rackId && !seen[rackId]) {
        seen[rackId] = true;
        ids.push(rackId);
      }
    });
    if (!ids.length) return { ok: false, moved: 0, reason: "none" };
    for (let i = 0; i < ids.length; i++) {
      const rackId = ids[i];
      if (!state.rackAssignments[rackId]) {
        console.warn("[work-layers] refused rack move: unknown rack");
        return { ok: false, moved: 0, reason: "unknown-rack" };
      }
      if (!canEditRack(rackId)) {
        console.warn("[work-layers] refused rack move: source protected");
        return { ok: false, moved: 0, reason: "source-protected" };
      }
    }
    const changing = ids.filter((rackId) => state.rackAssignments[rackId] !== destLayerId);
    if (!changing.length) return { ok: true, moved: 0, reason: "same-layer" };
    changing.forEach((rackId) => {
      state.rackAssignments[rackId] = destLayerId;
    });
    refreshVisibility();
    return { ok: true, moved: changing.length };
  }

  function compareLayerOrder(a, b) {
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
    if (ao !== bo) return ao - bo;
    return String(a.name || "").localeCompare(String(b.name || ""), "ja");
  }

  function childrenOf(parentId) {
    const pid = parentId || null;
    return state.workLayers
      .filter((layer) => (layer.parentId || null) === pid)
      .slice()
      .sort(compareLayerOrder);
  }

  function isDescendantOf(id, ancestorId) {
    if (!id || !ancestorId || id === ancestorId) return false;
    const seen = {};
    let cur = findLayer(id);
    while (cur && cur.parentId) {
      if (seen[cur.id]) return false;
      seen[cur.id] = true;
      if (cur.parentId === ancestorId) return true;
      cur = findLayer(cur.parentId);
    }
    return false;
  }

  function normalizeSiblingOrders(parentId) {
    childrenOf(parentId).forEach((layer, index) => {
      layer.order = index;
    });
  }

  function moveLayer(id, destParentId, beforeId, opts) {
    const layer = findLayer(id);
    if (!layer) return { ok: false, moved: 0, reason: "missing" };
    const nextParent = destParentId || null;
    if (nextParent === id || isDescendantOf(nextParent, id)) {
      return { ok: false, moved: 0, reason: "cycle" };
    }
    if (nextParent && !layerExists(nextParent)) {
      return { ok: false, moved: 0, reason: "missing-parent" };
    }
    const oldParent = layer.parentId || null;
    const asChild = !!(opts && opts.asChild);
    if (asChild && oldParent === nextParent) {
      return { ok: true, moved: 0, reason: "same-place" };
    }
    const destList = state.workLayers
      .filter((item) => item && item.id !== id && (item.parentId || null) === nextParent)
      .slice()
      .sort(compareLayerOrder);
    let insertAt = destList.length;
    if (!asChild && typeof beforeId === "string" && beforeId) {
      const idx = destList.findIndex((item) => item.id === beforeId);
      if (idx >= 0) insertAt = idx;
    }
    if (oldParent === nextParent) {
      const current = childrenOf(oldParent);
      const currentIndex = current.findIndex((item) => item.id === id);
      if (currentIndex === insertAt) {
        return { ok: true, moved: 0, reason: "same-place" };
      }
    }
    layer.parentId = nextParent;
    destList.splice(insertAt, 0, layer);
    destList.forEach((item, index) => {
      item.order = index;
    });
    if (oldParent !== nextParent) normalizeSiblingOrders(oldParent);
    refreshVisibility();
    return { ok: true, moved: 1 };
  }

  function rackCount(layerId) {
    return rackIdsInLayer(layerId).length;
  }

  function rackIdsInLayer(layerId) {
    const out = [];
    Object.keys(state.rackAssignments).forEach((rackId) => {
      if (state.rackAssignments[rackId] === layerId) out.push(rackId);
    });
    out.sort();
    return out;
  }

  function rootLayerId() {
    ensureDefaultLayer();
    const roots = childrenOf(null);
    return (roots[0] || state.workLayers[0]).id;
  }

  function setActiveLayer(id) {
    if (!layerExists(id)) return false;
    state.activeLayerId = id;
    return true;
  }

  function renameLayer(id, name) {
    const layer = findLayer(id);
    if (!layer) return false;
    const next = typeof name === "string" ? name.trim().slice(0, 80) : "";
    if (!next) return false;
    layer.name = next;
    return true;
  }

  function deleteLayer(id) {
    ensureDefaultLayer();
    const layer = findLayer(id);
    if (!layer) return false;
    if (state.workLayers.length <= 1) return false;
    const parentId = layer.parentId || null;
    const remaining = state.workLayers.filter((item) => item && item.id !== id);
    let dest = parentId && remaining.some((item) => item.id === parentId) ? parentId : null;
    if (!dest) {
      const roots = remaining.filter((item) => !item.parentId);
      dest = (roots[0] || remaining[0]).id;
    }
    remaining.forEach((item) => {
      if (item.parentId === id) item.parentId = parentId;
    });
    Object.keys(state.rackAssignments).forEach((rackId) => {
      if (state.rackAssignments[rackId] === id) state.rackAssignments[rackId] = dest;
    });
    state.workLayers = remaining;
    if (state.activeLayerId === id) state.activeLayerId = dest;
    const cleaned = sanitizeLayers(state.workLayers);
    if (cleaned) state.workLayers = cleaned;
    if (!layerExists(state.activeLayerId) && state.workLayers[0]) {
      state.activeLayerId = state.workLayers[0].id;
    }
    refreshVisibility();
    return true;
  }

  function layerView(id) {
    const layer = findLayer(id);
    if (!layer) return null;
    const ownVisible = layer.visible !== false;
    const ownLocked = layer.locked === true;
    const vis = effectiveVisible(id);
    const loc = effectiveLocked(id);
    return {
      id: layer.id,
      ownVisible: ownVisible,
      ownLocked: ownLocked,
      effectiveVisible: vis,
      effectiveLocked: loc,
      inheritedHidden: ownVisible && !vis,
      inheritedLocked: !ownLocked && loc,
    };
  }

  function getState() {
    return {
      workLayers: state.workLayers.map((layer) => Object.assign({}, layer)),
      activeLayerId: state.activeLayerId,
      rackAssignments: Object.assign({}, state.rackAssignments),
    };
  }

  function findLayer(id) {
    for (let i = 0; i < state.workLayers.length; i++) {
      if (state.workLayers[i] && state.workLayers[i].id === id) return state.workLayers[i];
    }
    return null;
  }

  function effectiveVisible(layerId) {
    const seen = {};
    let id = layerId;
    while (id) {
      if (seen[id]) return false;
      seen[id] = true;
      const layer = findLayer(id);
      if (!layer) return true;
      if (layer.visible === false) return false;
      id = layer.parentId;
    }
    return true;
  }

  function effectiveLocked(layerId) {
    const seen = {};
    let id = layerId;
    while (id) {
      if (seen[id]) return true;
      seen[id] = true;
      const layer = findLayer(id);
      if (!layer) return false;
      if (layer.locked === true) return true;
      id = layer.parentId;
    }
    return false;
  }

  function isRackVisible(rackId) {
    if (typeof rackId !== "string" || !rackId) return true;
    const layerId = state.rackAssignments[rackId];
    if (!layerId) return true;
    return effectiveVisible(layerId);
  }

  function isRackLocked(rackId) {
    if (typeof rackId !== "string" || !rackId) return false;
    const layerId = state.rackAssignments[rackId];
    if (!layerId) return false;
    return effectiveLocked(layerId);
  }

  function canEditRack(rackId) {
    return isRackVisible(rackId) && !isRackLocked(rackId);
  }

  function canEditJoint(index) {
    const joints = window.joints || [];
    const joint = joints[index];
    if (!joint) return false;
    return canEditRack(joint.rackId);
  }

  function canSelectJoint(index) {
    const joints = window.joints || [];
    const joint = joints[index];
    if (!joint) return false;
    return isRackVisible(joint.rackId);
  }

  function indexesOf(kind, index) {
    if (kind === "joint") return [index];
    if (kind === "beam" || kind === "pole") {
      const list = kind === "beam" ? window.beams : window.poles;
      const item = list && list[index];
      const out = [];
      if (item && typeof item.a === "number") out.push(item.a);
      if (item && typeof item.b === "number") out.push(item.b);
      return out;
    }
    if (kind === "shelf" || kind === "panel" || kind === "wall") {
      const list = kind === "shelf" ? window.shelves : window.panels;
      const item = list && list[index];
      return item && Array.isArray(item.j4) ? item.j4.slice() : [];
    }
    return [];
  }

  function canEditIndexes(indexes) {
    if (!indexes || !indexes.length) return false;
    for (let i = 0; i < indexes.length; i++) {
      if (!canEditJoint(indexes[i])) return false;
    }
    return true;
  }

  function canSelectIndexes(indexes) {
    if (!indexes || !indexes.length) return false;
    for (let i = 0; i < indexes.length; i++) {
      if (!canSelectJoint(indexes[i])) return false;
    }
    return true;
  }

  function canEditItem(kind, index) {
    return canEditIndexes(indexesOf(kind, index));
  }

  function canSelectItem(kind, index) {
    return canSelectIndexes(indexesOf(kind, index));
  }

  function canEditActiveLayer() {
    ensureDefaultLayer();
    return effectiveVisible(state.activeLayerId) && !effectiveLocked(state.activeLayerId);
  }

  function hasProtectedRack() {
    const joints = window.joints || [];
    for (let i = 0; i < joints.length; i++) {
      if (joints[i] && !canEditJoint(i)) return true;
    }
    return false;
  }

  function setLayerVisible(id, on) {
    const layer = findLayer(id);
    if (!layer) return false;
    layer.visible = !!on;
    refreshVisibility();
    return true;
  }

  function setLayerLocked(id, on) {
    const layer = findLayer(id);
    if (!layer) return false;
    layer.locked = !!on;
    return true;
  }

  function refreshVisibility() {
    if (window.v3LayerPanel && typeof window.v3LayerPanel.applyVisibility === "function") {
      window.v3LayerPanel.applyVisibility();
      return;
    }
    applyCombinedVisibility({ frame: true, beam: true, pole: true, joint: true, leg: true, shelf: true, wall: true });
  }

  function normalizePartVis(partVis) {
    const raw = partVis && typeof partVis === "object" ? partVis : {};
    return {
      frame: raw.frame !== false,
      beam: raw.beam !== false,
      pole: raw.pole !== false,
      joint: raw.joint !== false,
      leg: raw.leg !== false,
      shelf: raw.shelf !== false,
      wall: raw.wall !== false,
    };
  }

  function effectivePartVis(partVis) {
    const p = normalizePartVis(partVis);
    return {
      beam: p.frame && p.beam,
      pole: p.frame && p.pole,
      joint: p.frame && p.joint,
      leg: p.frame && p.leg,
      shelf: p.shelf,
      wall: p.wall,
    };
  }

  function flushInstanceVisibility() {
    const pool = window.v3InstancePool;
    if (!pool) return;
    if (typeof pool.note === "function") pool.note();
    if (typeof pool.sync === "function") pool.sync(true);
  }

  function applyCombinedVisibility(partVis) {
    const part = effectivePartVis(partVis);
    const joints = window.joints || [];
    function rackOf(index) {
      const joint = joints[index];
      return joint && joint.rackId;
    }
    function showRack(rackId, partOn) {
      return !!partOn && isRackVisible(rackId);
    }
    (window.beams || []).forEach((beam) => {
      if (!beam || !beam.mesh) return;
      const rackId = rackOf(beam.a) || rackOf(beam.b);
      beam.mesh.visible = showRack(rackId, part.beam);
    });
    (window.poles || []).forEach((pole) => {
      if (!pole || !pole.mesh) return;
      const rackId = rackOf(pole.a) || rackOf(pole.b);
      pole.mesh.visible = showRack(rackId, part.pole);
    });
    (window.jointMeshes || []).forEach((mesh, index) => {
      if (!mesh) return;
      mesh.visible = showRack(rackOf(index), part.joint);
    });
    (window.legs || []).forEach((leg) => {
      if (!leg || !leg.mesh) return;
      leg.mesh.visible = showRack(rackOf(leg.jointIndex), part.leg);
    });
    function showBoard(item, partOn) {
      if (!item || !item.mesh) return;
      const j4 = Array.isArray(item.j4) ? item.j4 : [];
      let visible = !!partOn;
      for (let i = 0; i < j4.length; i++) {
        if (!isRackVisible(rackOf(j4[i]))) visible = false;
      }
      item.mesh.visible = visible;
    }
    (window.shelves || []).forEach((shelf) => showBoard(shelf, part.shelf));
    (window.panels || []).forEach((panel) => showBoard(panel, part.wall));

    flushInstanceVisibility();

    const active = window.__CR_ACTIVE_JOINT_INDEX__;
    if (typeof active === "number" && !canSelectJoint(active)) {
      try { window.setSelectedJoint?.(null); } catch (e) {}
      window.__CR_ACTIVE_JOINT_INDEX__ = null;
      try { window.hidePreview?.(); } catch (e) {}
    }
    try { window.v3MultiSelect?.dropUnselectable?.(); } catch (e) {}
  }

  window.v3WorkLayers = {
    loadFromSnapshot: loadFromSnapshot,
    syncRackIds: syncRackIds,
    assignNewJoint: assignNewJoint,
    canConnectJoints: canConnectJoints,
    snapshotFields: snapshotFields,
    addLayer: addLayer,
    moveLayer: moveLayer,
    setActiveLayer: setActiveLayer,
    renameLayer: renameLayer,
    deleteLayer: deleteLayer,
    childrenOf: childrenOf,
    rackCount: rackCount,
    rackIdsInLayer: rackIdsInLayer,
    rootLayerId: rootLayerId,
    layerView: layerView,
    assignRack: assignRack,
    selectedRackIds: selectedRackIds,
    moveRacksToLayer: moveRacksToLayer,
    getState: getState,
    effectiveVisible: effectiveVisible,
    effectiveLocked: effectiveLocked,
    isRackVisible: isRackVisible,
    isRackLocked: isRackLocked,
    canEditRack: canEditRack,
    canEditJoint: canEditJoint,
    canSelectJoint: canSelectJoint,
    canEditItem: canEditItem,
    canSelectItem: canSelectItem,
    canEditIndexes: canEditIndexes,
    canEditActiveLayer: canEditActiveLayer,
    hasProtectedRack: hasProtectedRack,
    setLayerVisible: setLayerVisible,
    setLayerLocked: setLayerLocked,
    applyCombinedVisibility: applyCombinedVisibility,
    refreshVisibility: refreshVisibility,
    normalizePartVis: normalizePartVis,
    effectivePartVis: effectivePartVis,
    flushInstanceVisibility: flushInstanceVisibility,
  };
})();
