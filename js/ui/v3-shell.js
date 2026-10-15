// =========================================================
// CUI-1: Ver3.0 シェル（NORTH / WEST / CENTER）
// - 旧 #panel は削除せず折りたたみ
// - 既存 DOM ID / listener は維持
// - 共同編集は自動開始しない
// - UI 非表示 ≠ 認証
// =========================================================

(function () {
  const PANEL_OPEN_CLASS = "v3-legacy-panel-open";

  function getViewSize() {
    const el = window.viewEl || document.getElementById("view");
    if (!el) return { width: 1, height: 1 };
    return {
      width: Math.max(1, el.clientWidth),
      height: Math.max(1, el.clientHeight),
    };
  }

  function resizeV3View() {
    const camera = window.camera;
    const renderer = window.renderer;
    if (!camera || !renderer) return;
    const { width, height } = getViewSize();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function isLegacyPanelOpen() {
    return document.body.classList.contains(PANEL_OPEN_CLASS);
  }

  function setLegacyPanelOpen(open) {
    const next = !!open;
    document.body.classList.toggle(PANEL_OPEN_CLASS, next);

    const panel = document.getElementById("panel");
    const toggle = document.getElementById("v3-legacy-panel-toggle");
    if (panel) {
      panel.setAttribute("aria-hidden", next ? "false" : "true");
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", next ? "true" : "false");
      toggle.textContent = next ? "パネルを閉じる" : "操作パネル";
    }

    requestAnimationFrame(() => {
      resizeV3View();
      window.dispatchEvent(new Event("resize"));
    });
  }

  function bindStaffEntry() {
    const entry = document.getElementById("v3-staff-entry-btn");
    const legacy = document.getElementById("admin-menu-open-btn");
    if (!entry || !legacy) return;
    entry.addEventListener("click", (ev) => {
      ev.preventDefault();
      legacy.click();
    });
  }

  function bindLegacyPanelToggle() {
    const toggle = document.getElementById("v3-legacy-panel-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      setLegacyPanelOpen(!isLegacyPanelOpen());
    });
  }

  function observeViewResize() {
    const view = document.getElementById("view");
    if (!view || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => {
      resizeV3View();
    });
    ro.observe(view);
  }

  function mountLegacyLeftbar() {
    const host = document.getElementById("v3-west-tools");
    const bar = document.querySelector(".cr-leftbar");
    if (!host || !bar) return;
    if (bar.parentElement !== host) host.appendChild(bar);
  }

  window.getV3ViewSize = getViewSize;
  window.resizeV3View = resizeV3View;
  window.setV3LegacyPanelOpen = setLegacyPanelOpen;

  bindLegacyPanelToggle();
  bindStaffEntry();
  mountLegacyLeftbar();
  observeViewResize();
  setLegacyPanelOpen(false);
})();
