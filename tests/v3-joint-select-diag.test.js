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
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
const diagSrc = fs.readFileSync(path.join(root, "js/ui/v3-diag-joint-select.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");

ok("inspectHandle がある", poolSrc.indexOf("function inspectHandle") >= 0);
ok("lastSync を公開する", poolSrc.indexOf("pool.lastSync = function") >= 0);
ok("isDirty を公開する", poolSrc.indexOf("pool.isDirty = function") >= 0);
ok("sync は最終実行を記録する", poolSrc.indexOf("_lastSync = { at:") >= 0 && poolSrc.indexOf('reason: "ran"') >= 0);
ok("inspect は instanceColor を読む", /out\.instanceColor = colorHex\(_color\)/.test(poolSrc));
ok("inspect は選択判定を含む", poolSrc.indexOf("selectedByHandle: isSelectedJointHandle(handle)") >= 0);
ok("createJoint が診断に通知する", /path: "new"/.test(jointsSrc) && /path: "existing"/.test(jointsSrc));
ok("setSelectedJoint が診断に通知する", /notifyJointDiag\("setSelectedJoint"/.test(jointsSrc));
ok("診断スクリプトを index が読む", indexSrc.indexOf("js/ui/v3-diag-joint-select.js?v=20261026-diag1") >= 0);
ok("pool / joints キャッシュ", indexSrc.indexOf("v3-instance-pool.js?v=20261027-h1") >= 0 && indexSrc.indexOf("joints.js?v=20261027-msdel1") >= 0);
ok("dump / capture / compare / help がある", ["dump:", "capture:", "compare:", "help:"].every(function (k) { return diagSrc.indexOf(k) >= 0; }));
ok("3状態のキーがある", diagSrc.indexOf("after-new") >= 0 && diagSrc.indexOf("after-existing") >= 0 && diagSrc.indexOf("capture('first')") >= 0);
ok("dump は setSelectedJoint を呼ばない", !/function snapshot[\s\S]*setSelectedJoint\(/.test(diagSrc) && diagSrc.indexOf("dump: function () { return logSnap(snapshot(\"live\")); }") >= 0);
ok("dump は pool.sync を呼ばない", !/function snapshot[\s\S]*pool\.sync\(/.test(diagSrc));
ok("CAD色ロジックは診断で変えない", poolSrc.indexOf("function isSelectedJointHandle") >= 0 && mainSrc.indexOf("function restoreSelectedJointVisual") >= 0);

function loadDiag(windowObj) {
  const sandbox = {
    window: windowObj,
    console: {
      log: function () {},
      table: function () {},
    },
    Date: Date,
    String: String,
    Function: Function,
  };
  windowObj.location = windowObj.location || { search: "" };
  vm.runInNewContext(diagSrc, sandbox);
  return windowObj.v3DiagJointSelect;
}

const mutations = [];
const fakeHandle = {
  userData: { v3Instanced: true, v3Slot: 1, v3PoolKey: "joint:IRON" },
  material: {
    color: { getHex: function () { return 0x111111; } },
    emissive: { getHex: function () { return 0xef4444; } },
    emissiveIntensity: 1.2,
  },
  position: { x: 0, y: 0, z: 0 },
  visible: true,
  parent: { type: "Group", userData: {} },
};
const fakeWindow = {
  selectedJointIndex: 0,
  joints: [{ id: "jb-origin", x: 0, y: 0, z: 0 }],
  jointMeshes: [fakeHandle],
  highlightedObject: null,
  previewTargetPos: null,
  applyMaterialColorToAllConnectors: function selJointMeshProbe() { mutations.push("apply"); },
  setSelectedJoint: function (idx) { mutations.push("setSelectedJoint:" + idx); },
  createJoint: function () { mutations.push("createJoint"); },
  v3InstancePool: {
    enabled: true,
    inspectHandle: function (handle) {
      if (!handle) return { ok: false, reason: "no-handle" };
      return {
        ok: true,
        slot: 1,
        instanceColor: "0xef4444",
        handleColor: "0x111111",
        handleEmissive: "0xef4444",
        handleEmissiveIntensity: 1.2,
        selectedByHandle: true,
        unique: false,
        instanced: true,
        inPoolHandles: true,
        poolKey: "joint:IRON",
        parentType: "Group",
        pos: { x: 0, y: 0, z: 0 },
        instancePos: { x: 0, y: 0, z: 0 },
      };
    },
    lastSync: function () { return { at: 1, force: true, skipped: false, reason: "ran", count: 3 }; },
    isDirty: function () { return false; },
    sync: function () { mutations.push("sync"); },
    note: function () { mutations.push("note"); },
  },
};

const diag = loadDiag(fakeWindow);
ok("window.v3DiagJointSelect が載る", !!(diag && typeof diag.dump === "function"));

const live = diag.dump();
ok("dump が選択IDを返す", live && live.selectedId === "jb-origin" && live.selectedIndex === 0);
ok("dump が instanceColor を返す", live.inspect && live.inspect.instanceColor === "0xef4444");
ok("dump は CAD を変えない", mutations.length === 0, JSON.stringify(mutations));
ok("dump 後も selectedJointIndex は同じ", fakeWindow.selectedJointIndex === 0);

const first = diag.capture("first");
fakeWindow.selectedJointIndex = 1;
fakeWindow.joints.push({ id: "jb-new", x: 200, y: 0, z: 0 });
fakeWindow.jointMeshes.push(fakeHandle);
const afterNew = diag.capture("after-new");
ok("capture は名前付きで残る", first.label === "first" && afterNew.label === "after-new");
ok("capture 後も setSelectedJoint は呼ばない", mutations.length === 0);

const cmp = diag.compare();
ok("compare が2状態を並べる", cmp.keys.indexOf("first") >= 0 && cmp.keys.indexOf("after-new") >= 0);
ok("compare の行に色がある", cmp.rows[0].instanceColor === "0xef4444" && cmp.rows[1].selectedIndex === 1);

diag.notify("createJoint", { path: "new", index: 1, id: "jb-new" });
const afterNotify = diag.dump();
ok("notify はイベントを残すだけ", afterNotify.lastEvents.some(function (e) { return e.kind === "createJoint"; }));
ok("notify(auto off) でも CAD を変えない", mutations.length === 0);

if (failed.length) {
  console.error("\nFAILED " + failed.length + ":\n- " + failed.join("\n- "));
  process.exit(1);
}
console.log("\nOK  " + passed + " passed");
