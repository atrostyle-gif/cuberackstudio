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
const cadOpsSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-ops.js"), "utf8");
const legsSrc = fs.readFileSync(path.join(root, "js/parts/legs.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

ok("測定は includeLeg で pick する", measureSrc.indexOf("includeLeg: true") >= 0);
ok("captureRef が LEG を受け付ける", measureSrc.indexOf('hit.kind !== "leg"') >= 0 || measureSrc.indexOf('kind === "leg"') >= 0);
ok("外々は全体 min/max を使う", measureSrc.indexOf("Math.min(ea.min, eb.min)") >= 0 && measureSrc.indexOf("Math.max(ea.max, eb.max)") >= 0);
ok("TopCap は Y 外形上端に載せる", measureSrc.indexOf("jointHasTopCap") >= 0 && measureSrc.indexOf("topCapHeightMm") >= 0);
ok("始点・終点の基準面を表示する", measureSrc.indexOf("startFace") >= 0 && measureSrc.indexOf("faceCaption") >= 0);
ok("cad-ops が LEG を分類する", cadOpsSrc.indexOf("function findLegIndex") >= 0 && cadOpsSrc.indexOf('kind: "leg"') >= 0);
ok("通常 pick は LEG を混ぜない", cadOpsSrc.indexOf("opts.includeLeg") >= 0 || cadOpsSrc.indexOf("opts && opts.includeLeg") >= 0);
ok("測定ピックは近い Pole より JB を優先できる", cadOpsSrc.indexOf("function pickFromHits") >= 0 && cadOpsSrc.indexOf("function jointNearClick") >= 0);
ok("LEG 実形状の境界を公開", legsSrc.indexOf("function getLegMeshBounds") >= 0);
ok("キャッシュ更新", indexSrc.indexOf("v3-measure.js?v=20261027-m109") >= 0 && indexSrc.indexOf("v3-cad-ops.js?v=20261027-meas3") >= 0 && indexSrc.indexOf("legs.js?v=20261027-h1") >= 0);

function vec(x, y, z) {
  return { x: x, y: y, z: z, clone: function () { return vec(this.x, this.y, this.z); } };
}

const JOINT_R = 10;
const JB_Y_HALF = 9.1;
const LEG_TOTAL = 12.9;
const LEG_R = 12.5;
const TC = 2.2;

function makeLeg(joint, id) {
  const gy = joint.y - (LEG_TOTAL / 2 + JB_Y_HALF);
  return {
    id: id || "leg0",
    jointIndex: 0,
    mesh: {
      visible: true,
      position: { x: joint.x, y: gy, z: joint.z },
      userData: { type: "leg", jointIndex: 0 },
    },
  };
}

function getLegMeshBounds(leg) {
  const p = leg.mesh.position;
  const half = LEG_TOTAL / 2;
  return {
    minX: p.x - LEG_R, maxX: p.x + LEG_R,
    minY: p.y - half, maxY: p.y + half,
    minZ: p.z - LEG_R, maxZ: p.z + LEG_R,
    cx: p.x, cy: p.y, cz: p.z,
  };
}

const joints = [
  { id: "j0", x: 0, y: 0, z: 0 },
  { id: "j1", x: 0, y: 400, z: 0 },
  { id: "j2", x: 0, y: 800, z: 0 },
  { id: "j3", x: 0, y: 1200, z: 0 },
  { id: "j4", x: 200, y: 0, z: 0 },
];
const poles = [
  { id: "p0", a: 0, b: 1, mesh: { visible: true } },
  { id: "p1", a: 1, b: 2, mesh: { visible: true } },
  { id: "p2", a: 2, b: 3, mesh: { visible: true } },
];
const beams = [
  { id: "b0", a: 0, b: 4, mesh: { visible: true } },
];
const legs = [makeLeg(joints[0], "leg0")];
const jointMeshes = joints.map(function () { return { visible: true }; });

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
  jointRadius: JOINT_R,
  connectorRadius: 6.5,
  LEG_TOTAL_HEIGHT: LEG_TOTAL,
  LEG_BASE_R: LEG_R,
  getVerticalJbHalfMm: function () { return JB_Y_HALF; },
  getTopCapHeightMm: function () { return TC; },
  getLegMeshBounds: getLegMeshBounds,
  resolveLegJointIndex: function (leg) { return leg.jointIndex; },
  THREE: undefined,
  scene: null,
  renderer: { domElement: { contains: function () { return true; } } },
  addEventListener: function () {},
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
  THREE: undefined,
};
sandbox.window = windowObj;

vm.runInNewContext(cadOpsSrc, sandbox);
vm.runInNewContext(measureSrc, sandbox);
const api = windowObj.v3Measure;
const ops = windowObj.v3CadOps;
ok("測定 API が起動する", !!(api && ops && typeof api.makeDim === "function"));

const handle = { userData: { v3Kind: "legBase" } };
legs[0].mesh.userData.v3LegBase = handle;
const classified = ops.classifyHit(handle, beams, poles, jointMeshes, [], [], legs);
ok("Instanced LEG ハンドルを LEG と分類", classified && classified.kind === "leg" && classified.index === 0);

const noLeg = ops.classifyHit(handle, beams, poles, jointMeshes, [], [], []);
ok("includeLeg なし相当では LEG にしない", !noLeg || noLeg.kind !== "leg");

const capLeg = api.captureRef({ kind: "leg", index: 0, mesh: legs[0].mesh });
ok("LEG を測定対象として捕捉", capLeg && capLeg.kind === "leg");
const liveLeg = api.resolveRef(capLeg);
ok("LEG 座標は実メッシュ配置", liveLeg && Math.abs(liveLeg.point.y - (0 - LEG_TOTAL / 2 - JB_Y_HALF)) < 1e-6);

ok("最上段 JB は TopCap あり", api.jointHasTopCap(3) === true);
ok("中間 JB は TopCap なし", api.jointHasTopCap(1) === false);

const dimOuter = api.makeDim("外々", "y", { kind: "leg", index: 0 }, { kind: "joint", index: 3 });
const floorY = liveLeg.bounds.minY;
const topY = 1200 + JB_Y_HALF + TC;
ok("LEG→最上段JB 外々は床〜TopCap上面", dimOuter && !dimOuter.invalid && Math.abs(dimOuter.mm - (topY - floorY)) < 1e-6, String(dimOuter && dimOuter.mm));
ok("床は最下JB中心-22.0", Math.abs(floorY - (-22)) < 1e-6, String(floorY));
ok("外々の基準面表示", dimOuter.startFace && dimOuter.startFace.plane.indexOf("床接地") >= 0 && dimOuter.endFace.member === "JB+TopCap" && dimOuter.endFace.plane === "最上面");

const dimNoCap = api.makeDim("外々", "y", { kind: "leg", index: 0 }, { kind: "joint", index: 2 });
const topNoCap = 800 + JB_Y_HALF;
ok("TopCap なしは JB 外形上端", dimNoCap && !dimNoCap.invalid && Math.abs(dimNoCap.mm - (topNoCap - floorY)) < 1e-6, String(dimNoCap && dimNoCap.mm));
ok("TopCap なしのラベル", dimNoCap.endFace && dimNoCap.endFace.member === "JB" && dimNoCap.endFace.plane === "外形上端");

const productOuter = 12.9 + 18.2 + 3 * 400 + 2.2;
ok("未実測400は名目ピッチ＋製品端部", Math.abs(dimOuter.mm - productOuter) < 1e-6, String(dimOuter && dimOuter.mm));

const oldY = legs[0].mesh.position.y;
legs[0].mesh.position.y = oldY - 30;
const dimMoved = api.makeDim("外々", "y", { kind: "leg", index: 0 }, { kind: "joint", index: 3 });
ok("LEG配置を変えると外々が変わる", dimMoved && Math.abs(dimMoved.mm - (dimOuter.mm + 30)) < 1e-6, String(dimMoved && dimMoved.mm));
legs[0].mesh.position.y = oldY;

const dimC2c = api.makeDim("芯々", "y", { kind: "joint", index: 0 }, { kind: "joint", index: 3 });
ok("既存 芯々 はジョイント中心差", dimC2c && !dimC2c.invalid && Math.abs(dimC2c.mm - 1200) < 1e-6);

const dimInner = api.makeDim("内々", "x", { kind: "joint", index: 0 }, { kind: "joint", index: 4 });
ok("既存 内々 は重なり判定を維持", dimInner && !dimInner.invalid && Math.abs(dimInner.mm - (200 - 2 * JOINT_R)) < 1e-6, String(dimInner && dimInner.mm));

const dimOuterX = api.makeDim("外々", "x", { kind: "joint", index: 0 }, { kind: "joint", index: 4 });
ok("水平 外々 に TopCap を足さない", dimOuterX && Math.abs(dimOuterX.mm - (200 + 2 * JOINT_R)) < 1e-6);

const dimC2cLeg = api.makeDim("芯々", "y", { kind: "leg", index: 0 }, { kind: "joint", index: 0 });
ok("LEG 芯々は中心座標を使う", dimC2cLeg && !dimC2cLeg.invalid && dimC2cLeg.startFace.plane === "中心");

ok("既存 Beam 捕捉を壊さない", api.captureRef({ kind: "beam", index: 0, point: vec(100, 0, 0) }).kind === "beam");

const poleMesh = poles[0].mesh;
const jointMesh = jointMeshes[3];
const measPick = ops.pickFromHits(
  [{ object: poleMesh, distance: 100 }, { object: jointMesh, distance: 108 }],
  beams, poles, jointMeshes, [], [], legs,
  { includeLeg: true }
);
ok("測定中は手前の Pole より JB を選ぶ", measPick && measPick.kind === "joint" && measPick.index === 3);

const normalPick = ops.pickFromHits(
  [{ object: poleMesh, distance: 100 }, { object: jointMesh, distance: 108 }],
  beams, poles, jointMeshes, [], [], [],
  {}
);
ok("通常ピックは最近傍の Pole のまま", normalPick && normalPick.kind === "pole");

const farJoint = ops.pickFromHits(
  [{ object: poleMesh, distance: 100 }, { object: jointMesh, distance: 140 }],
  beams, poles, jointMeshes, [], [], legs,
  { includeLeg: true }
);
ok("離れた JB は Pole シャフトをクリックした扱いにする", farJoint && farJoint.kind === "pole");

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
