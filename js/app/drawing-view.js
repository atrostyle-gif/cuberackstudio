// =========================================================
// 図面専用カメラ（CAD本体カメラとは独立）
// 座標系は CAD / Three.js と同じ:
//   正面 = Three +Z, 背面 = -Z, 右 = +X, 左 = -X, 上面 = +Y, 下面 = -Y
// ユーザー表示軸は X=Three x, Y=Three z, Z=Three y（ここでは CAD 座標を使う）
// =========================================================
(function (root) {
  const FOV_DEG = 30;
  const ZOOM_MIN = 0.28;
  const ZOOM_MAX = 4;
  const PHI_MIN = 0.002;
  const PHI_MAX = Math.PI - 0.002;
  const FIT_NDC = 0.86;
  const PRESETS = ["iso", "front", "back", "left", "right", "top", "bottom"];

  function hypot3(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function presetOffset(kind) {
    switch (kind) {
      case "front": return { x: 0, y: 0, z: 1 };
      case "back": return { x: 0, y: 0, z: -1 };
      case "left": return { x: -1, y: 0, z: 0 };
      case "right": return { x: 1, y: 0, z: 0 };
      case "top": return { x: 0, y: 1, z: 0.001 };
      case "bottom": return { x: 0, y: -1, z: 0.001 };
      case "iso":
      default: return { x: 1, y: 0.72, z: 1 };
    }
  }

  function sphericalFromOffset(dx, dy, dz) {
    const radius = hypot3(dx, dy, dz) || 1;
    return {
      theta: Math.atan2(dz, dx),
      phi: Math.acos(clamp(dy / radius, -1, 1)),
      radius: radius,
    };
  }

  function offsetFromSpherical(theta, phi, radius) {
    const s = Math.sin(phi);
    return {
      x: radius * s * Math.cos(theta),
      y: radius * Math.cos(phi),
      z: radius * s * Math.sin(theta),
    };
  }

  function lookBasis(theta, phi) {
    const off = offsetFromSpherical(theta, phi, 1);
    let up = { x: 0, y: 1, z: 0 };
    if (Math.abs(off.y) > 0.98) up = { x: 0, y: 0, z: off.y > 0 ? -1 : 1 };
    const rx = up.y * off.z - up.z * off.y;
    const ry = up.z * off.x - up.x * off.z;
    const rz = up.x * off.y - up.y * off.x;
    const rl = hypot3(rx, ry, rz) || 1;
    const right = { x: rx / rl, y: ry / rl, z: rz / rl };
    const ux = off.y * right.z - off.z * right.y;
    const uy = off.z * right.x - off.x * right.z;
    const uz = off.x * right.y - off.y * right.x;
    const ul = hypot3(ux, uy, uz) || 1;
    return {
      right: right,
      up: { x: ux / ul, y: uy / ul, z: uz / ul },
      offset: off,
    };
  }

  function boxInfo(box) {
    const min = (box && box.min) || { x: -200, y: 0, z: -200 };
    const max = (box && box.max) || { x: 200, y: 200, z: 200 };
    const cx = (min.x + max.x) * 0.5;
    const cy = (min.y + max.y) * 0.5;
    const cz = (min.z + max.z) * 0.5;
    const sx = Math.max(1, max.x - min.x);
    const sy = Math.max(1, max.y - min.y);
    const sz = Math.max(1, max.z - min.z);
    return {
      min: min,
      max: max,
      center: { x: cx, y: cy, z: cz },
      size: { x: sx, y: sy, z: sz },
      diag: hypot3(sx, sy, sz),
    };
  }

  function estimateFitRadius(box, aspect) {
    const info = boxInfo(box);
    const half = Math.max(info.size.x, info.size.y, info.size.z) * 0.5;
    const fov = (FOV_DEG * Math.PI) / 180;
    const ar = aspect > 0 ? aspect : 1.6;
    const vFit = half / Math.tan(fov * 0.5);
    const hFit = half / (Math.tan(fov * 0.5) * ar);
    return Math.max(vFit, hFit, 80) / FIT_NDC;
  }

  function defaultState(box, aspect) {
    const info = boxInfo(box);
    const sph = sphericalFromOffset(1, 0.72, 1);
    const fitR = estimateFitRadius(box, aspect);
    return {
      preset: "iso",
      theta: sph.theta,
      phi: sph.phi,
      radius: fitR,
      fitRadius: fitR,
      zoom: 1,
      target: { x: info.center.x, y: info.center.y, z: info.center.z },
      aspect: aspect > 0 ? aspect : 1.6,
    };
  }

  function normalize(view, box, aspect) {
    const base = defaultState(box, aspect != null ? aspect : (view && view.aspect));
    if (!view || typeof view !== "object") return base;
    const fitR = Number(view.fitRadius) > 0 ? Number(view.fitRadius) : base.fitRadius;
    let radius = Number(view.radius);
    let zoom = Number(view.zoom);
    if (!(radius > 0)) {
      zoom = clamp(Number.isFinite(zoom) ? zoom : 1, ZOOM_MIN, ZOOM_MAX);
      radius = fitR / zoom;
    } else {
      zoom = clamp(fitR / radius, ZOOM_MIN, ZOOM_MAX);
      radius = fitR / zoom;
    }
    const tgt = view.target && typeof view.target === "object" ? view.target : base.target;
    return {
      preset: PRESETS.indexOf(view.preset) >= 0 || view.preset === "free" ? view.preset : "free",
      theta: Number.isFinite(Number(view.theta)) ? Number(view.theta) : base.theta,
      phi: clamp(Number.isFinite(Number(view.phi)) ? Number(view.phi) : base.phi, PHI_MIN, PHI_MAX),
      radius: radius,
      fitRadius: fitR,
      zoom: zoom,
      target: {
        x: Number(tgt.x) || 0,
        y: Number(tgt.y) || 0,
        z: Number(tgt.z) || 0,
      },
      aspect: aspect > 0 ? aspect : (Number(view.aspect) > 0 ? Number(view.aspect) : base.aspect),
    };
  }

  function applyPreset(kind, box, aspect, prev) {
    const info = boxInfo(box);
    const off = presetOffset(kind);
    const sph = sphericalFromOffset(off.x, off.y, off.z);
    const fitR = estimateFitRadius(box, aspect);
    return {
      preset: PRESETS.indexOf(kind) >= 0 ? kind : "iso",
      theta: sph.theta,
      phi: clamp(sph.phi, PHI_MIN, PHI_MAX),
      radius: fitR,
      fitRadius: fitR,
      zoom: 1,
      target: { x: info.center.x, y: info.center.y, z: info.center.z },
      aspect: aspect > 0 ? aspect : (prev && prev.aspect) || 1.6,
    };
  }

  function orbit(view, dxPx, dyPx, width, height) {
    const w = Math.max(1, width || 1);
    const h = Math.max(1, height || 1);
    const next = Object.assign({}, view, {
      theta: view.theta - (dxPx / w) * Math.PI,
      phi: clamp(view.phi - (dyPx / h) * Math.PI, PHI_MIN, PHI_MAX),
      preset: "free",
    });
    return next;
  }

  function pan(view, dxPx, dyPx, width, height) {
    const w = Math.max(1, width || 1);
    const h = Math.max(1, height || 1);
    const basis = lookBasis(view.theta, view.phi);
    const fov = (FOV_DEG * Math.PI) / 180;
    const worldH = 2 * view.radius * Math.tan(fov * 0.5);
    const k = worldH / h;
    const sx = -dxPx * k;
    const sy = dyPx * k;
    return Object.assign({}, view, {
      preset: "free",
      target: {
        x: view.target.x + basis.right.x * sx + basis.up.x * sy,
        y: view.target.y + basis.right.y * sx + basis.up.y * sy,
        z: view.target.z + basis.right.z * sx + basis.up.z * sy,
      },
    });
  }

  function zoomBy(view, wheelDelta) {
    const factor = Math.exp(-(wheelDelta || 0) * 0.00115);
    const zoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    return Object.assign({}, view, {
      preset: view.preset === "free" ? "free" : view.preset,
      zoom: zoom,
      radius: view.fitRadius / zoom,
    });
  }

  function fitKeepAngle(view, box, aspect) {
    const info = boxInfo(box);
    const fitR = estimateFitRadius(box, aspect != null ? aspect : view.aspect);
    return Object.assign({}, view, {
      target: { x: info.center.x, y: info.center.y, z: info.center.z },
      fitRadius: fitR,
      zoom: 1,
      radius: fitR,
      aspect: aspect > 0 ? aspect : view.aspect,
    });
  }

  function cameraPose(view) {
    const off = offsetFromSpherical(view.theta, view.phi, view.radius);
    return {
      position: {
        x: view.target.x + off.x,
        y: view.target.y + off.y,
        z: view.target.z + off.z,
      },
      target: { x: view.target.x, y: view.target.y, z: view.target.z },
      offset: off,
    };
  }

  function orthoDefault(mode) {
    return {
      mode: PRESETS.indexOf(mode) >= 0 && mode !== "iso" ? mode : "front",
      panU: 0,
      panV: 0,
      zoom: 1,
    };
  }

  function orthoNormalize(st, mode) {
    const base = orthoDefault(mode || (st && st.mode));
    if (!st || typeof st !== "object") return base;
    const nextMode = PRESETS.indexOf(st.mode) >= 0 && st.mode !== "iso" ? st.mode : base.mode;
    return {
      mode: nextMode,
      panU: Number.isFinite(Number(st.panU)) ? Number(st.panU) : 0,
      panV: Number.isFinite(Number(st.panV)) ? Number(st.panV) : 0,
      zoom: clamp(Number(st.zoom) > 0 ? Number(st.zoom) : 1, ZOOM_MIN, ZOOM_MAX),
    };
  }

  function projectUv(x, y, z, mode) {
    const a = modeAxes(mode);
    return {
      u: x * a.u.x + y * a.u.y + z * a.u.z,
      v: x * a.v.x + y * a.v.y + z * a.v.z,
    };
  }

  function orthoPan(st, dxPx, dyPx, pxPerMm) {
    // dx/dy は用紙CSSピクセル。ppm はズーム前の px/mm。
    // 画面右ドラッグ → panU 減少 → 図が右へ。
    const z = Math.max(0.001, (st && st.zoom) || 1);
    const k = 1 / (Math.max(0.001, pxPerMm || 1) * z);
    return Object.assign({}, st, {
      panU: (st.panU || 0) - dxPx * k,
      panV: (st.panV || 0) - dyPx * k,
    });
  }

  function orthoZoom(st, wheelDelta) {
    const factor = Math.exp(-(wheelDelta || 0) * 0.00115);
    return Object.assign({}, st, {
      zoom: clamp(((st && st.zoom) || 1) * factor, ZOOM_MIN, ZOOM_MAX),
    });
  }

  function orthoZoomAt(st, wheelDelta, uvUnderCursor, cu, cv) {
    const prev = orthoNormalize(st);
    const next = orthoZoom(prev, wheelDelta);
    if (!uvUnderCursor) return next;
    const z0 = prev.zoom;
    const z1 = next.zoom;
    if (!(z0 > 0) || !(z1 > 0)) return next;
    const keepU = Number(uvUnderCursor.u);
    const keepV = Number(uvUnderCursor.v);
    if (!Number.isFinite(keepU) || !Number.isFinite(keepV)) return next;
    const centerU = Number.isFinite(cu) ? cu : 0;
    const centerV = Number.isFinite(cv) ? cv : 0;
    const screenU = (keepU - centerU - prev.panU) * z0;
    const screenV = (keepV - centerV - prev.panV) * z0;
    return Object.assign({}, next, {
      panU: keepU - centerU - screenU / z1,
      panV: keepV - centerV - screenV / z1,
    });
  }

  function orthoFit(st) {
    return Object.assign({}, st, { panU: 0, panV: 0, zoom: 1 });
  }

  function orthoPreset(kind, prev) {
    const mode = PRESETS.indexOf(kind) >= 0 && kind !== "iso" ? kind : "front";
    return {
      mode: mode,
      panU: 0,
      panV: 0,
      zoom: 1,
      aspect: prev && prev.aspect,
    };
  }

  function modeAxes(mode) {
    switch (mode) {
      case "back": return { u: { x: -1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 }, w: { x: 0, y: 0, z: -1 } };
      case "left": return { u: { x: 0, y: 0, z: -1 }, v: { x: 0, y: -1, z: 0 }, w: { x: -1, y: 0, z: 0 } };
      case "right":
      case "side": return { u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: -1, z: 0 }, w: { x: 1, y: 0, z: 0 } };
      case "top": return { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, w: { x: 0, y: 1, z: 0 } };
      case "bottom": return { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1 }, w: { x: 0, y: -1, z: 0 } };
      case "front":
      default: return { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: -1, z: 0 }, w: { x: 0, y: 0, z: 1 } };
    }
  }

  function orthoFrame(st, box, rect, pxPerMm, uv) {
    const mode = (st && st.mode) || "front";
    const axes = modeAxes(mode);
    const zoom = clamp((st && st.zoom) > 0 ? st.zoom : 1, ZOOM_MIN, ZOOM_MAX);
    const ppm = Math.max(0.001, pxPerMm || 1);
    const w = Math.max(1, (rect && rect.w) || 1);
    const h = Math.max(1, (rect && rect.h) || 1);
    const minU = uv && Number.isFinite(uv.minU) ? uv.minU : 0;
    const maxU = uv && Number.isFinite(uv.maxU) ? uv.maxU : 1;
    const minV = uv && Number.isFinite(uv.minV) ? uv.minV : 0;
    const maxV = uv && Number.isFinite(uv.maxV) ? uv.maxV : 1;
    const cu = (minU + maxU) * 0.5;
    const cv = (minV + maxV) * 0.5;
    const targetU = cu + ((st && st.panU) || 0);
    const targetV = cv + ((st && st.panV) || 0);
    const info = boxInfo(box);
    const w0 = info.center.x * axes.w.x + info.center.y * axes.w.y + info.center.z * axes.w.z;
    const target = {
      x: axes.u.x * targetU + axes.v.x * targetV + axes.w.x * w0,
      y: axes.u.y * targetU + axes.v.y * targetV + axes.w.y * w0,
      z: axes.u.z * targetU + axes.v.z * targetV + axes.w.z * w0,
    };
    const dist = Math.max(info.diag * 2, 800);
    const halfW = (w * 0.5) / (ppm * zoom);
    const halfH = (h * 0.5) / (ppm * zoom);
    const position = {
      x: target.x + axes.w.x * dist,
      y: target.y + axes.w.y * dist,
      z: target.z + axes.w.z * dist,
    };
    const up = { x: -axes.v.x, y: -axes.v.y, z: -axes.v.z };
    const lookRight = lookAtRight(position, target, up);
    const uDot = lookRight.x * axes.u.x + lookRight.y * axes.u.y + lookRight.z * axes.u.z;
    return {
      mode: mode,
      left: -halfW,
      right: halfW,
      top: halfH,
      bottom: -halfH,
      near: 1,
      far: dist * 4,
      position: position,
      target: target,
      up: up,
      u: { x: axes.u.x, y: axes.u.y, z: axes.u.z },
      v: { x: axes.v.x, y: axes.v.y, z: axes.v.z },
      flipX: uDot < 0,
      pxPerMm: ppm,
      zoom: zoom,
    };
  }

  function lookAtRight(position, target, up) {
    const zx = position.x - target.x;
    const zy = position.y - target.y;
    const zz = position.z - target.z;
    const rx = up.y * zz - up.z * zy;
    const ry = up.z * zx - up.x * zz;
    const rz = up.x * zy - up.y * zx;
    const rl = hypot3(rx, ry, rz) || 1;
    return { x: rx / rl, y: ry / rl, z: rz / rl };
  }

  function orthoPaperFromUv(st, rect, ppm, uv, u, v) {
    const zoom = clamp((st && st.zoom) > 0 ? st.zoom : 1, ZOOM_MIN, ZOOM_MAX);
    const k = Math.max(0.001, ppm || 1) * zoom;
    const cu = ((uv && uv.minU) + (uv && uv.maxU)) * 0.5;
    const cv = ((uv && uv.minV) + (uv && uv.maxV)) * 0.5;
    const cx = (rect && rect.x || 0) + (rect && rect.w || 0) * 0.5;
    const cy = (rect && rect.y || 0) + (rect && rect.h || 0) * 0.5;
    return {
      x: cx + (u - cu - ((st && st.panU) || 0)) * k,
      y: cy + (v - cv - ((st && st.panV) || 0)) * k,
    };
  }

  function orthoPaperFromWorld(frame, rect, world) {
    if (!frame || !world) return { x: 0, y: 0 };
    const right = lookAtRight(frame.position, frame.target, frame.up);
    const up = {
      x: frame.up.x,
      y: frame.up.y,
      z: frame.up.z,
    };
    const dx = world.x - frame.target.x;
    const dy = world.y - frame.target.y;
    const dz = world.z - frame.target.z;
    const camX = dx * right.x + dy * right.y + dz * right.z;
    const camY = dx * up.x + dy * up.y + dz * up.z;
    const halfW = Math.abs((frame.right - frame.left) * 0.5) || 1;
    const halfH = Math.abs((frame.top - frame.bottom) * 0.5) || 1;
    const sx = frame.flipX ? -1 : 1;
    const w = Math.max(1, (rect && rect.w) || 1);
    const h = Math.max(1, (rect && rect.h) || 1);
    const cx = (rect && rect.x || 0) + w * 0.5;
    const cy = (rect && rect.y || 0) + h * 0.5;
    return {
      x: cx + sx * camX * (w * 0.5) / halfW,
      y: cy - camY * (h * 0.5) / halfH,
    };
  }

  function serialize(view) {
    return {
      preset: view.preset,
      theta: view.theta,
      phi: view.phi,
      radius: view.radius,
      fitRadius: view.fitRadius,
      zoom: view.zoom,
      target: { x: view.target.x, y: view.target.y, z: view.target.z },
      aspect: view.aspect,
    };
  }

  function directionOf(kind) {
    const off = presetOffset(kind);
    const len = hypot3(off.x, off.y, off.z) || 1;
    return { x: off.x / len, y: off.y / len, z: off.z / len };
  }

  const api = {
    FOV_DEG: FOV_DEG,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    FIT_NDC: FIT_NDC,
    PRESETS: PRESETS,
    presetOffset: presetOffset,
    sphericalFromOffset: sphericalFromOffset,
    offsetFromSpherical: offsetFromSpherical,
    lookBasis: lookBasis,
    boxInfo: boxInfo,
    estimateFitRadius: estimateFitRadius,
    defaultState: defaultState,
    normalize: normalize,
    applyPreset: applyPreset,
    orbit: orbit,
    pan: pan,
    zoomBy: zoomBy,
    fitKeepAngle: fitKeepAngle,
    cameraPose: cameraPose,
    serialize: serialize,
    directionOf: directionOf,
    orthoDefault: orthoDefault,
    orthoNormalize: orthoNormalize,
    orthoPan: orthoPan,
    orthoZoom: orthoZoom,
    orthoFit: orthoFit,
    orthoPreset: orthoPreset,
    modeAxes: modeAxes,
    projectUv: projectUv,
    orthoZoomAt: orthoZoomAt,
    orthoFrame: orthoFrame,
    lookAtRight: lookAtRight,
    orthoPaperFromUv: orthoPaperFromUv,
    orthoPaperFromWorld: orthoPaperFromWorld,
    clampZoom: function (z) { return clamp(z, ZOOM_MIN, ZOOM_MAX); },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.v3DrawingView = api;
})(typeof window !== "undefined" ? window : globalThis);
