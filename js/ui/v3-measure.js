// =========================================================
// V3 寸法測定
// - 2点ピック / 芯々・内々・外々 / ユーザーXYZ
// - CAD寸法線は Move 隙間表示と独立
// - 下書きはモード終了で破棄、保存分は JSON / Undo 対象
// =========================================================
(function () {
  "use strict";

  const POP_ID = "measure";
  const EPS = 0.51;
  const ALIGN = 0.99;
  const LINE_OFF = 56;
  const SLOT_GAP = 40;
  const FLOOR_GAP = 12;
  const TICK_MM = 10;
  const MAX_EXTRA = 4;
  const LABEL_SEP = 34;
  const KINDS = ["芯々", "内々", "外々"];
  const START_HL = 0x38bdf8;
  const END_HL = 0xf97316;
  const START_I = 0.9;
  const END_I = 0.95;

  let modeOn = false;
  let pickA = null;
  let pickB = null;
  let kind = "芯々";
  let userAxes = { X: true, Y: true, Z: true };
  let drafts = [];
  let saved = [];
  let globalVisible = true;
  let rackVisible = {};
  let seq = 1;
  let overlay = null;
  let labelHost = null;
  let labelMarks = [];
  let ticking = false;
  let lastVisualKey = "";
  let lastLayouts = [];
  let extraById = {};
  let extraResetKey = "";
  let hoverMesh = null;
  let hoverMat = null;
  let painted = [];
  let listCollapsed = false;
  let panelMinimized = false;

  function $(id) { return document.getElementById(id); }
  function ui() { return window.v3WorkspaceUi; }
  function T() { return window.THREE; }
  function axes() { return window.v3UserAxes; }
  function joints() { return window.joints || []; }
  function jointR() { return Number(window.jointRadius) || 10; }
  function jointYHalf() {
    if (typeof window.getVerticalJbHalfMm === "function") {
      const n = Number(window.getVerticalJbHalfMm());
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 9.1;
  }
  function connR() { return Number(window.connectorRadius) || 6.5; }

  function nid(prefix) {
    seq += 1;
    return (prefix || "dim") + "-" + Date.now().toString(36) + "-" + seq;
  }

  function vec(x, y, z) {
    const THREE = T();
    if (THREE) return new THREE.Vector3(x, y, z);
    return { x: x, y: y, z: z, clone: function () { return vec(this.x, this.y, this.z); } };
  }

  function comp(p, axis) {
    if (!p) return 0;
    if (axis === "x") return Number(p.x) || 0;
    if (axis === "y") return Number(p.y) || 0;
    if (axis === "z") return Number(p.z) || 0;
    return 0;
  }

  function setComp(p, axis, v) {
    if (!p) return;
    if (axis === "x") p.x = v;
    else if (axis === "y") p.y = v;
    else if (axis === "z") p.z = v;
  }

  function memberOf(kindName, index) {
    if (kindName === "leg") return (window.legs || [])[index] || null;
    const list = kindName === "pole" ? (window.poles || []) : (window.beams || []);
    return list[index] || null;
  }

  function topCapHeightMm() {
    if (typeof window.getTopCapHeightMm === "function") {
      const n = Number(window.getTopCapHeightMm());
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return 2.2;
  }

  function jointHasTopCap(jointIndex) {
    if (typeof jointIndex !== "number" || jointIndex < 0) return false;
    const js = joints();
    const j = js[jointIndex];
    if (!j) return false;
    const poles = window.poles || [];
    const eps = 1e-3;
    for (let i = 0; i < poles.length; i++) {
      const p = poles[i];
      if (!p || (p.a !== jointIndex && p.b !== jointIndex)) continue;
      const other = p.a === jointIndex ? p.b : p.a;
      const o = js[other];
      if (!o) continue;
      if (Math.abs((o.x || 0) - (j.x || 0)) < eps && Math.abs((o.z || 0) - (j.z || 0)) < eps && (o.y || 0) > (j.y || 0) + eps) {
        return false;
      }
    }
    return true;
  }

  function legBoundsOf(leg) {
    if (typeof window.getLegMeshBounds === "function") return window.getLegMeshBounds(leg);
    if (!leg) return null;
    const mesh = leg.mesh;
    const total = Number(window.LEG_TOTAL_HEIGHT) || 12.5;
    const r = Number(window.LEG_BASE_R) || 12.5;
    let x = 0;
    let y = 0;
    let z = 0;
    if (mesh && mesh.position) {
      x = Number(mesh.position.x) || 0;
      y = Number(mesh.position.y) || 0;
      z = Number(mesh.position.z) || 0;
    } else {
      return null;
    }
    const half = total / 2;
    return {
      minX: x - r, maxX: x + r,
      minY: y - half, maxY: y + half,
      minZ: z - r, maxZ: z + r,
      cx: x, cy: y, cz: z,
    };
  }

  function findById(list, id) {
    if (!id || !list) return -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return i;
    }
    return -1;
  }

  function resolveRef(ref) {
    if (!ref) return null;
    if (ref.kind === "joint") {
      let idx = -1;
      if (ref.id) {
        const js = joints();
        for (let i = 0; i < js.length; i++) {
          if (js[i] && js[i].id === ref.id) { idx = i; break; }
        }
      }
      if (idx < 0 && Number.isFinite(ref.index)) idx = ref.index;
      const j = joints()[idx];
      if (!j) return null;
      return {
        kind: "joint",
        index: idx,
        id: j.id || ref.id || null,
        rackId: j.rackId || null,
        point: vec(j.x, j.y, j.z),
        data: j,
      };
    }
    if (ref.kind === "beam" || ref.kind === "pole") {
      const list = ref.kind === "pole" ? (window.poles || []) : (window.beams || []);
      let idx = ref.id ? findById(list, ref.id) : -1;
      if (idx < 0 && Number.isFinite(ref.index)) idx = ref.index;
      const item = list[idx];
      if (!item) return null;
      const ja = joints()[item.a];
      const jb = joints()[item.b];
      if (!ja || !jb) return null;
      const t = Math.max(0, Math.min(1, Number(ref.t)));
      const pt = vec(
        ja.x + (jb.x - ja.x) * t,
        ja.y + (jb.y - ja.y) * t,
        ja.z + (jb.z - ja.z) * t
      );
      const rackId = ja.rackId || jb.rackId || null;
      return {
        kind: ref.kind,
        index: idx,
        id: item.id || ref.id || null,
        rackId: rackId,
        point: pt,
        t: t,
        data: item,
        a: ja,
        b: jb,
      };
    }
    if (ref.kind === "leg") {
      const list = window.legs || [];
      let idx = ref.id ? findById(list, ref.id) : -1;
      if (idx < 0 && Number.isFinite(ref.index)) idx = ref.index;
      const item = list[idx];
      if (!item) return null;
      const b = legBoundsOf(item);
      if (!b) return null;
      const jidx = typeof window.resolveLegJointIndex === "function"
        ? window.resolveLegJointIndex(item)
        : (typeof item.jointIndex === "number" ? item.jointIndex : -1);
      const j = joints()[jidx];
      return {
        kind: "leg",
        index: idx,
        id: item.id || ref.id || null,
        rackId: (j && j.rackId) || null,
        point: vec(b.cx, b.cy, b.cz),
        data: item,
        bounds: b,
        jointIndex: jidx,
      };
    }
    return null;
  }

  function captureRef(hit) {
    if (!hit || (hit.kind !== "joint" && hit.kind !== "beam" && hit.kind !== "pole" && hit.kind !== "leg")) return null;
    if (hit.kind === "joint") {
      const j = joints()[hit.index];
      if (!j) return null;
      return { kind: "joint", index: hit.index, id: j.id || null };
    }
    if (hit.kind === "leg") {
      const item = memberOf("leg", hit.index);
      if (!item) return null;
      return { kind: "leg", index: hit.index, id: item.id || null };
    }
    const item = memberOf(hit.kind, hit.index);
    if (!item) return null;
    const ja = joints()[item.a];
    const jb = joints()[item.b];
    if (!ja || !jb) return null;
    const p = hit.point || vec((ja.x + jb.x) / 2, (ja.y + jb.y) / 2, (ja.z + jb.z) / 2);
    const abx = jb.x - ja.x, aby = jb.y - ja.y, abz = jb.z - ja.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    let t = 0.5;
    if (len2 > 1e-8) {
      t = ((p.x - ja.x) * abx + (p.y - ja.y) * aby + (p.z - ja.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    return { kind: hit.kind, index: hit.index, id: item.id || null, t: t };
  }

  function memberAlign(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < EPS) return null;
    const nx = Math.abs(dx) / len, ny = Math.abs(dy) / len, nz = Math.abs(dz) / len;
    if (nx >= ALIGN) return "x";
    if (ny >= ALIGN) return "y";
    if (nz >= ALIGN) return "z";
    return null;
  }

  function memberTitle(kindName, hasCap) {
    if (kindName === "leg") return "LEG";
    if (kindName === "joint") return hasCap ? "JB+TopCap" : "JB";
    if (kindName === "beam") return "Beam";
    if (kindName === "pole") return "Pole";
    return kindName || "部材";
  }

  function describeExtent(live, threeAxis, side) {
    const hasCap = !!(live && live.kind === "joint" && threeAxis === "y" && side === "max" && jointHasTopCap(live.index));
    const member = memberTitle(live && live.kind, hasCap);
    if (live && live.kind === "leg" && threeAxis === "y") {
      return { member: member, plane: side === "min" ? "最下端（床接地面）" : "上端（JB接合側）" };
    }
    if (live && live.kind === "joint" && threeAxis === "y") {
      if (side === "max") return { member: member, plane: hasCap ? "最上面" : "外形上端" };
      return { member: "JB", plane: "外形下端" };
    }
    if (side === "center") return { member: member, plane: "中心" };
    return { member: member, plane: side === "min" ? "外形−側" : "外形＋側" };
  }

  function describeCenter(live) {
    return { member: memberTitle(live && live.kind, false), plane: "中心" };
  }

  function partExtent(live, threeAxis) {
    if (!live) return { ok: false, reason: "参照部材がありません" };
    if (live.kind === "leg") {
      const b = live.bounds || (live.data && legBoundsOf(live.data));
      if (!b) return { ok: false, reason: "LEGの形状が取れません" };
      if (threeAxis === "x") return { ok: true, min: b.minX, max: b.maxX, center: b.cx };
      if (threeAxis === "y") return { ok: true, min: b.minY, max: b.maxY, center: b.cy };
      if (threeAxis === "z") return { ok: true, min: b.minZ, max: b.maxZ, center: b.cz };
      return { ok: false, reason: "軸が不正です" };
    }
    if (live.kind === "joint") {
      const c = comp(live.point, threeAxis);
      const r = threeAxis === "y" ? jointYHalf() : jointR();
      let min = c - r;
      let max = c + r;
      if (threeAxis === "y" && jointHasTopCap(live.index)) max += topCapHeightMm();
      return { ok: true, min: min, max: max, center: c };
    }
    const aligned = memberAlign(live.a, live.b);
    if (!aligned) {
      return { ok: false, reason: "斜め部材のため内々・外々は芯々のみ使えます" };
    }
    if (aligned === threeAxis) {
      const c0 = comp(live.a, threeAxis);
      const c1 = comp(live.b, threeAxis);
      return { ok: true, min: Math.min(c0, c1), max: Math.max(c0, c1), center: (c0 + c1) / 2 };
    }
    const c = comp(live.point, threeAxis);
    const r = connR();
    return { ok: true, min: c - r, max: c + r, center: c };
  }

  function axisValue(kindName, liveA, liveB, threeAxis) {
    const ca = comp(liveA.point, threeAxis);
    const cb = comp(liveB.point, threeAxis);
    const center = Math.abs(cb - ca);
    if (kindName === "芯々") {
      return {
        ok: true,
        mm: center,
        a: ca,
        b: cb,
        startFace: describeCenter(liveA),
        endFace: describeCenter(liveB),
      };
    }
    // 外々: 全体 min/max（Y は製品 JB 半高 9.1 + LEG 床 22.0 + TopCap 2.2）
    // 内々: 向かい合う外形面。Y は 9.1、水平は CAD 球半径 10。
    const ea = partExtent(liveA, threeAxis);
    const eb = partExtent(liveB, threeAxis);
    if (!ea.ok) return { ok: false, reason: ea.reason };
    if (!eb.ok) return { ok: false, reason: eb.reason };
    const leftLive = ea.max < eb.min ? liveA : (eb.max < ea.min ? liveB : null);
    const rightLive = leftLive === liveA ? liveB : (leftLive === liveB ? liveA : null);
    const left = leftLive === liveA ? ea : (leftLive === liveB ? eb : null);
    const right = rightLive === liveA ? ea : (rightLive === liveB ? eb : null);
    const lo = Math.min(ea.min, eb.min);
    const hi = Math.max(ea.max, eb.max);
    const startLive = ea.min <= eb.min ? liveA : liveB;
    const endLive = ea.max >= eb.max ? liveA : liveB;
    if (kindName === "外々") {
      return {
        ok: true,
        mm: hi - lo,
        a: lo,
        b: hi,
        startFace: describeExtent(startLive, threeAxis, "min"),
        endFace: describeExtent(endLive, threeAxis, "max"),
      };
    }
    if (!left || !right) {
      return { ok: false, reason: "部材が重なっているため内々は一意に決まりません" };
    }
    return {
      ok: true,
      mm: right.min - left.max,
      a: left.max,
      b: right.min,
      startFace: describeExtent(leftLive, threeAxis, "max"),
      endFace: describeExtent(rightLive, threeAxis, "min"),
    };
  }

  function rackIdsOf(liveA, liveB) {
    const ids = [];
    function add(id) {
      if (typeof id === "string" && id && ids.indexOf(id) < 0) ids.push(id);
    }
    add(liveA && liveA.rackId);
    add(liveB && liveB.rackId);
    return ids;
  }

  function layerVisible(rackId) {
    const wl = window.v3WorkLayers;
    if (!wl || typeof wl.isRackVisible !== "function") return true;
    if (!rackId) return true;
    return wl.isRackVisible(rackId);
  }

  function dimVisible(dim) {
    if (!dim || dim.invalid) return false;
    if (!globalVisible) return false;
    if (dim.visible === false) return false;
    const racks = dim.rackIds || [];
    if (!racks.length) return true;
    return racks.some(function (rid) {
      return rackVisible[rid] !== false && layerVisible(rid);
    });
  }

  function serializeRef(ref) {
    if (!ref) return null;
    const out = { kind: ref.kind };
    if (ref.id) out.id = ref.id;
    if (Number.isFinite(ref.index)) out.index = ref.index;
    if (Number.isFinite(ref.t)) out.t = ref.t;
    return out;
  }

  function axisStyle(axis) {
    const ua = axes();
    if (ua && typeof ua.info === "function") return ua.info(axis);
    return null;
  }

  function makeDim(kindName, threeAxis, refA, refB, savedFlag) {
    const liveA = resolveRef(refA);
    const liveB = resolveRef(refB);
    const style = axisStyle(threeAxis);
    const user = style ? style.user : (axes() && axes().userOfThree(threeAxis));
    const dim = {
      id: nid("dim"),
      saved: !!savedFlag,
      kind: kindName,
      threeAxis: threeAxis,
      userAxis: user || String(threeAxis).toUpperCase(),
      refA: serializeRef(refA),
      refB: serializeRef(refB),
      rackIds: rackIdsOf(liveA, liveB),
      visible: true,
      invalid: false,
      reason: null,
      mm: null,
    };
    if (!liveA || !liveB) {
      dim.invalid = true;
      dim.reason = "参照部材が見つかりません";
      return dim;
    }
    const val = axisValue(kindName, liveA, liveB, threeAxis);
    if (!val.ok) {
      dim.invalid = true;
      dim.reason = val.reason;
      return dim;
    }
    dim.mm = val.mm;
    dim.startFace = val.startFace || null;
    dim.endFace = val.endFace || null;
    return dim;
  }

  function refreshDim(dim) {
    if (!dim) return dim;
    const style = axisStyle(dim.threeAxis);
    if (style) dim.userAxis = style.user;
    const liveA = resolveRef(dim.refA);
    const liveB = resolveRef(dim.refB);
    dim.rackIds = rackIdsOf(liveA, liveB);
    if (!liveA || !liveB) {
      dim.invalid = true;
      dim.reason = "参照部材が見つかりません";
      dim.mm = null;
      dim.startFace = null;
      dim.endFace = null;
      return dim;
    }
    const val = axisValue(dim.kind, liveA, liveB, dim.threeAxis);
    if (!val.ok) {
      dim.invalid = true;
      dim.reason = val.reason;
      dim.mm = null;
      dim.startFace = null;
      dim.endFace = null;
      return dim;
    }
    dim.invalid = false;
    dim.reason = null;
    dim.mm = val.mm;
    dim.startFace = val.startFace || null;
    dim.endFace = val.endFace || null;
    return dim;
  }

  function allDims() {
    return drafts.concat(saved);
  }

  function selectedAxesThree() {
    const ua = axes();
    const out = [];
    ["X", "Y", "Z"].forEach(function (u) {
      if (!userAxes[u]) return;
      out.push(ua ? ua.threeOfUser(u) : u.toLowerCase());
    });
    return out.filter(Boolean);
  }

  function createDraftsFromPicks() {
    if (!pickA || !pickB) return;
    drafts = [];
    selectedAxesThree().forEach(function (threeAxis) {
      drafts.push(makeDim(kind, threeAxis, pickA, pickB, false));
    });
  }

  function snapshotFields() {
    return {
      measures: saved.map(function (d) {
        return {
          id: d.id,
          kind: d.kind,
          threeAxis: d.threeAxis,
          userAxis: d.userAxis,
          refA: serializeRef(d.refA),
          refB: serializeRef(d.refB),
          rackIds: (d.rackIds || []).slice(),
          visible: d.visible !== false,
        };
      }),
      measureUi: {
        globalVisible: globalVisible !== false,
        rackVisible: Object.assign({}, rackVisible),
      },
    };
  }

  function loadFromSnapshot(data) {
    drafts = [];
    pickA = null;
    pickB = null;
    clearHover();
    clearPickHighlight();
    const list = (data && Array.isArray(data.measures)) ? data.measures : [];
    saved = list.map(function (raw) {
      const dim = {
        id: raw.id || nid("dim"),
        saved: true,
        kind: KINDS.indexOf(raw.kind) >= 0 ? raw.kind : "芯々",
        threeAxis: raw.threeAxis || "x",
        userAxis: (axisStyle(raw.threeAxis || "x") || {}).user || raw.userAxis || "X",
        refA: serializeRef(raw.refA),
        refB: serializeRef(raw.refB),
        rackIds: Array.isArray(raw.rackIds) ? raw.rackIds.slice() : [],
        visible: raw.visible !== false,
        invalid: false,
        reason: null,
        mm: null,
      };
      return refreshDim(dim);
    });
    const uiState = data && data.measureUi;
    globalVisible = !(uiState && uiState.globalVisible === false);
    rackVisible = (uiState && uiState.rackVisible && typeof uiState.rackVisible === "object")
      ? Object.assign({}, uiState.rackVisible)
      : {};
    refreshVisuals(true);
    refreshPanel();
    ensureTick();
  }

  function saveDrafts() {
    if (!drafts.length) return false;
    const keep = drafts.filter(function (d) { return d && !d.invalid; });
    if (!keep.length) return false;
    keep.forEach(function (d) {
      d.saved = true;
      d.id = d.id || nid("dim");
      saved.push(d);
    });
    drafts = [];
    pickA = null;
    pickB = null;
    refreshPickHighlight();
    if (typeof window.saveHistory === "function") window.saveHistory("save measures");
    refreshVisuals(true);
    refreshPanel();
    try { window.v3LayerPanel && window.v3LayerPanel.render && window.v3LayerPanel.render(); } catch (e) {}
    return true;
  }

  function removeDim(id) {
    const before = saved.length;
    saved = saved.filter(function (d) { return d.id !== id; });
    drafts = drafts.filter(function (d) { return d.id !== id; });
    if (saved.length !== before && typeof window.saveHistory === "function") {
      window.saveHistory("delete measure");
    }
    refreshVisuals(true);
    refreshPanel();
    try { window.v3LayerPanel && window.v3LayerPanel.render && window.v3LayerPanel.render(); } catch (e) {}
  }

  function setRackVisible(rackId, on) {
    if (!rackId) return;
    rackVisible[rackId] = !!on;
    if (typeof window.saveHistory === "function") window.saveHistory("measure rack visibility");
    refreshVisuals(true);
    refreshPanel();
  }

  function isRackDimVisible(rackId) {
    return rackVisible[rackId] !== false;
  }

  function setGlobalVisible(on) {
    globalVisible = !!on;
    if (typeof window.saveHistory === "function") window.saveHistory("measure global visibility");
    refreshVisuals(true);
    refreshPanel();
  }

  function disposeOverlay() {
    if (!overlay) return;
    overlay.traverse(function (obj) {
      if (obj.geometry && obj.geometry.dispose) {
        try { obj.geometry.dispose(); } catch (e) {}
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (mat) {
          if (mat.dispose) {
            try { mat.dispose(); } catch (e2) {}
          }
        });
      }
    });
    if (overlay.parent) overlay.parent.remove(overlay);
    overlay = null;
  }

  function ensureLabelHost() {
    const view = window.viewEl || document.getElementById("view");
    if (!view) return null;
    if (labelHost && labelHost.parentNode === view) return labelHost;
    if (labelHost && labelHost.parentNode) labelHost.parentNode.removeChild(labelHost);
    labelHost = document.createElement("div");
    labelHost.id = "v3-measure-labels";
    labelHost.setAttribute("aria-hidden", "true");
    view.appendChild(labelHost);
    return labelHost;
  }

  function clearVisuals() {
    disposeOverlay();
    labelMarks = [];
    lastLayouts = [];
    lastVisualKey = "";
    if (labelHost) labelHost.innerHTML = "";
  }

  function pt(x, y, z) {
    return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
  }

  function clonePt(p) {
    return pt(p && p.x, p && p.y, p && p.z);
  }

  function asV3(p) {
    const THREE = T();
    if (!THREE || !p) return p || null;
    if (p.isVector3) return p;
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  function emptyAabb() {
    return {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    };
  }

  function expandAabb(box, p) {
    if (!box || !p) return;
    const x = Number(p.x) || 0;
    const y = Number(p.y) || 0;
    const z = Number(p.z) || 0;
    box.minX = Math.min(box.minX, x);
    box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y);
    box.maxY = Math.max(box.maxY, y);
    box.minZ = Math.min(box.minZ, z);
    box.maxZ = Math.max(box.maxZ, z);
  }

  function finalizeAabb(box) {
    if (!box || !Number.isFinite(box.minX)) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    }
    return box;
  }

  function expandLiveBounds(box, live) {
    if (!live) return;
    if (live.kind === "leg" && live.bounds) {
      expandAabb(box, { x: live.bounds.minX, y: live.bounds.minY, z: live.bounds.minZ });
      expandAabb(box, { x: live.bounds.maxX, y: live.bounds.maxY, z: live.bounds.maxZ });
      return;
    }
    if (live.point) expandAabb(box, live.point);
  }

  function dimAabb(liveA, liveB, rackIds) {
    const box = emptyAabb();
    expandLiveBounds(box, liveA);
    expandLiveBounds(box, liveB);
    const want = {};
    (rackIds || []).forEach(function (id) { if (id) want[id] = true; });
    if (Object.keys(want).length) {
      joints().forEach(function (j) {
        if (j && want[j.rackId]) expandAabb(box, j);
      });
    }
    return finalizeAabb(box);
  }

  function isParallelToThreeAxis(p0, p1, threeAxis, eps) {
    if (!p0 || !p1) return false;
    const tol = eps == null ? EPS : eps;
    const dx = (Number(p1.x) || 0) - (Number(p0.x) || 0);
    const dy = (Number(p1.y) || 0) - (Number(p0.y) || 0);
    const dz = (Number(p1.z) || 0) - (Number(p0.z) || 0);
    if (threeAxis === "x") return Math.abs(dy) <= tol && Math.abs(dz) <= tol;
    if (threeAxis === "y") return Math.abs(dx) <= tol && Math.abs(dz) <= tol;
    if (threeAxis === "z") return Math.abs(dx) <= tol && Math.abs(dy) <= tol;
    return false;
  }

  function isOrthoSegment(p0, p1, eps) {
    if (!p0 || !p1) return false;
    const tol = eps == null ? EPS : eps;
    const ax = Math.abs((Number(p1.x) || 0) - (Number(p0.x) || 0)) > tol;
    const ay = Math.abs((Number(p1.y) || 0) - (Number(p0.y) || 0)) > tol;
    const az = Math.abs((Number(p1.z) || 0) - (Number(p0.z) || 0)) > tol;
    return (ax ? 1 : 0) + (ay ? 1 : 0) + (az ? 1 : 0) <= 1;
  }

  function pathIsOrtho(pts, eps) {
    if (!pts || pts.length < 2) return true;
    for (let i = 1; i < pts.length; i++) {
      if (!isOrthoSegment(pts[i - 1], pts[i], eps)) return false;
    }
    return true;
  }

  function manhattanPath(from, to, order) {
    const start = clonePt(from);
    const end = clonePt(to);
    const pts = [start];
    let cur = clonePt(start);
    const axesOrder = order && order.length ? order : ["x", "y", "z"];
    axesOrder.forEach(function (axis) {
      const next = clonePt(cur);
      setComp(next, axis, comp(end, axis));
      if (Math.hypot(next.x - cur.x, next.y - cur.y, next.z - cur.z) >= 0.5) {
        pts.push(next);
        cur = next;
      }
    });
    if (Math.hypot(cur.x - end.x, cur.y - end.y, cur.z - end.z) >= 0.5) {
      pts.push(end);
    }
    return pts;
  }

  function helperOrder(threeAxis) {
    if (threeAxis === "x") return ["x", "z", "y"];
    if (threeAxis === "z") return ["z", "x", "y"];
    return ["y", "x", "z"];
  }

  function addLine(parent, pts, color, opacity) {
    const THREE = T();
    if (!THREE) return;
    const world = (pts || []).map(asV3).filter(Boolean);
    if (world.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(world);
    const mat = new THREE.LineBasicMaterial({
      color: color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: opacity == null ? 0.94 : opacity,
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 990;
    line.raycast = function () {};
    parent.add(line);
  }

  function addPath(parent, pts, color, opacity) {
    if (!pts || pts.length < 2) return;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 0.5) continue;
      addLine(parent, [a, b], color, opacity);
    }
  }

  function addTick(parent, at, threeAxis, color) {
    if (!at) return;
    const t = TICK_MM;
    let a;
    let b;
    if (threeAxis === "x") {
      a = pt(at.x, at.y - t, at.z);
      b = pt(at.x, at.y + t, at.z);
    } else if (threeAxis === "z") {
      a = pt(at.x, at.y - t, at.z);
      b = pt(at.x, at.y + t, at.z);
    } else {
      a = pt(at.x - t, at.y, at.z);
      b = pt(at.x + t, at.y, at.z);
    }
    addLine(parent, [a, b], color, 0.9);
  }

  function layoutLine(liveA, liveB, threeAxis, mm, kindName, slot, aabbHint) {
    if (!liveA || !liveB || !liveA.point || !liveB.point) return null;
    const p0 = clonePt(liveA.point);
    const p1 = clonePt(liveB.point);
    const val = axisValue(kindName, liveA, liveB, threeAxis);
    let v0 = comp(p0, threeAxis);
    let v1 = comp(p1, threeAxis);
    if (val && val.ok && Number.isFinite(val.a) && Number.isFinite(val.b)) {
      v0 = val.a;
      v1 = val.b;
    }
    const box = aabbHint || dimAabb(liveA, liveB, rackIdsOf(liveA, liveB));
    const off = LINE_OFF + Math.max(0, slot || 0) * SLOT_GAP;
    let d0;
    let d1;
    if (threeAxis === "x") {
      const zOut = box.maxZ + off;
      const yOut = box.minY - FLOOR_GAP;
      d0 = pt(v0, yOut, zOut);
      d1 = pt(v1, yOut, zOut);
    } else if (threeAxis === "z") {
      const xOut = box.maxX + off;
      const yOut = box.minY - FLOOR_GAP;
      d0 = pt(xOut, yOut, v0);
      d1 = pt(xOut, yOut, v1);
    } else {
      const xOut = box.maxX + off;
      const zOut = box.maxZ + off;
      d0 = pt(xOut, v0, zOut);
      d1 = pt(xOut, v1, zOut);
    }
    const order = helperOrder(threeAxis);
    const path0 = manhattanPath(p0, d0, order);
    const path1 = manhattanPath(p1, d1, order);
    const mid = pt((d0.x + d1.x) / 2, (d0.y + d1.y) / 2, (d0.z + d1.z) / 2);
    const style = axisStyle(threeAxis);
    return {
      m0: p0,
      m1: p1,
      d0: d0,
      d1: d1,
      mid: mid,
      path0: path0,
      path1: path1,
      color: style ? style.color : 0x94a3b8,
      css: style ? style.css : "#94a3b8",
      user: style ? style.user : (axes() && axes().labelOfThree(threeAxis)) || String(threeAxis).toUpperCase(),
      three: threeAxis,
      meaning: style ? style.meaning : "",
      mm: mm,
      parallel: isParallelToThreeAxis(d0, d1, threeAxis),
      ortho: pathIsOrtho(path0) && pathIsOrtho(path1) && isParallelToThreeAxis(d0, d1, threeAxis),
    };
  }

  function drawDim(parent, layout) {
    const THREE = T();
    if (!THREE || !layout) return;
    addPath(parent, layout.path0, layout.color, 0.45);
    addPath(parent, layout.path1, layout.color, 0.45);
    const d0 = layout.d0;
    const d1 = layout.d1;
    if (d0 && d1 && Math.hypot(d1.x - d0.x, d1.y - d0.y, d1.z - d0.z) >= 0.5) {
      addLine(parent, [d0, d1], layout.color, 0.96);
      addTick(parent, d0, layout.three, layout.color);
      addTick(parent, d1, layout.three, layout.color);
    }
  }

  function projectMid(item) {
    const ops = window.v3CadOps;
    const mid = asV3(item && item.mid);
    if (!ops || !ops.worldToScreen || !mid) return null;
    return ops.worldToScreen(mid);
  }

  function findLabelOverlap(screens) {
    for (let i = 0; i < screens.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = screens[i];
        const b = screens[j];
        if (!a || !b) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < LABEL_SEP) {
          return { i: i, j: j };
        }
      }
    }
    return null;
  }

  function placeLabels(layouts) {
    const host = ensureLabelHost();
    if (!host) return;
    if (labelMarks.length !== layouts.length) {
      host.innerHTML = "";
      labelMarks = layouts.map(function () {
        const el = document.createElement("div");
        el.className = "v3-measure-tag";
        host.appendChild(el);
        return el;
      });
    }
    const hostRect = host.getBoundingClientRect();
    const screens = layouts.map(projectMid);
    const overlap = findLabelOverlap(screens);
    if (overlap) {
      const prefer = layouts[overlap.i] && layouts[overlap.i].id
        ? layouts[overlap.i]
        : layouts[overlap.j];
      if (prefer && prefer.id) {
        const cur = extraById[prefer.id] || 0;
        if (cur < MAX_EXTRA) {
          extraById[prefer.id] = cur + 1;
          lastVisualKey = "";
        }
      }
    }
    layouts.forEach(function (item, i) {
      const el = labelMarks[i];
      if (!el) return;
      const caption = Math.round(item.mm) + " mm|" + (item.user || "") + "|" + (item.css || "");
      if (el.getAttribute("data-caption") !== caption) {
        el.innerHTML = '<span class="v3-measure-mm">' + Math.round(item.mm) + " mm</span>"
          + '<span class="v3-measure-ax" style="background:' + item.css + '">' + item.user + "</span>";
        el.setAttribute("data-caption", caption);
        el.setAttribute("data-user-axis", item.user || "");
        el.setAttribute("data-three-axis", item.three || "");
        el.style.borderColor = item.css || "#334155";
      }
      const scr = screens[i];
      if (!scr) {
        el.style.display = "none";
        return;
      }
      el.style.display = "flex";
      el.style.left = Math.round(scr.x - hostRect.left) + "px";
      el.style.top = Math.round(scr.y - hostRect.top) + "px";
    });
  }

  function livePosKey(dim) {
    const a = resolveRef(dim && dim.refA);
    const b = resolveRef(dim && dim.refB);
    function k(live) {
      if (!live || !live.point) return "x";
      return [
        Math.round(live.point.x),
        Math.round(live.point.y),
        Math.round(live.point.z),
      ].join(",");
    }
    return k(a) + "/" + k(b);
  }

  function refreshVisuals(force) {
    allDims().forEach(refreshDim);
    const vis = allDims().filter(dimVisible);
    const baseKey = vis.map(function (d) {
      return [d.id, d.kind, d.threeAxis, d.invalid ? "x" : Math.round(d.mm || 0), (d.rackIds || []).join(","), livePosKey(d)].join(":");
    }).join("|") + "|" + (globalVisible ? "1" : "0");
    if (baseKey !== extraResetKey) {
      extraById = {};
      extraResetKey = baseKey;
    }
    const extraKey = vis.map(function (d) { return extraById[d.id] || 0; }).join(",");
    const key = baseKey + "|e" + extraKey;
    const THREE = T();
    const scene = window.scene;
    if (!THREE || !scene) return;
    if (!vis.length) {
      clearVisuals();
      return;
    }
    if (!force && key === lastVisualKey && overlay && lastLayouts.length) {
      placeLabels(lastLayouts);
      return;
    }
    lastVisualKey = key;
    disposeOverlay();
    overlay = new THREE.Group();
    overlay.name = "v3MeasureOverlay";
    overlay.renderOrder = 990;
    const aabb = emptyAabb();
    const lives = vis.map(function (dim) {
      const liveA = resolveRef(dim.refA);
      const liveB = resolveRef(dim.refB);
      if (liveA && liveA.point) expandAabb(aabb, liveA.point);
      if (liveB && liveB.point) expandAabb(aabb, liveB.point);
      (dim.rackIds || []).forEach(function (id) {
        joints().forEach(function (j) {
          if (j && j.rackId === id) expandAabb(aabb, j);
        });
      });
      return { dim: dim, liveA: liveA, liveB: liveB };
    });
    const box = finalizeAabb(aabb);
    const slots = { x: 0, y: 0, z: 0 };
    const layouts = [];
    lives.forEach(function (item) {
      if (!item.liveA || !item.liveB) return;
      const axis = item.dim.threeAxis;
      const base = slots[axis] || 0;
      slots[axis] = base + 1;
      const slot = base + (extraById[item.dim.id] || 0);
      const layout = layoutLine(item.liveA, item.liveB, axis, item.dim.mm, item.dim.kind, slot, box);
      if (!layout) return;
      layout.id = item.dim.id;
      drawDim(overlay, layout);
      layouts.push(layout);
    });
    scene.add(overlay);
    lastLayouts = layouts;
    placeLabels(layouts);
  }

  function tick() {
    ticking = false;
    refreshVisuals(false);
    if (modeOn || saved.length || drafts.length) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }

  function ensureTick() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  }

  function firstMat(mesh) {
    if (!mesh) return null;
    return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  }

  function notePool() {
    try {
      if (!window.v3InstancePool) return;
      if (typeof window.v3InstancePool.note === "function") window.v3InstancePool.note();
      if (typeof window.v3InstancePool.sync === "function") window.v3InstancePool.sync(true);
    } catch (e) {}
  }

  function pushUniqueMesh(out, mesh) {
    if (!mesh || out.indexOf(mesh) >= 0) return;
    out.push(mesh);
  }

  function meshesOfRef(ref) {
    const live = resolveRef(ref);
    if (!live) return [];
    const out = [];
    if (live.kind === "leg") {
      const group = live.data && live.data.mesh;
      if (group) {
        const ud = group.userData || {};
        pushUniqueMesh(out, ud.v3LegBase);
        pushUniqueMesh(out, ud.v3LegCone);
        if (!out.length) {
          if (group.isMesh) pushUniqueMesh(out, group);
          if (typeof group.traverse === "function") {
            group.traverse(function (child) {
              if (child && child.isMesh) pushUniqueMesh(out, child);
            });
          }
        }
      }
      return out;
    }
    if (live.kind === "joint") {
      pushUniqueMesh(out, (window.jointMeshes || [])[live.index]);
      return out;
    }
    if (live.data && live.data.mesh) pushUniqueMesh(out, live.data.mesh);
    return out;
  }

  function isPaintedMesh(mesh) {
    for (let i = 0; i < painted.length; i++) {
      if (painted[i].mesh === mesh) return true;
    }
    return false;
  }

  function sameRef(a, b) {
    return !!(a && b && a.kind === b.kind && a.index === b.index);
  }

  function restorePaintedItem(item) {
    if (!item || !item.mesh) return;
    const mat = firstMat(item.mesh);
    if (mat && mat.emissive) {
      mat.emissive.setHex(item.e);
      if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = item.i;
      mat.needsUpdate = true;
    }
    if (item.mesh.userData) {
      if (typeof item.hadHL === "number") item.mesh.userData._v3MeasHL = item.hadHL;
      else delete item.mesh.userData._v3MeasHL;
    }
  }

  function clearPickHighlight() {
    if (!painted.length) {
      notePool();
      return;
    }
    painted.forEach(restorePaintedItem);
    painted = [];
    notePool();
  }

  function paintMeshes(meshes, hex, intensity) {
    (meshes || []).forEach(function (mesh) {
      if (!mesh) return;
      const mat = firstMat(mesh);
      painted.push({
        mesh: mesh,
        e: mat && mat.emissive && typeof mat.emissive.getHex === "function" ? mat.emissive.getHex() : 0,
        i: mat && typeof mat.emissiveIntensity === "number" ? mat.emissiveIntensity : 0,
        hadHL: mesh.userData && typeof mesh.userData._v3MeasHL === "number" ? mesh.userData._v3MeasHL : undefined,
      });
      if (mat && mat.emissive && typeof mat.emissive.setHex === "function") {
        mat.emissive.setHex(hex);
        if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = intensity;
        mat.needsUpdate = true;
      }
      if (!mesh.userData) mesh.userData = {};
      mesh.userData._v3MeasHL = hex;
    });
  }

  function refreshPickHighlight() {
    clearHover();
    clearPickHighlight();
    if (pickA) paintMeshes(meshesOfRef(pickA), START_HL, START_I);
    if (pickB) paintMeshes(meshesOfRef(pickB), END_HL, END_I);
    notePool();
  }

  function resetPicks() {
    pickA = null;
    pickB = null;
    drafts = [];
    clearHover();
    clearPickHighlight();
  }

  function clearHover() {
    if (hoverMesh && hoverMat && hoverMat.emissive) {
      hoverMat.emissive.setHex(hoverMat.userData._v3MeasE || 0);
      hoverMat.emissiveIntensity = hoverMat.userData._v3MeasI || 0;
    }
    hoverMesh = null;
    hoverMat = null;
    notePool();
  }

  function setHover(mesh) {
    if (!mesh || isPaintedMesh(mesh)) {
      if (hoverMesh) clearHover();
      return;
    }
    if (hoverMesh === mesh) return;
    clearHover();
    const mat = firstMat(mesh);
    if (!mat || !mat.emissive) return;
    mat.userData._v3MeasE = mat.emissive.getHex();
    mat.userData._v3MeasI = mat.emissiveIntensity || 0;
    mat.emissive.setHex(START_HL);
    mat.emissiveIntensity = 0.45;
    hoverMesh = mesh;
    hoverMat = mat;
    notePool();
  }

  function isOpen() {
    const host = ui();
    return !!(host && host.getOpenPopupId && host.getOpenPopupId() === POP_ID);
  }

  function refCaption(ref) {
    if (!ref) return "";
    if (ref.kind === "leg") return "LEG";
    if (ref.kind === "joint") return jointHasTopCap(ref.index) ? "JB（TopCapあり）" : "JB";
    if (ref.kind === "beam") return "Beam";
    if (ref.kind === "pole") return "Pole";
    return ref.kind;
  }

  function faceCaption(start, end) {
    if (!start || !end) return "";
    return start.member + " " + start.plane + " → " + end.member + " " + end.plane;
  }

  function dimRow(dim, listEl) {
    const row = document.createElement("div");
    row.className = "v3-meas-item" + (dim.invalid ? " is-invalid" : "") + (dim.saved ? "" : " is-draft");
    const style = axisStyle(dim.threeAxis || dim.userAxis);
    const chip = document.createElement("span");
    chip.className = "v3-meas-chip";
    chip.textContent = (style && style.user) || dim.userAxis || "?";
    chip.style.background = (style && style.css) || "#64748b";
    chip.title = style ? (style.user + "＝" + style.meaning) : "";
    const main = document.createElement("div");
    main.className = "v3-meas-item-main";
    main.textContent = dim.invalid ? "無効" : (Math.round(dim.mm || 0) + " mm · " + dim.kind);
    const sub = document.createElement("div");
    sub.className = "v3-meas-item-sub";
    const racks = (dim.rackIds || []).map(function (id) {
      return id.length > 8 ? "…" + id.slice(-4) : id;
    }).join(" × ");
    const faces = faceCaption(dim.startFace, dim.endFace);
    sub.textContent = dim.invalid
      ? (dim.reason || "参照切れ")
      : ((faces ? faces + " · " : "") + (dim.saved ? "保存" : "下書き") + (racks ? " · " + racks : ""));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "v3-meas-del";
    del.textContent = "×";
    del.title = "削除";
    del.addEventListener("click", function (ev) {
      ev.preventDefault();
      removeDim(dim.id);
    });
    row.appendChild(chip);
    row.appendChild(main);
    row.appendChild(sub);
    row.appendChild(del);
    listEl.appendChild(row);
  }

  function render(body) {
    const root = document.createElement("div");
    root.className = "v3-meas-root";
    const note = document.createElement("p");
    note.className = "v3-meas-note";
    note.textContent = pickA && pickB
      ? ("始点 " + refCaption(pickA) + " → 終点 " + refCaption(pickB) + "。軸を確認して保存")
      : (pickA
        ? ("始点を選択済み・終点を選択してください（始点 " + refCaption(pickA) + "）")
        : "1点目をクリック（LEG・JB・Beam・Pole）");
    root.appendChild(note);

    const kinds = document.createElement("div");
    kinds.className = "v3-meas-kinds";
    KINDS.forEach(function (k) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "v3-len-mode" + (kind === k ? " is-on" : "");
      b.textContent = k;
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        kind = k;
        createDraftsFromPicks();
        refreshVisuals(true);
        refreshPanel();
      });
      kinds.appendChild(b);
    });
    root.appendChild(kinds);

    const axisRow = document.createElement("div");
    axisRow.className = "v3-meas-axes";
    ["X", "Y", "Z"].forEach(function (u) {
      const lab = document.createElement("label");
      lab.className = "v3-meas-ax";
      const info = axisStyle(u);
      lab.title = info ? (u + "＝" + info.meaning) : u;
      const ck = document.createElement("input");
      ck.type = "checkbox";
      ck.checked = !!userAxes[u];
      ck.setAttribute("aria-label", u + (info ? "（" + info.meaning + "）" : ""));
      ck.addEventListener("change", function () {
        userAxes[u] = !!ck.checked;
        createDraftsFromPicks();
        refreshVisuals(true);
        refreshPanel();
      });
      const span = document.createElement("span");
      span.textContent = u;
      span.style.color = info ? info.css : "#e2e8f0";
      lab.appendChild(ck);
      lab.appendChild(span);
      axisRow.appendChild(lab);
    });
    const vis = document.createElement("label");
    vis.className = "v3-meas-ax v3-meas-vis";
    const visCk = document.createElement("input");
    visCk.type = "checkbox";
    visCk.checked = globalVisible !== false;
    visCk.setAttribute("aria-label", "寸法を表示");
    visCk.addEventListener("change", function () { setGlobalVisible(visCk.checked); });
    vis.appendChild(visCk);
    vis.appendChild(document.createTextNode("表示"));
    axisRow.appendChild(vis);
    root.appendChild(axisRow);

    const actions = document.createElement("div");
    actions.className = "v3-meas-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "v3-len-mode";
    saveBtn.textContent = "保存";
    saveBtn.disabled = !drafts.some(function (d) { return d && !d.invalid; });
    saveBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      saveDrafts();
    });
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "v3-len-mode";
    resetBtn.textContent = "やり直す";
    resetBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      resetPicks();
      refreshVisuals(true);
      refreshPanel();
    });
    actions.appendChild(saveBtn);
    actions.appendChild(resetBtn);
    root.appendChild(actions);

    const list = document.createElement("div");
    list.className = "v3-meas-list" + (listCollapsed ? " is-collapsed" : "");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "v3-meas-list-toggle";
    const n = allDims().length;
    toggle.textContent = (listCollapsed ? "▸ 一覧" : "▾ 一覧") + (n ? " " + n : "");
    toggle.setAttribute("aria-expanded", listCollapsed ? "false" : "true");
    toggle.addEventListener("click", function (ev) {
      ev.preventDefault();
      listCollapsed = !listCollapsed;
      refreshPanel();
    });
    list.appendChild(toggle);
    if (!listCollapsed) {
      const bodyList = document.createElement("div");
      bodyList.className = "v3-meas-list-body";
      allDims().forEach(function (d) { dimRow(d, bodyList); });
      if (!n) {
        const empty = document.createElement("p");
        empty.className = "v3-meas-empty";
        empty.textContent = "まだありません";
        bodyList.appendChild(empty);
      }
      list.appendChild(bodyList);
    }
    root.appendChild(list);
    body.appendChild(root);
  }

  function refreshPanel() {
    const host = ui();
    if (!host || !isOpen()) return;
    const el = $("v3-cmd-pop-body");
    if (!el) return;
    el.innerHTML = "";
    render(el);
  }

  function openPanel(opts) {
    const host = ui();
    if (!host || typeof host.openPopup !== "function") return;
    host.openPopup(POP_ID, {
      title: "寸法測定",
      hideApply: true,
      hideActions: true,
      compact: true,
      minimizable: true,
      skipFocus: true,
      cancelLabel: "閉じる",
      anchor: (opts && opts.anchor) || $("v3-cad-dimension"),
      render: render,
      onCancel: function () {
        if (!modeOn) return;
        modeOn = false;
        window.isMeasureModeOn = false;
        drafts = [];
        pickA = null;
        pickB = null;
        panelMinimized = false;
        clearHover();
        clearPickHighlight();
        refreshVisuals(true);
        try { window.v3CadToolbar && window.v3CadToolbar.syncActive && window.v3CadToolbar.syncActive(); } catch (e) {}
      },
    });
    if (panelMinimized && typeof host.setPopupMinimized === "function") {
      host.setPopupMinimized(true);
    }
  }

  function setMeasureMode(on) {
    const next = !!on;
    if (modeOn === next) {
      if (next) openPanel();
      else {
        resetPicks();
        panelMinimized = false;
      }
      return;
    }
    modeOn = next;
    window.isMeasureModeOn = modeOn;
    if (modeOn) {
      if (window.v3CadToolbar && typeof window.v3CadToolbar === "object") {
        /* exclusive handled by toolbar */
      }
      openPanel();
      ensureTick();
    } else {
      drafts = [];
      pickA = null;
      pickB = null;
      panelMinimized = false;
      clearHover();
      clearPickHighlight();
      const host = ui();
      if (host && host.getOpenPopupId && host.getOpenPopupId() === POP_ID) {
        host.closePopup("cancel");
      }
      refreshVisuals(true);
    }
    try { window.v3CadToolbar && window.v3CadToolbar.syncActive && window.v3CadToolbar.syncActive(); } catch (e) {}
  }

  function onPointerDown(ev) {
    if (!modeOn) return;
    if (ev.button != null && ev.button !== 0) return;
    const canvas = window.renderer && window.renderer.domElement;
    if (!canvas || !canvas.contains(ev.target)) return;
    const hit = window.v3CadOps && window.v3CadOps.pickAt(ev.clientX, ev.clientY, { includeLeg: true });
    const ref = captureRef(hit);
    if (!ref) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    if (!pickA) pickA = ref;
    else if (!pickB) pickB = ref;
    else {
      pickA = ref;
      pickB = null;
      drafts = [];
    }
    if (pickA && pickB) {
      createDraftsFromPicks();
      listCollapsed = false;
    }
    refreshPickHighlight();
    refreshVisuals(true);
    refreshPanel();
    ensureTick();
  }

  function onPointerMove(ev) {
    if (!modeOn) return;
    const canvas = window.renderer && window.renderer.domElement;
    if (!canvas || !canvas.contains(ev.target)) return;
    const hit = window.v3CadOps && window.v3CadOps.pickAt(ev.clientX, ev.clientY, { includeLeg: true });
    if (hit && (hit.kind === "joint" || hit.kind === "beam" || hit.kind === "pole" || hit.kind === "leg")
        && !sameRef(hit, pickA) && !sameRef(hit, pickB)) {
      const mesh = hit.mesh;
      const hoverTarget = mesh && mesh.userData && (mesh.userData.v3LegBase || mesh.userData.v3LegCone)
        ? (mesh.userData.v3LegBase || mesh.userData.v3LegCone)
        : mesh;
      setHover(hoverTarget);
    } else clearHover();
  }

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape" || !modeOn) return;
    if (pickA || pickB || drafts.length) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      resetPicks();
      refreshVisuals(true);
      refreshPanel();
      return;
    }
    setMeasureMode(false);
  }, true);

  function remapAfterJointIndexMap(indexMap) {
    function remapRef(ref) {
      if (!ref) return;
      if (ref.kind === "joint" && Number.isFinite(ref.index) && indexMap && indexMap[ref.index] >= 0) {
        ref.index = indexMap[ref.index];
      }
    }
    allDims().forEach(function (d) {
      remapRef(d.refA);
      remapRef(d.refB);
      refreshDim(d);
    });
    saved = saved.filter(Boolean);
    refreshPickHighlight();
    refreshVisuals(true);
  }

  window.v3Measure = {
    setMode: setMeasureMode,
    isOn: function () { return modeOn; },
    snapshotFields: snapshotFields,
    loadFromSnapshot: loadFromSnapshot,
    saveDrafts: saveDrafts,
    removeDim: removeDim,
    setRackVisible: setRackVisible,
    isRackDimVisible: isRackDimVisible,
    setGlobalVisible: setGlobalVisible,
    isGlobalVisible: function () { return globalVisible !== false; },
    list: function () { return allDims().map(function (d) { return Object.assign({}, d); }); },
    refresh: function () { allDims().forEach(refreshDim); refreshPickHighlight(); refreshVisuals(true); refreshPanel(); },
    remapAfterJointIndexMap: remapAfterJointIndexMap,
    axisValue: axisValue,
    partExtent: partExtent,
    memberAlign: memberAlign,
    captureRef: captureRef,
    resolveRef: resolveRef,
    jointHasTopCap: jointHasTopCap,
    topCapHeightMm: topCapHeightMm,
    makeDim: makeDim,
    meshesOfRef: meshesOfRef,
    refreshPickHighlight: refreshPickHighlight,
    clearPickHighlight: clearPickHighlight,
    START_HL: START_HL,
    END_HL: END_HL,
    setPicks: function (a, b) {
      pickA = a || null;
      pickB = b || null;
      refreshPickHighlight();
    },
    paintedMeshes: function () {
      return painted.map(function (p) {
        return p && p.mesh;
      }).filter(Boolean);
    },
    axisStyle: axisStyle,
    layoutLine: layoutLine,
    isParallelToThreeAxis: isParallelToThreeAxis,
    isOrthoSegment: isOrthoSegment,
    pathIsOrtho: pathIsOrtho,
    manhattanPath: manhattanPath,
    dimAabb: dimAabb,
    setMinimized: function (on) { panelMinimized = !!on; },
    isMinimized: function () { return !!panelMinimized; },
  };

  window.setMeasureMode = setMeasureMode;
  window.isMeasureModeOn = false;
})();
