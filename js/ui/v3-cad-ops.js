// =========================================================
// V3 CAD 共通操作：ピック / 履歴まとめ / コマンド可否
// =========================================================
(function () {
  function canvas() {
    return window.renderer && window.renderer.domElement;
  }

  function updateRay(clientX, clientY) {
    const el = canvas();
    if (!el || !window.raycaster || !window.mouse || !window.camera) return false;
    const rect = el.getBoundingClientRect();
    window.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    window.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    window.raycaster.setFromCamera(window.mouse, window.camera);
    return true;
  }

  function ancestorIndex(list, obj) {
    if (!list || !obj) return -1;
    let cur = obj;
    while (cur) {
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].mesh === cur) return i;
      }
      cur = cur.parent;
    }
    return -1;
  }

  function boardIndex(list, obj, key) {
    if (!list || !obj) return -1;
    let cur = obj;
    while (cur) {
      const idx = cur.userData && typeof cur.userData[key] === "number" ? cur.userData[key] : -1;
      if (idx >= 0) return idx;
      const found = list.findIndex((item) => item && item.mesh === cur);
      if (found >= 0) return found;
      cur = cur.parent;
    }
    return -1;
  }

  function visibleMeshes(list) {
    return (list || []).map((item) => item && item.mesh).filter((m) => m && m.visible);
  }

  function findLegIndex(obj, legs) {
    if (!obj || !legs || !legs.length) return -1;
    for (let i = 0; i < legs.length; i++) {
      const mesh = legs[i] && legs[i].mesh;
      if (!mesh) continue;
      if (mesh === obj) return i;
      const ud = mesh.userData || {};
      if (ud.v3LegBase === obj || ud.v3LegCone === obj) return i;
    }
    let cur = obj;
    while (cur) {
      const type = cur.userData && cur.userData.type;
      if (type === "leg") {
        for (let i = 0; i < legs.length; i++) {
          if (legs[i] && legs[i].mesh === cur) return i;
        }
        const ji = cur.userData.jointIndex;
        if (typeof ji === "number") {
          for (let i = 0; i < legs.length; i++) {
            if (legs[i] && legs[i].jointIndex === ji) return i;
          }
        }
      }
      cur = cur.parent;
    }
    return -1;
  }

  function classifyHit(obj, beams, poles, joints, shelves, panels, legs) {
    let idx = ancestorIndex(poles, obj);
    if (idx >= 0) return { kind: "pole", index: idx, mesh: poles[idx].mesh, data: poles[idx] };
    idx = ancestorIndex(beams, obj);
    if (idx >= 0) return { kind: "beam", index: idx, mesh: beams[idx].mesh, data: beams[idx] };
    idx = joints.indexOf(obj);
    if (idx < 0) {
      let cur = obj;
      while (cur && idx < 0) {
        idx = joints.indexOf(cur);
        cur = cur.parent;
      }
    }
    if (idx >= 0) return { kind: "joint", index: idx, mesh: joints[idx], data: (window.joints || [])[idx] };
    idx = boardIndex(shelves, obj, "shelfIndex");
    if (idx >= 0) return { kind: "shelf", index: idx, mesh: shelves[idx].mesh, data: shelves[idx] };
    idx = boardIndex(panels, obj, "panelIndex");
    if (idx >= 0) return { kind: "panel", index: idx, mesh: panels[idx].mesh, data: panels[idx] };
    idx = findLegIndex(obj, legs);
    if (idx >= 0) return { kind: "leg", index: idx, mesh: legs[idx].mesh, data: legs[idx] };
    return null;
  }

  function pickAt(clientX, clientY, opts) {
    if (!updateRay(clientX, clientY)) return null;
    const hits = [];
    const beams = window.beams || [];
    const poles = window.poles || [];
    const joints = window.jointMeshes || [];
    const shelves = window.shelves || [];
    const panels = window.panels || [];
    const legs = (opts && opts.includeLeg) ? (window.legs || []) : [];
    const preferBoard = !!(opts && opts.preferBoard);

    const conn = visibleMeshes(beams).concat(visibleMeshes(poles));
    if (conn.length) hits.push.apply(hits, window.raycaster.intersectObjects(conn, true));
    const jointVis = joints.filter((m) => m && m.visible);
    if (jointVis.length) hits.push.apply(hits, window.raycaster.intersectObjects(jointVis, true));
    const boards = visibleMeshes(shelves).concat(visibleMeshes(panels));
    if (boards.length) hits.push.apply(hits, window.raycaster.intersectObjects(boards, true));
    if (legs.length) {
      const legMeshes = legs.map(function (item) { return item && item.mesh; }).filter(function (m) { return m && m.visible !== false; });
      if (legMeshes.length) hits.push.apply(hits, window.raycaster.intersectObjects(legMeshes, true));
    }
    hits.sort((a, b) => a.distance - b.distance);
    if (opts && opts.includeLeg) {
      const aimed = jointNearClick(hits, clientX, clientY, beams, poles, joints, shelves, panels, legs);
      if (aimed) return aimed;
    }
    return pickFromHits(hits, beams, poles, joints, shelves, panels, legs, { preferBoard: preferBoard, includeLeg: !!(opts && opts.includeLeg) });
  }

  function jointNearClick(hits, clientX, clientY, beams, poles, joints, shelves, panels, legs) {
    if (!hits || !hits.length || !window.THREE || !window.joints) return null;
    const jr = (typeof window.jointRadius === "number" ? window.jointRadius : 10) + 8;
    const pixel = 20;
    const hitY = hits[0].point ? hits[0].point.y : null;
    let best = null;
    let bestPix = pixel;
    for (let i = 0; i < hits.length; i++) {
      const tagged = classifyHit(hits[i].object, beams, poles, joints, shelves, panels, legs);
      if (!tagged || tagged.kind !== "joint") continue;
      const j = window.joints[tagged.index];
      if (!j) continue;
      if (hitY != null && Math.abs(hitY - j.y) > jr) continue;
      const s = worldToScreen(new window.THREE.Vector3(j.x, j.y, j.z));
      if (!s) continue;
      const pix = Math.hypot(s.x - clientX, s.y - clientY);
      if (pix < bestPix) {
        bestPix = pix;
        if (hits[i].point) tagged.point = hits[i].point;
        best = tagged;
      }
    }
    return best;
  }

  function pickFromHits(hits, beams, poles, joints, shelves, panels, legs, opts) {
    if (!hits || !hits.length) return null;
    const preferBoard = !!(opts && opts.preferBoard);
    if (preferBoard) {
      for (let i = 0; i < hits.length; i++) {
        const boardHit = classifyHit(hits[i].object, beams, poles, joints, shelves, panels, legs);
        if (boardHit && (boardHit.kind === "shelf" || boardHit.kind === "panel")) {
          if (hits[i].point) boardHit.point = hits[i].point;
          return boardHit;
        }
      }
    }
    if (opts && opts.includeLeg) {
      const d0 = hits[0].distance;
      const slack = (typeof window.jointRadius === "number" ? window.jointRadius : 10) + 2;
      for (let i = 0; i < hits.length; i++) {
        if (hits[i].distance > d0 + slack) break;
        const jointHit = classifyHit(hits[i].object, beams, poles, joints, shelves, panels, legs);
        if (jointHit && jointHit.kind === "joint") {
          if (hits[i].point) jointHit.point = hits[i].point;
          return jointHit;
        }
      }
    }
    const found = classifyHit(hits[0].object, beams, poles, joints, shelves, panels, legs);
    if (found && hits[0].point) found.point = hits[0].point;
    return found;
  }

  function worldToScreen(vec) {
    const el = canvas();
    if (!el || !window.camera) return null;
    const v = vec.clone().project(window.camera);
    if (v.z > 1) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  function wrapFn(name, after) {
    const orig = window[name];
    if (typeof orig !== "function" || orig.__v3OpsWrapped) return;
    const wrapped = function () {
      const result = orig.apply(this, arguments);
      if (typeof after === "function") after();
      return result;
    };
    wrapped.__v3OpsWrapped = true;
    window[name] = wrapped;
  }

  function wrapSaveHistory() {
    const orig = window.saveHistory;
    if (typeof orig !== "function" || orig.__v3OpsHistWrapped) return;
    window.saveHistory = function () {
      if (window.__CR_SKIP_HISTORY__) return;
      return orig.apply(this, arguments);
    };
    window.saveHistory.__v3OpsHistWrapped = true;
  }

  function withSingleHistory(reason, fn) {
    wrapSaveHistory();
    window.__CR_SKIP_HISTORY__ = true;
    try {
      fn();
    } finally {
      window.__CR_SKIP_HISTORY__ = false;
    }
    if (typeof window.saveHistory === "function") window.saveHistory(reason);
  }

  function layoutState() {
    return window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getState === "function"
      ? window.v3WorkspaceUi.getState()
      : (window.v3LayoutStore ? window.v3LayoutStore.load() : null);
  }

  function persistPatch(partial) {
    const ui = window.v3WorkspaceUi;
    if (ui && typeof ui.patchState === "function") {
      const st = ui.getState();
      Object.keys(partial).forEach((key) => {
        st[key] = partial[key];
      });
      ui.patchState({});
      if (typeof ui.persist === "function") ui.persist();
      return st;
    }
    return null;
  }

  function commandEnabled(cmd) {
    const joints = window.joints || [];
    const poles = window.poles || [];
    const beams = window.beams || [];
    if (cmd === "rotate") return poles.length > 0;
    if (cmd === "move") return joints.length > 0;
    if (cmd === "length") {
      const idx = window.__CR_ACTIVE_JOINT_INDEX__;
      return (typeof idx === "number" && idx >= 0) || beams.length + poles.length > 0;
    }
    if (cmd === "clusterDel") {
      const idx = window.__CR_ACTIVE_JOINT_INDEX__;
      return typeof idx === "number" && idx >= 0;
    }
    if (cmd === "duplicate") return joints.length > 0;
    if (cmd === "leg") return true;
    return true;
  }

  function iconFor(cmd) {
    const cad = window.v3CadToolbar;
    if (!cad) return "";
    const item = cad.itemByCmd(cmd);
    if (item && typeof cad.iconMarkup === "function") return cad.iconMarkup(item.icon);
    return "";
  }

  function labelFor(cmd) {
    const item = window.v3CadToolbar && window.v3CadToolbar.itemByCmd(cmd);
    return item ? item.label : cmd;
  }

  window.v3CadOps = {
    canvas,
    updateRay,
    pickAt,
    pickFromHits,
    jointNearClick,
    classifyHit,
    findLegIndex,
    worldToScreen,
    wrapFn,
    wrapSaveHistory,
    withSingleHistory,
    layoutState,
    persistPatch,
    commandEnabled,
    iconFor,
    labelFor,
  };
})();
