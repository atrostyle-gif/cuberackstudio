// =========================================================
// V3 Beam / Pole 接続構造の正規化
// - 同一クラスタ内で部材途中の Joint で分割
// - 同一端点ペアの同種部材を1本に統合
// - 長さは Joint 中心間距離。規格外なら確定しない
// - 独立ラックは座標が重なっても対象外
// =========================================================
(function () {
  const EPS = 0.5;
  const MIN_SEG = 1;

  function joints() { return window.joints || []; }
  function beams() { return window.beams || []; }
  function poles() { return window.poles || []; }

  function pairKey(a, b) {
    return a < b ? a + ":" + b : b + ":" + a;
  }

  function hypot3(a, b) {
    if (!a || !b) return -1;
    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
  }

  function sameRack(a, b) {
    if (!a || !b) return false;
    if (typeof a.rackId !== "string" || typeof b.rackId !== "string") return false;
    return !!a.rackId && a.rackId === b.rackId;
  }

  function presetsOf(kind) {
    if (kind === "pole") return window.POLE_LENGTH_OPTIONS || [50, 100, 200, 300, 400, 500, 600, 800];
    return window.BEAM_LENGTH_OPTIONS || [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
  }

  function isAllowedLength(kind, mm) {
    let check = Number(mm);
    if (kind === "pole" && typeof window.getPoleSkuFromCadMm === "function") {
      check = window.getPoleSkuFromCadMm(mm);
    }
    const len = Math.round(check);
    if (!Number.isFinite(len) || len < MIN_SEG) return false;
    const presets = presetsOf(kind);
    for (let i = 0; i < presets.length; i++) {
      if (Math.abs(Number(presets[i]) - len) <= EPS) return true;
    }
    return false;
  }

  function onSegment(a, b, p) {
    if (!a || !b || !p) return null;
    const vx = (b.x || 0) - (a.x || 0);
    const vy = (b.y || 0) - (a.y || 0);
    const vz = (b.z || 0) - (a.z || 0);
    const len = Math.hypot(vx, vy, vz);
    if (len < MIN_SEG) return null;
    const wx = (p.x || 0) - (a.x || 0);
    const wy = (p.y || 0) - (a.y || 0);
    const wz = (p.z || 0) - (a.z || 0);
    const t = (wx * vx + wy * vy + wz * vz) / (len * len);
    const along = t * len;
    if (along < EPS || along > len - EPS) return null;
    const px = (a.x || 0) + t * vx;
    const py = (a.y || 0) + t * vy;
    const pz = (a.z || 0) + t * vz;
    const dist = Math.hypot((p.x || 0) - px, (p.y || 0) - py, (p.z || 0) - pz);
    if (dist > EPS) return null;
    return t;
  }

  function memberRackId(item) {
    const js = joints();
    const ja = js[item && item.a];
    const jb = js[item && item.b];
    if (!sameRack(ja, jb)) return null;
    return ja.rackId;
  }

  function splitChain(item) {
    const js = joints();
    const a = item && item.a;
    const b = item && item.b;
    const ja = js[a];
    const jb = js[b];
    if (!ja || !jb || a === b) return null;
    const rackId = memberRackId(item);
    if (!rackId) return [a, b];
    const mids = [];
    for (let i = 0; i < js.length; i++) {
      if (i === a || i === b) continue;
      const j = js[i];
      if (!j || j.rackId !== rackId) continue;
      const t = onSegment(ja, jb, j);
      if (t == null) continue;
      mids.push({ i: i, t: t });
    }
    if (!mids.length) return [a, b];
    mids.sort(function (x, y) { return x.t - y.t; });
    const chain = [a];
    for (let k = 0; k < mids.length; k++) {
      const idx = mids[k].i;
      const prev = js[chain[chain.length - 1]];
      if (hypot3(prev, js[idx]) < EPS) continue;
      if (hypot3(js[idx], jb) < EPS) continue;
      chain.push(idx);
    }
    chain.push(b);
    return chain;
  }

  function spanOf(a, b) {
    return hypot3(joints()[a], joints()[b]);
  }

  function posOf(index) {
    const j = joints()[index];
    if (!j) return null;
    return {
      i: index,
      id: j.id || null,
      x: j.x,
      y: j.y,
      z: j.z,
    };
  }

  function listOf(kind) {
    return kind === "pole" ? poles() : beams();
  }

  function disposeOf(kind, item) {
    if (!item) return;
    if (kind === "pole" && typeof window.disposePoleMesh === "function") window.disposePoleMesh(item);
    if (kind === "beam" && typeof window.disposeBeamMesh === "function") window.disposeBeamMesh(item);
  }

  function newId(kind) {
    if (kind === "pole" && typeof window.newPoleClientId === "function") return window.newPoleClientId();
    if (kind !== "pole" && typeof window.newBeamClientId === "function") return window.newBeamClientId();
    return null;
  }

  function materialOf(kind) {
    return kind === "pole" ? window.poleMaterial : window.beamMaterial;
  }

  function syncIds(item) {
    const js = joints();
    const ja = js[item.a];
    const jb = js[item.b];
    item.aId = (ja && typeof ja.id === "string") ? ja.id : null;
    item.bId = (jb && typeof jb.id === "string") ? jb.id : null;
    const dist = hypot3(ja, jb);
    item.lengthMm = dist;
    return dist;
  }

  function updateMesh(item) {
    const js = joints();
    const ja = js[item.a];
    const jb = js[item.b];
    if (!item.mesh || !ja || !jb) return;
    if (typeof window.updateConnectorMesh === "function") window.updateConnectorMesh(item.mesh, ja, jb);
  }

  function makeMember(kind, src, a, b) {
    const js = joints();
    const ja = js[a];
    const jb = js[b];
    const lengthMm = hypot3(ja, jb);
    let mesh = null;
    if (typeof window.createCylinderBetween === "function" && ja && jb) {
      mesh = window.createCylinderBetween(ja, jb, materialOf(kind));
      if (mesh && typeof window.applyMaterialColorToMesh === "function") {
        window.applyMaterialColorToMesh(mesh, src && src.material);
      }
    }
    return {
      id: newId(kind),
      type: kind,
      a: a,
      b: b,
      aId: (ja && typeof ja.id === "string") ? ja.id : null,
      bId: (jb && typeof jb.id === "string") ? jb.id : null,
      mesh: mesh,
      lengthMm: lengthMm,
      material: src && src.material,
      isCustom: false,
      customLength: null,
    };
  }

  function formatInvalid(invalid) {
    if (!invalid || !invalid.length) return "規格外の部材長が発生するため結合できません。";
    const seen = {};
    const parts = [];
    invalid.forEach(function (row) {
      const key = (row.kind === "pole" ? "Pole" : "Beam") + " " + row.lengthMm + "mm";
      if (seen[key]) return;
      seen[key] = true;
      parts.push(key);
    });
    return "結合すると規格外の" + parts.join("、") + "が発生するため結合できません。";
  }

  function planKind(kind, rackId) {
    const list = listOf(kind);
    const splits = [];
    const invalid = [];
    const proposed = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      const memberRack = memberRackId(item);
      if (rackId && memberRack !== rackId) continue;
      if (!memberRack) continue;
      const chain = splitChain(item) || [item.a, item.b];
      const segs = [];
      for (let s = 0; s < chain.length - 1; s++) {
        const a = chain[s];
        const b = chain[s + 1];
        const len = spanOf(a, b);
        const rounded = Math.round(len);
        segs.push({ a: a, b: b, lengthMm: rounded });
        proposed.push({ index: i, a: a, b: b, lengthMm: rounded, src: item });
        if (!isAllowedLength(kind, len)) {
          invalid.push({
            kind: kind,
            a: a,
            b: b,
            lengthMm: rounded,
            from: [item.a, item.b],
          });
        }
      }
      if (chain.length > 2) {
        splits.push({
          kind: kind,
          index: i,
          chain: chain.slice(),
          lengths: segs.map(function (seg) { return seg.lengthMm; }),
          coords: chain.map(posOf),
        });
      }
    }
    return { splits: splits, invalid: invalid, proposed: proposed };
  }

  function planDups(kind, rackId, proposed) {
    const keepOf = {};
    const dups = [];
    (proposed || []).forEach(function (row, i) {
      const js = joints();
      const ja = js[row.a];
      const jb = js[row.b];
      if (rackId && (!ja || ja.rackId !== rackId)) return;
      if (row.a === row.b || row.a < 0 || row.b < 0) {
        dups.push({ kind: kind, drop: i, reason: "degenerate" });
        return;
      }
      const key = pairKey(row.a, row.b);
      if (keepOf[key] == null) {
        keepOf[key] = i;
        return;
      }
      dups.push({
        kind: kind,
        keep: keepOf[key],
        drop: i,
        a: row.a,
        b: row.b,
        coords: [posOf(row.a), posOf(row.b)],
      });
    });
    return dups;
  }

  function buildPlan(opts) {
    opts = opts || {};
    const rackId = opts.rackId || null;
    const beam = planKind("beam", rackId);
    const pole = planKind("pole", rackId);
    const invalid = beam.invalid.concat(pole.invalid);
    return {
      rackId: rackId,
      beamSplits: beam.splits,
      poleSplits: pole.splits,
      beamDups: planDups("beam", rackId, beam.proposed),
      poleDups: planDups("pole", rackId, pole.proposed),
      invalid: invalid,
      beamProposed: beam.proposed,
      poleProposed: pole.proposed,
    };
  }

  function applySegment(item, a, b) {
    item.a = a;
    item.b = b;
    item.isCustom = false;
    item.customLength = null;
    syncIds(item);
    updateMesh(item);
  }

  function executeKind(kind, planSplits) {
    const list = listOf(kind);
    let created = 0;
    (planSplits || []).forEach(function (split) {
      const item = list[split.index];
      if (!item || !split.chain || split.chain.length < 3) return;
      const chain = split.chain;
      applySegment(item, chain[0], chain[1]);
      for (let s = 1; s < chain.length - 1; s++) {
        list.push(makeMember(kind, item, chain[s], chain[s + 1]));
        created++;
      }
    });
    return created;
  }

  function dedupeKind(kind, rackId) {
    const list = listOf(kind);
    const drop = {};
    const keepOf = {};
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) {
        drop[i] = true;
        continue;
      }
      const memberRack = memberRackId(item);
      if (rackId && memberRack !== rackId) continue;
      const a = item.a;
      const b = item.b;
      if (typeof a !== "number" || typeof b !== "number" || a < 0 || b < 0 || a === b) {
        drop[i] = true;
        continue;
      }
      const ja = joints()[a];
      const jb = joints()[b];
      if (!ja || !jb) {
        drop[i] = true;
        continue;
      }
      const key = pairKey(a, b);
      if (keepOf[key] == null) {
        keepOf[key] = i;
        continue;
      }
      const kept = list[keepOf[key]];
      const span = hypot3(ja, jb);
      const errKeep = Math.abs(Math.round((kept && kept.lengthMm) || 0) - Math.round(span));
      const errItem = Math.abs(Math.round(item.lengthMm || 0) - Math.round(span));
      if (errItem < errKeep) {
        drop[keepOf[key]] = true;
        keepOf[key] = i;
      } else {
        drop[i] = true;
      }
    }
    let dropped = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!drop[i]) {
        const item = list[i];
        if (item) syncIds(item);
        continue;
      }
      disposeOf(kind, list[i]);
      list.splice(i, 1);
      dropped++;
    }
    return dropped;
  }

  function inspectIntegrity() {
    const js = joints();
    let idBad = 0;
    let lenBad = 0;
    let midBeams = 0;
    let midPoles = 0;
    let dupBeams = 0;
    let dupPoles = 0;
    function walk(kind) {
      const list = listOf(kind);
      const seen = {};
      let mids = 0;
      let dups = 0;
      let ids = 0;
      let lens = 0;
      (list || []).forEach(function (item) {
        if (!item) return;
        const ja = js[item.a];
        const jb = js[item.b];
        if (!ja || !jb) {
          ids++;
          return;
        }
        if (item.aId && item.aId !== ja.id) ids++;
        if (item.bId && item.bId !== jb.id) ids++;
        const dist = Math.round(hypot3(ja, jb));
        if (dist !== Math.round(item.lengthMm || 0)) lens++;
        const chain = splitChain(item);
        if (chain && chain.length > 2) mids++;
        const key = pairKey(item.a, item.b);
        if (seen[key]) dups++;
        else seen[key] = true;
      });
      return { mids: mids, dups: dups, ids: ids, lens: lens };
    }
    const b = walk("beam");
    const p = walk("pole");
    return {
      idBad: b.ids + p.ids,
      lenBad: b.lens + p.lens,
      midBeams: b.mids,
      midPoles: p.mids,
      dupBeams: b.dups,
      dupPoles: p.dups,
    };
  }

  function applyNormalize(opts) {
    opts = opts || {};
    const plan = buildPlan(opts);
    if (plan.invalid.length) {
      return {
        ok: false,
        reason: formatInvalid(plan.invalid),
        plan: plan,
      };
    }
    if (opts.dryRun) {
      return { ok: true, plan: plan };
    }
    const beamCreated = executeKind("beam", plan.beamSplits);
    const poleCreated = executeKind("pole", plan.poleSplits);
    const beamDropped = dedupeKind("beam", opts.rackId || null);
    const poleDropped = dedupeKind("pole", opts.rackId || null);
    const result = {
      ok: true,
      plan: plan,
      beamSplits: plan.beamSplits.length,
      poleSplits: plan.poleSplits.length,
      beamCreated: beamCreated,
      poleCreated: poleCreated,
      beamDropped: beamDropped,
      poleDropped: poleDropped,
      integrity: inspectIntegrity(),
    };
    window.__v3LastNormalize = result;
    return result;
  }

  window.v3NormalizeConnectors = {
    EPS: EPS,
    plan: buildPlan,
    apply: applyNormalize,
    inspect: inspectIntegrity,
    isAllowedLength: isAllowedLength,
  };
})();
