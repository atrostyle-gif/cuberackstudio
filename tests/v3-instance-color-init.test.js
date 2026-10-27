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

const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
const pickSrc = fs.readFileSync(path.join(root, "js/ui/v3-place-pick.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const diagSrc = fs.readFileSync(path.join(root, "js/ui/v3-diag-joint-select.js"), "utf8");

ok("r128 の count 件確保を使わない", poolSrc.indexOf("new Float32Array(this.count") < 0);
ok("容量で instanceColor を先に確保する", poolSrc.indexOf("function allocInstanceColor") >= 0 && poolSrc.indexOf("new Float32Array(n * 3)") >= 0);
ok("count=0 は instanceColor 確保の後", poolSrc.indexOf("allocInstanceColor(mesh, cap, kind, matCode)") < poolSrc.indexOf("mesh.count = 0"));
ok("未使用slotは IRON 0x111111 で埋める", poolSrc.indexOf("return 0x111111") >= 0 && poolSrc.indexOf("function defaultInstanceHex") >= 0);
ok("sync 前にバッファサイズを確保する", poolSrc.indexOf("ensureInstanceColor(p)") >= 0);
ok("新規 register で即 setColorAt", /p\.handles\.push\(handle\);[\s\S]{0,180}setColorAt\(handle\.userData\.v3Slot/.test(poolSrc));
ok("DynamicDrawUsage を instanceColor にも付ける", poolSrc.indexOf("attr.setUsage(THREE.DynamicDrawUsage)") >= 0);
ok("診断機能は残す", diagSrc.indexOf("v3DiagJointSelect") >= 0 && indexSrc.indexOf("v3-diag-joint-select.js") >= 0);
ok("pool キャッシュ更新", indexSrc.indexOf("v3-instance-pool.js?v=20261027-h1") >= 0);
ok("配置判定は維持", pickSrc.indexOf("function decideAddClick") >= 0);
ok("ハイライト復元は維持", mainSrc.indexOf("function restoreSelectedJointVisual") >= 0);
ok("setSelectedJoint 再実行を対症療法にしない", !/function hidePreview\(\) \{[\s\S]*?setSelectedJoint\(targetIndex\)/.test(mainSrc));
ok("createJoint 経路は維持", jointsSrc.indexOf("v3InstancePool.createJoint") >= 0);

function r128SetColorAt(mesh, index, color) {
  if (mesh.instanceColor === null) {
    mesh.instanceColor = { array: new Float32Array(mesh.count * 3) };
  }
  color.toArray(mesh.instanceColor.array, index * 3);
}

function readHex(mesh, index) {
  const a = mesh.instanceColor && mesh.instanceColor.array;
  if (!a) return null;
  const o = index * 3;
  const r = a[o];
  const g = a[o + 1];
  const b = a[o + 2];
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return 0;
  return (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255);
}

function Color(hex) {
  this.r = ((hex >> 16) & 255) / 255;
  this.g = ((hex >> 8) & 255) / 255;
  this.b = (hex & 255) / 255;
}
Color.prototype.toArray = function (array, offset) {
  array[offset] = this.r;
  array[offset + 1] = this.g;
  array[offset + 2] = this.b;
  return array;
};

const buggy = { count: 128, instanceColor: null };
buggy.count = 0;
buggy.count = 1;
r128SetColorAt(buggy, 0, new Color(0xef4444));
buggy.count = 2;
r128SetColorAt(buggy, 1, new Color(0xef4444));
ok("再現: r128 は新規slotが 0x000000 のまま", readHex(buggy, 0) === 0xef4444 && readHex(buggy, 1) === 0);

const fixed = { count: 128, instanceMatrix: { count: 128 }, instanceColor: null };
const cap = 128;
fixed.instanceColor = { array: new Float32Array(cap * 3) };
const iron = new Color(0x111111);
for (let i = 0; i < cap; i++) iron.toArray(fixed.instanceColor.array, i * 3);
fixed.count = 0;
fixed.count = 1;
r128SetColorAt(fixed, 0, new Color(0xef4444));
ok("修正: 初回選択は 0xef4444", readHex(fixed, 0) === 0xef4444);

fixed.count = 2;
r128SetColorAt(fixed, 1, new Color(0xef4444));
r128SetColorAt(fixed, 0, iron);
ok("修正: 新規slot選択中は 0xef4444", readHex(fixed, 1) === 0xef4444);
ok("修正: 前のJBは通常色 0x111111", readHex(fixed, 0) === 0x111111);

fixed.count = 4;
for (let i = 2; i <= 3; i++) {
  r128SetColorAt(fixed, i, new Color(0xef4444));
  r128SetColorAt(fixed, i - 1, iron);
  ok("修正: 連続生成 " + (i - 1) + "本目が赤", readHex(fixed, i) === 0xef4444);
  ok("修正: 連続生成の前JBは通常色", readHex(fixed, i - 1) === 0x111111);
}

r128SetColorAt(fixed, 3, iron);
r128SetColorAt(fixed, 0, new Color(0xef4444));
ok("修正: 既存JB接続でも赤", readHex(fixed, 0) === 0xef4444);
ok("修正: 選択解除後は通常色", readHex(fixed, 3) === 0x111111);

const grown = { count: 256, instanceColor: { array: new Float32Array(256 * 3) } };
grown.instanceColor.array.set(fixed.instanceColor.array);
r128SetColorAt(grown, 0, new Color(0xef4444));
ok("修正: pool再構築後も選択色が残る", readHex(grown, 0) === 0xef4444);
ok("修正: 再構築後の未選択は通常色", readHex(grown, 1) === 0x111111);

const THREE = require(path.join(root, "three.min.js"));
const origSetColorAt = THREE.InstancedMesh.prototype.setColorAt;
THREE.InstancedMesh.prototype.setColorAt = function (index, color) {
  if (this.instanceColor === null) {
    this.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
  }
  color.toArray(this.instanceColor.array, index * 3);
};

const windowObj = {
  THREE: THREE,
  addEventListener: function () {},
  jointRadius: 10,
  MATERIAL_COLOR: { IRON: 0x111111, BS: 0xFFD700, SUS: 0xD3D3D3 },
  selectedJointIndex: null,
  jointMeshes: [],
  joints: [],
  beams: [],
  poles: [],
  legs: [],
  rackGroup: new THREE.Group(),
  scene: new THREE.Scene(),
  isColorChartOn: false,
  normalizeMaterial: function (m) {
    return String(m || "IRON").toUpperCase() === "BS" ? "BS" : "IRON";
  },
};
windowObj.jointMaterialNormal = new THREE.MeshStandardMaterial({ color: 0x1e1e22 });
windowObj.beamMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a42 });
windowObj.poleMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a42 });
windowObj.legMaterial = new THREE.MeshStandardMaterial({ color: 0x1e1e22 });
windowObj.applyMaterialFinish = function (mat, code) {
  if (windowObj.normalizeMaterial(code) === "IRON" && mat.emissive) {
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  }
};
windowObj.applyMaterialColorToMesh = function (obj3d, materialCode) {
  if (!obj3d || !obj3d.material) return;
  obj3d.material.color.setHex(windowObj.MATERIAL_COLOR.IRON);
  windowObj.applyMaterialFinish(obj3d.material, materialCode);
};

const sandbox = {
  window: windowObj,
  THREE: THREE,
  console: console,
  Date: Date,
  Object: Object,
  Float32Array: Float32Array,
  WeakMap: WeakMap,
  Set: Set,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
};
vm.runInNewContext(poolSrc, sandbox);
const pool = windowObj.v3InstancePool;

function hexOf(handle) {
  const ins = pool.inspectHandle(handle);
  return ins && ins.instanceColor;
}

function addJoint(pos, select) {
  const h = pool.createJoint(pos, "IRON");
  windowObj.applyMaterialColorToMesh(h, "IRON");
  windowObj.jointMeshes.push(h);
  if (select) {
    windowObj.jointMeshes.forEach(function (prev) {
      if (prev === h) return;
      if (prev.material.emissive) prev.material.emissive.setHex(0);
      prev.material.emissiveIntensity = 0;
    });
    windowObj.selectedJointIndex = windowObj.jointMeshes.length - 1;
    if (h.material.emissive) h.material.emissive.setHex(0xef4444);
    h.material.emissiveIntensity = 1.2;
  }
  pool.sync(true);
  return h;
}

const j0 = addJoint({ x: 0, y: 0, z: 0 }, true);
ok("実pool+r128: 初回JBは赤", hexOf(j0) === "0xef4444");
ok("実pool+r128: 初回バッファは容量分ある", j0.userData && pool.inspectHandle(j0).poolCapacity === 128);

const j1 = addJoint({ x: 200, y: 0, z: 0 }, true);
ok("実pool+r128: 新規JB選択中は赤", hexOf(j1) === "0xef4444");
ok("実pool+r128: 新規の通常色初期化後に前JBはIRON", hexOf(j0) === "0x111111");

const j2 = addJoint({ x: 400, y: 0, z: 0 }, true);
const j3 = addJoint({ x: 0, y: 0, z: 200 }, true);
ok("実pool+r128: 連続生成しても赤", hexOf(j3) === "0xef4444");
ok("実pool+r128: 連続生成の途中JBは通常色", hexOf(j1) === "0x111111" && hexOf(j2) === "0x111111");

windowObj.selectedJointIndex = 0;
if (j3.material.emissive) j3.material.emissive.setHex(0);
j3.material.emissiveIntensity = 0;
if (j0.material.emissive) j0.material.emissive.setHex(0xef4444);
j0.material.emissiveIntensity = 1.2;
pool.sync(true);
ok("実pool+r128: 既存接続先が赤", hexOf(j0) === "0xef4444");
ok("実pool+r128: 選択解除後は通常色", hexOf(j1) === "0x111111" && hexOf(j2) === "0x111111" && hexOf(j3) === "0x111111");

pool.sync(true);
ok("実pool+r128: sync(true) 後も赤を維持", hexOf(j0) === "0xef4444");

THREE.InstancedMesh.prototype.setColorAt = origSetColorAt;

if (failed.length) {
  console.error("\nFAILED " + failed.length + ":\n- " + failed.join("\n- "));
  process.exit(1);
}
console.log("\nOK  " + passed + " passed");
