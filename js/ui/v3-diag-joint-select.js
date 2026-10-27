// =========================================================
// JB選択ハイライト診断（読み取り専用）
// コンソール: v3DiagJointSelect.help()
// =========================================================
(function () {
  const captures = {};
  const events = [];
  let auto = false;
  const MAX_EVENTS = 40;

  function now() {
    return Date.now();
  }

  function descSelected() {
    try {
      const d = Object.getOwnPropertyDescriptor(window, "selectedJointIndex");
      return d
        ? { hasGetter: typeof d.get === "function", hasSetter: typeof d.set === "function", writable: !!d.writable, valueType: typeof window.selectedJointIndex }
        : { missing: true };
    } catch (e) {
      return { error: String(e && e.message) };
    }
  }

  function fnFlags(fn) {
    if (typeof fn !== "function") return { present: false };
    return {
      present: true,
      wrappedNorth: !!fn.__v3NorthWrapped,
      wrappedLayer: !!fn.__v3LayerWrapped,
      wrappedInst: !!fn.__v3InstWrapped,
      mentionsSelJoint: Function.prototype.toString.call(fn).indexOf("selJointMesh") >= 0,
    };
  }

  function allJointsBrief() {
    const joints = window.joints || [];
    const meshes = window.jointMeshes || [];
    const pool = window.v3InstancePool;
    const n = Math.max(joints.length, meshes.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = joints[i];
      const h = meshes[i];
      const ins = (pool && typeof pool.inspectHandle === "function") ? pool.inspectHandle(h) : null;
      out.push({
        index: i,
        id: j && j.id,
        selected: i === window.selectedJointIndex,
        slot: ins && ins.slot,
        instanceColor: ins && ins.instanceColor,
        handleColor: ins && ins.handleColor,
        handleEmissive: ins && ins.handleEmissive,
        selectedByHandle: ins && ins.selectedByHandle,
        unique: ins && ins.unique,
        instanced: ins && ins.instanced,
        inPoolHandles: ins && ins.inPoolHandles,
      });
    }
    return out;
  }

  function snapshot(label) {
    const idx = window.selectedJointIndex;
    const joints = window.joints || [];
    const meshes = window.jointMeshes || [];
    const pool = window.v3InstancePool;
    const handle = (typeof idx === "number" && idx >= 0) ? meshes[idx] : null;
    const joint = (typeof idx === "number" && idx >= 0) ? joints[idx] : null;
    const inspect = (pool && typeof pool.inspectHandle === "function") ? pool.inspectHandle(handle) : null;
    const lastSync = pool && typeof pool.lastSync === "function" ? pool.lastSync() : null;
    const highlighted = window.highlightedObject || null;
    return {
      label: label || "live",
      at: now(),
      selectedIndex: idx,
      selectedId: joint && joint.id,
      selectedPos: joint ? { x: joint.x, y: joint.y, z: joint.z } : null,
      jointCount: joints.length,
      meshCount: meshes.length,
      handleInJointMeshes: !!(handle && meshes[idx] === handle),
      selectedDescriptor: descSelected(),
      windowIndexType: typeof idx,
      highlightedIsSelected: !!(highlighted && handle && highlighted === handle),
      previewTarget: window.previewTargetPos || null,
      poolEnabled: !!(pool && pool.enabled),
      poolDirty: pool && typeof pool.isDirty === "function" ? pool.isDirty() : null,
      lastSync: lastSync,
      inspect: inspect,
      applyAllConnectors: fnFlags(window.applyMaterialColorToAllConnectors),
      setSelectedJointFn: fnFlags(window.setSelectedJoint),
      createJointFn: fnFlags(window.createJoint),
      allJoints: allJointsBrief(),
      lastEvents: events.slice(-8),
    };
  }

  function logSnap(snap) {
    const ins = snap.inspect || {};
    console.log("[JB-DIAG] " + snap.label, {
      selectedIndex: snap.selectedIndex,
      selectedId: snap.selectedId,
      slot: ins.slot,
      instanceId: ins.slot,
      poolKey: ins.poolKey,
      inPoolHandles: ins.inPoolHandles,
      handleColor: ins.handleColor,
      handleEmissive: ins.handleEmissive,
      handleEmissiveIntensity: ins.handleEmissiveIntensity,
      instanceColor: ins.instanceColor,
      selectedByHandle: ins.selectedByHandle,
      unique: ins.unique,
      instanced: ins.instanced,
      parentType: ins.parentType,
      handlePos: ins.pos,
      instancePos: ins.instancePos,
      lastSync: snap.lastSync,
      poolDirty: snap.poolDirty,
      highlightedIsSelected: snap.highlightedIsSelected,
      applyAllSkipsSelected: snap.applyAllConnectors && snap.applyAllConnectors.mentionsSelJoint,
      setSelectedJointWrapped: snap.setSelectedJointFn,
    });
    if (snap.allJoints && snap.allJoints.length) console.table(snap.allJoints);
    return snap;
  }

  function notify(kind, payload) {
    const ev = { at: now(), kind: kind, payload: payload || {} };
    events.push(ev);
    if (events.length > MAX_EVENTS) events.shift();
    if (!auto) return;
    const snap = snapshot(kind);
    logSnap(snap);
  }

  function help() {
    console.log([
      "JBハイライト診断",
      "1) 初回JBを選択したら:  v3DiagJointSelect.capture('first')",
      "2) 新規Beam追加後:     v3DiagJointSelect.capture('after-new')",
      "3) 既存JBへ接続後:     v3DiagJointSelect.capture('after-existing')",
      "4) 比較:               v3DiagJointSelect.compare()",
      "現在値だけ見る:        v3DiagJointSelect.dump()",
      "自動ログON:            v3DiagJointSelect.auto(true)",
      "自動ログOFF:           v3DiagJointSelect.auto(false)",
      "起動時自動ログ:        URL に ?jbdiag=1 を付ける",
    ].join("\n"));
  }

  window.v3DiagJointSelect = {
    help: help,
    dump: function () { return logSnap(snapshot("live")); },
    capture: function (name) {
      const key = String(name || "live");
      const snap = snapshot(key);
      captures[key] = snap;
      logSnap(snap);
      return snap;
    },
    compare: function () {
      const keys = ["first", "after-new", "after-existing"].filter(function (k) { return captures[k]; });
      const rows = keys.map(function (k) {
        const s = captures[k];
        const ins = s.inspect || {};
        return {
          label: k,
          selectedIndex: s.selectedIndex,
          selectedId: s.selectedId,
          slot: ins.slot,
          instanceColor: ins.instanceColor,
          handleColor: ins.handleColor,
          handleEmissive: ins.handleEmissive,
          handleEmissiveIntensity: ins.handleEmissiveIntensity,
          selectedByHandle: ins.selectedByHandle,
          inPoolHandles: ins.inPoolHandles,
          unique: ins.unique,
          lastSyncReason: s.lastSync && s.lastSync.reason,
        };
      });
      console.table(rows);
      return { keys: keys, rows: rows, captures: captures };
    },
    auto: function (on) {
      auto = !!on;
      console.log("[JB-DIAG] auto", auto);
      return auto;
    },
    notify: notify,
    captures: function () { return captures; },
  };

  try {
    if (window.__CR_DBG_JB__ || /(?:^|[?&])jbdiag=1(?:&|$)/.test(String(window.location && window.location.search || ""))) {
      auto = true;
      console.log("[JB-DIAG] auto ON (?jbdiag=1 or __CR_DBG_JB__)");
    }
  } catch (e) {}
  console.log("[JB-DIAG] ready. v3DiagJointSelect.help() で手順を表示");
})();
