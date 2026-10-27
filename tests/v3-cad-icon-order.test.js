"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const storeSrc = fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8");
const cadSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const northSrc = fs.readFileSync(path.join(root, "js/ui/v3-north.js"), "utf8");
const workspaceSrc = fs.readFileSync(path.join(root, "js/ui/v3-workspace-ui.js"), "utf8");

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

ok("cadIcons APIがある", !!(store && store.mergeCadIconOrder && store.DEFAULT_CAD_ICONS && store.defaultCadIcons));
ok("defaultState に cadIcons", store.defaultState().cadIcons.order.join(",") === store.DEFAULT_CAD_ICONS.join(","));
ok("古い保存は初期順", store.sanitize({ v: 1 }).cadIcons.order.join(",") === store.DEFAULT_CAD_ICONS.join(","));
ok("未知IDは捨てる", store.mergeCadIconOrder(["settings", "nope", "beam"])[0] === "settings");
ok("欠落IDは末尾補完", store.mergeCadIconOrder(["settings"]).indexOf("beam") >= 0 && store.mergeCadIconOrder(["settings"])[0] === "settings");
ok("重複は一度だけ", store.mergeCadIconOrder(["beam", "beam", "pole"]).filter(function (id) { return id === "beam"; }).length === 1);

const saved = store.sanitize({ v: 1, cadIcons: { order: ["settings", "beam"] } });
store.save(saved);
ok("保存後に復元", store.load().cadIcons.order[0] === "settings" && store.load().cadIcons.order[1] === "beam");
ok("reset でCAD順も初期化", store.reset().cadIcons.order.join(",") === store.DEFAULT_CAD_ICONS.join(","));

ok("CADはグループを維持して並べる", cadSrc.indexOf("applyCadOrder") >= 0 && cadSrc.indexOf(".v3-cad-group") >= 0);
ok("CADドラッグは本体だけ", cadSrc.indexOf('closest("[data-v3-cad-cmd]")') >= 0 && cadSrc.indexOf("body.contains(unit)") >= 0);
ok("狭いバーの外側でも最後の挿入位置を使う", cadSrc.indexOf("lastInsideX") >= 0 && cadSrc.indexOf("pointNearCadToolbar") >= 0);
ok("グリップは並び替え対象外", cadSrc.indexOf('.v3-tb-grip') >= 0 && cadSrc.indexOf("v3-cad-group-head") >= 0);
ok("ツールバー間移動をしない", cadSrc.indexOf("v3-north-sort") < 0 && northSrc.indexOf("v3-cad-body") < 0);
ok("縦横で挿入位置を変える", cadSrc.indexOf("isToolbarVertical") >= 0 && cadSrc.indexOf("headerInsertIndex") >= 0);
ok("挿入線がある", cadSrc.indexOf("v3-cad-insert") >= 0 && indexSrc.indexOf(".v3-cad-insert") >= 0);
ok("クリック誤発火を抑制", cadSrc.indexOf("armCadClickShield") >= 0 && cadSrc.indexOf("CAD_DRAG_SLOP") >= 0);
ok("Escape は元の順", cadSrc.indexOf("originOrder") >= 0 && cadSrc.indexOf('ev.key !== "Escape"') >= 0);
ok("uiLayout に保存", cadSrc.indexOf("cadIcons") >= 0 && cadSrc.indexOf("patchState") >= 0);
ok("レイアウト初期化で戻す", workspaceSrc.indexOf("applyCadIcons") >= 0 && cadSrc.indexOf("v3-layout-reset") >= 0);
ok("ドッキング処理を残す", workspaceSrc.indexOf("bindToolbarDrag") >= 0 && indexSrc.indexOf("v3-tb-grip") >= 0);
ok("ヘッダー並び替えを残す", northSrc.indexOf("bindHeaderReorder") >= 0);
ok("キャッシュバンプ", indexSrc.indexOf("v3-cad-toolbar.js?v=20261027-pub3") >= 0 && indexSrc.indexOf("v3-layout-store.js?v=20261027-pub1") >= 0);
ok("pointercancel では並びを破棄しない", /pointercancel[\s\S]{0,280}endCadDrag\(ev, false\)/.test(cadSrc));

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
