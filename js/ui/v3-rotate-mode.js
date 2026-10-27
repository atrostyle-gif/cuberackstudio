// =========================================================
// Phase 1: Rotate モード（Pole中心線軸 / CW・CCW / ステータスバー）
// =========================================================
(function () {
  window.isRotateModeOn = false;
  let axisPoleIndex = -1;

  function $(id) {
    return document.getElementById(id);
  }

  function statusEl() {
    return $("v3-rotate-status");
  }

  function poles() {
    return window.poles || [];
  }

  function setPoleHighlight(idx, on) {
    const pole = poles()[idx];
    const mesh = pole && pole.mesh;
    if (!mesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat || !mat.emissive) return;
      mat.emissive.setHex(on ? 0x61a0ff : 0x000000);
      if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = on ? 0.85 : 0;
      mat.needsUpdate = true;
    });
  }

  function setStatus(phase) {
    const el = statusEl();
    const msg = $("v3-rotate-status-msg");
    const actions = $("v3-rotate-status-actions");
    if (!el) return;
    if (!window.isRotateModeOn) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    if (phase === "axis") {
      if (msg) msg.textContent = "回転軸にするPOLEを選択してください";
      if (actions) actions.classList.add("hidden");
    } else {
      if (msg) msg.textContent = "CW／CCWで回転方向を選択してください";
      if (actions) actions.classList.remove("hidden");
    }
  }

  function setAxis(idx) {
    if (axisPoleIndex >= 0 && axisPoleIndex !== idx) setPoleHighlight(axisPoleIndex, false);
    axisPoleIndex = idx;
    if (idx >= 0) {
      setPoleHighlight(idx, true);
      setStatus("dir");
    } else {
      setStatus("axis");
    }
  }

  function rotateBy(deg) {
    if (axisPoleIndex < 0) {
      setStatus("axis");
      return false;
    }
    const pole = poles()[axisPoleIndex];
    if (!pole) return false;
    return window.rotateActiveCluster90?.(deg, pole.a, axisPoleIndex);
  }

  window.setRotateMode = function (on) {
    const next = !!on;
    const prev = !!window.isRotateModeOn;
    window.isRotateModeOn = next;
    if (prev && !next) {
      setPoleHighlight(axisPoleIndex, false);
      axisPoleIndex = -1;
      const el = statusEl();
      if (el) el.classList.add("hidden");
    }
    if (!prev && next) {
      axisPoleIndex = -1;
      try { if (window.isBoardModeOn) window.setBoardMode?.(false); } catch (e) {}
      try { if (window.isConnectModeOn) window.setConnectMode?.(false); } catch (e) {}
      try { if (window.isMoveModeOn) window.setMoveMode?.(false); } catch (e) {}
      try { if (window.isLengthEditModeOn) window.setLengthEditMode?.(false); } catch (e) {}
      try { if (window.isDeleteModeOn) window.setDeleteMode?.(false); } catch (e) {}
      try { window.setSelectedJoint?.(null); } catch (e) {}
      try { window.hidePreview?.(); } catch (e) {}
      try { window.hideLegPreview?.(); } catch (e) {}
      try { window.hideBoardPreview?.(); } catch (e) {}
      try { window.clearBoardSelection?.(); } catch (e) {}
      setStatus("axis");
    }
    try { window.v3CadToolbar?.syncActive?.(); } catch (e) {}
  };

  function poleIndexFromHit(hit) {
    if (!hit) return -1;
    if (hit.kind === "pole" && typeof hit.index === "number") return hit.index;
    if (hit.kind === "joint" && typeof hit.index === "number") {
      const matches = [];
      poles().forEach((p, i) => {
        if (p && (p.a === hit.index || p.b === hit.index)) matches.push(i);
      });
      return matches.length === 1 ? matches[0] : -1;
    }
    return -1;
  }

  function isViewEvent(ev) {
    if (!ev || !ev.target) return false;
    if (ev.target.closest && ev.target.closest("#v3-rotate-status, #v3-rotate-hud, .v3-toolbar, #v3-cmd-pop, #v3-east-rail, #v3-view-nav, #v3-layer-panel, #v3-radial")) {
      return false;
    }
    const canvas = window.v3CadOps && window.v3CadOps.canvas();
    if (canvas && (ev.target === canvas || (canvas.contains && canvas.contains(ev.target)))) return true;
    if (ev.target.id === "view") return true;
    if (ev.target.closest && ev.target.closest("#view")) return true;
    return false;
  }

  function onPointerDown(ev) {
    if (!window.isRotateModeOn) return;
    if (ev.button !== 0) return;
    if (!isViewEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const hit = window.v3CadOps && window.v3CadOps.pickAt(ev.clientX, ev.clientY);
    const idx = poleIndexFromHit(hit);
    if (idx >= 0) setAxis(idx);
  }

  function onClick(ev) {
    if (!window.isRotateModeOn) return;
    if (!isViewEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  function bindStatus() {
    const el = statusEl();
    if (!el || el.__v3Bound) return;
    el.__v3Bound = true;
    el.addEventListener("pointerdown", function (ev) {
      ev.stopPropagation();
    });
    const cw = $("v3-rotate-cw");
    const ccw = $("v3-rotate-ccw");
    if (cw) {
      cw.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        rotateBy(-90);
      });
    }
    if (ccw) {
      ccw.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        rotateBy(90);
      });
    }
    const cancel = $("v3-rotate-cancel");
    if (cancel) {
      cancel.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        window.setRotateMode(false);
      });
    }
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && window.isRotateModeOn) {
      ev.preventDefault();
      window.setRotateMode(false);
    }
  }, true);

  bindStatus();
  window.v3RotateMode = {
    setAxis,
    rotateBy,
    getAxis() { return axisPoleIndex; },
  };
})();
