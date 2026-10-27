// =========================================================
// CAD設定（ツールバー / ラジアル / 3Dビュー）
// =========================================================
(function () {
  const SLOT_LABELS = {
    n: "上",
    ne: "右上",
    e: "右",
    se: "右下",
    s: "下",
    sw: "左下",
    w: "左",
    nw: "左上",
  };
  const SLOTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const TABS = [
    { id: "toolbar", label: "ツールバー" },
    { id: "radial", label: "ラジアル" },
    { id: "view", label: "3Dビュー" },
  ];

  function assignable() {
    const cad = window.v3CadToolbar;
    const list = cad && typeof cad.allCommands === "function" ? cad.allCommands() : [];
    const skip = { rotPos: 1, rotNeg: 1, layers: 1, settings: 1 };
    return list.filter((item) => !skip[item.cmd]);
  }

  function field(labelText, control) {
    const wrap = document.createElement("label");
    wrap.className = "v3-set-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    wrap.appendChild(span);
    wrap.appendChild(control);
    return wrap;
  }

  function select(value, options, onChange) {
    const el = document.createElement("select");
    options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (String(opt.value) === String(value)) o.selected = true;
      el.appendChild(o);
    });
    el.addEventListener("change", function () { onChange(el.value); });
    return el;
  }

  function checkbox(checked, onChange) {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.checked = !!checked;
    el.addEventListener("change", function () { onChange(el.checked); });
    return el;
  }

  function persist() {
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.persist === "function") {
      window.v3WorkspaceUi.persist();
    }
  }

  function section(title) {
    const sec = document.createElement("section");
    sec.className = "v3-set-sec";
    const h = document.createElement("h3");
    h.textContent = title;
    sec.appendChild(h);
    return sec;
  }

  function buildToolbar(ui, st) {
    const pose = (st.toolbars && st.toolbars.tools) || {};
    const sec = section("配置");
    sec.appendChild(field("配置", select(pose.mode === "float" ? "float" : (pose.edge || "north"), [
      { value: "north", label: "上ドック（一列）" },
      { value: "west", label: "左ドック" },
      { value: "east", label: "右ドック" },
      { value: "south", label: "下ドック" },
      { value: "float", label: "フローティング" },
    ], function (v) {
      if (v === "float") ui.floatToolbar(72, 96);
      else ui.dockToolbar(v);
    })));
    sec.appendChild(field("列数", select(String(pose.cols || "auto"), [
      { value: "auto", label: "Auto" },
      { value: "1", label: "1列" },
      { value: "2", label: "2列" },
      { value: "3", label: "3列" },
    ], function (v) { ui.setCadCols(v); })));
    const width = document.createElement("input");
    width.type = "range";
    width.min = "64";
    width.max = "196";
    width.value = String(pose.w || 112);
    const widthVal = document.createElement("span");
    widthVal.className = "v3-set-val";
    widthVal.textContent = (pose.w || 112) + "px";
    width.addEventListener("input", function () {
      const n = Number(width.value);
      widthVal.textContent = n + "px";
      ui.setCadWidth(n, true);
    });
    const widthWrap = document.createElement("div");
    widthWrap.className = "v3-set-range";
    widthWrap.appendChild(width);
    widthWrap.appendChild(widthVal);
    sec.appendChild(field("幅（左右ドック）", widthWrap));
    const note = document.createElement("p");
    note.className = "v3-cmd-pop-note";
    note.textContent = "上・下は一列、左・右は列数に合わせて並びます。幅は左右ドックとフローティングで使います。";
    sec.appendChild(note);
    return sec;
  }

  function buildRadial(st) {
    const sec = section("8方向の割り当て");
    if (!st.viewport) st.viewport = window.v3LayoutStore.defaultViewport();
    sec.appendChild(field("右クリックで表示", checkbox(st.viewport.radialEnabled !== false, function (on) {
      st.viewport.radialEnabled = on;
      persist();
    })));
    if (!st.radial) st.radial = window.v3LayoutStore.defaultRadial();
    const cmds = assignable().map((item) => ({ value: item.cmd, label: item.label }));
    SLOTS.forEach((slot) => {
      sec.appendChild(field(SLOT_LABELS[slot], select(st.radial[slot], cmds, function (v) {
        st.radial[slot] = v;
        persist();
        if (window.v3RadialMenu && typeof window.v3RadialMenu.fill === "function") {
          window.v3RadialMenu.fill();
        }
      })));
    });
    return sec;
  }

  function buildView(st) {
    const sec = section("視点バー");
    if (!st.viewport) st.viewport = window.v3LayoutStore.defaultViewport();
    sec.appendChild(field("視点切り替えUI", checkbox(st.viewport.showViewNav !== false, function (on) {
      st.viewport.showViewNav = on;
      persist();
      window.v3ViewNav && window.v3ViewNav.applyVisibility();
    })));
    const note = document.createElement("p");
    note.className = "v3-cmd-pop-note";
    note.textContent = "視点バーは8個のキューブを横一列で表示します。幅はバー左端のドラッグで 280〜550px、初期値は 400px です。中ドラッグで回転、右ドラッグでパン、ホイールでズームします。";
    sec.appendChild(note);
    return sec;
  }

  function openSettings() {
    const ui = window.v3WorkspaceUi;
    if (!ui || typeof ui.openPopup !== "function") return;
    if (ui.getOpenPopupId && ui.getOpenPopupId() === "cad-settings") {
      ui.closePopup("cancel");
      return;
    }
    const anchor = document.getElementById("v3-cad-settings");
    let active = "toolbar";
    ui.openPopup("cad-settings", {
      title: "CAD設定",
      wide: true,
      hideApply: true,
      hideActions: true,
      skipFocus: true,
      anchor: anchor,
      render(body) {
        const st = ui.getState();
        const nav = document.createElement("div");
        nav.className = "v3-set-tabs";
        nav.setAttribute("role", "tablist");
        const panels = {};
        TABS.forEach((tab) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "v3-set-tab";
          btn.setAttribute("role", "tab");
          btn.dataset.tab = tab.id;
          btn.textContent = tab.label;
          btn.addEventListener("click", function (ev) {
            ev.preventDefault();
            active = tab.id;
            show();
          });
          nav.appendChild(btn);
          const panel = document.createElement("div");
          panel.className = "v3-set-panel";
          panel.setAttribute("role", "tabpanel");
          panel.dataset.tab = tab.id;
          if (tab.id === "toolbar") panel.appendChild(buildToolbar(ui, st));
          if (tab.id === "radial") panel.appendChild(buildRadial(st));
          if (tab.id === "view") panel.appendChild(buildView(st));
          panels[tab.id] = panel;
        });
        function show() {
          nav.querySelectorAll(".v3-set-tab").forEach((btn) => {
            const on = btn.dataset.tab === active;
            btn.classList.toggle("is-on", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
          });
          Object.keys(panels).forEach((id) => {
            panels[id].hidden = id !== active;
          });
        }
        body.appendChild(nav);
        TABS.forEach((tab) => body.appendChild(panels[tab.id]));
        show();
      },
    });
  }

  window.v3SettingsPanel = { open: openSettings };
})();
