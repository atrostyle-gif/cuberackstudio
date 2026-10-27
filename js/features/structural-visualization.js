/* Phase 5: developer/reference structural-analysis coordinator.  No CAD data is altered. */
(function (global) {
  "use strict";
  const stateApi = global.CubeRackStructuralUiState;
  const COLORS = { safe: 0x22c55e, warning: 0xf59e0b, fail: 0xef4444, unknown: 0x64748b, error: 0xa855f7, support: 0x38bdf8 };
  let state = stateApi ? stateApi.empty() : null;
  let result = null;
  let runVersion = 0;
  let timer = null;
  let overlay = null;
  let lastDurationMs = 0;
  let selectionSyncTimer = null;
  let lastSelectionKey = "";

  function ids() {
    const joints = Array.isArray(global.joints) ? global.joints : [];
    const beams = Array.isArray(global.beams) ? global.beams : [];
    const shelves = Array.isArray(global.shelves) ? global.shelves : [];
    return {
      jointIds: joints.map(function (x) { return x && x.id; }).filter(Boolean),
      beamIds: beams.map(function (x) { return x && x.id; }).filter(Boolean),
      shelfIds: shelves.map(function (x) { return x && x.id; }).filter(Boolean),
    };
  }
  function ensureShelfIds() {
    (global.shelves || []).forEach(function (shelf, index) {
      if (!shelf || shelf.id) return;
      const make = typeof global.__v3IdGenerator === "function" ? global.__v3IdGenerator : null;
      shelf.id = make ? make("shelf") : "shelf-" + Date.now().toString(36) + "-" + index;
    });
  }
  function refreshState() {
    ensureShelfIds();
    state = stateApi.normalize(state, ids());
    return state;
  }
  function supportMesh(joint, color) {
    if (!global.THREE || !joint) return null;
    const geometry = new global.THREE.SphereGeometry(13, 12, 8);
    const material = new global.THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.86, depthTest: false });
    const mesh = new global.THREE.Mesh(geometry, material);
    mesh.position.set(joint.x, joint.y, joint.z);
    return mesh;
  }
  function lineMesh(a, b, color) {
    if (!global.THREE || !a || !b) return null;
    const geometry = new global.THREE.BufferGeometry().setFromPoints([
      new global.THREE.Vector3(a.x, a.y, a.z), new global.THREE.Vector3(b.x, b.y, b.z),
    ]);
    const material = new global.THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95, depthTest: false });
    return new global.THREE.Line(geometry, material);
  }
  function disposeOverlay() {
    if (!overlay) return;
    overlay.traverse(function (item) {
      if (item.geometry) item.geometry.dispose();
      if (item.material) item.material.dispose();
    });
    if (overlay.parent) overlay.parent.remove(overlay);
    overlay = null;
  }
  function colorForMember(member) {
    if (!member || member.status === "UNKNOWN") return COLORS.unknown;
    if (member.status === "INPUT_ERROR") return COLORS.error;
    const u = member.utilization;
    if (!Number.isFinite(u)) return COLORS.unknown;
    if (u > 1) return COLORS.fail;
    if (u >= 0.8) return COLORS.warning;
    return COLORS.safe;
  }
  function memberUsage() {
    const out = {};
    if (!result) return out;
    (result.knownMemberChecks || []).forEach(function (check) {
      const id = String(check.id || "").split(":")[1];
      if (!id) return;
      const before = out[id];
      if (!before || (Number(check.utilization) || -1) > (Number(before.utilization) || -1)) out[id] = check;
    });
    Object.keys(result.poleResults || {}).forEach(function (id) {
      const p = result.poleResults[id];
      if (p && p.bucklingStatus === "UNKNOWN") out[id] = { id: "pole:" + id, status: "UNKNOWN" };
    });
    return out;
  }
  function renderOverlay() {
    disposeOverlay();
    if (!state || !state.overlayVisible || !global.THREE || !global.rackGroup) return;
    const group = new global.THREE.Group();
    group.name = "CubeRackStructuralReferenceOverlay";
    const usage = memberUsage();
    const invalid = result && result.status === "INPUT_ERROR" ? { status: "INPUT_ERROR" } : null;
    const joints = global.joints || [];
    (global.beams || []).forEach(function (beam) {
      const mesh = lineMesh(joints[beam.a], joints[beam.b], colorForMember(usage[beam.id] || invalid));
      if (mesh) group.add(mesh);
    });
    (global.poles || []).forEach(function (pole) {
      const mesh = lineMesh(joints[pole.a], joints[pole.b], colorForMember(usage[pole.id] || invalid));
      if (mesh) group.add(mesh);
    });
    const supported = new Set(state.floorSupportJointIds || []);
    joints.forEach(function (joint) {
      if (joint && supported.has(joint.id)) { const mesh = supportMesh(joint, COLORS.support); if (mesh) group.add(mesh); }
    });
    global.rackGroup.add(group);
    overlay = group;
  }
  function calculate(reason) {
    const mine = ++runVersion;
    refreshState();
    if (!global.getCubeRackStructuralAnalysis || !stateApi) return null;
    const request = stateApi.buildRequest(state, ids().shelfIds);
    const started = (global.performance && performance.now) ? performance.now() : Date.now();
    let next;
    if (request.issues.length) {
      next = { status: "INPUT_ERROR", completeRackStatus: "INPUT_ERROR", errors: request.issues, beamResults: {}, poleResults: {}, jointResults: {}, unknownReasons: [] };
    } else {
      next = global.getCubeRackStructuralAnalysis({
        floorSupportJointIds: state.floorSupportJointIds,
        shelfLoads: request.shelfLoads,
        effectiveLengthFactor: state.effectiveLengthFactor,
        referenceLimits: state.referenceLimits.maxBendingStressMPa && state.referenceLimits.maxDeflectionRatio ? state.referenceLimits : undefined,
      });
    }
    lastDurationMs = ((global.performance && performance.now) ? performance.now() : Date.now()) - started;
    if (mine !== runVersion) return null;
    result = next;
    renderOverlay();
    global.dispatchEvent(new CustomEvent("cuberack:structural-analysis-updated", { detail: { result: result, durationMs: lastDurationMs, reason: reason || "" } }));
    return result;
  }
  function schedule(reason) {
    const requested = ++runVersion;
    if (timer) global.clearTimeout(timer);
    timer = global.setTimeout(function () {
      timer = null;
      const run = function () { if (requested === runVersion) calculate(reason); };
      if (typeof global.requestIdleCallback === "function") global.requestIdleCallback(run, { timeout: 250 });
      else global.setTimeout(run, 0);
    }, 150);
  }
  function setOverlayVisible(value) {
    refreshState();
    state.overlayVisible = !!value;
    if (state.overlayVisible) calculate("overlay enabled"); else disposeOverlay();
    global.dispatchEvent(new CustomEvent("cuberack:structural-analysis-updated", { detail: { result: result, durationMs: lastDurationMs, reason: "overlay" } }));
  }
  function snapshot() { refreshState(); return stateApi.snapshot(state); }
  function loadFromSnapshot(data) { state = stateApi.normalize(data && data.structuralAnalysis, ids()); result = null; disposeOverlay(); if (state.overlayVisible) schedule("load"); }
  function validSelection(selection) {
    if (!selection || (selection.type !== "beam" && selection.type !== "pole") || !Number.isInteger(selection.index) || selection.index < 0) return null;
    return { type: selection.type, index: selection.index };
  }
  function selectionFromMultiSelect() {
    const multi = global.v3MultiSelect;
    if (!multi || typeof multi.get !== "function") return { available: false, selection: null };
    let selected;
    try { selected = multi.get(); } catch (_) { return { available: true, selection: null }; }
    if (!Array.isArray(selected) || selected.length !== 1) return { available: true, selection: null };
    const item = selected[0];
    return { available: true, selection: validSelection(item && { type: item.kind, index: item.index }) };
  }
  function currentSelection(legacySelection) {
    const fromMulti = selectionFromMultiSelect();
    // v3MultiSelect がある通常環境では、空選択も含めてその状態を唯一の参照元にする。
    return fromMulti.available ? fromMulti.selection : validSelection(legacySelection || global.selectedConnector);
  }
  function selectionKey(selection) { return selection ? selection.type + ":" + selection.index : ""; }
  function detailsForSelection(legacySelection) {
    const selection = currentSelection(legacySelection);
    if (!selection || !result) return null;
    const list = selection.type === "pole" ? global.poles : global.beams;
    const item = list && list[selection.index];
    if (!item) return null;
    const raw = selection.type === "pole" ? (result.poleResults || {})[item.id] : (result.beamResults || {})[item.id];
    const usage = memberUsage()[item.id] || null;
    return { type: selection.type, id: item.id, result: raw || null, usage: usage };
  }
  function onSelectionChanged() {
    global.dispatchEvent(new CustomEvent("cuberack:structural-selection", { detail: detailsForSelection() }));
  }
  function syncSelectionAfterCadEvent() {
    if (selectionSyncTimer !== null) return;
    // multi-select の capture 処理より後のタスクで読む。古い選択状態を参照しないための遅延。
    selectionSyncTimer = global.setTimeout(function () {
      selectionSyncTimer = null;
      const key = selectionKey(currentSelection());
      if (key === lastSelectionKey) return;
      lastSelectionKey = key;
      onSelectionChanged();
    }, 0);
  }
  // v3-multi-select の選択内容は非公開状態なので、既存CADの処理完了後に読み取るだけにする。
  global.addEventListener("pointerdown", syncSelectionAfterCadEvent, true);
  global.addEventListener("click", syncSelectionAfterCadEvent, true);
  global.addEventListener("keydown", syncSelectionAfterCadEvent, true);
  global.v3StructuralAnalysis = {
    getState: function () { return state; }, getResult: function () { return result; }, getLastDurationMs: function () { return lastDurationMs; },
    snapshot: snapshot, loadFromSnapshot: loadFromSnapshot, schedule: schedule, calculate: calculate, setOverlayVisible: setOverlayVisible,
    setShelfInput: function (id, input) { refreshState(); const ok = stateApi.setShelfInput(state, id, input); if (ok) schedule("shelf input"); return ok; },
    setFloorSupportJointIds: function (idsIn) { refreshState(); state.floorSupportJointIds = Array.isArray(idsIn) ? idsIn.slice() : []; schedule("floor support"); },
    setEffectiveLengthFactor: function (k) { refreshState(); state.effectiveLengthFactor = Number.isFinite(Number(k)) && Number(k) > 0 ? Number(k) : null; schedule("K value"); },
    setReferenceLimits: function (limits) { refreshState(); state.referenceLimits = stateApi.normalize({ referenceLimits: limits }).referenceLimits; schedule("reference limits"); },
    onSelectionChanged: onSelectionChanged, detailsForSelection: detailsForSelection, refresh: function () { refreshState(); renderOverlay(); },
  };
})(window);
