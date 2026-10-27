"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failed = [];
let passed = 0;
let maxDesignErr = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log("PASS  " + name + (detail ? "  " + detail : ""));
  } else {
    failed.push(name + (detail ? " :: " + detail : ""));
    console.log("FAIL  " + name + (detail ? " :: " + detail : ""));
  }
}

function noteErr(err) {
  if (Number.isFinite(err)) maxDesignErr = Math.max(maxDesignErr, Math.abs(err));
  return err;
}

function load(file, sandbox) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox;
}

function hypot3(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}

function setAxisLength(a, b, axis, target) {
  const current = hypot3(a, b);
  const delta = target - current;
  const sign = ((b[axis] || 0) >= (a[axis] || 0)) ? 1 : -1;
  b[axis] = (b[axis] || 0) + delta * sign;
  return hypot3(a, b);
}

function snapshot(state) {
  return JSON.parse(JSON.stringify({
    joints: state.joints,
    beams: state.beams.map(function (b) {
      return {
        a: b.a,
        b: b.b,
        lengthMm: b.lengthMm,
        isCustom: b.isCustom,
        customLength: b.customLength,
      };
    }),
  }));
}

function restore(state, snap) {
  state.joints = JSON.parse(JSON.stringify(snap.joints));
  state.beams = JSON.parse(JSON.stringify(snap.beams));
}

function syncFromJoints(state, presets, helpers) {
  state.beams.forEach(function (item) {
    const dist = helpers.actualJointDistanceMm(state.joints[item.a], state.joints[item.b]);
    item.lengthMm = dist;
    const isPreset = helpers.isPresetLengthMm(dist, presets);
    item.isCustom = !isPreset;
    item.customLength = isPreset ? null : dist;
  });
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
  JSON: JSON,
};
sandbox.window = sandbox;
load("js/utils/common.js", sandbox);

const H = sandbox;
const PRESETS = [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];

ok("parseLengthMm 50.7", Math.abs(H.parseLengthMm("50.7") - 50.7) < 1e-12);
ok("parseLengthMm 123.7", Math.abs(H.parseLengthMm("123.7") - 123.7) < 1e-12);
ok("parseLengthMm 200", H.parseLengthMm("200") === 200);
ok("parseLengthMm 30000", H.parseLengthMm("30000") === 30000);
ok("parseLengthMm 100000", H.parseLengthMm("100000") === 100000);

const d507 = H.actualJointDistanceMm({ x: 0, y: 0, z: 0 }, { x: 50.7, y: 0, z: 0 });
ok("Joint実寸 50.7", Math.abs(noteErr(d507 - 50.7)) < 1e-12, "got=" + d507);
const d1237 = H.actualJointDistanceMm({ x: 0, y: 0, z: 0 }, { x: 123.7, y: 0, z: 0 });
ok("Joint実寸 123.7", Math.abs(noteErr(d1237 - 123.7)) < 1e-12, "got=" + d1237);
ok("規格200はプリセット", H.isPresetLengthMm(200, PRESETS) === true);
ok("50.7はオーダー", H.isPresetLengthMm(50.7, PRESETS) === false);
ok("50.4は50にスナップしない", H.isPresetLengthMm(50.4, PRESETS) === false);

ok("見積バケット 50.7→51", H.estimateBucketMm(50.7) === 51);
ok("見積バケット 123.7→124", H.estimateBucketMm(123.7) === 124);
ok("見積バケット 200→200", H.estimateBucketMm(200) === 200);
ok("見積バケット 50.4→50", H.estimateBucketMm(50.4) === 50);
ok("見積差分 50.7 は +0.3", Math.abs((H.estimateBucketMm(50.7) - 50.7) - 0.3) < 1e-12);
ok("見積差分 123.7 は +0.3", Math.abs((H.estimateBucketMm(123.7) - 123.7) - 0.3) < 1e-12);

ok("formatDesignMm 50.7", H.formatDesignMm(50.7) === "50.7");
ok("formatDesignMm 123.7", H.formatDesignMm(123.7) === "123.7");
ok("formatDesignMm 200", H.formatDesignMm(200) === "200");

{
  const state = {
    joints: [
      { x: 0, y: 0, z: 0 },
      { x: 50.7, y: 0, z: 0 },
    ],
    beams: [{ a: 0, b: 1, lengthMm: 0, isCustom: false, customLength: null }],
  };
  syncFromJoints(state, PRESETS, H);
  ok("入力後 lengthMm=50.7", Math.abs(noteErr(state.beams[0].lengthMm - 50.7)) < 1e-12);
  ok("入力後 isCustom", state.beams[0].isCustom === true);
  ok("入力後 customLength=50.7", Math.abs(state.beams[0].customLength - 50.7) < 1e-12);

  const hist = [];
  hist.push(snapshot(state));
  const afterEdit = setAxisLength(state.joints[0], state.joints[1], "x", 123.7);
  syncFromJoints(state, PRESETS, H);
  ok("長さ変更後 実寸123.7", Math.abs(noteErr(afterEdit - 123.7)) < 1e-12);
  ok("長さ変更後 lengthMm=123.7", Math.abs(state.beams[0].lengthMm - 123.7) < 1e-12);
  hist.push(snapshot(state));

  const saved = JSON.stringify(state);
  const reloaded = JSON.parse(saved);
  syncFromJoints(reloaded, PRESETS, H);
  ok("保存→再読込 123.7維持", Math.abs(noteErr(reloaded.beams[0].lengthMm - 123.7)) < 1e-12);
  ok("保存JSONに小数が残る", saved.indexOf("123.7") >= 0);

  const dupJoints = reloaded.joints.map(function (j) {
    return { x: j.x + 1000, y: j.y, z: j.z + 400 };
  });
  const dupBeam = {
    a: 0,
    b: 1,
    lengthMm: H.actualJointDistanceMm(dupJoints[0], dupJoints[1]),
  };
  ok("複製後 実寸123.7", Math.abs(noteErr(dupBeam.lengthMm - 123.7)) < 1e-12);

  restore(state, hist[0]);
  syncFromJoints(state, PRESETS, H);
  ok("Undoで50.7に戻る", Math.abs(noteErr(state.beams[0].lengthMm - 50.7)) < 1e-12, "got=" + state.beams[0].lengthMm);
  restore(state, hist[1]);
  syncFromJoints(state, PRESETS, H);
  ok("Redoで123.7に戻る", Math.abs(noteErr(state.beams[0].lengthMm - 123.7)) < 1e-12);
}

{
  const state = {
    joints: [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }],
    beams: [{ a: 0, b: 1, lengthMm: 0 }],
  };
  syncFromJoints(state, PRESETS, H);
  ok("整数規格200 lengthMm", Math.abs(noteErr(state.beams[0].lengthMm - 200)) < 1e-12);
  ok("整数規格200 isCustom=false", state.beams[0].isCustom === false);
  ok("整数規格200 見積差0", H.estimateBucketMm(state.beams[0].lengthMm) === 200);
}

[30000, 50000, 100000].forEach(function (span) {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: span, y: 0, z: 0 };
  const got = H.actualJointDistanceMm(a, b);
  ok("長尺 " + (span / 1000) + "m 実寸", Math.abs(noteErr(got - span)) < 1e-9, "got=" + got);
  ok("長尺 " + (span / 1000) + "m 見積差0", H.estimateBucketMm(got) === span);
});

{
  const n = 3000;
  const pitch = 50.7;
  const joints = [];
  for (let i = 0; i <= n; i++) joints.push({ x: i * pitch, y: 0, z: 0 });
  let maxSeg = 0;
  let sumDesign = 0;
  let sumEst = 0;
  for (let i = 0; i < n; i++) {
    const d = H.actualJointDistanceMm(joints[i], joints[i + 1]);
    maxSeg = Math.max(maxSeg, Math.abs(d - pitch));
    sumDesign += d;
    sumEst += H.estimateBucketMm(d);
  }
  const spanErr = Math.abs((joints[n].x - joints[0].x) - n * pitch);
  ok("大量3000本 50.7 各部材誤差", noteErr(maxSeg) < 1e-10, "max=" + maxSeg);
  ok("大量3000本 スパン誤差", noteErr(spanErr) < 1e-8, "spanErr=" + spanErr);
  ok("大量3000本 設計合計152100", Math.abs(sumDesign - 152100) < 1e-6, "sum=" + sumDesign);
  ok("大量3000本 見積合計153000", sumEst === 153000, "sumEst=" + sumEst);
  ok("大量3000本 設計-見積差900", Math.abs((sumEst - sumDesign) - 900) < 1e-6);
}

{
  const old = {
    joints: [{ x: 0, y: 0, z: 0 }, { x: 50.7, y: 0, z: 0 }],
    beams: [{ a: 0, b: 1, lengthMm: 51, isCustom: true, customLength: 51 }],
  };
  syncFromJoints(old, PRESETS, H);
  ok("旧JSONはJoint実寸で上書き", Math.abs(noteErr(old.beams[0].lengthMm - 50.7)) < 1e-12, "lengthMm=" + old.beams[0].lengthMm);
  ok("旧JSON customLengthも実寸", Math.abs(old.beams[0].customLength - 50.7) < 1e-12);
}

{
  const conn = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "js/main.js".replace("js/main.js", "main.js")), "utf8");
  const ui = fs.readFileSync(path.join(root, "js/ui/ui.js"), "utf8");
  const lenp = fs.readFileSync(path.join(root, "js/ui/v3-length-panel.js"), "utf8");
  const dup = fs.readFileSync(path.join(root, "js/ui/v3-duplicate.js"), "utf8");
  const est = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
  const price = fs.readFileSync(path.join(root, "js/app/order-pricing.js"), "utf8");
  const stock = fs.readFileSync(path.join(root, "js/features/bs-stock.js"), "utf8");
  ok("connectors は distanceTo を丸めない", !/Math\.round\(va\.distanceTo\(vb\)\)/.test(conn));
  ok("main は長さ変更で Math.round(len) しない", main.indexOf("const rounded = Math.round(len);") < 0);
  ok("ui 選択長さを丸めない", ui.indexOf("return Math.round(b.customLength);") < 0);
  ok("length-panel は小数入力可", lenp.indexOf('step = "0.1"') >= 0 && lenp.indexOf("not-int") < 0);
  ok("duplicate は hypot を丸めない", dup.indexOf("Math.round(Math.hypot(dx, dy, dz))") < 0);
  ok("estimate の既存丸めは維持", est.indexOf("const nominalLen = Math.round(Math.sqrt") >= 0);
  ok("order-pricing の既存丸めは維持", price.indexOf("Math.round(Number(lengthMm)") >= 0);
  ok("bs-stock の既存丸めは維持", stock.indexOf("return Math.round(Number(data.lengthMm)") >= 0);
}

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
console.log("maxDesignErrMm=" + maxDesignErr);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
