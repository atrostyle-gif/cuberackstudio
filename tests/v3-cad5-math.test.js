"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const failed = [];
let passed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log("PASS  " + name);
  } else {
    failed.push(name + (detail ? " :: " + detail : ""));
    console.log("FAIL  " + name + (detail ? " :: " + detail : ""));
  }
}

function load(file, sandbox) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox;
}

const sandbox = {
  console: console,
  window: {},
  document: {
    getElementById: function () { return null; },
    addEventListener: function () {},
    createElement: function () { return { style: {}, appendChild: function () {}, addEventListener: function () {} }; },
  },
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  Set: Set,
  JSON: JSON,
  requestAnimationFrame: function (fn) { return 0; },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = function () {};

load("js/ui/v3-user-axes.js", sandbox);
load("js/utils/common.js", sandbox);
ok("parseLengthMm 整数", sandbox.parseLengthMm("200") === 200);
ok("parseLengthMm 小数", Math.abs(sandbox.parseLengthMm("50.7") - 50.7) < 1e-12);
ok("parseLengthMm 123.7", Math.abs(sandbox.parseLengthMm("123.7") - 123.7) < 1e-12);
ok("parseLengthMm 無効は null", sandbox.parseLengthMm("") == null && sandbox.parseLengthMm("0") == null);
ok("actualJointDistanceMm 50.7", Math.abs(sandbox.actualJointDistanceMm({ x: 0, y: 0, z: 0 }, { x: 50.7, y: 0, z: 0 }) - 50.7) < 1e-12);
ok("isPresetLengthMm 200", sandbox.isPresetLengthMm(200, [25, 50, 100, 150, 200, 300]) === true);
ok("isPresetLengthMm 50.7 は非規格", sandbox.isPresetLengthMm(50.7, [25, 50, 100, 150, 200, 300]) === false);
ok("estimateBucketMm 50.7→51", sandbox.estimateBucketMm(50.7) === 51);
ok("formatDesignMm 50.7", sandbox.formatDesignMm(50.7) === "50.7");
ok("formatDesignMm 200", sandbox.formatDesignMm(200) === "200");

const ua = sandbox.v3UserAxes;
ok("user X = three x", ua.threeOfUser("X") === "x");
ok("user Y = three z", ua.threeOfUser("Y") === "z");
ok("user Z = three y", ua.threeOfUser("Z") === "y");
ok("three y = user Z", ua.userOfThree("y") === "Z");
ok("three z = user Y", ua.userOfThree("z") === "Y");
ok("info(x) is user X red", ua.info("x").user === "X" && ua.info("x").css === "#ef4444" && ua.info("x").three === "x");
ok("info(z) is user Y green", ua.info("z").user === "Y" && ua.info("z").css === "#22c55e" && ua.info("z").three === "z");
ok("info(y) is user Z blue", ua.info("y").user === "Z" && ua.info("y").css === "#3b82f6" && ua.info("y").three === "y");
ok("info(Y) is depth not height", ua.info("Y").three === "z" && ua.info("Y").meaning === "奥行");
ok("info(Z) is height not depth", ua.info("Z").three === "y" && ua.info("Z").meaning === "高さ");
ok("normalizeUser y != Y", ua.normalizeUser("y") === "Z" && ua.normalizeUser("Y") === "Y");
ok("BS hidden from new select", JSON.stringify(sandbox.MATERIAL_SELECT_DISABLED) === JSON.stringify(["BS"]));
ok("IRON selectable", sandbox.isMaterialSelectable("IRON") === true);
ok("SUS selectable", sandbox.isMaterialSelectable("SUS") === true);
ok("BS not selectable", sandbox.isMaterialSelectable("BS") === false);
ok("coerce BS -> IRON", sandbox.coerceSelectableMaterial("BS") === "IRON");

sandbox.joints = [
  { id: "j1", rackId: "rA", x: 0, y: 0, z: 0 },
  { id: "j2", rackId: "rA", x: 250, y: 0, z: 0 },
  { id: "j3", rackId: "rB", x: 400, y: 0, z: 0 },
];
sandbox.beams = [
  { id: "b1", a: 0, b: 1 },
];
sandbox.poles = [];
sandbox.jointRadius = 10;
sandbox.connectorRadius = 6.5;
sandbox.scene = null;
sandbox.THREE = null;
sandbox.v3WorkspaceUi = { getOpenPopupId: function () { return null; } };

load("js/ui/v3-measure.js", sandbox);
const m = sandbox.v3Measure;

const liveJointA = m.resolveRef({ kind: "joint", id: "j1", index: 0 });
const liveJointB = m.resolveRef({ kind: "joint", id: "j2", index: 1 });
ok("resolve joint A", !!(liveJointA && liveJointA.point && liveJointA.point.x === 0));
ok("resolve joint B", !!(liveJointB && liveJointB.point && liveJointB.point.x === 250));

const c2c = m.axisValue("芯々", liveJointA, liveJointB, "x");
ok("芯々 X = 250", c2c.ok && Math.abs(c2c.mm - 250) < 0.01, JSON.stringify(c2c));

const inner = m.axisValue("内々", liveJointA, liveJointB, "x");
ok("内々 X = 230 (250-20)", inner.ok && Math.abs(inner.mm - 230) < 0.01, JSON.stringify(inner));

const outer = m.axisValue("外々", liveJointA, liveJointB, "x");
ok("外々 X = 270 (250+20)", outer.ok && Math.abs(outer.mm - 270) < 0.01, JSON.stringify(outer));

const overlapA = m.resolveRef({ kind: "joint", id: "j1", index: 0 });
const overlapB = {
  kind: "joint",
  rackId: "rA",
  point: { x: 5, y: 0, z: 0 },
};
const overlapInner = m.axisValue("内々", overlapA, overlapB, "x");
ok("重なり内々は拒否", overlapInner.ok === false, JSON.stringify(overlapInner));

const liveBeam = m.resolveRef({ kind: "beam", id: "b1", index: 0, t: 0.5 });
ok("beam は軸平行", m.memberAlign(liveBeam.a, liveBeam.b) === "x");
const perpOuter = m.axisValue("外々", liveJointA, liveBeam, "z");
ok("入れ子の外々は大きい方の直径", perpOuter.ok && Math.abs(perpOuter.mm - 20) < 0.01, JSON.stringify(perpOuter));
const liveFar = {
  kind: "joint",
  rackId: "rB",
  point: { x: 0, y: 0, z: 100 },
};
const perpInner = m.axisValue("内々", liveJointA, liveFar, "z");
ok("離れたZの内々は芯々-半径合計", perpInner.ok && Math.abs(perpInner.mm - 80) < 0.01, JSON.stringify(perpInner));

const diag = { x: 0, y: 0, z: 0 };
const diagB = { x: 100, y: 80, z: 40 };
ok("斜め部材は aligned=null", m.memberAlign(diag, diagB) === null);

sandbox.v3Measure.loadFromSnapshot({});
ok("旧JSON（measures無し）は空で復元", sandbox.v3Measure.list().length === 0);

const dim = m.makeDim("芯々", "x", { kind: "joint", id: "j1" }, { kind: "joint", id: "j3" }, true);
ok("ラック間寸法は両ラックを保持", dim.rackIds && dim.rackIds.indexOf("rA") >= 0 && dim.rackIds.indexOf("rB") >= 0, JSON.stringify(dim.rackIds));

sandbox.saved = null;
const snap = {
  measures: [{
    id: "keep-1",
    kind: "芯々",
    threeAxis: "x",
    userAxis: "X",
    refA: { kind: "joint", id: "j1" },
    refB: { kind: "joint", id: "j2" },
    rackIds: ["rA"],
    visible: true,
  }],
  measureUi: { globalVisible: true, rackVisible: { rA: true } },
};
sandbox.v3Measure.loadFromSnapshot(snap);
const listed = sandbox.v3Measure.list();
ok("保存寸法を復元", listed.length === 1 && listed[0].saved === true && Math.abs((listed[0].mm || 0) - 250) < 0.01, JSON.stringify(listed[0]));

sandbox.v3Measure.loadFromSnapshot({
  measures: [{
    id: "broken",
    kind: "芯々",
    threeAxis: "x",
    refA: { kind: "joint", id: "missing" },
    refB: { kind: "joint", id: "j2" },
    rackIds: ["rA"],
  }],
});
ok("参照切れは invalid", sandbox.v3Measure.list()[0].invalid === true);

const offA = { kind: "joint", rackId: "rA", point: { x: 0, y: 40, z: 10 } };
const offB = { kind: "joint", rackId: "rA", point: { x: 250, y: 180, z: 220 } };
const layX = m.layoutLine(offA, offB, "x", 250, "芯々", 0);
const layY = m.layoutLine(offA, offB, "z", 210, "芯々", 0);
const layZ = m.layoutLine(offA, offB, "y", 140, "芯々", 0);
ok("X寸法線は Three x に平行", !!(layX && m.isParallelToThreeAxis(layX.d0, layX.d1, "x") && layX.user === "X"), JSON.stringify(layX && { d0: layX.d0, d1: layX.d1, user: layX.user }));
ok("Y寸法線は Three z に平行", !!(layY && m.isParallelToThreeAxis(layY.d0, layY.d1, "z") && layY.user === "Y"), JSON.stringify(layY && { d0: layY.d0, d1: layY.d1, user: layY.user }));
ok("Z寸法線は Three y に平行", !!(layZ && m.isParallelToThreeAxis(layZ.d0, layZ.d1, "y") && layZ.user === "Z"), JSON.stringify(layZ && { d0: layZ.d0, d1: layZ.d1, user: layZ.user }));
ok("斜め2点でも寸法線は対角線にしない", !!(layX && layY && layZ
  && Math.abs(layX.d0.y - layX.d1.y) < 0.01 && Math.abs(layX.d0.z - layX.d1.z) < 0.01
  && Math.abs(layY.d0.x - layY.d1.x) < 0.01 && Math.abs(layY.d0.y - layY.d1.y) < 0.01
  && Math.abs(layZ.d0.x - layZ.d1.x) < 0.01 && Math.abs(layZ.d0.z - layZ.d1.z) < 0.01));
const box = m.dimAabb(offA, offB, ["rA"]);
ok("X寸法線はラック外側(+Z)", !!(layX && layX.d0.z > box.maxZ), JSON.stringify({ z: layX && layX.d0.z, maxZ: box.maxZ }));
ok("Y寸法線はラック外側(+X)", !!(layY && layY.d0.x > box.maxX), JSON.stringify({ x: layY && layY.d0.x, maxX: box.maxX }));
ok("Z寸法線はラック外側(+X+Z)", !!(layZ && layZ.d0.x > box.maxX && layZ.d0.z > box.maxZ), JSON.stringify({ x: layZ && layZ.d0.x, z: layZ && layZ.d0.z, box: box }));
ok("X補助線は軸平行折れ線", !!(layX && m.pathIsOrtho(layX.path0) && m.pathIsOrtho(layX.path1) && layX.ortho), JSON.stringify(layX && { path0: layX.path0, path1: layX.path1 }));
ok("Y補助線は軸平行折れ線", !!(layY && m.pathIsOrtho(layY.path0) && m.pathIsOrtho(layY.path1) && layY.ortho), JSON.stringify(layY && { path0: layY.path0, path1: layY.path1 }));
ok("Z補助線は軸平行折れ線", !!(layZ && m.pathIsOrtho(layZ.path0) && m.pathIsOrtho(layZ.path1) && layZ.ortho), JSON.stringify(layZ && { path0: layZ.path0, path1: layZ.path1 }));
ok("補助線は選択点から始まる", !!(layX && layX.path0 && layX.path0[0] && Math.abs(layX.path0[0].x - 0) < 0.01 && Math.abs(layX.path0[0].y - 40) < 0.01 && Math.abs(layX.path0[0].z - 10) < 0.01));
ok("補助線は寸法線端点で終わる", !!(layX && layX.path0 && Math.abs(layX.path0[layX.path0.length - 1].x - layX.d0.x) < 0.01 && Math.abs(layX.path0[layX.path0.length - 1].y - layX.d0.y) < 0.01 && Math.abs(layX.path0[layX.path0.length - 1].z - layX.d0.z) < 0.01));
ok("斜め2点のManhattanは対角線を含まない", m.pathIsOrtho(m.manhattanPath({ x: 0, y: 40, z: 10 }, { x: 250, y: -12, z: 276 }, ["x", "z", "y"])));

try {
  const src = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
  ok("ゴミ箱側のラック削除ボタンを撤去", src.indexOf('cmd: "delete"') < 0 && src.indexOf("label: \"ラック削除\"") >= 0 && src.indexOf('cmd: "clusterDel"') >= 0);
  ok("ラック削除は19-rack-deleteを残す", src.indexOf('cluster: "19-rack-delete.svg"') >= 0 && src.indexOf("icon: \"cluster\"") >= 0);
ok("図面出力Lucide SVG", src.indexOf('cmd: "drawing"') >= 0 && src.indexOf("drawing:") >= 0 && src.indexOf("<path d=\"M14 3H7") >= 0);
} catch (e) {
  ok("toolbar source readable", false, String(e));
}

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
