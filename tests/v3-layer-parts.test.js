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

const layerSrc = fs.readFileSync(path.join(root, "js/ui/v3-layer-panel.js"), "utf8");
const workSrc = fs.readFileSync(path.join(root, "js/state/work-layers.js"), "utf8");
const storeSrc = fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8");
const railSrc = fs.readFileSync(path.join(root, "js/ui/v3-east-rail.js"), "utf8");
const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");

ok("部材グループ名", layerSrc.indexOf('title: "部材"') >= 0 && layerSrc.indexOf('title: "BEAM / POLE"') < 0);
ok("子に Beam/Pole/JointBall/Leg", layerSrc.indexOf('id: "beam"') >= 0 && layerSrc.indexOf('id: "pole"') >= 0 && layerSrc.indexOf('id: "joint"') >= 0 && layerSrc.indexOf('id: "leg"') >= 0 && layerSrc.indexOf('label: "Leg"') >= 0);
ok("親frameは子設定を上書きしない", layerSrc.indexOf("next.frame = !!on") >= 0 && layerSrc.indexOf("group.id === \"frame\"") >= 0);
ok("目クリックは最新状態を読む", layerSrc.indexOf("groupState(group, layers())") >= 0 && layerSrc.indexOf("setVisible(item.id, !cur[item.id])") >= 0);
ok("件数にLeg", layerSrc.indexOf('id === "leg"') >= 0 && layerSrc.indexOf("window.legs") >= 0);
ok("resize再入しない", railSrc.indexOf('dispatchEvent(new Event("resize"))') < 0);
ok("表示更新は instance sync", workSrc.indexOf("flushInstanceVisibility") >= 0 && workSrc.indexOf("pool.sync(true)") >= 0);
ok("表示更新は resize を出さない", workSrc.indexOf("dispatchEvent") < 0);
const syncIdx = poolSrc.indexOf("function sync(force) {");
const syncLegsDecl = poolSrc.indexOf("function syncLegs() {");
const syncLegsCall = poolSrc.indexOf("syncLegs();", syncIdx);
const poolLoop = poolSrc.indexOf("Object.keys(_pools)", syncIdx);
ok("sync() がある", syncIdx >= 0);
ok("syncLegs() がある", syncLegsDecl >= 0);
ok("sync() は syncLegs() を呼ぶ", syncIdx >= 0 && syncLegsCall > syncIdx);
ok("InstancedMesh は脚visibleを先に反映", syncLegsCall > syncIdx && poolLoop > syncLegsCall);
ok("syncLegs は visible を base/cone に写す",
  /function syncLegs\(\) \{[\s\S]*base\.visible = vis[\s\S]*cone\.visible = vis/.test(poolSrc));

const storeBox = {
  console: console,
  window: { localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } },
};
storeBox.window.window = storeBox.window;
vm.runInNewContext(storeSrc, storeBox);
const store = storeBox.window.v3LayoutStore;
const def = store.defaultState();
ok("default に frame と leg", def.layers.frame === true && def.layers.leg === true);

const old = store.sanitize({
  v: 1,
  toolbars: def.toolbars,
  popups: {},
  groups: def.groups,
  radial: def.radial,
  viewport: def.viewport,
  layers: { beam: false, pole: true, joint: true, shelf: true, wall: true },
  layerPanel: def.layerPanel,
  headerIcons: def.headerIcons,
  eastRail: def.eastRail,
});
ok("旧データは LEG 表示・frame 表示", old.layers.leg === true && old.layers.frame === true && old.layers.beam === false);

function mesh() { return { visible: true }; }
function makeWorld() {
  const joints = [
    { x: 0, y: 0, z: 0, rackId: "r1" },
    { x: 100, y: 0, z: 0, rackId: "r1" },
  ];
  const beams = [{ a: 0, b: 1, mesh: mesh() }];
  const poles = [{ a: 0, b: 1, mesh: mesh() }];
  const jointMeshes = [mesh(), mesh()];
  const legs = [{ jointIndex: 0, mesh: mesh() }];
  const shelves = [];
  const panels = [];
  let syncCount = 0;
  let resizeCount = 0;
  const sandbox = {
    console: console,
    window: {
      joints: joints,
      beams: beams,
      poles: poles,
      jointMeshes: jointMeshes,
      legs: legs,
      shelves: shelves,
      panels: panels,
      v3InstancePool: {
        note: function () {},
        sync: function () { syncCount += 1; },
      },
      addEventListener: function () {},
      dispatchEvent: function () { resizeCount += 1; },
    },
    crypto: { randomUUID: function () { return "test"; } },
  };
  sandbox.window.window = sandbox.window;
  sandbox.document = { addEventListener: function () {} };
  vm.runInNewContext(workSrc, sandbox);
  return {
    wl: sandbox.window.v3WorkLayers,
    beams: beams,
    poles: poles,
    jointMeshes: jointMeshes,
    legs: legs,
    syncCount: function () { return syncCount; },
    resizeCount: function () { return resizeCount; },
    vis: function () {
      return {
        beam: beams[0] && beams[0].mesh.visible,
        pole: poles[0] && poles[0].mesh.visible,
        joint: jointMeshes[0] && jointMeshes[0].visible,
        leg: legs[0] ? legs[0].mesh.visible : null,
      };
    },
  };
}

const world = makeWorld();
ok("effectivePartVis が4種を返す", !!(world.wl.effectivePartVis && world.wl.effectivePartVis({}).leg === true));

world.wl.applyCombinedVisibility({ frame: true, beam: true, pole: true, joint: true, leg: true });
ok("初期は4種表示", world.vis().beam && world.vis().pole && world.vis().joint && world.vis().leg);

world.wl.applyCombinedVisibility({ frame: false, beam: true, pole: true, joint: true, leg: true });
const hid = world.vis();
ok("親非表示で4種すべて非表示", !hid.beam && !hid.pole && !hid.joint && !hid.leg);
ok("親非表示でも子フラグは残る", world.wl.effectivePartVis({ frame: false, beam: true, pole: false, joint: true, leg: true }).beam === false);

world.wl.applyCombinedVisibility({ frame: true, beam: true, pole: true, joint: true, leg: true });
const shown = world.vis();
ok("親再表示で4種復帰", shown.beam && shown.pole && shown.joint && shown.leg);

world.wl.applyCombinedVisibility({ frame: true, beam: false, pole: true, joint: true, leg: true });
ok("子Beamだけ非表示", world.vis().beam === false && world.vis().pole === true && world.vis().leg === true);

world.wl.applyCombinedVisibility({ frame: false, beam: false, pole: true, joint: true, leg: true });
ok("親OFF中も子設定を保持して非表示", world.vis().beam === false && world.vis().pole === false && world.vis().leg === false);
world.wl.applyCombinedVisibility({ frame: true, beam: false, pole: true, joint: true, leg: true });
ok("親再表示で子の個別状態を復元", world.vis().beam === false && world.vis().pole === true && world.vis().leg === true);

let togglesOk = true;
for (let i = 0; i < 12; i++) {
  world.wl.applyCombinedVisibility({ frame: i % 2 === 0, beam: true, pole: true, joint: true, leg: true });
  const v = world.vis();
  const expect = i % 2 === 0;
  if (v.beam !== expect || v.pole !== expect || v.joint !== expect || v.leg !== expect) togglesOk = false;
}
ok("連続12回切替でも表示状態が一致", togglesOk);

const empty = makeWorld();
empty.legs.length = 0;
empty.wl.applyCombinedVisibility({ frame: false, beam: true, pole: true, joint: true, leg: true });
ok("Leg 0件でも親非表示が落ちない", empty.vis().beam === false && empty.vis().joint === false);

const syncBefore = world.syncCount();
const resizeBefore = world.resizeCount();
world.wl.applyCombinedVisibility({ frame: true, beam: true, pole: true, joint: true, leg: true });
ok("パネル幅なしで instance sync する", world.syncCount() > syncBefore);
ok("表示切替は resize イベントを出さない", world.resizeCount() === resizeBefore);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
