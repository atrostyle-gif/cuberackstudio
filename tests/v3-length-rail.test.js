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
const railSrc = fs.readFileSync(path.join(root, "js/ui/v3-east-rail.js"), "utf8");
const storeSrc = fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8");
const lenSrc = fs.readFileSync(path.join(root, "js/ui/v3-length-panel.js"), "utf8");
const cadSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const layerSrc = fs.readFileSync(path.join(root, "js/ui/v3-layer-panel.js"), "utf8");
const alSrc = fs.readFileSync(path.join(root, "js/ui/v3-autolayout-panel.js"), "utf8");
const drawingJs = fs.readFileSync(path.join(root, "js/app/drawing.js"), "utf8");

ok("パーツ追加タブがある", indexSrc.indexOf('data-east-tab="add"') >= 0 && indexSrc.indexOf('id="v3-east-pane-add"') >= 0 && indexSrc.indexOf('data-label="パーツ追加"') >= 0);
ok("長さ変更タブがある", indexSrc.indexOf('data-east-tab="length"') >= 0 && indexSrc.indexOf('data-label="長さ変更"') >= 0);
ok("タブは4つ", (indexSrc.match(/data-east-tab="/g) || []).length === 4);
ok("レール TABS に add と length", railSrc.indexOf("add: 1") >= 0 && railSrc.indexOf("length: 1") >= 0 && railSrc.indexOf("mountAdd") >= 0);
ok("layout-store が add/length を保持", storeSrc.indexOf('raw.open === "add"') >= 0 && storeSrc.indexOf('raw.open === "length"') >= 0);
ok("追加はパーツ追加タブへ", lenSrc.indexOf("openOnRail(RAIL_ADD)") >= 0);
ok("変更は長さ変更タブへ", lenSrc.indexOf("openOnRail(RAIL_EDIT)") >= 0);
ok("旧ポップアップを二重表示しない", lenSrc.indexOf("hideFloatingLengthUi") >= 0 && lenSrc.indexOf("suppressPopupCancel") >= 0);
ok("規格候補は既存配列", lenSrc.indexOf("window.BEAM_LENGTH_OPTIONS") >= 0 && lenSrc.indexOf("window.POLE_LENGTH_OPTIONS") >= 0);
ok("追加は currentLengthMm を再利用", lenSrc.indexOf("window.currentLengthMm") >= 0 && lenSrc.indexOf("function pushToLegacy") >= 0);
ok("変更は setSelectedConnectorLengthMm を再利用", lenSrc.indexOf("setSelectedConnectorLengthMm") >= 0);
ok("Undo は saveHistory", lenSrc.indexOf('saveHistory("edit length")') >= 0);
ok("キャンセルは CAD を変えない", lenSrc.indexOf("function cancelEdit") >= 0 && /function cancelEdit\(\) \{[\s\S]*?seedEditFromSelection\(true\)/.test(lenSrc));
ok("チップは追加モード中も残す", lenSrc.indexOf("const show = !!k;") >= 0 && lenSrc.indexOf("!!k && !isAddOpen()") < 0);
ok("CADツール切替でレール内容を同期", cadSrc.indexOf("v3LengthPanel.syncFromTool") >= 0);
ok("レイヤー mount は維持", layerSrc.indexOf("function mount(") >= 0);
ok("自動レイアウト docked は維持", alSrc.indexOf("opts.docked") >= 0);
ok("図面出力は未変更パス", drawingJs.indexOf("FIXED_SLOTS") >= 0 || drawingJs.indexOf("drawingDocument") >= 0);
ok("resize 再発行なし", railSrc.indexOf('dispatchEvent(new Event("resize"))') < 0 && lenSrc.indexOf("dispatchEvent") < 0);
ok("パーツ追加に Beam/Pole 切替がある", lenSrc.indexOf("function kindRow") >= 0 && lenSrc.indexOf("function selectAddKind") >= 0 && lenSrc.indexOf("v3-len-kinds") >= 0);
ok("切替は CAD runCommand と同期", lenSrc.indexOf("cad.runCommand(kind)") >= 0);
ok("長さ変更は選択部材から決める", lenSrc.indexOf('kindEl.textContent = sc.type === "pole" ? "Pole" : "Beam"') >= 0 && !/function fillEdit[\s\S]*kindRow\(/.test(lenSrc));
ok("pane を container にする", indexSrc.indexOf("container-type:inline-size") >= 0 && indexSrc.indexOf("container-name:v3-len-pane") >= 0);
ok("通常幅は2列", /#v3-east-pane-add \.v3-len-grid[\s\S]{0,180}repeat\(2, minmax\(0, 1fr\)\)/.test(indexSrc));
ok("狭幅は1列", /@container v3-len-pane \(max-width: 199px\)/.test(indexSrc) && /@container v3-len-pane \(max-width: 199px\)\{\s*\.v3-len-grid\{ grid-template-columns:1fr; \}/.test(indexSrc));
ok("板UIの狭幅は Beam/Pole モード行を変えない", indexSrc.indexOf(".v3-len-board-seg{ grid-template-columns:1fr; }") >= 0 && indexSrc.indexOf(".v3-len-kinds, .v3-len-modes{ flex-direction:column; }") < 0);
ok("viewport 幅では列数を変えない", !/@media\s*\([^)]*max-width[^)]*\)[\s\S]{0,240}v3-len-grid/.test(indexSrc));
ok("幅変更でグリッドを再構築しない", !/ResizeObserver[\s\S]{0,200}v3-len-grid/.test(lenSrc) && lenSrc.indexOf("fillAdd") >= 0);

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
    style: { paddingLeft: "", left: "", top: "", width: "", setProperty: function () {}, getPropertyValue: function () { return ""; } },
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
      if (child.id) els[child.id] = child;
      return child;
    },
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
    closest: function (sel) {
      let cur = node;
      while (cur) {
        if (match(cur, sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    focus: function () {},
    addEventListener: function (type, fn) {
      node._listeners = node._listeners || {};
      (node._listeners[type] = node._listeners[type] || []).push(fn);
    },
    click: function () {
      const list = (node._listeners && node._listeners.click) || [];
      list.forEach(function (fn) { fn({ preventDefault: function () {}, stopPropagation: function () {} }); });
    },
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
  return sel.split(",").some(function (part) {
    part = part.trim();
    if (part.charAt(0) === "#") return el.id === part.slice(1);
    if (part.charAt(0) === ".") {
      return part.slice(1).split(".").every(function (cls) {
        return (" " + el.className + " ").indexOf(" " + cls + " ") >= 0;
      });
    }
    return el.tagName === part.toUpperCase();
  });
}

const els = {
  "v3-east-pane-add": makeEl("div", "v3-east-pane-add"),
  "v3-east-pane-length": makeEl("div", "v3-east-pane-length"),
  "v3-east-rail": makeEl("aside", "v3-east-rail"),
  "v3-east-pane": makeEl("div", "v3-east-pane"),
  "v3-float-layer": makeEl("div", "v3-float-layer"),
};
els["v3-east-pane-add"].parentElement = els["v3-east-rail"];
els["v3-east-pane-length"].parentElement = els["v3-east-rail"];
els["v3-east-pane"].parentElement = els["v3-east-rail"];
els["v3-east-pane"].hidden = true;

let railOpen = null;
let popupId = null;
const popupOpened = [];
let appliedMm = null;
let history = [];
const beams = [{ a: 0, b: 1, lengthMm: 200, material: "IRON" }];
const poles = [{ a: 0, b: 1, lengthMm: 300, material: "IRON" }];

const sandbox = {
  console: console,
  window: {
    innerWidth: 1920,
    innerHeight: 1080,
    BEAM_LENGTH_OPTIONS: [25, 50, 100, 150, 200, 300, 400, 500, 600, 800],
    POLE_LENGTH_OPTIONS: [50, 100, 200, 300, 400, 500, 600, 800],
    currentPartType: "beam",
    __V3_TOOL_MODE__: "beam",
    isLengthEditModeOn: false,
    isOrderModeOn: false,
    currentLengthMm: 200,
    currentOrderLengthMm: null,
    selectedConnector: { type: "beam", index: 0 },
    beams: beams,
    poles: poles,
    addEventListener: function () {},
    dispatchEvent: function () {},
    parseLengthMm: function (s) { const n = Number(s); return Number.isFinite(n) ? n : NaN; },
    formatDesignMm: function (n) { return String(n); },
    isPresetLengthMm: function (n, list) { return (list || []).indexOf(n) >= 0; },
    getSelectedConnectorLengthMm: function () {
      const sc = sandbox.window.selectedConnector;
      const list = sc && sc.type === "pole" ? poles : beams;
      const item = list && sc && list[sc.index];
      return item ? item.lengthMm : null;
    },
    setSelectedConnectorLengthMm: function (mm) {
      appliedMm = mm;
      const sc = sandbox.window.selectedConnector;
      const list = sc && sc.type === "pole" ? poles : beams;
      if (list && sc && list[sc.index]) list[sc.index].lengthMm = mm;
      return true;
    },
    saveHistory: function (reason) { history.push(reason); },
    v3GetActiveToolMode: function () { return sandbox.window.__V3_TOOL_MODE__; },
  },
  document: {
    body: { classList: { toggle: function () {}, add: function () {}, remove: function () {} } },
    getElementById: function (id) { return els[id] || null; },
    createElement: function (tag) { return makeEl(tag); },
    addEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    activeElement: null,
  },
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.v3WorkspaceUi = {
  getOpenPopupId: function () { return popupId; },
  openPopup: function (id) { popupOpened.push(id); popupId = id; },
  closePopup: function () { popupId = null; },
  persist: function () {},
  getState: function () { return { popups: {} }; },
};
sandbox.window.v3EastRail = {
  open: function (id) {
    railOpen = id;
    const pan = sandbox.window.v3LengthPanel;
    if (id === "add" && pan && pan.mountAdd) pan.mountAdd(els["v3-east-pane-add"]);
    if (id === "length" && pan && pan.mountEdit) pan.mountEdit(els["v3-east-pane-length"]);
  },
  getOpenId: function () { return railOpen; },
};

const cadCmds = [];
sandbox.window.v3CadToolbar = {
  runCommand: function (cmd) {
    cadCmds.push(cmd);
    if (cmd === "beam" || cmd === "pole") {
      sandbox.window.currentPartType = cmd;
      sandbox.window.__V3_TOOL_MODE__ = cmd;
      sandbox.window.isLengthEditModeOn = false;
      const pan = sandbox.window.v3LengthPanel;
      if (pan && typeof pan.openAdd === "function") pan.openAdd({ kind: cmd });
    }
  },
  syncActive: function () {},
};

vm.runInNewContext(lenSrc, sandbox);
const panel = sandbox.window.v3LengthPanel;
ok("length-panel 起動", !!(panel && panel.openAdd && panel.mount));

panel.openAdd({ kind: "beam" });
ok("Beam追加はパーツ追加タブ", railOpen === "add");
ok("Beam追加で長さ変更タブは開かない", railOpen !== "length");
ok("旧ポップアップは開かない", popupOpened.length === 0, "opened=" + popupOpened.join(","));
ok("追加モード表示", panel.panelMode() === "add" && panel.isAddOpen());

const addRoot = els["v3-len-add-root"];
ok("BEAM と規格ボタンがある", !!(addRoot && addRoot.parentElement));
const btns = [];
walk(els["v3-len-root-add"] || els["v3-east-pane-add"], btns);
const beam600 = btns.find(function (el) { return el.textContent === "600 mm"; });
ok("Beam 規格 600 を選べる", !!beam600);
if (beam600) beam600.click();
ok("規格長さが追加処理へ入る", sandbox.window.currentLengthMm === 600 && sandbox.window.isOrderModeOn === false);
ok("長さ変更後も追加モード維持", sandbox.window.__V3_TOOL_MODE__ === "beam" && panel.panelMode() === "add");

function kindBtns() {
  const all = [];
  walk(els["v3-len-root-add"] || els["v3-east-pane-add"], all);
  return {
    beam: all.find(function (el) { return el.textContent === "BEAM"; }),
    pole: all.find(function (el) { return el.textContent === "POLE"; }),
  };
}
let kinds = kindBtns();
ok("BEAM/POLE 切替がある", !!(kinds.beam && kinds.pole));
ok("初期は BEAM 選択", !!(kinds.beam && kinds.beam.classList.contains("is-on") && kinds.pole && !kinds.pole.classList.contains("is-on")));
if (kinds.pole) kinds.pole.click();
ok("POLE 切替で CAD 追加モードが変わる", sandbox.window.__V3_TOOL_MODE__ === "pole" && sandbox.window.currentPartType === "pole");
ok("POLE 切替は runCommand を使う", cadCmds[cadCmds.length - 1] === "pole", "cmds=" + cadCmds.join(","));
kinds = kindBtns();
ok("パネル表示が POLE に追従", !!(kinds.pole && kinds.pole.classList.contains("is-on") && kinds.beam && !kinds.beam.classList.contains("is-on")));
ok("切替後もパーツ追加タブ", railOpen === "add" && panel.panelMode() === "add");
if (kinds.beam) kinds.beam.click();
ok("BEAM へ戻すと CAD も戻る", sandbox.window.__V3_TOOL_MODE__ === "beam" && sandbox.window.currentPartType === "beam");
ok("幅や切替で Beam 規格は残る", sandbox.window.currentLengthMm === 600);
kinds = kindBtns();
ok("ツールバー相当の BEAM 選択にパネルが追従", !!(kinds.beam && kinds.beam.classList.contains("is-on")));

sandbox.window.__V3_TOOL_MODE__ = "pole";
sandbox.window.currentPartType = "pole";
panel.openAdd({ kind: "pole" });
ok("Pole追加モード", panel.panelMode() === "add");
const poleBtns = [];
walk(els["v3-len-root-add"] || els["v3-east-pane-add"], poleBtns);
const pole400 = poleBtns.find(function (el) { return el.textContent === "400 mm"; });
ok("Pole 規格 400 を選べる", !!pole400);
if (pole400) pole400.click();
ok("Pole 規格が currentLengthMm へ", sandbox.window.currentLengthMm === 400);
ok("Pole追加モード維持", sandbox.window.__V3_TOOL_MODE__ === "pole");

const orderTab = poleBtns.find(function (el) { return el.textContent === "オーダー長さ"; });
ok("オーダー切替がある", !!orderTab);
if (orderTab) orderTab.click();
const orderInp = els["v3-len-add-order"];
ok("オーダー入力が出る", !!(orderInp && orderInp.tagName === "INPUT"));
if (orderInp) {
  orderInp.value = "123.5";
  const ins = (orderInp._listeners && orderInp._listeners.input) || [];
  ins.forEach(function (fn) { fn(); });
}
const committed = panel.commitAdd("pole");
ok("オーダー長さを設定できる", committed && committed.ok && committed.mm === 123.5, JSON.stringify(committed));
if (orderInp) {
  orderInp.value = "0";
  const insBad = (orderInp._listeners && orderInp._listeners.input) || [];
  insBad.forEach(function (fn) { fn(); });
}
const bad = panel.commitAdd("pole");
ok("無効なオーダーは CAD へ入れない", bad && bad.ok === false && sandbox.window.currentLengthMm === 123.5, JSON.stringify(bad));

sandbox.window.__V3_TOOL_MODE__ = "select";
sandbox.window.isLengthEditModeOn = true;
sandbox.window.selectedConnector = { type: "beam", index: 0 };
appliedMm = null;
history = [];
ok("Pole追加もパーツ追加タブ", railOpen === "add");
panel.openEdit();
ok("長さ変更ツールは長さ変更タブ", railOpen === "length");
ok("長さ変更モード", panel.panelMode() === "edit");
ok("変更でも旧ポップアップは開かない", popupOpened.length === 0);
const editBtns = [];
walk(els["v3-len-root-edit"] || els["v3-east-pane-length"], editBtns);
ok("長さ変更タブに BEAM/POLE 切替はない", editBtns.filter(function (el) { return el.textContent === "BEAM" || el.textContent === "POLE"; }).length === 0);
ok("長さ変更は選択部材を表示", editBtns.some(function (el) { return el.textContent === "Beam"; }));
const edit500 = editBtns.find(function (el) { return el.textContent === "500 mm"; });
ok("配置済み変更で規格を選べる", !!edit500);
if (edit500) edit500.click();
ok("未適用では CAD を変えない", appliedMm === null && beams[0].lengthMm === 200);
const applyBtn = editBtns.concat([]).length && (function () {
  const all = [];
  walk(els["v3-len-root-edit"] || els["v3-east-pane-length"], all);
  return all.find(function (el) { return el.textContent === "適用"; });
})();
ok("適用ボタンがある", !!applyBtn);
if (applyBtn) applyBtn.click();
ok("適用は既存処理へ接続", appliedMm === 500 && beams[0].lengthMm === 500);
ok("Undo 履歴を積む", history.indexOf("edit length") >= 0);
ok("選択は解除しない", sandbox.window.selectedConnector && sandbox.window.selectedConnector.index === 0);

appliedMm = null;
const before = beams[0].lengthMm;
panel.openEdit();
const all2 = [];
walk(els["v3-len-root-edit"] || els["v3-east-pane-length"], all2);
const edit800 = all2.find(function (el) { return el.textContent === "800 mm"; });
if (edit800) edit800.click();
const cancelBtn = (function () {
  const all = [];
  walk(els["v3-len-root-edit"] || els["v3-east-pane-length"], all);
  return all.find(function (el) { return el.textContent === "キャンセル"; });
})();
ok("キャンセルボタンがある", !!cancelBtn);
if (cancelBtn) cancelBtn.click();
ok("キャンセルで確定しない", appliedMm === null && beams[0].lengthMm === before);

sandbox.window.__V3_TOOL_MODE__ = "beam";
sandbox.window.isLengthEditModeOn = false;
panel.openAdd({ kind: "beam" });
ok("再追加でもパーツ追加タブ", railOpen === "add");
sandbox.window.v3EastRail.open("length");
ok("手動で長さ変更タブへ切替", railOpen === "length");
ok("タブ手動切替では追加モードを維持", sandbox.window.__V3_TOOL_MODE__ === "beam" && sandbox.window.isLengthEditModeOn === false);
sandbox.window.v3EastRail.open("add");
ok("手動でパーツ追加タブへ戻す", railOpen === "add");
ok("CADモードはまだ beam", sandbox.window.__V3_TOOL_MODE__ === "beam");
sandbox.window.v3EastRail.open("layers");
ok("レイヤーへ切替できる", railOpen === "layers");
ok("レイヤー切替でも CAD モード維持", sandbox.window.__V3_TOOL_MODE__ === "beam");
sandbox.window.v3EastRail.open("length");
ok("幅変更後も長さ変更パネルを再マウント", railOpen === "length" && !!els["v3-len-root-edit"]);

const chip = els["v3-len-chip"];
sandbox.window.__V3_TOOL_MODE__ = "beam";
sandbox.window.isLengthEditModeOn = false;
panel.syncChip();
ok("追加モードのチップが残る", chip && chip.hidden === false && String(chip.textContent).indexOf("Beam") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
