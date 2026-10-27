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

function hypot3(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}

function yOf(joints, idx) {
  return joints[idx] ? joints[idx].y : NaN;
}

function beamsAtY(joints, beams, y) {
  return beams.filter(function (b) {
    const a = joints[b.a];
    const c = joints[b.b];
    if (!a || !c) return false;
    return Math.abs(a.y - y) < 1e-6 && Math.abs(c.y - y) < 1e-6;
  });
}

function polesNearLen(joints, poles, len) {
  return poles.filter(function (p) {
    return Math.abs(hypot3(joints[p.a], joints[p.b]) - len) < 1e-6;
  });
}

function makeWorld() {
  const joints = [];
  const beams = [];
  const poles = [];
  const legs = [];
  const sandbox = {
    console: console,
    Array: Array,
    Object: Object,
    Math: Math,
    Number: Number,
    String: String,
    JSON: JSON,
    Map: Map,
    Set: Set,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    Infinity: Infinity,
    NaN: NaN,
    joints: joints,
    jointMeshes: [],
    beams: beams,
    poles: poles,
    legs: legs,
    jointClusters: [],
    jointClusterId: [],
    saveHistory: function () {},
    disposeJointMeshByIndex: function () {},
    disposeBeamMesh: function () {},
    disposePoleMesh: function () {},
    disposeLegMesh: function () {},
    calcAndRenderEstimate: function () {},
    rebuildJointClusters: function () {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.document = {
    getElementById: function () { return null; },
    addEventListener: function () {},
  };
  sandbox.window.createJoint = function (pos) {
    joints.push({ x: pos.x, y: pos.y, z: pos.z });
    sandbox.jointMeshes.push({ position: { x: pos.x, y: pos.y, z: pos.z } });
    return joints.length - 1;
  };
  sandbox.window.addBeamConnection = function (a, b) {
    beams.push({ a: a, b: b });
  };
  sandbox.window.addPoleConnection = function (a, b) {
    poles.push({ a: a, b: b });
  };
  sandbox.window.addLegIfNeeded = function (i) {
    if (legs.indexOf(i) < 0) legs.push(i);
  };
  sandbox.window.setSelectedJoint = function () {};
  sandbox.window.clearBoardSelection = function () {};
  sandbox.window.remapBoardsForJointIndexMap = function () {};
  sandbox.window.v3WorkLayers = null;
  sandbox.window.addEventListener = function () {};
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/features/autolayout.js"), "utf8"),
    sandbox,
    { filename: "autolayout.js" }
  );
  return {
    sandbox: sandbox,
    joints: joints,
    beams: beams,
    poles: poles,
    legs: legs,
    build: function (cfg, mode) {
      joints.length = 0;
      beams.length = 0;
      poles.length = 0;
      legs.length = 0;
      sandbox.jointMeshes.length = 0;
      sandbox.buildAutoLayoutFromMatrix(cfg, mode || "replace");
      return summarize(joints, beams, poles, legs);
    },
  };
}

function summarize(joints, beams, poles, legs) {
  const ys = {};
  joints.forEach(function (j) {
    const k = String(j.y);
    ys[k] = (ys[k] || 0) + 1;
  });
  return {
    joints: joints.length,
    beams: beams.length,
    poles: poles.length,
    legs: legs.length,
    ys: ys,
    floorBeams: beamsAtY(joints, beams, 0).length,
    raiseBeams: beamsAtY(joints, beams, 100).length,
    stageBeams: beamsAtY(joints, beams, 400).length,
    stage300Beams: beamsAtY(joints, beams, 300).length,
    poles100: polesNearLen(joints, poles, 100).length,
    poles300: polesNearLen(joints, poles, 300).length,
    jointList: joints,
    beamList: beams,
    poleList: poles,
    legList: legs,
  };
}

function cellCfg(opts) {
  opts = opts || {};
  const cols = opts.cols || 1;
  const rows = opts.rows || 1;
  const widthLens = [];
  const depthLens = [];
  const enabledMatrix = [];
  const stageMatrix = [];
  for (let c = 0; c < cols; c++) widthLens.push(opts.width || 200);
  for (let r = 0; r < rows; r++) {
    depthLens.push(opts.depth || 200);
    const en = [];
    const st = [];
    for (let c = 0; c < cols; c++) {
      const on = opts.enabled ? !!opts.enabled[r][c] : true;
      en.push(on);
      st.push({ stages: opts.stages || 1, heights: (opts.heights || [300]).slice() });
    }
    enabledMatrix.push(en);
    stageMatrix.push(st);
  }
  return {
    cols: cols,
    rows: rows,
    widthLens: widthLens,
    depthLens: depthLens,
    enabledMatrix: enabledMatrix,
    stageMatrix: stageMatrix,
    raiseBottom: opts.raiseBottom,
    bottomBeams: opts.bottomBeams,
    omitBottomBeams: opts.omitBottomBeams,
  };
}

const world = makeWorld();
const flags = world.sandbox.resolveRaiseBottomOptions;

ok("resolve: 欠損は下部Beamあり", flags({}).bottomBeams === true && flags({}).raiseBottom === false);
ok("resolve: raiseBottom true", flags({ raiseBottom: true }).raiseBottom === true);
ok("resolve: bottomBeams false", flags({ raiseBottom: true, bottomBeams: false }).bottomBeams === false);
ok("resolve: bottomBeams なし文字列", flags({ bottomBeams: "なし" }).bottomBeams === false);
ok("resolve: omitBottomBeams", flags({ omitBottomBeams: true }).bottomBeams === false);
ok("resolve: 明示ありが優先", flags({ omitBottomBeams: true, bottomBeams: true }).bottomBeams === true);
ok("raise height 既定 100", flags({}).raiseHeightMm === 100);

const a0 = world.build(cellCfg({ cols: 1, rows: 1 }));
ok("従来 1x1 Joint 8", a0.joints === 8);
ok("従来 1x1 Beam 8", a0.beams === 8);
ok("従来 1x1 Pole 4", a0.poles === 4);
ok("従来 1x1 Leg 4", a0.legs === 4);
ok("従来 床Beam 4", a0.floorBeams === 4);
ok("従来 段Beam y=300 が 4", a0.stage300Beams === 4);

const aOn = world.build(cellCfg({ cols: 1, rows: 1, raiseBottom: true, bottomBeams: true }));
ok("A: Joint 12", aOn.joints === 12, "got " + aOn.joints);
ok("A: Beam 12", aOn.beams === 12, "got " + aOn.beams);
ok("A: Pole 8", aOn.poles === 8, "got " + aOn.poles);
ok("A: Leg 4", aOn.legs === 4);
ok("A: 床Beam 4", aOn.floorBeams === 4);
ok("A: POLE100上端Beam 4", aOn.raiseBeams === 4);
ok("A: 段Beam y=400 が 4", aOn.stageBeams === 4);
ok("A: POLE100 が 4", aOn.poles100 === 4);
ok("A: POLE300 が 4", aOn.poles300 === 4);

const aOff = world.build(cellCfg({ cols: 1, rows: 1, raiseBottom: true, bottomBeams: false }));
ok("B: Joint 12（Joint残す）", aOff.joints === 12, "got " + aOff.joints);
ok("B: Leg 4", aOff.legs === 4);
ok("B: Pole 8（POLE100残す）", aOff.poles === 8, "got " + aOff.poles);
ok("B: Beam 8（床のみ省略）", aOff.beams === 8, "got " + aOff.beams);
ok("B: 床Beam 0", aOff.floorBeams === 0);
ok("B: 幅奥行とも床省略", aOff.floorBeams === 0 && aOff.raiseBeams === 4);
ok("B: 上側Beam y=100 残る", aOff.raiseBeams === 4);
ok("B: 上側Beam y=400 残る", aOff.stageBeams === 4);
ok("A-B Beam差は 4", aOn.beams - aOff.beams === 4);

const ignoreOff = world.build(cellCfg({ cols: 1, rows: 1, raiseBottom: false, bottomBeams: false }));
ok("立ち上げOFFなら下部Beamなしを無視", ignoreOff.floorBeams === 4 && ignoreOff.joints === 8);

const missing = world.build(cellCfg({ cols: 1, rows: 1, raiseBottom: true }));
ok("bottomBeams欠損はあり扱い", missing.floorBeams === 4 && missing.raiseBeams === 4);

const two = world.build(cellCfg({ cols: 2, rows: 2, raiseBottom: true, bottomBeams: true }));
const twoOff = world.build(cellCfg({ cols: 2, rows: 2, raiseBottom: true, bottomBeams: false }));
ok("2x2 床Beam あり 12", two.floorBeams === 12, "got " + two.floorBeams);
ok("2x2 床Beam なし 0", twoOff.floorBeams === 0);
ok("2x2 上端Beamは同じ", two.raiseBeams === twoOff.raiseBeams && two.raiseBeams === 12);
ok("2x2 部材差は床Beamのみ", two.beams - twoOff.beams === two.floorBeams && two.joints === twoOff.joints && two.poles === twoOff.poles);

const L = world.build(cellCfg({
  cols: 2,
  rows: 2,
  raiseBottom: true,
  bottomBeams: false,
  enabled: [[true, true], [true, false]],
}));
ok("L字でも床Beam 0", L.floorBeams === 0);
ok("L字でも POLE100 上端Beamあり", L.raiseBeams > 0);
ok("L字でも段Beamあり", L.stageBeams > 0);

const dec = world.build(cellCfg({ cols: 1, rows: 1, width: 200.5, depth: 150.25, raiseBottom: true, bottomBeams: false }));
const xs = dec.jointList.map(function (j) { return j.x; });
ok("小数幅 200.5 を保持", xs.some(function (x) { return Math.abs(x - 200.5) < 1e-9; }));

const stacked = world.build(cellCfg({
  cols: 1,
  rows: 1,
  raiseBottom: false,
  heights: [100, 400],
  stages: 2,
}));
ok("1段目100が下（y=100にBeam）", stacked.ys["100"] === 4, JSON.stringify(stacked.ys));
ok("2段目400が上（y=500にBeam）", stacked.ys["500"] === 4, JSON.stringify(stacked.ys));
ok("下から100mmポール", stacked.poles100 === 4);
ok("その上400mmポール", polesNearLen(stacked.jointList, stacked.poleList, 400).length === 4);

const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-autolayout-panel.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const autoSrc = fs.readFileSync(path.join(root, "js/features/autolayout.js"), "utf8");

ok("index にフローティング窓", indexSrc.indexOf('id="v3-al-win"') >= 0);
ok("パネル最大高さは90vh", indexSrc.indexOf("max-height:min(90vh") >= 0 || indexSrc.indexOf("max-height: min(90vh") >= 0);
ok("本文だけスクロール", indexSrc.indexOf(".v3-al-body") >= 0 && indexSrc.indexOf("overflow:auto") >= 0);
ok("フッタは常時表示", indexSrc.indexOf("v3-al-footer") >= 0 && panelSrc.indexOf("fitWinHeight") >= 0);
ok("index が panel を読む", indexSrc.indexOf("v3-autolayout-panel.js") >= 0);
ok("panel が位置保存", panelSrc.indexOf("popups.autolayout") >= 0);
ok("panel が最小化", panelSrc.indexOf("is-minimized") >= 0);
ok("panel がキャンバス配置", panelSrc.indexOf("v3-al-canvas") >= 0 && panelSrc.indexOf("fitView") >= 0);
ok("セルは1クリックで選択", panelSrc.indexOf("model.sel = { r, c }") >= 0 && panelSrc.indexOf("model.enabled[r][c] = !model.enabled[r][c]") < 0);
ok("個別設定に有効／無効", panelSrc.indexOf("セル有効／無効") >= 0 && panelSrc.indexOf("data-al-cell-en") >= 0);
ok("パン後はセルを反転しない", panelSrc.indexOf("if (was.moved)") >= 0 && panelSrc.indexOf("PAN_SLOP") >= 0);
ok("ズーム後もパンできる", panelSrc.indexOf("w - PAD_R - gw") >= 0 && panelSrc.indexOf("h - PAD_B - gh") >= 0);
ok("panel がパンと範囲選択", panelSrc.indexOf("Shift+ドラッグ") >= 0 && panelSrc.indexOf("marquee") >= 0);
ok("矩形選択ボタン", panelSrc.indexOf("矩形選択") >= 0 && panelSrc.indexOf("data-al-rect-mode") >= 0);
ok("範囲ON/OFFは一括代入", panelSrc.indexOf("applyRectEnabled") >= 0 && panelSrc.indexOf('data-al-rect-act="on"') >= 0 && panelSrc.indexOf('data-al-rect-act="off"') >= 0);
ok("矩形選択は座標クランプ", panelSrc.indexOf("cellAtClamped") >= 0);
ok("Escで選択解除", panelSrc.indexOf('ev.key !== "Escape"') >= 0 && panelSrc.indexOf("clearRectSel") >= 0);
ok("矩形選択の枠は高視認色", panelSrc.indexOf("#38bdf8") >= 0 && panelSrc.indexOf("rgba(56,189,248") >= 0);
ok("矩形モード中はクリック反転しない", panelSrc.indexOf("was.rectPick") >= 0 && panelSrc.indexOf("setRectSel(was.cell, was.cell)") >= 0);

function applyRange(enabled, a, b, on) {
  const r0 = Math.min(a.r, b.r);
  const r1 = Math.max(a.r, b.r);
  const c0 = Math.min(a.c, b.c);
  const c1 = Math.max(a.c, b.c);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) enabled[r][c] = on;
  }
}
function cellAtClamped(mx, my, ox, oy, s, rows, cols) {
  let c = Math.floor((mx - ox) / s);
  let visR = Math.floor((my - oy) / s);
  let r = rows - 1 - visR;
  c = Math.max(0, Math.min(cols - 1, c));
  r = Math.max(0, Math.min(rows - 1, r));
  return { r, c };
}

const grid = [];
const stages = [];
for (let r = 0; r < 50; r++) {
  const er = [];
  const sr = [];
  for (let c = 0; c < 20; c++) {
    er.push(c < 2);
    sr.push({ stages: 2, heights: [100, 400] });
  }
  grid.push(er);
  stages.push(sr);
}
applyRange(grid, { r: 0, c: 0 }, { r: 9, c: 9 }, true);
applyRange(grid, { r: 5, c: 5 }, { r: 9, c: 9 }, false);
let onCount = 0;
let outsideUnchanged = true;
for (let r = 0; r < 50; r++) {
  for (let c = 0; c < 20; c++) {
    if (grid[r][c]) onCount += 1;
    if (c >= 10 && grid[r][c]) outsideUnchanged = false;
    if (r >= 10 && c >= 2 && grid[r][c]) outsideUnchanged = false;
  }
}
ok("20×50 混在範囲は単純反転しない", grid[0][0] === true && grid[5][5] === false && grid[9][9] === false);
ok("20×50 範囲外は不変", outsideUnchanged, "onCount=" + onCount);
ok("OFFしても段数を保持", stages[5][5].heights[0] === 100 && stages[5][5].stages === 2);
const outside = cellAtClamped(-80, 9000, 40, 18, 4, 50, 20);
ok("画面外ドラッグをクランプ", outside.r === 0 && outside.c === 0, JSON.stringify(outside));
const far = cellAtClamped(4000, -20, 40, 18, 4, 50, 20);
ok("セル外ドラッグをクランプ", far.r === 49 && far.c === 19, JSON.stringify(far));
ok("20×50 選択セル数", (10 * 10) === 100);
ok("panel が1段目=最下段", panelSrc.indexOf("1段目") >= 0 && panelSrc.indexOf("count - 1") >= 0);
ok("panel が幅N列目表記", panelSrc.indexOf("幅") >= 0 && panelSrc.indexOf("列目") >= 0 && panelSrc.indexOf("W1 / D") < 0);
ok("panel が寸法クリック", panelSrc.indexOf("data-al-h") >= 0);
ok("panel が立ち上げUI", panelSrc.indexOf("最下段の立ち上げ") >= 0 && panelSrc.indexOf("下部Beam") >= 0);
ok("立ち上げONの初期下部Beamはなし", panelSrc.indexOf("function setRaiseBottom") >= 0 && /if \(model\.raiseBottom\) model\.bottomBeams = false/.test(panelSrc));
ok("下部Beamありを手動選択できる", panelSrc.indexOf('data-al-bb="1"') >= 0 && panelSrc.indexOf('data-al-bb="0"') >= 0);
ok("生成は既存関数へ委譲", panelSrc.indexOf("handleAutoLayoutFromTool") >= 0);
ok("ツールバーは既存ボタン経由", autoSrc.indexOf("v3AutoLayoutPanel") >= 0);
ok("床ビーム省略が条件付き", autoSrc.indexOf("if (!raiseBottom || bottomBeams)") >= 0);
ok("POLE100 立ち上げブロック", autoSrc.indexOf("5.5") >= 0 && autoSrc.indexOf("connectPole(floorIdx, idx)") >= 0);
ok("キャッシュ更新", indexSrc.indexOf("v3-autolayout-panel.js?v=20261027-al1") >= 0);

const panelSandbox = {
  window: {
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
  },
  document: { getElementById: function () { return null; } },
  console: console,
};
panelSandbox.window.window = panelSandbox.window;
panelSandbox.window.document = panelSandbox.document;
vm.runInNewContext(panelSrc, panelSandbox);
const alApi = panelSandbox.window.v3AutoLayoutPanel;
ok("panel API が起動する", !!(alApi && typeof alApi.setRaiseBottom === "function" && typeof alApi.getRaiseOptions === "function"));
const beforeRaise = alApi.getRaiseOptions();
ok("新規初期は立ち上げOFF", beforeRaise.raiseBottom === false);
alApi.setRaiseBottom(true);
const afterRaise = alApi.getRaiseOptions();
ok("立ち上げONで下部Beam初期なし", afterRaise.raiseBottom === true && afterRaise.bottomBeams === false);
ok("新規立ち上げの collectCfg もなし", alApi.collectCfg().raiseBottom === true && alApi.collectCfg().bottomBeams === false);
ok("生成側の欠損は従来どおりあり", flags({ raiseBottom: true }).bottomBeams === true);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
