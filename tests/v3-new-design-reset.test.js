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

const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const meshSrc = fs.readFileSync(path.join(root, "js/core/mesh.js"), "utf8");
const fileSrc = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const histSrc = fs.readFileSync(path.join(root, "js/features/history.js"), "utf8");

const resetClick = mainSrc.slice(
  mainSrc.indexOf("resetBtn.addEventListener"),
  mainSrc.indexOf("performNewDesign();", mainSrc.indexOf("resetBtn.addEventListener")) + 40
);
const performSrc = mainSrc.slice(
  mainSrc.indexOf("function performNewDesign"),
  mainSrc.indexOf("window.clearPlacedBoards")
);

ok("新規は既存resetへ委譲", fileSrc.indexOf("function newDesign") >= 0 && fileSrc.indexOf('getElementById("reset-btn")') >= 0);
ok("キャンセル確認がクリアより前", resetClick.indexOf("confirm(") < resetClick.indexOf("performNewDesign()"));
ok("確認をキャンセルしたら return", /if \(!confirm\([\s\S]{0,80}return/.test(resetClick));
ok("正規クリア clearAllDesign を再利用", performSrc.indexOf("clearAllDesign()") >= 0);
ok("部材配列だけ空にして終わらない", performSrc.indexOf("jointMeshes.length = 0") < 0 || performSrc.indexOf("clearAllDesign()") >= 0);
ok("instance pool を clear する", mainSrc.indexOf("v3InstancePool.clear") >= 0 && /function clearAllDesign[\s\S]*v3InstancePool\.clear/.test(mainSrc));
ok("Beam/Pole は dispose 経路", /function clearAllDesign[\s\S]*disposeBeamMesh[\s\S]*disposePoleMesh/.test(mainSrc));
ok("JB も dispose 経路", /function clearAllDesign[\s\S]*disposeJointMeshByIndex/.test(mainSrc));
ok("棚板・壁板も消す", performSrc.indexOf("clearPlacedBoards()") >= 0 && mainSrc.indexOf("function clearPlacedBoards") >= 0);
ok("選択・プレビュー・4点を消す", performSrc.indexOf("hidePreview") >= 0 && performSrc.indexOf("hideBoardPreview") >= 0 && performSrc.indexOf("clearBoardSelection") >= 0);
ok("Undo履歴を初期化する", performSrc.indexOf("resetUndoHistoryToCurrent()") >= 0 && mainSrc.indexOf("window.history = snap ? [snap] : []") >= 0);
ok("クリア前に旧ラックを履歴保存しない", resetClick.indexOf("saveHistory") < 0);
ok("scene.clear は使わない", performSrc.indexOf("scene.clear") < 0 && !/function performNewDesign[\s\S]{0,800}scene\.clear/.test(mainSrc));
ok("visible=false の対症療法は使わない", performSrc.indexOf("visible = false") < 0);
ok("新規後に原点シードを置く", performSrc.indexOf("createJoint({ x: 0, y: 0, z: 0 })") >= 0);
ok("新規後に pool.sync", performSrc.indexOf("v3InstancePool.sync(true)") >= 0);
ok("既存JSON復元は rebuild のまま", fileSrc.indexOf("function rebuildSceneFromData") >= 0 && fileSrc.indexOf("v3InstancePool.clear") >= 0);
ok("保存形式はJSONのまま", fileSrc.indexOf("mfes-design") >= 0 && fileSrc.indexOf("application/json") >= 0);
ok("キャッシュ更新", indexSrc.indexOf("main.js?v=20261027-h1") >= 0 && indexSrc.indexOf("v3-instance-pool.js?v=20261027-h1") >= 0);
ok("Undoは履歴配列を読む", histSrc.indexOf("function undo") >= 0 && histSrc.indexOf("window.historyIndex <= 0") >= 0);
ok("disposeHandle が共有破棄経路", meshSrc.indexOf("disposeHandle") >= 0 && meshSrc.indexOf("v3Instanced") >= 0);

const THREE = require(path.join(root, "three.min.js"));
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
  shelves: [],
  panels: [],
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
windowObj.applyMaterialFinish = function () {};
windowObj.applyMaterialColorToMesh = function (obj3d, materialCode) {
  if (!obj3d || !obj3d.material) return;
  obj3d.material.color.setHex(windowObj.MATERIAL_COLOR.IRON);
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

function makeRack() {
  const ja = pool.createJoint({ x: 0, y: 0, z: 0 }, "IRON");
  const jb = pool.createJoint({ x: 900, y: 0, z: 0 }, "IRON");
  const jc = pool.createJoint({ x: 0, y: 1500, z: 0 }, "IRON");
  const beam = pool.createConnector("beam", windowObj.beamMaterial, "IRON");
  const pole = pool.createConnector("pole", windowObj.poleMaterial, "IRON");
  const leg = new THREE.Group();
  pool.registerLeg(leg);
  windowObj.joints = [
    { x: 0, y: 0, z: 0 },
    { x: 900, y: 0, z: 0 },
    { x: 0, y: 1500, z: 0 },
  ];
  windowObj.jointMeshes = [ja, jb, jc];
  windowObj.beams = [{ a: 0, b: 1, mesh: beam }];
  windowObj.poles = [{ a: 0, b: 2, mesh: pole }];
  windowObj.legs = [{ jointIndex: 0, mesh: leg }];
  windowObj.shelves = [{ j4: [0, 1, 2, 1], mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()) }];
  windowObj.panels = [{ j4: [0, 1, 2, 1], mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()) }];
  windowObj.rackGroup.add(windowObj.shelves[0].mesh);
  windowObj.rackGroup.add(windowObj.panels[0].mesh);
  pool.sync(true);
  return pool.stats();
}

function buggyParentRemoveOnly() {
  windowObj.jointMeshes.forEach(function (m) {
    if (m && m.parent) m.parent.remove(m);
  });
  windowObj.beams.forEach(function (b) {
    if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
    b.mesh = null;
  });
  windowObj.poles.forEach(function (p) {
    if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    p.mesh = null;
  });
  windowObj.legs.forEach(function (l) {
    if (l.mesh) pool.disposeHandle(l.mesh);
  });
  windowObj.joints.length = 0;
  windowObj.jointMeshes.length = 0;
  windowObj.beams.length = 0;
  windowObj.poles.length = 0;
  windowObj.legs.length = 0;
  pool.sync(true);
}

function clearLikePerformNewDesign() {
  windowObj.jointMeshes.forEach(function (m) {
    if (m) pool.disposeHandle(m);
  });
  windowObj.beams.forEach(function (b) {
    if (b.mesh) pool.disposeHandle(b.mesh);
  });
  windowObj.poles.forEach(function (p) {
    if (p.mesh) pool.disposeHandle(p.mesh);
  });
  windowObj.legs.forEach(function (l) {
    if (l.mesh) pool.disposeHandle(l.mesh);
  });
  windowObj.shelves.forEach(function (s) {
    if (s.mesh && s.mesh.parent) s.mesh.parent.remove(s.mesh);
  });
  windowObj.panels.forEach(function (p) {
    if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
  });
  windowObj.joints.length = 0;
  windowObj.jointMeshes.length = 0;
  windowObj.beams.length = 0;
  windowObj.poles.length = 0;
  windowObj.legs.length = 0;
  windowObj.shelves.length = 0;
  windowObj.panels.length = 0;
  pool.clear();
}

const before = makeRack();
ok("ラック作成後は Beam/Pole/JB がある", before.byKind.beam > 0 && before.byKind.pole > 0 && before.byKind.joint > 0, JSON.stringify(before.byKind));
ok("ラック作成後は描画インスタンスがある", before.drawn > 0 && before.instances > 0);

buggyParentRemoveOnly();
const leftover = pool.stats();
ok("診断B: 配列空でも pool に Beam/Pole/JB が残る", leftover.byKind.beam > 0 && leftover.byKind.pole > 0 && leftover.byKind.joint > 0, JSON.stringify(leftover.byKind));
ok("診断B: 描画インスタンスも残る", leftover.drawn > 0);
ok("診断B: LEG は dispose で消える", !leftover.byKind.legBase && !leftover.byKind.legCone);

pool.clear();
const afterClear = pool.stats();
ok("pool.clear 後は描画インスタンス0", afterClear.instances === 0 && afterClear.drawn === 0 && afterClear.pools === 0);

const rebuilt = makeRack();
ok("再構築できる", rebuilt.byKind.beam > 0 && rebuilt.byKind.joint >= 3);

const snapshot = {
  joints: windowObj.joints.slice(),
  beams: windowObj.beams.map(function (b) { return { a: b.a, b: b.b }; }),
  poles: windowObj.poles.map(function (p) { return { a: p.a, b: p.b }; }),
  legs: windowObj.legs.map(function (l) { return { jointIndex: l.jointIndex }; }),
  shelves: windowObj.shelves.map(function (s) { return { j4: s.j4 }; }),
  panels: windowObj.panels.map(function (p) { return { j4: p.j4 }; }),
};
const historyBefore = [JSON.stringify(snapshot)];

clearLikePerformNewDesign();
const seed = pool.createJoint({ x: 0, y: 0, z: 0 }, "IRON");
windowObj.joints = [{ x: 0, y: 0, z: 0 }];
windowObj.jointMeshes = [seed];
const originLeg = new THREE.Group();
pool.registerLeg(originLeg);
windowObj.legs = [{ jointIndex: 0, mesh: originLeg }];
pool.sync(true);
const emptySnap = {
  joints: [{ x: 0, y: 0, z: 0 }],
  beams: [],
  poles: [],
  legs: [{ jointIndex: 0 }],
  shelves: [],
  panels: [],
};
const historyAfter = [JSON.stringify(emptySnap)];
const afterNew = pool.stats();

ok("新規後 CAD の Beam/Pole は空", windowObj.beams.length === 0 && windowObj.poles.length === 0);
ok("新規後 棚板・壁板も空", windowObj.shelves.length === 0 && windowObj.panels.length === 0);
ok("新規後 Beam/Pole 描画インスタンスは0", (afterNew.byKind.beam || 0) === 0 && (afterNew.byKind.pole || 0) === 0, JSON.stringify(afterNew.byKind));
ok("新規後 旧JBは残らない", windowObj.joints.length === 1 && windowObj.jointMeshes.length === 1 && (afterNew.byKind.joint || 0) === 1);
ok("新規後 旧ラックの描画は消える", afterNew.drawn > 0 && afterNew.drawn < leftover.drawn);
ok("Undo履歴は新規後だけ", historyAfter.length === 1 && JSON.parse(historyAfter[0]).beams.length === 0);
ok("Undoしても旧ラックは復活しない", historyAfter.length === 1 && historyBefore[0] !== historyAfter[0]);

const beam2 = pool.createConnector("beam", windowObj.beamMaterial, "IRON");
const pole2 = pool.createConnector("pole", windowObj.poleMaterial, "IRON");
windowObj.beams.push({ a: 0, b: 0, mesh: beam2 });
windowObj.poles.push({ a: 0, b: 0, mesh: pole2 });
pool.sync(true);
const afterAdd = pool.stats();
ok("新規後に Beam/Pole を再追加できる", afterAdd.byKind.beam === 1 && afterAdd.byKind.pole === 1);

clearLikePerformNewDesign();
const seed2 = pool.createJoint({ x: 0, y: 0, z: 0 }, "IRON");
windowObj.joints = [{ x: 0, y: 0, z: 0 }];
windowObj.jointMeshes = [seed2];
pool.sync(true);
const savedEmpty = {
  joints: windowObj.joints.slice(),
  beams: windowObj.beams.slice(),
  poles: windowObj.poles.slice(),
  legs: [],
  shelves: [],
  panels: [],
};
ok("新規後の保存JSONは空デザイン", savedEmpty.beams.length === 0 && savedEmpty.poles.length === 0 && savedEmpty.shelves.length === 0);

pool.clear();
windowObj.jointMeshes = [];
windowObj.beams = [];
windowObj.poles = [];
windowObj.legs = [];
(savedEmpty.joints || []).forEach(function (j) {
  windowObj.jointMeshes.push(pool.createJoint(j, "IRON"));
});
pool.sync(true);
const reloaded = pool.stats();
ok("空デザインを再読み込みしても Beam/Pole は出ない", (reloaded.byKind.beam || 0) === 0 && (reloaded.byKind.pole || 0) === 0 && windowObj.jointMeshes.length === 1);

pool.clear();
(snapshot.joints || []).forEach(function (j) {
  windowObj.jointMeshes.push(pool.createJoint(j, "IRON"));
});
(snapshot.beams || []).forEach(function () {
  windowObj.beams.push({ mesh: pool.createConnector("beam", windowObj.beamMaterial, "IRON") });
});
(snapshot.poles || []).forEach(function () {
  windowObj.poles.push({ mesh: pool.createConnector("pole", windowObj.poleMaterial, "IRON") });
});
pool.sync(true);
const restored = pool.stats();
ok("既存JSONを開くと Beam/Pole/JB が復元される", restored.byKind.beam === 1 && restored.byKind.pole === 1 && restored.byKind.joint === 3);

const keep = pool.stats();
ok("新規キャンセルは確認returnの後にしかクリアしない", resetClick.indexOf("return") >= 0 && resetClick.indexOf("return") < resetClick.indexOf("performNewDesign()"));
ok("新規キャンセル後も復元データは維持", keep.byKind.beam === 1 && keep.byKind.pole === 1 && keep.byKind.joint === 3);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
