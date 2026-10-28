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

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cadSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const lenSrc = fs.readFileSync(path.join(root, "js/ui/v3-length-panel.js"), "utf8");
const pickSrc = fs.readFileSync(path.join(root, "js/ui/v3-place-pick.js"), "utf8");
const boardsSrc = fs.readFileSync(path.join(root, "js/parts/boards.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const drawingJs = fs.readFileSync(path.join(root, "js/app/drawing.js"), "utf8");
const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const highlightSrc = fs.readFileSync(path.join(root, "tests/v3-joint-select-highlight.test.js"), "utf8");
const colorSrc = fs.readFileSync(path.join(root, "tests/v3-instance-color-init.test.js"), "utf8");

const boardGroup = cadSrc.match(/id:\s*"board"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
ok("板グループは棚板アイコン1つ", !!(boardGroup && /cmd:\s*"shelf"/.test(boardGroup[1]) && !/cmd:\s*"wall"/.test(boardGroup[1])));
ok("壁板アイコンはツールバーから撤去", boardGroup && boardGroup[1].indexOf("13-panel.svg") < 0);
ok("wall コマンドは互換のため残す", cadSrc.indexOf('case "wall":') >= 0 && cadSrc.indexOf("openBoardAddRail") >= 0);
ok("棚板モードで East Rail を開く", cadSrc.indexOf("openAdd({ board: true })") >= 0);
ok("棚板・壁板どちらでも棚板アイコンを ON", cadSrc.indexOf("if (window.isBoardModeOn) return \"shelf\"") >= 0);
ok("East Rail に種類切替がある", lenSrc.indexOf("パーツの種類") >= 0 && lenSrc.indexOf("fillBoardAdd") >= 0);
ok("East Rail に配置方法がある", lenSrc.indexOf("自動配置") >= 0 && lenSrc.indexOf("4点選択") >= 0);
ok("board:true は Beam/Pole 長さを戻さない", /function openAdd\(opts\) \{[\s\S]*?if \(opts\.board \|\| window\.isBoardModeOn\) \{[\s\S]*?return;\s*\}/.test(lenSrc));
ok("狭幅は縦並び", indexSrc.indexOf(".v3-len-board-seg{ grid-template-columns:1fr; }") >= 0);
ok("通常幅は板ボタン2列", /#v3-east-pane-add[\s\S]{0,80}\.v3-len-board-seg\{[\s\S]{0,80}repeat\(2, minmax\(0, 1fr\)\)/.test(indexSrc) || indexSrc.indexOf("grid-template-columns:repeat(2, minmax(0, 1fr))") >= 0 && indexSrc.indexOf(".v3-len-board-seg") >= 0);
ok("横スクロール抑制を維持", indexSrc.indexOf("overflow-x:hidden") >= 0);
ok("280px / 36px を維持", indexSrc.indexOf("--v3-east-rail-w:280px") >= 0 && indexSrc.indexOf("--v3-east-tab-w:36px") >= 0);
ok("板タイトルは控えめ", indexSrc.indexOf(".v3-len-board-title") >= 0 && /v3-len-board-title\{[\s\S]{0,220}font-size:10px/.test(indexSrc) && /v3-len-board-title\{[\s\S]{0,220}color:#64748b/.test(indexSrc));
ok("板ラベルは小さめ", /v3-len-board-label\{[\s\S]{0,180}font-size:10px/.test(indexSrc));
ok("選択中は青アクセント", /v3-len-board-seg \.v3-len-mode\.is-on\{[\s\S]{0,120}background:#1e3a5f/.test(indexSrc) && /v3-len-board-seg \.v3-len-mode\.is-on\{[\s\S]{0,160}border-color:#61A0FF/.test(indexSrc));
ok("Beam/Pole ラベルは未変更", /\.v3-len-kind\{[\s\S]{0,80}font-size:13px/.test(indexSrc));
ok("Beam/Pole ボタン高さは未変更", /\.v3-len-mode\{[\s\S]{0,80}height:28px/.test(indexSrc));
ok("狭幅の縦並びは板セグメントのみ", indexSrc.indexOf(".v3-len-kinds, .v3-len-modes{ flex-direction:column; }") < 0);
ok("キャッシュ更新", indexSrc.indexOf("boards.js?v=20261026-board1") >= 0 && indexSrc.indexOf("v3-cad-toolbar.js?v=20261027-pub3") >= 0 && indexSrc.indexOf("main.js?v=20261028-sku1") >= 0);
ok("図面モジュールは未変更パス", drawingJs.indexOf("FIXED_SLOTS") >= 0 || drawingJs.indexOf("drawingDocument") >= 0);
ok("instanceColor 初期化修正を維持", poolSrc.indexOf("function allocInstanceColor") >= 0 && colorSrc.indexOf("allocInstanceColor") >= 0);
ok("JB 赤い選択ハイライトを維持", highlightSrc.indexOf("restoreSelectedJointVisual") >= 0);
ok("自動配置は JB 選択しない", mainSrc.indexOf('if (placeMode === "auto") return;') >= 0);
ok("4点選択は placeMode を渡す", mainSrc.indexOf("placeMode: placeMode") >= 0);
ok("壁板は画面投影で拾う", boardsSrc.indexOf("function pickPanelCellJ4") >= 0 && boardsSrc.indexOf("panelHitScreen") >= 0);
ok("hover と click の区画を一致させる", mainSrc.indexOf("__CR_BOARD_PENDING_J4__") >= 0 && boardsSrc.indexOf("window.addBoardFromPreview") >= 0);
ok("Undo は add board のまま", boardsSrc.indexOf('saveHistory?.("add board")') >= 0);

const pickSandbox = { window: {}, console: console };
pickSandbox.window.window = pickSandbox.window;
vm.runInNewContext(pickSrc, pickSandbox);
const pick = pickSandbox.window.v3PlacePick;
ok("place-pick 起動", !!(pick && pick.decideBoardClick && pick.resolveBoardPlaceMode));

function orthoXZ(origin) {
  origin = origin || { x: 0, y: 0 };
  return function (pos) {
    return { x: origin.x + pos.x, y: origin.y - pos.z };
  };
}

{
  const joints = [
    { x: 0, y: 0, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 200, y: 0, z: 200 },
    { x: 0, y: 0, z: 200 },
  ];
  const j4 = [0, 1, 2, 3];
  const project = orthoXZ({ x: 10, y: 10 });
  const inside = { x: 10 + 100, y: 10 - 100 };
  const autoOff = pick.decideBoardClick({
    previewJ4: j4, joints: joints, clientX: 900, clientY: 900,
    project: project, nearJointIndex: -1, selectedCount: 0, placeMode: "auto",
  });
  ok("自動配置でプレビュー外は確定しない", autoOff.action === "none");
  const autoOn = pick.decideBoardClick({
    previewJ4: j4, joints: joints, clientX: inside.x, clientY: inside.y,
    project: project, nearJointIndex: 1, selectedCount: 0, placeMode: "auto",
  });
  ok("hover と同じ j4 で確定", autoOn.action === "place" && autoOn.j4.join(",") === "0,1,2,3");
  const pick4 = pick.decideBoardClick({
    previewJ4: j4, joints: joints, clientX: inside.x, clientY: inside.y,
    project: project, nearJointIndex: 1, selectedCount: 2, placeMode: "pick4",
  });
  ok("4点途中はプレビューより JB 選択", pick4.action === "pick-joint" && pick4.jointIndex === 1);
}

function Vec3(x, y, z) {
  this.x = x || 0;
  this.y = y || 0;
  this.z = z || 0;
}
Vec3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vec3.prototype.clone = function () { return new Vec3(this.x, this.y, this.z); };
Vec3.prototype.subVectors = function (a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; };
Vec3.prototype.addVectors = function (a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; };
Vec3.prototype.multiplyScalar = function (s) { this.x *= s; this.y *= s; this.z *= s; return this; };
Vec3.prototype.normalize = function () {
  const l = Math.hypot(this.x, this.y, this.z) || 1;
  this.x /= l; this.y /= l; this.z /= l;
  return this;
};
Vec3.prototype.length = function () { return Math.hypot(this.x, this.y, this.z); };
Vec3.prototype.dot = function (v) { return this.x * v.x + this.y * v.y + this.z * v.z; };
Vec3.prototype.distanceTo = function (v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); };

const boardToggle = { checked: true, dispatchEvent: function () {} };
const boardWin = {
  joints: [],
  beams: [],
  poles: [],
  isBoardModeOn: true,
  camera: { position: { x: 100, y: 200, z: -400 } },
};
const boardDoc = {
  getElementById: function (id) {
    if (id === "board-kind-toggle") return boardToggle;
    return null;
  },
};
const boardSandbox = {
  console: console,
  THREE: {
    Vector3: Vec3,
    MeshStandardMaterial: function () { return {}; },
    Mesh: function () { return { position: { set: function () {} } }; },
    BoxGeometry: function () { return {}; },
    Matrix4: function () { return { makeBasis: function () { return this; } }; },
  },
  window: boardWin,
  document: boardDoc,
};
boardWin.window = boardWin;
boardWin.document = boardDoc;
vm.runInNewContext(pickSrc, boardSandbox);
vm.runInNewContext(boardsSrc, boardSandbox);
const boardPick = boardWin.v3BoardPick;
ok("壁板 pick API がある", !!(boardPick && boardPick.pickPanelCellJ4 && boardPick.findClosedPanelQuads));

function loadCube(extraBay) {
  const joints = [
    { x: 0, y: 0, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 200, y: 400, z: 0 },
    { x: 0, y: 400, z: 0 },
    { x: 0, y: 0, z: 200 },
    { x: 200, y: 0, z: 200 },
    { x: 200, y: 400, z: 200 },
    { x: 0, y: 400, z: 200 },
  ];
  const beams = [
    { a: 0, b: 1 }, { a: 2, b: 3 },
    { a: 4, b: 5 }, { a: 6, b: 7 },
    { a: 0, b: 4 }, { a: 1, b: 5 },
    { a: 3, b: 7 }, { a: 2, b: 6 },
  ];
  const poles = [
    { a: 0, b: 3 }, { a: 1, b: 2 },
    { a: 4, b: 7 }, { a: 5, b: 6 },
  ];
  if (extraBay) {
    joints.push(
      { x: 400, y: 0, z: 0 },
      { x: 400, y: 400, z: 0 },
      { x: 400, y: 0, z: 200 },
      { x: 400, y: 400, z: 200 }
    );
    beams.push({ a: 1, b: 8 }, { a: 2, b: 9 }, { a: 5, b: 10 }, { a: 6, b: 11 }, { a: 8, b: 10 }, { a: 9, b: 11 });
    poles.push({ a: 8, b: 9 }, { a: 10, b: 11 });
  }
  boardWin.joints = joints;
  boardWin.beams = beams;
  boardWin.poles = poles;
}

function wallProject(pos) {
  return { x: 40 + pos.x, y: 480 - pos.y };
}

loadCube(false);
const closed = boardPick.findClosedPanelQuads();
ok("完成した垂直区画を検出", closed.length >= 4, "n=" + closed.length);

const front = boardPick.pickPanelCellJ4({
  clientX: 40 + 100,
  clientY: 480 - 200,
  project: wallProject,
  cameraPos: { x: 100, y: 200, z: -400 },
});
ok("面内部でも壁板候補を拾う", !!(front && front.length === 4));

const frontJ = (front || []).slice().sort(function (a, b) { return a - b; }).join(",");
ok("手前の面を優先", frontJ === "0,1,2,3", "j4=" + frontJ);

const back = boardPick.pickPanelCellJ4({
  clientX: 40 + 100,
  clientY: 480 - 200,
  project: wallProject,
  cameraPos: { x: 100, y: 200, z: 600 },
});
const backJ = (back || []).slice().sort(function (a, b) { return a - b; }).join(",");
ok("奥側カメラでは奥の面", backJ === "4,5,6,7", "j4=" + backJ);

const miss = boardPick.pickPanelCellJ4({
  clientX: 900,
  clientY: 900,
  project: wallProject,
  cameraPos: { x: 100, y: 200, z: -400 },
  worldPos: { x: 100, y: 200, z: 0 },
});
ok("画面外では隣接区画を拾わない", miss == null);

loadCube(true);
const left = boardPick.pickPanelCellJ4({
  clientX: 40 + 80,
  clientY: 480 - 200,
  project: wallProject,
  cameraPos: { x: 100, y: 200, z: -400 },
});
const right = boardPick.pickPanelCellJ4({
  clientX: 40 + 320,
  clientY: 480 - 200,
  project: wallProject,
  cameraPos: { x: 200, y: 200, z: -400 },
});
const leftJ = (left || []).slice().sort(function (a, b) { return a - b; }).join(",");
const rightJ = (right || []).slice().sort(function (a, b) { return a - b; }).join(",");
ok("隣接区画を取り違えない", leftJ === "0,1,2,3" && rightJ === "1,2,8,9", "L=" + leftJ + " R=" + rightJ);

const stick = boardPick.pickPanelCellJ4({
  clientX: 40 + 80,
  clientY: 480 - 200,
  project: wallProject,
  cameraPos: { x: 100, y: 200, z: -400 },
  currentJ4: left,
});
ok("微小移動で候補がちらつかない", !!(stick && boardPick.sameJ4(stick, left)));

boardWin.beams = boardWin.beams.filter(function (b) { return !(b.a === 0 && b.b === 1); });
const incomplete = boardPick.findClosedPanelQuads().filter(function (q) {
  const k = q.j4.slice().sort(function (a, b) { return a - b; }).join(",");
  return k === "0,1,2,3";
});
ok("未完成区画は自動配置しない", incomplete.length === 0);

ok("配置方法の切替は未確定選択だけクリア", boardsSrc.indexOf("window.setBoardPlaceMode") >= 0 && boardsSrc.indexOf("window.clearBoardSelection") >= 0);
ok("種類切替でも板モードを維持", lenSrc.indexOf("setBoardKindWall") >= 0 && lenSrc.indexOf("fillBoardAdd") >= 0);

function makeEl(tag, id) {
  const children = [];
  const classSet = {};
  const node = {
    tagName: String(tag || "div").toUpperCase(),
    id: id || "",
    hidden: false,
    textContent: "",
    type: "",
    className: "",
    children: children,
    parentElement: null,
    style: { setProperty: function () {}, getPropertyValue: function () { return ""; } },
    classList: {
      add: function (c) { classSet[c] = true; node.className = Object.keys(classSet).join(" "); },
      remove: function (c) { delete classSet[c]; node.className = Object.keys(classSet).join(" "); },
      toggle: function (c, on) { if (on === false) this.remove(c); else if (on || !classSet[c]) this.add(c); else this.remove(c); },
      contains: function (c) { return !!classSet[c]; },
    },
    setAttribute: function () {},
    getAttribute: function () { return null; },
    addEventListener: function (type, fn) { node["on" + type] = fn; },
    appendChild: function (child) { children.push(child); child.parentElement = node; return child; },
    click: function () { if (typeof node.onclick === "function") node.onclick({ preventDefault: function () {} }); },
  };
  if (id) node.id = id;
  return node;
}

const els = {
  "v3-east-pane-add": makeEl("div", "v3-east-pane-add"),
  "v3-east-pane-length": makeEl("div", "v3-east-pane-length"),
  "v3-east-rail": makeEl("aside", "v3-east-rail"),
  "v3-east-pane": makeEl("div", "v3-east-pane"),
  "v3-float-layer": makeEl("div", "v3-float-layer"),
  "board-kind-toggle": makeEl("input", "board-kind-toggle"),
};
els["board-kind-toggle"].checked = false;
els["v3-east-pane-add"].parentElement = els["v3-east-rail"];
let railOpen = null;
let placeMode = "auto";
let syncCount = 0;
const lenSandbox = {
  console: console,
  window: {
    innerWidth: 1920,
    innerHeight: 1080,
    isBoardModeOn: true,
    isBoardKindWall: function () { return !!els["board-kind-toggle"].checked; },
    setBoardKindWall: function (on) { els["board-kind-toggle"].checked = !!on; },
    getBoardPlaceMode: function () { return placeMode; },
    setBoardPlaceMode: function (mode) { placeMode = mode === "pick4" ? "pick4" : "auto"; },
    BEAM_LENGTH_OPTIONS: [200],
    POLE_LENGTH_OPTIONS: [200],
    currentPartType: "beam",
    currentLengthMm: 200,
    isOrderModeOn: false,
    addEventListener: function () {},
    v3CadToolbar: { syncActive: function () { syncCount += 1; } },
  },
  document: {
    body: {
      classList: { toggle: function () {}, add: function () {}, remove: function () {} },
      appendChild: function (child) { return child; },
    },
    getElementById: function (id) { return els[id] || null; },
    createElement: function (tag) { return makeEl(tag); },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  },
};
lenSandbox.window.window = lenSandbox.window;
lenSandbox.window.document = lenSandbox.document;
lenSandbox.window.v3EastRail = {
  open: function (id) {
    railOpen = id;
    const pan = lenSandbox.window.v3LengthPanel;
    if (id === "add" && pan && pan.mountAdd) pan.mountAdd(els["v3-east-pane-add"]);
  },
  getOpenId: function () { return railOpen; },
};
vm.runInNewContext(lenSrc, lenSandbox);
const panel = lenSandbox.window.v3LengthPanel;
ok("length-panel 起動", !!(panel && panel.openAdd));
panel.openAdd({ board: true });
ok("棚板モードでパーツ追加が開く", railOpen === "add");
const boardNodes = [];
(function collect(el) {
  if (!el) return;
  boardNodes.push(el);
  (el.children || []).forEach(collect);
})(els["v3-east-pane-add"]);
ok("板タイトルが控えめクラス", boardNodes.some(function (n) { return (n.className || "").indexOf("v3-len-board-title") >= 0 && n.textContent === "板を追加"; }));
ok("種類と配置がセグメント2列", boardNodes.filter(function (n) { return (n.className || "").indexOf("v3-len-board-seg") >= 0; }).length === 2);
ok("Beam/Pole 切替行は出ない", !boardNodes.some(function (n) { return n.textContent === "BEAM" || n.textContent === "POLE"; }));

function walk(el, out) {
  if (!el) return;
  out.push(el);
  (el.children || []).forEach(function (c) { walk(c, out); });
}
function labels() {
  const all = [];
  walk(els["v3-len-root-add"] || els["v3-east-pane-add"], all);
  return all.map(function (n) { return n.textContent; });
}
const texts = labels();
ok("右側で棚板/壁板を選べる", texts.indexOf("棚板") >= 0 && texts.indexOf("壁板") >= 0);
ok("右側で自動/4点を選べる", texts.indexOf("自動配置") >= 0 && texts.indexOf("4点選択") >= 0);
ok("初期は棚板", !els["board-kind-toggle"].checked);
ok("Beam 長さをリセットしない", lenSandbox.window.currentLengthMm === 200);

const allBtns = [];
walk(els["v3-len-root-add"] || els["v3-east-pane-add"], allBtns);
const wallBtn = allBtns.find(function (el) { return el.textContent === "壁板"; });
if (wallBtn) wallBtn.click();
ok("壁板切替後も棚板アイコン同期のみ", syncCount >= 1 && railOpen === "add");
ok("壁板に切り替わる", !!els["board-kind-toggle"].checked);
ok("板追加モードは維持", lenSandbox.window.isBoardModeOn === true);
const pick4Btn = [];
walk(els["v3-len-root-add"] || els["v3-east-pane-add"], pick4Btn);
const four = pick4Btn.find(function (el) { return el.textContent === "4点選択"; });
if (four) four.click();
ok("4点選択に切り替わる", placeMode === "pick4");

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
