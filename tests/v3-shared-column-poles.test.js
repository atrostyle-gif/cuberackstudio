"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failed = [];
let passed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log("PASS  " + name + (detail ? "  " + detail : ""));
  } else {
    failed.push(name + (detail ? " :: " + detail : ""));
    console.log("FAIL  " + name + (detail ? " :: " + detail : ""));
  }
}

function skuCount(poles) {
  const m = {};
  poles.forEach(function (p) {
    const k = String(p.lengthMm);
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function cloneScene(world) {
  return {
    joints: world.joints.map(function (j) { return { id: j.id, x: j.x, y: j.y, z: j.z }; }),
    beams: world.beams.map(function (b) { return { a: b.a, b: b.b }; }),
    poles: world.poles.map(function (p) {
      return { id: p.id, a: p.a, b: p.b, lengthMm: p.lengthMm, cad: p.cad };
    }),
    legs: world.legs.map(function (l) { return { jointIndex: l.jointIndex }; }),
  };
}

function sameScene(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function spatialConflicts(world) {
  const joints = world.joints;
  const poles = world.poles;
  const out = [];
  function colKey(p) {
    const a = joints[p.a];
    const b = joints[p.b];
    return (Math.round(((a.x + b.x) / 2) / 5) * 5) + "_" + (Math.round(((a.z + b.z) / 2) / 5) * 5);
  }
  function ySpan(p) {
    const a = joints[p.a];
    const b = joints[p.b];
    return { y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
  }
  for (let i = 0; i < poles.length; i++) {
    for (let j = i + 1; j < poles.length; j++) {
      if (colKey(poles[i]) !== colKey(poles[j])) continue;
      const A = ySpan(poles[i]);
      const B = ySpan(poles[j]);
      const overlap = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      const sameEnds = (poles[i].a === poles[j].a && poles[i].b === poles[j].b)
        || (poles[i].a === poles[j].b && poles[i].b === poles[j].a);
      if (overlap > 0.05 && !sameEnds) out.push([poles[i].lengthMm, poles[j].lengthMm]);
    }
  }
  return out;
}

function makeWorld() {
  const joints = [];
  const beams = [];
  const poles = [];
  const legs = [];
  const history = [];
  const alerts = [];
  const sandbox = {
    console: { log: function () {}, warn: function () {}, error: console.error },
    Array: Array,
    Object: Object,
    Math: Math,
    Number: Number,
    String: String,
    JSON: JSON,
    Map: Map,
    Set: Set,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    Infinity: Infinity,
    NaN: NaN,
    joints: joints,
    jointMeshes: [],
    beams: beams,
    poles: poles,
    legs: legs,
    jointClusters: [],
    jointClusterId: [],
    saveHistory: function () {
      history.push(cloneScene({ joints: joints, beams: beams, poles: poles, legs: legs }));
    },
    disposeJointMeshByIndex: function () {},
    disposeBeamMesh: function () {},
    disposePoleMesh: function () {},
    disposeLegMesh: function () {},
    calcAndRenderEstimate: function () {},
    rebuildJointClusters: function () {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.document = { getElementById: function () { return null; }, addEventListener: function () {} };
  sandbox.window.addEventListener = function () {};
  sandbox.window.v3WorkLayers = null;
  sandbox.window.setSelectedJoint = function () {};
  sandbox.window.clearBoardSelection = function () {};
  sandbox.window.remapBoardsForJointIndexMap = function () {};
  sandbox.window.alert = function (msg) { alerts.push(String(msg || "")); };
  sandbox.window.POLE_LENGTH_OPTIONS = [50, 100, 200, 300, 400, 500, 600, 800];

  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/app/dimension-utils.js"), "utf8"),
    sandbox,
    { filename: "dimension-utils.js" }
  );

  sandbox.window.createJoint = function (pos) {
    const id = "J" + joints.length;
    joints.push({ id: id, x: pos.x, y: pos.y, z: pos.z });
    sandbox.jointMeshes.push({ position: { x: pos.x, y: pos.y, z: pos.z } });
    return joints.length - 1;
  };
  sandbox.window.hasPoleBetween = function (a, b) {
    return poles.some(function (p) {
      return (p.a === a && p.b === b) || (p.a === b && p.b === a);
    });
  };
  sandbox.window.hasBeamBetween = function (a, b) {
    return beams.some(function (p) {
      return (p.a === a && p.b === b) || (p.a === b && p.b === a);
    });
  };
  sandbox.window.addBeamConnection = function (a, b) {
    if (sandbox.window.hasBeamBetween(a, b)) return;
    beams.push({ a: a, b: b });
  };
  sandbox.window.addPoleConnection = function (a, b) {
    if (sandbox.window.hasPoleBetween(a, b)) return;
    const ja = joints[a];
    const jb = joints[b];
    const cad = Math.hypot(jb.x - ja.x, jb.y - ja.y, jb.z - ja.z);
    const sku = sandbox.window.getPoleSkuFromCadMm(cad);
    poles.push({
      id: "P" + poles.length,
      a: a,
      b: b,
      lengthMm: sku,
      cad: cad,
    });
  };
  sandbox.window.addLegIfNeeded = function (i) {
    if (legs.some(function (l) { return l.jointIndex === i; })) return;
    legs.push({ jointIndex: i });
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/features/autolayout.js"), "utf8"),
    sandbox,
    { filename: "autolayout.js" }
  );

  function cfgFor(cols, rows, heights) {
    const widthLens = [];
    const depthLens = [];
    const enabledMatrix = [];
    const stageMatrix = [];
    for (let c = 0; c < cols; c++) widthLens.push(200);
    for (let r = 0; r < rows; r++) {
      depthLens.push(200);
      const en = [];
      const st = [];
      for (let c = 0; c < cols; c++) {
        en.push(true);
        const h = heights[r][c];
        st.push({ stages: h.length, heights: h.slice() });
      }
      enabledMatrix.push(en);
      stageMatrix.push(st);
    }
    return {
      cols: cols,
      rows: rows,
      widthLens: widthLens,
      depthLens: depthLens,
      enabledMatrix: enabledMatrix,
      stageMatrix: stageMatrix,
      raiseBottom: false,
      bottomBeams: true,
    };
  }

  return {
    sandbox: sandbox,
    joints: joints,
    beams: beams,
    poles: poles,
    legs: legs,
    alerts: alerts,
    history: history,
    cfgFor: cfgFor,
    build: function (cols, rows, heights) {
      alerts.length = 0;
      return sandbox.buildAutoLayoutFromMatrix(cfgFor(cols, rows, heights), "replace");
    },
    restore: function (snap) {
      joints.length = 0;
      beams.length = 0;
      poles.length = 0;
      legs.length = 0;
      sandbox.jointMeshes.length = 0;
      snap.joints.forEach(function (j) {
        joints.push({ id: j.id, x: j.x, y: j.y, z: j.z });
        sandbox.jointMeshes.push({ position: { x: j.x, y: j.y, z: j.z } });
      });
      snap.beams.forEach(function (b) { beams.push({ a: b.a, b: b.b }); });
      snap.poles.forEach(function (p) {
        poles.push({ id: p.id, a: p.a, b: p.b, lengthMm: p.lengthMm, cad: p.cad });
      });
      snap.legs.forEach(function (l) { legs.push({ jointIndex: l.jointIndex }); });
    },
  };
}

const world = makeWorld();
const W = world.sandbox.window;

ok("planSharedColumnPoles が公開", typeof W.planSharedColumnPoles === "function");
ok("600 のYは 200+400 に包含", W.ySetContains(
  W.cellStageYLevels([200, 400], 0),
  W.cellStageYLevels([600], 0)
) === true);
ok("200+400 は 300+300 に包含されない", W.ySetContains(
  W.cellStageYLevels([200, 400], 0),
  W.cellStageYLevels([300, 300], 0)
) === false);
ok("100 は 50+50 に包含", W.ySetContains(
  W.cellStageYLevels([50, 50], 0),
  W.cellStageYLevels([100], 0)
) === true);

function planFor(heights) {
  const cols = heights[0].length;
  const rows = heights.length;
  const enabled = [];
  const stage = [];
  for (let r = 0; r < rows; r++) {
    enabled[r] = [];
    stage[r] = [];
    for (let c = 0; c < cols; c++) {
      enabled[r][c] = true;
      stage[r][c] = { stages: heights[r][c].length, heights: heights[r][c].slice() };
    }
  }
  return W.planSharedColumnPoles({
    depthCount: rows,
    widthCount: cols,
    enabledMatrix: enabled,
    stageData: stage,
    stageBaseY: 0,
  });
}

ok("生成前計画: 200+400 vs 300+300 は競合", planFor([[[200, 400], [300, 300]]]).ok === false);
ok("生成前計画: 2x2 中央競合", planFor([
  [[600], [200, 400]],
  [[300, 300], [600]],
]).ok === false);
ok("生成前計画: 600 vs 200+400 は通過", planFor([[[600], [200, 400]]]).ok === true);

const same600 = world.build(2, 1, [[[600], [600]]]);
ok("2列同構成600 は成功", same600 && same600.ok === true);
ok("2列同構成600 POLE600×6", world.poles.length === 6 && skuCount(world.poles)["600"] === 6, JSON.stringify(skuCount(world.poles)));
ok("2列同構成600 空間競合なし", spatialConflicts(world).length === 0);
ok("2列同構成600 JB12 BEAM14 LEG6", world.joints.length === 12 && world.beams.length === 14 && world.legs.length === 6,
  "j=" + world.joints.length + " b=" + world.beams.length + " l=" + world.legs.length);

const mixed = world.build(2, 1, [[[600], [200, 400]]]);
ok("左600右200+400 は成功", mixed && mixed.ok === true);
ok("左600右200+400 合計10本", world.poles.length === 10, "poles=" + world.poles.length);
ok("左600右200+400 SKU", skuCount(world.poles)["600"] === 2 && skuCount(world.poles)["200"] === 4 && skuCount(world.poles)["400"] === 4,
  JSON.stringify(skuCount(world.poles)));
ok("左600右200+400 空間競合なし", spatialConflicts(world).length === 0);
ok("左600右200+400 JB16 BEAM18 LEG6", world.joints.length === 16 && world.beams.length === 18 && world.legs.length === 6,
  "j=" + world.joints.length + " b=" + world.beams.length + " l=" + world.legs.length);

const three = world.build(3, 1, [[[600], [200, 400], [600]]]);
ok("600/200+400/600 は成功", three && three.ok === true);
ok("600/200+400/600 合計12本", world.poles.length === 12, "poles=" + world.poles.length);
ok("600/200+400/600 SKU", skuCount(world.poles)["600"] === 4 && skuCount(world.poles)["200"] === 4 && skuCount(world.poles)["400"] === 4,
  JSON.stringify(skuCount(world.poles)));
ok("600/200+400/600 JB20 BEAM24 LEG8", world.joints.length === 20 && world.beams.length === 24 && world.legs.length === 8,
  "j=" + world.joints.length + " b=" + world.beams.length + " l=" + world.legs.length);

const threeMix = world.build(3, 1, [[[200, 400], [600], [300, 300]]]);
ok("200+400/600/300+300 は成功", threeMix && threeMix.ok === true);
ok("200+400/600/300+300 合計16本", world.poles.length === 16, "poles=" + world.poles.length);
ok("200+400/600/300+300 SKU", skuCount(world.poles)["200"] === 4 && skuCount(world.poles)["400"] === 4 && skuCount(world.poles)["300"] === 8 && !skuCount(world.poles)["600"],
  JSON.stringify(skuCount(world.poles)));
ok("200+400/600/300+300 JB24 BEAM28 LEG8", world.joints.length === 24 && world.beams.length === 28 && world.legs.length === 8,
  "j=" + world.joints.length + " b=" + world.beams.length + " l=" + world.legs.length);

const beforeConflict = cloneScene(world);
world.alerts.length = 0;
const conflictAdj = world.build(2, 1, [[[200, 400], [300, 300]]]);
ok("200+400 vs 300+300 は中止", conflictAdj && conflictAdj.ok === false && conflictAdj.conflict === true);
ok("200+400 vs 300+300 警告あり", world.alerts.length === 1 && world.alerts[0].indexOf("中止") >= 0);
ok("200+400 vs 300+300 既存CAD不変", sameScene(beforeConflict, cloneScene(world)));
ok("200+400 vs 300+300 ポール増えない", world.poles.length === 16);

const centerBefore = cloneScene(world);
world.alerts.length = 0;
const conflictCenter = world.build(2, 2, [
  [[600], [200, 400]],
  [[300, 300], [600]],
]);
ok("2列2行中央競合は中止", conflictCenter && conflictCenter.ok === false);
ok("2列2行中央競合は既存不変", sameScene(centerBefore, cloneScene(world)));
ok("2列2行 警告に共有柱", world.alerts[0] && world.alerts[0].indexOf("競合する柱") >= 0);

const pole50 = world.build(2, 1, [[[100], [50, 50]]]);
ok("POLE50包含は成功", pole50 && pole50.ok === true);
ok("POLE50包含 SKU", skuCount(world.poles)["100"] === 2 && skuCount(world.poles)["50"] === 8 && world.poles.length === 10,
  JSON.stringify(skuCount(world.poles)) + " n=" + world.poles.length);
ok("POLE50包含 空間競合なし", spatialConflicts(world).length === 0);

const pole50vs600 = world.build(2, 1, [[[600], Array(12).fill(50)]]);
ok("POLE50×12 vs 600 は包含成功", pole50vs600 && pole50vs600.ok === true);
ok("POLE50×12 vs 600 SKU", skuCount(world.poles)["600"] === 2 && skuCount(world.poles)["50"] === 48 && world.poles.length === 50,
  JSON.stringify(skuCount(world.poles)) + " n=" + world.poles.length);

const one = world.build(1, 1, [[[600]]]);
ok("1列1段 基準 600×4", world.poles.length === 4 && skuCount(world.poles)["600"] === 4);
ok("1列1段 JB8 BEAM8 LEG4", world.joints.length === 8 && world.beams.length === 8 && world.legs.length === 4);

const snap1 = cloneScene(world);
const histBefore = world.history.length;
const twoMixed = world.build(2, 1, [[[600], [200, 400]]]);
ok("Undo用に2列混在を生成", twoMixed && twoMixed.ok === true && world.poles.length === 10);
const snap2 = cloneScene(world);
ok("履歴が保存される", world.history.length > histBefore);
world.restore(snap1);
ok("Undo相当で 600×4 に戻る", world.poles.length === 4 && skuCount(world.poles)["600"] === 4);
world.restore(snap2);
ok("Redo相当で 10本に戻る", world.poles.length === 10 && skuCount(world.poles)["600"] === 2);

const json = JSON.stringify(snap2);
const loaded = JSON.parse(json);
ok("保存JSONはポール10本のまま", loaded.poles.length === 10);
world.restore(loaded);
ok("再読込後も SKU 維持", skuCount(world.poles)["600"] === 2 && skuCount(world.poles)["200"] === 4 && skuCount(world.poles)["400"] === 4);

world.alerts.length = 0;
const raiseCfg = world.cfgFor(2, 1, [[[600], [200, 400]]]);
raiseCfg.raiseBottom = true;
raiseCfg.bottomBeams = false;
raiseCfg.raiseHeightMm = 100;
const raiseMixed = world.sandbox.buildAutoLayoutFromMatrix(raiseCfg, "replace");
ok("立ち上げ100+混在は成功", raiseMixed && raiseMixed.ok === true);
ok("立ち上げ100+混在 空間競合なし", spatialConflicts(world).length === 0);
ok("立ち上げPOLE100は CAD109×6", world.poles.filter(function (p) { return Math.abs(p.cad - 109) < 1e-6; }).length === 6);
ok("立ち上げ後も上段SKU維持", skuCount(world.poles)["100"] === 6 && skuCount(world.poles)["200"] === 4 && skuCount(world.poles)["400"] === 4 && skuCount(world.poles)["600"] === 2,
  JSON.stringify(skuCount(world.poles)));

world.restore(snap2);
const extra = cloneScene(world);
extra.poles.push({
  id: "Plegacy",
  a: extra.poles[0].a,
  b: extra.poles[0].b,
  lengthMm: extra.poles[0].lengthMm,
  cad: extra.poles[0].cad,
});
world.restore(extra);
ok("既存重複データは読込時に自動修復しない", world.poles.length === 11);

const fileSrc = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
ok("file.js は柱計画で座標を書き換えない", fileSrc.indexOf("planSharedColumnPoles") < 0);
ok("file.js はポール配列をそのまま復元", fileSrc.indexOf("(data.poles || []).forEach") >= 0);

const autoSrc = fs.readFileSync(path.join(root, "js/features/autolayout.js"), "utf8");
ok("生成前に柱構成を検証", autoSrc.indexOf("planSharedColumnPoles") >= 0 && autoSrc.indexOf("columnPolePlan.ok") >= 0);
ok("競合時はシーンクリアより前に return", autoSrc.indexOf("notifySharedColumnConflict") < autoSrc.indexOf("joints.length      = 0"));
ok("ポール生成はセル四隅ループでない", autoSrc.indexOf("connectPole(prevJ00, j00)") < 0);

const estimateLike = {};
world.restore(snap2);
world.poles.forEach(function (p) {
  const resolved = W.resolvePoleSkuForEstimate(p, p.cad);
  const sku = resolved && resolved.skuMm;
  estimateLike[sku] = (estimateLike[sku] || 0) + 1;
});
ok("見積SKUはCAD本数に一致", estimateLike[200] === 4 && estimateLike[400] === 4 && estimateLike[600] === 2,
  JSON.stringify(estimateLike));

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
