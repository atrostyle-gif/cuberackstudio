// =========================================================
// V3 Move XYZ ギズモ（STEP⑥-C）
// TransformControls は未使用のため自前実装。
// X/Y/Z 矢印は各1軸、中央丸は XZ 平面（Y固定）。
// =========================================================
(function () {
  const STEP = 50;
  const MAGNET = 30;
  const AXIS = {
    x: { color: 0xef4444, dir: [1, 0, 0] },
    y: { color: 0x3b82f6, dir: [0, 1, 0] },
    z: { color: 0x22c55e, dir: [0, 0, 1] },
    xz: { color: 0xf8fafc, dir: [0, 1, 0] },
  };

  let group = null;
  let handles = {};
  let hover = null;
  let active = null;
  let indices = [];
  let anchorIndex = -1;
  let starts = [];
  let dragging = false;
  let dragAxis = null;
  let startHit = null;
  let startClient = null;
  let dragPlane = null;
  let pointerId = null;
  let moved = false;
  let ticking = false;
  let fromModeOff = false;
  let pending = null;
  const CLICK_PX = 8;

  function T() { return window.THREE; }
  function joints() { return window.joints || []; }
  function camera() { return window.camera; }
  function controls() { return window.controls; }
  function renderer() { return window.renderer; }
  function wl() { return window.v3WorkLayers; }

  function snap(v) {
    if (typeof window.snapMagnet === "function") return window.snapMagnet(v, STEP, MAGNET);
    const s = Math.round(v / STEP) * STEP;
    return Math.abs(s - v) <= MAGNET ? s : v;
  }

  function centroid(list) {
    const js = joints();
    let x = 0, y = 0, z = 0, n = 0;
    for (let i = 0; i < list.length; i++) {
      const j = js[list[i]];
      if (!j) continue;
      x += j.x; y += j.y; z += j.z; n++;
    }
    if (!n) return null;
    return { x: x / n, y: y / n, z: z / n };
  }

  function clusterOf(jointIndex) {
    if (typeof window.rebuildJointClusters === "function") {
      try { window.rebuildJointClusters(); } catch (e) {}
    }
    const ids = window.jointClusterId;
    const clusters = window.jointClusters;
    const cid = ids && ids[jointIndex];
    if (cid != null && cid >= 0 && clusters && clusters[cid] && clusters[cid].joints && clusters[cid].joints.length) {
      return clusters[cid].joints.slice();
    }
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
    (window.beams || []).forEach(function (b) { if (b) link(b.a, b.b); });
    (window.poles || []).forEach(function (p) { if (p) link(p.a, p.b); });
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

  function mat(color, opts) {
    const THREE = T();
    const m = new THREE.MeshBasicMaterial({
      color: color,
      transparent: !!(opts && opts.transparent),
      opacity: opts && opts.opacity != null ? opts.opacity : 1,
      depthTest: false,
      depthWrite: false,
    });
    m.toneMapped = false;
    return m;
  }

  function makeArrow(axis) {
    const THREE = T();
    const g = new THREE.Group();
    g.name = "move-" + axis;
    g.userData = { moveHandle: axis };
    const col = AXIS[axis].color;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 16), mat(col));
    shaft.position.y = 0.46;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 20), mat(col));
    head.position.y = 0.93;
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.12, 12),
      mat(col, { transparent: true, opacity: 0.0 })
    );
    hit.position.y = 0.56;
    hit.userData = { moveHandle: axis };
    shaft.userData = { moveHandle: axis };
    head.userData = { moveHandle: axis };
    g.add(shaft); g.add(head); g.add(hit);
    if (axis === "x") g.rotation.z = -Math.PI / 2;
    if (axis === "z") g.rotation.x = Math.PI / 2;
    g.traverse(function (o) { o.renderOrder = 970; });
    return { group: g, shaft: shaft, head: head };
  }

  function makeCenter() {
    const THREE = T();
    const g = new THREE.Group();
    g.name = "move-xz";
    g.userData = { moveHandle: "xz" };
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), mat(0xf8fafc));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.025, 10, 32),
      mat(0x64748b)
    );
    ring.rotation.x = Math.PI / 2;
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      mat(0xffffff, { transparent: true, opacity: 0.0 })
    );
    ball.userData = { moveHandle: "xz" };
    ring.userData = { moveHandle: "xz" };
    hit.userData = { moveHandle: "xz" };
    g.add(ball); g.add(ring); g.add(hit);
    return { group: g, ball: ball, ring: ring };
  }

  function build() {
    const THREE = T();
    const parent = window.scene;
    if (!THREE || !parent) return;
    dispose();
    group = new THREE.Group();
    group.name = "v3-move-gizmo";
    group.userData = { type: "move-gizmo" };
    handles = {
      x: makeArrow("x"),
      y: makeArrow("y"),
      z: makeArrow("z"),
      xz: makeCenter(),
    };
    group.add(handles.x.group);
    group.add(handles.y.group);
    group.add(handles.z.group);
    group.add(handles.xz.group);
    parent.add(group);
    startTick();
  }

  function dispose() {
    if (!group) return;
    group.traverse(function (obj) {
      if (obj.geometry && obj.geometry.dispose) {
        try { obj.geometry.dispose(); } catch (e) {}
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) { try { m.dispose && m.dispose(); } catch (e2) {} });
      }
    });
    if (group.parent) group.parent.remove(group);
    group = null;
    handles = {};
  }

  function anchorPos() {
    const j = joints()[anchorIndex];
    if (j) return { x: j.x, y: j.y, z: j.z };
    return centroid(indices);
  }

  function place() {
    if (!group || !indices.length) return;
    const c = anchorPos();
    if (!c) return;
    group.position.set(c.x, c.y, c.z);
    updateScale();
  }

  function updateScale() {
    if (!group || !camera()) return;
    const dist = camera().position.distanceTo(group.position);
    const s = Math.max(90, Math.min(240, dist * 0.06));
    group.scale.set(s, s, s);
  }

  function startTick() {
    if (ticking) return;
    ticking = true;
    function loop() {
      if (!group) { ticking = false; return; }
      updateScale();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function setHighlight(axis) {
    hover = axis;
    ["x", "y", "z"].forEach(function (a) {
      const on = a === axis || a === active;
      const h = handles[a];
      if (!h) return;
      [h.shaft, h.head].forEach(function (mesh) {
        if (!mesh || !mesh.material) return;
        mesh.material.color.setHex(on ? 0xffffff : AXIS[a].color);
      });
      h.group.scale.setScalar(on ? 1.12 : 1);
    });
    if (handles.xz && handles.xz.ball && handles.xz.ball.material) {
      const on = axis === "xz" || active === "xz";
      handles.xz.ball.material.color.setHex(on ? 0x38bdf8 : 0xf8fafc);
      handles.xz.group.scale.setScalar(on ? 1.12 : 1);
    }
  }

  function handleFromObject(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData && cur.userData.moveHandle) return cur.userData.moveHandle;
      cur = cur.parent;
    }
    return null;
  }

  function pickHandle(ev) {
    if (!group || !camera() || !renderer()) return null;
    const THREE = T();
    const rect = renderer().domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera());
    const hits = ray.intersectObject(group, true);
    for (let i = 0; i < hits.length; i++) {
      const axis = handleFromObject(hits[i].object);
      if (axis) return { axis: axis, point: hits[i].point };
    }
    return null;
  }

  function makeDragPlane(axis, origin) {
    const THREE = T();
    const cam = camera();
    const plane = new THREE.Plane();
    if (axis === "xz") {
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
      return plane;
    }
    const dir = new THREE.Vector3().fromArray(AXIS[axis].dir);
    const camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    let n = new THREE.Vector3().crossVectors(dir, camDir);
    if (n.lengthSq() < 1e-8) n.crossVectors(dir, cam.up);
    if (n.lengthSq() < 1e-8) n.set(dir.z, 0, -dir.x);
    n.cross(dir);
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
    n.normalize();
    plane.setFromNormalAndCoplanarPoint(n, origin);
    return plane;
  }

  function hitPlane(ev, plane) {
    if (!plane || !camera() || !renderer()) return null;
    const THREE = T();
    const rect = renderer().domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera());
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, out)) return null;
    return out;
  }

  function applyFromStart(dx, dy, dz, axis, useSnap) {
    const js = joints();
    const meshes = window.jointMeshes || [];
    const moveX = !axis || axis === "x" || axis === "xz" || axis === "xyz";
    const moveY = !axis || axis === "y" || axis === "xyz";
    const moveZ = !axis || axis === "z" || axis === "xz" || axis === "xyz";
    const snapFn = useSnap === false ? function (v) { return v; } : snap;
    for (let i = 0; i < indices.length; i++) {
      const j = js[indices[i]];
      const base = starts[i];
      if (!j || !base) continue;
      j.x = moveX ? snapFn(base.x + dx) : base.x;
      j.y = moveY ? snapFn(base.y + dy) : base.y;
      j.z = moveZ ? snapFn(base.z + dz) : base.z;
      const mesh = meshes[indices[i]];
      if (mesh) mesh.position.set(j.x, j.y, j.z);
    }
    if (typeof window.syncLegsToConnectedJoints === "function") {
      window.syncLegsToConnectedJoints();
    } else if (Array.isArray(window.legs) && typeof window.updateLegMeshPosition === "function") {
      window.legs.forEach(function (leg) {
        if (leg && typeof leg.jointIndex === "number") window.updateLegMeshPosition(leg.jointIndex);
      });
    }
    const upd = window.updateConnectorMesh;
    if (typeof upd === "function") {
      (window.beams || []).forEach(function (b) {
        if (!b || !b.mesh) return;
        const a = js[b.a], c = js[b.b];
        if (a && c) upd(b.mesh, a, c);
      });
      (window.poles || []).forEach(function (p) {
        if (!p || !p.mesh) return;
        const a = js[p.a], c = js[p.b];
        if (a && c) upd(p.mesh, a, c);
      });
    }
    if (typeof window.rebuildBoards === "function") {
      try { window.rebuildBoards(indices); } catch (e) {}
    }
    place();
  }

  function restoreStarts() {
    const js = joints();
    const meshes = window.jointMeshes || [];
    for (let i = 0; i < indices.length; i++) {
      const j = js[indices[i]];
      const base = starts[i];
      if (!j || !base) continue;
      j.x = base.x; j.y = base.y; j.z = base.z;
      const mesh = meshes[indices[i]];
      if (mesh) mesh.position.set(j.x, j.y, j.z);
    }
    if (typeof window.syncLegsToConnectedJoints === "function") window.syncLegsToConnectedJoints();
    const upd = window.updateConnectorMesh;
    if (typeof upd === "function") {
      (window.beams || []).forEach(function (b) {
        if (b && b.mesh && js[b.a] && js[b.b]) upd(b.mesh, js[b.a], js[b.b]);
      });
      (window.poles || []).forEach(function (p) {
        if (p && p.mesh && js[p.a] && js[p.b]) upd(p.mesh, js[p.a], js[p.b]);
      });
    }
    if (typeof window.rebuildBoards === "function") {
      try { window.rebuildBoards(indices); } catch (e) {}
    }
    place();
  }

  function screenAxisDelta(ev, axis) {
    if (!group || !camera() || !renderer() || !startClient) return 0;
    const THREE = T();
    const origin = group.position.clone();
    const dir = new THREE.Vector3().fromArray(AXIS[axis].dir);
    const tip = origin.clone().add(dir);
    const a = origin.clone().project(camera());
    const b = tip.clone().project(camera());
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const slen = Math.hypot(sx, sy);
    if (slen < 1e-5) return 0;
    const rect = renderer().domElement.getBoundingClientRect();
    const mx = ((ev.clientX - startClient.x) / rect.width) * 2;
    const my = -((ev.clientY - startClient.y) / rect.height) * 2;
    const along = (mx * sx + my * sy) / slen;
    return along / slen;
  }

  function beginDrag(axis, ev, point) {
    if (!indices.length || !group) return;
    const THREE = T();
    dragging = true;
    dragAxis = axis;
    active = axis;
    moved = false;
    starts = indices.map(function (idx) {
      const j = joints()[idx];
      return j ? { x: j.x, y: j.y, z: j.z } : { x: 0, y: 0, z: 0 };
    });
    const origin = group.position.clone();
    dragPlane = makeDragPlane(axis, origin);
    startHit = point ? point.clone() : hitPlane(ev, dragPlane);
    if (!startHit) startHit = origin.clone();
    startClient = { x: ev.clientX, y: ev.clientY };
    pointerId = ev.pointerId;
    try { renderer().domElement.setPointerCapture?.(pointerId); } catch (e) {}
    if (controls()) controls().enabled = false;
    setHighlight(axis);
    try {
      window.v3MoveGap?.onDragStart?.(indices, axis);
      if (axis === "y") window.v3MoveGap?.setYHint?.(true);
    } catch (e2) {}
  }

  function moveDrag(ev) {
    if (!dragging || !startHit) return;
    const THREE = T();
    const cam = camera();
    let dx = 0, dy = 0, dz = 0;
    if (dragAxis === "xz") {
      const hit = dragPlane ? hitPlane(ev, dragPlane) : null;
      if (!hit) return;
      dx = hit.x - startHit.x;
      dz = hit.z - startHit.z;
    } else {
      const dir = new THREE.Vector3().fromArray(AXIS[dragAxis].dir);
      let camDir = new THREE.Vector3();
      if (cam) cam.getWorldDirection(camDir);
      const parallel = Math.abs(camDir.dot(dir)) > 0.92;
      const hit = (!parallel && dragPlane) ? hitPlane(ev, dragPlane) : null;
      if (hit) {
        dx = dragAxis === "x" ? (hit.x - startHit.x) : 0;
        dy = dragAxis === "y" ? (hit.y - startHit.y) : 0;
        dz = dragAxis === "z" ? (hit.z - startHit.z) : 0;
      } else {
        const d = screenAxisDelta(ev, dragAxis);
        dx = dragAxis === "x" ? d : 0;
        dy = dragAxis === "y" ? d : 0;
        dz = dragAxis === "z" ? d : 0;
      }
    }
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01) moved = true;
    applyFromStart(dx, dy, dz, dragAxis);
    try {
      if (dragAxis === "y") {
        window.v3MoveGap?.setYHint?.(true, dy);
        window.v3MoveGap?.onDragMove?.("y");
      } else {
        window.v3MoveGap?.setYHint?.(false);
        window.v3MoveGap?.onDragMove?.(dragAxis);
      }
    } catch (e) {}
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const axis = dragAxis;
    dragAxis = null;
    active = null;
    startHit = null;
    startClient = null;
    dragPlane = null;
    const pid = pointerId;
    pointerId = null;
    if (pid != null) {
      try { renderer()?.domElement?.releasePointerCapture?.(pid); } catch (e) {}
    }
    if (controls()) controls().enabled = true;
    setHighlight(hover);
    try { window.v3MoveGap?.onDragEnd?.(); window.v3MoveGap?.setYHint?.(false); } catch (e2) {}
    if (moved) {
      if (window.callIfExists) window.callIfExists("saveHistory", "move cluster");
      else if (typeof window.saveHistory === "function") window.saveHistory("move cluster");
      if (typeof window.requestEstimateRender === "function") window.requestEstimateRender("after move cluster");
      if (typeof window.applyColorChartToAllConnectors === "function") window.applyColorChartToAllConnectors();
    }
    moved = false;
    place();
    return axis;
  }

  function cancelDrag() {
    if (dragging && starts.length && indices.length) restoreStarts();
    dragging = false;
    dragAxis = null;
    active = null;
    startHit = null;
    startClient = null;
    dragPlane = null;
    moved = false;
    pending = null;
    if (controls()) controls().enabled = true;
    try { window.v3MoveGap?.onDragEnd?.(); window.v3MoveGap?.setYHint?.(false); } catch (e) {}
  }

  function hide() {
    cancelDrag();
    pending = null;
    dispose();
    indices = [];
    starts = [];
    anchorIndex = -1;
    hover = null;
    try { window.v3MoveGap?.clear?.(); } catch (e) {}
  }

  function captureStarts() {
    starts = indices.map(function (idx) {
      const j = joints()[idx];
      return j ? { x: j.x, y: j.y, z: j.z } : { x: 0, y: 0, z: 0 };
    });
  }

  function selectJoint(jointIndex) {
    if (!window.isMoveModeOn) return false;
    if (typeof jointIndex !== "number" || jointIndex < 0 || !joints()[jointIndex]) return false;
    const cluster = clusterOf(jointIndex);
    if (wl() && typeof wl().canEditIndexes === "function" && !wl().canEditIndexes(cluster)) {
      console.warn("[work-layers] refused move gizmo");
      return false;
    }
    indices = cluster.slice();
    anchorIndex = jointIndex;
    if (!group) build();
    place();
    try { window.v3MovePanel?.onAnchorSelected?.(jointIndex); } catch (e) {}
    try { window.v3MoveGap?.showForSelection?.(indices); } catch (e2) {}
    return true;
  }

  function uiIgnore(ev) {
    const t = ev.target;
    if (!t || !t.closest) return false;
    return !!t.closest("#v3-cmd-pop, #v3-east-rail, .v3-toolbar, #v3-north, #v3-layer-panel, #v3-view-nav, #v3-sel-hud, #v3-rotate-hud, #v3-radial, .v3-move-pick");
  }

  function blockedByPanel() {
    try {
      if (window.v3MovePanel && typeof window.v3MovePanel.blocksGizmo === "function") {
        return !!window.v3MovePanel.blocksGizmo();
      }
    } catch (e) {}
    return false;
  }

  function fireAxisClick(axis) {
    if (axis !== "x" && axis !== "y" && axis !== "z") return;
    try { window.v3MovePanel?.onAxisClick?.(axis); } catch (e) {}
  }

  function clearPending() {
    if (!pending) return;
    pending = null;
    if (!dragging && controls()) controls().enabled = true;
  }

  function onPointerDown(ev) {
    if (!window.isMoveModeOn) return;
    if (ev.button != null && ev.button !== 0) return;
    if (uiIgnore(ev)) return;
    if (blockedByPanel()) return;
    const hit = pickHandle(ev);
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    pending = {
      axis: hit.axis,
      point: hit.point,
      x: ev.clientX,
      y: ev.clientY,
      ev: ev,
    };
    if (controls()) controls().enabled = false;
  }

  function onPointerMove(ev) {
    if (!window.isMoveModeOn) return;
    if (pending && !dragging) {
      const d = Math.hypot(ev.clientX - pending.x, ev.clientY - pending.y);
      if (d >= CLICK_PX) {
        const p = pending;
        pending = null;
        beginDrag(p.axis, p.ev || ev, p.point);
        moveDrag(ev);
      }
      return;
    }
    if (dragging) {
      ev.preventDefault();
      moveDrag(ev);
      return;
    }
    if (!group) return;
    if (uiIgnore(ev) || blockedByPanel()) {
      if (hover) setHighlight(null);
      return;
    }
    const hit = pickHandle(ev);
    setHighlight(hit ? hit.axis : null);
  }

  function onPointerUp(ev) {
    if (dragging) {
      ev.preventDefault();
      endDrag();
      return;
    }
    if (pending) {
      const axis = pending.axis;
      clearPending();
      fireAxisClick(axis);
    }
  }

  function hookMode() {
    if (window.__v3MoveGizmoHooked) return;
    const orig = window.setMoveMode;
    if (typeof orig !== "function") return;
    window.__v3MoveGizmoHooked = true;
    window.setMoveMode = function (on) {
      const result = orig.apply(this, arguments);
      if (!window.isMoveModeOn) {
        if (!fromModeOff) hide();
      }
      return result;
    };
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);

  hookMode();
  window.addEventListener("load", hookMode);

  window.v3MoveGizmo = {
    selectJoint: selectJoint,
    isDragging: function () { return dragging; },
    getIndices: function () { return indices.slice(); },
    getAnchorIndex: function () { return anchorIndex; },
    hide: hide,
    cancelDrag: cancelDrag,
    place: place,
    applyDelta: function (axis, dx, dy, dz, useSnap) {
      if (!indices.length) return false;
      captureStarts();
      applyFromStart(dx || 0, dy || 0, dz || 0, axis, useSnap !== false);
      return true;
    },
    applyExact: function (axis, dx, dy, dz) {
      if (!indices.length) return false;
      captureStarts();
      applyFromStart(dx || 0, dy || 0, dz || 0, axis, false);
      place();
      return true;
    },
    hasGroup: function () { return !!group; },
    getPosition: function () {
      return group ? { x: group.position.x, y: group.position.y, z: group.position.z } : null;
    },
  };
})();
