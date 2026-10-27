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
const storeSrc = fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8");
const railSrc = fs.readFileSync(path.join(root, "js/ui/v3-east-rail.js"), "utf8");
const alSrc = fs.readFileSync(path.join(root, "js/ui/v3-autolayout-panel.js"), "utf8");
const layerSrc = fs.readFileSync(path.join(root, "js/ui/v3-layer-panel.js"), "utf8");
const cadSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const drawingJs = fs.readFileSync(path.join(root, "js/app/drawing.js"), "utf8");

ok("右側レール DOM がある", indexSrc.indexOf('id="v3-east-rail"') >= 0 && indexSrc.indexOf('id="v3-east-tabs"') >= 0);
ok("タブは自動レイアウト・レイヤー・パーツ追加・長さ変更", indexSrc.indexOf('data-east-tab="autolayout"') >= 0 && indexSrc.indexOf('data-east-tab="layers"') >= 0 && indexSrc.indexOf('data-east-tab="add"') >= 0 && indexSrc.indexOf('data-east-tab="length"') >= 0 && (indexSrc.match(/data-east-tab="/g) || []).length === 4);
ok("レールは east dock の右隣", indexSrc.indexOf('id="v3-dock-east"') < indexSrc.indexOf('id="v3-east-rail"'));
ok("収納幅 36px / 展開 280px", indexSrc.indexOf("--v3-east-tab-w:36px") >= 0 && indexSrc.indexOf("--v3-east-rail-w:280px") >= 0);
ok("狭い画面は overlay", indexSrc.indexOf("is-overlay") >= 0 && railSrc.indexOf("MIN_CAD") >= 0);
ok("パネル内スクロール", indexSrc.indexOf(".v3-east-pane-panel") >= 0 && indexSrc.indexOf("overflow:auto") >= 0);
ok("east-rail スクリプト", indexSrc.indexOf("js/ui/v3-east-rail.js") >= 0);

ok("layout-store が eastRail を保持", storeSrc.indexOf("eastRail: defaultEastRail()") >= 0 && storeSrc.indexOf("sanitizeEastRail") >= 0);
ok("AL は docked でレールへ委譲", alSrc.indexOf('window.v3EastRail.open("autolayout")') >= 0 && alSrc.indexOf("opts.docked") >= 0);
ok("AL は個別セルと最下段を折りたたみ", alSrc.indexOf("<summary>個別セル</summary>") >= 0 && alSrc.indexOf("<summary>最下段</summary>") >= 0);
ok("レイヤーは mount 再利用", layerSrc.indexOf("function mount(") >= 0 && layerSrc.indexOf('window.v3EastRail.open("layers")') >= 0);
ok("レイヤー外側クリックはレールでは無効", layerSrc.indexOf("isRailOpen()") >= 0 && layerSrc.indexOf("if (isHosted() || isRailOpen()) return;") >= 0);
ok("CADツールバーから同じレールを開く", cadSrc.indexOf('v3EastRail.toggle("autolayout")') >= 0 && cadSrc.indexOf('v3EastRail.toggle("layers")') >= 0);
ok("図面出力 drawing.js は未変更パスを維持", drawingJs.indexOf("FIXED_SLOTS") >= 0 || drawingJs.indexOf("drawingDocument") >= 0);

const sandbox = {
  console: console,
  window: { localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } },
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(storeSrc, sandbox);

const store = sandbox.window.v3LayoutStore;
ok("layout-store が読める", !!(store && store.sanitize && store.defaultState));

const def = store.defaultState();
ok("eastRail 初期は収納 280", def.eastRail && def.eastRail.open === null && def.eastRail.width === 280);

const saved = store.sanitize({
  v: 1,
  toolbars: def.toolbars,
  popups: {},
  groups: def.groups,
  radial: def.radial,
  viewport: def.viewport,
  layers: def.layers,
  layerPanel: def.layerPanel,
  headerIcons: def.headerIcons,
  eastRail: { open: "autolayout", width: 320 },
});
ok("eastRail 幅と open を保持", saved.eastRail.open === "autolayout" && saved.eastRail.width === 320);

const savedLen = store.sanitize({
  v: 1,
  toolbars: def.toolbars,
  popups: {},
  groups: def.groups,
  radial: def.radial,
  viewport: def.viewport,
  layers: def.layers,
  layerPanel: def.layerPanel,
  headerIcons: def.headerIcons,
  eastRail: { open: "length", width: 280 },
});
ok("eastRail は長さ変更タブを保持", savedLen.eastRail.open === "length" && savedLen.eastRail.width === 280);

const savedAdd = store.sanitize({
  v: 1,
  toolbars: def.toolbars,
  popups: {},
  groups: def.groups,
  radial: def.radial,
  viewport: def.viewport,
  layers: def.layers,
  layerPanel: def.layerPanel,
  headerIcons: def.headerIcons,
  eastRail: { open: "add", width: 280 },
});
ok("eastRail はパーツ追加タブを保持", savedAdd.eastRail.open === "add" && savedAdd.eastRail.width === 280);

const clamped = store.sanitize({
  v: 1,
  toolbars: def.toolbars,
  popups: {},
  groups: def.groups,
  radial: def.radial,
  viewport: def.viewport,
  layers: def.layers,
  layerPanel: def.layerPanel,
  headerIcons: def.headerIcons,
  eastRail: { open: "material", width: 9999 },
});
ok("不正タブは捨て幅はクランプ", clamped.eastRail.open === null && clamped.eastRail.width === 420);

const railBox = { console: console, window: {}, document: { getElementById() { return null; }, addEventListener() {}, querySelector() { return null; } } };
railBox.window.window = railBox.window;
railBox.window.document = railBox.document;
railBox.document.addEventListener = function () {};
railBox.window.addEventListener = function () {};
vm.runInNewContext(railSrc, railBox);
const rail = railBox.window.v3EastRail;
ok("east-rail API", !!(rail && rail.shouldOverlay && rail.clampWidth));
ok("幅クランプ 220-420", rail.clampWidth(100) === 220 && rail.clampWidth(280) === 280 && rail.clampWidth(800) === 420);
ok("1920px は push", rail.shouldOverlay(280, 1920, 112, 0, 640) === false);
ok("1366px は push", rail.shouldOverlay(280, 1366, 112, 0, 640) === false);
ok("1280px は push", rail.shouldOverlay(280, 1280, 112, 0, 640) === false);
ok("狭い画面は overlay", rail.shouldOverlay(280, 900, 112, 0, 640) === true);
ok("east dock 占有時は overlay しない", rail.shouldOverlay(280, 900, 112, 112, 640) === false);

ok("window.resize を再発行しない", railSrc.indexOf('dispatchEvent(new Event("resize"))') < 0 && railSrc.indexOf("dispatchEvent(new Event('resize'))") < 0);
ok("CAD更新は resizeV3View 直接", railSrc.indexOf("resizeV3View") >= 0 && railSrc.indexOf("scheduleCadSync") >= 0);
ok("window 受信は source window", railSrc.indexOf('applyLayout(false, "window")') >= 0);
ok("host 操作は source host", railSrc.indexOf('applyLayout(true, "host")') >= 0);

let dispatched = 0;
const listeners = { resize: [] };
function makeEl(id) {
  const classSet = {};
  const attrs = {};
  const styleVals = {};
  return {
    id: id,
    className: "",
    hidden: id !== "v3-east-rail",
    parentElement: null,
    style: {
      setProperty: function (k, v) { styleVals[k] = v; },
      getPropertyValue: function (k) { return styleVals[k] || ""; },
    },
    classList: {
      contains: function (c) { return !!classSet[c]; },
      toggle: function (c, on) {
        if (on === false) delete classSet[c];
        else if (on === true) classSet[c] = true;
        else if (classSet[c]) delete classSet[c];
        else classSet[c] = true;
      },
    },
    getAttribute: function (k) { return attrs[k] || ""; },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    querySelector: function () { return makeEl("tab"); },
    contains: function () { return false; },
    addEventListener: function () {},
    appendChild: function (child) { if (child) child.parentElement = this; },
    offsetWidth: 0,
    getBoundingClientRect: function () { return { width: 36, height: 800, left: 1200, right: 1236, top: 48, bottom: 848 }; },
  };
}
const els = {
  "v3-east-rail": makeEl("v3-east-rail"),
  "v3-east-pane": makeEl("v3-east-pane"),
  "v3-east-resize": makeEl("v3-east-resize"),
  "v3-east-pane-autolayout": makeEl("v3-east-pane-autolayout"),
  "v3-east-pane-layers": makeEl("v3-east-pane-layers"),
  "v3-east-pane-add": makeEl("v3-east-pane-add"),
  "v3-east-pane-length": makeEl("v3-east-pane-length"),
  "v3-al-win": makeEl("v3-al-win"),
  "v3-west": makeEl("v3-west"),
  "v3-dock-east": makeEl("v3-dock-east"),
};
els["v3-west"].classList.toggle("v3-dock-empty", true);
els["v3-dock-east"].classList.toggle("v3-dock-empty", true);
els["v3-al-win"].classList.toggle("hidden", true);

const loopBox = {
  console: console,
  window: {
    innerWidth: 1920,
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    addEventListener: function (type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    dispatchEvent: function (ev) {
      dispatched += 1;
      const type = ev && ev.type;
      (listeners[type] || []).forEach(function (fn) { fn(ev); });
    },
    requestAnimationFrame: function (fn) { fn(); },
    resizeV3View: function () {},
  },
  document: {
    getElementById: function (id) { return els[id] || null; },
    querySelector: function () { return { clientWidth: 1920 }; },
    addEventListener: function () {},
    body: { classList: { toggle: function () {} } },
  },
};
loopBox.window.window = loopBox.window;
loopBox.window.document = loopBox.document;
loopBox.document.activeElement = null;
vm.runInNewContext(railSrc, loopBox);
const live = loopBox.window.v3EastRail;
ok("モック上でレール起動", !!(live && live.toggle));
dispatched = 0;
live.open("autolayout");
live.close();
live.toggle("layers");
live.toggle("layers");
(listeners.resize || []).forEach(function (fn) { fn({}); fn({}); fn({}); });
ok("開閉と window.resize で resize イベントを増やさない", dispatched === 0, "dispatched=" + dispatched);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
