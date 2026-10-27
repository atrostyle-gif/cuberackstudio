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

const catalogSrc = fs.readFileSync(path.join(root, "js/data/parts-catalog.js"), "utf8");
const loaderSrc = fs.readFileSync(path.join(root, "js/data/price-loader.js"), "utf8");
const orderSrc = fs.readFileSync(path.join(root, "js/app/order-pricing.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-estimate-panel.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin-pricing-9fd83.html"), "utf8");
const estHtml = fs.readFileSync(path.join(root, "estimate.html"), "utf8");
const adminMenuSrc = fs.readFileSync(path.join(root, "js/ui/admin-menu.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

ok("一般モードはスイッチ非表示", panelSrc.indexOf("isCubeRackStaffMode") >= 0 && panelSrc.indexOf('addSeg("wholesale", "卸価格")') >= 0 && panelSrc.indexOf("if (isStaff())") >= 0);
ok("STAFFは通常価格／卸価格スイッチ", panelSrc.indexOf('"通常価格"') >= 0 && panelSrc.indexOf('"卸価格"') >= 0 && panelSrc.indexOf("v3-est-price-switch") >= 0);
ok("適用ボタンを置かない", panelSrc.indexOf("卸価格適用") < 0 && panelSrc.indexOf("通常価格に戻す") < 0);
ok("未登録警告は指定文のみ", panelSrc.indexOf("部材単価が登録されていません") >= 0 && panelSrc.indexOf("以下の部材に卸価格が登録されていません。") < 0);
ok("未登録単価は赤表示", panelSrc.indexOf('td("未登録", "num is-unregistered")') >= 0 && panelSrc.indexOf('td("—", "num")') >= 0);
ok("未登録時の合計は算出不可", panelSrc.indexOf("算出不可") >= 0 && estSrc.indexOf("合計：算出不可") >= 0);
ok("不完全合計を金額として持たない", estSrc.indexOf("currentEstimateIncomplete") >= 0 && estSrc.indexOf("currentEstimateTotal = incomplete ? null") >= 0);
ok("未登録でも切替可", estSrc.indexOf('reason: "unregistered"') < 0 && /function setEstimatePriceMode[\s\S]{0,600}__ESTIMATE_PRICE_MODE__ = next/.test(estSrc));
ok("payload に priceMode", estSrc.indexOf("priceMode: priceMode") >= 0 && estSrc.indexOf("parts: partsWithMaterial") >= 0);
ok("旧payloadは通常扱い", estHtml.indexOf('data.priceMode === "wholesale" ? "wholesale" : "retail"') >= 0);
ok("印刷は価格読込完了を待つ", estHtml.indexOf("await window.loadPriceCatalog()") >= 0);
ok("印刷は卸を通常で代用しない", estHtml.indexOf("estimatePriceMode === \"wholesale\"") >= 0 && estHtml.indexOf("priced.registered") >= 0);
ok("未登録時は印刷不可", estSrc.indexOf("hasIncompleteEstimatePrices") >= 0 && estSrc.indexOf("syncEstimatePrintButton") >= 0 && estHtml.indexOf("setPrintEnabled(false)") >= 0);
ok("印刷画面も未登録を検出", estHtml.indexOf("markUnregistered") >= 0 && estHtml.indexOf("算出不可") >= 0 && estHtml.indexOf("以下の部材に卸価格が登録されていません。") < 0);
ok("STAFF終了で通常価格へ", adminMenuSrc.indexOf("cuberack:staff-mode-disabled") >= 0 && estSrc.indexOf("cuberack:staff-mode-disabled") >= 0);
ok("新規設計で通常価格へ", mainSrc.indexOf("resetEstimatePriceMode") >= 0);
ok("キー列を出さない", adminHtml.indexOf(">キー<") < 0 && adminHtml.indexOf("部材名") >= 0 && adminHtml.indexOf('data-key="${k}"') >= 0);
ok("価格入力は右揃え", adminHtml.indexOf("text-align: right") >= 0);
ok("2段見出しを維持", adminHtml.indexOf('colspan="2" class="mat-head mat-g">IRON') >= 0);
ok("保存RPCは従来", adminHtml.indexOf("savePriceCatalog") >= 0);
ok("CADヘッダーも算出不可", fs.readFileSync(path.join(root, "js/ui/v3-north.js"), "utf8").indexOf("合計 算出不可") >= 0);
ok("キャッシュバンプ", indexSrc.indexOf("estimate.js?v=20261027-sku1") >= 0 && indexSrc.indexOf("v3-estimate-panel.js?v=20261027-sku1") >= 0);

class CustomEvent {
  constructor(name, init) {
    this.type = name;
    this.detail = init && init.detail;
  }
}

const windowObj = {
  dispatchEvent: function () {},
  addEventListener: function () {},
  PRICING_CONFIG: {},
  normalizeMaterial: function (m) {
    const s = String(m || "IRON").toUpperCase().trim();
    if (s === "BRASS" || s === "BS") return "BS";
    if (s === "SUS") return "SUS";
    return "IRON";
  },
};
const sandbox = {
  window: windowObj,
  console: console,
  Math: Math,
  Number: Number,
  String: String,
  JSON: JSON,
  Object: Object,
  Array: Array,
  CustomEvent: CustomEvent,
  localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
};
vm.runInNewContext(catalogSrc + "\n" + orderSrc + "\n" + loaderSrc, sandbox);

windowObj.applyPriceCatalog({
  ironPriceUnified: true,
  partWholesaleByMaterial: {
    jointBall: { IRON: 480, BS: 0 },
    beam_600: { BS: 1800 },
  },
  scaffoldBoardWholesalePrices: { "100×200": 900 },
});

const price = windowObj.pricePartForEstimate;
const missing = windowObj.listUnregisteredWholesale;
const calc = windowObj.calcOrderTotal;
const line = windowObj.priceOrderLineFromKey;

ok("通常価格 jointBall IRON", price("jointBall", "IRON", 2, "retail").unitPrice === 600 && price("jointBall", "IRON", 2, "retail").sub === 1200);
ok("卸単価・小計が正しい", price("jointBall", "IRON", 2, "wholesale").unitPrice === 480 && price("jointBall", "IRON", 2, "wholesale").sub === 960);
ok("卸0円を適用できる", price("jointBall", "BS", 3, "wholesale").registered && price("jointBall", "BS", 3, "wholesale").unitPrice === 0 && price("jointBall", "BS", 3, "wholesale").sub === 0);
ok("未登録は通常で代用しない", price("jointBall", "SUS", 1, "wholesale").registered === false && price("jointBall", "SUS", 1, "wholesale").unitPrice === null);
ok("棚板卸", price("shelfBoard_100x200", "足場板", 1, "wholesale").unitPrice === 900);
ok("オーダーはモードによらず同額", price("beam_custom_IRON_450", "IRON", 2, "retail").sub === 6570 && price("beam_custom_IRON_450", "IRON", 2, "wholesale").sub === 6570);
ok("CAD/印刷ヘルパも同額", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570 && line("beam_custom_IRON_450", "IRON", 2).total === 6570);

const miss = missing([
  { key: "jointBall", material: "IRON", qty: 1 },
  { key: "jointBall", material: "SUS", qty: 2 },
  { key: "beam_600", material: "BS", qty: 1 },
  { key: "beam_custom_IRON_450", material: "IRON", qty: 2 },
  { key: "beam_200", material: "IRON", qty: 1 },
]);
ok("未登録部材を検出できる", miss.some(function (m) { return m.key === "jointBall" && String(m.material).toUpperCase() === "SUS"; }));
ok("登録済みは未登録一覧に出ない", !miss.some(function (m) { return m.key === "jointBall" && String(m.material).toUpperCase() === "IRON"; }));
ok("オーダー品は未登録チェックから除外", !miss.some(function (m) { return String(m.key).indexOf("custom") >= 0; }));
ok("未登録ラベルがある", miss.some(function (m) { return String(m.label).indexOf("SUS") >= 0; }));

const allRegistered = missing([
  { key: "jointBall", material: "IRON", qty: 1 },
  { key: "beam_custom_IRON_450", material: "IRON", qty: 2 },
]);
ok("全登録なら未登録なし", allRegistered.length === 0);
ok("未登録単価は0にしない", price("jointBall", "SUS", 1, "wholesale").unitPrice === null && price("jointBall", "SUS", 1, "wholesale").sub === null);

function aggregate(parts, mode) {
  let total = 0;
  let incomplete = false;
  const lines = (parts || []).map(function (p) {
    const priced = price(p.key, p.material, p.qty, mode);
    if (priced && priced.registered) {
      total += Number(priced.sub);
      return { registered: true, unitPrice: priced.unitPrice, sub: priced.sub };
    }
    incomplete = true;
    return { registered: false, unitPrice: null, sub: null };
  });
  return { total: incomplete ? null : total, incomplete: incomplete, lines: lines };
}

const mixed = aggregate([
  { key: "jointBall", material: "IRON", qty: 2 },
  { key: "jointBall", material: "SUS", qty: 1 },
], "wholesale");
ok("混在時は合計を金額にしない", mixed.incomplete && mixed.total === null);
ok("登録済み行は単価を残す", mixed.lines[0].unitPrice === 480 && mixed.lines[0].sub === 960);
ok("未登録行は単価null", mixed.lines[1].registered === false && mixed.lines[1].unitPrice === null);

const zeroOk = aggregate([{ key: "jointBall", material: "BS", qty: 3 }], "wholesale");
ok("0円登録は算出可", zeroOk.incomplete === false && zeroOk.total === 0 && zeroOk.lines[0].unitPrice === 0);

const retailBack = aggregate([
  { key: "jointBall", material: "IRON", qty: 2 },
  { key: "jointBall", material: "SUS", qty: 1 },
], "retail");
ok("通常価格へ戻すと合計が戻る", retailBack.incomplete === false && retailBack.total === price("jointBall", "IRON", 2, "retail").sub + price("jointBall", "SUS", 1, "retail").sub);

const orderBoth = aggregate([{ key: "beam_custom_IRON_450", material: "IRON", qty: 2 }], "wholesale");
const orderRetail = aggregate([{ key: "beam_custom_IRON_450", material: "IRON", qty: 2 }], "retail");
ok("オーダー品は両モード同額", orderBoth.total === orderRetail.total && orderBoth.total === 6570);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
