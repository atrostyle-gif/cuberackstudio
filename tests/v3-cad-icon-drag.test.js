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

function isCapture(opts) {
  return opts === true || !!(opts && opts.capture === true);
}

function makeStyle() {
  const style = {};
  style.setProperty = function (name, value) { style[name] = String(value); };
  style.removeProperty = function (name) { delete style[name]; };
  style.getPropertyValue = function (name) { return style[name] || ""; };
  return style;
}

function makeClassList(el) {
  return {
    add: function () {
      Array.prototype.forEach.call(arguments, function (c) {
        const cur = (el.className || "").split(/\s+/).filter(Boolean);
        if (cur.indexOf(c) < 0) cur.push(c);
        el.className = cur.join(" ");
      });
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
      const has = this.contains(c);
      const next = on == null ? !has : !!on;
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
  const parts = sel.split(/\s+/);
  if (parts.length === 2) {
    if (!matches(el, parts[1])) return false;
    let p = el.parentNode;
    while (p) {
      if (matches(p, parts[0])) return true;
      p = p.parentNode;
    }
    return false;
  }
  if (sel.charAt(0) === "#") return el.id === sel.slice(1);
  if (sel.charAt(0) === ".") return el.classList.contains(sel.slice(1));
  const attr = /^\[([^\]]+)\]$/.exec(sel);
  if (attr) {
    const bits = attr[1].split("=");
    const name = bits[0];
    if (bits.length === 1) return el.getAttribute(name) != null;
    return el.getAttribute(name) === bits[1].replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
  return String(el.tagName || "").toLowerCase() === sel.toLowerCase();
}

function createEl(tag, byId) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    className: "",
    _id: "",
    hidden: false,
    style: makeStyle(),
    innerHTML: "",
    textContent: "",
    attrs: {},
    listeners: { 0: {}, 1: {} },
    _rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    offsetWidth: 160,
    offsetHeight: 40,
  };
  Object.defineProperty(el, "id", {
    get: function () { return el._id || ""; },
    set: function (v) {
      el._id = String(v || "");
      el.attrs.id = el._id;
      if (el._id) byId[el._id] = el;
    },
  });
  el.classList = makeClassList(el);
  el.setAttribute = function (name, value) {
    const v = String(value);
    el.attrs[name] = v;
    if (name === "id") {
      el.id = v;
      byId[v] = el;
    }
    if (name === "class") el.className = v;
  };
  el.getAttribute = function (name) {
    if (name === "id") return el.id || null;
    if (name === "class") return el.className || null;
    return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null;
  };
  el.removeAttribute = function (name) { delete el.attrs[name]; };
  el.appendChild = function (child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    el.children.push(child);
    child.parentNode = el;
    child.parentElement = el;
    return child;
  };
  el.removeChild = function (child) {
    el.children = el.children.filter(function (c) { return c !== child; });
    if (child.parentNode === el) {
      child.parentNode = null;
      child.parentElement = null;
    }
    return child;
  };
  el.insertBefore = function (child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const idx = before ? el.children.indexOf(before) : -1;
    if (idx < 0) el.children.push(child);
    else el.children.splice(idx, 0, child);
    child.parentNode = el;
    child.parentElement = el;
    return child;
  };
  el.contains = function (node) {
    let n = node;
    while (n) {
      if (n === el) return true;
      n = n.parentNode;
    }
    return false;
  };
  el.matches = function (sel) { return matches(el, sel); };
  el.closest = function (sel) {
    let n = el;
    while (n && n.nodeType === 1) {
      if (matches(n, sel)) return n;
      n = n.parentNode;
    }
    return null;
  };
  el.querySelector = function (sel) {
    const all = el.querySelectorAll(sel);
    return all[0] || null;
  };
  el.querySelectorAll = function (sel) {
    const out = [];
    function walk(node) {
      node.children.forEach(function (child) {
        if (matches(child, sel)) out.push(child);
        walk(child);
      });
    }
    walk(el);
    return out;
  };
  el.getBoundingClientRect = function () {
    return Object.assign({}, el._rect);
  };
  el.addEventListener = function (type, fn, opts) {
    const cap = isCapture(opts);
    const bucket = el.listeners[cap ? 1 : 0];
    if (!bucket[type]) bucket[type] = [];
    bucket[type].push(fn);
  };
  el.removeEventListener = function (type, fn, opts) {
    const cap = isCapture(opts);
    const bucket = el.listeners[cap ? 1 : 0][type] || [];
    el.listeners[cap ? 1 : 0][type] = bucket.filter(function (f) { return f !== fn; });
  };
  el.setPointerCapture = function () {};
  el.releasePointerCapture = function () {};
  el.click = function () {
    dispatch(el, "click", { button: 0, bubbles: true, cancelable: true });
  };
  return el;
}

const byId = {};
const docEl = createEl("html", byId);
const body = createEl("body", byId);
docEl.appendChild(body);

const document = {
  nodeType: 9,
  body: body,
  documentElement: docEl,
  parentNode: null,
  children: [docEl],
  listeners: { 0: {}, 1: {} },
  getElementById: function (id) { return byId[id] || null; },
  createElement: function (tag) { return createEl(tag, byId); },
  querySelector: function (sel) { return body.querySelector(sel); },
  querySelectorAll: function (sel) { return body.querySelectorAll(sel); },
  addEventListener: function (type, fn, opts) {
    const cap = isCapture(opts);
    const bucket = document.listeners[cap ? 1 : 0];
    if (!bucket[type]) bucket[type] = [];
    bucket[type].push(fn);
  },
  removeEventListener: function (type, fn, opts) {
    const cap = isCapture(opts);
    const list = document.listeners[cap ? 1 : 0][type] || [];
    document.listeners[cap ? 1 : 0][type] = list.filter(function (f) { return f !== fn; });
  },
};

function pathOf(el) {
  const path = [];
  let n = el;
  while (n && n !== document) {
    path.push(n);
    n = n.parentNode;
  }
  path.push(document);
  return path;
}

function fire(node, type, ev, capture) {
  const list = (node.listeners && node.listeners[capture ? 1 : 0] && node.listeners[capture ? 1 : 0][type]) || [];
  list.forEach(function (fn) {
    if (ev._immediate) return;
    ev.currentTarget = node;
    fn.call(node, ev);
  });
}

function dispatch(target, type, props) {
  const ev = Object.assign({
    type: type,
    target: target,
    currentTarget: target,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 0,
    clientY: 0,
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

const tb = createEl("div", byId);
tb.setAttribute("id", "v3-tb-tools");
tb.classList.add("v3-toolbar");
tb.classList.add("is-vertical");
tb.setAttribute("data-cad-cols", "2");
tb._rect = { left: 0, top: 0, right: 112, bottom: 900, width: 112, height: 900 };
tb.offsetWidth = 112;

const cadBody = createEl("div", byId);
cadBody.setAttribute("id", "v3-cad-body");
cadBody.className = "v3-cad-body";
cadBody._rect = { left: 8, top: 40, right: 104, bottom: 880, width: 96, height: 840 };
tb.appendChild(cadBody);
body.appendChild(tb);

const mem = {};
const layoutState = {
  groups: {},
  toolbars: { tools: { cols: "2", mode: "dock", edge: "east" } },
  cadIcons: { order: [] },
};

const windowObj = {
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
  },
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: function (type, fn, opts) {
    document.addEventListener(type, fn, opts);
  },
  requestAnimationFrame: function (fn) { fn(); },
  cancelAnimationFrame: function () {},
  v3WorkspaceUi: {
    getState: function () { return layoutState; },
    patchState: function (partial) {
      Object.keys(partial || {}).forEach(function (k) { layoutState[k] = partial[k]; });
      return layoutState;
    },
    setGroupOpen: function () {},
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
  JSON: JSON,
  parseInt: parseInt,
  requestAnimationFrame: function (fn) { fn(); },
  setTimeout: function (fn) { fn(); },
  clearTimeout: function () {},
  MutationObserver: undefined,
  ResizeObserver: undefined,
};
sandbox.window.window = windowObj;
sandbox.window.document = document;
windowObj.document = document;

vm.runInNewContext(fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8"), sandbox);
layoutState.cadIcons = sandbox.window.v3LayoutStore.defaultCadIcons();
vm.runInNewContext(fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8"), sandbox);

const api = windowObj.v3CadToolbar;
ok("CADツールバーが起動する", !!(api && typeof api.getCadIconOrder === "function"));

const buttons = cadBody.querySelectorAll("[data-v3-cad-cmd]");
ok("アイコンが #v3-cad-body に描画される", buttons.length >= 4);

function placeBtn(btn, left, top) {
  btn._rect = { left: left, right: left + 44, top: top, bottom: top + 44, width: 44, height: 44 };
}

const placed = {
  select: [20, 50],
  beam: [20, 110],
  pole: [70, 110],
  leg: [20, 160],
  connect: [70, 160],
};
buttons.forEach(function (btn, i) {
  const cmd = btn.getAttribute("data-v3-cad-cmd");
  const pos = placed[cmd] || [20 + (i % 2) * 50, 210 + Math.floor(i / 2) * 50];
  placeBtn(btn, pos[0], pos[1]);
});

const origin = api.getCadIconOrder();
ok("初期順に beam と pole がある", origin.indexOf("beam") >= 0 && origin.indexOf("pole") > origin.indexOf("beam"));
ok("実ブラウザと同じ 2 列", tb.getAttribute("data-cad-cols") === "2");

const beam = byId["v3-cad-beam"];
const pole = byId["v3-cad-pole"];
ok("beam/pole ボタンが実DOMにある", !!(beam && pole && cadBody.contains(beam) && cadBody.contains(pole)));
ok("同一グループ内の同一行", beam.parentNode === pole.parentNode && beam._rect.top === pole._rect.top);

const icon = createEl("img", byId);
icon.className = "v3-cad-icon";
pole.appendChild(icon);

windowObj.__V3_TOOL_MODE__ = "beam";

const poleX = pole._rect.left + 22;
const poleY = pole._rect.top + 22;
const beamX = beam._rect.left + 10;
const beamY = beam._rect.top + 22;

dispatch(icon, "pointerdown", { clientX: poleX, clientY: poleY });
dispatch(icon, "pointermove", { clientX: poleX - 4, clientY: poleY });
ok("しきい値未満ではコマンド順が変わらない", api.getCadIconOrder().join(",") === origin.join(","));

dispatch(icon, "pointermove", { clientX: beamX, clientY: beamY });
dispatch(icon, "pointerup", { clientX: beamX, clientY: beamY });

const after = api.getCadIconOrder();
ok("2列同一行ドラッグで pole が beam の前へ移る", after.indexOf("pole") >= 0 && after.indexOf("pole") < after.indexOf("beam"), after.slice(0, 6).join(","));
ok("DOM順も pole が beam より前", (function () {
  const ids = pole.parentNode.querySelectorAll("[data-v3-cad-cmd]").map(function (el) {
    return el.getAttribute("data-v3-cad-cmd");
  });
  return ids.indexOf("pole") < ids.indexOf("beam");
})());
ok("ドラッグではコマンドを実行しない", windowObj.__V3_TOOL_MODE__ === "beam");
ok("並び順を保存する", layoutState.cadIcons && layoutState.cadIcons.order && layoutState.cadIcons.order.indexOf("pole") < layoutState.cadIcons.order.indexOf("beam"));

dispatch(pole, "pointerdown", { clientX: beamX, clientY: beamY });
dispatch(body, "pointermove", { clientX: 400, clientY: beamY + 80 });
dispatch(body, "pointerup", { clientX: 400, clientY: beamY + 80 });
ok("バーの外で離しても並びを破棄しない", api.getCadIconOrder().indexOf("pole") < api.getCadIconOrder().indexOf("beam"));

api.applyCadIcons(true);
placeBtn(beam, 20, 110);
placeBtn(pole, 70, 110);
ok("リセット後は beam が pole の前", api.getCadIconOrder().indexOf("beam") < api.getCadIconOrder().indexOf("pole"));

dispatch(pole, "pointerdown", { clientX: poleX, clientY: poleY });
dispatch(pole, "pointermove", { clientX: beamX, clientY: beamY });
dispatch(pole, "pointercancel", { clientX: 400, clientY: beamY });
ok("pointercancel でも最後の挿入位置で確定する", api.getCadIconOrder().indexOf("pole") < api.getCadIconOrder().indexOf("beam"));

api.applyCadIcons(true);
placeBtn(beam, 20, 110);
placeBtn(pole, 70, 110);
dispatch(pole, "pointerdown", { clientX: poleX, clientY: poleY });
dispatch(pole, "pointermove", { clientX: beamX, clientY: beamY });
dispatch(document, "keydown", { key: "Escape" });
ok("Escape では元の順に戻る", api.getCadIconOrder().indexOf("beam") < api.getCadIconOrder().indexOf("pole"));

const selectBtn = byId["v3-cad-select"];
const beforeClick = api.getCadIconOrder().join(",");
dispatch(selectBtn, "pointerdown", { clientX: 40, clientY: selectBtn._rect.top + 10 });
dispatch(selectBtn, "pointerup", { clientX: 40, clientY: selectBtn._rect.top + 10 });
dispatch(selectBtn, "click", { clientX: 40, clientY: selectBtn._rect.top + 10 });
ok("移動なしクリックはコマンド実行", windowObj.__V3_TOOL_MODE__ === "select");
ok("クリックだけでは並びが変わらない", api.getCadIconOrder().join(",") === beforeClick);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
