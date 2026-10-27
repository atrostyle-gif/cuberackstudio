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

const sandbox = {
  window: {},
  console: console,
  Math: Math,
  Number: Number,
  String: String,
  Object: Object,
  Array: Array,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  Infinity: Infinity,
  NaN: NaN,
};
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/app/dimension-utils.js"), "utf8"),
  sandbox,
  { filename: "dimension-utils.js" }
);

const W = sandbox.window;
const H = (n) => W.calcPoleOuterHeightMm(Array(n).fill(600));

ok("モデル版 v31-h1", W.HEIGHT_MODEL_VERSION === "v31-h1");
ok("JB全高 18.2", W.getVerticalJbHeightMm() === 18.2);
ok("JB半高 9.1", W.getVerticalJbHalfMm() === 9.1);
ok("LEG 12.9", W.getLegHeightMm() === 12.9);
ok("TC 2.2", W.getTopCapHeightMm() === 2.2);
ok("床〜JB中心 22.0", W.getFloorToBottomJbCenterMm() === 22);
ok("LEG+JB 31.1", W.getLegJbStackMm() === 31.1);
ok("SKU600→CAD 654.7", W.getPoleCadMmFromSku(600) === 654.7);
ok("CAD654.7→SKU 600", W.getPoleSkuFromCadMm(654.7) === 600);
ok("旧CAD600はSKU600のまま", W.getPoleSkuFromCadMm(600) === 600);
ok("SKU100→CAD 108.8", W.getPoleCadMmFromSku(100) === 108.8);
ok("CAD108.8→SKU 100", W.getPoleSkuFromCadMm(108.8) === 100);
ok("旧CAD100はSKU100のまま", W.getPoleSkuFromCadMm(100) === 100);
ok("未実測300は名目のまま", W.getPoleCenterPitchMm(300) === 300);
ok("Beam体系を呼ばない", W.getBeamEffectiveLengthMm(600) === 636.7);
ok("POLE100有効長テーブルは90.8のまま", W.getPoleEffectiveLengthMm(100) === 90.8);

ok("N=1 外寸 688.0", Math.abs(H(1) - 688) < 1e-9, String(H(1)));
ok("N=2 外寸 1342.7", Math.abs(H(2) - 1342.7) < 1e-9, String(H(2)));
ok("N=4 外寸 2652.1", Math.abs(H(4) - 2652.1) < 1e-9, String(H(4)));
ok("100+600×4 外寸 2760.9", Math.abs(W.calcPoleOuterHeightMm([100, 600, 600, 600, 600]) - 2760.9) < 1e-9, String(W.calcPoleOuterHeightMm([100, 600, 600, 600, 600])));
ok("芯々 N=4 は 2618.8", Math.abs(W.calcPoleCenterToCenterHeightMm([600, 600, 600, 600]) - 2618.8) < 1e-9);

ok("CAD span から外々", Math.abs(W.calcFrameOuterHeightMm(2618.8, true, true) - 2652.1) < 1e-9);
ok("旧600ピッチの span は変換しない", Math.abs(W.calcFrameOuterHeightMm(2400, true, true) - 2433.3) < 1e-9);

ok("新規判定", W.inferHeightModelFromGeometry(
  [{ x: 0, y: 0, z: 0 }, { x: 0, y: 654.7, z: 0 }],
  [{ a: 0, b: 1 }]
) === "v31-h1");
ok("旧データ判定", W.inferHeightModelFromGeometry(
  [{ x: 0, y: 0, z: 0 }, { x: 0, y: 600, z: 0 }],
  [{ a: 0, b: 1 }]
) === "legacy");
ok("混在判定", W.inferHeightModelFromGeometry(
  [{ x: 0, y: 0, z: 0 }, { x: 0, y: 600, z: 0 }, { x: 200, y: 0, z: 0 }, { x: 200, y: 654.7, z: 0 }],
  [{ a: 0, b: 1 }, { a: 2, b: 3 }]
) === "mixed");
ok("新規POLE100判定", W.inferHeightModelFromGeometry(
  [{ x: 0, y: 0, z: 0 }, { x: 0, y: 108.8, z: 0 }],
  [{ a: 0, b: 1 }]
) === "v31-h1");
ok("旧POLE100判定", W.inferHeightModelFromGeometry(
  [{ x: 0, y: 0, z: 0 }, { x: 0, y: 100, z: 0 }],
  [{ a: 0, b: 1 }]
) === "legacy");
ok("100旧+600新は混在", W.inferHeightModelFromGeometry(
  [{ x: 0, y: 0, z: 0 }, { x: 0, y: 100, z: 0 }, { x: 200, y: 0, z: 0 }, { x: 200, y: 654.7, z: 0 }],
  [{ a: 0, b: 1 }, { a: 2, b: 3 }]
) === "mixed");

const alJoints = [];
const alBeams = [];
const alPoles = [];
const alLegs = [];
const alWorld = {
  console: console,
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
  joints: alJoints,
  jointMeshes: [],
  beams: alBeams,
  poles: alPoles,
  legs: alLegs,
  jointClusters: [],
  jointClusterId: [],
  saveHistory: function () {},
  disposeJointMeshByIndex: function () {},
  disposeBeamMesh: function () {},
  disposePoleMesh: function () {},
  disposeLegMesh: function () {},
  calcAndRenderEstimate: function () {},
  rebuildJointClusters: function () {},
};
alWorld.globalThis = alWorld;
alWorld.window = alWorld;
alWorld.window.getPoleCenterPitchMm = W.getPoleCenterPitchMm;
alWorld.window.getHeightModelVersion = W.getHeightModelVersion;
alWorld.window.createJoint = function (pos) {
  alJoints.push({ x: pos.x, y: pos.y, z: pos.z });
  alWorld.jointMeshes.push({ position: { x: pos.x, y: pos.y, z: pos.z } });
  return alJoints.length - 1;
};
alWorld.window.addBeamConnection = function (a, b) { alBeams.push({ a: a, b: b }); };
alWorld.window.addPoleConnection = function (a, b) { alPoles.push({ a: a, b: b }); };
alWorld.window.addLegIfNeeded = function (i) { if (alLegs.indexOf(i) < 0) alLegs.push(i); };
alWorld.window.setSelectedJoint = function () {};
alWorld.window.clearBoardSelection = function () {};
alWorld.window.remapBoardsForJointIndexMap = function () {};
alWorld.window.v3WorkLayers = null;
alWorld.window.addEventListener = function () {};
alWorld.document = { getElementById: function () { return null; }, addEventListener: function () {} };
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/features/autolayout.js"), "utf8"),
  alWorld,
  { filename: "autolayout.js" }
);

function buildAl(opts) {
  alJoints.length = 0;
  alBeams.length = 0;
  alPoles.length = 0;
  alLegs.length = 0;
  alWorld.jointMeshes.length = 0;
  alWorld.buildAutoLayoutFromMatrix({
    cols: 1,
    rows: 1,
    widthLens: [200],
    depthLens: [200],
    enabledMatrix: [[true]],
    stageMatrix: [[{ stages: opts.n, heights: opts.heights }]],
    raiseBottom: !!opts.raise,
    bottomBeams: opts.bottomBeams !== false,
  }, "replace");
}

buildAl({ n: 4, heights: [600, 600, 600, 600], raise: false });
const ys = alJoints.map(function (j) { return j.y; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
ok("autolayout OFF のY", ys.length === 5 && ys[0] === 0 && Math.abs(ys[1] - 654.7) < 1e-9 && Math.abs(ys[4] - 2618.8) < 1e-9, JSON.stringify(ys));
ok("autolayout 後の heightModel", alWorld.window.__cubeRackHeightModel === "v31-h1");
ok("Pole CAD 長は 654.7（SKUは接続側）", alPoles.length === 16 && Math.abs(
  Math.hypot(alJoints[alPoles[0].a].x - alJoints[alPoles[0].b].x, alJoints[alPoles[0].a].y - alJoints[alPoles[0].b].y, alJoints[alPoles[0].a].z - alJoints[alPoles[0].b].z) - 654.7
) < 1e-9);

buildAl({ n: 1, heights: [600], raise: false });
ok("N=1 CAD span 654.7 → 外々 688", Math.abs(W.calcFrameOuterHeightMm(
  Math.max.apply(null, alJoints.map(function (j) { return j.y; })) -
  Math.min.apply(null, alJoints.map(function (j) { return j.y; })),
  true, true
) - 688) < 1e-9);

buildAl({ n: 2, heights: [600, 600], raise: false });
ok("N=2 CAD span 1309.4 → 外々 1342.7", Math.abs(W.calcFrameOuterHeightMm(1309.4, true, true) - 1342.7) < 1e-9);

buildAl({ n: 4, heights: [600, 600, 600, 600], raise: true });
const ysR = alJoints.map(function (j) { return j.y; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
ok("立ち上げONは POLE100 を CAD 108.8", Math.abs(ysR[1] - 108.8) < 1e-9, JSON.stringify(ysR));
ok("立ち上げON + 600×4 の最上は 2727.6", Math.abs(ysR[ysR.length - 1] - (108.8 + 4 * 654.7)) < 1e-9, JSON.stringify(ysR));
ok("立ち上げON 外々 2760.9", Math.abs(W.calcFrameOuterHeightMm(ysR[ysR.length - 1] - ysR[0], true, true) - 2760.9) < 1e-9);

const raisePoles = alPoles.filter(function (p) {
  return Math.abs(Math.hypot(
    alJoints[p.a].x - alJoints[p.b].x,
    alJoints[p.a].y - alJoints[p.b].y,
    alJoints[p.a].z - alJoints[p.b].z
  ) - 108.8) < 1e-9;
});
ok("立ち上げ Pole CAD 長は 108.8", raisePoles.length === 4);

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok("dimension-utils キャッシュ", indexSrc.indexOf("dimension-utils.js?v=20261027-sku1") >= 0);
ok("autolayout キャッシュ", indexSrc.indexOf("autolayout.js?v=20261027-h1b") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
