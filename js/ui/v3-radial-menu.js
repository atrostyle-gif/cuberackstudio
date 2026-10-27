// =========================================================
// Phase 2: 8方向ラジアルメニュー（右クリック / 右ドラッグはパン維持）
// =========================================================
(function () {
  const SLOTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const ANGLES = { n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 };
  const RADIUS = 78;
  const DRAG_PX = 8;

  let open = false;
  let down = null;

  function $(id) {
    return document.getElementById(id);
  }

  function viewportOk() {
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    return !st || !st.viewport || st.viewport.radialEnabled !== false;
  }

  function mapping() {
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    return (st && st.radial) || (window.v3LayoutStore && window.v3LayoutStore.defaultRadial()) || {};
  }

  function root() {
    return $("v3-radial");
  }

  function close() {
    open = false;
    const el = root();
    if (el) {
      el.classList.add("hidden");
      el.classList.remove("is-hover");
    }
  }

  function setCenterLabel(text) {
    const label = $("v3-radial-label");
    if (label) label.textContent = text || "キャンセル";
  }

  function place(x, y) {
    const el = root();
    if (!el) return;
    const size = 220;
    const left = Math.min(Math.max(8, x - size / 2), window.innerWidth - size - 8);
    const top = Math.min(Math.max(8, y - size / 2), window.innerHeight - size - 8);
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  function fill() {
    const el = root();
    const ring = $("v3-radial-ring");
    if (!el || !ring) return;
    ring.innerHTML = "";
    const map = mapping();
    SLOTS.forEach((slot) => {
      const cmd = map[slot];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v3-radial-item";
      btn.setAttribute("data-slot", slot);
      btn.setAttribute("data-v3-radial-cmd", cmd || "");
      const ang = (ANGLES[slot] * Math.PI) / 180;
      btn.style.left = Math.round(110 + Math.cos(ang) * RADIUS - 22) + "px";
      btn.style.top = Math.round(110 + Math.sin(ang) * RADIUS - 22) + "px";
      const enabled = !!(cmd && window.v3CadOps && window.v3CadOps.commandEnabled(cmd));
      btn.classList.toggle("is-off", !enabled);
      btn.disabled = !enabled;
      const name = window.v3CadOps ? window.v3CadOps.labelFor(cmd) : cmd;
      btn.setAttribute("aria-label", name || slot);
      btn.innerHTML = (window.v3CadOps && window.v3CadOps.iconFor(cmd)) || "";
      btn.addEventListener("pointerenter", function () {
        el.classList.add("is-hover");
        btn.classList.add("is-hot");
        setCenterLabel(enabled ? name : (name + "（無効）"));
      });
      btn.addEventListener("pointerleave", function () {
        btn.classList.remove("is-hot");
        setCenterLabel("キャンセル");
      });
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!enabled || !cmd) {
          close();
          return;
        }
        close();
        window.v3CadToolbar && window.v3CadToolbar.runCommand(cmd);
      });
      ring.appendChild(btn);
    });
    setCenterLabel("キャンセル");
  }

  function openAt(x, y) {
    if (!viewportOk()) return;
    fill();
    place(x, y);
    const el = root();
    if (!el) return;
    el.classList.remove("hidden");
    open = true;
  }

  function onCanvasDown(ev) {
    if (ev.button !== 2) return;
    const el = window.v3CadOps && window.v3CadOps.canvas();
    if (!el || ev.target !== el) return;
    down = { x: ev.clientX, y: ev.clientY, drag: false };
  }

  function onMove(ev) {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) >= DRAG_PX) down.drag = true;
  }

  function onUp(ev) {
    if (ev.button !== 2) return;
    const start = down;
    down = null;
    if (!start || start.drag) return;
    const el = window.v3CadOps && window.v3CadOps.canvas();
    if (!el) return;
    openAt(start.x, start.y);
  }

  function bind() {
    const cancel = $("v3-radial-cancel");
    if (cancel && !cancel.__v3Bound) {
      cancel.__v3Bound = true;
      cancel.addEventListener("click", function (ev) {
        ev.preventDefault();
        close();
      });
    }
    document.addEventListener("pointerdown", onCanvasDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("contextmenu", function (ev) {
      const el = window.v3CadOps && window.v3CadOps.canvas();
      if (el && (ev.target === el || (ev.target.closest && ev.target.closest("#v3-radial")))) {
        ev.preventDefault();
      }
    }, true);
    document.addEventListener("pointerdown", function (ev) {
      if (!open) return;
      const el = root();
      if (el && el.contains(ev.target)) return;
      close();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") close();
    });
    window.addEventListener("v3-layout-reset", function () {
      close();
    });
  }

  bind();
  window.v3RadialMenu = { openAt, close, fill, isOpen() { return open; } };
})();
