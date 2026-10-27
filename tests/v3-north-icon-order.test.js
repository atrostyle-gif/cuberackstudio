"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const northSrc = fs.readFileSync(path.join(root, "js/ui/v3-north.js"), "utf8");
const storeSrc = fs.readFileSync(path.join(root, "js/ui/v3-layout-store.js"), "utf8");
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

ok("layout-store が headerIcons API を公開", !!(store && store.mergeHeaderIconOrder && store.headerInsertIndex && store.DEFAULT_HEADER_ICONS));
ok("標準並びは12スロット", store.DEFAULT_HEADER_ICONS.length === 12);
ok("標準並びに gap と機能IDが含まれる", store.DEFAULT_HEADER_ICONS.join(",") === "new,open,save,save-as,undo,redo,gap,view,more,staff,legacy,version");

ok("不正配列は標準へ", store.mergeHeaderIconOrder(null).join(",") === store.DEFAULT_HEADER_ICONS.join(","));
ok("空配列は標準へ（欠落を末尾補完）", store.mergeHeaderIconOrder([]).join(",") === store.DEFAULT_HEADER_ICONS.join(","));
ok("未知IDは無視", store.mergeHeaderIconOrder(["view", "ghost", "open"]).indexOf("ghost") < 0);
ok("未知IDを除いて先頭維持", store.mergeHeaderIconOrder(["view", "ghost", "open"])[0] === "view");
ok("欠落した新規は開くの左へ", (function () {
  const order = store.mergeHeaderIconOrder(["view", "ghost", "open"]);
  return order.indexOf("new") === order.indexOf("open") - 1;
})());
ok("重複IDは一度だけ", store.mergeHeaderIconOrder(["view", "view", "open"]).filter(function (id) { return id === "view"; }).length === 1);
ok("新アイコンは末尾追加", store.mergeHeaderIconOrder(["open"], ["open", "future"])[1] === "future");
ok("欠落IDは標準順で補完", store.mergeHeaderIconOrder(["more"]).indexOf("open") >= 0 && store.mergeHeaderIconOrder(["more"])[0] === "more");

const def = store.defaultState();
ok("defaultState に headerIcons", def.headerIcons && def.headerIcons.order.join(",") === store.DEFAULT_HEADER_ICONS.join(","));

ok("sanitize 不正 headerIcons → 標準", store.sanitize({ v: 1, headerIcons: "nope" }).headerIcons.order.join(",") === store.DEFAULT_HEADER_ICONS.join(","));
ok("sanitize 配列直置きは標準", store.sanitize({ v: 1, headerIcons: ["open"] }).headerIcons.order.join(",") === store.DEFAULT_HEADER_ICONS.join(","));
ok("sanitize 未知ID除去", store.sanitize({ v: 1, headerIcons: { order: ["view", "nope", "open"] } }).headerIcons.order[0] === "view");
ok("旧estimate/fileは破棄して補完", store.mergeHeaderIconOrder(["open", "estimate", "file", "view"]).indexOf("estimate") < 0 && store.mergeHeaderIconOrder(["open", "estimate", "file", "view"]).indexOf("file") < 0 && store.mergeHeaderIconOrder(["open", "estimate", "file", "view"]).indexOf("new") >= 0);
ok("旧並びの新規は開くの左", (function () {
  const order = store.mergeHeaderIconOrder(["open", "save", "save-as", "undo", "redo", "gap", "view", "more", "staff", "legacy", "version"]);
  return order[0] === "new" && order[1] === "open";
})());
ok("末尾補完の新規を開くの左へ移行", (function () {
  const order = store.migrateHeaderIconOrder(["open", "save", "undo", "redo", "gap", "view", "more", "staff", "legacy", "version", "new"]);
  return order.indexOf("new") === order.indexOf("open") - 1 && order[0] === "new";
})());
ok("移行済みなら末尾の新規を維持", store.sanitize({ v: 1, headerIcons: { order: ["open", "save", "new"], fileOpsMigrated: true } }).headerIcons.order[2] === "new");
ok("未移行の末尾新規は開くの左へ", store.sanitize({ v: 1, headerIcons: { order: ["open", "save", "new"] } }).headerIcons.order[0] === "new" && store.sanitize({ v: 1, headerIcons: { order: ["open", "save", "new"] } }).headerIcons.order[1] === "open");
ok("sanitize 非JSON相当は default v", store.sanitize(null).headerIcons.order.join(",") === store.DEFAULT_HEADER_ICONS.join(","));

ctx.window.localStorage.setItem(store.KEY, "{not json");
ok("壊れた localStorage は標準", store.load().headerIcons.order.join(",") === store.DEFAULT_HEADER_ICONS.join(","));
delete mem[store.KEY];

const saved = store.sanitize({ v: 1, headerIcons: { order: ["more", "view"] } });
store.save(saved);
ok("保存後に復元", store.load().headerIcons.order[0] === "more" && store.load().headerIcons.order[1] === "view");
ok("reset で標準へ", store.reset().headerIcons.order.join(",") === store.DEFAULT_HEADER_ICONS.join(","));

ok("insertIndex 先頭", store.headerInsertIndex([10, 30, 50], 5) === 0);
ok("insertIndex 中間", store.headerInsertIndex([10, 30, 50], 31) === 2);
ok("insertIndex 末尾", store.headerInsertIndex([10, 30, 50], 80) === 3);
ok("insertIndex 空", store.headerInsertIndex([], 10) === 0);
ok("insertIndex 非数は0", store.headerInsertIndex([10], NaN) === 0);

ok("金額は並べ替え対象外", indexSrc.indexOf('id="v3-north-total"') >= 0 && /id="v3-north-total"[^>]*data-north-fixed="1"/.test(indexSrc));
ok("金額に data-north-id なし", !/id="v3-north-total"[^>]*data-north-id=/.test(indexSrc));
ok("アプリ名は sort 外", indexSrc.indexOf("v3-north-brand") < indexSrc.indexOf('id="v3-north-sort"'));
ok("見積単独アイコンは撤去", indexSrc.indexOf('id="v3-north-estimate"') < 0);
ok("合計は電卓と一体", /id="v3-north-total"[\s\S]{0,600}id="v3-north-total-text"/.test(indexSrc));
ok("表示は wrap ごと移動", /class="v3-north-menu-wrap" data-north-id="view"/.test(indexSrc));
ok("開くはボタンごと移動", /id="v3-north-open"[^>]*data-north-id="open"/.test(indexSrc));
ok("新規は1つだけ", (indexSrc.match(/id="v3-north-new"/g) || []).length === 1);
ok("フォルダメニューは撤去", indexSrc.indexOf('id="v3-north-file"') < 0 && indexSrc.indexOf('id="v3-north-file-menu"') < 0);
ok("その他は wrap ごと移動", /class="v3-north-menu-wrap" data-north-id="more"/.test(indexSrc));
ok("新規/開く/保存/Undo が対象", /data-north-id="new"/.test(indexSrc) && /data-north-id="open"/.test(indexSrc) && /data-north-id="save"/.test(indexSrc) && /data-north-id="undo"/.test(indexSrc));
ok("カラーチャートはヘッダー対象外", indexSrc.indexOf('id="v3-north-sort"') >= 0 && !/id="v3-north-sort"[\s\S]{0,4000}カラーチャート/.test(indexSrc));

ok("ドラッグ閾値あり", northSrc.indexOf("NORTH_DRAG_SLOP = 6") >= 0);
ok("クリックを阻害しないようcaptureは移動後", northSrc.indexOf("しきい値前に capture") >= 0);
ok("半透明ドラッグ", northSrc.indexOf("is-dragging") >= 0 && indexSrc.indexOf(".is-dragging") >= 0);
ok("挿入線", northSrc.indexOf("v3-north-insert") >= 0 && indexSrc.indexOf("background:#3b82f6") >= 0);
ok("ヘッダー外は元位置", northSrc.indexOf("pointInNorth") >= 0 && northSrc.indexOf("originOrder") >= 0);
ok("クリック誤発火を抑制", northSrc.indexOf("armClickShield") >= 0);
ok("マウスとタッチ", northSrc.indexOf("pointerdown") >= 0 && northSrc.indexOf('pointerType === "touch"') >= 0);
ok("UI初期化で並びを戻す", workspaceSrc.indexOf("v3NorthApplyHeaderIcons") >= 0 && northSrc.indexOf("v3-layout-reset") >= 0);
ok("既存フローティング初期化を維持", workspaceSrc.indexOf("applyToolbar()") >= 0 && workspaceSrc.indexOf('window.dispatchEvent(new CustomEvent("v3-layout-reset"))') >= 0);
ok("ヘッダー高さ維持", indexSrc.indexOf("--v3-north-h:48px") >= 0);
ok("狭い画面の hide-narrow 維持", indexSrc.indexOf("v3-hide-narrow") >= 0 && indexSrc.indexOf("@media (max-width: 900px)") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
