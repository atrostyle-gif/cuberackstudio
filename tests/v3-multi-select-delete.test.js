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

function makeClassList(el) {
  return {
    add: function () {
      const cur = (el.className || "").split(/\s+/).filter(Boolean);
      Array.prototype.forEach.call(arguments, function (c) {
        if (cur.indexOf(c) < 0) cur.push(c);
      });
      el.className = cur.join(" ");
    },
    remove: function () {
      const drop = {};
      Array.prototype.forEach.call(arguments, function (c) { drop[c] = true; });
      el.className = (el.className || "").split(/\s+/).filter(function (c) { return c && !drop[c]; }).join(" ");
    },
    contains: function (c) {
      return (el.className || "").split(/\s+/).indexOf(c) >= 0;
    },
    toggle: function (c, on) {
      const next = on == null ? !this.contains(c) : !!on;
      if (next) this.add(c);
      else this.remove(c);
      return next;
    },
  };
}

function matches(el, selector) {
  const sel = String(selector || "").trim();
  if (!el || el.nodeType !== 1) return false;
  if (sel.indexOf(",") >= 0) {
    return sel.split(",").some(function (part) { return matches(el, part.trim()); });
  }
  if (sel.charAt(0) === "#") return el.id === sel.slice(1);
  if (sel.charAt(0) === ".") return el.classList.contains(sel.slice(1));
  const attr = /^\[([^\]]+)\]$/.exec(sel);
  if (attr) return el.getAttribute(attr[1].split("=")[0]) != null;
  return String(el.tagName || "").toLowerCase() === sel.toLowerCase();
}

function createEl(tag, byId) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    className: "",
    id: "",
    hidden: false,
    style: {},
    textContent: "",
    attrs: {},
    listeners: { 0: {}, 1: {} },
    disabled: false,
  };
  el.classList = makeClassList(el);
  el.setAttribute = function (name, value) {
    el.attrs[name] = String(value);
    if (name === "id") {
      el.id = String(value);
      byId[el.id] = el;
    }
    if (name === "class") el.className = String(value);
  };
  el.getAttribute = function (name) {
    if (name === "id") return el.id || null;
    if (name === "class") return el.className || null;
    return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null;
  };
  el.contains = function (node) {
    let n = node;
    while (n) {
      if (n === el) return true;
      n = n.parentNode;
    }
    return false;
  };
  el.closest = function (sel) {
    let n = el;
    while (n && n.nodeType === 1) {
      if (matches(n, sel)) return n;
      n = n.parentNode;
    }
    return null;
  };
  el.appendChild = function (child) {
    el.children.push(child);
    child.parentNode = el;
    return child;
  };
  el.addEventListener = function (type, fn, opts) {
    const cap = opts === true || !!(opts && opts.capture === true);
    const bucket = el.listeners[cap ? 1 : 0];
    if (!bucket[type]) bucket[type] = [];
    bucket[type].push(fn);
  };
  el.removeEventListener = function (type, fn, opts) {
    const cap = opts === true || !!(opts && opts.capture === true);
    const list = el.listeners[cap ? 1 : 0][type] || [];
    el.listeners[cap ? 1 : 0][type] = list.filter(function (f) { return f !== fn; });
  };
  return el;
}

const byId = {};
const body = createEl("body", byId);
const canvas = createEl("canvas", byId);
canvas.id = "view-canvas";
body.appendChild(canvas);

const input = createEl("input", byId);
input.id = "len-input";
body.appendChild(input);

const document = {
  nodeType: 9,
  body: body,
  activeElement: body,
  listeners: { 0: {}, 1: {} },
  getElementById: function (id) { return byId[id] || null; },
  querySelector: function (sel) {
    if (sel === "dialog[open]") return null;
    return body.closest(sel);
  },
  addEventListener: function (type, fn, opts) {
    const cap = opts === true || !!(opts && opts.capture === true);
    const bucket = document.listeners[cap ? 1 : 0];
    if (!bucket[type]) bucket[type] = [];
    bucket[type].push(fn);
  },
};

function fire(node, type, ev, capture) {
  const list = (node.listeners && node.listeners[capture ? 1 : 0] && node.listeners[capture ? 1 : 0][type]) || [];
  list.forEach(function (fn) {
    if (ev._immediate) return;
    fn.call(node, ev);
  });
}

function pathOf(el) {
  const path = [];
  let n = el;
  while (n) {
    path.push(n);
    n = n.parentNode;
  }
  path.push(document);
  return path;
}

function dispatch(target, type, props) {
  const ev = Object.assign({
    type: type,
    target: target,
    button: 0,
    bubbles: true,
    cancelable: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    key: "",
    clientX: 10,
    clientY: 10,
    preventDefault: function () { this.defaultPrevented = true; },
    stopPropagation: function () { this._stopped = true; },
    stopImmediatePropagation: function () { this._stopped = true; this._immediate = true; },
  }, props || {});
  const path = pathOf(target);
  for (let i = path.length - 1; i >= 0; i--) {
    fire(path[i], type, ev, true);
    if (ev._stopped) return ev;
  }
  for (let i = 0; i < path.length; i++) {
    fire(path[i], type, ev, false);
    if (ev._stopped) return ev;
  }
  return ev;
}

function fakeMesh(kind) {
  return {
    userData: { type: kind },
    children: [],
    material: {
      emissive: { setHex: function () {} },
      emissiveIntensity: 0,
      needsUpdate: false,
    },
  };
}

const beams = [
  { mesh: fakeMesh("beam") },
  { mesh: fakeMesh("beam") },
];
const poles = [
  { mesh: fakeMesh("pole") },
];
const joints = [{ id: 0 }, { id: 1 }];
const jointMeshes = [fakeMesh("joint"), fakeMesh("joint")];
const deleted = [];
const history = [];
let skipHistory = false;
let estimateReasons = [];
let selectedJoint = 0;

function saveHistory(reason) {
  if (skipHistory) return;
  history.push(reason);
}

const windowObj = {
  beams: beams,
  poles: poles,
  joints: joints,
  jointMeshes: jointMeshes,
  shelves: [],
  panels: [],
  __V3_TOOL_MODE__: "select",
  v3GetActiveToolMode: function () { return "select"; },
  confirm: function () { return true; },
  getComputedStyle: function () {
    return { display: "none", visibility: "hidden" };
  },
  setSelectedJoint: function (idx) { selectedJoint = idx; },
  deleteConnectorByMesh: function (mesh) {
    const bi = beams.findIndex(function (b) { return b && b.mesh === mesh; });
    if (bi >= 0) {
      deleted.push("beam:" + bi);
      beams.splice(bi, 1);
      saveHistory("delete beam");
      return;
    }
    const pi = poles.findIndex(function (p) { return p && p.mesh === mesh; });
    if (pi >= 0) {
      deleted.push("pole:" + pi);
      poles.splice(pi, 1);
      saveHistory("delete pole");
    }
  },
  deleteJoint: function (idx) {
    deleted.push("joint:" + idx);
    joints.splice(idx, 1);
    jointMeshes.splice(idx, 1);
    selectedJoint = null;
    saveHistory("delete joint");
  },
  deleteBoard: function (kind, i) { deleted.push(kind + ":" + i); },
  rebuildBoards: function () {},
  rebuildJointClusters: function () {},
  requestEstimateRender: function (reason) { estimateReasons.push(reason); },
  saveHistory: saveHistory,
  addEventListener: function (type, fn, opts) {
    document.addEventListener(type, fn, opts);
  },
  v3CadOps: {
    canvas: function () { return canvas; },
    pickAt: function (x) {
      if (x === 10) return { kind: "beam", index: 0, mesh: beams[0] && beams[0].mesh };
      if (x === 20) return { kind: "beam", index: 1, mesh: beams[1] && beams[1].mesh };
      if (x === 30) return { kind: "pole", index: 0, mesh: poles[0] && poles[0].mesh };
      if (x === 40) return { kind: "joint", index: 0, mesh: jointMeshes[0] };
      if (x === 50) return { kind: "joint", index: 1, mesh: jointMeshes[1] };
      return null;
    },
    withSingleHistory: function (reason, fn) {
      skipHistory = true;
      try { fn(); }
      finally { skipHistory = false; }
      saveHistory(reason);
    },
  },
};

const sandbox = {
  window: windowObj,
  document: document,
  console: console,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  THREE: undefined,
};
sandbox.window.window = windowObj;
sandbox.window.document = document;
windowObj.document = document;

const src = fs.readFileSync(path.join(root, "js/ui/v3-multi-select.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");

ok("キャッシュ更新", indexSrc.indexOf("v3-multi-select.js?v=20261027-msdel1") >= 0 && indexSrc.indexOf("main.js?v=20261027-h1") >= 0);
ok("Ctrl 押しっぱなしでも Delete する", src.indexOf("if (ev.ctrlKey || ev.metaKey || ev.altKey) return;") < 0);
ok("メッシュ参照で Beam/Pole を消す", src.indexOf("meshesOfKind") >= 0 && src.indexOf("deleteConnectorByMesh") >= 0);
ok("履歴は withSingleHistory", src.indexOf('withSingleHistory("multi delete"') >= 0);
ok("main は複数選択を一括削除へ渡す", mainSrc.indexOf("deleteSelected({ confirm: false })") >= 0);

vm.runInNewContext(src, sandbox);
const api = windowObj.v3MultiSelect;
ok("複数選択 API が起動する", !!(api && typeof api.deleteSelected === "function"));

dispatch(canvas, "pointerdown", { clientX: 10, clientY: 10 });
ok("通常クリックで1件選択", api.get().length === 1 && api.get()[0].kind === "beam");

dispatch(canvas, "pointerdown", { clientX: 20, clientY: 10, ctrlKey: true });
ok("Ctrl+クリックで2件保持", api.get().length === 2, api.get().map(function (s) { return s.kind + s.index; }).join(","));

dispatch(canvas, "pointerdown", { clientX: 30, clientY: 10, ctrlKey: true });
ok("Beam と Pole を混在選択", api.get().length === 3 && api.kinds().beam && api.kinds().pole);

deleted.length = 0;
history.length = 0;
estimateReasons.length = 0;
dispatch(document, "keydown", { key: "Delete", ctrlKey: true, target: canvas });
ok("Ctrl+Delete で3件まとめて削除", deleted.slice().sort().join(",") === ["beam:0", "beam:0", "pole:0"].sort().join(","), deleted.join(","));
ok("Undo 単位は 1 回", history.filter(function (r) { return r === "multi delete"; }).length === 1 && history.indexOf("delete beam") < 0, history.join(","));
ok("削除後は選択解除", api.get().length === 0);
ok("見積再計算する", estimateReasons.indexOf("multi delete") >= 0);

beams.splice(0, beams.length, { mesh: fakeMesh("beam") }, { mesh: fakeMesh("beam") });
poles.splice(0, poles.length, { mesh: fakeMesh("pole") });
joints.splice(0, joints.length, { id: 0 }, { id: 1 });
jointMeshes.splice(0, jointMeshes.length, fakeMesh("joint"), fakeMesh("joint"));
dispatch(canvas, "pointerdown", { clientX: 10, clientY: 10 });
dispatch(canvas, "pointerdown", { clientX: 40, clientY: 10, ctrlKey: true });
ok("異なる部材を複数選択", api.get().some(function (s) { return s.kind === "beam"; }) && api.get().some(function (s) { return s.kind === "joint"; }));

deleted.length = 0;
history.length = 0;
dispatch(document, "keydown", { key: "Backspace", target: canvas });
ok("Backspace でも一括削除", deleted.indexOf("beam:0") >= 0 && deleted.some(function (d) { return d.indexOf("joint:") === 0; }), deleted.join(","));
ok("Backspace も Undo 1 回", history.filter(function (r) { return r === "multi delete"; }).length === 1);

beams.splice(0, beams.length, { mesh: fakeMesh("beam") });
dispatch(canvas, "pointerdown", { clientX: 10, clientY: 10 });
ok("単一選択を保持", api.get().length === 1);

deleted.length = 0;
history.length = 0;
dispatch(document, "keydown", { key: "Delete", target: canvas });
ok("単一選択の Delete も既存削除を使う", deleted.join(",") === "beam:0");
ok("単一も履歴 1 回", history.join(",") === "multi delete");

beams.splice(0, beams.length, { mesh: fakeMesh("beam") }, { mesh: fakeMesh("beam") });
dispatch(canvas, "pointerdown", { clientX: 10, clientY: 10 });
dispatch(canvas, "pointerdown", { clientX: 20, clientY: 10, ctrlKey: true });
ok("入力前は2件選択", api.get().length === 2);
deleted.length = 0;
document.activeElement = input;
dispatch(input, "keydown", { key: "Delete", target: input });
ok("入力欄の Delete では部材を消さない", deleted.length === 0 && api.get().length === 2);
document.activeElement = body;

ok("キャンバス選択後に入力フォーカスを外す", src.indexOf("function blurCanvasFocus") >= 0 && src.indexOf("blurCanvasFocus()") >= 0);
ok("削除後に instance pool を同期", src.indexOf("v3InstancePool.sync") >= 0);

const scriptSrcs = [];
indexSrc.replace(/<script src="([^"]+)"/g, function (_, srcPath) {
  scriptSrcs.push(srcPath.split("?")[0]);
  return _;
});
function scriptIndex(name) {
  return scriptSrcs.findIndex(function (s) { return s.indexOf(name) >= 0; });
}
const histIdx = scriptIndex("js/features/history.js");
const mainIdx = scriptIndex("main.js");
const structIdx = scriptIndex("js/features/structural-visualization.js");
const cadOpsIdx = scriptIndex("js/ui/v3-cad-ops.js");
const multiIdx = scriptIndex("js/ui/v3-multi-select.js");
ok("index の読み込み順 history → main → multi-select", histIdx >= 0 && histIdx < mainIdx && mainIdx < multiIdx, [histIdx, mainIdx, multiIdx].join("→"));
ok("index の読み込み順 cad-ops → multi-select", cadOpsIdx >= 0 && cadOpsIdx < multiIdx);
ok("index の読み込み順 structural capture → multi-select", structIdx >= 0 && structIdx < multiIdx);

function makeTarget() {
  const win = { listeners: { 0: {}, 1: {} } };
  const doc = {
    nodeType: 9,
    listeners: { 0: {}, 1: {} },
    activeElement: null,
    getElementById: function () { return null; },
    querySelector: function () { return null; },
  };
  const bodyEl = createEl("body", {});
  const canvasEl = createEl("canvas", {});
  canvasEl.id = "view-canvas";
  bodyEl.appendChild(canvasEl);
  const spin = createEl("input", {});
  spin.tagName = "INPUT";
  spin.blur = function () { doc.activeElement = bodyEl; };
  bodyEl.appendChild(spin);
  doc.body = bodyEl;
  doc.activeElement = spin;
  doc.addEventListener = function (type, fn, opts) {
    const cap = opts === true || !!(opts && opts.capture === true);
    const bucket = doc.listeners[cap ? 1 : 0];
    if (!bucket[type]) bucket[type] = [];
    bucket[type].push(fn);
  };
  win.addEventListener = function (type, fn, opts) {
    const cap = opts === true || !!(opts && opts.capture === true);
    const bucket = win.listeners[cap ? 1 : 0];
    if (!bucket[type]) bucket[type] = [];
    bucket[type].push(fn);
  };
  function fireList(list, ev) {
    (list || []).forEach(function (fn) {
      if (ev._immediate) return;
      fn(ev);
    });
  }
  function dispatchFull(target, type, props) {
    const ev = Object.assign({
      type: type,
      target: target,
      button: 0,
      bubbles: true,
      cancelable: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      key: "",
      clientX: 10,
      clientY: 10,
      preventDefault: function () { this.defaultPrevented = true; },
      stopPropagation: function () { this._stopped = true; },
      stopImmediatePropagation: function () { this._stopped = true; this._immediate = true; },
    }, props || {});
    fireList(win.listeners[1][type], ev);
    if (ev._stopped) return ev;
    fireList(doc.listeners[1][type], ev);
    if (ev._stopped) return ev;
    fireList(target.listeners && target.listeners[1] && target.listeners[1][type], ev);
    if (ev._stopped) return ev;
    fireList(target.listeners && target.listeners[0] && target.listeners[0][type], ev);
    if (ev._stopped) return ev;
    fireList(doc.listeners[0][type], ev);
    if (ev._stopped) return ev;
    fireList(win.listeners[0][type], ev);
    return ev;
  }
  return { win: win, doc: doc, bodyEl: bodyEl, canvasEl: canvasEl, spin: spin, dispatchFull: dispatchFull };
}

const order = makeTarget();
const orderDeleted = [];
const orderHistory = [];
const orderBeams = [{ mesh: fakeMesh("beam") }, { mesh: fakeMesh("beam") }];
const orderPoles = [{ mesh: fakeMesh("pole") }];
const orderJoints = [{ id: 0 }, { id: 1 }];
const orderJointMeshes = [fakeMesh("joint"), fakeMesh("joint")];
let orderSkip = false;
function orderSave(reason) {
  if (orderSkip) return;
  orderHistory.push(reason);
}
const orderWin = {
  beams: orderBeams,
  poles: orderPoles,
  joints: orderJoints,
  jointMeshes: orderJointMeshes,
  shelves: [],
  panels: [],
  __V3_TOOL_MODE__: "select",
  v3GetActiveToolMode: function () { return "select"; },
  confirm: function () { return true; },
  getComputedStyle: function () { return { display: "none", visibility: "hidden" }; },
  setSelectedJoint: function () {},
  deleteConnectorByMesh: function (mesh) {
    const bi = orderBeams.findIndex(function (b) { return b && b.mesh === mesh; });
    if (bi >= 0) {
      orderDeleted.push("beam:" + bi);
      orderBeams.splice(bi, 1);
      orderSave("delete beam");
      return;
    }
    const pi = orderPoles.findIndex(function (p) { return p && p.mesh === mesh; });
    if (pi >= 0) {
      orderDeleted.push("pole:" + pi);
      orderPoles.splice(pi, 1);
      orderSave("delete pole");
    }
  },
  deleteJoint: function (idx) {
    orderDeleted.push("joint:" + idx);
    orderJoints.splice(idx, 1);
    orderJointMeshes.splice(idx, 1);
    orderSave("delete joint");
  },
  deleteBoard: function (kind, i) { orderDeleted.push(kind + ":" + i); },
  rebuildBoards: function () {},
  rebuildJointClusters: function () {},
  requestEstimateRender: function () {},
  saveHistory: orderSave,
  addEventListener: order.win.addEventListener,
  v3CadOps: {
    canvas: function () { return order.canvasEl; },
    pickAt: function (x) {
      if (x === 10) return { kind: "beam", index: 0, mesh: orderBeams[0] && orderBeams[0].mesh };
      if (x === 20) return { kind: "beam", index: 1, mesh: orderBeams[1] && orderBeams[1].mesh };
      if (x === 30) return { kind: "pole", index: 0, mesh: orderPoles[0] && orderPoles[0].mesh };
      if (x === 40) return { kind: "joint", index: 0, mesh: orderJointMeshes[0] };
      return null;
    },
    withSingleHistory: function (reason, fn) {
      orderSkip = true;
      try { fn(); }
      finally { orderSkip = false; }
      orderSave(reason);
    },
  },
  v3InstancePool: { note: function () {}, sync: function () { orderWin.__synced = true; } },
};
order.doc.activeElement = order.spin;
const orderSandbox = {
  window: orderWin,
  document: order.doc,
  console: console,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  THREE: undefined,
};
orderSandbox.window.window = orderWin;
orderSandbox.window.document = order.doc;
orderWin.document = order.doc;

// index.html と同じ登録順: history.js → main.js → structural-visualization.js → v3-multi-select.js
order.win.addEventListener("keydown", function (e) {
  if (e.ctrlKey && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
    e.preventDefault();
    orderHistory.push("undo");
  }
});
order.win.addEventListener("keydown", function (e) {
  if (e.repeat) return;
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  const ae = order.doc.activeElement;
  const tag = ae && ae.tagName ? ae.tagName.toLowerCase() : "";
  const typing = tag === "input" || tag === "textarea" || tag === "select" || !!(ae && ae.isContentEditable);
  const targetTyping = !!(e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable='true']"));
  if (typing || targetTyping) return;
  if (orderWin.v3MultiSelect && orderWin.v3MultiSelect.get().length) {
    e.preventDefault();
    orderWin.v3MultiSelect.deleteSelected({ confirm: false });
    return;
  }
  if (e.key === "Delete") orderDeleted.push("single-joint");
});
order.win.addEventListener("keydown", function () {}, true);
vm.runInNewContext(src, orderSandbox);
const orderApi = orderWin.v3MultiSelect;
ok("実スクリプト順でも API が起動", !!(orderApi && typeof orderApi.deleteSelected === "function"));

order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 10, clientY: 10 });
order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 20, clientY: 10, ctrlKey: true });
order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 30, clientY: 10, ctrlKey: true });
ok("Ctrl+クリック後の選択件数は3", orderApi.get().length === 3, String(orderApi.get().length));
ok("キャンバス選択で spinbutton のフォーカスが外れる", order.doc.activeElement !== order.spin);

orderDeleted.length = 0;
orderHistory.length = 0;
order.dispatchFull(order.canvasEl, "keydown", { key: "Delete", ctrlKey: true, target: order.canvasEl });
ok("Ctrl押しっぱなし Delete でも一括削除", orderDeleted.slice().sort().join(",") === ["beam:0", "beam:0", "pole:0"].sort().join(","), orderDeleted.join(","));
ok("main.js の単一削除は走らない", orderDeleted.indexOf("single-joint") < 0);
ok("Undo 単位は multi delete 1回", orderHistory.filter(function (r) { return r === "multi delete"; }).length === 1 && orderHistory.indexOf("delete beam") < 0, orderHistory.join(","));
ok("削除後に pool.sync する", !!orderWin.__synced);

orderBeams.splice(0, orderBeams.length, { mesh: fakeMesh("beam") }, { mesh: fakeMesh("beam") });
orderPoles.splice(0, orderPoles.length, { mesh: fakeMesh("pole") });
orderJoints.splice(0, orderJoints.length, { id: 0 }, { id: 1 });
orderJointMeshes.splice(0, orderJointMeshes.length, fakeMesh("joint"), fakeMesh("joint"));
order.doc.activeElement = order.spin;
order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 10, clientY: 10 });
order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 40, clientY: 10, ctrlKey: true });
ok("Beam と Joint の混在選択", orderApi.get().some(function (s) { return s.kind === "beam"; }) && orderApi.get().some(function (s) { return s.kind === "joint"; }));
orderDeleted.length = 0;
order.dispatchFull(order.bodyEl, "keydown", { key: "Delete", target: order.bodyEl });
ok("Ctrlを離した Delete でも混在削除", orderDeleted.indexOf("beam:0") >= 0 && orderDeleted.some(function (d) { return d.indexOf("joint:") === 0; }), orderDeleted.join(","));

orderBeams.splice(0, orderBeams.length, { mesh: fakeMesh("beam") }, { mesh: fakeMesh("beam") });
order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 10, clientY: 10 });
order.dispatchFull(order.canvasEl, "pointerdown", { clientX: 20, clientY: 10, ctrlKey: true });
order.doc.activeElement = order.spin;
orderDeleted.length = 0;
order.dispatchFull(order.spin, "keydown", { key: "Delete", target: order.spin });
ok("入力欄に戻れば CAD を消さない", orderDeleted.length === 0 && orderApi.get().length === 2);

const connSrc = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
ok("deleteConnectorByMesh が pool から外す", connSrc.indexOf("disposeBeamMesh(beam)") >= 0 && connSrc.indexOf("disposePoleMesh(pole)") >= 0);
ok("deleteJoint が pool から外す", jointsSrc.indexOf("disposeSharedSafe(jointMeshes[index])") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
