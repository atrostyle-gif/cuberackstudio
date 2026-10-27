// Phase 5 structural-reference panel.  It uses explicit inputs only; it never infers supports.
(function () {
  "use strict";
  const POP_ID = "structural-analysis";
  function $(id) { return document.getElementById(id); }
  function app() { return window.v3StructuralAnalysis; }
  function ui() { return window.v3WorkspaceUi; }
  function labelForBeam(beam, index) { return "BEAM " + (index + 1) + " (" + beam.id + ")"; }
  function labelForJoint(joint, index) { return "JOINT " + (index + 1) + " (" + joint.id + ")"; }
  function floorCandidates() {
    const api = window.CubeRackStructuralUiState;
    return api && typeof api.floorSupportCandidates === "function"
      ? api.floorSupportCandidates(window.joints || [], window.legs || [])
      : { toleranceMm: 0.1, lowestCadYMm: null, allJoints: [], candidates: [] };
  }
  function floorJointLabel(joint) {
    return labelForJoint(joint, joint.index) + " / CAD y=" + n(joint.yMm, 3) + " mm / " + (joint.hasLeg ? "LEG接続あり" : "LEG接続なし");
  }
  function n(v, digits) { return Number.isFinite(v) ? Number(v).toFixed(digits == null ? 3 : digits) : "—"; }
  function statusText(result) {
    if (!result) return "未計算";
    return result.completeRackStatus || result.status || "UNKNOWN";
  }
  function addStyle() {
    if (document.getElementById("v3-structural-style")) return;
    const style = document.createElement("style");
    style.id = "v3-structural-style";
    style.textContent = ".v3-struct{display:grid;gap:10px;min-width:360px;max-width:620px}.v3-struct-note{font-size:12px;line-height:1.45;color:#fde68a;background:#422006;padding:8px;border-radius:6px}.v3-struct-section{border-top:1px solid #475569;padding-top:9px}.v3-struct h4{margin:0 0 6px;font-size:13px}.v3-struct-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0}.v3-struct input,.v3-struct select{max-width:160px}.v3-struct-shelf{border:1px solid #475569;border-radius:6px;padding:7px;margin:6px 0}.v3-struct-summary{font-size:12px;white-space:pre-wrap;background:#0f172a;padding:8px;border-radius:6px}.v3-struct-error{color:#fda4af;font-size:12px}.v3-struct-detail{font-size:12px;background:#172554;padding:8px;border-radius:6px}.v3-struct button{font:inherit}.v3-struct-support{display:flex;gap:5px;margin:4px 0;align-items:center}.v3-struct-floor-note{font-size:11px;line-height:1.45;color:#cbd5e1;margin:0 0 6px}.v3-struct-manual{margin-top:8px;padding-top:8px;border-top:1px dashed #475569}";
    document.head.appendChild(style);
  }
  function addButton(text, fn) { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.addEventListener("click", fn); return b; }
  function selectBeam(value) {
    const sel = document.createElement("select");
    const none = document.createElement("option"); none.value = ""; none.textContent = "支持BEAMを選択"; sel.appendChild(none);
    (window.beams || []).forEach(function (beam, index) { const opt = document.createElement("option"); opt.value = beam.id; opt.textContent = labelForBeam(beam, index); if (beam.id === value) opt.selected = true; sel.appendChild(opt); });
    return sel;
  }
  function supportRow(entry, onRemove) {
    const row = document.createElement("div"); row.className = "v3-struct-support";
    const beam = selectBeam(entry && entry.beamId);
    const share = document.createElement("input"); share.type = "number"; share.min = "0"; share.max = "1"; share.step = "0.01"; share.placeholder = "分配率"; share.value = entry && entry.share != null ? String(entry.share) : "";
    const kind = document.createElement("select"); [ ["uniform", "等分布"], ["point", "集中荷重"] ].forEach(function (item) { const opt = document.createElement("option"); opt.value = item[0]; opt.textContent = item[1]; if ((entry && entry.kind) === item[0]) opt.selected = true; kind.appendChild(opt); });
    const pos = document.createElement("input"); pos.type = "number"; pos.min = "0"; pos.step = "0.1"; pos.placeholder = "集中位置 mm"; pos.value = entry && Number.isFinite(entry.positionFromAMm) ? String(entry.positionFromAMm) : ""; pos.hidden = kind.value !== "point";
    kind.addEventListener("change", function () { pos.hidden = kind.value !== "point"; });
    const remove = addButton("削除", function () { row.remove(); onRemove(); });
    row.append(beam, share, kind, pos, remove);
    return row;
  }
  function readSupports(host) {
    return Array.from(host.querySelectorAll(".v3-struct-support")).map(function (row) {
      const controls = row.querySelectorAll("select,input");
      const beamId = controls[0].value;
      const share = Number(controls[1].value);
      const kind = controls[2].value;
      const positionFromAMm = Number(controls[3].value);
      if (!beamId || !Number.isFinite(share)) return null;
      const out = { beamId: beamId, share: share, kind: kind };
      if (kind === "point") out.positionFromAMm = positionFromAMm;
      return out;
    }).filter(Boolean);
  }
  function detailText(detail) {
    if (!detail) return "BEAMまたはPOLEを選択すると、ここに部材参考計算を表示します。";
    if (!detail.result) return detail.type.toUpperCase() + " " + detail.id + " は計算対象外または計算不能です。";
    const r = detail.result;
    if (detail.type === "beam") return ["BEAM " + detail.id, "最大曲げ応力: " + n(r.maxBendingStressMPa) + " MPa", "最大たわみ: " + n(r.maxDeflectionMm) + " mm", "作用荷重（反力合計）: " + n(r.reactionAN + r.reactionBN) + " N", "使用率: " + n(detail.usage && detail.usage.utilization), "これは部材参考計算です。"].join("\n");
    return ["POLE " + detail.id, "上端軸力: " + n(r.topAxialN) + " N", "下端圧縮応力: " + n(r.compressionStressBottomMPa) + " MPa", "Euler座屈参考値: " + n(r.eulerLoadN) + " N", "K値/座屈判定: " + (r.bucklingStatus || "UNKNOWN"), "使用率: " + n(detail.usage && detail.usage.utilization), "これは部材参考計算です。"].join("\n");
  }
  function render(body) {
    addStyle();
    const service = app(); if (!service) return;
    const state = service.getState();
    const floorInfo = floorCandidates();
    const root = document.createElement("div"); root.className = "v3-struct";
    const note = document.createElement("div"); note.className = "v3-struct-note"; note.textContent = "部材参考計算です。完成ラックの許容積載荷重・JOINT/ネック/T溝/横剛性・棚板強度は表示も保証もしません。緑・黄・赤は、明示入力した部材参考基準に対する使用率です。"; root.appendChild(note);
    const controls = document.createElement("div"); controls.className = "v3-struct-row";
    const overlay = document.createElement("input"); overlay.type = "checkbox"; overlay.checked = !!state.overlayVisible;
    overlay.addEventListener("change", function () { service.setOverlayVisible(overlay.checked); });
    const label = document.createElement("label"); label.append(overlay, document.createTextNode(" 3D参考表示")); controls.appendChild(label);
    controls.appendChild(addButton("再計算", function () { service.calculate("manual"); renderSummary(); })); root.appendChild(controls);
    const summary = document.createElement("div"); summary.className = "v3-struct-summary"; root.appendChild(summary);
    function renderSummary() {
      const r = service.getResult(); const current = service.getState() || state; const inputs = current.shelfInputs || {};
      const setKg = Object.keys(inputs).reduce(function (sum, id) { return sum + Number(inputs[id].loadKg || 0); }, 0);
      const unknown = (r && r.unknownReasons) || [];
      const errors = (r && r.errors) || [];
      const source = (r && r.sourceSummary) || {};
      summary.textContent = ["状態: " + statusText(r), "CAD JOINT数: " + ((source.cadJointCount != null ? source.cadJointCount : (window.joints || []).length)), "解析ノード数: " + (source.analysisNodeCount == null ? "未計算" : source.analysisNodeCount), "床支持候補数: " + floorInfo.candidates.length, "選択床支持数: " + (current.floorSupportJointIds || []).length, "設定済み棚区画: " + Object.keys(inputs).length + " / " + (window.shelves || []).length, "設定積載荷重: " + n(setKg, 2) + " kg", "計算時間: " + n(service.getLastDurationMs(), 2) + " ms", "未検証: " + (unknown.length ? unknown.join(" / ") : "なし"), errors.length ? "計算不能: " + errors.join(" / ") : ""].filter(Boolean).join("\n");
    }
    renderSummary();
    const floor = document.createElement("section"); floor.className = "v3-struct-section"; floor.innerHTML = "<h4>床支持JOINT（明示指定）</h4>";
    const floorNote = document.createElement("p"); floorNote.className = "v3-struct-floor-note";
    floorNote.textContent = "候補は CAD 鉛直座標 y の最小値 " + n(floorInfo.lowestCadYMm, 3) + " mm ±" + n(floorInfo.toleranceMm, 3) + " mm です。LEG接続は参考情報であり、支持点は自動設定しません。段差・異なる脚高さでは、下の手動指定で候補外JOINTを追加してください。";
    floor.appendChild(floorNote);
    function selectedFloorIds() { return Array.from(floor.querySelectorAll("input[data-floor-support]:checked")).map(function (x) { return x.value; }); }
    function appendFloorChoice(joint, manual, forceChecked) {
      const row = document.createElement("label"); row.className = "v3-struct-row";
      const box = document.createElement("input"); box.type = "checkbox"; box.setAttribute("data-floor-support", "true"); box.checked = forceChecked || state.floorSupportJointIds.indexOf(joint.id) >= 0;
      box.addEventListener("change", function () { service.setFloorSupportJointIds(selectedFloorIds()); renderSummary(); });
      box.value = joint.id; row.append(box, document.createTextNode(" " + floorJointLabel(joint) + (manual ? " / 手動追加" : ""))); floor.appendChild(row);
    }
    floorInfo.candidates.forEach(function (joint) { appendFloorChoice(joint, false); });
    const candidateIds = new Set(floorInfo.candidates.map(function (joint) { return joint.id; }));
    const manualSelected = floorInfo.allJoints.filter(function (joint) { return !candidateIds.has(joint.id) && state.floorSupportJointIds.indexOf(joint.id) >= 0; });
    if (manualSelected.length) {
      const selectedTitle = document.createElement("p"); selectedTitle.className = "v3-struct-floor-note"; selectedTitle.textContent = "候補外から手動指定したJOINT"; floor.appendChild(selectedTitle);
      manualSelected.forEach(function (joint) { appendFloorChoice(joint, true); });
    }
    const manual = document.createElement("div"); manual.className = "v3-struct-manual";
    const manualSelect = document.createElement("select");
    const blank = document.createElement("option"); blank.value = ""; blank.textContent = "候補外JOINTを手動指定"; manualSelect.appendChild(blank);
    floorInfo.allJoints.filter(function (joint) { return !candidateIds.has(joint.id) && state.floorSupportJointIds.indexOf(joint.id) < 0; }).forEach(function (joint) { const opt = document.createElement("option"); opt.value = joint.id; opt.textContent = floorJointLabel(joint); manualSelect.appendChild(opt); });
    manual.append(manualSelect, addButton("手動支持点を追加", function () { if (!manualSelect.value) return; const id = manualSelect.value; const selected = selectedFloorIds(); selected.push(id); service.setFloorSupportJointIds(selected); const joint = floorInfo.allJoints.find(function (row) { return row.id === id; }); if (joint) appendFloorChoice(joint, true, true); renderSummary(); manualSelect.options[manualSelect.selectedIndex].disabled = true; manualSelect.value = ""; }));
    floor.appendChild(manual); root.appendChild(floor);
    const refs = document.createElement("section"); refs.className = "v3-struct-section"; refs.innerHTML = "<h4>未自動設定の参考条件</h4>";
    const k = document.createElement("input"); k.type = "number"; k.min = "0"; k.step = "0.01"; k.placeholder = "K値（未入力=UNKNOWN）"; k.value = state.effectiveLengthFactor == null ? "" : String(state.effectiveLengthFactor);
    k.addEventListener("change", function () { service.setEffectiveLengthFactor(k.value); renderSummary(); });
    const stress = document.createElement("input"); stress.type = "number"; stress.min = "0"; stress.step = "0.1"; stress.placeholder = "曲げ参考基準 MPa"; stress.value = state.referenceLimits.maxBendingStressMPa || "";
    const ratio = document.createElement("input"); ratio.type = "number"; ratio.min = "1"; ratio.step = "1"; ratio.placeholder = "たわみ参考比 L/n"; ratio.value = state.referenceLimits.maxDeflectionRatio || "";
    const applyRefs = addButton("参考基準を反映", function () { service.setReferenceLimits({ maxBendingStressMPa: stress.value, maxDeflectionRatio: ratio.value }); renderSummary(); }); refs.append(k, stress, ratio, applyRefs); root.appendChild(refs);
    const shelves = document.createElement("section"); shelves.className = "v3-struct-section"; shelves.innerHTML = "<h4>棚区画の積載荷重と支持BEAM</h4>";
    (window.shelves || []).forEach(function (shelf, index) {
      if (!shelf || !shelf.id) return;
      const data = state.shelfInputs[shelf.id]; const box = document.createElement("div"); box.className = "v3-struct-shelf";
      const title = document.createElement("strong"); title.textContent = "棚 " + (index + 1) + " (" + shelf.id + ")"; box.appendChild(title);
      const load = document.createElement("input"); load.type = "number"; load.min = "0"; load.step = "0.01"; load.placeholder = "積載荷重 kg（未設定）"; load.value = data ? String(data.loadKg) : "";
      const supportHost = document.createElement("div"); (data && data.supports || []).forEach(function (entry) { supportHost.appendChild(supportRow(entry, function () {})); });
      const addSupport = addButton("支持BEAMを追加", function () { supportHost.appendChild(supportRow(null, function () {})); });
      const save = addButton("この棚を反映", function () { if (load.value.trim() === "") { service.setShelfInput(shelf.id, null); } else { service.setShelfInput(shelf.id, { loadKg: load.value, supports: readSupports(supportHost) }); } renderSummary(); });
      const clear = addButton("未設定に戻す", function () { service.setShelfInput(shelf.id, null); load.value = ""; supportHost.innerHTML = ""; renderSummary(); });
      const row = document.createElement("div"); row.className = "v3-struct-row"; row.append(load, addSupport, save, clear); box.append(row, supportHost); shelves.appendChild(box);
    });
    if (!(window.shelves || []).length) { const no = document.createElement("p"); no.textContent = "棚板がありません。棚板の有無から支持BEAMを推測することはしません。"; shelves.appendChild(no); }
    root.appendChild(shelves);
    const detail = document.createElement("div"); detail.className = "v3-struct-detail"; detail.textContent = detailText(service.detailsForSelection(window.selectedConnector)); root.appendChild(detail);
    window.addEventListener("cuberack:structural-selection", function (ev) { detail.textContent = detailText(ev.detail); });
    window.addEventListener("cuberack:structural-analysis-updated", function () { renderSummary(); detail.textContent = detailText(service.detailsForSelection(window.selectedConnector)); });
    body.appendChild(root);
  }
  function open(opts) {
    const host = ui(); if (!host || typeof host.openPopup !== "function") return;
    if (host.getOpenPopupId && host.getOpenPopupId() === POP_ID) { host.closePopup("cancel"); return; }
    app().refresh(); app().calculate("panel open");
    host.openPopup(POP_ID, { title: "構造解析（部材参考計算）", wide: true, hideApply: true, skipFocus: true, cancelLabel: "閉じる", anchor: opts && opts.anchor, render: render });
  }
  window.v3StructuralPanel = { open: open, isOpen: function () { return ui() && ui().getOpenPopupId && ui().getOpenPopupId() === POP_ID; } };
})();
