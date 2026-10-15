// =========================================================
// CUI-3B: CAD アイコンツールバー
// - Phase 2B マトリクス WEST グループを正本にする
// - NORTH のファイル/Undo/STAFF は重複させない
// - 既存 ID / 既存関数へ委譲する（モード正本は増やさない）
// - 未実装は偽動作させず、CUI-3C 入口ポップアップのみ
// =========================================================

(function () {
  const SVG = {
    select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4l6 16 2.2-6.2L19 12z"/></svg>',
    joint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    beam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.4 12h9.2"/></svg>',
    pole: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M12 7.4v9.2"/></svg>',
    leg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="6" r="2.4"/><path d="M12 8.5v6.5M8 21l4-6 4 6"/></svg>',
    connect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="12" r="2.4"/><path d="M8.6 12h6.8"/></svg>',
    length: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8v8M19 8v8M5 12h14M8 10l-3 2 3 2M16 10l3 2-3 2"/></svg>',
    material: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3s6 6.2 6 10.2A6 6 0 1 1 6 13.2C6 9.2 12 3 12 3z"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13"/></svg>',
    shelf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 12h16M4 16h16M7 8v8M17 8v8"/></svg>',
    wall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="6" y="4" width="12" height="16" rx="1"/><path d="M6 10h12M6 15h12"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M4 12h16M8 6l4-3 4 3M8 18l4 3 4-3M6 8l-3 4 3 4M18 8l3 4-3 4"/></svg>',
    rotPos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.2-5.5"/><path d="M20 5v5h-5"/></svg>',
    rotNeg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.2-5.5"/><path d="M4 5v5h5"/></svg>',
    cluster: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="10" height="12" rx="1"/><path d="M16 8h4M16 12h4M16 16h4M8 4v16"/></svg>',
    autolayout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    dimension: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 19h16M7 19V5M17 19V9M7 8h10M7 14h6"/></svg>',
    estimate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  };

  const GROUPS = [
    {
      id: "select",
      items: [
        { cmd: "select", label: "選択", tip: "選択（モード解除）", icon: "select" },
      ],
    },
    {
      id: "add",
      items: [
        { cmd: "joint", label: "Joint", tip: "Joint を追加 / 選択", icon: "joint" },
        { cmd: "beam", label: "Beam", tip: "Beam を追加", icon: "beam" },
        { cmd: "pole", label: "Pole", tip: "Pole を追加", icon: "pole" },
        { cmd: "leg", label: "Leg", tip: "脚の ON / OFF", icon: "leg" },
        { cmd: "connect", label: "接続", tip: "接続モード（始点 → 終点）", icon: "connect" },
      ],
    },
    {
      id: "edit",
      items: [
        { cmd: "length", label: "長さ", tip: "長さ変更モード", icon: "length" },
        { cmd: "material", label: "材質", tip: "材質（CUI-3C 入口）", icon: "material" },
        { cmd: "delete", label: "削除", tip: "削除モード（ラックをクリック）。単体は Alt+クリック", icon: "delete" },
      ],
    },
    {
      id: "board",
      items: [
        { cmd: "shelf", label: "棚板", tip: "棚板モード", icon: "shelf" },
        { cmd: "wall", label: "壁板", tip: "壁板モード", icon: "wall" },
      ],
    },
    {
      id: "place",
      items: [
        { cmd: "move", label: "移動", tip: "ラック移動モード", icon: "move" },
        { cmd: "rotPos", label: "回転 +90", tip: "クラスタを +90° 回転", icon: "rotPos" },
        { cmd: "rotNeg", label: "回転 -90", tip: "クラスタを -90° 回転", icon: "rotNeg" },
        { cmd: "clusterDel", label: "クラスタ削除", tip: "選択ラックを削除", icon: "cluster" },
        { cmd: "autolayout", label: "自動レイアウト", tip: "自動レイアウトツールを開く", icon: "autolayout" },
      ],
    },
    {
      id: "view",
      items: [
        { cmd: "dimension", label: "寸法", tip: "寸法を表示", icon: "dimension" },
        { cmd: "estimate", label: "見積", tip: "見積明細（CUI-3C 入口）", icon: "estimate" },
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
  }

  function closeOverflow() {
    overflowOpen = false;
    const menu = $("v3-cad-overflow-menu");
    const btn = $("v3-cad-overflow-btn");
    if (menu) menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function fillOverflowMenu(hiddenItems) {
    const menu = $("v3-cad-overflow-menu");
    if (!menu) return;
    menu.innerHTML = "";
    hiddenItems.forEach((el) => {
      if (el.classList.contains("v3-cad-sep")) return;
      const cmd = el.getAttribute("data-v3-cad-cmd");
      const copy = document.createElement("button");
      copy.type = "button";
      copy.setAttribute("role", "menuitem");
      copy.setAttribute("data-v3-cad-cmd", cmd);
      copy.innerHTML = (el.innerHTML || "") + "<span>" + (el.getAttribute("data-tip") || cmd) + "</span>";
      copy.classList.toggle("is-on", el.classList.contains("is-on"));
      copy.addEventListener("click", function (ev) {
        ev.preventDefault();
        closeOverflow();
        runCommand(cmd);
      });
      menu.appendChild(copy);
    });
  }

  function layoutOverflow() {
    const tb = $("v3-tb-tools");
    const body = $("v3-cad-body");
    const more = $("v3-cad-overflow-btn");
    if (!tb || !body || !more) return;

    const items = Array.prototype.slice.call(body.querySelectorAll(".v3-cad-item"));
    items.forEach((el) => { el.hidden = false; });
    more.hidden = true;
    closeOverflow();

    const vertical = tb.classList.contains("is-vertical");
    const measure = function (el) {
      return vertical ? el.offsetHeight : el.offsetWidth;
    };
    const sizes = items.map(measure);
    const total = sizes.reduce(function (sum, n) { return sum + n + 2; }, 0);
    const avail = vertical ? body.clientHeight : body.clientWidth;
    if (!avail || total <= avail) return;

    more.hidden = false;
    const moreSize = measure(more) || 36;
    let used = moreSize + 2;
    let overflowAt = items.length;
    for (let i = 0; i < items.length; i++) {
      if (used + sizes[i] + 2 > avail) {
        overflowAt = Math.max(1, i);
        break;
      }
      used += sizes[i] + 2;
    }
    if (overflowAt < items.length) {
      const hidden = items.slice(overflowAt);
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
    GROUPS.forEach((group, gi) => {
      if (gi > 0) {
        const sep = document.createElement("div");
        sep.className = "v3-cad-sep v3-cad-item";
        sep.setAttribute("role", "separator");
        sep.setAttribute("data-group", group.id);
        body.appendChild(sep);
      }
      group.items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "v3-cad-" + item.cmd;
        btn.className = "v3-icon-btn v3-cad-btn v3-cad-item";
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
        body.appendChild(btn);
      });
    });
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
    runCommand,
    GROUPS,
  };
})();
