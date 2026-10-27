// =========================================================
// CUI-3B / 3B.1: CAD アイコンツールバー
// - Phase 2B マトリクス WEST グループを正本にする
// - NORTH のファイル/Undo/STAFF は重複させない
// - 既存 ID / 既存関数へ委譲する（モード正本は増やさない）
// - 未実装は偽動作させず、CUI-3C 入口ポップアップのみ
// =========================================================

(function () {
  const APPROVED_ICON_DIR = "img/v3-approved-icons/icons/";
  const APPROVED_ICONS = {
    beam: "01-beam.svg",
    pole: "02-pole.svg",
    leg: "03-leg.svg",
    connect: "04-connection.svg",
    joint: "05-joint.svg",
    length: "06-length.svg",
    dimension: "07-measure.svg",
    move: "08-move.svg",
    delete: "10-delete.svg",
    material: "11-material.svg",
    shelf: "12-shelf.svg",
    wall: "13-panel.svg",
    select: "14-select.svg",
    cluster: "19-rack-delete.svg",
    autolayout: "20-auto-layout.svg",
    rotate: "09-rotate.svg",
    duplicate: "15-duplicate.svg",
    colorchart: "11-material.svg",
    structural: "01-beam.svg",
  };
  const UI_ICON_DIR = "img/v3-ui-icons/";
  const UI_ICONS = {
    material: "swatch-book.svg",
  };

  const SA = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const SVG = {
    select: '<svg ' + SA + '><path d="M5 3.8l6.2 16.2 2.1-6.4 6.5-2.2z"/></svg>',
    joint: '<svg ' + SA + '><circle cx="12" cy="12" r="5.4"/></svg>',
    beam: '<svg ' + SA + '><circle cx="3.8" cy="12" r="2.35"/><circle cx="13.4" cy="12" r="2.35"/><path d="M6.2 12h4.85"/><path d="M19.3 9.1v5.8M16.4 12h5.8"/></svg>',
    pole: '<svg ' + SA + '><circle cx="8.6" cy="3.8" r="2.35"/><circle cx="8.6" cy="13.4" r="2.35"/><path d="M8.6 6.2v4.85"/><path d="M17.7 9.1v5.8M14.8 12h5.8"/></svg>',
    leg: '<svg ' + SA + '><circle cx="12" cy="6.1" r="3.55"/><path d="M7.2 19.6L12 9.65 16.8 19.6z"/></svg>',
    connect: '<svg ' + SA + '><circle cx="3.8" cy="12" r="2.35"/><circle cx="20.2" cy="12" r="2.35"/><path d="M6.4 12h7.2" stroke-dasharray="1.7 1.6"/><path d="M13.4 9.7L17.3 12l-3.9 2.3"/></svg>',
    length: '<svg ' + SA + '><path d="M4.4 7.2v9.6M19.6 7.2v9.6M4.4 12h15.2"/><path d="M7.6 9.8L4.4 12l3.2 2.2M16.4 9.8l3.2 2.2-3.2 2.2"/></svg>',
    material: '<svg ' + SA + '><path d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/><path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/><path d="M7 17h.01"/><path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/></svg>',
    delete: '<svg ' + SA + '><path d="M4.6 6.6h14.8M9 6.6V4.8h6v1.8M7.4 6.6l1.1 13.2h7l1.1-13.2"/><path d="M10.2 10.2v6.2M13.8 10.2v6.2"/></svg>',
    shelf: '<svg ' + SA + '><path d="M4 13.2L12 9.4l8 3.8-8 3.8z"/><path d="M4 13.2v2.3L12 19.3v-2.3"/><path d="M20 13.2v2.3L12 19.3"/></svg>',
    wall: '<svg ' + SA + '><path d="M7.2 4.4l9.6 2.4v12.4l-9.6-2.4z"/><path d="M7.2 9.2l9.6 2.4M7.2 14l9.6 2.4"/></svg>',
    move: '<svg ' + SA + '><path d="M12 3.6v16.8M3.6 12h16.8"/><path d="M8.4 6.2L12 3.6l3.6 2.6M8.4 17.8L12 20.4l3.6-2.6M6.2 8.4L3.6 12l2.6 3.6M17.8 8.4L20.4 12l-2.6 3.6"/></svg>',
    rotPos: '<svg ' + SA + '><path d="M19.6 12a7.6 7.6 0 1 1-2.1-5.3"/><path d="M19.6 4.8v5.2h-5.2"/></svg>',
    rotNeg: '<svg ' + SA + '><path d="M4.4 12a7.6 7.6 0 1 0 2.1-5.3"/><path d="M4.4 4.8v5.2h5.2"/></svg>',
    cluster: '<svg ' + SA + '><path d="M4.4 7.2v11.2M11.2 7.2v11.2M4.4 10.4h6.8M4.4 15.2h6.8"/><path d="M15.2 8.2l5.2 5.2M20.4 8.2l-5.2 5.2"/></svg>',
    autolayout: '<svg ' + SA + '><rect x="3.6" y="3.6" width="7.2" height="7.2" rx="1"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="1"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="1"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="1"/></svg>',
    dimension: '<svg ' + SA + '><g transform="rotate(-28 12 12)"><rect x="3.2" y="9" width="17.6" height="6" rx="0.8"/><path d="M6.4 9v6M9.2 9v3.4M12 9v6M14.8 9v3.4M17.6 9v6"/></g></svg>',
    structural: '<svg ' + SA + '><path d="M4 18 9 12l3 3 8-10"/><circle cx="4" cy="18" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="12" cy="15" r="1.5"/><circle cx="20" cy="5" r="1.5"/></svg>',
    estimate: '<svg ' + SA + '><rect x="5" y="3.4" width="14" height="17.2" rx="2"/><rect x="7.2" y="5.6" width="9.6" height="3.4" rx="0.6"/><path d="M8.2 12.2h2.2M13.6 12.2h2.2M8.2 15.4h2.2M13.6 15.4h2.2M8.2 18.4h7.6"/></svg>',
    layers: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 12 L52 22 L32 32 L12 22 Z"/><path d="M12 30 L32 40 L52 30"/><path d="M12 40 L32 50 L52 40"/></svg>',
    settings: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M32.0 15.8 L35.4 16.2 L37.2 7.8 L45.5 11.2 L40.8 18.4 L43.5 20.5 L45.6 23.2 L52.8 18.5 L56.2 26.8 L47.8 28.6 L48.2 32.0 L47.8 35.4 L56.2 37.2 L52.8 45.5 L45.6 40.8 L43.5 43.5 L40.8 45.6 L45.5 52.8 L37.2 56.2 L35.4 47.8 L32.0 48.2 L28.6 47.8 L26.8 56.2 L18.5 52.8 L23.2 45.6 L20.5 43.5 L18.4 40.8 L11.2 45.5 L7.8 37.2 L16.2 35.4 L15.8 32.0 L16.2 28.6 L7.8 26.8 L11.2 18.5 L18.4 23.2 L20.5 20.5 L23.2 18.4 L18.5 11.2 L26.8 7.8 L28.6 16.2 Z"/><circle cx="32" cy="32" r="8"/></svg>',
    drawing: '<svg ' + SA + '><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.2h4.6M8.5 9.8h2.8"/></svg>',
  };

  function iconMarkup(icon) {
    if (UI_ICONS[icon]) {
      return '<img class="v3-cad-icon" src="' + UI_ICON_DIR + UI_ICONS[icon] + '" alt="" draggable="false" aria-hidden="true">';
    }
    const file = APPROVED_ICONS[icon];
    if (file) {
      return '<img class="v3-cad-icon" src="' + APPROVED_ICON_DIR + file + '" alt="" draggable="false" aria-hidden="true">';
    }
    return SVG[icon] || "";
  }

  const GROUPS = [
    {
      id: "select",
      title: "選択・操作",
      items: [
        { cmd: "select", label: "選択", desc: "モードを解除して選択状態に戻します", icon: "select" },
      ],
    },
    {
      id: "add",
      title: "パーツ追加",
      items: [
        { cmd: "beam", label: "Beamを追加", desc: "Beamを追加します", icon: "beam" },
        { cmd: "pole", label: "Poleを追加", desc: "Poleを追加します", icon: "pole" },
        { cmd: "leg", label: "Leg ON/OFF", desc: "ジョイントをクリックして脚を切り替え\nShift＋クリックでも切り替え可能", icon: "leg" },
        { cmd: "connect", label: "接続モード", desc: "ビームで接続、またはジョイントでラックを結合します", icon: "connect" },
      ],
    },
    {
      id: "edit",
      title: "編集",
      items: [
        { cmd: "length", label: "長さを変更", desc: "選択パーツの長さを変更します", icon: "length" },
        { cmd: "material", label: "材質を設定", desc: "パーツの材質を設定します", icon: "material" },
      ],
    },
    {
      id: "board",
      title: "板",
      items: [
        { cmd: "shelf", label: "棚板モード", desc: "棚板または壁板を配置します。種類と配置方法は右側で選びます", icon: "shelf" },
      ],
    },
    {
      id: "place",
      title: "配置",
      items: [
        { cmd: "move", label: "ラックを移動", desc: "基準Jointを選び、XYZギズモで移動します。矢印クリックで数値指定、位置合わせもできます", icon: "move" },
        { cmd: "rotate", label: "Rotate", desc: "Poleをクリックし、CW / CCWでラックを90°回転します", icon: "rotate" },
        { cmd: "duplicate", label: "複製", desc: "JointBallをクリックして、そのラック全体を独立ラックとして複製します", icon: "duplicate" },
        { cmd: "clusterDel", label: "ラック削除", desc: "JointBallをクリックして対象ラックを確認後に削除します。部品は Alt+クリック", icon: "cluster" },
        { cmd: "autolayout", label: "自動レイアウト", desc: "ラックの配置を自動調整します", icon: "autolayout" },
      ],
    },
    {
      id: "view",
      title: "表示・出力",
      items: [
        { cmd: "dimension", label: "寸法測定", desc: "2点を選んで芯々・内々・外々の寸法線を作成します", icon: "dimension" },
        { cmd: "drawing", label: "図面出力", desc: "統合図面ウィンドウを開きます", icon: "drawing" },
        { cmd: "colorchart", label: "カラーチャート", desc: "長さごとの色分け表示を切り替えます", icon: "colorchart" },
        { cmd: "layers", label: "レイヤー", desc: "Beam / Pole / 棚板 / 壁板の表示を切り替えます", icon: "layers" },
        { cmd: "structural", label: "構造解析", desc: "部材参考計算を設定・表示します。完成ラックの安全性は保証しません", icon: "structural" },
        { cmd: "settings", label: "CAD設定", desc: "ツールバー、ラジアル、3Dビューの設定を開きます", icon: "settings" },
      ],
    },
  ];

  const EXTRA_COMMANDS = [
    { cmd: "estimate", label: "見積明細", desc: "部材明細と合計金額を確認します", icon: "estimate" },
    { cmd: "rotPos", label: "回転 +90°", desc: "選択したラックを右に90°回転します", icon: "rotPos" },
    { cmd: "rotNeg", label: "回転 -90°", desc: "選択したラックを左に90°回転します", icon: "rotNeg" },
  ];

  let dispatching = false;
  let overflowOpen = false;
  let lastAutoCols = 2;

  function $(id) {
    return document.getElementById(id);
  }

  function itemByCmd(cmd) {
    for (let g = 0; g < GROUPS.length; g++) {
      const items = GROUPS[g].items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].cmd === cmd) return items[i];
      }
    }
    for (let i = 0; i < EXTRA_COMMANDS.length; i++) {
      if (EXTRA_COMMANDS[i].cmd === cmd) return EXTRA_COMMANDS[i];
    }
    return null;
  }

  function allCommands() {
    const out = [];
    GROUPS.forEach((g) => {
      g.items.forEach((item) => { out.push(item); });
    });
    EXTRA_COMMANDS.forEach((item) => {
      if (!out.some((x) => x.cmd === item.cmd)) out.push(item);
    });
    return out;
  }

  function hideCadTip() {
    const tip = $("v3-cad-tip");
    if (!tip) return;
    tip.classList.add("hidden");
    tip.removeAttribute("data-for");
  }

  function placeCadTip(anchor) {
    const tip = $("v3-cad-tip");
    const tb = $("v3-tb-tools");
    if (!tip || !anchor) return;
    const ar = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth || 180;
    const th = tip.offsetHeight || 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const east = tb && tb.parentElement && tb.parentElement.id === "v3-dock-east";
    const south = tb && tb.parentElement && tb.parentElement.id === "v3-dock-south";
    const vertical = !!(tb && (tb.classList.contains("is-vertical") || tb.classList.contains("is-floating")));
    let x;
    let y;
    if (east) {
      x = ar.left - tw - gap;
      y = ar.top + ar.height / 2 - th / 2;
    } else if (vertical) {
      x = ar.right + gap;
      y = ar.top + ar.height / 2 - th / 2;
    } else if (south) {
      x = ar.left + ar.width / 2 - tw / 2;
      y = ar.top - th - gap;
    } else {
      x = ar.left + ar.width / 2 - tw / 2;
      y = ar.bottom + gap;
    }
    x = Math.min(Math.max(gap, x), Math.max(gap, vw - tw - gap));
    y = Math.min(Math.max(gap, y), Math.max(gap, vh - th - gap));
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }

  function showCadTip(anchor) {
    if (window.__v3UiDragging) return;
    const tip = $("v3-cad-tip");
    if (!tip || !anchor) return;
    const cmd = anchor.getAttribute("data-v3-cad-cmd");
    const item = itemByCmd(cmd);
    const name = item ? item.label : (anchor.getAttribute("aria-label") || cmd);
    const desc = item ? item.desc : "";
    tip.querySelector(".v3-cad-tip-name").textContent = name;
    tip.querySelector(".v3-cad-tip-desc").textContent = desc;
    tip.classList.remove("hidden");
    tip.setAttribute("data-for", cmd || "");
    placeCadTip(anchor);
  }

  function bindCadTip(el) {
    if (!el || el.__v3CadTipBound) return;
    el.__v3CadTipBound = true;
    el.addEventListener("pointerenter", function () { showCadTip(el); });
    el.addEventListener("pointerleave", hideCadTip);
    el.addEventListener("focus", function () { showCadTip(el); });
    el.addEventListener("blur", hideCadTip);
  }

  function clickLegacy(selector) {
    if (dispatching) return;
    if (!selector) return;
    const el = selector.charAt(0) === "#"
      ? $(selector.slice(1))
      : document.querySelector(selector);
    if (!el) return;
    dispatching = true;
    try {
      el.click();
    } finally {
      dispatching = false;
    }
  }

  function wrapFn(name, after) {
    const orig = window[name];
    if (typeof orig !== "function" || orig.__v3CadWrapped) return;
    const wrapped = function () {
      const result = orig.apply(this, arguments);
      if (typeof after === "function") after();
      return result;
    };
    wrapped.__v3CadWrapped = true;
    if (orig.__v3NorthWrapped) wrapped.__v3NorthWrapped = true;
    window[name] = wrapped;
  }

  function clearExclusive(except) {
    if (except !== "move" && window.isMoveModeOn) window.setMoveMode?.(false);
    if (except !== "connect" && window.isConnectModeOn) window.setConnectMode?.(false);
    if (except !== "length" && window.isLengthEditModeOn) window.setLengthEditMode?.(false);
    if (except !== "board" && window.isBoardModeOn) window.setBoardMode?.(false);
    if (except !== "delete" && except !== "clusterDel" && window.isDeleteModeOn) {
      window.setDeleteMode?.(false);
      const btn = document.querySelector('.cr-leftbar [aria-label="ラック削除（クラスター）"]');
      if (btn) btn.classList.remove("is-on");
    }
    if (except !== "rotate" && window.isRotateModeOn) window.setRotateMode?.(false);
    if (except !== "duplicate" && window.isDuplicateModeOn) window.setDuplicateMode?.(false);
    if (except !== "dimension" && window.isMeasureModeOn) window.setMeasureMode?.(false);
  }

  const EXCLUSIVE_TOOLS = {
    move: true, rotate: true, delete: true, clusterDel: true, connect: true, length: true, shelf: true, wall: true, duplicate: true, dimension: true,
  };

  function flaggedTool() {
    if (window.isDeleteModeOn) return "clusterDel";
    if (window.isMeasureModeOn) return "dimension";
    if (window.isMoveModeOn) return "move";
    if (window.isRotateModeOn) return "rotate";
    if (window.isDuplicateModeOn) return "duplicate";
    if (window.isConnectModeOn) return "connect";
    if (window.isLengthEditModeOn) return "length";
    if (window.isBoardModeOn) return "shelf";
    return null;
  }

  function normalizeToolMode(mode) {
    if (mode === "joint") return "select";
    return mode;
  }

  function getActiveToolMode() {
    const flagged = flaggedTool();
    if (flagged) return flagged;
    const mode = normalizeToolMode(window.__V3_TOOL_MODE__);
    if (typeof mode === "string" && mode) return mode;
    return "beam";
  }

  function disarmAddGesture() {
    try { window.previewTargetPos = null; } catch (e) {}
    try { window.hidePreview?.(); } catch (e) {}
    try { window.hideLegPreview?.(); } catch (e) {}
    try { window.hideBoardPreview?.(); } catch (e) {}
    try { window.clearBoardSelection?.(); } catch (e) {}
    try {
      if (typeof window.setSelectedJoint === "function") window.setSelectedJoint(null);
    } catch (e) {}
  }

  function setToolMode(mode) {
    mode = normalizeToolMode(mode);
    window.__V3_TOOL_MODE__ = mode;
    if (mode !== "beam" && mode !== "pole") {
      disarmAddGesture();
      try {
        if (window.v3LengthPanel && typeof window.v3LengthPanel.syncFromTool === "function") {
          window.v3LengthPanel.syncFromTool();
        } else {
          const ui = window.v3WorkspaceUi;
          if (ui && typeof ui.getOpenPopupId === "function" && ui.getOpenPopupId() === "length-add") {
            ui.closePopup("cancel");
          }
        }
      } catch (e) {}
    }
    try { syncActive(); } catch (e) {}
  }

  function canAddPart(type) {
    const mode = getActiveToolMode();
    if (type === "beam") return mode === "beam";
    if (type === "pole") return mode === "pole";
    return false;
  }

  function hookExclusiveSetters() {
    ["setMoveMode", "setRotateMode", "setDeleteMode", "setConnectMode", "setLengthEditMode", "setBoardMode", "setDuplicateMode", "setMeasureMode"].forEach((name) => {
      const orig = window[name];
      if (typeof orig !== "function" || orig.__v3ModeHook) return;
      const hooked = function () {
        const result = orig.apply(this, arguments);
        const flagged = flaggedTool();
        if (flagged) window.__V3_TOOL_MODE__ = flagged;
        else if (EXCLUSIVE_TOOLS[window.__V3_TOOL_MODE__]) window.__V3_TOOL_MODE__ = "select";
        if (getActiveToolMode() !== "beam" && getActiveToolMode() !== "pole") disarmAddGesture();
        try { syncActive(); } catch (e) {}
        return result;
      };
      hooked.__v3ModeHook = true;
      window[name] = hooked;
    });
  }

  function setPartType(kind) {
    window.currentPartType = kind === "pole" ? "pole" : "beam";
    const tog = $("part-type-toggle");
    if (tog) tog.checked = kind === "pole";
    if (typeof window.syncPartTypeFromToggle === "function") {
      window.syncPartTypeFromToggle();
    }
  }

  function setBoardKind(isWall) {
    const tog = $("board-kind-toggle");
    if (!tog) return;
    const next = !!isWall;
    if (tog.checked !== next) {
      tog.checked = next;
      tog.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function openLegacyPanel() {
    if (typeof window.setV3LegacyPanelOpen === "function") {
      window.setV3LegacyPanelOpen(true);
    }
  }

  function isRetiredLegHint(id, title) {
    return id === "leg-hint" || title === "脚の切り替え";
  }

  function forceLegToolMode() {
    clearExclusive();
    setToolMode("leg");
  }

  function enterLegToolMode() {
    if (window.__V3_TOOL_MODE__ === "leg" && !flaggedTool()) {
      setToolMode("select");
      return;
    }
    forceLegToolMode();
  }

  function openEntryPopup(id, title, message, extra) {
    if (isRetiredLegHint(id, title)) {
      forceLegToolMode();
      return;
    }
    const ui = window.v3WorkspaceUi;
    if (!ui || typeof ui.openPopup !== "function") return;
    if (ui.getOpenPopupId && ui.getOpenPopupId() === id) {
      ui.closePopup("cancel");
      return;
    }
    ui.openPopup(id, {
      title,
      hideApply: true,
      render(body) {
        const note = document.createElement("p");
        note.className = "v3-cmd-pop-note";
        note.textContent = message;
        body.appendChild(note);
        if (typeof extra === "function") extra(body);
      },
    });
  }

  function addOpenPanelButton(body, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label || "旧操作パネルを開く";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      openLegacyPanel();
    });
    body.appendChild(btn);
  }

  function activeJointIndex() {
    const a = window.__CR_ACTIVE_JOINT_INDEX__;
    if (typeof a === "number" && a >= 0) return a;
    const s = window.selectedJointIndex;
    if (typeof s === "number" && s >= 0) return s;
    return -1;
  }

  function toggleDeleteMode() {
    const btn = document.querySelector('.cr-leftbar [aria-label="ラック削除（クラスター）"]');
    if (btn) {
      clickLegacy('.cr-leftbar [aria-label="ラック削除（クラスター）"]');
      return;
    }
    window.setDeleteMode?.(!window.isDeleteModeOn);
  }

  function runCommand(cmd) {
    switch (cmd) {
      case "select":
      case "joint":
        clearExclusive();
        setToolMode("select");
        break;
      case "beam":
        clearExclusive();
        setPartType("beam");
        if (window.v3LengthPanel && typeof window.v3LengthPanel.restoreForCurrentType === "function") {
          window.v3LengthPanel.restoreForCurrentType();
        }
        setToolMode("beam");
        if (window.v3LengthPanel && typeof window.v3LengthPanel.openAdd === "function") {
          window.v3LengthPanel.openAdd({
            kind: "beam",
            anchor: document.getElementById("v3-cad-beam"),
          });
        }
        break;
      case "pole":
        clearExclusive();
        setPartType("pole");
        if (window.v3LengthPanel && typeof window.v3LengthPanel.restoreForCurrentType === "function") {
          window.v3LengthPanel.restoreForCurrentType();
        }
        setToolMode("pole");
        if (window.v3LengthPanel && typeof window.v3LengthPanel.openAdd === "function") {
          window.v3LengthPanel.openAdd({
            kind: "pole",
            anchor: document.getElementById("v3-cad-pole"),
          });
        }
        break;
      case "leg":
        enterLegToolMode();
        break;
      case "connect":
        if (window.isConnectModeOn) {
          clickLegacy("#connect-mode-btn");
        } else {
          clearExclusive("connect");
          if (!window.isConnectModeOn) clickLegacy("#connect-mode-btn");
        }
        break;
      case "length":
        if (window.isLengthEditModeOn) {
          clickLegacy("#length-mode-btn");
          if (!(window.v3EastRail && typeof window.v3EastRail.getOpenId === "function"
              && window.v3EastRail.getOpenId() === "length")
              && window.v3WorkspaceUi && window.v3WorkspaceUi.getOpenPopupId() === "length") {
            window.v3WorkspaceUi.closePopup("cancel");
          }
        } else {
          clearExclusive("length");
          if (!window.isLengthEditModeOn) clickLegacy("#length-mode-btn");
          if (window.v3LengthPanel && typeof window.v3LengthPanel.openEdit === "function") {
            window.v3LengthPanel.openEdit({
              anchor: document.getElementById("v3-cad-length"),
            });
          } else if (window.v3LengthPanel && typeof window.v3LengthPanel.open === "function") {
            window.v3LengthPanel.open({
              anchor: document.getElementById("v3-cad-length"),
            });
          }
        }
        break;
      case "material":
        if (window.v3MaterialPanel && typeof window.v3MaterialPanel.open === "function") {
          window.v3MaterialPanel.open({
            anchor: document.getElementById("v3-cad-material"),
          });
        } else {
          openLegacyPanel();
        }
        break;
      case "delete":
      case "clusterDel":
        if (window.isDeleteModeOn) {
          toggleDeleteMode();
          setToolMode("select");
        } else {
          clearExclusive("clusterDel");
          if (!window.isDeleteModeOn) toggleDeleteMode();
          setToolMode("clusterDel");
        }
        break;
      case "shelf":
        if (window.isBoardModeOn) {
          window.setBoardMode?.(false);
        } else {
          clearExclusive("board");
          window.setBoardMode?.(true);
          openBoardAddRail();
        }
        break;
      case "wall":
        if (window.isBoardModeOn && isBoardKindWall()) {
          window.setBoardMode?.(false);
        } else {
          clearExclusive("board");
          setBoardKind(true);
          window.setBoardMode?.(true);
          openBoardAddRail();
        }
        break;
      case "move":
        if (window.isMoveModeOn) {
          window.setMoveMode?.(false);
          setToolMode("select");
        } else {
          clearExclusive("move");
          window.setMoveMode?.(true);
          setToolMode("move");
        }
        break;
      case "rotate":
        if (window.isRotateModeOn) {
          window.setRotateMode?.(false);
          setToolMode("select");
        } else {
          clearExclusive("rotate");
          window.setRotateMode?.(true);
          setToolMode("rotate");
        }
        break;
      case "duplicate":
        if (window.isDuplicateModeOn) {
          window.setDuplicateMode?.(false);
          setToolMode("select");
        } else {
          clearExclusive("duplicate");
          window.setDuplicateMode?.(true);
          setToolMode("duplicate");
        }
        break;
      case "rotPos":
        if (window.isRotateModeOn && window.v3RotateMode && window.v3RotateMode.getAxis() >= 0) {
          window.v3RotateMode.rotateBy(90);
        } else {
          clearExclusive("rotate");
          window.setRotateMode?.(true);
        }
        break;
      case "rotNeg":
        if (window.isRotateModeOn && window.v3RotateMode && window.v3RotateMode.getAxis() >= 0) {
          window.v3RotateMode.rotateBy(-90);
        } else {
          clearExclusive("rotate");
          window.setRotateMode?.(true);
        }
        break;
      case "colorchart":
        clickLegacy("#color-chart-toggle-btn");
        break;
      case "autolayout":
        if (window.v3EastRail && typeof window.v3EastRail.toggle === "function") {
          window.v3EastRail.toggle("autolayout");
        } else {
          clickLegacy("#open-auto-layout-tool");
        }
        break;
      case "drawing":
        clickLegacy("#btn-open-drawing");
        break;
      case "dimension":
        if (window.isMeasureModeOn) {
          window.setMeasureMode?.(false);
          setToolMode("select");
        } else {
          clearExclusive("dimension");
          window.setMeasureMode?.(true);
          setToolMode("dimension");
        }
        break;
      case "estimate":
        if (window.v3EstimatePanel && typeof window.v3EstimatePanel.open === "function") {
          window.v3EstimatePanel.open({
            anchor: document.getElementById("v3-north-total") || document.getElementById("v3-cad-estimate"),
          });
        }
        break;
      case "layers":
        if (window.v3EastRail && typeof window.v3EastRail.toggle === "function") {
          window.v3EastRail.toggle("layers");
        } else {
          window.v3LayerPanel && window.v3LayerPanel.toggle();
        }
        break;
      case "structural":
        window.v3StructuralPanel && window.v3StructuralPanel.open({ anchor: document.getElementById("v3-cad-structural") });
        break;
      case "settings":
        window.v3SettingsPanel && window.v3SettingsPanel.open();
        break;
      default:
        break;
    }
    syncActive();
  }

  function isBoardKindWall() {
    if (typeof window.isBoardKindWall === "function") return !!window.isBoardKindWall();
    return !!$("board-kind-toggle")?.checked;
  }

  function openBoardAddRail() {
    if (window.v3LengthPanel && typeof window.v3LengthPanel.openAdd === "function") {
      window.v3LengthPanel.openAdd({ board: true });
    } else if (window.v3EastRail && typeof window.v3EastRail.open === "function") {
      window.v3EastRail.open("add");
    }
  }

  function syncActive() {
    const pop = window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getOpenPopupId === "function"
      ? window.v3WorkspaceUi.getOpenPopupId()
      : null;
    const railId = window.v3EastRail && typeof window.v3EastRail.getOpenId === "function"
      ? window.v3EastRail.getOpenId()
      : null;
    const mode = getActiveToolMode();

    document.querySelectorAll("[data-v3-cad-cmd]").forEach((btn) => {
      const cmd = btn.getAttribute("data-v3-cad-cmd");
      let on = cmd === mode;
      const popCmd = pop === "layers" ? "layers" : pop === "cad-settings" ? "settings" : pop === "measure" ? "dimension" : pop;
      if (pop && (cmd === "material" || cmd === "estimate" || cmd === "layers" || cmd === "structural" || cmd === "settings" || cmd === "dimension") && cmd === popCmd) {
        on = true;
      }
      if (pop === "length" && cmd === "length") on = true;
      if (railId === "autolayout" && cmd === "autolayout") on = true;
      if (railId === "layers" && cmd === "layers") on = true;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    syncGroupActive();
  }

  function syncGroupActive() {
    document.querySelectorAll(".v3-cad-group").forEach((group) => {
      const on = !!group.querySelector(".v3-cad-btn.is-on");
      group.classList.toggle("has-active", on);
    });
  }

  function groupsState() {
    const st = window.v3WorkspaceUi && window.v3WorkspaceUi.getState
      ? window.v3WorkspaceUi.getState()
      : null;
    return (st && st.groups) || {};
  }

  function applyGroups() {
    const openMap = groupsState();
    document.querySelectorAll(".v3-cad-group").forEach((group) => {
      const id = group.getAttribute("data-group");
      const open = openMap[id] !== false;
      group.classList.toggle("is-collapsed", !open);
      const head = group.querySelector(".v3-cad-group-head");
      if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function closeOverflow() {
    overflowOpen = false;
    const menu = $("v3-cad-overflow-menu");
    const btn = $("v3-cad-overflow-btn");
    if (menu) menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
    hideCadTip();
  }

  function fillOverflowMenu(hiddenGroups) {
    const menu = $("v3-cad-overflow-menu");
    if (!menu) return;
    menu.innerHTML = "";
    hiddenGroups.forEach((group) => {
      group.querySelectorAll("[data-v3-cad-cmd]").forEach((el) => {
        const cmd = el.getAttribute("data-v3-cad-cmd");
        const item = itemByCmd(cmd);
        const name = item ? item.label : (el.getAttribute("aria-label") || cmd);
        const copy = document.createElement("button");
        copy.type = "button";
        copy.setAttribute("role", "menuitem");
        copy.setAttribute("data-v3-cad-cmd", cmd);
        copy.setAttribute("aria-label", name);
        copy.innerHTML = (el.innerHTML || "") + "<span>" + name + "</span>";
        copy.classList.toggle("is-on", el.classList.contains("is-on"));
        copy.addEventListener("click", function (ev) {
          ev.preventDefault();
          closeOverflow();
          hideCadTip();
          runCommand(cmd);
        });
        bindCadTip(copy);
        menu.appendChild(copy);
      });
    });
  }

  function layoutOverflow() {
    const tb = $("v3-tb-tools");
    const body = $("v3-cad-body");
    const more = $("v3-cad-overflow-btn");
    if (!tb || !body || !more) return;

    const groups = Array.prototype.slice.call(body.querySelectorAll(".v3-cad-group"));
    groups.forEach((el) => { el.hidden = false; });
    more.hidden = true;
    closeOverflow();

    const horizontal = tb.classList.contains("is-horizontal");
    if (!horizontal) {
      const menu = $("v3-cad-overflow-menu");
      if (menu) menu.innerHTML = "";
      return;
    }

    const sizes = groups.map((el) => el.offsetWidth);
    const total = sizes.reduce(function (sum, n) { return sum + n + 6; }, 0);
    const avail = body.clientWidth;
    if (!avail || total <= avail) return;

    more.hidden = false;
    const moreSize = more.offsetWidth || 44;
    let used = moreSize + 6;
    let overflowAt = groups.length;
    for (let i = 0; i < groups.length; i++) {
      if (used + sizes[i] + 6 > avail) {
        overflowAt = Math.max(1, i);
        break;
      }
      used += sizes[i] + 6;
    }
    if (overflowAt < groups.length) {
      const hidden = groups.slice(overflowAt);
      hidden.forEach((el) => { el.hidden = true; });
      fillOverflowMenu(hidden);
    } else {
      more.hidden = true;
    }
  }

  function buildToolbar() {
    const body = $("v3-cad-body");
    if (!body || body.getAttribute("data-v3-cad-ready")) return;
    body.setAttribute("data-v3-cad-ready", "1");
    GROUPS.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "v3-cad-group v3-cad-item";
      wrap.setAttribute("data-group", group.id);

      const head = document.createElement("button");
      head.type = "button";
      head.className = "v3-cad-group-head";
      head.setAttribute("aria-expanded", "true");
      head.setAttribute("aria-controls", "v3-cad-group-" + group.id);
      head.setAttribute("aria-label", group.title);
      head.title = group.title;
      head.innerHTML = '<span class="v3-cad-group-chevron" aria-hidden="true">▾</span><span class="v3-cad-group-name">' + group.title + '</span><span class="v3-cad-group-dot" aria-hidden="true"></span>';
      head.addEventListener("click", function (ev) {
        ev.preventDefault();
        const next = wrap.classList.contains("is-collapsed");
        if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.setGroupOpen === "function") {
          window.v3WorkspaceUi.setGroupOpen(group.id, next);
        }
        applyGroups();
        onLayout();
      });

      const items = document.createElement("div");
      items.className = "v3-cad-group-items";
      items.id = "v3-cad-group-" + group.id;
      group.items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "v3-cad-" + item.cmd;
        btn.className = "v3-icon-btn v3-cad-btn";
        btn.setAttribute("data-v3-cad-cmd", item.cmd);
        btn.setAttribute("aria-label", item.label);
        btn.setAttribute("aria-pressed", "false");
        btn.innerHTML = iconMarkup(item.icon);
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          hideCadTip();
          runCommand(item.cmd);
        });
        bindCadTip(btn);
        items.appendChild(btn);
      });

      wrap.appendChild(head);
      wrap.appendChild(items);
      body.appendChild(wrap);
    });
    applyGroups();
  }

  function bindOverflow() {
    const more = $("v3-cad-overflow-btn");
    if (!more) return;
    more.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const menu = $("v3-cad-overflow-menu");
      if (!menu) return;
      overflowOpen = !overflowOpen;
      menu.classList.toggle("hidden", !overflowOpen);
      more.setAttribute("aria-expanded", overflowOpen ? "true" : "false");
    });
    document.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest(".v3-cad-overflow-wrap")) return;
      closeOverflow();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeOverflow();
    });
  }

  function bindSync() {
    ["setMoveMode", "setRotateMode", "setConnectMode", "setLengthEditMode", "setBoardMode", "setDeleteMode", "setDuplicateMode", "setMeasureMode", "syncPartTypeFromToggle", "syncMoveModeUI", "syncBoardUI"].forEach((name) => {
      wrapFn(name, function () { requestAnimationFrame(syncActive); });
    });
    const connectBtn = $("connect-mode-btn");
    const lengthBtn = $("length-mode-btn");
    const boardBtn = $("board-mode-btn");
    const kind = $("board-kind-toggle");
    const watch = [connectBtn, lengthBtn, boardBtn, kind].filter(Boolean);
    if (watch.length && typeof MutationObserver === "function") {
      const mo = new MutationObserver(function () { syncActive(); });
      watch.forEach((el) => {
        mo.observe(el, { attributes: true, attributeFilter: ["class", "aria-pressed", "checked"] });
      });
    }
    if (kind) {
      kind.addEventListener("change", syncActive);
    }
  }

  function colsFromWidth(w) {
    const inner = Math.max(0, (w || 0) - 12);
    if (lastAutoCols === 3) {
      if (inner < 134) return inner < 86 ? 1 : 2;
      return 3;
    }
    if (lastAutoCols === 2) {
      if (inner >= 146) return 3;
      if (inner < 86) return 1;
      return 2;
    }
    if (inner >= 146) return 3;
    if (inner >= 98) return 2;
    return 1;
  }

  function applyColumns() {
    const tb = $("v3-tb-tools");
    if (!tb) return 2;
    const ui = window.v3WorkspaceUi;
    const pose = ui && typeof ui.getState === "function"
      ? (ui.getState().toolbars && ui.getState().toolbars.tools)
      : null;
    const mode = pose && pose.cols != null ? String(pose.cols) : "auto";
    let n = 2;
    if (mode === "1" || mode === "2" || mode === "3") n = Number(mode);
    else n = colsFromWidth(tb.offsetWidth || 112);
    lastAutoCols = n;
    tb.style.setProperty("--v3-cad-cols", String(n));
    tb.setAttribute("data-cad-cols", String(n));
    return n;
  }

  function onLayout() {
    applyGroups();
    applyColumns();
    layoutOverflow();
    syncActive();
  }

  window.addEventListener("scroll", hideCadTip, true);
  window.addEventListener("resize", hideCadTip);

  const CAD_DRAG_SLOP = 6;
  let cadDrag = null;
  let cadClickShield = null;

  function cadStore() {
    return window.v3LayoutStore || null;
  }

  function flattenDefaultCadCmds() {
    const out = [];
    GROUPS.forEach(function (g) {
      g.items.forEach(function (item) { out.push(item.cmd); });
    });
    return out;
  }

  function mergeCadOrder(saved) {
    const store = cadStore();
    const defaults = flattenDefaultCadCmds();
    if (store && typeof store.mergeCadIconOrder === "function") {
      return store.mergeCadIconOrder(saved, defaults);
    }
    return defaults;
  }

  function readCadOrder() {
    let raw = null;
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getState === "function") {
      const st = window.v3WorkspaceUi.getState();
      raw = st && st.cadIcons && st.cadIcons.order;
    } else if (cadStore()) {
      const st = cadStore().load();
      raw = st && st.cadIcons && st.cadIcons.order;
    }
    return mergeCadOrder(raw);
  }

  function persistCadOrder(order) {
    const payload = { order: mergeCadOrder(order) };
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.patchState === "function") {
      window.v3WorkspaceUi.patchState({ cadIcons: payload });
      return;
    }
    const store = cadStore();
    if (!store) return;
    const st = store.load();
    st.cadIcons = payload;
    store.save(st);
  }

  function currentCadOrder() {
    const body = $("v3-cad-body");
    if (!body) return flattenDefaultCadCmds();
    const ids = [];
    body.querySelectorAll("[data-v3-cad-cmd]").forEach(function (el) {
      const cmd = el.getAttribute("data-v3-cad-cmd");
      if (cmd) ids.push(cmd);
    });
    return mergeCadOrder(ids);
  }

  function applyCadOrder(order) {
    const body = $("v3-cad-body");
    if (!body) return mergeCadOrder(order);
    const merged = mergeCadOrder(order);
    const index = {};
    merged.forEach(function (cmd, i) { index[cmd] = i; });
    const groups = Array.prototype.slice.call(body.querySelectorAll(".v3-cad-group"));
    groups.sort(function (a, b) {
      function minIdx(g) {
        let m = Infinity;
        g.querySelectorAll("[data-v3-cad-cmd]").forEach(function (el) {
          const i = index[el.getAttribute("data-v3-cad-cmd")];
          if (typeof i === "number" && i < m) m = i;
        });
        return m;
      }
      return minIdx(a) - minIdx(b);
    });
    groups.forEach(function (g) {
      const items = g.querySelector(".v3-cad-group-items");
      if (!items) return;
      const btns = Array.prototype.slice.call(items.querySelectorAll("[data-v3-cad-cmd]"));
      btns.sort(function (a, b) {
        const ia = index[a.getAttribute("data-v3-cad-cmd")];
        const ib = index[b.getAttribute("data-v3-cad-cmd")];
        return (ia == null ? 999 : ia) - (ib == null ? 999 : ib);
      });
      btns.forEach(function (btn) { items.appendChild(btn); });
      body.appendChild(g);
    });
    return merged;
  }

  function isToolbarVertical() {
    const tb = $("v3-tb-tools");
    if (!tb) return true;
    if (tb.classList.contains("is-vertical") || tb.classList.contains("is-floating")) return true;
    const parent = tb.parentElement;
    return !!(parent && (parent.id === "v3-dock-east" || parent.id === "v3-dock-west"));
  }

  function cadToolbarRect() {
    const tb = $("v3-tb-tools");
    return tb ? tb.getBoundingClientRect() : null;
  }

  function pointNearCadToolbar(x, y, pad) {
    const r = cadToolbarRect();
    if (!r) return false;
    const m = pad == null ? 80 : pad;
    return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
  }

  function visibleCadTargets(dragEl) {
    const body = $("v3-cad-body");
    if (!body) return [];
    return Array.prototype.filter.call(body.querySelectorAll("[data-v3-cad-cmd]"), function (el) {
      if (el === dragEl) return false;
      if (el.closest && el.closest(".v3-cad-overflow-wrap")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
  }

  function cadToolbarCols() {
    const tb = $("v3-tb-tools");
    const n = Number(tb && tb.getAttribute && tb.getAttribute("data-cad-cols"));
    return n > 0 ? n : 2;
  }

  function cadInsertIndex(targets, x, y, vertical) {
    if (!targets.length) return 0;
    const cols = cadToolbarCols();
    const useGrid = vertical && cols > 1;
    if (!useGrid) {
      const store = cadStore();
      const centers = targets.map(function (el) {
        const r = el.getBoundingClientRect();
        return vertical ? (r.top + r.height / 2) : (r.left + r.width / 2);
      });
      const value = vertical ? y : x;
      return store && typeof store.headerInsertIndex === "function"
        ? store.headerInsertIndex(centers, value)
        : centers.length;
    }
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i].getBoundingClientRect();
      if (y < r.top) return i;
      if (y <= r.bottom && x < r.left + r.width / 2) return i;
    }
    return targets.length;
  }

  function cadSlotAtPoint(x, y, dragEl) {
    const vertical = isToolbarVertical();
    const targets = visibleCadTargets(dragEl);
    const idx = cadInsertIndex(targets, x, y, vertical);
    const before = idx < targets.length ? targets[idx] : null;
    let line = vertical ? y : x;
    if (before) {
      const r = before.getBoundingClientRect();
      line = vertical ? r.top : r.left;
    } else if (targets.length) {
      const r = targets[targets.length - 1].getBoundingClientRect();
      line = vertical ? r.bottom : r.right;
    }
    return { before: before, line: line, idx: idx };
  }

  function ensureCadInsert() {
    let el = $("v3-cad-insert");
    if (el) return el;
    el = document.createElement("div");
    el.id = "v3-cad-insert";
    el.className = "v3-cad-insert";
    el.hidden = true;
    const body = $("v3-cad-body");
    if (body) body.appendChild(el);
    return el;
  }

  function placeCadInsertLine(x, y, dragEl) {
    const insert = ensureCadInsert();
    const body = $("v3-cad-body");
    if (!insert || !body) return;
    if (!pointNearCadToolbar(x, y, 24)) {
      insert.hidden = true;
      return;
    }
    const slot = cadSlotAtPoint(x, y, dragEl);
    const br = body.getBoundingClientRect();
    insert.hidden = false;
    if (isToolbarVertical()) {
      insert.classList.add("is-across");
      insert.style.left = "6px";
      insert.style.right = "6px";
      insert.style.width = "auto";
      insert.style.height = "2px";
      insert.style.top = Math.max(0, Math.round(slot.line - br.top)) + "px";
    } else {
      insert.classList.remove("is-across");
      insert.style.top = "6px";
      insert.style.bottom = "6px";
      insert.style.height = "auto";
      insert.style.width = "2px";
      insert.style.left = Math.max(0, Math.round(slot.line - br.left)) + "px";
    }
  }

  function armCadClickShield(pointerType) {
    if (cadClickShield) {
      document.removeEventListener("click", cadClickShield, true);
      cadClickShield = null;
    }
    const shield = function (ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    cadClickShield = shield;
    document.addEventListener("click", shield, true);
    const hold = pointerType === "touch" ? 400 : 50;
    setTimeout(function () {
      document.removeEventListener("click", shield, true);
      if (cadClickShield === shield) cadClickShield = null;
    }, hold);
  }

  function endCadDrag(ev, cancel) {
    if (!cadDrag || (ev && cadDrag.pointerId !== ev.pointerId)) return;
    const d = cadDrag;
    cadDrag = null;
    try {
      if (d.el && d.el.releasePointerCapture) d.el.releasePointerCapture(d.pointerId);
    } catch (err) {}
    d.el.classList.remove("is-dragging");
    document.body.classList.remove("v3-cad-reordering");
    window.__v3UiDragging = false;
    const insert = $("v3-cad-insert");
    if (insert) insert.hidden = true;
    if (!d.moved) return;
    if (ev && ev.cancelable) ev.preventDefault();
    armCadClickShield(d.pointerType);
    const dropX = d.lastInsideX != null ? d.lastInsideX : d.lastX;
    const dropY = d.lastInsideY != null ? d.lastInsideY : d.lastY;
    if (cancel) {
      applyCadOrder(d.originOrder);
      onLayout();
      return;
    }
    const slot = cadSlotAtPoint(dropX, dropY, d.el);
    if (slot.before && slot.before.parentNode) {
      slot.before.parentNode.insertBefore(d.el, slot.before);
    } else {
      const rest = visibleCadTargets(d.el);
      const last = rest.length ? rest[rest.length - 1] : null;
      if (last && last.parentNode) last.parentNode.appendChild(d.el);
    }
    persistCadOrder(currentCadOrder());
    onLayout();
  }

  function bindCadReorder() {
    const body = $("v3-cad-body");
    if (!body) return;
    persistCadOrder(applyCadOrder(readCadOrder()));
    body.style.position = body.style.position || "relative";

    body.addEventListener("dragstart", function (ev) {
      ev.preventDefault();
    });

    body.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest(".v3-tb-grip")) return;
      if (ev.target && ev.target.closest && ev.target.closest(".v3-cad-group-head")) return;
      if (ev.target && ev.target.closest && ev.target.closest(".v3-cad-overflow-wrap")) return;
      const unit = ev.target && ev.target.closest && ev.target.closest("[data-v3-cad-cmd]");
      if (!unit || !body.contains(unit)) return;
      const id = unit.getAttribute("data-v3-cad-cmd");
      if (!id) return;
      cadDrag = {
        id: id,
        el: unit,
        pointerId: ev.pointerId,
        pointerType: ev.pointerType || "mouse",
        startX: ev.clientX,
        startY: ev.clientY,
        lastX: ev.clientX,
        lastY: ev.clientY,
        lastInsideX: ev.clientX,
        lastInsideY: ev.clientY,
        originOrder: currentCadOrder(),
        moved: false,
      };
    }, true);

    document.addEventListener("pointermove", function (ev) {
      if (!cadDrag || cadDrag.pointerId !== ev.pointerId) return;
      cadDrag.lastX = ev.clientX;
      cadDrag.lastY = ev.clientY;
      if (pointNearCadToolbar(ev.clientX, ev.clientY, 80)) {
        cadDrag.lastInsideX = ev.clientX;
        cadDrag.lastInsideY = ev.clientY;
      }
      const dx = ev.clientX - cadDrag.startX;
      const dy = ev.clientY - cadDrag.startY;
      if (!cadDrag.moved) {
        if ((dx * dx) + (dy * dy) < CAD_DRAG_SLOP * CAD_DRAG_SLOP) return;
        cadDrag.moved = true;
        hideCadTip();
        cadDrag.el.classList.add("is-dragging");
        document.body.classList.add("v3-cad-reordering");
        window.__v3UiDragging = true;
        try {
          cadDrag.el.setPointerCapture(ev.pointerId);
        } catch (err) {}
      }
      if (ev.cancelable) ev.preventDefault();
      placeCadInsertLine(cadDrag.lastInsideX, cadDrag.lastInsideY, cadDrag.el);
    }, { capture: true, passive: false });

    document.addEventListener("pointerup", function (ev) { endCadDrag(ev, false); }, true);
    document.addEventListener("pointercancel", function (ev) {
      // overflow の狭いバーでは実ブラウザが pointercancel を飛ばすことがある。
      // しきい値を超えていれば最後の挿入位置で確定し、戻すのは Escape のみ。
      endCadDrag(ev, false);
    }, true);

    window.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || !cadDrag) return;
      endCadDrag({ pointerId: cadDrag.pointerId, cancelable: true, preventDefault: function () {} }, true);
    });
    window.addEventListener("v3-layout-reset", function () {
      persistCadOrder(applyCadOrder(flattenDefaultCadCmds()));
      onLayout();
    });
  }

  buildToolbar();
  bindCadReorder();
  bindOverflow();
  bindSync();
  hookExclusiveSetters();
  if (!document.__v3LegCmdCapture) {
    document.__v3LegCmdCapture = true;
    document.addEventListener("click", function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest("[data-v3-cad-cmd=\"leg\"]");
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      hideCadTip();
      closeOverflow();
      enterLegToolMode();
    }, true);
  }
  window.__V3_TOOL_MODE__ = normalizeToolMode(window.__V3_TOOL_MODE__ || "beam");
  onLayout();
  requestAnimationFrame(onLayout);
  window.addEventListener("load", function () {
    hookExclusiveSetters();
    onLayout();
  });
  if (typeof ResizeObserver === "function") {
    const tb = $("v3-tb-tools");
    if (tb) {
      const ro = new ResizeObserver(function () {
        applyColumns();
        layoutOverflow();
      });
      ro.observe(tb);
    }
  }

  window.v3GetActiveToolMode = getActiveToolMode;
  window.v3CanAddPart = canAddPart;
  window.v3SetToolMode = setToolMode;
  window.v3EnterLegToolMode = enterLegToolMode;
  window.v3ForceLegToolMode = forceLegToolMode;

  window.v3CadToolbar = {
    onLayout,
    syncActive,
    applyGroups,
    applyColumns,
    applyCadIcons: function (reset) {
      const order = reset ? flattenDefaultCadCmds() : readCadOrder();
      const applied = applyCadOrder(order);
      if (reset) persistCadOrder(applied);
      onLayout();
      return applied;
    },
    runCommand,
    getActiveToolMode,
    canAddPart,
    hideTip: hideCadTip,
    itemByCmd,
    iconMarkup,
    allCommands,
    GROUPS,
    APPROVED_ICON_DIR,
    APPROVED_ICONS,
    getCadIconOrder: currentCadOrder,
    CAD_DRAG_SLOP,
  };
})();
