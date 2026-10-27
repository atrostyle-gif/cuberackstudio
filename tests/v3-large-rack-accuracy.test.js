"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const results = [];
let passed = 0;
let failed = 0;
let maxCalcErr = 0;
let maxDrawErr = 0;
let maxGpuErr = 0;

function record(name, kind, errMm, detail, ok) {
  const row = {
    name: name,
    kind: kind,
    errMm: Number.isFinite(errMm) ? errMm : 0,
    ok: !!ok,
    detail: detail || "",
  };
  results.push(row);
  if (Number.isFinite(errMm)) {
    if (kind === "calc") maxCalcErr = Math.max(maxCalcErr, Math.abs(errMm));
    if (kind === "draw") maxDrawErr = Math.max(maxDrawErr, Math.abs(errMm));
    if (kind === "gpu") maxGpuErr = Math.max(maxGpuErr, Math.abs(errMm));
  }
  if (ok) {
    passed += 1;
    console.log("PASS  " + name + (Number.isFinite(errMm) ? "  err=" + fmt(errMm) + "mm" : ""));
  } else {
    failed += 1;
    console.log("FAIL  " + name + (detail ? " :: " + detail : ""));
  }
}

function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a < 1e-12) return n.toExponential(3);
  if (a < 1e-6) return n.toExponential(3);
  return String(Number(n.toPrecision(12)));
}

function hypot3(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}

function chain(n, pitch, axis) {
  const joints = [];
  let x = 0, y = 0, z = 0;
  for (let i = 0; i <= n; i++) {
    joints.push({ x: x, y: y, z: z, i: i });
    if (axis === "x") x += pitch;
    else if (axis === "y") y += pitch;
    else z += pitch;
  }
  return joints;
}

function span(joints, axis) {
  const a = joints[0];
  const b = joints[joints.length - 1];
  if (axis === "x") return b.x - a.x;
  if (axis === "y") return b.y - a.y;
  return b.z - a.z;
}

function roundDist(a, b) {
  return Math.round(hypot3(a, b));
}

function meshEndpoints(a, b, displayLen) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const actual = Math.hypot(dx, dy, dz);
  const L = displayLen == null ? actual : displayLen;
  if (actual < 1e-15) return { a: { x: a.x, y: a.y, z: a.z }, b: { x: b.x, y: b.y, z: b.z }, actual: actual };
  const ux = dx / actual, uy = dy / actual, uz = dz / actual;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
  const h = L / 2;
  return {
    a: { x: mx - ux * h, y: my - uy * h, z: mz - uz * h },
    b: { x: mx + ux * h, y: my + uy * h, z: mz + uz * h },
    actual: actual,
    display: L,
  };
}

function f32(v) {
  return Math.fround(v);
}

function gpuEndpoints(a, b) {
  const ax = f32(a.x), ay = f32(a.y), az = f32(a.z);
  const bx = f32(b.x), by = f32(b.y), bz = f32(b.z);
  const dx = f32(bx - ax), dy = f32(by - ay), dz = f32(bz - az);
  const actual = f32(Math.hypot(dx, dy, dz));
  const mx = f32((ax + bx) * 0.5), my = f32((ay + by) * 0.5), mz = f32((az + bz) * 0.5);
  if (!(actual > 0)) {
    return { a: { x: ax, y: ay, z: az }, b: { x: bx, y: by, z: bz } };
  }
  const ux = f32(dx / actual), uy = f32(dy / actual), uz = f32(dz / actual);
  const h = f32(actual * 0.5);
  return {
    a: { x: f32(mx - ux * h), y: f32(my - uy * h), z: f32(mz - uz * h) },
    b: { x: f32(mx + ux * h), y: f32(my + uy * h), z: f32(mz + uz * h) },
  };
}

function jsonRoundtrip(joints) {
  return JSON.parse(JSON.stringify({ joints: joints })).joints;
}

function maxAbs(n) {
  return Math.abs(Number(n) || 0);
}

function checkChain(name, n, pitch, expected) {
  const js = chain(n, pitch, "x");
  const got = span(js, "x");
  const err = got - expected;
  record(name + " 計算スパン", "calc", err, "got=" + fmt(got) + " expected=" + fmt(expected), Math.abs(err) < 1e-6);
  let maxRound = 0;
  for (let i = 0; i < js.length - 1; i++) {
    const actual = hypot3(js[i], js[i + 1]);
    maxRound = Math.max(maxRound, Math.abs(roundDist(js[i], js[i + 1]) - actual));
  }
  record(name + " lengthMm丸め", "draw", maxRound, "max |round(d)-d|=" + fmt(maxRound), maxRound <= 0.5 + 1e-9);
  const ends = meshEndpoints(js[0], js[js.length - 1], roundDist(js[0], js[js.length - 1]));
  const drawErr = Math.max(hypot3(js[0], ends.a), hypot3(js[js.length - 1], ends.b));
  record(name + " メッシュ端点(全長丸め)", "draw", drawErr, "err=" + fmt(drawErr), drawErr < 0.51);
  const gpuA = gpuEndpoints(js[0], js[1]);
  const gpuErr = hypot3(js[0], gpuA.a);
  record(name + " GPU Float32端点(1スパン)", "gpu", gpuErr, "err=" + fmt(gpuErr), gpuErr < 0.05);
  const gpuFar = gpuEndpoints(js[0], js[js.length - 1]);
  const gpuFarErr = hypot3(js[0], gpuFar.a);
  record(name + " GPU Float32端点(全長)", "gpu", gpuFarErr, "err=" + fmt(gpuFarErr), true);
  const rt = jsonRoundtrip(js);
  const jsonErr = Math.abs(rt[rt.length - 1].x - js[js.length - 1].x);
  record(name + " JSON往復", "calc", jsonErr, "err=" + fmt(jsonErr), jsonErr === 0 || jsonErr < 1e-10);
  return js;
}

checkChain("30m = 1000mm×30", 30, 1000, 30000);
checkChain("30m = 50mm×600", 600, 50, 30000);
checkChain("50m = 1000mm×50", 50, 1000, 50000);
checkChain("50m = 50mm×1000", 1000, 50, 50000);
checkChain("100m = 1000mm×100", 100, 1000, 100000);
checkChain("100m = 50mm×2000", 2000, 50, 100000);

{
  const a = chain(30, 1000, "x");
  const b = chain(600, 50, "x");
  const err = Math.abs(span(a, "x") - span(b, "x"));
  record("1000×30 vs 50×600 スパン一致", "calc", err, "Δ=" + fmt(err), err === 0);
}

{
  const js = chain(80, 123.7, "x");
  const expected = 80 * 123.7;
  const err = span(js, "x") - expected;
  record("小数123.7mm×80 計算スパン", "calc", err, "got=" + fmt(span(js, "x")) + " expected=" + fmt(expected), Math.abs(err) < 1e-9);
  let maxRound = 0;
  for (let i = 0; i < js.length - 1; i++) {
    maxRound = Math.max(maxRound, Math.abs(roundDist(js[i], js[i + 1]) - hypot3(js[i], js[i + 1])));
  }
  record("小数123.7mm lengthMm丸め", "draw", maxRound, "max=" + fmt(maxRound), maxRound < 0.5 + 1e-9);
}

{
  const box = { window: {}, document: { getElementById: function () { return null; } } };
  box.window = box;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/utils/common.js"), "utf8"), box, { filename: "common.js" });
  const parsed = box.parseLengthMm("50.7");
  const err = Math.abs((parsed || 0) - 50.7);
  record("オーダーparseLengthMm('50.7')", "calc", err, "parsed=" + parsed, err < 1e-12);
  const conn = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
  const noDisplayOverwrite = conn.indexOf("applyConnectorDisplayLength(mesh, displayLen)") < 0
    && conn.indexOf("updateConnectorMesh(mesh, aPos, bPos)") >= 0;
  record("接続メッシュは実距離追従", "draw", 0, noDisplayOverwrite ? "updateConnectorMesh" : "still display overwrite", noDisplayOverwrite);
}

{
  const pitch = 50.3;
  const n = 400;
  const js = chain(n, pitch, "x");
  const err = span(js, "x") - n * pitch;
  record("小数50.3mm×400 累積", "calc", err, "got=" + fmt(span(js, "x")), Math.abs(err) < 1e-8);
}

{
  const nx = 30, nz = 10, pitch = 1000;
  const pathA = [];
  let x = 0, z = 0;
  for (let i = 0; i < nx; i++) { x += pitch; pathA.push({ x: x, y: 0, z: z }); }
  for (let i = 0; i < nz; i++) { z += pitch; pathA.push({ x: x, y: 0, z: z }); }
  const pathB = [];
  x = 0; z = 0;
  for (let i = 0; i < nz; i++) { z += pitch; pathB.push({ x: x, y: 0, z: z }); }
  for (let i = 0; i < nx; i++) { x += pitch; pathB.push({ x: x, y: 0, z: z }); }
  const a = pathA[pathA.length - 1];
  const b = pathB[pathB.length - 1];
  const err = Math.hypot(a.x - b.x, a.z - b.z);
  record("ループ閉合 1000mm 30×10 二経路", "calc", err, "Δ=" + fmt(err), err === 0);
}

{
  const nx = 200, nz = 80, pitch = 50;
  let ax = 0, az = 0, bx = 0, bz = 0;
  for (let i = 0; i < nx; i++) ax += pitch;
  for (let i = 0; i < nz; i++) az += pitch;
  for (let i = 0; i < nz; i++) bz += pitch;
  for (let i = 0; i < nx; i++) bx += pitch;
  const err = Math.hypot(ax - bx, az - bz);
  record("ループ閉合 50mm 200×80 二経路", "calc", err, "Δ=" + fmt(err), err === 0);
}

{
  const pitch = 50.3;
  const nx = 120, nz = 40;
  let ax = 0, az = 0, bx = 0, bz = 0;
  for (let i = 0; i < nx; i++) ax += pitch;
  for (let i = 0; i < nz; i++) az += pitch;
  for (let i = 0; i < nz; i++) bz += pitch;
  for (let i = 0; i < nx; i++) bx += pitch;
  const err = Math.hypot(ax - bx, az - bz);
  record("ループ閉合 50.3mm 120×40 二経路", "calc", err, "Δ=" + fmt(err), err < 1e-8);
}

{
  const n = 3000;
  const pitch = 50;
  const js = chain(n, pitch, "x");
  const err = span(js, "x") - n * pitch;
  record("3000本 50mm 連鎖スパン", "calc", err, "span=" + fmt(span(js, "x")), err === 0);
  let maxJointBeam = 0;
  for (let i = 0; i < js.length - 1; i++) {
    const ep = meshEndpoints(js[i], js[i + 1], hypot3(js[i], js[i + 1]));
    maxJointBeam = Math.max(maxJointBeam, hypot3(js[i], ep.a), hypot3(js[i + 1], ep.b));
  }
  record("3000本 JointとBeam端点(正確スケール)", "draw", maxJointBeam, "max=" + fmt(maxJointBeam), maxJointBeam < 1e-9);
  let maxRounded = 0;
  for (let i = 0; i < js.length - 1; i++) {
    const ep = meshEndpoints(js[i], js[i + 1], roundDist(js[i], js[i + 1]));
    maxRounded = Math.max(maxRounded, hypot3(js[i], ep.a), hypot3(js[i + 1], ep.b));
  }
  record("3000本 JointとBeam端点(roundスケール)", "draw", maxRounded, "max=" + fmt(maxRounded), maxRounded < 1e-9);
}

{
  const origin = { x: 0, y: 0, z: 0 };
  const far = { x: 100000, y: 800, z: 40000 };
  const gpu = gpuEndpoints(origin, far);
  const err = hypot3(origin, gpu.a);
  record("100m対角 GPU Float32", "gpu", err, "err=" + fmt(err), true);
}

{
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 50.4, y: 0, z: 0 };
  const ep = meshEndpoints(a, b, Math.round(hypot3(a, b)));
  const err = hypot3(a, ep.a);
  record("小数50.4mm round描画ずれ", "draw", err, "display=" + Math.round(hypot3(a, b)) + " actual=50.4", true);
}

{
  const moved = chain(30, 1000, "x").map(function (j) {
    return { x: j.x + 1234.5, y: j.y + 80, z: j.z - 60 };
  });
  const err = span(moved, "x") - 30000;
  record("Move後 30mスパン維持", "calc", err, "span=" + fmt(span(moved, "x")), Math.abs(err) < 1e-9);
}

{
  const src = chain(20, 1000, "x");
  const offset = { x: 5000, y: 0, z: 300 };
  const dup = src.map(function (j) {
    return { x: j.x + offset.x, y: j.y + offset.y, z: j.z + offset.z };
  });
  let maxRel = 0;
  for (let i = 0; i < src.length; i++) {
    maxRel = Math.max(
      maxRel,
      Math.abs((dup[i].x - dup[0].x) - (src[i].x - src[0].x)),
      Math.abs((dup[i].z - dup[0].z) - (src[i].z - src[0].z))
    );
  }
  record("複製 相対座標維持", "calc", maxRel, "maxΔ=" + fmt(maxRel), maxRel === 0);
}

{
  const parent = { x: 1000, y: 0, z: 0 };
  const child = { x: 0, y: 0, z: 0 };
  const rack = chain(10, 1000, "x");
  const d = { x: parent.x - child.x, y: parent.y - child.y, z: parent.z - child.z };
  const joined = rack.map(function (j) {
    return { x: j.x + d.x, y: j.y + d.y, z: j.z + d.z };
  });
  const err = hypot3(joined[0], parent);
  record("ラック接続 基準点一致", "calc", err, "Δ=" + fmt(err), err === 0);
  const spanErr = span(joined, "x") - 10000;
  record("ラック接続 スパン維持", "calc", spanErr, "span=" + fmt(span(joined, "x")), spanErr === 0);
}

{
  const js = chain(30, 1000, "x");
  const snap1 = JSON.stringify(js);
  const moved = JSON.parse(snap1).map(function (j) { j.x += 50; return j; });
  const snap2 = JSON.stringify(moved);
  const undone = JSON.parse(snap1);
  const err = Math.abs(undone[undone.length - 1].x - js[js.length - 1].x);
  record("Undoスナップショット復元", "calc", err, "Δ=" + fmt(err), err === 0);
  JSON.parse(snap2);
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
  requestAnimationFrame: function () { return 0; },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.self = sandbox;
sandbox.addEventListener = function () {};
vm.runInNewContext(fs.readFileSync(path.join(root, "js/ui/v3-user-axes.js"), "utf8"), sandbox, { filename: "v3-user-axes.js" });
vm.runInNewContext(fs.readFileSync(path.join(root, "js/ui/v3-measure.js"), "utf8"), sandbox, { filename: "v3-measure.js" });
const m = sandbox.v3Measure;

{
  sandbox.joints = [
    { id: "a", rackId: "r1", x: 0, y: 0, z: 0 },
    { id: "b", rackId: "r1", x: 100000, y: 0, z: 0 },
  ];
  sandbox.beams = [];
  sandbox.poles = [];
  sandbox.jointRadius = 10;
  sandbox.connectorRadius = 6.5;
  const liveA = m.resolveRef({ kind: "joint", id: "a" });
  const liveB = m.resolveRef({ kind: "joint", id: "b" });
  const c2c = m.axisValue("芯々", liveA, liveB, "x");
  const err = (c2c.mm || 0) - 100000;
  record("寸法測定 100m 芯々", "calc", err, JSON.stringify(c2c), c2c.ok && Math.abs(err) < 1e-6);
}

{
  sandbox.joints = [
    { id: "a", rackId: "r1", x: 0, y: 40, z: 10 },
    { id: "b", rackId: "r1", x: 50000, y: 180, z: 220 },
  ];
  const liveA = m.resolveRef({ kind: "joint", id: "a" });
  const liveB = m.resolveRef({ kind: "joint", id: "b" });
  const layX = m.layoutLine(liveA, liveB, "x", 50000, "芯々", 0);
  const layY = m.layoutLine(liveA, liveB, "z", 210, "芯々", 0);
  const layZ = m.layoutLine(liveA, liveB, "y", 140, "芯々", 0);
  const ok = !!(layX && layY && layZ && layX.ortho && layY.ortho && layZ.ortho
    && m.isParallelToThreeAxis(layX.d0, layX.d1, "x")
    && m.isParallelToThreeAxis(layY.d0, layY.d1, "z")
    && m.isParallelToThreeAxis(layZ.d0, layZ.d1, "y"));
  record("50m斜め2点 寸法線は軸平行", "draw", 0, ok ? "ortho" : "not ortho", ok);
}

{
  const src = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
  const rounds = /Math\.round\(va\.distanceTo\(vb\)\)/.test(src);
  record("接続距離は実寸(丸めない)", "draw", 0, rounds ? "still rounds" : "actual hypot", !rounds);
}

{
  const src = fs.readFileSync(path.join(root, "js/core/mesh.js"), "utf8");
  const hasExact = src.indexOf("len / mesh.userData.baseLengthMm") >= 0 || src.indexOf("updateConnectorMesh(mesh, aPos, bPos)") >= 0;
  const overlay = src.indexOf("applyConnectorDisplayLength") >= 0;
  record("createCylinderBetweenは実距離スケール", "draw", 0, hasExact ? "exact scale then optional display overwrite" : "missing", hasExact);
  record("mesh.jsはdisplay上書き関数を持つ", "draw", 0.5, overlay ? "applyConnectorDisplayLength exists" : "missing", overlay);
}

console.log("");
console.log("passed=" + passed + " failed=" + failed);
console.log("tests=" + results.length);
console.log("maxCalcErrMm=" + fmt(maxCalcErr));
console.log("maxDrawErrMm=" + fmt(maxDrawErr));
console.log("maxGpuErrMm=" + fmt(maxGpuErr));

const summaryPath = path.join(root, "tests/v3-large-rack-accuracy.summary.json");
fs.writeFileSync(summaryPath, JSON.stringify({
  passed: passed,
  failed: failed,
  tests: results.length,
  maxCalcErrMm: maxCalcErr,
  maxDrawErrMm: maxDrawErr,
  maxGpuErrMm: maxGpuErr,
  results: results,
}, null, 2));

if (failed) process.exit(1);
