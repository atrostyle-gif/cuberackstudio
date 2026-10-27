// =========================================================
// V3 Move 距離表示（STEP⑥-A）
// Joint 中心 AABB の X/Z 隙間。実外径の推測は表示しない。
// 自動配置の計算・確定は v3-move-panel.js（STEP⑥-B）が担当する。
// =========================================================
(function () {
  const POP_ID = "move-gap";
  const EPS = 0.5;
  const LINE_OFF = 56;
  const ARROW_MM = 14;

  let overlay = null;
  let movingIdx = [];
  let last = null;
  let lastOffset = null;
  let selfRefresh = false;
  let fromModeOff = false;
  let fields = null;
  let dragAxis = null;
  let yDeltaMm = null;
  let labelHost = null;
  let labelMarks = [];
  let ticking = false;
  let lastVisualKey = "";

  function $(id) { return document.getElementById(id); }
  function ui() { return window.v3WorkspaceUi; }
  function joints() { return window.joints || []; }
  function THREE() { return window.THREE; }
  function wl() { return window.v3WorkLayers; }

  function shortId(id) {
    if (!id) return "—";
    const s = String(id);
    if (s.indexOf("cluster:") === 0) return "クラスタ";
    return s.length <= 8 ? s : "…" + s.slice(-4);
  }

  function aabbOf(indices, offset) {
    const js = joints();
    const ox = offset && Number.isFinite(offset.x) ? offset.x : 0;
    const oy = offset && Number.isFinite(offset.y) ? offset.y : 0;
    const oz = offset && Number.isFinite(offset.z) ? offset.z : 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let minY = Infinity, maxY = -Infinity, n = 0, rackId = null;
    for (let i = 0; i < indices.length; i++) {
      const j = js[indices[i]];
      if (!j) continue;
      minX = Math.min(minX, j.x + ox); maxX = Math.max(maxX, j.x + ox);
      minZ = Math.min(minZ, j.z + oz); maxZ = Math.max(maxZ, j.z + oz);
      minY = Math.min(minY, j.y + oy); maxY = Math.max(maxY, j.y + oy);
      n++;
      if (!rackId && typeof j.rackId === "string") rackId = j.rackId;
    }
    if (!n || !Number.isFinite(minX)) return null;
    return {
      minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, minY: minY, maxY: maxY,
      cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rackId: rackId, n: n,
    };
  }

  function axisGap(aMin, aMax, bMin, bMax) {
    if (aMax + EPS < bMin) {
      return { mm: bMin - aMax, state: "gap", side: "+" };
    }
    if (bMax + EPS < aMin) {
      return { mm: aMin - bMax, state: "gap", side: "-" };
    }
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= EPS) {
      return { mm: 0, state: "touch", side: "0" };
    }
    return { mm: overlap, state: "overlap", side: "0" };
  }

  function otherGroups(exclude) {
    const js = joints();
    const layers = wl();
    const buckets = {};
    for (let i = 0; i < js.length; i++) {
      if (exclude.has(i)) continue;
      const j = js[i];
      if (!j) continue;
      if (layers && typeof layers.canSelectJoint === "function" && !layers.canSelectJoint(i)) continue;
      const id = (typeof j.rackId === "string" && j.rackId) ? j.rackId : ("cluster:" + i);
      if (!buckets[id]) buckets[id] = [];
      buckets[id].push(i);
    }
    const out = [];
    Object.keys(buckets).forEach(function (id) {
      const box = aabbOf(buckets[id]);
      if (box) out.push({ id: id, aabb: box, indices: buckets[id] });
    });
    return out;
  }

  function planDist(gx, gz) {
    const dx = gx.state === "gap" ? gx.mm : 0;
    const dz = gz.state === "gap" ? gz.mm : 0;
    return Math.hypot(dx, dz);
  }

  function measure(movingIndices, offset) {
    const movingBox = aabbOf(movingIndices || [], offset);
    if (!movingBox) return null;
    const exclude = new Set(movingIndices);
    let others = otherGroups(exclude);
    if (movingBox.rackId) {
      others = others.filter(function (o) { return o.id !== movingBox.rackId; });
    }
    if (!others.length) {
      return {
        moving: movingBox,
        ref: null,
        x: null,
        z: null,
        collide: false,
        status: "none",
      };
    }
    let best = null;
    others.forEach(function (o) {
      const x = axisGap(movingBox.minX, movingBox.maxX, o.aabb.minX, o.aabb.maxX);
      const z = axisGap(movingBox.minZ, movingBox.maxZ, o.aabb.minZ, o.aabb.maxZ);
      const d = planDist(x, z);
      const collide = x.state === "overlap" && z.state === "overlap";
      const score = collide ? -1 : d;
      if (!best || score < best.score) {
        best = { ref: o, x: x, z: z, collide: collide, score: score };
      }
    });
    let status = "apart";
    if (best.collide) status = "collide";
    else if ((best.x.state === "touch" && best.z.state !== "gap") || (best.z.state === "touch" && best.x.state !== "gap")) {
      status = "touch";
    }
    return {
      moving: movingBox,
      ref: best.ref,
      x: best.x,
      z: best.z,
      collide: best.collide,
      status: status,
    };
  }

  function collisions(movingIndices, offset, skipIds) {
    const movingBox = aabbOf(movingIndices || [], offset);
    if (!movingBox) return [];
    const skip = {};
    (skipIds || []).forEach(function (id) { if (id) skip[id] = true; });
    const exclude = new Set(movingIndices || []);
    const others = otherGroups(exclude).filter(function (o) { return !skip[o.id]; });
    const hits = [];
    others.forEach(function (o) {
      const x = axisGap(movingBox.minX, movingBox.maxX, o.aabb.minX, o.aabb.maxX);
      const z = axisGap(movingBox.minZ, movingBox.maxZ, o.aabb.minZ, o.aabb.maxZ);
      if (x.state === "overlap" && z.state === "overlap") {
        hits.push({ id: o.id, x: x.mm, z: z.mm, aabb: o.aabb, indices: o.indices });
      }
    });
    return hits;
  }

  function rangesOverlap(aMin, aMax, bMin, bMax) {
    return Math.min(aMax, bMax) - Math.max(aMin, bMin) > EPS;
  }

  function yOverlaps(a, b) {
    if (!a || !b) return false;
    const ov = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    if (ov > EPS) return true;
    return Math.abs(a.minY - b.minY) <= EPS && Math.abs(a.maxY - b.maxY) <= EPS;
  }

  function signedSide(gap, aCenter, bCenter) {
    if (gap && (gap.side === "+" || gap.side === "-")) return gap.side;
    return bCenter >= aCenter ? "+" : "-";
  }

  function isOccluded(base, candidate, axis, side, others, skipId) {
    const c = candidate;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (!o || o.id === skipId) continue;
      const r = o.aabb;
      if (!r) continue;
      if (axis === "x") {
        const z0 = Math.max(base.minZ, c.minZ);
        const z1 = Math.min(base.maxZ, c.maxZ);
        if (!rangesOverlap(r.minZ, r.maxZ, z0, z1)) continue;
        if (!yOverlaps(r, base) && !yOverlaps(r, c)) continue;
        if (side === "+") {
          if (r.maxX <= c.minX + EPS && r.maxX > base.maxX - EPS) return true;
        } else if (r.minX >= c.maxX - EPS && r.minX < base.minX + EPS) return true;
      } else {
        const x0 = Math.max(base.minX, c.minX);
        const x1 = Math.min(base.maxX, c.maxX);
        if (!rangesOverlap(r.minX, r.maxX, x0, x1)) continue;
        if (!yOverlaps(r, base) && !yOverlaps(r, c)) continue;
        if (side === "+") {
          if (r.maxZ <= c.minZ + EPS && r.maxZ > base.maxZ - EPS) return true;
        } else if (r.minZ >= c.maxZ - EPS && r.minZ < base.minZ + EPS) return true;
      }
    }
    return false;
  }

  // 隣接ラック判定。距離そのものは既存 axisGap（Joint中心AABB）を使う。
  function measureAdjacent(movingIndices, offset) {
    const movingBox = aabbOf(movingIndices || [], offset);
    if (!movingBox) return { moving: null, items: [] };
    const exclude = new Set(movingIndices || []);
    let others = otherGroups(exclude);
    if (movingBox.rackId) {
      others = others.filter(function (o) { return o.id !== movingBox.rackId; });
    }
    const items = [];
    others.forEach(function (o) {
      if (!yOverlaps(movingBox, o.aabb)) return;
      const x = axisGap(movingBox.minX, movingBox.maxX, o.aabb.minX, o.aabb.maxX);
      const z = axisGap(movingBox.minZ, movingBox.maxZ, o.aabb.minZ, o.aabb.maxZ);
      const collide = x.state === "overlap" && z.state === "overlap";
      if (collide) {
        items.push({
          ref: o, x: x, z: z, collide: true, status: "collide", axis: "xz", side: "0",
        });
        return;
      }
      if (z.state === "overlap" && (x.state === "gap" || x.state === "touch")) {
        const side = signedSide(x, movingBox.cx, o.aabb.cx);
        if (!isOccluded(movingBox, o.aabb, "x", side, others, o.id)) {
          items.push({
            ref: o, x: x, z: z, collide: false,
            status: x.state === "touch" ? "touch" : "apart",
            axis: "x", side: side,
          });
        }
      }
      if (x.state === "overlap" && (z.state === "gap" || z.state === "touch")) {
        const side = signedSide(z, movingBox.cz, o.aabb.cz);
        if (!isOccluded(movingBox, o.aabb, "z", side, others, o.id)) {
          items.push({
            ref: o, x: x, z: z, collide: false,
            status: z.state === "touch" ? "touch" : "apart",
            axis: "z", side: side,
          });
        }
      }
    });
    return { moving: movingBox, items: items };
  }

  function fmtAxis(g, axis) {
    if (!g) return "—";
    const mm = Math.round(g.mm);
    if (g.state === "gap") {
      const dir = g.side === "+" ? (axis === "X" ? "+X" : "+Y") : (axis === "X" ? "−X" : "−Y");
      return "隙間 " + mm + " mm（" + dir + "）";
    }
    if (g.state === "touch") return "密着 0 mm";
    return "投影重なり " + mm + " mm";
  }

  function fmtStatus(m) {
    if (!m || m.status === "none") return "近くに別ラックがありません";
    if (m.status === "collide") {
      const ox = m.x && m.x.state === "overlap" ? Math.round(m.x.mm) : 0;
      const oz = m.z && m.z.state === "overlap" ? Math.round(m.z.mm) : 0;
      return "干渉  X " + ox + " / Y " + oz + " mm";
    }
    if (m.status === "touch") return "密着（隙間 0 mm）";
    return "離れている";
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
          if (mat.map && mat.map.dispose) {
            try { mat.map.dispose(); } catch (e2) {}
          }
          if (mat.dispose) {
            try { mat.dispose(); } catch (e3) {}
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
    labelHost.id = "v3-move-dist-labels";
    labelHost.setAttribute("aria-hidden", "true");
    view.appendChild(labelHost);
    return labelHost;
  }

  function disposeLabels() {
    labelMarks = [];
    lastVisualKey = "";
    if (labelHost) labelHost.innerHTML = "";
  }

  function clearVisuals() {
    disposeOverlay();
    disposeLabels();
  }

  function addLine(parent, pts, color, opacity) {
    const T = THREE();
    if (!T) return;
    const geo = new T.BufferGeometry().setFromPoints(pts);
    const mat = new T.LineBasicMaterial({
      color: color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: opacity == null ? 0.94 : opacity,
    });
    const line = new T.Line(geo, mat);
    line.renderOrder = 980;
    line.raycast = function () {};
    parent.add(line);
  }

  function addArrow(parent, from, to, color) {
    const T = THREE();
    if (!T || !from || !to) return;
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 4) return;
    dir.multiplyScalar(1 / len);
    const size = Math.min(ARROW_MM, Math.max(8, len * 0.18));
    const back = dir.clone().multiplyScalar(-size);
    const side = new T.Vector3(-dir.z, 0, dir.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(size * 0.38);
    const up = new T.Vector3(0, size * 0.32, 0);
    const tip = to.clone();
    const left = tip.clone().add(back).add(side).add(up);
    const right = tip.clone().add(back).sub(side).add(up);
    addLine(parent, [tip, left], color, 0.96);
    addLine(parent, [tip, right], color, 0.96);
    addLine(parent, [left, right], color, 0.7);
  }

  function drawDim(parent, layout) {
    const T = THREE();
    if (!T || !layout) return;
    const color = layout.color;
    const m0 = layout.m0;
    const m1 = layout.m1;
    const d0 = layout.d0;
    const d1 = layout.d1;
    const tick = layout.tick;
    if (m0 && d0) addLine(parent, [m0, d0], color, 0.48);
    if (m1 && d1) addLine(parent, [m1, d1], color, 0.48);
    if (m0 && tick) addLine(parent, [m0.clone().add(tick), m0.clone().sub(tick)], color, 0.7);
    if (m1 && tick) addLine(parent, [m1.clone().add(tick), m1.clone().sub(tick)], color, 0.7);
    if (d0 && d1 && d0.distanceTo(d1) >= 1) {
      addLine(parent, [d0, d1], color, 0.96);
      addArrow(parent, d1, d0, color);
      addArrow(parent, d0, d1, color);
    } else if (d0 && tick) {
      addLine(parent, [d0.clone().add(tick), d0.clone().sub(tick)], color, 0.9);
    }
  }

  function itemColor(item) {
    if (item.collide || item.status === "collide") return 0xf87171;
    if (item.status === "touch") return 0x38bdf8;
    return item.axis === "z" ? 0x4ade80 : 0xfbbf24;
  }

  function itemClass(item) {
    if (item.collide || item.status === "collide") return "is-hit";
    if (item.status === "touch") return "is-touch";
    return item.axis === "z" ? "is-z" : "is-x";
  }

  function itemCaption(item) {
    if (item.collide || item.status === "collide") {
      return { main: "干渉", sub: "XY" };
    }
    const axis = item.axis === "z" ? "Y" : "X";
    const mm = item.axis === "z" ? item.z.mm : item.x.mm;
    return { main: Math.round(mm) + " mm", sub: axis };
  }

  function floorY(a, b) {
    const y = Math.min(a.minY, b.minY);
    return Number.isFinite(y) ? y : 0;
  }

  function camOutside(axis, a, b) {
    const cam = window.camera && window.camera.position;
    if (axis === "x") {
      const mid = (a.minZ + a.maxZ + b.minZ + b.maxZ) / 4;
      const useMax = !!(cam && cam.z >= mid);
      return {
        side: useMax ? "+" : "-",
        v: useMax ? Math.max(a.maxZ, b.maxZ) + LINE_OFF : Math.min(a.minZ, b.minZ) - LINE_OFF,
        dir: useMax ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 },
      };
    }
    const mid = (a.minX + a.maxX + b.minX + b.maxX) / 4;
    const useMax = !!(cam && cam.x >= mid);
    return {
      side: useMax ? "+" : "-",
      v: useMax ? Math.max(a.maxX, b.maxX) + LINE_OFF : Math.min(a.minX, b.minX) - LINE_OFF,
      dir: useMax ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 },
    };
  }

  function visualKey(adj) {
    if (!adj || !adj.moving) return "";
    const a = adj.moving;
    const parts = [
      Math.round(a.minX), Math.round(a.maxX), Math.round(a.minZ), Math.round(a.maxZ),
      Math.round(a.minY), Math.round(a.maxY),
    ];
    (adj.items || []).forEach(function (it) {
      parts.push(it.ref && it.ref.id ? it.ref.id : "");
      parts.push(it.axis, it.status, it.side);
      parts.push(it.x ? Math.round(it.x.mm) : 0);
      parts.push(it.z ? Math.round(it.z.mm) : 0);
      if (it.ref && it.ref.aabb && (it.axis === "x" || it.axis === "z")) {
        parts.push(camOutside(it.axis, a, it.ref.aabb).side);
      }
    });
    return parts.join("|");
  }

  function layoutItem(T, a, item) {
    const b = item.ref.aabb;
    const y = floorY(a, b);
    const tick = new T.Vector3(0, 8, 0);
    const color = itemColor(item);
    if (item.collide || item.status === "collide") {
      const x = (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2;
      const z = (Math.max(a.minZ, b.minZ) + Math.min(a.maxZ, b.maxZ)) / 2;
      const mid = new T.Vector3(x, y, z);
      return {
        m0: new T.Vector3(x - 16, y, z),
        m1: new T.Vector3(x + 16, y, z),
        d0: new T.Vector3(x - 16, y, z),
        d1: new T.Vector3(x + 16, y, z),
        tick: tick,
        mid: mid,
        color: color,
      };
    }
    if (item.axis === "x") {
      const aFace = item.side === "+" ? a.maxX : a.minX;
      const bFace = item.side === "+" ? b.minX : b.maxX;
      const zInner = (Math.max(a.minZ, b.minZ) + Math.min(a.maxZ, b.maxZ)) / 2;
      const outside = camOutside("x", a, b);
      const m0 = new T.Vector3(aFace, y, zInner);
      const m1 = new T.Vector3(bFace, y, zInner);
      const d0 = new T.Vector3(aFace, y, outside.v);
      const d1 = new T.Vector3(bFace, y, outside.v);
      return {
        m0: m0, m1: m1, d0: d0, d1: d1, tick: tick, color: color,
        mid: new T.Vector3((aFace + bFace) / 2, y, outside.v),
        out: outside.dir,
      };
    }
    const aFace = item.side === "+" ? a.maxZ : a.minZ;
    const bFace = item.side === "+" ? b.minZ : b.maxZ;
    const xInner = (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2;
    const outside = camOutside("z", a, b);
    const m0 = new T.Vector3(xInner, y, aFace);
    const m1 = new T.Vector3(xInner, y, bFace);
    const d0 = new T.Vector3(outside.v, y, aFace);
    const d1 = new T.Vector3(outside.v, y, bFace);
    return {
      m0: m0, m1: m1, d0: d0, d1: d1, tick: tick, color: color,
      mid: new T.Vector3(outside.v, y, (aFace + bFace) / 2),
      out: outside.dir,
    };
  }

  function syncLabelEls(adj) {
    const host = ensureLabelHost();
    if (!host) return;
    host.innerHTML = "";
    labelMarks = [];
    (adj.items || []).forEach(function (item) {
      const cap = itemCaption(item);
      const el = document.createElement("div");
      el.className = "v3-move-dist-tag " + itemClass(item);
      const main = document.createElement("strong");
      main.textContent = cap.main;
      el.appendChild(main);
      if (cap.sub) {
        const sub = document.createElement("span");
        sub.textContent = cap.sub;
        el.appendChild(sub);
      }
      host.appendChild(el);
      labelMarks.push({
        el: el,
        pos: item._layout ? item._layout.mid : null,
        layout: item._layout || null,
      });
    });
  }

  function worldToView(pos) {
    const T = THREE();
    const cam = window.camera;
    const view = window.viewEl || document.getElementById("view");
    const canvas = window.renderer && window.renderer.domElement;
    if (!T || !cam || !view || !pos) return null;
    const v = pos.clone().project(cam);
    if (v.z < -1 || v.z > 1) return { visible: false, x: 0, y: 0 };
    const crect = (canvas || view).getBoundingClientRect();
    const vrect = view.getBoundingClientRect();
    const x = crect.left - vrect.left + (v.x * 0.5 + 0.5) * crect.width;
    const y = crect.top - vrect.top + (-v.y * 0.5 + 0.5) * crect.height;
    return { visible: true, x: x, y: y };
  }

  function projectLabels() {
    const placed = [];
    labelMarks.forEach(function (mark) {
      if (!mark.el) return;
      const layout = mark.layout;
      const d0s = layout && layout.d0 ? worldToView(layout.d0) : null;
      const d1s = layout && layout.d1 ? worldToView(layout.d1) : null;
      const midS = worldToView(mark.pos || (layout && layout.mid));
      if (!midS || !midS.visible) {
        mark.el.style.display = "none";
        return;
      }
      mark.el.style.display = "";
      let x = midS.x;
      let y = midS.y;
      if (d0s && d1s && d0s.visible && d1s.visible) {
        const lx = d1s.x - d0s.x;
        const ly = d1s.y - d0s.y;
        const llen = Math.hypot(lx, ly) || 1;
        let nx = -ly / llen;
        let ny = lx / llen;
        const cx = (d0s.x + d1s.x) / 2;
        const cy = (d0s.y + d1s.y) / 2;
        if (nx * (midS.x - cx) + ny * (midS.y - cy) < 0) {
          nx = -nx;
          ny = -ny;
        }
        const lift = llen < 48 ? 28 : 20;
        x = cx + nx * lift;
        y = cy + ny * lift;
      }
      for (let i = 0; i < placed.length; i++) {
        const q = placed[i];
        if (Math.abs(x - q.x) < 88 && Math.abs(y - q.y) < 28) {
          y = q.y + 30;
        }
      }
      mark.el.style.transform = "translate(-50%, -50%) translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      placed.push({ x: x, y: y });
    });
  }

  function renderAdjacent(indices, offset) {
    const T = THREE();
    const rg = window.rackGroup;
    if (!T || !rg) return;
    const adj = measureAdjacent(indices || movingIdx, offset);
    const key = visualKey(adj);
    if (key !== lastVisualKey) {
      lastVisualKey = key;
      disposeOverlay();
      if (T && rg && adj.moving && adj.items.length) {
        overlay = new T.Group();
        overlay.userData = { type: "move-gap" };
        adj.items.forEach(function (item) {
          const layout = layoutItem(T, adj.moving, item);
          item._layout = layout;
          drawDim(overlay, layout);
        });
        rg.add(overlay);
      }
      syncLabelEls(adj);
    } else if (!adj.items.length && labelMarks.length) {
      disposeLabels();
    }
    if (adj.moving && adj.items.length) {
      adj.items.forEach(function (item, i) {
        if (!item._layout) item._layout = layoutItem(T, adj.moving, item);
        if (labelMarks[i]) {
          labelMarks[i].pos = item._layout.mid;
          labelMarks[i].layout = item._layout;
        }
      });
    }
    projectLabels();
    startTick();
  }

  function shouldShowLabels() {
    if (!window.isMoveModeOn) return false;
    const gz = window.v3MoveGizmo;
    if (gz && typeof gz.getAnchorIndex === "function" && gz.getAnchorIndex() >= 0) return true;
    return !!(movingIdx && movingIdx.length);
  }

  function activeIndices() {
    const gz = window.v3MoveGizmo;
    if (gz && typeof gz.getAnchorIndex === "function" && gz.getAnchorIndex() >= 0 && gz.getIndices) {
      return gz.getIndices();
    }
    return movingIdx.slice();
  }

  function startTick() {
    if (ticking) return;
    ticking = true;
    function loop() {
      if (!shouldShowLabels()) {
        ticking = false;
        clearVisuals();
        return;
      }
      const idx = activeIndices();
      if (!idx.length) {
        ticking = false;
        clearVisuals();
        return;
      }
      renderAdjacent(idx, lastOffset);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function fillBody(body) {
    const el = body || $("v3-cmd-pop-body");
    if (!el) return;
    el.innerHTML = "";
    const root = document.createElement("div");
    root.className = "v3-move-gap-root";

    const hint = document.createElement("p");
    hint.className = "v3-connect-status";
    hint.textContent = hintText();
    root.appendChild(hint);

    function row(k, v) {
      const line = document.createElement("div");
      line.className = "v3-move-gap-row";
      const key = document.createElement("span");
      key.className = "v3-move-gap-k";
      key.textContent = k;
      const val = document.createElement("span");
      val.className = "v3-move-gap-v";
      val.textContent = v;
      line.appendChild(key);
      line.appendChild(val);
      return { line: line, val: val };
    }

    const rRef = row("基準ラック", last && last.ref ? shortId(last.ref.id) : "—");
    const rMov = row("移動ラック", last && last.moving ? shortId(last.moving.rackId) : "—");
    const rX = row("X方向", last ? fmtAxis(last.x, "X") : "—");
    const rZ = row("Y方向", last ? fmtAxis(last.z, "Z") : "—");
    const rY = row("Z方向", fmtY());
    const rSt = row("平面", last ? fmtStatus(last) : "—");
    const rBs = row("寸法の基準", basisText());
    root.appendChild(rRef.line);
    root.appendChild(rMov.line);
    root.appendChild(rX.line);
    root.appendChild(rZ.line);
    root.appendChild(rY.line);
    root.appendChild(rSt.line);
    root.appendChild(rBs.line);

    const note = document.createElement("p");
    note.className = "v3-connect-msg";
    note.textContent = "実外径（SideCap等）は未確定のため表示しません。";
    root.appendChild(note);

    el.appendChild(root);
    fields = { hint: hint, ref: rRef.val, mov: rMov.val, x: rX.val, z: rZ.val, y: rY.val, st: rSt.val, bs: rBs.val };
    if (last && last.status === "collide" && rSt.val) rSt.val.style.color = "#f87171";
  }

  function refreshPanel() {
    const host = ui();
    if (!host || host.getOpenPopupId && host.getOpenPopupId() !== POP_ID) {
      fields = null;
      return;
    }
    if (fields && fields.x) {
      setText(fields.hint, hintText());
      setText(fields.ref, last && last.ref ? shortId(last.ref.id) : "—");
      setText(fields.mov, last && last.moving ? shortId(last.moving.rackId) : "—");
      setText(fields.x, last ? fmtAxis(last.x, "X") : "—");
      setText(fields.z, last ? fmtAxis(last.z, "Z") : "—");
      setText(fields.y, fmtY());
      setText(fields.st, last ? fmtStatus(last) : "—");
      setText(fields.bs, basisText());
      if (fields.st) fields.st.style.color = (last && last.status === "collide") ? "#f87171" : "";
      return;
    }
    fillBody();
  }

  function openPanel() {
    const host = ui();
    if (!host || typeof host.openPopup !== "function") return;
    if (host.getOpenPopupId && host.getOpenPopupId() === POP_ID) {
      fillBody();
      return;
    }
    host.openPopup(POP_ID, {
      title: "ラック距離",
      hideApply: true,
      hideActions: true,
      compact: true,
      skipFocus: true,
      anchor: document.querySelector('[data-v3-cad-cmd="move"]'),
      onCancel: function () {
        if (selfRefresh) return;
      },
      render: fillBody,
    });
  }

  function closePanel() {
    const host = ui();
    if (host && host.getOpenPopupId && host.getOpenPopupId() === POP_ID) {
      selfRefresh = true;
      try { host.closePopup("cancel"); } catch (e) {}
      selfRefresh = false;
    }
    fields = null;
  }

  function hintText() {
    if (dragAxis === "y") return "Y移動中。下のX/Zは平面距離であり、3Dの斜め距離ではありません。";
    if (last && last.ref) return "Joint 中心距離（平面）。実外面間ではありません。";
    return "Jointをクリックして基準を選びます。";
  }

  function fmtY() {
    if (dragAxis !== "y") return "—（XZ移動時は不変）";
    const mm = Math.round(Number(yDeltaMm) || 0);
    return "移動 " + mm + " mm（XZ距離は不変）";
  }

  function basisText() {
    if (dragAxis === "y") return "Joint中心の平面AABB（Yでは変化しません）";
    return "Joint中心（外形AABB）";
  }

  function notify() {
    try { window.v3MovePanel?.onGapUpdate?.(); } catch (e) {}
    refreshPanel();
  }

  function refreshVisuals(indices, offset, axis) {
    movingIdx = Array.isArray(indices) ? indices.slice() : movingIdx.slice();
    if (axis) dragAxis = axis;
    lastOffset = offset || null;
    last = measure(movingIdx, lastOffset);
    renderAdjacent(movingIdx, lastOffset);
  }

  function showForSelection(indices, offset) {
    if (!window.isMoveModeOn) {
      clear();
      return;
    }
    refreshVisuals(indices || activeIndices(), offset || null, dragAxis);
    notify();
  }

  function clear() {
    movingIdx = [];
    dragAxis = null;
    yDeltaMm = null;
    lastOffset = null;
    last = null;
    ticking = false;
    lastVisualKey = "";
    clearVisuals();
    notify();
  }

  function onDragStart(indices, axis) {
    refreshVisuals(indices, null, axis || null);
    if (!window.v3MovePanel && window.isMoveModeOn) openPanel();
    else notify();
  }

  function onDragMove(axis) {
    if (!movingIdx.length) return;
    refreshVisuals(movingIdx, null, axis || dragAxis);
    notify();
  }

  function onDragEnd() {
    dragAxis = null;
    yDeltaMm = null;
    lastOffset = null;
    const idx = activeIndices();
    movingIdx = idx.slice();
    if (window.isMoveModeOn && movingIdx.length) {
      last = measure(movingIdx);
      renderAdjacent(movingIdx);
    } else {
      last = null;
      ticking = false;
      clearVisuals();
    }
    notify();
  }

  function showOffset(indices, offset, axis) {
    refreshVisuals(indices, offset || { x: 0, y: 0, z: 0 }, axis || null);
    notify();
  }

  function setYHint(on, dy) {
    dragAxis = on ? "y" : (dragAxis === "y" ? null : dragAxis);
    yDeltaMm = on ? dy : null;
    refreshPanel();
  }

  function hookMode() {
    if (window.__v3MoveGapHooked) return;
    const orig = window.setMoveMode;
    if (typeof orig !== "function") return;
    window.__v3MoveGapHooked = true;
    window.setMoveMode = function (on) {
      const result = orig.apply(this, arguments);
      if (window.isMoveModeOn) {
        if (!window.v3MovePanel) openPanel();
      } else {
        clear();
        if (!fromModeOff && !window.v3MovePanel) closePanel();
      }
      return result;
    };
  }

  hookMode();
  window.addEventListener("load", hookMode);

  window.v3MoveGap = {
    onDragStart: onDragStart,
    onDragMove: onDragMove,
    onDragEnd: onDragEnd,
    showForSelection: showForSelection,
    clear: clear,
    setYHint: setYHint,
    measure: measure,
    measureAdjacent: measureAdjacent,
    aabbOf: aabbOf,
    axisGap: axisGap,
    otherGroups: function (exclude) {
      return otherGroups(exclude instanceof Set ? exclude : new Set(exclude || []));
    },
    collisions: collisions,
    showOffset: showOffset,
    formatAxis: fmtAxis,
    formatStatus: fmtStatus,
    formatY: fmtY,
    basisText: basisText,
    hintText: hintText,
    shortId: shortId,
    getLast: function () { return last; },
    getAxis: function () { return dragAxis; },
    open: openPanel,
    close: closePanel,
  };
})();
