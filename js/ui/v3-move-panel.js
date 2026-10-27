// =========================================================
// V3 Move パネル（STEP⑥-D）
// 案内、数値移動、Joint位置合わせ、距離表示をまとめる。
// 結合は STEP⑤ の window.v3JoinRacks.commit を再利用する。
// =========================================================
(function () {
  const POP_ID = "move";
  const AXIS_NAME = { x: "X", y: "Z", z: "Y" };
  const AXIS_COLOR = { x: "#ef4444", y: "#3b82f6", z: "#22c55e" };
  const ALIGN_ICON =
    '<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<g transform="rotate(-38 32 32)">' +
    '<circle cx="10" cy="34" r="6" stroke="#E7EDF8" stroke-width="3"/>' +
    '<circle cx="54" cy="34" r="6" stroke="#E7EDF8" stroke-width="3"/>' +
    '<circle cx="10" cy="34" r="2" fill="#61A0FF"/>' +
    '<path d="M18 34 H45" stroke="#61A0FF" stroke-width="3" stroke-dasharray="3 5"/>' +
    '<path d="M38 28 L45 34 L38 40" stroke="#61A0FF" stroke-width="3"/>' +
    "</g></svg>";

  let step = "idle";
  let numericAxis = null;
  let numericMsg = "";
  let pickPurpose = null;
  let pickCandidates = null;
  let targetIndex = -1;
  let previewDelta = { x: 0, y: 0, z: 0 };
  let previewGroup = null;
  let hiddenMeshes = [];
  let marked = [];
  let selfRefresh = false;
  let fromModeOff = false;
  let lastGap = null;
  let fields = null;
  let numericInput = null;
  let gapInput = null;
  let gapAxis = "x";
  let gapSide = "+";
  let gapRef = null;
  let gapWarn = [];
  let gapMode = false;
  let lastGapMm = 0;

  function $(id) { return document.getElementById(id); }
  function ui() { return window.v3WorkspaceUi; }
  function joints() { return window.joints || []; }
  function gizmo() { return window.v3MoveGizmo; }
  function gap() { return window.v3MoveGap; }
  function wl() { return window.v3WorkLayers; }
  function controls() { return window.controls; }

  function rackIdOf(index) {
    const j = joints()[index];
    return j && typeof j.rackId === "string" ? j.rackId : null;
  }

  function shortRack(id) {
    if (gap() && typeof gap().shortId === "function") return gap().shortId(id);
    if (!id) return "—";
    const s = String(id);
    return s.length <= 8 ? s : "…" + s.slice(-4);
  }

  function blocksGizmo() {
    return step === "alignPick" || step === "preview" || step === "pick" ||
      step === "gapPick" || step === "gapEdit" || step === "gapPreview";
  }

  function historyLen() {
    return (window.history && window.history.length) || 0;
  }

  function historyIndex() {
    return window.historyIndex == null ? -1 : window.historyIndex;
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
      mesh.scale.set(1.28, 1.28, 1.28);
    } catch (e) {}
  }

  function disposePreview() {
    if (previewGroup) {
      previewGroup.traverse(function (obj) {
        if (obj.geometry && obj.geometry.dispose) {
          try { obj.geometry.dispose(); } catch (e) {}
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (m) { try { m.dispose && m.dispose(); } catch (e2) {} });
        }
      });
      if (previewGroup.parent) previewGroup.parent.remove(previewGroup);
      previewGroup = null;
    }
    hiddenMeshes.forEach(function (mesh) {
      if (mesh) mesh.visible = true;
    });
    hiddenMeshes = [];
    try { gizmo() && gizmo().place && gizmo().place(); } catch (e) {}
  }

  function cloneForPreview(mesh) {
    if (!mesh) return null;
    const cloned = mesh.clone(true);
    cloned.traverse(function (obj) {
      if (obj.userData) {
        obj.userData = Object.assign({}, obj.userData, { moveAlignPreview: true });
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

  function movingSet() {
    const list = gizmo() && gizmo().getIndices ? gizmo().getIndices() : [];
    return new Set(list);
  }

  function showOffsetPreview(delta, typeName) {
    disposePreview();
    previewDelta = {
      x: Number(delta && delta.x) || 0,
      y: Number(delta && delta.y) || 0,
      z: Number(delta && delta.z) || 0,
    };
    const childSet = movingSet();
    const group = new window.THREE.Group();
    group.userData = { type: typeName || "move-preview" };
    (window.jointMeshes || []).forEach(function (mesh, i) {
      if (childSet.has(i)) hideAndClone(mesh, group);
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
    group.position.set(previewDelta.x, previewDelta.y, previewDelta.z);
    if (window.rackGroup) window.rackGroup.add(group);
    previewGroup = group;
    const gzObj = window.scene && window.scene.getObjectByName("v3-move-gizmo");
    if (gzObj) gzObj.visible = false;
    if (gap() && typeof gap().showOffset === "function") {
      gap().showOffset(Array.from(childSet), previewDelta, null);
    }
  }

  function showAlignPreview() {
    const gz = gizmo();
    const anchor = gz ? gz.getAnchorIndex() : -1;
    const src = joints()[anchor];
    const dst = joints()[targetIndex];
    if (!src || !dst) return;
    showOffsetPreview({
      x: dst.x - src.x,
      y: dst.y - src.y,
      z: dst.z - src.z,
    }, "move-align-preview");
  }

  function restoreGizmoVisible() {
    const gzObj = window.scene && window.scene.getObjectByName("v3-move-gizmo");
    if (gzObj) gzObj.visible = true;
  }

  function statusText() {
    if (step === "idle") return "移動基準とするジョイントボールを選択してください";
    if (step === "pick") return "重なったJointがあります。対象ラックを選んでください";
    if (step === "numeric") {
      return AXIS_NAME[numericAxis] + "方向の移動距離を入力してください";
    }
    if (step === "alignPick") return "移動先のジョイントボールを選択してください";
    if (step === "preview") return "ジョイントボールを重ね合わせます。ラックを結合しますか？";
    if (step === "gapPick") return "基準ラックのジョイントボールを選択してください";
    if (step === "gapEdit") return "方向と距離を指定してください";
    if (step === "gapPreview") return "指定した隙間で配置します。よろしいですか？";
    return "矢印ドラッグ、矢印クリックで数値移動、または位置合わせができます";
  }

  function parseMm(raw) {
    const s = String(raw == null ? "" : raw).trim().replace(/[，,]/g, "");
    if (!s) return { ok: false, reason: "empty" };
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, reason: "nan" };
    const n = Number(s);
    if (!Number.isFinite(n)) return { ok: false, reason: "nan" };
    if (Math.abs(n) > 100000) return { ok: false, reason: "range" };
    return { ok: true, mm: n };
  }

  function parseGapMm(raw) {
    const parsed = parseMm(raw);
    if (!parsed.ok) return parsed;
    if (parsed.mm < 0) return { ok: false, reason: "negative" };
    return parsed;
  }

  function movingIndices() {
    const gz = gizmo();
    return gz && gz.getIndices ? gz.getIndices() : [];
  }

  function clusterHas(index) {
    return movingIndices().indexOf(index) >= 0;
  }

  function rackIndices(rackId, fallbackIndex) {
    const js = joints();
    const list = [];
    if (rackId) {
      for (let i = 0; i < js.length; i++) {
        if (js[i] && js[i].rackId === rackId) list.push(i);
      }
    }
    if (list.length) return list;
    if (typeof fallbackIndex === "number" && js[fallbackIndex]) return [fallbackIndex];
    return [];
  }

  function refLockedOrHidden(indices) {
    const layers = wl();
    if (!layers) return false;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (typeof layers.canSelectJoint === "function" && !layers.canSelectJoint(idx)) return true;
      if (typeof layers.canEditJoint === "function" && !layers.canEditJoint(idx)) return true;
    }
    return false;
  }

  function computeGapDelta(axis, side, gapMm, movingIdx, refIdx) {
    const g = gap();
    if (!g || typeof g.aabbOf !== "function") return { ok: false, reason: "距離計算が使えません。" };
    const mov = g.aabbOf(movingIdx || movingIndices());
    const refBox = g.aabbOf(refIdx || (gapRef && gapRef.indices) || []);
    if (!mov || !refBox) return { ok: false, reason: "ラックの外形を計算できません。" };
    const mm = Number(gapMm);
    if (!Number.isFinite(mm) || mm < 0) return { ok: false, reason: "目標隙間は 0 以上の mm です。" };
    const d = { x: 0, y: 0, z: 0 };
    if (axis === "x") {
      if (side === "+") d.x = (refBox.maxX + mm) - mov.minX;
      else d.x = (refBox.minX - mm) - mov.maxX;
    } else if (axis === "z") {
      if (side === "+") d.z = (refBox.maxZ + mm) - mov.minZ;
      else d.z = (refBox.minZ - mm) - mov.maxZ;
    } else {
      return { ok: false, reason: "X または Z を選んでください。" };
    }
    if (![d.x, d.y, d.z].every(function (v) { return Number.isFinite(v); })) {
      return { ok: false, reason: "移動量を計算できません。" };
    }
    return { ok: true, delta: d, moving: mov, ref: refBox, axis: axis, side: side, gapMm: mm };
  }

  function currentAxisGapText(axis) {
    const g = gap();
    if (!g || !gapRef || typeof g.aabbOf !== "function" || typeof g.axisGap !== "function") return "—";
    const mov = g.aabbOf(movingIndices());
    const refBox = g.aabbOf(gapRef.indices || []);
    if (!mov || !refBox) return "—";
    const a = axis === "z"
      ? g.axisGap(mov.minZ, mov.maxZ, refBox.minZ, refBox.maxZ)
      : g.axisGap(mov.minX, mov.maxX, refBox.minX, refBox.maxX);
    if (!a) return "—";
    const name = axis === "z" ? "Y" : "X";
    if (a.state === "gap" || a.state === "touch") return Math.round(a.mm) + " mm（" + name + "方向）";
    return "重なっています（" + name + "方向）";
  }

  function listOtherRacks() {
    const g = gap();
    if (!g || typeof g.otherGroups !== "function") return [];
    return g.otherGroups(new Set(movingIndices()));
  }

  function resetGapState() {
    gapRef = null;
    gapWarn = [];
    gapMode = false;
    gapInput = null;
  }

  function startGapPlace() {
    const gz = gizmo();
    if (!gz || typeof gz.getAnchorIndex !== "function" || gz.getAnchorIndex() < 0) {
      numericMsg = "先に移動基準Jointを選んでください。";
      fillBody();
      return;
    }
    numericAxis = null;
    targetIndex = -1;
    gapMode = true;
    gapRef = null;
    gapWarn = [];
    gapAxis = "x";
    gapSide = "+";
    step = "gapPick";
    numericMsg = "";
    fillBody();
  }

  function setGapRefFromIndex(index) {
    if (typeof index !== "number" || index < 0 || !joints()[index]) {
      numericMsg = "基準ラックのJointをクリックしてください。";
      fillBody();
      return false;
    }
    if (clusterHas(index)) {
      numericMsg = "基準ラックと移動ラックが同じクラスタのため指定できません。";
      fillBody();
      return false;
    }
    const id = rackIdOf(index);
    const movingId = rackIdOf(gizmo() && gizmo().getAnchorIndex ? gizmo().getAnchorIndex() : -1);
    if (id && movingId && id === movingId) {
      numericMsg = "基準ラックと移動ラックが同じクラスタのため指定できません。";
      fillBody();
      return false;
    }
    const indices = rackIndices(id, index);
    if (!indices.length) {
      numericMsg = "基準ラックを解決できません。";
      fillBody();
      return false;
    }
    if (indices.some(clusterHas)) {
      numericMsg = "基準ラックと移動ラックが同じクラスタのため指定できません。";
      fillBody();
      return false;
    }
    if (refLockedOrHidden(indices)) {
      numericMsg = "基準ラックがロック中または非表示のため指定できません。";
      fillBody();
      return false;
    }
    gapRef = { id: id, index: index, indices: indices.slice() };
    const gz = gizmo();
    clearMarks();
    if (gz && gz.getAnchorIndex() >= 0) markJoint(gz.getAnchorIndex(), 0x38bdf8);
    markJoint(index, 0x4ade80);
    step = "gapEdit";
    numericMsg = "";
    fillBody();
    return true;
  }

  function previewGapPlace() {
    if (!gapRef) {
      numericMsg = "基準ラックを選んでください。";
      step = "gapPick";
      fillBody();
      return false;
    }
    const parsed = parseGapMm(gapInput ? gapInput.value : "0");
    if (!parsed.ok) {
      numericMsg = parsed.reason === "empty"
        ? "目標隙間を入力してください。"
        : parsed.reason === "negative"
          ? "目標隙間は 0 以上の mm です。"
          : parsed.reason === "range"
            ? "目標隙間は 100000 mm 以内にしてください。"
            : "目標隙間は 0 以上の数値（小数可）です。";
      fillBody();
      return false;
    }
    const calc = computeGapDelta(gapAxis, gapSide, parsed.mm);
    if (!calc.ok) {
      numericMsg = calc.reason;
      fillBody();
      return false;
    }
    const skip = gapRef.id ? [gapRef.id] : [];
    lastGapMm = parsed.mm;
    gapWarn = (gap() && typeof gap().collisions === "function")
      ? gap().collisions(movingIndices(), calc.delta, skip)
      : [];
    showOffsetPreview(calc.delta, "move-gap-preview");
    step = "gapPreview";
    numericMsg = "";
    fillBody();
    return true;
  }

  function confirmGapPlace() {
    const gz = gizmo();
    const d = { x: previewDelta.x, y: 0, z: previewDelta.z };
    disposePreview();
    restoreGizmoVisible();
    if (gz && typeof gz.applyExact === "function") {
      gz.applyExact(gapAxis === "z" ? "z" : "x", d.x, 0, d.z);
      saveMoveHistory("place gap " + gapAxis + (gapSide === "+" ? "+" : "-"));
    }
    const anchor = gz ? gz.getAnchorIndex() : -1;
    if (anchor >= 0) markJoint(anchor, 0x38bdf8);
    if (gapRef && gapRef.index >= 0) markJoint(gapRef.index, 0x4ade80);
    try { gap() && gap().onDragEnd && gap().onDragEnd(); } catch (e) {}
    step = "anchor";
    gapMode = false;
    numericMsg = "指定した隙間で配置しました。結合はしていません。";
    resetGapState();
    refreshGap();
    fillBody();
  }

  function cancelGapPlace(keepAnchor) {
    disposePreview();
    restoreGizmoVisible();
    gapWarn = [];
    try { gap() && gap().onDragEnd && gap().onDragEnd(); } catch (e) {}
    if (keepAnchor && gizmo() && gizmo().getAnchorIndex && gizmo().getAnchorIndex() >= 0) {
      if (gapRef) {
        step = "gapEdit";
        const gz = gizmo();
        clearMarks();
        if (gz.getAnchorIndex() >= 0) markJoint(gz.getAnchorIndex(), 0x38bdf8);
        if (gapRef.index >= 0) markJoint(gapRef.index, 0x4ade80);
      } else {
        step = "gapPick";
        clearMarks();
        markJoint(gizmo().getAnchorIndex(), 0x38bdf8);
      }
      refreshGap();
    } else {
      resetGapState();
      if (keepAnchor && gizmo() && gizmo().getAnchorIndex() >= 0) {
        step = "anchor";
        clearMarks();
        markJoint(gizmo().getAnchorIndex(), 0x38bdf8);
        refreshGap();
      } else {
        step = "idle";
        lastGap = null;
        clearMarks();
      }
    }
    fillBody();
  }

  function refreshGap(offset) {
    const gz = gizmo();
    const idx = gz && gz.getIndices ? gz.getIndices() : [];
    if (!idx.length || !gap() || typeof gap().measure !== "function") {
      lastGap = null;
      return;
    }
    lastGap = gap().measure(idx, offset || null);
  }

  function saveMoveHistory(reason) {
    if (window.callIfExists) window.callIfExists("saveHistory", reason);
    else if (typeof window.saveHistory === "function") window.saveHistory(reason);
    if (typeof window.requestEstimateRender === "function") window.requestEstimateRender(reason);
    else if (typeof window.calcAndRenderEstimate === "function") window.calcAndRenderEstimate();
    if (typeof window.applyColorChartToAllConnectors === "function") window.applyColorChartToAllConnectors();
  }

  function applyNumeric() {
    if (numericAxis !== "x" && numericAxis !== "y" && numericAxis !== "z") return;
    const gz = gizmo();
    if (!gz || !gz.getIndices || !gz.getIndices().length) {
      numericMsg = "先に移動基準Jointを選んでください。";
      fillBody();
      return;
    }
    const parsed = parseMm(numericInput ? numericInput.value : "");
    if (!parsed.ok) {
      numericMsg = parsed.reason === "empty"
        ? "移動距離を入力してください。"
        : parsed.reason === "range"
          ? "移動距離は ±100000 mm 以内にしてください。"
          : "移動距離は数値（小数可）で入力してください。";
      fillBody();
      return;
    }
    const dx = numericAxis === "x" ? parsed.mm : 0;
    const dy = numericAxis === "y" ? parsed.mm : 0;
    const dz = numericAxis === "z" ? parsed.mm : 0;
    const axisUsed = numericAxis;
    gz.applyExact(axisUsed, dx, dy, dz);
    saveMoveHistory("move numeric " + axisUsed);
    numericMsg = AXIS_NAME[axisUsed] + "方向に " + parsed.mm + " mm 移動しました（スナップなし）。";
    numericAxis = null;
    step = "anchor";
    refreshGap();
    if (gap()) {
      if (axisUsed === "y") gap().setYHint?.(true, dy);
      gap().onDragStart?.(gz.getIndices(), axisUsed);
      gap().onDragEnd?.();
    }
    fillBody();
  }

  function startAlign() {
    const gz = gizmo();
    if (!gz || typeof gz.getAnchorIndex !== "function" || gz.getAnchorIndex() < 0) {
      numericMsg = "先に移動基準Jointを選んでください。";
      fillBody();
      return;
    }
    numericAxis = null;
    targetIndex = -1;
    step = "alignPick";
    numericMsg = "";
    fillBody();
  }

  function cancelAlign(keepAnchor) {
    disposePreview();
    restoreGizmoVisible();
    clearMarks();
    targetIndex = -1;
    pickPurpose = null;
    pickCandidates = null;
    previewDelta = { x: 0, y: 0, z: 0 };
    try { gap() && gap().onDragEnd && gap().onDragEnd(); } catch (e) {}
    const gz = gizmo();
    if (keepAnchor && gz && gz.getAnchorIndex && gz.getAnchorIndex() >= 0) {
      step = "anchor";
      markJoint(gz.getAnchorIndex(), 0x38bdf8);
      refreshGap();
    } else {
      step = "idle";
      lastGap = null;
    }
    fillBody();
  }

  function confirmJoin() {
    const gz = gizmo();
    const child = gz ? gz.getAnchorIndex() : -1;
    const parent = targetIndex;
    disposePreview();
    restoreGizmoVisible();
    clearMarks();
    const api = window.v3JoinRacks;
    if (!api || typeof api.commit !== "function") {
      numericMsg = "結合処理を呼び出せません。";
      step = "anchor";
      fillBody();
      return;
    }
    const result = api.commit(parent, child);
    if (!result || !result.ok) {
      numericMsg = (result && result.reason) || "結合できませんでした。";
      step = "anchor";
      if (gz && child >= 0) gz.selectJoint(child);
      fillBody();
      return;
    }
    targetIndex = -1;
    previewDelta = { x: 0, y: 0, z: 0 };
    try { gap() && gap().onDragEnd && gap().onDragEnd(); } catch (e) {}
    const next = typeof result.parentIndex === "number" ? result.parentIndex : parent;
    step = "anchor";
    numericMsg = "ラックを結合しました。";
    if (gz && next >= 0) gz.selectJoint(next);
    refreshGap();
    fillBody();
  }

  function confirmMoveOnly() {
    const gz = gizmo();
    disposePreview();
    restoreGizmoVisible();
    clearMarks();
    if (gz && typeof gz.applyExact === "function") {
      gz.applyExact("xyz", previewDelta.x, previewDelta.y, previewDelta.z);
      saveMoveHistory("align joints without join");
    }
    const anchor = gz ? gz.getAnchorIndex() : -1;
    if (anchor >= 0) markJoint(anchor, 0x38bdf8);
    if (targetIndex >= 0) markJoint(targetIndex, 0x4ade80);
    try { gap() && gap().onDragEnd && gap().onDragEnd(); } catch (e) {}
    step = "anchor";
    numericMsg = "重ねましたが結合していません。2つのJointは独立したままです。";
    refreshGap();
    fillBody();
  }

  function chooseCandidate(index) {
    const purpose = pickPurpose;
    pickPurpose = null;
    pickCandidates = null;
    acceptJoint(index, purpose);
  }

  function acceptJoint(index, purpose) {
    const gz = gizmo();
    if (purpose === "gapRef") {
      setGapRefFromIndex(index);
      return;
    }
    if (purpose === "target") {
      if (!gz || gz.getAnchorIndex() < 0) {
        numericMsg = "先に移動基準Jointを選んでください。";
        step = "idle";
        fillBody();
        return;
      }
      if (index === gz.getAnchorIndex()) {
        numericMsg = "別ラックのJointを選択してください。";
        step = "alignPick";
        fillBody();
        return;
      }
      const srcId = rackIdOf(gz.getAnchorIndex());
      const dstId = rackIdOf(index);
      if (srcId && dstId && srcId === dstId) {
        numericMsg = "別ラックのJointを選択してください。";
        step = "alignPick";
        fillBody();
        return;
      }
      const layers = wl();
      if (layers && typeof layers.canSelectJoint === "function" && !layers.canSelectJoint(index)) {
        numericMsg = "非表示または選択できないJointです。";
        fillBody();
        return;
      }
      targetIndex = index;
      clearMarks();
      markJoint(gz.getAnchorIndex(), 0x38bdf8);
      markJoint(targetIndex, 0x4ade80);
      showAlignPreview();
      step = "preview";
      numericMsg = "";
      fillBody();
      return;
    }
    if (!gz || typeof gz.selectJoint !== "function") return;
    const ok = gz.selectJoint(index);
    if (!ok) {
      numericMsg = "ロック中または非表示のラックは移動できません。";
      fillBody();
      return;
    }
    clearMarks();
    markJoint(index, 0x38bdf8);
    numericAxis = null;
    targetIndex = -1;
    resetGapState();
    step = "anchor";
    numericMsg = "";
    refreshGap();
    fillBody();
  }

  function beginPick(indices, purpose) {
    if (!indices || !indices.length) return;
    if (indices.length === 1) {
      acceptJoint(indices[0], purpose);
      return;
    }
    pickPurpose = purpose;
    pickCandidates = indices.slice();
    step = "pick";
    fillBody();
  }

  function onJointPicked(index) {
    if (!window.isMoveModeOn) return false;
    if (step === "preview" || step === "gapPreview") return true;
    if (typeof index !== "number" || index < 0 || !joints()[index]) {
      if (step === "alignPick") {
        numericMsg = "Jointをクリックしてください。";
        fillBody();
        return true;
      }
      if (step === "gapPick" || step === "gapEdit") {
        numericMsg = "基準ラックのJointをクリックしてください。";
        fillBody();
        return true;
      }
      return false;
    }
    if (step === "gapPick" || step === "gapEdit" || pickPurpose === "gapRef") {
      acceptJoint(index, "gapRef");
      return true;
    }
    if (step === "alignPick" || pickPurpose === "target") {
      acceptJoint(index, "target");
      return true;
    }
    acceptJoint(index, "anchor");
    return true;
  }

  function onAxisClick(axis) {
    if (!window.isMoveModeOn) return;
    if (step === "preview" || step === "alignPick" || step === "gapPick" || step === "gapEdit" || step === "gapPreview") return;
    const gz = gizmo();
    if (!gz || gz.getAnchorIndex() < 0) {
      step = "idle";
      fillBody();
      return;
    }
    numericAxis = axis;
    numericMsg = "";
    step = "numeric";
    fillBody();
  }

  function onAnchorSelected(index) {
    if (!window.isMoveModeOn) return;
    if (step === "preview" || step === "alignPick" || step === "pick" ||
        step === "gapPick" || step === "gapEdit" || step === "gapPreview") return;
    if (typeof index !== "number" || index < 0) return;
    clearMarks();
    markJoint(index, 0x38bdf8);
    step = "anchor";
    refreshGap();
    fillBody();
  }

  function fillBody(body) {
    const el = body || $("v3-cmd-pop-body");
    if (!el) return;
    const keepVal = numericInput ? numericInput.value : "";
    const keepGap = gapInput ? gapInput.value : "";
    el.innerHTML = "";
    const root = document.createElement("div");
    root.className = "v3-move-panel-root";

    const status = document.createElement("p");
    status.className = "v3-connect-status";
    status.textContent = statusText();
    root.appendChild(status);

    if (step === "numeric" && numericAxis) {
      const box = document.createElement("div");
      box.className = "v3-move-numeric";
      const lab = document.createElement("label");
      lab.className = "v3-move-numeric-lab";
      lab.innerHTML = '<span style="color:' + AXIS_COLOR[numericAxis] + '">' +
        AXIS_NAME[numericAxis] + "</span>方向の移動距離";
      const row = document.createElement("div");
      row.className = "v3-move-numeric-row";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.className = "v3-move-numeric-input";
      inp.value = keepVal;
      inp.placeholder = "例: 1200";
      inp.setAttribute("data-no-drag", "1");
      inp.addEventListener("pointerdown", function (ev) {
        ev.stopPropagation();
        if (controls()) controls().enabled = false;
      });
      inp.addEventListener("pointerup", function (ev) {
        ev.stopPropagation();
        if (controls()) controls().enabled = true;
      });
      inp.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
        if (ev.key === "Enter") {
          ev.preventDefault();
          numericInput = inp;
          applyNumeric();
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          numericAxis = null;
          step = "anchor";
          fillBody();
        }
      });
      const unit = document.createElement("span");
      unit.className = "v3-move-numeric-unit";
      unit.textContent = "mm";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "v3-len-apply";
      ok.textContent = "確定";
      ok.addEventListener("click", function (ev) {
        ev.preventDefault();
        numericInput = inp;
        applyNumeric();
      });
      row.appendChild(inp);
      row.appendChild(unit);
      row.appendChild(ok);
      box.appendChild(lab);
      box.appendChild(row);
      const note = document.createElement("p");
      note.className = "v3-move-numeric-note";
      note.textContent = "現在位置からの移動。スナップなし。";
      box.appendChild(note);
      root.appendChild(box);
      numericInput = inp;
    } else {
      numericInput = null;
    }

    if (step === "pick" && pickCandidates && pickCandidates.length) {
      const list = document.createElement("div");
      list.className = "v3-move-pick";
      pickCandidates.forEach(function (idx) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "v3-len-mode";
        btn.textContent = "ラック " + shortRack(rackIdOf(idx));
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          chooseCandidate(idx);
        });
        list.appendChild(btn);
      });
      root.appendChild(list);
    }

    if (step === "anchor" || step === "numeric") {
      const align = document.createElement("button");
      align.type = "button";
      align.className = "v3-move-align-btn";
      align.innerHTML = ALIGN_ICON + "<span>Joint位置合わせ</span>";
      align.title = "別ラックのジョイントボールに重ねます";
      align.addEventListener("click", function (ev) {
        ev.preventDefault();
        startAlign();
      });
      root.appendChild(align);
      const gapBtn = document.createElement("button");
      gapBtn.type = "button";
      gapBtn.className = "v3-move-align-btn";
      gapBtn.innerHTML = "<span>ラック間距離を指定</span>";
      gapBtn.title = "基準ラックとの距離を指定して配置します";
      gapBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        startGapPlace();
      });
      root.appendChild(gapBtn);
    }

    if (step === "gapPick" || step === "gapEdit") {
      const others = listOtherRacks();
      const list = document.createElement("div");
      list.className = "v3-move-pick";
      if (!others.length) {
        const empty = document.createElement("p");
        empty.className = "v3-connect-msg";
        empty.textContent = "基準にできる別ラックがありません。";
        list.appendChild(empty);
      } else {
        others.forEach(function (o) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "v3-len-mode" + (gapRef && gapRef.id === o.id ? " is-on" : "");
          btn.textContent = "基準ラック " + shortRack(o.id);
          btn.addEventListener("click", function (ev) {
            ev.preventDefault();
            setGapRefFromIndex(o.indices[0]);
          });
          list.appendChild(btn);
        });
      }
      root.appendChild(list);
      const back = document.createElement("button");
      back.type = "button";
      back.className = "v3-len-mode";
      back.textContent = "距離指定をやめる";
      back.addEventListener("click", function (ev) {
        ev.preventDefault();
        resetGapState();
        step = "anchor";
        numericMsg = "";
        fillBody();
      });
      root.appendChild(back);
    }

    if (step === "gapEdit" && gapRef) {
      const box = document.createElement("div");
      box.className = "v3-move-numeric";
      const cur = document.createElement("p");
      cur.className = "v3-move-numeric-note";
      cur.textContent = "現在：" + currentAxisGapText(gapAxis);
      box.appendChild(cur);

      const axes = document.createElement("div");
      axes.className = "v3-len-modes";
      [["x", "X方向"], ["z", "Y方向"]].forEach(function (pair) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "v3-len-mode" + (gapAxis === pair[0] ? " is-on" : "");
        b.textContent = pair[1];
        b.addEventListener("click", function (ev) {
          ev.preventDefault();
          gapAxis = pair[0];
          fillBody();
        });
        axes.appendChild(b);
      });
      box.appendChild(axes);

      const sides = document.createElement("div");
      sides.className = "v3-len-modes";
      const sideOpts = gapAxis === "z"
        ? [["+", "前側（+Y）"], ["-", "後側（−Y）"]]
        : [["+", "右側（+X）"], ["-", "左側（−X）"]];
      sideOpts.forEach(function (pair) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "v3-len-mode" + (gapSide === pair[0] ? " is-on" : "");
        b.textContent = pair[1];
        b.addEventListener("click", function (ev) {
          ev.preventDefault();
          gapSide = pair[0];
          fillBody();
        });
        sides.appendChild(b);
      });
      box.appendChild(sides);

      const lab = document.createElement("label");
      lab.className = "v3-move-numeric-lab";
      lab.textContent = (gapAxis === "z" ? "Y" : "X") + "方向の目標距離";
      const row = document.createElement("div");
      row.className = "v3-move-numeric-row";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.className = "v3-move-numeric-input";
      inp.value = keepGap;
      inp.placeholder = "例: 1200";
      inp.setAttribute("data-no-drag", "1");
      inp.addEventListener("pointerdown", function (ev) {
        ev.stopPropagation();
        if (controls()) controls().enabled = false;
      });
      inp.addEventListener("pointerup", function (ev) {
        ev.stopPropagation();
        if (controls()) controls().enabled = true;
      });
      inp.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
        if (ev.key === "Enter") {
          ev.preventDefault();
          gapInput = inp;
          previewGapPlace();
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          resetGapState();
          step = "anchor";
          fillBody();
        }
      });
      const unit = document.createElement("span");
      unit.className = "v3-move-numeric-unit";
      unit.textContent = "mm";
      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "v3-len-apply";
      prev.textContent = "プレビュー";
      prev.addEventListener("click", function (ev) {
        ev.preventDefault();
        gapInput = inp;
        previewGapPlace();
      });
      row.appendChild(inp);
      row.appendChild(unit);
      row.appendChild(prev);
      box.appendChild(lab);
      box.appendChild(row);
      const note = document.createElement("p");
      note.className = "v3-move-numeric-note";
      note.textContent = "目標の距離です。スナップなし。";
      box.appendChild(note);
      root.appendChild(box);
      gapInput = inp;
    } else if (step !== "gapPreview") {
      gapInput = null;
    }

    if (step === "preview") {
      const meta = document.createElement("div");
      meta.className = "v3-connect-meta";
      meta.innerHTML =
        "<div>移動量 X " + Math.round(previewDelta.x) +
        " / Y " + Math.round(previewDelta.y) +
        " / Z " + Math.round(previewDelta.z) + " mm</div>";
      root.appendChild(meta);
      const actions = document.createElement("div");
      actions.className = "v3-connect-actions v3-move-align-actions";
      function act(label, cls, fn) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.addEventListener("click", function (ev) {
          ev.preventDefault();
          fn();
        });
        return b;
      }
      actions.appendChild(act("結合する", "v3-len-apply", confirmJoin));
      actions.appendChild(act("結合しない", "v3-len-mode", confirmMoveOnly));
      actions.appendChild(act("キャンセル", "v3-len-mode", function () { cancelAlign(true); }));
      root.appendChild(actions);
    }

    if (step === "gapPreview") {
      const axisLabel = gapAxis === "z" ? "Y" : "X";
      const sideLabel = gapAxis === "z"
        ? (gapSide === "+" ? "前側（+Y）" : "後側（−Y）")
        : (gapSide === "+" ? "右側（+X）" : "左側（−X）");
      const parsed = parseGapMm(gapInput ? gapInput.value : "");
      const meta = document.createElement("div");
      meta.className = "v3-connect-meta";
      meta.innerHTML =
        "<div>基準ラック " + shortRack(gapRef && gapRef.id) + "</div>" +
        "<div>配置 " + axisLabel + " " + sideLabel + "</div>" +
        "<div>目標距離 " + lastGapMm + " mm（" + axisLabel + "方向）</div>";
      root.appendChild(meta);
      if (gapWarn && gapWarn.length) {
        const warn = document.createElement("p");
        warn.className = "v3-connect-msg";
        warn.textContent = "他のラックと干渉します";
        root.appendChild(warn);
      }
      const actions = document.createElement("div");
      actions.className = "v3-connect-actions v3-move-align-actions";
      function gapAct(label, cls, fn) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.addEventListener("click", function (ev) {
          ev.preventDefault();
          fn();
        });
        return b;
      }
      actions.appendChild(gapAct("配置する", "v3-len-apply", confirmGapPlace));
      actions.appendChild(gapAct("キャンセル", "v3-len-mode", function () { cancelGapPlace(true); }));
      root.appendChild(actions);
    }

    if (step === "alignPick") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "v3-len-mode";
      cancel.textContent = "位置合わせをやめる";
      cancel.addEventListener("click", function (ev) {
        ev.preventDefault();
        cancelAlign(true);
      });
      root.appendChild(cancel);
    }

    if (numericMsg) {
      const note = document.createElement("p");
      note.className = "v3-connect-msg";
      note.textContent = numericMsg;
      root.appendChild(note);
    }

    el.appendChild(root);
    if (numericInput) {
      try { numericInput.focus(); numericInput.select(); } catch (e) {}
    } else if (gapInput && step === "gapEdit") {
      try { gapInput.focus(); } catch (e) {}
    }
  }

  function openPanel() {
    const host = ui();
    if (!host || typeof host.openPopup !== "function") return;
    if (host.getOpenPopupId && host.getOpenPopupId() === POP_ID) {
      fillBody();
      return;
    }
    host.openPopup(POP_ID, {
      title: "移動",
      hideApply: true,
      hideActions: true,
      compact: true,
      skipFocus: true,
      anchor: document.querySelector('[data-v3-cad-cmd="move"]'),
      onCancel: function () {
        if (selfRefresh) return;
        if (step === "preview") cancelAlign(true);
        if (step === "gapPreview") cancelGapPlace(true);
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
    fields = null;
    numericInput = null;
  }

  function resetAll() {
    cancelAlign(false);
    cancelGapPlace(false);
    numericAxis = null;
    numericMsg = "";
    step = "idle";
    lastGap = null;
    try { gizmo() && gizmo().hide && gizmo().hide(); } catch (e) {}
  }

  function uiIgnore(ev) {
    const t = ev.target;
    if (!t || !t.closest) return false;
    return !!t.closest("#v3-cmd-pop, #v3-east-rail, .v3-toolbar, #v3-north, #v3-layer-panel, #v3-view-nav, #v3-sel-hud, #v3-rotate-hud, #v3-radial");
  }

  function onPointerDown(ev) {
    if (!window.isMoveModeOn) return;
    if (ev.button != null && ev.button !== 0) return;
    if (uiIgnore(ev)) return;
    if (gizmo() && typeof gizmo().isDragging === "function" && gizmo().isDragging()) return;
    if (step === "preview" || step === "gapPreview" || step === "pick") {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      return;
    }
    const hits = (typeof window.pickJointsByClientPos === "function")
      ? window.pickJointsByClientPos(ev.clientX, ev.clientY, 28)
      : ((typeof window.pickJointIndexByClientPos === "function")
        ? [window.pickJointIndexByClientPos(ev.clientX, ev.clientY, 28)].filter(function (i) { return i >= 0; })
        : []);
    if (!hits.length) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    const purpose = (step === "alignPick") ? "target"
      : (step === "gapPick" || step === "gapEdit") ? "gapRef"
      : "anchor";
    beginPick(hits, purpose);
  }

  function hookMode() {
    if (window.__v3MovePanelHooked) return;
    const orig = window.setMoveMode;
    if (typeof orig !== "function") return;
    window.__v3MovePanelHooked = true;
    window.setMoveMode = function (on) {
      const result = orig.apply(this, arguments);
      if (window.isMoveModeOn) {
        step = (gizmo() && gizmo().getAnchorIndex && gizmo().getAnchorIndex() >= 0) ? "anchor" : "idle";
        openPanel();
      } else {
        resetAll();
        if (!fromModeOff) closePanel();
      }
      return result;
    };
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  hookMode();
  window.addEventListener("load", hookMode);

  window.v3MovePanel = {
    onAxisClick: onAxisClick,
    onAnchorSelected: onAnchorSelected,
    onJointPicked: onJointPicked,
    onGapUpdate: function () {
      refreshGap((step === "preview" || step === "gapPreview") ? previewDelta : null);
      if (gizmo() && gizmo().isDragging && gizmo().isDragging()) return;
      if (step === "numeric" && numericInput && document.activeElement === numericInput) return;
      if (step === "gapEdit" && gapInput && document.activeElement === gapInput) return;
      if (ui() && ui().getOpenPopupId && ui().getOpenPopupId() === POP_ID) fillBody();
    },
    blocksGizmo: blocksGizmo,
    getStep: function () { return step; },
    getNumericAxis: function () { return numericAxis; },
    getTargetIndex: function () { return targetIndex; },
    getPreviewDelta: function () { return { x: previewDelta.x, y: previewDelta.y, z: previewDelta.z }; },
    applyNumeric: applyNumeric,
    startAlign: startAlign,
    confirmJoin: confirmJoin,
    confirmMoveOnly: confirmMoveOnly,
    cancelAlign: function () { cancelAlign(true); },
    startGapPlace: startGapPlace,
    setGapRefFromIndex: setGapRefFromIndex,
    setGapAxis: function (axis) { gapAxis = axis === "z" ? "z" : "x"; fillBody(); },
    setGapSide: function (side) { gapSide = side === "-" ? "-" : "+"; fillBody(); },
    setGapMm: function (mm) {
      lastGapMm = Number(mm);
      if (!gapInput) fillBody();
      if (gapInput) gapInput.value = String(mm);
      else gapInput = { value: String(mm) };
    },
    previewGapPlace: previewGapPlace,
    confirmGapPlace: confirmGapPlace,
    cancelGapPlace: function () { cancelGapPlace(true); },
    computeGapDelta: computeGapDelta,
    getGapPlace: function () {
      return {
        axis: gapAxis,
        side: gapSide,
        ref: gapRef && { id: gapRef.id, index: gapRef.index, indices: gapRef.indices.slice() },
        warn: gapWarn.length,
        value: gapInput ? gapInput.value : "",
      };
    },
    historyProbe: function () { return { len: historyLen(), index: historyIndex() }; },
  };
})();
