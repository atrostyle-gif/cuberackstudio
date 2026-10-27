// =========================================================
// V3 配置クリック判定：hover と click で同じ候補を使う
//  - 有効プレビュー上のクリックはジョイント選択 / 4点選択より優先
//  - 判定半径を無条件に広げない
// =========================================================
(function () {
  const PLACE_HIT_PX = 22;
  const BOARD_PAD_PX = 10;
  const EPS = 1e-6;

  let candidate = null;
  let boardCandidate = null;

  function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function distToSegSq(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    let t = 0;
    if (ab2 > EPS) t = (apx * abx + apy * aby) / ab2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return distSq(px, py, ax + abx * t, ay + aby * t);
  }

  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function pointInTriangle(px, py, a, b, c) {
    const o1 = orient(a.x, a.y, b.x, b.y, px, py);
    const o2 = orient(b.x, b.y, c.x, c.y, px, py);
    const o3 = orient(c.x, c.y, a.x, a.y, px, py);
    const hasNeg = o1 < 0 || o2 < 0 || o3 < 0;
    const hasPos = o1 > 0 || o2 > 0 || o3 > 0;
    return !(hasNeg && hasPos);
  }

  function pointInQuad(px, py, corners) {
    if (!corners || corners.length !== 4) return false;
    return pointInTriangle(px, py, corners[0], corners[1], corners[2]) ||
      pointInTriangle(px, py, corners[0], corners[2], corners[3]);
  }

  function clonePos(pos) {
    if (!pos) return null;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  function samePos(a, b, tol) {
    if (!a || !b) return false;
    const e = tol == null ? 1e-3 : tol;
    return Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e && Math.abs(a.z - b.z) < e;
  }

  function targetFrom(kind, fromPos, lengthMm, axis, dir) {
    const len = Number(lengthMm);
    const sign = dir < 0 ? -1 : 1;
    if (!fromPos || !(len > 0)) return null;
    const out = { x: fromPos.x, y: fromPos.y, z: fromPos.z };
    if (kind === "pole" || axis === "y") out.y = fromPos.y + sign * len;
    else if (axis === "z") out.z = fromPos.z + sign * len;
    else out.x = fromPos.x + sign * len;
    return out;
  }

  function makePlaceCandidate(opts) {
    opts = opts || {};
    const kind = opts.kind === "pole" ? "pole" : "beam";
    const fromJoint = opts.fromJoint;
    const fromPos = clonePos(opts.fromPos);
    const lengthMm = Number(opts.lengthMm);
    const axis = opts.axis === "z" || opts.axis === "y" ? opts.axis : "x";
    const dir = opts.dir < 0 ? -1 : 1;
    const toPos = clonePos(opts.toPos) || targetFrom(kind, fromPos, lengthMm, axis, dir);
    const toJoint = typeof opts.toJoint === "number" && opts.toJoint >= 0 ? opts.toJoint : null;
    if (typeof fromJoint !== "number" || fromJoint < 0 || !fromPos || !toPos || !(lengthMm > 0)) {
      return { valid: false, kind: kind, fromJoint: fromJoint, toJoint: null, fromPos: fromPos, toPos: toPos, lengthMm: lengthMm, axis: axis, dir: dir };
    }
    return {
      valid: true,
      kind: kind,
      fromJoint: fromJoint,
      toJoint: toJoint,
      fromPos: fromPos,
      toPos: toPos,
      lengthMm: lengthMm,
      axis: axis,
      dir: dir,
    };
  }

  function setCandidate(next) {
    candidate = next && next.valid ? next : null;
    return candidate;
  }

  function getCandidate() {
    return candidate;
  }

  function clearCandidate() {
    candidate = null;
  }

  function setBoardCandidate(next) {
    boardCandidate = next && Array.isArray(next.j4) && next.j4.length === 4 ? {
      valid: true,
      kind: next.kind === "panel" ? "panel" : "shelf",
      j4: next.j4.slice(),
    } : null;
    return boardCandidate;
  }

  function getBoardCandidate() {
    return boardCandidate;
  }

  function clearBoardCandidate() {
    boardCandidate = null;
  }

  function isClickOnPlaceCandidate(clientX, clientY, cand, projectFn, hitPx) {
    if (!cand || !cand.valid || typeof projectFn !== "function") return false;
    const a = projectFn(cand.fromPos);
    const b = projectFn(cand.toPos);
    if (!a || !b) return false;
    const r = hitPx == null ? PLACE_HIT_PX : hitPx;
    const r2 = r * r;
    if (distToSegSq(clientX, clientY, a.x, a.y, b.x, b.y) <= r2) return true;
    if (distSq(clientX, clientY, b.x, b.y) <= r2) return true;
    return false;
  }

  function revalidatePlaceCandidate(cand, opts) {
    opts = opts || {};
    if (!cand || !cand.valid) return false;
    if (opts.canAdd === false) return false;
    const joints = opts.joints || [];
    const from = joints[cand.fromJoint];
    if (!from) return false;
    if (!samePos(from, cand.fromPos, 0.5)) return false;
    const lengthMm = Number(opts.lengthMm != null ? opts.lengthMm : cand.lengthMm);
    const expected = targetFrom(cand.kind, from, lengthMm, cand.axis, cand.dir);
    if (!expected || !samePos(expected, cand.toPos, 0.5)) return false;
    if (typeof cand.toJoint === "number" && cand.toJoint >= 0) {
      const dest = joints[cand.toJoint];
      if (!dest || !samePos(dest, cand.toPos, 0.5)) return false;
    }
    if (typeof opts.isBlocked === "function" && opts.isBlocked(cand)) return false;
    return true;
  }

  function decideAddClick(opts) {
    opts = opts || {};
    if (opts.didDrag) return { action: "ignore" };
    if (opts.altKey || opts.shiftKey || opts.connectMode || opts.lengthEditMode) {
      return { action: "passthrough" };
    }
    const cand = opts.candidate || candidate;
    const selected = opts.selectedJointIndex;
    const near = typeof opts.nearJointIndex === "number" ? opts.nearJointIndex : -1;
    if (cand && cand.valid && selected === cand.fromJoint && !revalidatePlaceCandidate(cand, opts)) {
      return { action: "cancel-preview" };
    }
    const live = !!(cand && cand.valid && selected === cand.fromJoint);
    const onCand = live && (
      isClickOnPlaceCandidate(opts.clientX, opts.clientY, cand, opts.project, opts.hitPx) ||
      near === cand.toJoint ||
      near === cand.fromJoint
    );
    if (onCand) return { action: "place", candidate: cand, highlightJoint: cand.toJoint };
    if (near >= 0 && near !== selected) return { action: "select-joint", jointIndex: near };
    if (live) return { action: "place", candidate: cand, highlightJoint: cand.toJoint };
    return { action: "none" };
  }

  function projectJoints(j4, joints, projectFn) {
    if (!j4 || !joints || typeof projectFn !== "function") return null;
    const corners = [];
    for (let i = 0; i < j4.length; i++) {
      const j = joints[j4[i]];
      if (!j) return null;
      const p = projectFn(j);
      if (!p) return null;
      corners.push(p);
    }
    return corners;
  }

  function isClickOnBoardPreview(clientX, clientY, j4, joints, projectFn, padPx) {
    const corners = projectJoints(j4, joints, projectFn);
    if (!corners || corners.length !== 4) return false;
    if (pointInQuad(clientX, clientY, corners)) return true;
    const pad = padPx == null ? BOARD_PAD_PX : padPx;
    const pad2 = pad * pad;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      if (distToSegSq(clientX, clientY, a.x, a.y, b.x, b.y) <= pad2) return true;
      if (distSq(clientX, clientY, a.x, a.y) <= pad2) return true;
    }
    return false;
  }

  function resolveBoardPlaceMode(opts) {
    if (opts && (opts.placeMode === "pick4" || opts.placeMode === "auto")) return opts.placeMode;
    if (typeof window.getBoardPlaceMode === "function") {
      const m = window.getBoardPlaceMode();
      if (m === "pick4" || m === "auto") return m;
    }
    return "auto";
  }

  function decideBoardClick(opts) {
    opts = opts || {};
    if (opts.didDrag) return { action: "ignore" };
    const placeMode = resolveBoardPlaceMode(opts);
    const j4 = opts.previewJ4 || (boardCandidate && boardCandidate.j4);
    const selectedCount = opts.selectedCount || 0;
    const near = typeof opts.nearJointIndex === "number" ? opts.nearJointIndex : -1;
    const hasPreview = !!(j4 && j4.length === 4);
    const onPreview = hasPreview && (
      isClickOnBoardPreview(opts.clientX, opts.clientY, j4, opts.joints, opts.project, opts.padPx) ||
      (near >= 0 && j4.indexOf(near) >= 0)
    );
    if (placeMode === "pick4" || selectedCount > 0) {
      if (near >= 0 && selectedCount < 4) return { action: "pick-joint", jointIndex: near };
      if (selectedCount >= 4 && hasPreview && onPreview) return { action: "place", j4: j4 };
      if (selectedCount >= 4 && hasPreview) return { action: "place", j4: j4 };
      return { action: "none" };
    }
    if (hasPreview && onPreview) return { action: "place", j4: j4 };
    return { action: "none" };
  }

  window.v3PlacePick = {
    PLACE_HIT_PX: PLACE_HIT_PX,
    BOARD_PAD_PX: BOARD_PAD_PX,
    distSq: distSq,
    distToSegSq: distToSegSq,
    pointInQuad: pointInQuad,
    targetFrom: targetFrom,
    makePlaceCandidate: makePlaceCandidate,
    setCandidate: setCandidate,
    getCandidate: getCandidate,
    clearCandidate: clearCandidate,
    setBoardCandidate: setBoardCandidate,
    getBoardCandidate: getBoardCandidate,
    clearBoardCandidate: clearBoardCandidate,
    isClickOnPlaceCandidate: isClickOnPlaceCandidate,
    revalidatePlaceCandidate: revalidatePlaceCandidate,
    decideAddClick: decideAddClick,
    isClickOnBoardPreview: isClickOnBoardPreview,
    decideBoardClick: decideBoardClick,
    resolveBoardPlaceMode: resolveBoardPlaceMode,
  };
})();
