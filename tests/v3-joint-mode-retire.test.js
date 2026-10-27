"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const toolbarSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const storeSrc = fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
const fileSrc = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
const boardSrc = fs.readFileSync(path.join(root, "js/parts/boards.js"), "utf8");
const pickSrc = fs.readFileSync(path.join(root, "js/ui/v3-place-pick.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

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

ok("ツールバーGROUPSにJB専用コマンドなし", toolbarSrc.indexOf('cmd: "joint"') < 0 && toolbarSrc.indexOf("Jointを追加") < 0);
ok("Beam/Pole追加は残る", toolbarSrc.indexOf('cmd: "beam"') >= 0 && toolbarSrc.indexOf('cmd: "pole"') >= 0);
ok("旧jointコマンドは選択へ委譲", /case "joint":\s*clearExclusive\(\);\s*setToolMode\("select"\)/.test(toolbarSrc));
ok("toolMode joint は select に正規化", toolbarSrc.indexOf('if (mode === "joint") return "select"') >= 0);
ok("選択モードでもJBクリック選択", mainSrc.indexOf("選択モードでも既存JBのクリック選択は維持") >= 0 && mainSrc.indexOf("setSelectedJoint(nearIdx)") >= 0);
ok("Beam/Pole追加時のJB生成は維持", mainSrc.indexOf("existingIndex !== -1 ? existingIndex : createJoint(finalTargetPos)") >= 0);
ok("createJoint / deleteJoint は残る", jointsSrc.indexOf("function createJoint") >= 0 && jointsSrc.indexOf("function deleteJoint") >= 0);
ok("保存形式に joints を含む", fileSrc.indexOf("joints") >= 0 && jointsSrc.indexOf("window.createJoint") >= 0);
ok("4点選択は維持", boardSrc.indexOf("addJointToBoardSelection") >= 0 && pickSrc.indexOf("pick-joint") >= 0);
ok("赤ハイライト経路は維持", jointsSrc.indexOf("0xef4444") >= 0 || mainSrc.indexOf("0xef4444") >= 0);
ok("キャッシュ更新", indexSrc.indexOf("v3-cad-toolbar.js?v=20261027-pub3") >= 0 && indexSrc.indexOf("main.js?v=20261027-h1") >= 0);

const mem = {};
const ctx = {
  console,
  window: {
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem(k, v) { mem[k] = String(v); },
      removeItem(k) { delete mem[k]; },
    },
  },
};
vm.runInNewContext(storeSrc, ctx);
const store = ctx.window.v3LayoutStore;
ok("ラジアル許可に joint 専用コマンドなし", !store.RADIAL_CMDS.joint);
ok("旧ラジアル joint は選択へ移行", store.sanitize({
  v: 1,
  toolbars: store.defaultState().toolbars,
  groups: store.defaultState().groups,
  radial: Object.assign({}, store.defaultRadial(), { w: "joint" }),
  viewport: store.defaultState().viewport,
  layers: store.defaultState().layers,
  layerPanel: store.defaultState().layerPanel,
  eastRail: store.defaultState().eastRail,
  headerIcons: store.defaultState().headerIcons,
  popups: {},
}).radial.w === "select");
ok("他スロットのラジアルは維持", store.sanitize({
  v: 1,
  toolbars: store.defaultState().toolbars,
  groups: store.defaultState().groups,
  radial: Object.assign({}, store.defaultRadial(), { n: "beam", e: "pole" }),
  viewport: store.defaultState().viewport,
  layers: store.defaultState().layers,
  layerPanel: store.defaultState().layerPanel,
  eastRail: store.defaultState().eastRail,
  headerIcons: store.defaultState().headerIcons,
  popups: {},
}).radial.n === "beam" && store.sanitize({
  v: 1,
  toolbars: store.defaultState().toolbars,
  groups: store.defaultState().groups,
  radial: Object.assign({}, store.defaultRadial(), { n: "beam", e: "pole" }),
  viewport: store.defaultState().viewport,
  layers: store.defaultState().layers,
  layerPanel: store.defaultState().layerPanel,
  eastRail: store.defaultState().eastRail,
  headerIcons: store.defaultState().headerIcons,
  popups: {},
}).radial.e === "pole");

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
