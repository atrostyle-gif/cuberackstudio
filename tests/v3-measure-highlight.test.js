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

const measureSrc = fs.readFileSync(path.join(root, "js/ui/v3-measure.js"), "utf8");
const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const multiSrc = fs.readFileSync(path.join(root, "js/ui/v3-multi-select.js"), "utf8");

ok("始点は水色", measureSrc.indexOf("START_HL = 0x38bdf8") >= 0);
ok("終点はオレンジ", measureSrc.indexOf("END_HL = 0xf97316") >= 0);
ok("始点済みメッセージ", measureSrc.indexOf("始点を選択済み・終点を選択してください") >= 0);
ok("Esc は選択解除", measureSrc.indexOf('ev.key !== "Escape"') >= 0 && measureSrc.indexOf("resetPicks()") >= 0);
ok("モード終了でハイライト解除", measureSrc.indexOf("clearPickHighlight()") >= 0);
ok("InstancedMesh は _v3MeasHL を読む", poolSrc.indexOf("_v3MeasHL") >= 0);
ok("複数選択の HIGHLIGHT 定数を変えない", multiSrc.indexOf("const HIGHLIGHT = 0x38bdf8") >= 0);
ok("キャッシュ更新", indexSrc.indexOf("v3-measure.js?v=20261027-h1") >= 0 && indexSrc.indexOf("v3-instance-pool.js?v=20261027-h1") >= 0);

function makeMat(hex) {
  return {
    color: { isColor: true, r: 0.2, g: 0.2, b: 0.2 },
    emissive: {
      _hex: hex || 0,
      getHex: function () { return this._hex; },
      setHex: function (h) { this._hex = h; },
      isColor: true,
    },
    emissiveIntensity: 0,
    needsUpdate: false,
  };
}

function makeMesh(kind) {
  return {
    isMesh: true,
    material: makeMat(0),
    userData: { type: kind, v3Instanced: true, v3Kind: kind },
  };
}

const jointMesh = makeMesh("joint");
const beamMesh = makeMesh("beam");
const poleMesh = makeMesh("pole");
const legBase = makeMesh("legBase");
const legCone = makeMesh("legCone");
const legGroup = {
  isMesh: false,
  position: { x: 0, y: -16.25, z: 0 },
  userData: { type: "leg", jointIndex: 0, v3LegBase: legBase, v3LegCone: legCone },
  traverse: function () {},
};

const joints = [
  { id: "j0", x: 0, y: 0, z: 0 },
  { id: "j1", x: 0, y: 400, z: 0 },
];
const beams = [{ id: "b0", a: 0, b: 1, mesh: beamMesh }];
const poles = [{ id: "p0", a: 0, b: 1, mesh: poleMesh }];
const legs = [{ id: "leg0", jointIndex: 0, mesh: legGroup }];
const jointMeshes = [jointMesh, { visible: true, material: makeMat(0), userData: {} }];

const documentStub = {
  getElementById: function () { return null; },
  addEventListener: function () {},
  body: { nodeType: 1 },
};
const windowObj = {
  joints: joints,
  poles: poles,
  beams: beams,
  legs: legs,
  jointMeshes: jointMeshes,
  jointRadius: 10,
  connectorRadius: 6.5,
  LEG_TOTAL_HEIGHT: 12.5,
  LEG_BASE_R: 12.5,
  getLegMeshBounds: function (leg) {
    return { minX: -12.5, maxX: 12.5, minY: -22.5, maxY: -10, minZ: -12.5, maxZ: 12.5, cx: 0, cy: -16.25, cz: 0 };
  },
  resolveLegJointIndex: function (leg) { return leg.jointIndex; },
  renderer: { domElement: { contains: function () { return true; } } },
  addEventListener: function () {},
  v3InstancePool: { note: function () { windowObj.__poolNoted = true; } },
  v3UserAxes: {
    info: function (axis) {
      const u = String(axis).toUpperCase();
      return { user: u, three: String(axis).toLowerCase(), css: "#888", color: 0x888888, meaning: u };
    },
    userOfThree: function (t) { return String(t).toUpperCase(); },
    threeOfUser: function (u) { return String(u).toLowerCase(); },
    labelOfThree: function (t) { return String(t).toUpperCase(); },
  },
};
windowObj.window = windowObj;
windowObj.document = documentStub;

const sandbox = {
  window: windowObj,
  document: documentStub,
  console: console,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  Date: Date,
};
sandbox.window = windowObj;
vm.runInNewContext(measureSrc, sandbox);
const api = windowObj.v3Measure;
ok("測定 API が起動する", !!(api && typeof api.setPicks === "function"));

api.setPicks({ kind: "joint", index: 0 }, null);
ok("1点目 Joint が水色", jointMesh.userData._v3MeasHL === api.START_HL && jointMesh.material.emissive.getHex() === api.START_HL);
ok("1点目で pool.note する", windowObj.__poolNoted === true);

api.setPicks({ kind: "joint", index: 0 }, { kind: "beam", index: 0 });
ok("2点目 Beam がオレンジ", beamMesh.userData._v3MeasHL === api.END_HL && beamMesh.material.emissive.getHex() === api.END_HL);
ok("2点目後も始点は水色", jointMesh.userData._v3MeasHL === api.START_HL);

api.setPicks({ kind: "pole", index: 0 }, { kind: "leg", index: 0 });
ok("Pole 始点が水色", poleMesh.userData._v3MeasHL === api.START_HL);
ok("LEG は base と cone を塗る", legBase.userData._v3MeasHL === api.END_HL && legCone.userData._v3MeasHL === api.END_HL);
ok("前の Joint ハイライトを外す", jointMesh.userData._v3MeasHL === undefined && jointMesh.material.emissive.getHex() === 0);

api.clearPickHighlight();
ok("解除で Pole が元の色", poleMesh.userData._v3MeasHL === undefined && poleMesh.material.emissive.getHex() === 0);
ok("解除で LEG が元の色", legBase.userData._v3MeasHL === undefined && legCone.userData._v3MeasHL === undefined);

const painted = api.paintedMeshes();
ok("解除後 painted は空", painted.length === 0);

ok("複数選択配列を触らない", measureSrc.indexOf("v3MultiSelect") < 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
