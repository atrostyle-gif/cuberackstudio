// =========================================================
// Phase 6: 複数選択・一括色変更 / 一括削除
// =========================================================
(function () {
  const HIGHLIGHT = 0x38bdf8;
  const OUTLINE_NAME = "__v3SelOutline";
  let selected = [];

  function keyOf(hit) {
    return hit.kind + ":" + hit.index;
  }

  function same(a, b) {
    return a && b && a.kind === b.kind && a.index === b.index;
  }

  function isBoardItem(item) {
    return item && (item.kind === "shelf" || item.kind === "panel");
  }

  function isBoardMesh(mesh) {
    const type = mesh && mesh.userData && mesh.userData.type;
    return type === "shelf" || type === "panel";
  }

  function disposeOutlineChild(mesh, child) {
    mesh.remove(child);
    try {
      if (child.geometry && child.geometry !== mesh.geometry) child.geometry.dispose();
    } catch (e) {}
    try {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => { try { mat && mat.dispose && mat.dispose(); } catch (e2) {} });
    } catch (e) {}
  }

  function clearBoardOutline(mesh) {
    if (!mesh || !mesh.children) return;
    mesh.children.slice().forEach((child) => {
      if (child && child.name === OUTLINE_NAME) disposeOutlineChild(mesh, child);
    });
  }

  function showBoardOutline(mesh) {
    if (!mesh || !mesh.geometry || typeof THREE === "undefined") return;
    clearBoardOutline(mesh);
    const edges = new THREE.EdgesGeometry(mesh.geometry, 1);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: HIGHLIGHT,
      depthTest: false,
      transparent: true,
      opacity: 1,
    }));
    line.name = OUTLINE_NAME;
    line.renderOrder = 30;
    line.raycast = function () {};
    mesh.add(line);

    const tint = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({
      color: HIGHLIGHT,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
    tint.name = OUTLINE_NAME;
    tint.renderOrder = 29;
    tint.scale.set(1.012, 1.012, 1.012);
    tint.raycast = function () {};
    mesh.add(tint);
  }

  function setBoardSelection(mesh, on) {
    if (!mesh) return;
    clearBoardOutline(mesh);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat || !mat.emissive || typeof mat.emissive.setHex !== "function") return;
      mat.emissive.setHex(0x000000);
      if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = 0;
      mat.needsUpdate = true;
    });
    if (on) showBoardOutline(mesh);
  }

  function setEmissive(mesh, on) {
    if (!mesh) return;
    if (isBoardMesh(mesh)) {
      setBoardSelection(mesh, on);
      return;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat || !mat.emissive) return;
      mat.emissive.setHex(on ? HIGHLIGHT : 0x000000);
      if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = on ? 0.7 : 0;
      mat.needsUpdate = true;
    });
    if (window.v3InstancePool && typeof window.v3InstancePool.note === "function") {
      window.v3InstancePool.note();
    }
  }

  function refreshMeshes() {
    selected = selected.filter((item) => {
      if (item.kind === "beam") return !!(window.beams && window.beams[item.index]);
      if (item.kind === "pole") return !!(window.poles && window.poles[item.index]);
      if (item.kind === "joint") return !!(window.joints && window.joints[item.index]);
      if (item.kind === "shelf") return !!(window.shelves && window.shelves[item.index]);
      if (item.kind === "panel") return !!(window.panels && window.panels[item.index]);
      return false;
    }).map((item) => {
      if (item.kind === "beam") item.mesh = window.beams[item.index].mesh;
      if (item.kind === "pole") item.mesh = window.poles[item.index].mesh;
      if (item.kind === "joint") item.mesh = window.jointMeshes[item.index];
      if (item.kind === "shelf") item.mesh = window.shelves[item.index].mesh;
      if (item.kind === "panel") item.mesh = window.panels[item.index].mesh;
      return item;
    });
  }

  function paint() {
    refreshMeshes();
    selected.forEach((item) => setEmissive(item.mesh, true));
    const hud = document.getElementById("v3-sel-hud");
    if (!hud) return;
    const n = selected.length;
    hud.classList.toggle("hidden", n < 1);
    const count = document.getElementById("v3-sel-count");
    if (count) count.textContent = n ? (n + "件選択") : "";
    const colorBtn = document.getElementById("v3-sel-color");
    const delBtn = document.getElementById("v3-sel-delete");
    const canColor = selected.some((item) => item.kind === "beam" || item.kind === "pole");
    if (colorBtn) {
      colorBtn.disabled = !canColor;
      colorBtn.classList.toggle("is-off", !canColor);
    }
    if (delBtn) delBtn.disabled = n < 1;
  }

  function clear(keepJoint) {
    selected.forEach((item) => setEmissive(item.mesh, false));
    selected = [];
    if (!keepJoint && typeof window.setSelectedJoint === "function") {
      window.setSelectedJoint(null);
    }
    paint();
  }

  function replaceWith(hit) {
    selected.forEach((item) => setEmissive(item.mesh, false));
    selected = hit ? [hit] : [];
    paint();
  }

  function toggle(hit) {
    const i = selected.findIndex((item) => same(item, hit));
    if (i >= 0) {
      setEmissive(selected[i].mesh, false);
      selected.splice(i, 1);
    } else {
      selected.push(hit);
    }
    paint();
  }

  function kinds() {
    const set = {};
    selected.forEach((item) => { set[item.kind] = true; });
    return set;
  }

  function selectionBlocked() {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.canEditItem !== "function") return false;
    for (let i = 0; i < selected.length; i++) {
      if (!wl.canEditItem(selected[i].kind, selected[i].index)) return true;
    }
    return false;
  }

  function applyColor(mat) {
    if (selectionBlocked()) {
      console.warn("[work-layers] refused multi-select edit");
      return;
    }
    const code = typeof window.normalizeMaterial === "function"
      ? window.normalizeMaterial(mat)
      : mat;
    if (window.v3BsStock && typeof window.v3BsStock.gateConvertItems === "function") {
      const beams = [];
      const poles = [];
      selected.forEach((item) => {
        if (item.kind === "beam" && window.beams && window.beams[item.index]) beams.push(window.beams[item.index]);
        if (item.kind === "pole" && window.poles && window.poles[item.index]) poles.push(window.poles[item.index]);
      });
      const beamGate = window.v3BsStock.gateConvertItems("beam", beams, code);
      const poleGate = window.v3BsStock.gateConvertItems("pole", poles, code);
      if ((beamGate && beamGate.ok === false) || (poleGate && poleGate.ok === false)) return;
    }
    const apply = window.applyMaterialColorToMesh;
    window.v3CadOps.withSingleHistory("multi color " + code, function () {
      selected.forEach((item) => {
        if (item.kind !== "beam" && item.kind !== "pole") return;
        const list = item.kind === "beam" ? window.beams : window.poles;
        const data = list && list[item.index];
        if (!data) return;
        data.material = code;
        if (typeof apply === "function") apply(data.mesh, code);
      });
    });
    if (typeof window.reapplyConnectorVisuals === "function") {
      window.reapplyConnectorVisuals("multi color");
    }
    if (typeof window.requestEstimateRender === "function") {
      window.requestEstimateRender("multi color");
    }
    paint();
  }

  function meshesOfKind(kind) {
    const list = kind === "beam" ? window.beams : kind === "pole" ? window.poles : null;
    if (!list) return [];
    const out = [];
    selected.forEach(function (s) {
      if (s.kind !== kind) return;
      const data = list[s.index];
      if (data && data.mesh) out.push(data.mesh);
    });
    return out;
  }

  function indicesOfKind(kind) {
    return selected.filter(function (s) { return s.kind === kind; })
      .map(function (s) { return s.index; })
      .filter(function (i) { return typeof i === "number" && i >= 0; })
      .sort(function (a, b) { return b - a; });
  }

  function deleteSelected(opts) {
    refreshMeshes();
    if (!selected.length) return false;
    if (selectionBlocked()) {
      console.warn("[work-layers] refused multi-select delete");
      return false;
    }
    const ask = !opts || opts.confirm !== false;
    if (ask && typeof window.confirm === "function" && !window.confirm("選択した " + selected.length + " 件を削除しますか？")) {
      return false;
    }
    const beamMeshes = meshesOfKind("beam");
    const poleMeshes = meshesOfKind("pole");
    const shelfIdxs = indicesOfKind("shelf");
    const panelIdxs = indicesOfKind("panel");
    const jointIdxs = indicesOfKind("joint");

    function runDelete() {
      beamMeshes.forEach(function (mesh) {
        if (typeof window.deleteConnectorByMesh === "function") window.deleteConnectorByMesh(mesh);
      });
      poleMeshes.forEach(function (mesh) {
        if (typeof window.deleteConnectorByMesh === "function") window.deleteConnectorByMesh(mesh);
      });
      shelfIdxs.forEach(function (i) {
        if (typeof window.deleteBoard === "function") window.deleteBoard("shelf", i);
      });
      panelIdxs.forEach(function (i) {
        if (typeof window.deleteBoard === "function") window.deleteBoard("panel", i);
      });
      jointIdxs.forEach(function (idx) {
        if (typeof window.deleteJoint === "function") window.deleteJoint(idx);
      });
      if (typeof window.rebuildBoards === "function") window.rebuildBoards();
      if (typeof window.rebuildJointClusters === "function") window.rebuildJointClusters();
    }

    if (window.v3CadOps && typeof window.v3CadOps.withSingleHistory === "function") {
      window.v3CadOps.withSingleHistory("multi delete", runDelete);
    } else {
      runDelete();
    }
    clear(false);
    if (window.v3InstancePool && typeof window.v3InstancePool.sync === "function") {
      window.v3InstancePool.sync(true);
    }
    if (typeof window.requestEstimateRender === "function") {
      window.requestEstimateRender("multi delete");
    }
    return true;
  }

  function openColorPopup() {
    const ui = window.v3WorkspaceUi;
    if (!ui || typeof ui.openPopup !== "function") {
      applyColor(window.__CR_CURRENT_MATERIAL__ || "IRON");
      return;
    }
    ui.openPopup("multi-color", {
      title: "色を変更",
      hideApply: true,
      render(body) {
        const note = document.createElement("p");
        note.className = "v3-cmd-pop-note";
        note.textContent = "選択中の Beam / Pole に材質色を適用します。";
        body.appendChild(note);
        ["IRON", "BS", "SUS"].forEach((code) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = code === "IRON" ? "IRON（黒）" : code === "BS" ? "BS（ゴールド）" : "SUS（シルバー）";
          btn.addEventListener("click", function () {
            applyColor(code);
            ui.closePopup("apply");
          });
          body.appendChild(btn);
        });
      },
    });
  }

  function selectMode() {
    return typeof window.v3GetActiveToolMode === "function" && window.v3GetActiveToolMode() === "select";
  }

  function isCanvasEvent(ev) {
    if (ev.target && ev.target.closest && ev.target.closest("#v3-sel-hud, #v3-radial, #v3-rotate-hud, #v3-rotate-status, #v3-layer-panel, #v3-view-nav, .v3-toolbar, #v3-cmd-pop, #v3-east-rail")) {
      return false;
    }
    const el = window.v3CadOps && window.v3CadOps.canvas();
    if (!el) return false;
    return ev.target === el || !!(el.contains && el.contains(ev.target));
  }

  function blurCanvasFocus() {
    const canvas = window.v3CadOps && window.v3CadOps.canvas();
    const ae = document.activeElement;
    if (!ae || ae === document.body || ae === document.documentElement || ae === canvas) return;
    if (typeof ae.blur === "function") {
      try { ae.blur(); } catch (e) {}
    }
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (!selectMode()) return;
    if (!isCanvasEvent(ev)) return;

    if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      ev.stopPropagation();
      blurCanvasFocus();
      if (typeof window.tryToggleLegAtClient === "function") {
        window.tryToggleLegAtClient(ev.clientX, ev.clientY, 28);
      } else if (typeof window.toggleLegForJoint === "function" && typeof window.pickJointIndexByClientPos === "function") {
        const idx = window.pickJointIndexByClientPos(ev.clientX, ev.clientY, 28);
        if (typeof idx === "number" && idx >= 0) window.toggleLegForJoint(idx);
      }
      window.__V3_SKIP_LEG_CLICK__ = true;
      return;
    }

    const hit = window.v3CadOps.pickAt(ev.clientX, ev.clientY);
    ev.preventDefault();
    ev.stopPropagation();
    blurCanvasFocus();
    if (ev.ctrlKey || ev.metaKey) {
      if (hit) toggle(hit);
      return;
    }
    if (!hit) {
      clear(false);
      return;
    }
    replaceWith(hit);
  }

  function onSelectClick(ev) {
    if (ev.button !== 0) return;
    if (!selectMode()) return;
    if (!isCanvasEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  function bindHud() {
    const colorBtn = document.getElementById("v3-sel-color");
    const delBtn = document.getElementById("v3-sel-delete");
    const clearBtn = document.getElementById("v3-sel-clear");
    if (colorBtn) {
      colorBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        openColorPopup();
      });
    }
    if (delBtn) {
      delBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        deleteSelected();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        clear(false);
      });
    }
  }

  function isVisibleBlocker(el) {
    if (!el) return false;
    if (el.classList && el.classList.contains("hidden")) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function isTextEditing(ev) {
    const nodes = [];
    if (ev && ev.target && ev.target.nodeType === 1) nodes.push(ev.target);
    if (document.activeElement && document.activeElement.nodeType === 1) nodes.push(document.activeElement);
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      if (el.closest && el.closest("input, textarea, select, [contenteditable='true']")) return true;
    }
    const ids = [
      "help-overlay",
      "dimension-overlay",
      "colorchart-overlay",
      "admin-menu-overlay",
      "v3-cmd-pop",
      "stock-reconcile-gate-modal",
    ];
    for (let i = 0; i < ids.length; i++) {
      if (isVisibleBlocker(document.getElementById(ids[i]))) return true;
    }
    if (document.querySelector("dialog[open]")) return true;
    return false;
  }

  function onDeleteKey(ev) {
    if (ev.repeat) return;
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    if (ev.altKey) return;
    if (isTextEditing(ev)) return;
    refreshMeshes();
    if (!selected.length) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    deleteSelected({ confirm: false });
  }

  function dropUnselectable() {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.canSelectItem !== "function") return;
    const kept = [];
    selected.forEach((item) => {
      if (wl.canSelectItem(item.kind, item.index)) {
        kept.push(item);
        return;
      }
      if (isBoardItem(item)) setBoardSelection(item.mesh, false);
      else setEmissive(item.mesh, false);
    });
    if (kept.length === selected.length) return;
    selected = kept;
    paint();
  }

  function dropJoints() {
    const kept = [];
    selected.forEach((item) => {
      if (item.kind === "joint") setEmissive(item.mesh, false);
      else kept.push(item);
    });
    if (kept.length === selected.length) return;
    selected = kept;
    paint();
  }

  function reapplyBoards() {
    refreshMeshes();
    selected.forEach((item) => {
      if (isBoardItem(item)) setBoardSelection(item.mesh, true);
    });
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onSelectClick, true);
  document.addEventListener("keydown", onDeleteKey, true);
  window.addEventListener("v3-layout-reset", function () { clear(true); });
  bindHud();
  paint();

  window.v3MultiSelect = {
    get() { return selected.slice(); },
    clear,
    paint,
    kinds,
    deleteSelected,
    dropJoints,
    dropUnselectable,
    toggle,
    reapplyBoards,
  };
})();
