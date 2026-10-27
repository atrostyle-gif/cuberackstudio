// =========================================================
// レイヤーポップアップ
// - 作業レイヤー：設計データの階層・表示・ロック
// - 部材レイヤー：表示のみ。保存・数量・見積には影響しない
// =========================================================
(function () {
  const GROUPS = [
    {
      id: "frame",
      title: "部材",
      items: [
        { id: "beam", label: "Beam" },
        { id: "pole", label: "Pole" },
        { id: "joint", label: "JointBall" },
        { id: "leg", label: "Leg" },
      ],
    },
    {
      id: "board",
      title: "棚板 / 壁板",
      items: [
        { id: "shelf", label: "棚板" },
        { id: "wall", label: "壁板" },
      ],
    },
  ];
  const collapsedGroups = {};
  const collapsedWork = {};
  let activeTab = "work";
  let renamingId = null;
  let nameClickTimer = null;
  let moveDestId = null;
  let layerDrag = null;
  const HANDLE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3.5" r="1.35"/><circle cx="11" cy="3.5" r="1.35"/><circle cx="5" cy="8" r="1.35"/><circle cx="11" cy="8" r="1.35"/><circle cx="5" cy="12.5" r="1.35"/><circle cx="11" cy="12.5" r="1.35"/></svg>';

  function layers() {
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    const cur = (st && st.layers) || {};
    const norm = window.v3WorkLayers && typeof window.v3WorkLayers.normalizePartVis === "function"
      ? window.v3WorkLayers.normalizePartVis(cur)
      : {
        frame: cur.frame !== false,
        beam: cur.beam !== false,
        pole: cur.pole !== false,
        joint: cur.joint !== false,
        leg: cur.leg !== false,
        shelf: cur.shelf !== false,
        wall: cur.wall !== false,
      };
    return norm;
  }

  function partCount(id) {
    if (id === "beam") return (window.beams || []).length;
    if (id === "pole") return (window.poles || []).length;
    if (id === "joint") return (window.joints || []).length;
    if (id === "leg") return (window.legs || []).length;
    if (id === "shelf") return (window.shelves || []).length;
    if (id === "wall") return (window.panels || []).length;
    return 0;
  }

  function setLayers(next) {
    const st = window.v3CadOps && window.v3CadOps.layoutState();
    if (st) st.layers = next;
    if (window.v3WorkspaceUi && typeof window.v3WorkspaceUi.persist === "function") {
      window.v3WorkspaceUi.persist();
    }
    applyVisibility();
    render();
  }

  function setVisible(id, on) {
    const next = layers();
    next[id] = !!on;
    setLayers(next);
  }

  function setGroup(group, on) {
    const next = layers();
    if (group.id === "frame") next.frame = !!on;
    else group.items.forEach((item) => { next[item.id] = !!on; });
    setLayers(next);
  }

  function groupState(group, vis) {
    if (group.id === "frame" && vis.frame === false) return "off";
    const ons = group.items.filter((item) => vis[item.id]);
    if (ons.length === group.items.length) return "on";
    if (ons.length === 0) return "off";
    return "mix";
  }

  function applyVisibility() {
    const vis = layers();
    if (window.v3WorkLayers && typeof window.v3WorkLayers.applyCombinedVisibility === "function") {
      window.v3WorkLayers.applyCombinedVisibility(vis);
    } else {
      const eff = window.v3WorkLayers && typeof window.v3WorkLayers.effectivePartVis === "function"
        ? window.v3WorkLayers.effectivePartVis(vis)
        : vis;
      (window.beams || []).forEach((b) => { if (b && b.mesh) b.mesh.visible = !!eff.beam; });
      (window.poles || []).forEach((p) => { if (p && p.mesh) p.mesh.visible = !!eff.pole; });
      (window.jointMeshes || []).forEach((m) => { if (m) m.visible = !!eff.joint; });
      (window.legs || []).forEach((l) => { if (l && l.mesh) l.mesh.visible = !!eff.leg; });
      (window.shelves || []).forEach((s) => { if (s && s.mesh) s.mesh.visible = !!eff.shelf; });
      (window.panels || []).forEach((p) => { if (p && p.mesh) p.mesh.visible = !!eff.wall; });
      if (window.v3WorkLayers && typeof window.v3WorkLayers.flushInstanceVisibility === "function") {
        window.v3WorkLayers.flushInstanceVisibility();
      }
    }
    if (!vis.joint) releaseHiddenJoints();
  }

  function releaseHiddenJoints() {
    if (typeof window.setSelectedJoint === "function") window.setSelectedJoint(null);
    if (typeof window.hidePreview === "function") window.hidePreview();
    window.__CR_ACTIVE_JOINT_INDEX__ = null;
    if (window.v3MultiSelect && typeof window.v3MultiSelect.dropJoints === "function") {
      window.v3MultiSelect.dropJoints();
    }
  }

  function commitWork(reason) {
    try { window.saveHistory?.(reason); } catch (e) {}
    applyVisibility();
    render();
  }

  function eyeSvg(state) {
    if (state === "off") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.5 4.2 9.5 7a11.8 11.8 0 0 1-2.2 3.2"/><path d="M6.2 6.3C4.2 7.8 2.7 9.8 2.5 12c.8 2.4 4.2 7 9.5 7 1.1 0 2.2-.2 3.2-.6"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  }

  function lockSvg(on) {
    if (on) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0"/></svg>';
  }

  function iconBtn(className, state, title, html, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className + (state ? " is-" + state : "");
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = html;
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return btn;
  }

  function eyeBtn(state, title, onClick) {
    return iconBtn("v3-layer-eye", state, title, eyeSvg(state === "off" ? "off" : "on"), onClick);
  }

  function workRows() {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.getState !== "function") return [];
    const st = wl.getState();
    const byParent = {};
    (st.workLayers || []).forEach((layer) => {
      const key = layer.parentId || "";
      if (!byParent[key]) byParent[key] = [];
      byParent[key].push(layer);
    });
    Object.keys(byParent).forEach((key) => {
      byParent[key].sort((a, b) => {
        const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
        const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || "").localeCompare(String(b.name || ""), "ja");
      });
    });
    const rows = [];
    function walk(parentId, depth) {
      const kids = byParent[parentId || ""] || [];
      kids.forEach((layer) => {
        const hasKids = !!(byParent[layer.id] && byParent[layer.id].length);
        rows.push({ layer: layer, depth: depth, hasKids: hasKids });
        if (hasKids && !collapsedWork[layer.id]) walk(layer.id, depth + 1);
      });
    }
    walk(null, 0);
    return rows;
  }

  function finishRename(id, value) {
    renamingId = null;
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.renameLayer !== "function") return;
    const current = (wl.getState().workLayers || []).find((layer) => layer.id === id);
    const next = String(value || "").trim();
    if (!current || !next || next === current.name) {
      render();
      return;
    }
    if (wl.renameLayer(id, next)) commitWork("rename work layer");
    else render();
  }

  function addWorkLayer(parentId) {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.addLayer !== "function") return;
    const pid = parentId || null;
    const id = wl.addLayer({ parentId: pid, name: "レイヤー" });
    if (!id) return;
    if (pid) collapsedWork[pid] = false;
    if (typeof wl.setActiveLayer === "function") wl.setActiveLayer(id);
    commitWork("add work layer");
  }

  function setUiDragging(on) {
    document.body.classList.toggle("v3-ui-dragging", !!on);
    window.__v3UiDragging = !!on;
  }

  function clearDropMarks() {
    document.querySelectorAll(".v3-work-row.is-drop-before, .v3-work-row.is-drop-after, .v3-work-row.is-drop-child, .v3-work-row.is-drop-invalid, .v3-work-row.is-dragging").forEach((el) => {
      el.classList.remove("is-drop-before", "is-drop-after", "is-drop-child", "is-drop-invalid", "is-dragging");
      el.removeAttribute("data-drop-caption");
    });
    const rootDrop = document.getElementById("v3-work-root-drop");
    if (rootDrop) rootDrop.classList.remove("is-drop");
    hideDropHint();
  }

  function armRootDrop(on) {
    const rootDrop = document.getElementById("v3-work-root-drop");
    if (rootDrop) rootDrop.classList.toggle("is-armed", !!on);
  }

  function hideDropHint() {
    const hint = document.getElementById("v3-work-drop-hint");
    if (!hint) return;
    hint.hidden = true;
    hint.className = "v3-work-drop-hint";
    hint.removeAttribute("data-kind");
    const label = hint.querySelector(".v3-work-drop-hint-label");
    if (label) label.textContent = "";
  }

  function workLayerById(id) {
    const wl = window.v3WorkLayers;
    const layers = (wl && wl.getState && wl.getState().workLayers) || [];
    for (let i = 0; i < layers.length; i++) {
      if (layers[i] && layers[i].id === id) return layers[i];
    }
    return null;
  }

  function wouldCycle(fromId, parentId) {
    if (!parentId) return false;
    if (parentId === fromId) return true;
    const seen = {};
    let walk = parentId;
    while (walk) {
      if (walk === fromId) return true;
      if (seen[walk]) return true;
      seen[walk] = true;
      const parent = workLayerById(walk);
      walk = parent && parent.parentId;
    }
    return false;
  }

  function isSamePlace(fromId, place) {
    if (!fromId || !place || place.invalid) return false;
    const layer = workLayerById(fromId);
    if (!layer) return false;
    const oldParent = layer.parentId || null;
    const nextParent = place.parentId || null;
    if (place.asChild && oldParent === nextParent) return true;
    if (oldParent !== nextParent) return false;
    const current = sortedSiblingIds(oldParent, null);
    const currentIndex = current.indexOf(fromId);
    const destList = sortedSiblingIds(nextParent, fromId);
    let insertAt = destList.length;
    if (!place.asChild && place.beforeId) {
      const idx = destList.indexOf(place.beforeId);
      if (idx >= 0) insertAt = idx;
    }
    return currentIndex === insertAt;
  }

  function rowIndentPx(row) {
    if (!row) return 8;
    const depth = Number(row.dataset.depth);
    if (Number.isFinite(depth) && depth >= 0) return 8 + depth * 16;
    const pad = parseFloat(row.style.paddingLeft);
    return Number.isFinite(pad) ? pad : 8;
  }

  function showDropHint(kind, row, label, indentPx) {
    const hint = document.getElementById("v3-work-drop-hint");
    const tree = document.getElementById("v3-work-tree");
    if (!hint || !tree || !row) return;
    const tr = tree.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    const labelEl = hint.querySelector(".v3-work-drop-hint-label");
    const lineEl = hint.querySelector(".v3-work-drop-hint-line");
    hint.hidden = false;
    hint.className = "v3-work-drop-hint is-" + kind;
    hint.dataset.kind = kind;
    if (labelEl) labelEl.textContent = label || "";
    if (kind === "child") {
      hint.style.top = (rr.top - tr.top - 2) + "px";
      hint.style.left = "0px";
      hint.style.right = "0px";
      hint.style.height = (rr.height + 18) + "px";
      hint.style.setProperty("--drop-indent", (indentPx || 24) + "px");
      if (lineEl) lineEl.style.display = "none";
      return;
    }
    if (kind === "before") hint.style.top = (rr.top - tr.top - 16) + "px";
    else hint.style.top = (rr.bottom - tr.top - 2) + "px";
    hint.style.left = (indentPx || 8) + "px";
    hint.style.right = "8px";
    hint.style.height = "22px";
    if (lineEl) lineEl.style.display = "block";
  }

  function autoScrollPopup(y) {
    const pop = document.getElementById("v3-cmd-pop");
    const body = pop && pop.querySelector(".v3-cmd-pop-body");
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const edge = 36;
    if (y < rect.top + edge) body.scrollTop -= 16;
    else if (y > rect.bottom - edge) body.scrollTop += 16;
  }

  function sortedSiblingIds(parentId, exceptId) {
    const wl = window.v3WorkLayers;
    const layers = (wl && wl.getState && wl.getState().workLayers) || [];
    const pid = parentId || null;
    return layers
      .filter((layer) => layer && layer.id !== exceptId && (layer.parentId || null) === pid)
      .slice()
      .sort((a, b) => {
        const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
        const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || "").localeCompare(String(b.name || ""), "ja");
      })
      .map((layer) => layer.id);
  }

  function dropTargetFromPoint(x, y) {
    const rootDrop = document.getElementById("v3-work-root-drop");
    if (rootDrop && rootDrop.classList.contains("is-armed")) {
      const rect = rootDrop.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { kind: "root" };
      }
    }
    const hit = document.elementFromPoint(x, y);
    const row = hit && hit.closest && hit.closest(".v3-work-row");
    if (!row || !row.dataset.layerId) return null;
    const rect = row.getBoundingClientRect();
    const t = rect.height ? (y - rect.top) / rect.height : 0.5;
    let zone = "child";
    if (t < 0.28) zone = "before";
    else if (t > 0.72) zone = "after";
    return { kind: "row", id: row.dataset.layerId, zone: zone, row: row };
  }

  function placementFromTarget(fromId, target) {
    if (!fromId || !target) return null;
    if (target.kind === "root") {
      return { parentId: null, beforeId: sortedSiblingIds(null, fromId)[0] || null, asChild: false };
    }
    if (target.id === fromId) return { invalid: "self" };
    if (target.zone === "child") {
      return { parentId: target.id, beforeId: null, asChild: true };
    }
    const wl = window.v3WorkLayers;
    const dest = ((wl && wl.getState && wl.getState().workLayers) || []).find((layer) => layer.id === target.id);
    if (!dest) return null;
    const parentId = dest.parentId || null;
    if (target.zone === "before") {
      return { parentId: parentId, beforeId: dest.id, asChild: false };
    }
    const ids = sortedSiblingIds(parentId, null);
    const idx = ids.indexOf(dest.id);
    let beforeId = null;
    for (let i = idx + 1; i < ids.length; i++) {
      if (ids[i] !== fromId) {
        beforeId = ids[i];
        break;
      }
    }
    return { parentId: parentId, beforeId: beforeId, asChild: false };
  }

  function markDropTarget(fromId, target) {
    clearDropMarks();
    const src = document.querySelector('.v3-work-row[data-layer-id="' + fromId + '"]');
    if (src) src.classList.add("is-dragging");
    if (layerDrag) layerDrag.preview = null;
    if (!target) return;
    const place = placementFromTarget(fromId, target);
    if (!place || place.invalid || wouldCycle(fromId, place.parentId) || isSamePlace(fromId, place)) {
      if (target.row && (place && place.invalid || wouldCycle(fromId, place && place.parentId))) {
        target.row.classList.add("is-drop-invalid");
        target.row.setAttribute("data-drop-caption", "移動できません");
      }
      return;
    }
    if (layerDrag) {
      layerDrag.preview = {
        kind: target.kind === "root" ? "root" : (place.asChild ? "child" : target.zone),
        parentId: place.parentId || null,
        beforeId: place.beforeId || null,
        asChild: !!place.asChild,
      };
    }
    if (target.kind === "root") {
      const rootDrop = document.getElementById("v3-work-root-drop");
      if (rootDrop) rootDrop.classList.add("is-drop");
      return;
    }
    if (!target.row) return;
    if (place.asChild) {
      const dest = workLayerById(target.id);
      const caption = (dest && dest.name ? dest.name : "レイヤー") + "の子に移動";
      target.row.classList.add("is-drop-child");
      target.row.setAttribute("data-drop-caption", "↳ " + caption);
      showDropHint("child", target.row, "↳ " + caption, rowIndentPx(target.row) + 16);
      return;
    }
    const kind = target.zone === "after" ? "after" : "before";
    const label = kind === "after" ? "後に移動" : "前に移動";
    target.row.classList.add(kind === "after" ? "is-drop-after" : "is-drop-before");
    target.row.setAttribute("data-drop-caption", label);
    showDropHint(kind, target.row, label, rowIndentPx(target.row));
  }

  function endLayerDrag(ev) {
    const drag = layerDrag;
    layerDrag = null;
    window.removeEventListener("pointermove", onLayerDragMove, true);
    window.removeEventListener("pointerup", onLayerDragUp, true);
    window.removeEventListener("pointercancel", onLayerDragUp, true);
    const active = !!(drag && drag.active);
    const fromId = drag && drag.id;
    const x = ev && typeof ev.clientX === "number" ? ev.clientX : (drag && drag.x);
    const y = ev && typeof ev.clientY === "number" ? ev.clientY : (drag && drag.y);
    const target = active ? dropTargetFromPoint(x, y) : null;
    armRootDrop(false);
    clearDropMarks();
    setUiDragging(false);
    if (!active || !fromId) return;
    const place = placementFromTarget(fromId, target);
    if (!place || place.invalid) return;
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.moveLayer !== "function") return;
    const result = wl.moveLayer(fromId, place.parentId, place.beforeId, { asChild: !!place.asChild });
    if (!result || !result.ok || !result.moved) return;
    if (place.asChild && place.parentId) collapsedWork[place.parentId] = false;
    commitWork("move work layer");
  }

  function onLayerDragMove(ev) {
    if (!layerDrag || (ev.pointerId != null && layerDrag.pointerId !== ev.pointerId)) return;
    ev.preventDefault();
    const x = ev.clientX;
    const y = ev.clientY;
    layerDrag.x = x;
    layerDrag.y = y;
    const dx = x - layerDrag.startX;
    const dy = y - layerDrag.startY;
    if (!layerDrag.active && (dx * dx + dy * dy) < 25) return;
    if (!layerDrag.active) {
      layerDrag.active = true;
      setUiDragging(true);
      armRootDrop(true);
    }
    autoScrollPopup(y);
    markDropTarget(layerDrag.id, dropTargetFromPoint(x, y));
  }

  function onLayerDragUp(ev) {
    if (!layerDrag || (ev.pointerId != null && layerDrag.pointerId !== ev.pointerId)) return;
    ev.preventDefault();
    ev.stopPropagation();
    endLayerDrag(ev);
  }

  function bindLayerDrag(handle, layerId) {
    handle.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (layerDrag) endLayerDrag(ev);
      layerDrag = {
        id: layerId,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        x: ev.clientX,
        y: ev.clientY,
        active: false,
      };
      try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
      setUiDragging(true);
      window.addEventListener("pointermove", onLayerDragMove, true);
      window.addEventListener("pointerup", onLayerDragUp, true);
      window.addEventListener("pointercancel", onLayerDragUp, true);
    }, { passive: false });
  }

  function destLayers() {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.getState !== "function") return [];
    const st = wl.getState();
    const byParent = {};
    (st.workLayers || []).forEach((layer) => {
      const key = layer.parentId || "";
      if (!byParent[key]) byParent[key] = [];
      byParent[key].push(layer);
    });
    Object.keys(byParent).forEach((key) => {
      byParent[key].sort((a, b) => {
        const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
        const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || "").localeCompare(String(b.name || ""), "ja");
      });
    });
    const rows = [];
    function walk(parentId, depth) {
      const kids = byParent[parentId || ""] || [];
      kids.forEach((layer) => {
        const view = typeof wl.layerView === "function" ? wl.layerView(layer.id) : null;
        rows.push({
          id: layer.id,
          name: layer.name,
          depth: depth,
          blocked: !!(view && (!view.effectiveVisible || view.effectiveLocked)),
        });
        walk(layer.id, depth + 1);
      });
    }
    walk(null, 0);
    return rows;
  }

  function fillMoveBar() {
    const bar = document.getElementById("v3-work-move");
    if (!bar) return;
    const wl = window.v3WorkLayers;
    bar.innerHTML = "";
    const rackIds = wl && typeof wl.selectedRackIds === "function" ? wl.selectedRackIds() : [];
    const choices = destLayers();
    if (!moveDestId || !choices.some((item) => item.id === moveDestId)) {
      moveDestId = (choices[0] && choices[0].id) || null;
    }
    const label = document.createElement("div");
    label.className = "v3-work-move-label";
    label.textContent = rackIds.length
      ? "選択中のラック " + rackIds.length + " 件"
      : "ラックを選択すると移動できます";
    const row = document.createElement("div");
    row.className = "v3-work-move-row";
    const select = document.createElement("select");
    select.className = "v3-work-move-dest";
    select.setAttribute("aria-label", "移動先レイヤー");
    choices.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = (item.depth ? "　".repeat(item.depth) : "") + item.name + (item.blocked ? "（移動不可）" : "");
      opt.disabled = !!item.blocked;
      if (item.id === moveDestId) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", function () {
      moveDestId = select.value;
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "v3-work-move-btn";
    btn.textContent = "ラックを移動";
    const dest = choices.find((item) => item.id === (select.value || moveDestId));
    btn.disabled = !rackIds.length || !dest || dest.blocked;
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (!wl || typeof wl.moveRacksToLayer !== "function") return;
      const destId = select.value || moveDestId;
      const result = wl.moveRacksToLayer(rackIds, destId);
      if (result && result.ok && result.moved > 0) commitWork("move racks");
      else fillMoveBar();
    });
    row.appendChild(select);
    row.appendChild(btn);
    bar.appendChild(label);
    bar.appendChild(row);
  }

  function closeWorkMenus(except) {
    document.querySelectorAll(".v3-work-menu").forEach((el) => {
      if (el !== except) el.hidden = true;
    });
    document.querySelectorAll(".v3-work-more").forEach((el) => {
      if (!except || el.nextElementSibling !== except) el.classList.remove("is-open");
    });
  }

  function layerDimState(layerId) {
    const wl = window.v3WorkLayers;
    const ids = wl && typeof wl.rackIdsInLayer === "function" ? wl.rackIdsInLayer(layerId) : [];
    if (!ids.length) return { state: "on", ids: ids };
    let on = 0;
    ids.forEach((rid) => {
      const vis = !(window.v3Measure && typeof window.v3Measure.isRackDimVisible === "function")
        || window.v3Measure.isRackDimVisible(rid);
      if (vis) on += 1;
    });
    if (on === ids.length) return { state: "on", ids: ids };
    if (on === 0) return { state: "off", ids: ids };
    return { state: "mix", ids: ids };
  }

  function toggleLayerDims(layerId) {
    const dim = layerDimState(layerId);
    if (!dim.ids.length) return;
    if (!window.v3Measure || typeof window.v3Measure.setRackVisible !== "function") return;
    const next = dim.state !== "on";
    dim.ids.forEach((rid) => window.v3Measure.setRackVisible(rid, next));
  }

  function menuItem(label, title, onClick, disabled) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "v3-work-menu-item";
    btn.textContent = label;
    btn.title = title || label;
    if (disabled) btn.disabled = true;
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      closeWorkMenus();
      if (!disabled) onClick();
    });
    return btn;
  }

  function removeWorkLayer(id, name, rackN, childN) {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.deleteLayer !== "function") return;
    if ((wl.getState().workLayers || []).length <= 1) return;
    const extra = [];
    if (rackN) extra.push("所属ラックは親またはメインへ移します");
    if (childN) extra.push("子レイヤーはひとつ上へ移します");
    const msg = "レイヤー「" + (name || "") + "」を削除しますか？" + (extra.length ? "\n" + extra.join("。") + "。" : "");
    if (!confirm(msg)) return;
    if (wl.deleteLayer(id)) commitWork("delete work layer");
  }

  function renderWork(host) {
    if (layerDrag && layerDrag.active) return;
    const body = host || document.getElementById("v3-work-tree");
    if (!body) return;
    const wl = window.v3WorkLayers;
    body.innerHTML = "";
    if (!wl || typeof wl.getState !== "function") {
      const note = document.createElement("p");
      note.className = "v3-cmd-pop-note";
      note.textContent = "作業レイヤーを読み込めません。";
      body.appendChild(note);
      return;
    }
    const st = wl.getState();
    const rows = workRows();
    const canDelete = (st.workLayers || []).length > 1;
    const rootDrop = document.createElement("div");
    rootDrop.id = "v3-work-root-drop";
    rootDrop.className = "v3-work-root-drop";
    rootDrop.innerHTML = '<span class="v3-work-root-drop-line"></span><span class="v3-work-root-drop-text">最上位に移動</span><span class="v3-work-root-drop-line"></span>';
    body.appendChild(rootDrop);
    rows.forEach((row) => {
      const layer = row.layer;
      const view = typeof wl.layerView === "function" ? wl.layerView(layer.id) : null;
      const ownOn = !view || view.ownVisible;
      const ownLock = !!(view && view.ownLocked);
      const inheritedHidden = !!(view && view.inheritedHidden);
      const inheritedLocked = !!(view && view.inheritedLocked);
      const rackN = typeof wl.rackCount === "function" ? wl.rackCount(layer.id) : 0;
      const childN = typeof wl.childrenOf === "function" ? wl.childrenOf(layer.id).length : 0;
      const el = document.createElement("div");
      el.className = "v3-work-row";
      el.dataset.layerId = layer.id;
      el.dataset.depth = String(row.depth);
      el.style.paddingLeft = (4 + row.depth * 14) + "px";
      if (st.activeLayerId === layer.id) el.classList.add("is-active");
      if (!ownOn) el.classList.add("is-off");
      else if (inheritedHidden) el.classList.add("is-inherited-off");
      if (ownLock) el.classList.add("is-locked");
      else if (inheritedLocked) el.classList.add("is-inherited-lock");

      const handle = document.createElement("span");
      handle.className = "v3-work-handle";
      handle.title = "ドラッグして並び替え";
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", layer.name + "を並び替え");
      handle.innerHTML = HANDLE_SVG;
      bindLayerDrag(handle, layer.id);
      el.appendChild(handle);

      const expandable = row.hasKids;
      const caret = document.createElement("button");
      caret.type = "button";
      caret.className = "v3-layer-caret";
      caret.textContent = expandable ? (collapsedWork[layer.id] ? "▸" : "▾") : "";
      caret.disabled = !expandable;
      caret.setAttribute("aria-label", layer.name + "を折りたたむ");
      caret.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!expandable) return;
        collapsedWork[layer.id] = !collapsedWork[layer.id];
        render();
      });
      el.appendChild(caret);

      if (renamingId === layer.id) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "v3-work-name-input";
        input.value = layer.name;
        input.maxLength = 80;
        input.addEventListener("click", function (ev) { ev.stopPropagation(); });
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            ev.preventDefault();
            finishRename(layer.id, input.value);
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            renamingId = null;
            render();
          }
        });
        input.addEventListener("blur", function () {
          if (renamingId === layer.id) finishRename(layer.id, input.value);
        });
        el.appendChild(input);
        setTimeout(function () {
          try { input.focus(); input.select(); } catch (e) {}
        }, 0);
      } else {
        const name = document.createElement("span");
        name.className = "v3-layer-name";
        name.textContent = layer.name;
        name.title = layer.name + " — クリックでアクティブ / ダブルクリックで名前変更";
        name.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (nameClickTimer) clearTimeout(nameClickTimer);
          nameClickTimer = setTimeout(function () {
            nameClickTimer = null;
            if (st.activeLayerId === layer.id) return;
            if (typeof wl.setActiveLayer === "function" && wl.setActiveLayer(layer.id)) {
              commitWork("set active work layer");
            }
          }, 250);
        });
        name.addEventListener("dblclick", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (nameClickTimer) {
            clearTimeout(nameClickTimer);
            nameClickTimer = null;
          }
          renamingId = layer.id;
          render();
        });
        el.appendChild(name);
      }

      const count = document.createElement("span");
      count.className = "v3-layer-count";
      count.title = "所属ラック数";
      count.textContent = String(rackN);
      el.appendChild(count);

      const eyeState = !ownOn ? "off" : (inheritedHidden ? "inherited" : "on");
      const eyeTitle = inheritedHidden
        ? layer.name + "は親から非表示（自身は表示）"
        : layer.name + (ownOn ? "を非表示" : "を表示");
      el.appendChild(eyeBtn(eyeState, eyeTitle, function () {
        if (typeof wl.setLayerVisible === "function") wl.setLayerVisible(layer.id, !ownOn);
        commitWork("toggle work layer visible");
      }));

      const lockState = ownLock ? "on" : (inheritedLocked ? "inherited" : "off");
      const lockTitle = inheritedLocked
        ? layer.name + "は親からロック（自身は解除）"
        : layer.name + (ownLock ? "のロックを解除" : "をロック");
      const lockBtn = iconBtn("v3-layer-lock", lockState, lockTitle, lockSvg(ownLock || inheritedLocked), function () {
        if (typeof wl.setLayerLocked === "function") wl.setLayerLocked(layer.id, !ownLock);
        commitWork("toggle work layer locked");
      });
      lockBtn.setAttribute("aria-pressed", ownLock ? "true" : "false");
      el.appendChild(lockBtn);

      const moreWrap = document.createElement("div");
      moreWrap.className = "v3-work-more-wrap";
      const menu = document.createElement("div");
      menu.className = "v3-work-menu";
      menu.hidden = true;
      const more = iconBtn("v3-work-more", "", layer.name + "のその他操作", "⋯", function () {
        const open = menu.hidden;
        closeWorkMenus(open ? menu : null);
        menu.hidden = !open;
        more.classList.toggle("is-open", !!open);
      });
      const dim = layerDimState(layer.id);
      const dimLabel = dim.state === "off"
        ? "寸法を表示"
        : (dim.state === "mix" ? "寸法をすべて表示" : "寸法を非表示");
      menu.appendChild(menuItem(dimLabel, layer.name + "に所属するラックの寸法表示", function () {
        toggleLayerDims(layer.id);
        render();
      }, rackN === 0));
      menu.appendChild(menuItem("下にレイヤー追加", layer.name + "の下に追加", function () {
        addWorkLayer(layer.id);
      }));
      menu.appendChild(menuItem("レイヤーを削除", layer.name + "を削除", function () {
        removeWorkLayer(layer.id, layer.name, rackN, childN);
      }, !canDelete));
      moreWrap.appendChild(more);
      moreWrap.appendChild(menu);
      el.appendChild(moreWrap);
      body.appendChild(el);
    });

    const hint = document.createElement("div");
    hint.id = "v3-work-drop-hint";
    hint.className = "v3-work-drop-hint";
    hint.hidden = true;
    hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = '<div class="v3-work-drop-hint-line"></div><div class="v3-work-drop-hint-label"></div>';
    body.appendChild(hint);

    const tools = document.createElement("div");
    tools.className = "v3-work-tools";
    const addRoot = document.createElement("button");
    addRoot.type = "button";
    addRoot.className = "v3-work-add-root";
    addRoot.textContent = "レイヤーを追加";
    addRoot.addEventListener("click", function (ev) {
      ev.preventDefault();
      addWorkLayer(null);
    });
    tools.appendChild(addRoot);
    body.appendChild(tools);
    const move = document.createElement("div");
    move.id = "v3-work-move";
    move.className = "v3-work-move";
    body.appendChild(move);
    fillMoveBar();
  }

  function renderParts(host) {
    const body = host || document.getElementById("v3-layer-body");
    if (!body) return;
    const vis = layers();
    body.innerHTML = "";
    GROUPS.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "v3-layer-group";
      const st = groupState(group, vis);
      wrap.classList.add("is-" + st);
      if (collapsedGroups[group.id]) wrap.classList.add("is-collapsed");

      const head = document.createElement("div");
      head.className = "v3-layer-group-head";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "v3-layer-caret";
      toggle.textContent = collapsedGroups[group.id] ? "▸" : "▾";
      toggle.setAttribute("aria-label", group.title + "を折りたたむ");
      const title = document.createElement("span");
      title.className = "v3-layer-name";
      title.textContent = group.title;
      title.title = group.title;
      const count = document.createElement("span");
      count.className = "v3-layer-count";
      const total = group.items.reduce((sum, item) => sum + partCount(item.id), 0);
      count.textContent = String(total);
      head.appendChild(toggle);
      head.appendChild(title);
      head.appendChild(count);
      const groupTitle = st === "mix" ? group.title + "（一部表示）" : group.title + (st === "on" ? "を非表示" : "を表示");
      head.appendChild(eyeBtn(st, groupTitle, function () {
        const now = groupState(group, layers());
        setGroup(group, now === "off");
      }));
      toggle.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        collapsedGroups[group.id] = !collapsedGroups[group.id];
        wrap.classList.toggle("is-collapsed", !!collapsedGroups[group.id]);
        toggle.textContent = collapsedGroups[group.id] ? "▸" : "▾";
      });

      const items = document.createElement("div");
      items.className = "v3-layer-items";
      group.items.forEach((item) => {
        const on = !!vis[item.id];
        const row = document.createElement("div");
        row.className = "v3-layer-item" + (on ? "" : " is-off");
        const indent = document.createElement("span");
        indent.className = "v3-layer-indent";
        indent.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.className = "v3-layer-name";
        name.textContent = item.label;
        name.title = item.label;
        const itemCount = document.createElement("span");
        itemCount.className = "v3-layer-count";
        itemCount.textContent = String(partCount(item.id));
        row.appendChild(indent);
        row.appendChild(name);
        row.appendChild(itemCount);
        row.appendChild(eyeBtn(on ? "on" : "off", item.label + (on ? "を非表示" : "を表示"), function () {
          const cur = layers();
          setVisible(item.id, !cur[item.id]);
        }));
        items.appendChild(row);
      });

      wrap.appendChild(head);
      wrap.appendChild(items);
      body.appendChild(wrap);
    });
  }

  function showTab() {
    const root = document.getElementById("v3-layer-root");
    if (!root) return;
    root.querySelectorAll(".v3-set-tab").forEach((btn) => {
      const on = btn.dataset.tab === activeTab;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const work = document.getElementById("v3-work-tree");
    const parts = document.getElementById("v3-layer-body");
    if (work) work.hidden = activeTab !== "work";
    if (parts) parts.hidden = activeTab !== "parts";
  }

  function render() {
    if (layerDrag && layerDrag.active) return;
    renderWork();
    renderParts();
    showTab();
  }

  function isHosted() {
    const root = document.getElementById("v3-layer-root");
    return !!(root && root.closest("#v3-east-rail"));
  }

  function isRailOpen() {
    return !!(window.v3EastRail && typeof window.v3EastRail.getOpenId === "function"
      && window.v3EastRail.getOpenId() === "layers");
  }

  function isPopupOpen() {
    if (isRailOpen()) return true;
    const ui = window.v3WorkspaceUi;
    return !!(ui && ui.getOpenPopupId && ui.getOpenPopupId() === "layers");
  }

  function ensureRoot(host) {
    if (!host) return null;
    let root = document.getElementById("v3-layer-root");
    if (root && root.parentElement !== host) {
      host.appendChild(root);
      return root;
    }
    if (root) return root;
    root = document.createElement("div");
    root.id = "v3-layer-root";
    const nav = document.createElement("div");
    nav.className = "v3-set-tabs";
    nav.setAttribute("role", "tablist");
    [
      { id: "work", label: "作業レイヤー" },
      { id: "parts", label: "部材レイヤー" },
    ].forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v3-set-tab";
      btn.setAttribute("role", "tab");
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        activeTab = tab.id;
        showTab();
      });
      nav.appendChild(btn);
    });
    const work = document.createElement("div");
    work.id = "v3-work-tree";
    work.className = "v3-set-panel";
    work.setAttribute("role", "tabpanel");
    const parts = document.createElement("div");
    parts.id = "v3-layer-body";
    parts.className = "v3-set-panel";
    parts.setAttribute("role", "tabpanel");
    root.appendChild(nav);
    root.appendChild(work);
    root.appendChild(parts);
    host.appendChild(root);
    return root;
  }

  function mount(host) {
    if (!host) return;
    ensureRoot(host);
    render();
  }

  function openPopup() {
    if (window.v3EastRail && typeof window.v3EastRail.open === "function") {
      window.v3EastRail.open("layers");
      return;
    }
    const ui = window.v3WorkspaceUi;
    if (!ui || typeof ui.openPopup !== "function") return;
    const anchor = document.getElementById("v3-cad-layers");
    ui.openPopup("layers", {
      title: "レイヤー",
      wide: true,
      hideApply: true,
      hideActions: true,
      skipFocus: true,
      anchor: anchor,
      render(body) {
        ensureRoot(body);
        render();
      },
    });
  }

  function toggle() {
    if (window.v3EastRail && typeof window.v3EastRail.toggle === "function") {
      window.v3EastRail.toggle("layers");
      return;
    }
    if (isPopupOpen()) {
      window.v3WorkspaceUi && window.v3WorkspaceUi.closePopup("cancel");
      return;
    }
    openPopup();
  }

  function setOpen(on) {
    if (window.v3EastRail) {
      if (on) window.v3EastRail.open("layers");
      else if (isRailOpen()) window.v3EastRail.close();
      return;
    }
    if (on) openPopup();
    else if (isPopupOpen()) window.v3WorkspaceUi && window.v3WorkspaceUi.closePopup("cancel");
  }

  function bind() {
    document.addEventListener("pointerdown", function (ev) {
      if (!(ev.target && ev.target.closest && ev.target.closest(".v3-work-more-wrap"))) {
        closeWorkMenus();
      }
      if (!isPopupOpen()) return;
      if (isHosted() || isRailOpen()) return;
      if (layerDrag) return;
      const pop = document.getElementById("v3-cmd-pop");
      const btn = document.getElementById("v3-cad-layers");
      if (pop && pop.contains(ev.target)) return;
      if (btn && (ev.target === btn || btn.contains(ev.target))) return;
      window.v3WorkspaceUi && window.v3WorkspaceUi.closePopup("cancel");
    }, true);
    window.addEventListener("v3-layout-reset", function () {
      if (isPopupOpen()) window.v3WorkspaceUi && window.v3WorkspaceUi.closePopup("cancel");
      applyVisibility();
      render();
    });
    const ops = window.v3CadOps;
    if (ops) {
      ["rebuildBoards", "loadHistory", "applySnapshotFromString", "addBeamConnection", "addPoleConnection", "createJoint", "setSelectedJoint"].forEach((name) => {
        ops.wrapFn(name, function () {
          applyVisibility();
          if (isPopupOpen()) render();
        });
      });
    }
    const ms = window.v3MultiSelect;
    if (ms && typeof ms.paint === "function" && !ms.paint.__v3LayerWrapped) {
      const orig = ms.paint;
      ms.paint = function () {
        const result = orig.apply(this, arguments);
        if (isPopupOpen() && !renamingId) fillMoveBar();
        return result;
      };
      ms.paint.__v3LayerWrapped = true;
    }
  }

  bind();
  applyVisibility();
  function previewDropAt(fromId, x, y) {
    const prevDrag = layerDrag;
    armRootDrop(true);
    layerDrag = { id: fromId, active: true, preview: null };
    const target = dropTargetFromPoint(x, y);
    markDropTarget(fromId, target);
    const hint = document.getElementById("v3-work-drop-hint");
    const root = document.getElementById("v3-work-root-drop");
    const row = target && target.row;
    const place = placementFromTarget(fromId, target);
    const labelEl = hint && hint.querySelector(".v3-work-drop-hint-label");
    const rootText = root && root.querySelector(".v3-work-root-drop-text");
    const result = {
      kind: target && target.kind,
      zone: target && target.zone,
      layerId: (target && target.id) || null,
      place: place,
      same: isSamePlace(fromId, place),
      cycle: !!(place && wouldCycle(fromId, place.parentId)),
      preview: (layerDrag && layerDrag.preview) || null,
      caption: row ? row.getAttribute("data-drop-caption") : null,
      rowClass: row ? row.className : "",
      hintKind: hint && !hint.hidden ? (hint.dataset.kind || null) : null,
      hintText: hint && !hint.hidden && labelEl ? labelEl.textContent : "",
      hintLeft: hint && !hint.hidden ? hint.style.left : "",
      rootActive: !!(root && root.classList.contains("is-drop")),
      rootText: rootText ? rootText.textContent : "",
    };
    layerDrag = prevDrag;
    return result;
  }

  window.v3LayerPanel = { applyVisibility, setVisible, setOpen, toggle, layers, render, mount, previewDropAt, isHosted };
})();
