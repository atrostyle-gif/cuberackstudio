// =========================================================
// ラック削除モード
// JointBallクリック → 対象ラック強調 → 確認後に既存 deleteActiveCluster を使う
// =========================================================
(function () {
  let highlighted = [];

  function joints() { return window.joints || []; }

  function rackIndices(jointIndex) {
    const js = joints();
    const j = js[jointIndex];
    if (!j) return [];
    if (typeof j.rackId === "string" && j.rackId) {
      const out = [];
      for (let i = 0; i < js.length; i++) {
        if (js[i] && js[i].rackId === j.rackId) out.push(i);
      }
      if (out.length) return out;
    }
    if (typeof window.rebuildJointClusters === "function") {
      try { window.rebuildJointClusters(); } catch (e) {}
    }
    const cid = window.jointClusterId && window.jointClusterId[jointIndex];
    if (cid != null && window.jointClusters && window.jointClusters[cid] && window.jointClusters[cid].joints) {
      return window.jointClusters[cid].joints.slice();
    }
    return [jointIndex];
  }

  function setEmissive(mesh, hex) {
    if (!mesh) return;
    mesh.traverse(function (child) {
      const mat = child && child.material;
      const list = Array.isArray(mat) ? mat : (mat ? [mat] : []);
      list.forEach(function (m) {
        if (!m || !m.emissive) return;
        if (typeof m.userData._v3DelE === "undefined") {
          m.userData._v3DelE = m.emissive.getHex();
          m.userData._v3DelI = m.emissiveIntensity || 0;
        }
        m.emissive.setHex(hex);
        m.emissiveIntensity = hex ? 0.55 : (m.userData._v3DelI || 0);
        highlighted.push(m);
      });
    });
  }

  function clearHighlight() {
    highlighted.forEach(function (m) {
      if (!m || !m.emissive) return;
      if (typeof m.userData._v3DelE === "number") m.emissive.setHex(m.userData._v3DelE);
      if (typeof m.userData._v3DelI === "number") m.emissiveIntensity = m.userData._v3DelI;
      delete m.userData._v3DelE;
      delete m.userData._v3DelI;
    });
    highlighted = [];
  }

  function counts(indices) {
    const set = new Set(indices);
    const beams = (window.beams || []).filter(function (b) { return b && (set.has(b.a) || set.has(b.b)); }).length;
    const poles = (window.poles || []).filter(function (p) { return p && (set.has(p.a) || set.has(p.b)); }).length;
    const legs = (window.legs || []).filter(function (l) {
      return l && typeof l.jointIndex === "number" && set.has(l.jointIndex);
    }).length;
    let shelves = 0;
    let panels = 0;
    (window.shelves || []).forEach(function (s) {
      if (s && Array.isArray(s.j4) && s.j4.some(function (i) { return set.has(i); })) shelves++;
    });
    (window.panels || []).forEach(function (p) {
      if (p && Array.isArray(p.j4) && p.j4.some(function (i) { return set.has(i); })) panels++;
    });
    return {
      joints: indices.length,
      beams: beams,
      poles: poles,
      legs: legs,
      shelves: shelves,
      panels: panels,
    };
  }

  function highlight(indices) {
    clearHighlight();
    const set = new Set(indices);
    (window.jointMeshes || []).forEach(function (m, i) {
      if (set.has(i)) setEmissive(m, 0xf97316);
    });
    (window.beams || []).forEach(function (b) {
      if (b && (set.has(b.a) || set.has(b.b))) setEmissive(b.mesh, 0xf97316);
    });
    (window.poles || []).forEach(function (p) {
      if (p && (set.has(p.a) || set.has(p.b))) setEmissive(p.mesh, 0xf97316);
    });
    (window.legs || []).forEach(function (l) {
      if (l && set.has(l.jointIndex)) setEmissive(l.mesh, 0xf97316);
    });
    (window.shelves || []).forEach(function (s) {
      if (s && Array.isArray(s.j4) && s.j4.some(function (i) { return set.has(i); })) setEmissive(s.mesh, 0xf97316);
    });
    (window.panels || []).forEach(function (p) {
      if (p && Array.isArray(p.j4) && p.j4.some(function (i) { return set.has(i); })) setEmissive(p.mesh, 0xf97316);
    });
  }

  function confirmAndDelete(jointIndex) {
    const idxs = rackIndices(jointIndex);
    if (!idxs.length) return false;
    if (window.v3WorkLayers && typeof window.v3WorkLayers.canEditIndexes === "function" && !window.v3WorkLayers.canEditIndexes(idxs)) {
      console.warn("[rack-delete] refused locked/hidden rack");
      return false;
    }
    highlight(idxs);
    const n = counts(idxs);
    const j = joints()[jointIndex];
    const rid = j && j.rackId ? String(j.rackId) : "—";
    const msg = "このラックを削除しますか？\n\n"
      + "ラックID: " + rid + "\n"
      + "JointBall " + n.joints + " / Beam " + n.beams + " / Pole " + n.poles + "\n"
      + "Leg " + n.legs + " / 棚板 " + n.shelves + " / 壁板 " + n.panels;
    const ok = window.confirm(msg);
    clearHighlight();
    if (!ok) return false;
    return window.deleteActiveCluster(jointIndex, { confirm: false });
  }

  function onPointerDown(ev) {
    if (!window.isDeleteModeOn) return;
    if (ev.altKey || ev.shiftKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.button != null && ev.button !== 0) return;
    const canvas = window.renderer && window.renderer.domElement;
    if (!canvas || !canvas.contains(ev.target)) return;
    const pick = window.v3CadOps && window.v3CadOps.pickAt(ev.clientX, ev.clientY);
    if (!pick || pick.kind !== "joint") return;
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    confirmAndDelete(pick.index);
  }

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") clearHighlight();
  });

  const orig = window.setDeleteMode;
  if (typeof orig === "function" && !orig.__v3RackDelWrap) {
    window.setDeleteMode = function (on) {
      const result = orig.apply(this, arguments);
      if (!window.isDeleteModeOn) clearHighlight();
      return result;
    };
    window.setDeleteMode.__v3RackDelWrap = true;
  }

  window.v3RackDelete = {
    rackIndices: rackIndices,
    counts: counts,
    confirmAndDelete: confirmAndDelete,
    clearHighlight: clearHighlight,
  };
})();
