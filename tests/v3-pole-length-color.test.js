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
  fs.readFileSync(path.join(root, "js/utils/common.js"), "utf8"),
  sandbox,
  { filename: "common.js" }
);
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/app/dimension-utils.js"), "utf8"),
  sandbox,
  { filename: "dimension-utils.js" }
);
sandbox.window.POLE_LENGTH_OPTIONS = [50, 100, 200, 300, 400, 500, 600, 800];
const W = sandbox.window;

ok("CAD 218 → SKU 200", W.getPoleSkuFromCadMm(218) === 200);
ok("CAD 436 → SKU 400", W.getPoleSkuFromCadMm(436) === 400);
ok("CAD 654 → SKU 600", W.getPoleSkuFromCadMm(654) === 600);
ok("CAD 54.5 → SKU 50", W.getPoleSkuFromCadMm(54.5) === 50);

ok("色長さは lengthMm=200 を使う（CAD218でも）", W.getPoleColorLengthMm({ lengthMm: 200 }, 218) === 200);
ok("色長さは lengthMm=400 を使う（CAD436でも）", W.getPoleColorLengthMm({ lengthMm: 400 }, 436) === 400);
ok("色長さは lengthMm=600 を使う（CAD654でも）", W.getPoleColorLengthMm({ lengthMm: 600 }, 654) === 600);
ok("POLE50 は 50", W.getPoleColorLengthMm({ lengthMm: 50 }, 54.5) === 50);
ok("Custom 450 は丸めない", W.getPoleColorLengthMm({ isCustom: true, customLength: 450, lengthMm: 450 }, 450) === 450);
ok("CADのみでも SKU に戻す", W.getPoleColorLengthMm({}, 218) === 200);

const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
ok("LENGTH_COLOR_MAP 200 は赤", mainSrc.indexOf('200: "#ef4444"') >= 0);
ok("LENGTH_COLOR_MAP 400 は緑", mainSrc.indexOf('400: "#10b981"') >= 0);
ok("LENGTH_COLOR_MAP 600 は紫", mainSrc.indexOf('600: "#a855f7"') >= 0);
ok("LENGTH_COLOR_MAP 50 はオレンジ", mainSrc.indexOf('50: "#f97316"') >= 0);
ok("色分けは poleColorLengthMm を使う", mainSrc.indexOf("const len = poleColorLengthMm(p);") >= 0);
ok("getPoleLength は CAD 距離のまま", /function getPoleLength\(p\) \{[\s\S]{0,220}Math\.hypot/.test(mainSrc));
ok("図面 colorLengthMm は SKU", mainSrc.indexOf("getPoleColorLengthMm(c,") >= 0);

const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
ok("インスタンス色も SKU", poolSrc.indexOf("getPoleColorLengthMm") >= 0);

const captureSrc = fs.readFileSync(path.join(root, "js/app/drawing-capture.js"), "utf8");
ok("図面凡例も SKU", captureSrc.indexOf("getPoleColorLengthMm") >= 0);
ok("外形計算の CAD 参照は残す", captureSrc.indexOf("if (typeof window.getPoleLength === \"function\") return window.getPoleLength(p);") >= 0);

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok("キャッシュ sku1", indexSrc.indexOf("dimension-utils.js?v=20261028-sku1") >= 0
  && indexSrc.indexOf("main.js?v=20261028-sku1") >= 0
  && indexSrc.indexOf("v3-instance-pool.js?v=20261028-sku1") >= 0);

function skuCount(poles) {
  const m = {};
  poles.forEach(function (p) {
    const k = String(W.getPoleColorLengthMm(p, p.cad));
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

const joints = [];
const beams = [];
const poles = [];
const legs = [];
const alerts = [];
const al = {
  console: { log: function () {}, warn: function () {}, error: console.error },
  Array: Array, Object: Object, Math: Math, Number: Number, String: String, JSON: JSON,
  Map: Map, Set: Set, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, Infinity: Infinity, NaN: NaN,
  joints: joints, jointMeshes: [], beams: beams, poles: poles, legs: legs,
  jointClusters: [], jointClusterId: [],
  saveHistory: function () {}, disposeJointMeshByIndex: function () {}, disposeBeamMesh: function () {},
  disposePoleMesh: function () {}, disposeLegMesh: function () {}, calcAndRenderEstimate: function () {},
  rebuildJointClusters: function () {},
};
al.globalThis = al;
al.window = al;
al.document = { getElementById: function () { return null; }, addEventListener: function () {} };
al.window.addEventListener = function () {};
al.window.v3WorkLayers = null;
al.window.setSelectedJoint = function () {};
al.window.clearBoardSelection = function () {};
al.window.remapBoardsForJointIndexMap = function () {};
al.window.alert = function (msg) { alerts.push(String(msg || "")); };
al.window.POLE_LENGTH_OPTIONS = [50, 100, 200, 300, 400, 500, 600, 800];
al.window.getPoleCenterPitchMm = W.getPoleCenterPitchMm;
al.window.getPoleSkuFromCadMm = W.getPoleSkuFromCadMm;
al.window.resolvePoleSkuForEstimate = W.resolvePoleSkuForEstimate;
al.window.getPoleColorLengthMm = W.getPoleColorLengthMm;
al.window.getHeightModelVersion = W.getHeightModelVersion;
al.window.createJoint = function (pos) {
  joints.push({ id: "J" + joints.length, x: pos.x, y: pos.y, z: pos.z });
  al.jointMeshes.push({ position: { x: pos.x, y: pos.y, z: pos.z } });
  return joints.length - 1;
};
al.window.addBeamConnection = function (a, b) { beams.push({ a: a, b: b }); };
al.window.addPoleConnection = function (a, b) {
  const ja = joints[a];
  const jb = joints[b];
  const cad = Math.hypot(jb.x - ja.x, jb.y - ja.y, jb.z - ja.z);
  const sku = W.getPoleSkuFromCadMm(cad);
  poles.push({ a: a, b: b, lengthMm: sku, cad: cad });
};
al.window.addLegIfNeeded = function (i) {
  if (legs.some(function (l) { return l.jointIndex === i; })) return;
  legs.push({ jointIndex: i });
};
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/features/autolayout.js"), "utf8"),
  al,
  { filename: "autolayout.js" }
);

al.buildAutoLayoutFromMatrix({
  cols: 2,
  rows: 2,
  widthLens: [200, 200],
  depthLens: [200, 200],
  enabledMatrix: [[true, true], [true, true]],
  stageMatrix: [
    [{ stages: 2, heights: [400, 200] }, { stages: 2, heights: [400, 200] }],
    [{ stages: 1, heights: [600] }, { stages: 1, heights: [600] }],
  ],
  raiseBottom: false,
  bottomBeams: true,
}, "replace");

const sku = skuCount(poles);
ok("手前400+200／奥600 の本数", poles.length === 15 && sku["200"] === 6 && sku["400"] === 6 && sku["600"] === 3,
  JSON.stringify(sku) + " n=" + poles.length);
ok("CAD 218 のPOLEも色SKUは200", poles.filter(function (p) { return Math.abs(p.cad - 218) < 0.05; }).every(function (p) {
  return W.getPoleColorLengthMm(p, p.cad) === 200;
}));
ok("CAD 436 のPOLEも色SKUは400", poles.filter(function (p) { return Math.abs(p.cad - 436) < 0.05; }).every(function (p) {
  return W.getPoleColorLengthMm(p, p.cad) === 400;
}));
ok("CAD 654 のPOLEも色SKUは600", poles.filter(function (p) { return Math.abs(p.cad - 654) < 0.05; }).every(function (p) {
  return W.getPoleColorLengthMm(p, p.cad) === 600;
}));
ok("JB/BEAM/LEGは色修正で変わらない", joints.length === 24 && beams.length === 31 && legs.length === 9,
  "j=" + joints.length + " b=" + beams.length + " l=" + legs.length);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
