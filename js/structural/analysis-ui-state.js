/* Structural-analysis UI state.  This module is deliberately independent from CAD meshes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CubeRackStructuralUiState = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const G = 9.80665;
  const EPS = 1e-9;
  // CAD の座標は mm。自動レイアウトや保存/復元で生じる微小な丸め差だけを吸収する。
  // これは「床」を推定する値ではなく、最下端座標と同一とみなすための比較許容差である。
  const DEFAULT_FLOOR_TOLERANCE_MM = 0.1;

  function finitePositive(v) { return Number.isFinite(v) && v > 0; }
  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).filter(function (v) {
      return typeof v === "string" && v.length > 0;
    })));
  }
  function cleanSupports(values, beamIds) {
    const allowed = beamIds ? new Set(beamIds) : null;
    return (Array.isArray(values) ? values : []).map(function (s) {
      if (!s || typeof s.beamId !== "string" || (allowed && !allowed.has(s.beamId))) return null;
      const share = Number(s.share);
      if (!Number.isFinite(share) || share < 0) return null;
      return { beamId: s.beamId, share: share, kind: s.kind === "point" ? "point" : "uniform", positionFromAMm: Number(s.positionFromAMm) };
    }).filter(Boolean);
  }
  function empty() {
    return {
      version: 1,
      enabled: false,
      overlayVisible: false,
      floorSupportJointIds: [],
      shelfInputs: {},
      effectiveLengthFactor: null,
      referenceLimits: { maxBendingStressMPa: null, maxDeflectionRatio: null },
    };
  }
  function normalize(raw, ids) {
    const state = empty();
    const src = raw && typeof raw === "object" ? raw : {};
    state.enabled = !!src.enabled;
    state.overlayVisible = !!src.overlayVisible;
    const jointIds = ids && ids.jointIds;
    const shelfIds = ids && ids.shelfIds;
    const beamIds = ids && ids.beamIds;
    state.floorSupportJointIds = uniqueStrings(src.floorSupportJointIds).filter(function (id) {
      return !jointIds || jointIds.indexOf(id) >= 0;
    });
    if (src.shelfInputs && typeof src.shelfInputs === "object") {
      Object.keys(src.shelfInputs).forEach(function (shelfId) {
        if (shelfIds && shelfIds.indexOf(shelfId) < 0) return;
        const row = src.shelfInputs[shelfId] || {};
        const loadKg = Number(row.loadKg);
        if (!Number.isFinite(loadKg) || loadKg < 0) return;
        state.shelfInputs[shelfId] = { loadKg: loadKg, supports: cleanSupports(row.supports, beamIds) };
      });
    }
    const k = Number(src.effectiveLengthFactor);
    state.effectiveLengthFactor = finitePositive(k) ? k : null;
    const limits = src.referenceLimits || {};
    const stress = Number(limits.maxBendingStressMPa);
    const ratio = Number(limits.maxDeflectionRatio);
    state.referenceLimits.maxBendingStressMPa = finitePositive(stress) ? stress : null;
    state.referenceLimits.maxDeflectionRatio = finitePositive(ratio) ? ratio : null;
    return state;
  }
  function snapshot(state) { return normalize(state); }
  function setShelfInput(state, shelfId, input) {
    if (!state || typeof shelfId !== "string" || !shelfId) return false;
    if (input == null) { delete state.shelfInputs[shelfId]; return true; }
    const kg = Number(input.loadKg);
    if (!Number.isFinite(kg) || kg < 0) return false;
    state.shelfInputs[shelfId] = { loadKg: kg, supports: cleanSupports(input.supports) };
    return true;
  }
  function buildRequest(state, shelfIds) {
    const issues = [];
    const loads = [];
    const allowed = new Set(shelfIds || Object.keys(state.shelfInputs || {}));
    Object.keys(state.shelfInputs || {}).forEach(function (shelfId) {
      if (!allowed.has(shelfId)) return;
      const row = state.shelfInputs[shelfId];
      const sum = (row.supports || []).reduce(function (n, item) { return n + Number(item.share || 0); }, 0);
      if (!row.supports || !row.supports.length) issues.push("棚 " + shelfId + " の支持BEAMが未指定です。");
      else if (Math.abs(sum - 1) > EPS) issues.push("棚 " + shelfId + " の荷重分配率の合計は1にしてください。");
      loads.push({
        id: "shelf:" + shelfId,
        loadN: row.loadKg * G,
        supports: (row.supports || []).map(function (s) {
          const out = { beamId: s.beamId, share: s.share, kind: s.kind || "uniform" };
          if (s.kind === "point") out.positionFromAMm = s.positionFromAMm;
          return out;
        }),
      });
    });
    return { shelfLoads: loads, issues: issues };
  }
  // 床支持候補は CAD の鉛直座標 y が全有効 JOINT の最小値と一致するものだけ。
  // LEG は候補化の条件にせず、既存設計の参考情報として返す。段差・異なる脚高さなどで
  // より高い JOINT を支持にしたい場合は、UI の手動指定で追加する。
  function floorSupportCandidates(joints, legs, toleranceMm) {
    const tolerance = Number(toleranceMm);
    const tol = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : DEFAULT_FLOOR_TOLERANCE_MM;
    const allJoints = (Array.isArray(joints) ? joints : []).map(function (joint, index) {
      if (!joint || typeof joint.id !== "string" || !joint.id || !Number.isFinite(joint.y)) return null;
      return { id: joint.id, index: index, xMm: Number(joint.x), yMm: Number(joint.y), zMm: Number(joint.z) };
    }).filter(Boolean);
    const legJointIds = new Set();
    (Array.isArray(legs) ? legs : []).forEach(function (leg) {
      if (!leg) return;
      if (typeof leg.jointId === "string" && leg.jointId) {
        legJointIds.add(leg.jointId);
        return;
      }
      if (Number.isInteger(leg.jointIndex)) {
        const joint = allJoints.find(function (row) { return row.index === leg.jointIndex; });
        if (joint) legJointIds.add(joint.id);
      }
    });
    if (!allJoints.length) return { toleranceMm: tol, lowestCadYMm: null, allJoints: [], candidates: [] };
    const lowestCadYMm = allJoints.reduce(function (lowest, joint) { return Math.min(lowest, joint.yMm); }, Infinity);
    const decorate = function (joint) {
      return Object.assign({}, joint, {
        hasLeg: legJointIds.has(joint.id),
        isLowest: Math.abs(joint.yMm - lowestCadYMm) <= tol,
      });
    };
    const decorated = allJoints.map(decorate);
    return {
      toleranceMm: tol,
      lowestCadYMm: lowestCadYMm,
      allJoints: decorated,
      candidates: decorated.filter(function (joint) { return joint.isLowest; }),
    };
  }
  return { GRAVITY_N_PER_KG: G, DEFAULT_FLOOR_TOLERANCE_MM: DEFAULT_FLOOR_TOLERANCE_MM, empty: empty, normalize: normalize, snapshot: snapshot, setShelfInput: setShelfInput, buildRequest: buildRequest, floorSupportCandidates: floorSupportCandidates };
});
