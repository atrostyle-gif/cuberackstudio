"use strict";

const path = require("path");
const fs = require("fs");
const view = require(path.join(__dirname, "..", "js/app/drawing-view.js"));

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

function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}

function cadLikePayload() {
  const joints = [];
  const nx = 2, nz = 5, ny = 5;
  const px = 900, pz = 900, py = 300;
  for (let y = 0; y <= ny; y += 1) {
    for (let z = 0; z <= nz; z += 1) {
      for (let x = 0; x <= nx; x += 1) {
        joints.push({ x: x * px, y: y * py, z: z * pz });
      }
    }
  }
  return {
    joints: joints,
    preview: {
      box: {
        min: { x: -10, y: -40, z: -10 },
        max: { x: 1810, y: 1560, z: 4510 },
      },
    },
  };
}

function uvBounds(joints, mode) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  joints.forEach(function (j) {
    const p = view.projectUv(j.x, j.y, j.z, mode);
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  });
  return { minU: minU, maxU: maxU, minV: minV, maxV: maxV };
}

function extremeJoint(joints, mode, pickMax) {
  let best = joints[0];
  let bestU = pickMax ? -Infinity : Infinity;
  joints.forEach(function (j) {
    const u = view.projectUv(j.x, j.y, j.z, mode).u;
    if (pickMax ? u > bestU : u < bestU) {
      bestU = u;
      best = j;
    }
  });
  return best;
}

function sample(mode, st, payload, rect, ppm) {
  const uv = uvBounds(payload.joints, mode);
  const frame = view.orthoFrame(st, payload.preview.box, rect, ppm, uv);
  const edge = extremeJoint(payload.joints, mode, true);
  const edgeUv = view.projectUv(edge.x, edge.y, edge.z, mode);
  const dim = view.orthoPaperFromUv(st, rect, ppm, uv, edgeUv.u, edgeUv.v);
  const rack = view.orthoPaperFromWorld(frame, rect, edge);
  return {
    flipX: !!frame.flipX,
    dim: dim,
    rack: rack,
    errX: rack.x - dim.x,
    errY: rack.y - dim.y,
    err: hypot(rack.x - dim.x, rack.y - dim.y),
  };
}

const payload = cadLikePayload();
const rect = { x: 48, y: 72, w: 720, h: 430 };
const ppm = (96 / 25.4) / 20;
const modes = ["front", "back", "left", "right", "top", "bottom"];

modes.forEach(function (mode) {
  const st0 = view.orthoDefault(mode);
  const a = sample(mode, st0, payload, rect, ppm);
  const stPan = view.orthoPan(st0, 90, 35, ppm);
  const b = sample(mode, stPan, payload, rect, ppm);
  const uv = uvBounds(payload.joints, mode);
  const edge = extremeJoint(payload.joints, mode, true);
  const keep = view.projectUv(edge.x, edge.y, edge.z, mode);
  const stZoom = view.orthoZoomAt(st0, -500, keep, (uv.minU + uv.maxU) * 0.5, (uv.minV + uv.maxV) * 0.5);
  const c = sample(mode, stZoom, payload, rect, ppm);
  const followPan = hypot(b.errX - a.errX, b.errY - a.errY);
  const followZoom = hypot(c.errX - a.errX, c.errY - a.errY);
  const expectFlip = mode === "left" || mode === "right";
  ok(mode + " lookAt の U 符号", a.flipX === expectFlip, "flipX=" + a.flipX);
  ok(mode + " 静止時のラック端と寸法端", a.err < 0.05, "err=" + a.err.toFixed(4));
  ok(mode + " パン後も同一点", b.err < 0.05, "err=" + b.err.toFixed(4));
  ok(mode + " ズーム後も同一点", c.err < 0.05, "err=" + c.err.toFixed(4));
  ok(mode + " パン追従誤差", followPan < 0.05, "dErr=" + followPan.toFixed(4));
  ok(mode + " ズーム追従誤差", followZoom < 0.05, "dErr=" + followZoom.toFixed(4));
  ok(mode + " パンでラックが動く", Math.abs(b.rack.x - a.rack.x) > 1);
});

const left0 = sample("left", view.orthoDefault("left"), payload, rect, ppm);
ok("左側面は投影を反転補正する", left0.flipX === true);
const right0 = sample("right", view.orthoDefault("right"), payload, rect, ppm);
ok("右側面は投影を反転補正する", right0.flipX === true);
ok("正面は反転しない", sample("front", view.orthoDefault("front"), payload, rect, ppm).flipX === false);
ok("背面は反転しない", sample("back", view.orthoDefault("back"), payload, rect, ppm).flipX === false);

const leftUv = view.projectUv(0, 0, 100, "left");
const rightUv = view.projectUv(0, 0, 100, "right");
ok("左側面の投影方向を維持", leftUv.u < 0 && Math.abs(leftUv.u + 100) < 1e-9);
ok("右側面の投影方向を維持", rightUv.u > 0 && Math.abs(rightUv.u - 100) < 1e-9);

const previewSrc = fs.readFileSync(path.join(__dirname, "..", "js/app/drawing-preview.js"), "utf8");
ok("WebGLは flipX で投影だけ反転", previewSrc.indexOf("frame.flipX") >= 0 && previewSrc.indexOf("cam.left = flipX ? frame.right") >= 0);
const drawingSrc = fs.readFileSync(path.join(__dirname, "..", "js/app/drawing.js"), "utf8");
ok("実データ経路の整列計測", drawingSrc.indexOf("__CR_orthoAlignDebug") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
