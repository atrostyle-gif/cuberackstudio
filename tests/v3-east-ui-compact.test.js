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
const layerSrc = fs.readFileSync(path.join(root, "js/ui/v3-layer-panel.js"), "utf8");
const workSrc = fs.readFileSync(path.join(root, "js/state/work-layers.js"), "utf8");
const alSrc = fs.readFileSync(path.join(root, "js/ui/v3-autolayout-panel.js"), "utf8");
const railSrc = fs.readFileSync(path.join(root, "js/ui/v3-east-rail.js"), "utf8");
const lenSrc = fs.readFileSync(path.join(root, "js/ui/v3-length-panel.js"), "utf8");
const drawingJs = fs.readFileSync(path.join(root, "js/app/drawing.js"), "utf8");

ok("寸法行をラックIDで列挙しない", layerSrc.indexOf("v3-work-rack") < 0 && layerSrc.indexOf("rid.slice(-6)") < 0);
ok("作業レイヤー行だけを展開する", layerSrc.indexOf("const expandable = row.hasKids;") >= 0);
ok("所属ラックの移動バーを維持", layerSrc.indexOf("function fillMoveBar") >= 0 && layerSrc.indexOf("moveRacksToLayer") >= 0);
ok("寸法切替は setRackVisible を使う", layerSrc.indexOf("toggleLayerDims") >= 0 && layerSrc.indexOf("setRackVisible") >= 0);
ok("rackAssignments を消さない", layerSrc.indexOf("rackAssignments") < 0);
ok("削除確認を維持", layerSrc.indexOf("confirm(msg)") >= 0 && layerSrc.indexOf("レイヤーを削除") >= 0);
ok("その他メニューへ低頻度操作を集約", layerSrc.indexOf("v3-work-more") >= 0 && layerSrc.indexOf("下にレイヤー追加") >= 0);

ok("幅セルは1語", alSrc.indexOf("<span>幅セル</span>") >= 0 && alSrc.indexOf("<span>幅 セル</span>") < 0);
ok("奥行セルは1語", alSrc.indexOf("<span>奥行セル</span>") >= 0);
ok("セル配置ボタンはツールバー2段", alSrc.indexOf('class="v3-al-toolbar"') >= 0 && alSrc.indexOf("<span>セル配置</span></div>") >= 0);
ok("個別セルと最下段は折りたたみ", alSrc.indexOf("<summary>個別セル</summary>") >= 0 && alSrc.indexOf("<summary>最下段</summary>") >= 0);

ok("チップは east-rail の左へ避ける", lenSrc.indexOf("function eastUiLeft") >= 0 && lenSrc.indexOf("v3-east-rail") >= 0 && lenSrc.indexOf("v3-east-pane") >= 0);
ok("レール開閉でチップを同期", railSrc.indexOf("v3LengthPanel.syncChip") >= 0);
ok("resize 再発行なし", railSrc.indexOf('dispatchEvent(new Event("resize"))') < 0 && layerSrc.indexOf("dispatchEvent") < 0);
ok("CAD更新は resizeV3View 直接", railSrc.indexOf("resizeV3View") >= 0);

ok("280px / 36px を維持", indexSrc.indexOf("--v3-east-rail-w:280px") >= 0 && indexSrc.indexOf("--v3-east-tab-w:36px") >= 0);
ok("レイヤー名は省略表示", indexSrc.indexOf("text-overflow:ellipsis") >= 0 && indexSrc.indexOf("white-space:nowrap") >= 0);
ok("レイヤー文字は明るい色", indexSrc.indexOf("color:#e8eef8") >= 0);
ok("アイコンボタン 22px", indexSrc.indexOf("width:22px;height:22px;min-width:22px") >= 0);
ok("パネル横スクロール抑制", indexSrc.indexOf("overflow-x:hidden") >= 0);
ok("長さグリッドは pane container", indexSrc.indexOf("container-name:v3-len-pane") >= 0 && indexSrc.indexOf("@container v3-len-pane (max-width: 199px)") >= 0);
ok("図面出力スクリプトは維持", drawingJs.indexOf("FIXED_SLOTS") >= 0 || drawingJs.indexOf("drawingDocument") >= 0);

function makeEl(tag, id) {
  const children = [];
  const classSet = {};
  const attrs = {};
  const node = {
    tagName: String(tag || "div").toUpperCase(),
    id: id || "",
    hidden: false,
    disabled: false,
    textContent: "",
    title: "",
    type: "",
    value: "",
    style: { paddingLeft: "", setProperty: function () {}, getPropertyValue: function () { return ""; } },
    dataset: {},
    children: children,
    parentElement: null,
    offsetWidth: 128,
    offsetHeight: 28,
    classList: {
      add: function (c) { if (c) classSet[c] = true; },
      remove: function (c) { delete classSet[c]; },
      toggle: function (c, on) {
        if (on === false) delete classSet[c];
        else if (on === true) classSet[c] = true;
        else if (classSet[c]) delete classSet[c];
        else classSet[c] = true;
      },
      contains: function (c) { return !!classSet[c]; },
    },
    setAttribute: function (k, v) { attrs[k] = String(v); if (k === "id") node.id = String(v); },
    getAttribute: function (k) { return attrs[k] || (k === "id" ? node.id : ""); },
    appendChild: function (child) {
      if (!child) return child;
      children.push(child);
      child.parentElement = node;
      return child;
    },
    addEventListener: function () {},
    querySelector: function (sel) {
      const all = [];
      walk(node, all);
      return all.find(function (el) { return match(el, sel); }) || null;
    },
    querySelectorAll: function (sel) {
      const all = [];
      walk(node, all);
      return all.filter(function (el) { return match(el, sel); });
    },
    contains: function (other) { return other === node || children.indexOf(other) >= 0; },
    closest: function () { return null; },
    getBoundingClientRect: function () {
      return { left: 1640, right: 1920, top: 48, bottom: 848, width: 280, height: 800 };
    },
  };
  Object.defineProperty(node, "className", {
    get: function () { return Object.keys(classSet).join(" "); },
    set: function (v) {
      Object.keys(classSet).forEach(function (k) { delete classSet[k]; });
      String(v || "").split(/\s+/).forEach(function (c) { if (c) classSet[c] = true; });
    },
  });
  Object.defineProperty(node, "innerHTML", {
    get: function () { return node._html || ""; },
    set: function (v) {
      node._html = String(v);
      children.length = 0;
    },
  });
  Object.defineProperty(node, "nextElementSibling", {
    get: function () {
      if (!node.parentElement) return null;
      const sibs = node.parentElement.children;
      const i = sibs.indexOf(node);
      return i >= 0 ? sibs[i + 1] || null : null;
    },
  });
  return node;
}

function walk(node, out) {
  (node.children || []).forEach(function (child) {
    out.push(child);
    walk(child, out);
  });
}

function match(el, sel) {
  if (!sel) return false;
  const parts = sel.split(",").map(function (s) { return s.trim(); });
  return parts.some(function (part) {
    if (part.charAt(0) === ".") {
      const tokens = part.slice(1).split(".");
      return tokens.every(function (cls) {
        return (" " + el.className + " ").indexOf(" " + cls + " ") >= 0;
      });
    }
    if (part.charAt(0) === "#") return el.id === part.slice(1);
    return el.tagName === part.toUpperCase();
  });
}

const els = {
  "v3-work-tree": makeEl("div", "v3-work-tree"),
  "v3-layer-body": makeEl("div", "v3-layer-body"),
  "v3-layer-root": makeEl("div", "v3-layer-root"),
  "v3-east-pane-layers": makeEl("div", "v3-east-pane-layers"),
  "v3-east-rail": makeEl("aside", "v3-east-rail"),
  "v3-east-pane": makeEl("div", "v3-east-pane"),
};
els["v3-east-pane"].hidden = true;
els["v3-layer-root"].parentElement = els["v3-east-pane-layers"];
els["v3-work-tree"].parentElement = els["v3-layer-root"];
els["v3-layer-body"].parentElement = els["v3-layer-root"];

const joints = [];
const rackVisible = {};
const sandbox = {
  console: console,
  window: {
    joints: joints,
    beams: [],
    poles: [],
    legs: [],
    shelves: [],
    panels: [],
    jointMeshes: [],
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: function () {},
    dispatchEvent: function () {},
    v3CadOps: {
      layoutState: function () { return { layers: { frame: true, beam: true, pole: true, joint: true, leg: true, shelf: true, wall: true } }; },
      wrapFn: function () {},
    },
    v3Measure: {
      isRackDimVisible: function (id) { return rackVisible[id] !== false; },
      setRackVisible: function (id, on) { rackVisible[id] = !!on; },
    },
    v3WorkspaceUi: { persist: function () {}, getOpenPopupId: function () { return null; } },
    v3InstancePool: { note: function () {}, sync: function () {} },
  },
  document: {
    body: { classList: { toggle: function () {} } },
    getElementById: function (id) { return els[id] || null; },
    createElement: function (tag) { return makeEl(tag); },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function (sel) {
      const all = [];
      Object.keys(els).forEach(function (id) { walk(els[id], all); all.push(els[id]); });
      return all.filter(function (el) { return match(el, sel); });
    },
    activeElement: null,
  },
  crypto: {
    randomUUID: (function () {
      let n = 0;
      return function () {
        n += 1;
        return "aaaaaaaa-bbbb-cccc-ddddeeee" + String(100000 + n).slice(-6);
      };
    })(),
  },
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.document.body = sandbox.document.body;

vm.runInNewContext(workSrc, sandbox);
const wl = sandbox.window.v3WorkLayers;
ok("work-layers 起動", !!(wl && wl.assignNewJoint && wl.getState));

for (let i = 0; i < 24; i++) {
  const joint = { x: i * 100, y: 0, z: 0 };
  joints.push(joint);
  wl.assignNewJoint(joint);
}
const st = wl.getState();
const mainId = st.activeLayerId;
const assigned = Object.keys(st.rackAssignments);
ok("部材追加でラックIDは増える", assigned.length === 24, "n=" + assigned.length);
ok("所属はメインへ", assigned.every(function (id) { return st.rackAssignments[id] === mainId; }));
ok("ラック数 API は維持", wl.rackCount(mainId) === 24 && wl.rackIdsInLayer(mainId).length === 24);

const extra = wl.addLayer({ name: "作業A" });
ok("作業レイヤー追加", !!extra);
const moved = wl.moveRacksToLayer([assigned[0], assigned[1]], extra);
ok("選択ラック移動を維持", moved && moved.ok && moved.moved === 2, JSON.stringify(moved));
ok("移動後もラックIDは残る", Object.keys(wl.getState().rackAssignments).length === 24);

assigned.forEach(function (id, i) {
  if (i % 3 === 0) sandbox.window.v3Measure.setRackVisible(id, false);
});
const hidden = assigned.filter(function (id) { return rackVisible[id] === false; }).length;
ok("個別寸法の非表示フラグは残る", hidden >= 8, "hidden=" + hidden);

vm.runInNewContext(layerSrc, sandbox);
ok("layer-panel 起動", !!(sandbox.window.v3LayerPanel && sandbox.window.v3LayerPanel.render));
sandbox.window.v3LayerPanel.render();

const treeKids = [];
walk(els["v3-work-tree"], treeKids);
const workRows = treeKids.filter(function (el) { return (" " + el.className + " ").indexOf(" v3-work-row ") >= 0 || el.className === "v3-work-row"; });
const rackRows = treeKids.filter(function (el) { return (" " + el.className + " ").indexOf("v3-work-rack") >= 0; });
const names = workRows.map(function (el) {
  const n = (el.children || []).find(function (c) { return (" " + c.className + " ").indexOf(" v3-layer-name ") >= 0 || c.className === "v3-layer-name"; });
  return n ? n.textContent : "";
});
ok("作業ツリーはレイヤー数だけ", workRows.length === 2, "rows=" + workRows.length + " names=" + names.join("/"));
ok("個別ラック寸法行は出さない", rackRows.length === 0, "rackRows=" + rackRows.length);
ok("レイヤー項目数は部材数に比例しない", workRows.length < assigned.length);

const menus = treeKids.filter(function (el) { return (" " + el.className + " ").indexOf("v3-work-menu") >= 0; });
ok("寸法操作はメニューに残る", menus.length >= 1 && menus.some(function (menu) {
  return (menu.children || []).some(function (item) { return String(item.textContent).indexOf("寸法") >= 0; });
}));

const snap = wl.snapshotFields();
ok("スナップショットに rackAssignments が残る", Object.keys(snap.rackAssignments || {}).length === 24);
ok("寸法マップはレイヤー描画後も残る", assigned.filter(function (id) { return rackVisible[id] === false; }).length === hidden);

const partsKids = [];
walk(els["v3-layer-body"], partsKids);
const partNames = partsKids.filter(function (el) { return el.className === "v3-layer-name"; }).map(function (el) { return el.textContent; });
ok("部材レイヤーに Beam/Pole/JointBall/Leg", partNames.indexOf("Beam") >= 0 && partNames.indexOf("Leg") >= 0 && partNames.indexOf("部材") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
