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

const adminHtml = fs.readFileSync(path.join(root, "admin-pricing-9fd83.html"), "utf8");
const adminMenuSrc = fs.readFileSync(path.join(root, "js/ui/admin-menu.js"), "utf8");
const loaderSrc = fs.readFileSync(path.join(root, "js/data/price-loader.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogSrc = fs.readFileSync(path.join(root, "js/data/parts-catalog.js"), "utf8");
const orderSrc = fs.readFileSync(path.join(root, "js/app/order-pricing.js"), "utf8");

ok("価格管理にCADに戻るがある", adminHtml.indexOf('id="btnBackCad"') >= 0 && adminHtml.indexOf(">CADに戻る<") >= 0);
ok("ログイン画面からも戻れる", adminHtml.indexOf('id="btnBackCadLogin"') >= 0);
ok("未保存は確認してから戻る", adminHtml.indexOf("未保存の価格変更があります。破棄してCADに戻りますか？") >= 0);
ok("beforeunloadで未保存を守る", adminHtml.indexOf("beforeunload") >= 0);
ok("openerがあれば閉じる", adminHtml.indexOf("window.opener.focus") >= 0 && adminHtml.indexOf("window.close()") >= 0);
ok("履歴があればback", adminHtml.indexOf("history.back()") >= 0);
ok("同一タブのindexへは飛ばない", adminHtml.indexOf("returnToCad") >= 0 && !/function returnToCad[\s\S]{0,900}location\.(href|assign)/.test(adminHtml));
ok("保存後にCADへ通知", adminHtml.indexOf('notifyCad("cuberack:prices-saved")') >= 0);
ok("CADは別タブで価格管理を開く", adminMenuSrc.indexOf('global.open(pricingUrl, "cuberack-price-admin")') >= 0);
ok("ポップアップ拒否かつ未保存なら遷移しない", adminMenuSrc.indexOf("未保存のデザインを残したまま価格管理を開けません") >= 0);
ok("最新取得はstaleを使わない", loaderSrc.indexOf("allowStale") >= 0 && loaderSrc.indexOf("staleApplied: false") >= 0);
ok("refreshPriceCatalogがある", loaderSrc.indexOf("window.refreshPriceCatalog = refreshPriceCatalog") >= 0);
ok("pageshowで再取得", estSrc.indexOf('ev.persisted') >= 0 && estSrc.indexOf("refreshEstimatePrices") >= 0);
ok("失敗時に再試行ボタン", estSrc.indexOf("v3-price-refresh-retry") >= 0 && estSrc.indexOf("最新の価格を取得できませんでした。") >= 0);
ok("価格更新で見積を再計算", estSrc.indexOf("cuberack:prices-loaded") >= 0 && estSrc.indexOf("calcAndRenderEstimate") >= 0);
ok("再取得で価格区分をリセットしない", (function () {
  const start = estSrc.indexOf("window.refreshEstimatePrices = async function");
  const end = estSrc.indexOf("cuberack:staff-mode-disabled");
  return start >= 0 && end > start && estSrc.slice(start, end).indexOf("resetEstimatePriceMode") < 0;
})());
ok("postMessageをorigin検査", estSrc.indexOf("ev.origin !== window.location.origin") >= 0);
ok("キャッシュバンプ", indexSrc.indexOf("price-loader.js?v=20261027-pub1") >= 0 && indexSrc.indexOf("admin-menu.js?v=20261027-pub1") >= 0);

class CustomEvent {
  constructor(name, init) {
    this.type = name;
    this.detail = init && init.detail;
  }
}

const mem = {};
const windowObj = {
  PRICING_CONFIG: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "anon" },
  dispatchEvent: function (ev) { this._events = this._events || []; this._events.push(ev); },
  addEventListener: function () {},
  PARTS_CATALOG: { jointBall: { unitPrice: 600, label: "JB" } },
  PART_PRICE_BY_MATERIAL: { jointBall: { IRON: 600 } },
  PARTS_WHOLESALE: {},
  PART_WHOLESALE_BY_MATERIAL: {},
};
const sandbox = {
  window: windowObj,
  console: console,
  Math: Math,
  Date: Date,
  Number: Number,
  String: String,
  JSON: JSON,
  Object: Object,
  Array: Array,
  Set: Set,
  Promise: Promise,
  CustomEvent: CustomEvent,
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
  },
};
sandbox.window.localStorage = sandbox.localStorage;
vm.runInNewContext(catalogSrc + "\n" + orderSrc + "\n" + loaderSrc, sandbox);

mem.cuberack_price_catalog_v1 = JSON.stringify({
  fetchedAt: Date.now(),
  data: { partsCatalog: { jointBall: { unitPrice: 1 } } },
});

windowObj.fetchRemoteCatalog = function () {
  return Promise.reject(new Error("network"));
};

Promise.resolve(windowObj.loadPriceCatalog({
  force: true,
  skipCache: true,
  allowStale: false,
})).then(function (result) {
  ok("失敗時はok=false", result && result.ok === false && result.source === "error");
  ok("失敗時に古い価格を適用しない", windowObj.PARTS_CATALOG.jointBall.unitPrice === 600);
  ok("失敗メタはstaleApplied false", windowObj.__PRICE_CATALOG_META__ && windowObj.__PRICE_CATALOG_META__.staleApplied === false);

  windowObj.fetchRemoteCatalog = function () {
    return Promise.resolve({
      partsCatalog: { jointBall: { unitPrice: 777, label: "JB" } },
      partPriceByMaterial: { jointBall: { IRON: 777 } },
    });
  };
  return windowObj.refreshPriceCatalog();
}).then(function (okResult) {
  ok("再試行成功はremote", okResult && okResult.ok === true && okResult.source === "remote");
  ok("成功時はカタログを適用", windowObj.PARTS_CATALOG.jointBall.unitPrice === 777);

  console.log("");
  console.log("passed=" + passed + " failed=" + failed.length);
  if (failed.length) {
    failed.forEach(function (f) { console.log(" - " + f); });
    process.exit(1);
  }
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
