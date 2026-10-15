// =========================================================
// CUI-3B / 3B.1: CAD アイコンツールバー
// - Phase 2B マトリクス WEST グループを正本にする
// - NORTH のファイル/Undo/STAFF は重複させない
// - 既存 ID / 既存関数へ委譲する（モード正本は増やさない）
// - 未実装は偽動作させず、CUI-3C 入口ポップアップのみ
// =========================================================

(function () {
  const SA = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const SVG = {
    select: '<svg ' + SA + '><path d="M5 3.8l6.2 16.2 2.1-6.4 6.5-2.2z"/></svg>',
    joint: '<svg ' + SA + '><circle cx="12" cy="12" r="5.4"/></svg>',
    beam: '<svg ' + SA + '><circle cx="3.8" cy="12" r="2.35"/><circle cx="13.4" cy="12" r="2.35"/><path d="M6.2 12h4.85"/><path d="M19.3 9.1v5.8M16.4 12h5.8"/></svg>',
    pole: '<svg ' + SA + '><circle cx="8.6" cy="3.8" r="2.35"/><circle cx="8.6" cy="13.4" r="2.35"/><path d="M8.6 6.2v4.85"/><path d="M17.7 9.1v5.8M14.8 12h5.8"/></svg>',
    leg: '<svg ' + SA + '><circle cx="12" cy="6.1" r="3.55"/><path d="M7.2 19.6L12 9.65 16.8 19.6z"/></svg>',
    connect: '<svg ' + SA + '><circle cx="3.8" cy="12" r="2.35"/><circle cx="20.2" cy="12" r="2.35"/><path d="M6.4 12h7.2" stroke-dasharray="1.7 1.6"/><path d="M13.4 9.7L17.3 12l-3.9 2.3"/></svg>',
    length: '<svg ' + SA + '><path d="M4.4 7.2v9.6M19.6 7.2v9.6M4.4 12h15.2"/><path d="M7.6 9.8L4.4 12l3.2 2.2M16.4 9.8l3.2 2.2-3.2 2.2"/></svg>',
    material: '<svg ' + SA + '><rect x="3.4" y="8.2" width="9.2" height="9.2" rx="1.4"/><rect x="8.6" y="5.2" width="9.2" height="9.2" rx="1.4"/><rect x="6.2" y="11.2" width="8.4" height="7.4" rx="1.4"/></svg>',
    delete: '<svg ' + SA + '><path d="M4.6 6.6h14.8M9 6.6V4.8h6v1.8M7.4 6.6l1.1 13.2h7l1.1-13.2"/><path d="M10.2 10.2v6.2M13.8 10.2v6.2"/></svg>',
    shelf: '<svg ' + SA + '><path d="M4 13.2L12 9.4l8 3.8-8 3.8z"/><path d="M4 13.2v2.3L12 19.3v-2.3"/><path d="M20 13.2v2.3L12 19.3"/></svg>',
    wall: '<svg ' + SA + '><path d="M7.2 4.4l9.6 2.4v12.4l-9.6-2.4z"/><path d="M7.2 9.2l9.6 2.4M7.2 14l9.6 2.4"/></svg>',
    move: '<svg ' + SA + '><path d="M12 3.6v16.8M3.6 12h16.8"/><path d="M8.4 6.2L12 3.6l3.6 2.6M8.4 17.8L12 20.4l3.6-2.6M6.2 8.4L3.6 12l2.6 3.6M17.8 8.4L20.4 12l-2.6 3.6"/></svg>',
    rotPos: '<svg ' + SA + '><path d="M19.6 12a7.6 7.6 0 1 1-2.1-5.3"/><path d="M19.6 4.8v5.2h-5.2"/></svg>',
    rotNeg: '<svg ' + SA + '><path d="M4.4 12a7.6 7.6 0 1 0 2.1-5.3"/><path d="M4.4 4.8v5.2h5.2"/></svg>',
    cluster: '<svg ' + SA + '><path d="M4.4 7.2v11.2M11.2 7.2v11.2M4.4 10.4h6.8M4.4 15.2h6.8"/><path d="M15.2 8.2l5.2 5.2M20.4 8.2l-5.2 5.2"/></svg>',
    autolayout: '<svg ' + SA + '><rect x="3.6" y="3.6" width="7.2" height="7.2" rx="1"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="1"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="1"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="1"/></svg>',
    dimension: '<svg ' + SA + '><g transform="rotate(-28 12 12)"><rect x="3.2" y="9" width="17.6" height="6" rx="0.8"/><path d="M6.4 9v6M9.2 9v3.4M12 9v6M14.8 9v3.4M17.6 9v6"/></g></svg>',
    estimate: '<svg ' + SA + '><rect x="5" y="3.4" width="14" height="17.2" rx="2"/><rect x="7.2" y="5.6" width="9.6" height="3.4" rx="0.6"/><path d="M8.2 12.2h2.2M13.6 12.2h2.2M8.2 15.4h2.2M13.6 15.4h2.2M8.2 18.4h7.6"/></svg>',
  };

  const GROUPS = [
    {
      id: "select",
      title: "選択・操作",
      items: [
        { cmd: "select", label: "選択", tip: "選択（モード解除）", icon: "select" },
      ],
    },
    {
      id: "add",
      title: "パーツ追加",
      items: [
        { cmd: "joint", label: "Joint", tip: "Jointを追加 / 選択", icon: "joint" },
        { cmd: "beam", label: "Beam", tip: "Beamを追加", icon: "beam" },
        { cmd: "pole", label: "Pole", tip: "Poleを追加", icon: "pole" },
        { cmd: "leg", label: "Leg", tip: "LegのON / OFF", icon: "leg" },
        { cmd: "connect", label: "接続", tip: "接続モード", icon: "connect" },
      ],
    },
    {
      id: "edit",
      title: "編集",
      items: [
        { cmd: "length", label: "長さ", tip: "長さを変更", icon: "length" },
        { cmd: "material", label: "材質", tip: "材質を設定", icon: "material" },
        { cmd: "delete", label: "削除", tip: "削除モード（ラックをクリック）。単体は Alt+クリック", icon: "delete" },
      ],
    },
    {
      id: "board",
      title: "板",
      items: [
        { cmd: "shelf", label: "棚板", tip: "棚板モード", icon: "shelf" },
        { cmd: "wall", label: "壁板", tip: "壁板モード", icon: "wall" },
      ],
    },
    {
      id: "place",
      title: "配置",
      items: [
        { cmd: "move", label: "移動", tip: "ラックを移動", icon: "move" },
        { cmd: "rotPos", label: "回転 +90", tip: "クラスタを +90° 回転", icon: "rotPos" },
        { cmd: "rotNeg", label: "回転 -90", tip: "クラスタを -90° 回転", icon: "rotNeg" },
        { cmd: "clusterDel", label: "クラスタ削除", tip: "選択ラックを削除", icon: "cluster" },
        { cmd: "autolayout", label: "自動レイアウト", tip: "自動レイアウトツールを開く", icon: "autolayout" },
      ],
    },
    {
      id: "view",
      title: "表示・出力",
      items: [
        { cmd: "dimension", label: "寸法", tip: "寸法を表示", icon: "dimension" },
        { cmd: "estimate", label: "見積", tip: "見積明細", icon: "estimate" },
      ],
    },
  ];

  let dispatching = false;
  let overflowOpen = false;

  function $(id) {
    return document.getElementById(id);
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
    if (except !== "delete" && window.isDeleteModeOn) {
      window.setDeleteMode?.(false);
      const btn = document.querySelector('.cr-leftbar [aria-label="ラック削除（クラスター）"]');
      if (btn) btn.classList.remove("is-on");
    }
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

  function openEntryPopup(id, title, message, extra) {
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
        clearExclusive();
        break;
      case "joint":
        clearExclusive();
        break;
      case "beam":
        clearExclusive();
        setPartType("beam");
        break;
      case "pole":
        clearExclusive();
        setPartType("pole");
        break;
      case "leg": {
        const idx = activeJointIndex();
        if (idx >= 0 && typeof window.toggleLegForJoint === "function") {
          window.toggleLegForJoint(idx);
        } else {
          openEntryPopup(
            "leg-hint",
            "脚の切り替え",
            "Joint を選択してからこのアイコンを押すと脚を切り替えます。3D 上では Shift+クリックでも同じ操作ができます。"
          );
        }
        break;
      }
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
          if (window.v3WorkspaceUi && window.v3WorkspaceUi.getOpenPopupId() === "length") {
            window.v3WorkspaceUi.closePopup("cancel");
          }
        } else {
          clearExclusive("length");
          if (!window.isLengthEditModeOn) clickLegacy("#length-mode-btn");
          openEntryPopup(
            "length",
            "長さ変更",
            "長さ変更モードをONにしました。数値・プリセット入力は CUI-3C のポップアップで実装します。いまは旧操作パネルの長さ変更が使えます。",
            function (body) { addOpenPanelButton(body, "旧パネルで長さを変更"); }
          );
        }
        break;
      case "material":
        openEntryPopup(
          "material",
          "材質",
          "材質の適用範囲指定は CUI-3C で実装します。未実装の適用は行いません。旧操作パネルの材質セレクトが使えます。",
          function (body) { addOpenPanelButton(body, "旧パネルで材質を変更"); }
        );
        break;
      case "delete":
        if (window.isDeleteModeOn) {
          toggleDeleteMode();
        } else {
          clearExclusive("delete");
          if (!window.isDeleteModeOn) toggleDeleteMode();
        }
        break;
      case "shelf":
        if (window.isBoardModeOn && !$("board-kind-toggle")?.checked) {
          window.setBoardMode?.(false);
        } else {
          clearExclusive("board");
          setBoardKind(false);
          window.setBoardMode?.(true);
        }
        break;
      case "wall":
        if (window.isBoardModeOn && $("board-kind-toggle")?.checked) {
          window.setBoardMode?.(false);
        } else {
          clearExclusive("board");
          setBoardKind(true);
          window.setBoardMode?.(true);
        }
        break;
      case "move":
        if (window.isMoveModeOn) {
          window.setMoveMode?.(false);
        } else {
          clearExclusive("move");
          window.setMoveMode?.(true);
        }
        break;
      case "rotPos":
        window.rotateActiveCluster90?.(90);
        break;
      case "rotNeg":
        window.rotateActiveCluster90?.(-90);
        break;
      case "clusterDel": {
        const idx = activeJointIndex();
        if (idx < 0) {
          openEntryPopup(
            "cluster-del-hint",
            "クラスタ削除",
            "削除するラックの Joint を選択してから、このアイコンをもう一度押してください。"
          );
          break;
        }
        window.deleteActiveCluster?.(idx, { confirm: true });
        break;
      }
      case "autolayout":
        clickLegacy("#open-auto-layout-tool");
        break;
      case "dimension":
        clickLegacy("#dimension-open-btn");
        break;
      case "estimate":
        openEntryPopup(
          "estimate",
          "見積",
          "部材明細ポップアップは CUI-3C で実装します。合計金額は NORTH に表示済みです。明細は旧操作パネルでも確認できます。",
          function (body) { addOpenPanelButton(body, "旧パネルの明細を表示"); }
        );
        break;
      default:
        break;
    }
    syncActive();
  }

  function isBoardKindWall() {
    return !!$("board-kind-toggle")?.checked;
  }

  function syncActive() {
    const pop = window.v3WorkspaceUi && typeof window.v3WorkspaceUi.getOpenPopupId === "function"
      ? window.v3WorkspaceUi.getOpenPopupId()
      : null;
    const exclusive =
      window.isDeleteModeOn ? "delete" :
      window.isMoveModeOn ? "move" :
      window.isConnectModeOn ? "connect" :
      window.isLengthEditModeOn ? "length" :
      window.isBoardModeOn ? (isBoardKindWall() ? "wall" : "shelf") :
      null;
    const part = window.currentPartType === "pole" ? "pole" : "beam";

    document.querySelectorAll("[data-v3-cad-cmd]").forEach((btn) => {
      const cmd = btn.getAttribute("data-v3-cad-cmd");
      let on = false;
      if (exclusive) on = cmd === exclusive;
      else if (cmd === "beam" || cmd === "pole") on = cmd === part;
      if (pop && (cmd === "material" || cmd === "estimate" || cmd === "length") && pop === cmd) {
        on = true;
      }
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
  }

  function fillOverflowMenu(hiddenGroups) {
    const menu = $("v3-cad-overflow-menu");
    if (!menu) return;
    menu.innerHTML = "";
    hiddenGroups.forEach((group) => {
      group.querySelectorAll("[data-v3-cad-cmd]").forEach((el) => {
        const cmd = el.getAttribute("data-v3-cad-cmd");
        const tip = el.getAttribute("data-tip") || el.getAttribute("aria-label") || cmd;
        const copy = document.createElement("button");
        copy.type = "button";
        copy.setAttribute("role", "menuitem");
        copy.setAttribute("data-v3-cad-cmd", cmd);
        copy.setAttribute("data-tip", tip);
        copy.setAttribute("title", tip);
        copy.setAttribute("aria-label", tip);
        copy.innerHTML = (el.innerHTML || "") + "<span>" + tip + "</span>";
        copy.classList.toggle("is-on", el.classList.contains("is-on"));
        copy.addEventListener("click", function (ev) {
          ev.preventDefault();
          closeOverflow();
          runCommand(cmd);
        });
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
        btn.setAttribute("data-tip", item.tip);
        btn.setAttribute("title", item.tip);
        btn.setAttribute("aria-label", item.tip);
        btn.setAttribute("aria-pressed", "false");
        btn.innerHTML = SVG[item.icon] || "";
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          runCommand(item.cmd);
        });
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
    ["setMoveMode", "setConnectMode", "setLengthEditMode", "setBoardMode", "setDeleteMode", "syncPartTypeFromToggle", "syncMoveModeUI", "syncBoardUI"].forEach((name) => {
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

  function onLayout() {
    applyGroups();
    layoutOverflow();
    syncActive();
  }

  buildToolbar();
  bindOverflow();
  bindSync();
  onLayout();
  requestAnimationFrame(onLayout);
  window.addEventListener("load", onLayout);

  window.v3CadToolbar = {
    onLayout,
    syncActive,
    applyGroups,
    runCommand,
    GROUPS,
  };
})();
