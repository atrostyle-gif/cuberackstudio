"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
const state = require(path.join(root, "js/structural/analysis-ui-state.js"));
let passed = 0;
function ok(name, condition) { assert.ok(condition, name); passed += 1; console.log("PASS  " + name); }

const empty = state.empty();
ok("初期状態は荷重未設定", Object.keys(empty.shelfInputs).length === 0);
ok("初期状態は床支持を推定しない", empty.floorSupportJointIds.length === 0);
ok("初期状態はK値UNKNOWN", empty.effectiveLengthFactor === null);

state.setShelfInput(empty, "s-1", { loadKg: 10, supports: [{ beamId: "b-1", share: 1, kind: "uniform" }] });
const request = state.buildRequest(empty, ["s-1"]);
ok("kgをNへ変換", Math.abs(request.shelfLoads[0].loadN - 98.0665) < 1e-9);
ok("荷重の明示設定を保持", request.shelfLoads.length === 1 && request.issues.length === 0);
state.setShelfInput(empty, "s-0", { loadKg: 0, supports: [{ beamId: "b-1", share: 1, kind: "uniform" }] });
ok("0kgと未設定を区別", Object.prototype.hasOwnProperty.call(empty.shelfInputs, "s-0") && !Object.prototype.hasOwnProperty.call(empty.shelfInputs, "s-missing"));
state.setShelfInput(empty, "s-2", { loadKg: 2, supports: [{ beamId: "b-1", share: 0.4, kind: "uniform" }] });
ok("分配率不足をINPUT_ERROR候補として検出", state.buildRequest(empty, ["s-2"]).issues[0].indexOf("合計は1") >= 0);
state.setShelfInput(empty, "s-2", null);
ok("荷重削除は設定自体を消去", !Object.prototype.hasOwnProperty.call(empty.shelfInputs, "s-2"));

const restored = state.normalize({
  enabled: true, overlayVisible: true, floorSupportJointIds: ["j-ok", "j-stale"],
  shelfInputs: { "s-ok": { loadKg: 3, supports: [{ beamId: "b-ok", share: 1, kind: "uniform" }] }, "s-stale": { loadKg: 4, supports: [] } },
  effectiveLengthFactor: 1.2, referenceLimits: { maxBendingStressMPa: 147, maxDeflectionRatio: 300 },
}, { jointIds: ["j-ok"], shelfIds: ["s-ok"], beamIds: ["b-ok"] });
ok("読込時に消えた床支持を除去", restored.floorSupportJointIds.join(",") === "j-ok");
ok("読込時に消えた棚の荷重を除去", Object.keys(restored.shelfInputs).join(",") === "s-ok");
ok("K値と参考基準は明示値のみ復元", restored.effectiveLengthFactor === 1.2 && restored.referenceLimits.maxDeflectionRatio === 300);

const standardJoints = [];
for (let level = 0; level <= 5; level += 1) {
  for (let depth = 0; depth <= 1; depth += 1) {
    for (let column = 0; column <= 5; column += 1) {
      standardJoints.push({ id: "j-" + level + "-" + depth + "-" + column, x: column * 600, y: level * 600, z: depth * 400 });
    }
  }
}
const standardLegs = standardJoints.map(function (joint, index) {
  return joint.y === 0 ? { jointIndex: index, jointId: joint.id } : null;
}).filter(Boolean);
const floorCandidates = state.floorSupportCandidates(standardJoints, standardLegs);
ok("5列×5段・奥行1列は72 JOINT", floorCandidates.allJoints.length === 72);
ok("5列×5段・奥行1列の最下端候補は12 JOINT", floorCandidates.candidates.length === 12);
ok("LEG接続は候補判定ではなく参考情報", floorCandidates.candidates.every(function (joint) { return joint.hasLeg; }) && floorCandidates.allJoints.filter(function (joint) { return joint.yMm > 0; }).every(function (joint) { return !joint.hasLeg; }));
const tolerant = state.floorSupportCandidates([{ id: "floor", x: 0, y: 0, z: 0 }, { id: "rounded", x: 1, y: 0.05, z: 0 }, { id: "top", x: 0, y: 600, z: 0 }], []);
ok("最下端判定は0.1mmの座標誤差を吸収", tolerant.candidates.map(function (joint) { return joint.id; }).join(",") === "floor,rounded");

const vis = fs.readFileSync(path.join(root, "js/features/structural-visualization.js"), "utf8");
const panel = fs.readFileSync(path.join(root, "js/ui/v3-structural-panel.js"), "utf8");
const file = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
const toolbar = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const connectors = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
ok("連続変更の古い結果を世代番号で破棄", vis.indexOf("runVersion") >= 0 && vis.indexOf("mine !== runVersion") >= 0);
ok("デバウンスとidle実行を使用", vis.indexOf("150") >= 0 && vis.indexOf("requestIdleCallback") >= 0);
ok("元の材質色を変更せずオーバーレイを作成", vis.indexOf("CubeRackStructuralReferenceOverlay") >= 0 && vis.indexOf("material.color") < 0);
ok("パネルに完成ラック非保証を明記", panel.indexOf("完成ラックの許容積載荷重") >= 0);
ok("床支持候補を最下端CAD y座標から抽出", panel.indexOf("floorSupportCandidates") >= 0 && panel.indexOf("候補外JOINTを手動指定") >= 0);
ok("構造解析パネルはスクロール可能なワイド表示", panel.indexOf("wide: true") >= 0);
ok("保存JSONに解析設定のみを追加", file.indexOf("structuralAnalysis") >= 0 && file.indexOf("v3StructuralAnalysis.snapshot") >= 0);
ok("CADツールバーに構造解析入口", toolbar.indexOf('cmd: "structural"') >= 0 && toolbar.indexOf("v3StructuralPanel") >= 0);
ok("BEAM/POLE追加削除で再計算を予約", connectors.indexOf('schedule?.("beam add")') >= 0 && connectors.indexOf('schedule?.("pole delete")') >= 0);
ok("ラック移動と回転で再計算を予約", main.indexOf('schedule?.("move cluster")') >= 0 && main.indexOf('schedule?.("rotate cluster")') >= 0);

function selectionRuntime(withMultiSelect) {
  let selected = [];
  const listeners = {};
  const deferred = [];
  const events = [];
  const analysisState = {
    overlayVisible: false, floorSupportJointIds: [], shelfInputs: {}, effectiveLengthFactor: null,
    referenceLimits: { maxBendingStressMPa: null, maxDeflectionRatio: null },
  };
  const box = {
    console, Number, Math, Map, Set, Object, Array, Date,
    beams: [{ id: "beam-1", a: 0, b: 1 }], poles: [{ id: "pole-1", a: 0, b: 1 }], joints: [], shelves: [],
    CubeRackStructuralUiState: {
      empty: function () { return analysisState; }, normalize: function (value) { return value || analysisState; },
      buildRequest: function () { return { issues: [], shelfLoads: [] }; }, snapshot: function (value) { return value; },
    },
    getCubeRackStructuralAnalysis: function () {
      return {
        status: "PASS", completeRackStatus: "UNKNOWN", errors: [], unknownReasons: ["JOINT_STRENGTH_UNVERIFIED"],
        beamResults: { "beam-1": { maxBendingStressMPa: 1.25, maxDeflectionMm: 0.01 } },
        poleResults: { "pole-1": { axialForceN: 10, bucklingStatus: "UNKNOWN" } },
        jointResults: {}, knownMemberChecks: [{ id: "beam:beam-1", status: "PASS", utilization: 0.1 }],
      };
    },
    performance: { now: function () { return 10; } },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    addEventListener: function (type, handler) { (listeners[type] || (listeners[type] = [])).push(handler); },
    dispatchEvent: function (event) { events.push(event); },
    setTimeout: function (handler) { deferred.push(handler); return deferred.length; },
    clearTimeout: function () {},
  };
  if (withMultiSelect) box.v3MultiSelect = { get: function () { return selected.slice(); } };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(vis, box);
  return {
    app: box.v3StructuralAnalysis, events: events,
    select: function (items) { selected = items.slice(); },
    trigger: function (type) { (listeners[type] || []).forEach(function (handler) { handler({}); }); },
    flush: function () { while (deferred.length) deferred.shift()(); },
  };
}

const selection = selectionRuntime(true);
selection.app.calculate("test");
selection.select([{ kind: "beam", index: 0 }]);
ok("v3MultiSelectのBEAM単独選択を詳細へ使用", selection.app.detailsForSelection({ type: "pole", index: 0 }).id === "beam-1");
selection.select([{ kind: "pole", index: 0 }]);
ok("v3MultiSelectのPOLE単独選択を詳細へ使用", selection.app.detailsForSelection(null).id === "pole-1");
selection.select([{ kind: "joint", index: 0 }]);
ok("JOINT選択時は詳細をクリア", selection.app.detailsForSelection({ type: "beam", index: 0 }) === null);
selection.select([{ kind: "beam", index: 0 }, { kind: "pole", index: 0 }]);
ok("複数選択時は詳細をクリア", selection.app.detailsForSelection() === null);
selection.select([]);
ok("選択解除時は詳細をクリア", selection.app.detailsForSelection() === null);
selection.select([{ kind: "beam", index: 0 }]);
ok("完成ラックUNKNOWNでも計算可能BEAMの詳細を表示", selection.app.detailsForSelection().result.maxBendingStressMPa === 1.25);
selection.app.calculate("recalculate");
ok("再計算後も現在の通常選択で詳細を解決", selection.app.detailsForSelection().id === "beam-1");
selection.events.length = 0;
selection.trigger("pointerdown");
selection.flush();
ok("選択後の遅延同期で詳細更新イベントを通知", selection.events.filter(function (event) { return event.type === "cuberack:structural-selection"; }).length === 1 && selection.events[0].detail.id === "beam-1");
selection.trigger("click");
selection.flush();
ok("選択が変わらない操作では詳細を再通知しない", selection.events.filter(function (event) { return event.type === "cuberack:structural-selection"; }).length === 1);
selection.select([{ kind: "joint", index: 0 }]);
selection.trigger("keydown");
selection.flush();
ok("キーボード操作後の非部材選択は詳細クリアを通知", selection.events.filter(function (event) { return event.type === "cuberack:structural-selection"; }).slice(-1)[0].detail === null);
const legacySelection = selectionRuntime(false);
legacySelection.app.calculate("legacy");
ok("v3MultiSelect非搭載の旧環境だけselectedConnector引数を使用", legacySelection.app.detailsForSelection({ type: "beam", index: 0 }).id === "beam-1");
console.log("\npassed=" + passed + " failed=0");
