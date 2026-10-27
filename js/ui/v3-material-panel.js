// =========================================================
// V3 材質設定パネル
// - 新規選択は IRON / SUS のみ（BSは廃番で非表示）
// - 既存の材質適用・3D・見積ロジックを再利用
// =========================================================
(function () {
  const POP_ID = "material";

  function $(id) { return document.getElementById(id); }
  function ui() { return window.v3WorkspaceUi; }
  function norm(m) {
    return typeof window.normalizeMaterial === "function" ? window.normalizeMaterial(m) : (m || "IRON");
  }

  function isOpen() {
    const host = ui();
    return !!(host && host.getOpenPopupId && host.getOpenPopupId() === POP_ID);
  }

  function selectable() {
    const all = window.MATERIALS || ["IRON", "BS", "SUS"];
    return all.filter(function (code) {
      if (typeof window.isMaterialSelectable === "function") return window.isMaterialSelectable(code);
      return code !== "BS";
    });
  }

  function fillSelect(sel, current) {
    if (!sel) return;
    const cur = norm(current || "IRON");
    const opts = selectable();
    sel.innerHTML = "";
    opts.forEach(function (code) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code === "IRON" ? "Iron" : code === "SUS" ? "Sus" : code;
      sel.appendChild(opt);
    });
    if (opts.indexOf(cur) >= 0) sel.value = cur;
    else sel.value = opts[0] || "IRON";
  }

  function currentAddMat(sel) {
    return norm(sel && sel.value ? sel.value : (window.__CR_CURRENT_MATERIAL__ || "IRON"));
  }

  function afterChange(reason) {
    if (typeof window.afterMaterialChange === "function") {
      window.afterMaterialChange(reason);
      return;
    }
    try { window.calcAndRenderEstimate?.(); } catch (e) {}
    try { window.reapplyConnectorVisuals?.(reason || "material"); } catch (e2) {}
    try { window.requestEstimateRender?.(reason || "material"); } catch (e3) {}
  }

  function render(body) {
    const root = document.createElement("div");
    root.className = "v3-mat-root";

    const note = document.createElement("p");
    note.className = "v3-cmd-pop-note";
    note.textContent = "新規設計で選べる材質は IRON と SUS です。真鍮（BS）は廃番のため一覧に出しません。既存のBS部材は表示・見積・IRON/SUSへの変更ができます。";
    root.appendChild(note);

    const row = document.createElement("div");
    row.className = "v3-mat-row";
    const lab = document.createElement("label");
    lab.textContent = "追加・適用する材質";
    const sel = document.createElement("select");
    sel.id = "v3-mat-select";
    sel.className = "v3-mat-select";
    fillSelect(sel, window.__CR_CURRENT_MATERIAL__);
    sel.addEventListener("change", function () {
      const m = currentAddMat(sel);
      window.__CR_CURRENT_MATERIAL__ = m;
      const legacy = $("material-select");
      if (legacy && legacy.value !== m) {
        legacy.value = m;
        try { legacy.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
      afterChange("v3 material select");
    });
    row.appendChild(lab);
    row.appendChild(sel);
    root.appendChild(row);

    const actions = document.createElement("div");
    actions.className = "v3-mat-actions";
    function btn(label, fn) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "v3-len-mode";
      b.textContent = label;
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        fn();
      });
      return b;
    }
    actions.appendChild(btn("選択中のBeam/Poleへ適用", function () {
      const m = currentAddMat(sel);
      const sc = window.selectedConnector;
      if (!sc || (sc.type !== "beam" && sc.type !== "pole")) {
        status.textContent = "先にBeamまたはPoleを選択してください。";
        return;
      }
      const ok = window.applyMaterialToConnector(sc.type, sc.index, m);
      if (ok) afterChange("apply selected material");
      status.textContent = ok ? "選択中の部材へ " + m + " を適用しました。" : "適用できませんでした。";
    }));
    actions.appendChild(btn("全Beamへ適用", function () {
      const m = currentAddMat(sel);
      const ok = window.applyMaterialToAllOfType("beam", m);
      if (ok) afterChange("apply all beam material");
      status.textContent = ok ? "全Beamへ " + m + " を適用しました。" : "適用できませんでした。";
    }));
    actions.appendChild(btn("全Poleへ適用", function () {
      const m = currentAddMat(sel);
      const ok = window.applyMaterialToAllOfType("pole", m);
      if (ok) afterChange("apply all pole material");
      status.textContent = ok ? "全Poleへ " + m + " を適用しました。" : "適用できませんでした。";
    }));
    root.appendChild(actions);

    const jointRow = document.createElement("div");
    jointRow.className = "v3-mat-row";
    const jlab = document.createElement("label");
    jlab.textContent = "JointSet";
    const jsel = document.createElement("select");
    jsel.id = "v3-mat-joint";
    jsel.className = "v3-mat-select";
    const jointCur = typeof window.getPartTypeMaterial === "function" ? window.getPartTypeMaterial("jointBall") : "IRON";
    fillSelect(jsel, jointCur);
    jointRow.appendChild(jlab);
    jointRow.appendChild(jsel);
    root.appendChild(jointRow);

    const jointAct = document.createElement("div");
    jointAct.className = "v3-mat-actions";
    jointAct.appendChild(btn("JointSetへ全適用", function () {
      const m = currentAddMat(jsel);
      const types = ["jointBall", "leg", "jointCap", "topCap", "sideCap", "beamNut", "m5Screw"];
      types.forEach(function (type) {
        if (typeof window.setPartTypeMaterial === "function") window.setPartTypeMaterial(type, m);
      });
      const legacy = $("mat-jointSet");
      if (legacy) legacy.value = m;
      afterChange("jointSet material");
      status.textContent = "JointSetへ " + m + " を適用しました。";
    }));
    root.appendChild(jointAct);

    const status = document.createElement("p");
    status.className = "v3-connect-msg";
    status.id = "v3-mat-status";
    root.appendChild(status);

    body.appendChild(root);
  }

  function open(opts) {
    const host = ui();
    if (!host || typeof host.openPopup !== "function") return;
    if (isOpen()) {
      host.closePopup("cancel");
      return;
    }
    host.openPopup(POP_ID, {
      title: "材質設定",
      hideApply: true,
      skipFocus: true,
      cancelLabel: "閉じる",
      anchor: (opts && opts.anchor) || $("v3-cad-material"),
      render: render,
    });
  }

  window.v3MaterialPanel = {
    open: open,
    isOpen: isOpen,
  };
})();
