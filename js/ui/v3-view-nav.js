// =========================================================
// Phase 3: 3D視点切り替え（既存 setCameraPresetView を再利用）
// 横一列フローティングバー。幅ドラッグは右端固定で左に伸縮。
// =========================================================
(function () {
  const ICON_DIR = "img/v3-view-icons/";
  const VIEWS = [
    { id: "front", label: "正面", icon: "view-front.svg" },
    { id: "back", label: "背面", icon: "view-back.svg" },
    { id: "left", label: "左", icon: "view-left.svg" },
    { id: "right", label: "右", icon: "view-right.svg" },
    { id: "top", label: "上面", icon: "view-top.svg" },
    { id: "bottom", label: "下面", icon: "view-bottom.svg" },
    { id: "iso", label: "ISO", icon: "view-iso.svg" },
    { id: "fit", label: "全体表示", icon: "view-fit.svg" },
  ];
  const MIN_WIDTH = 280;
  const DEFAULT_WIDTH = 400;
  const MAX_WIDTH = 550;
  const EDGE_MARGIN = 16;
  const CHROME = 38;
  const BTN_GAPS = 28;

  let current = "iso";
  let barWidth = DEFAULT_WIDTH;
  let resizing = false;

  function $(id) {
    return document.getElementById(id);
  }

  function maxViewWidth() {
    const byViewport = window.innerWidth - EDGE_MARGIN * 2;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, byViewport));
  }

  function clampViewWidth(width) {
    const n = typeof width === "number" && Number.isFinite(width) ? width : DEFAULT_WIDTH;
    return Math.min(Math.max(Math.round(n), MIN_WIDTH), maxViewWidth());
  }

  function savedWidth() {
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    const w = st && st.viewport && st.viewport.viewNavW;
    return clampViewWidth(w != null ? w : DEFAULT_WIDTH);
  }

  function persistWidth(width) {
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    if (!st) return;
    if (!st.viewport) st.viewport = { showViewNav: true, radialEnabled: true };
    st.viewport.viewNavW = clampViewWidth(width);
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.persist === "function") {
      window.v3WorkspaceUi.persist();
    }
  }

  function applyWidth(width, persistNow) {
    const nav = $("v3-view-nav");
    if (!nav) return barWidth;
    barWidth = clampViewWidth(width);
    nav.style.width = barWidth + "px";
    const inner = Math.max(0, barWidth - CHROME - BTN_GAPS);
    const btn = inner / 8;
    const icon = Math.max(24, Math.min(48, Math.floor(btn - 2)));
    nav.style.setProperty("--v3-view-icon", icon + "px");
    if (persistNow) persistWidth(barWidth);
    return barWidth;
  }

  function rackCenter() {
    const joints = window.joints || [];
    if (!joints.length) return new THREE.Vector3(0, 0, 0);
    let sx = 0, sy = 0, sz = 0, n = 0;
    joints.forEach((j) => {
      if (!j) return;
      sx += j.x; sy += j.y; sz += j.z; n++;
    });
    if (!n) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(sx / n, sy / n, sz / n);
  }

  function rackBox() {
    const box = new THREE.Box3();
    const joints = window.joints || [];
    if (!joints.length) {
      box.set(new THREE.Vector3(-200, 0, -200), new THREE.Vector3(200, 200, 200));
      return box;
    }
    joints.forEach((j) => {
      if (j) box.expandByPoint(new THREE.Vector3(j.x, j.y, j.z));
    });
    box.expandByScalar(80);
    return box;
  }

  function fitAll() {
    if (!window.camera || !window.controls) return;
    const box = rackBox();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 400);
    const fov = (window.camera.fov * Math.PI) / 180;
    const dist = (maxSize / 2) / Math.tan(fov / 2) * 1.35;
    const dir = window.camera.position.clone().sub(window.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
    dir.normalize();
    window.controls.target.copy(center);
    window.camera.position.copy(center).addScaledVector(dir, dist);
    window.camera.up.set(0, 1, 0);
    window.controls.update();
  }

  function setActive(mode) {
    current = mode;
    document.querySelectorAll("#v3-view-nav .v3-view-nav-btn").forEach((btn) => {
      const on = btn.getAttribute("data-view") === mode;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function go(mode) {
    if (mode === "fit") {
      fitAll();
    } else {
      if (window.controls) window.controls.target.copy(rackCenter());
      if (typeof window.setCameraPresetView === "function") {
        window.setCameraPresetView(mode);
      }
    }
    setActive(mode);
  }

  function applyVisibility() {
    const nav = $("v3-view-nav");
    if (!nav) return;
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    const show = !st || !st.viewport || st.viewport.showViewNav !== false;
    nav.classList.toggle("hidden", !show);
  }

  function enableResize() {
    const nav = $("v3-view-nav");
    const handle = $("v3-view-nav-resize");
    if (!nav || !handle || handle.__v3Bound) return;
    handle.__v3Bound = true;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      startX = ev.clientX;
      startWidth = nav.getBoundingClientRect().width;
      resizing = true;
      document.body.classList.add("v3-ui-resizing");
      try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    handle.addEventListener("pointermove", function (ev) {
      if (!resizing) return;
      ev.preventDefault();
      ev.stopPropagation();
      const delta = startX - ev.clientX;
      applyWidth(startWidth + delta, false);
    });

    function finish(ev) {
      if (!resizing) return;
      resizing = false;
      document.body.classList.remove("v3-ui-resizing");
      try { handle.releasePointerCapture(ev.pointerId); } catch (e) {}
      persistWidth(nav.getBoundingClientRect().width);
    }

    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function build() {
    const nav = $("v3-view-nav");
    const host = $("v3-view-nav-btns") || nav;
    if (!nav || !host) return;
    host.innerHTML = "";
    nav.setAttribute("data-ready", "1");
    nav.setAttribute("aria-label", "3D視点");
    VIEWS.forEach((view) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v3-view-nav-btn";
      btn.setAttribute("data-view", view.id);
      btn.setAttribute("data-name", view.label);
      btn.setAttribute("aria-label", view.label);
      btn.setAttribute("aria-pressed", view.id === current ? "true" : "false");
      btn.innerHTML = '<img class="v3-view-nav-icon" src="' + ICON_DIR + view.icon + '" alt="" draggable="false" aria-hidden="true">';
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        go(view.id);
      });
      host.appendChild(btn);
    });
    setActive(current);
    applyWidth(savedWidth(), false);
    applyVisibility();
    enableResize();
  }

  window.addEventListener("v3-layout-reset", function () {
    applyWidth(DEFAULT_WIDTH, true);
    applyVisibility();
  });
  window.addEventListener("resize", function () {
    applyWidth(barWidth, false);
  });

  build();
  window.v3ViewNav = {
    go,
    fitAll,
    applyVisibility,
    setActive,
    applyWidth,
    clampViewWidth,
    VIEWS,
    MIN_WIDTH,
    DEFAULT_WIDTH,
    MAX_WIDTH,
  };
})();
