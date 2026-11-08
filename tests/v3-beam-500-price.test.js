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
const adminHtml = fs.readFileSync(path.join(root, "admin-pricing-9fd83.html"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const stateSrc = fs.readFileSync(path.join(root, "js/state/state.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");

ok("CADプリセットに500mmがある", /BEAM_LENGTH_OPTIONS\s*=\s*\[[^\]]*500/.test(stateSrc));
ok("見積は beam_${len} キーを使う", estSrc.indexOf("const key = `beam_${len}`") >= 0);
ok("コアキーに beam_500 がある", loaderSrc.indexOf('"beam_400", "beam_500", "beam_600"') >= 0);
ok("価格管理がコアキーを表に出す", adminHtml.indexOf("CORE_PRICE_PART_KEYS") >= 0 && adminHtml.indexOf("ensureCorePriceParts") >= 0);
ok("空欄は未設定と表示する", adminHtml.indexOf('placeholder="未設定"') >= 0 && adminHtml.indexOf("空欄は未設定です") >= 0);
ok("補間しない注記がある", adminHtml.indexOf("400mm と 600mm から補間しません") >= 0);
ok("空欄小売は削除して未設定にする", adminHtml.indexOf("delete catalog.partPriceByMaterial[key][mat]") >= 0);
ok("キャッシュバンプ", indexSrc.indexOf("parts-catalog.js?v=20261109-beam500") >= 0 && indexSrc.indexOf("price-loader.js?v=20261109-beam500") >= 0 && adminHtml.indexOf("parts-catalog.js?v=20261109-beam500") >= 0 && adminHtml.indexOf("price-loader.js?v=20261109-beam500") >= 0);

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

const sorted = windowObj.sortPriceCatalogKeys(["beam_600", "beam_400", "beam_500", "jointBall"]);
ok("表示順は Beam_400 → Beam_500 → Beam_600", sorted.indexOf("beam_400") < sorted.indexOf("beam_500") && sorted.indexOf("beam_500") < sorted.indexOf("beam_600"));

ok("バンドル IRON は確定850", windowObj.PART_PRICE_BY_MATERIAL.beam_500.IRON === 850);
ok("バンドルは BS/SUS を確定登録しない", windowObj.PART_PRICE_BY_MATERIAL.beam_500.BS === undefined && windowObj.PART_PRICE_BY_MATERIAL.beam_500.SUS === undefined);
ok("参考値は 1790/1385", windowObj.BEAM_500_REFERENCE_PRICES.BS === 1790 && windowObj.BEAM_500_REFERENCE_PRICES.SUS === 1385);

const iron = windowObj.pricePartForEstimate("beam_500", "IRON", 2, "retail");
ok("IRON Beam_500 は850円×数量", iron.registered === true && iron.unitPrice === 850 && iron.sub === 1700);

const bsMissing = windowObj.pricePartForEstimate("beam_500", "BS", 1, "retail");
ok("未設定BSは見積に0円計上しない", bsMissing.registered === false && bsMissing.unitPrice === null && bsMissing.sub === null);

const susMissing = windowObj.pricePartForEstimate("beam_500", "SUS", 3, "retail");
ok("未設定SUSは見積に0円計上しない", susMissing.registered === false && susMissing.unitPrice === null && susMissing.sub === null);

const beam400Before = JSON.parse(JSON.stringify(windowObj.PART_PRICE_BY_MATERIAL.beam_400));
const beam600Before = JSON.parse(JSON.stringify(windowObj.PART_PRICE_BY_MATERIAL.beam_600));

const remoteLike = {
  ironPriceUnified: true,
  partsCatalog: {
    beam_400: { label: "Beam_400", unitPrice: 780, unitWeightG: 425.1 },
    beam_600: { label: "Beam_600", unitPrice: 920, unitWeightG: 642.9 },
  },
  partPriceByMaterial: {
    beam_400: { IRON: 780, BS: 1380, SUS: 1380 },
    beam_600: { IRON: 920, BS: 2200, SUS: 1800 },
  },
  partWholesaleByMaterial: {
    beam_400: { IRON: 550 },
    beam_600: { IRON: 640 },
  },
};

const ensured = windowObj.ensureCorePriceParts(JSON.parse(JSON.stringify(remoteLike)));
const keys = windowObj.sortPriceCatalogKeys(Object.keys(ensured.partPriceByMaterial));
ok("ensure 後に Beam_500 行がある", !!ensured.partPriceByMaterial.beam_500 && !!ensured.partsCatalog.beam_500);
ok("ensure 後の順も 400,500,600", keys.indexOf("beam_400") < keys.indexOf("beam_500") && keys.indexOf("beam_500") < keys.indexOf("beam_600"));
ok("ensure は IRON850 を入れる", ensured.partPriceByMaterial.beam_500.IRON === 850);
ok("ensure は BS/SUS を補間しない", ensured.partPriceByMaterial.beam_500.BS === undefined && ensured.partPriceByMaterial.beam_500.SUS === undefined);
ok("ensure は 400/600 を変えない",
  ensured.partPriceByMaterial.beam_400.IRON === 780 &&
  ensured.partPriceByMaterial.beam_400.BS === 1380 &&
  ensured.partPriceByMaterial.beam_600.IRON === 920 &&
  ensured.partPriceByMaterial.beam_600.SUS === 1800
);
ok("ensure は他BEAMの卸を変えない", ensured.partWholesaleByMaterial.beam_400.IRON === 550 && ensured.partWholesaleByMaterial.beam_600.IRON === 640);
ok("ラベルは Beam_500", ensured.partsCatalog.beam_500.label === "Beam_500");

const skewed = windowObj.ensureCorePriceParts({
  ironPriceUnified: true,
  partsCatalog: {
    beam_400: { label: "Beam_400", unitPrice: 100, unitWeightG: 425.1 },
    beam_600: { label: "Beam_600", unitPrice: 900, unitWeightG: 642.9 },
  },
  partPriceByMaterial: {
    beam_400: { IRON: 100, BS: 1380, SUS: 1380 },
    beam_600: { IRON: 900, BS: 2200, SUS: 1800 },
  },
});
ok("IRON は400/600から補間しない", skewed.partPriceByMaterial.beam_500.IRON === 850 && skewed.partPriceByMaterial.beam_500.BS === undefined);

windowObj.applyPriceCatalog(JSON.parse(JSON.stringify(remoteLike)));
ok("リモート適用後も他BEAMはリモート値", windowObj.PART_PRICE_BY_MATERIAL.beam_400.IRON === 780 && windowObj.PART_PRICE_BY_MATERIAL.beam_600.IRON === 920);
ok("リモートに無い Beam_500 IRON はバンドル確定値", windowObj.PART_PRICE_BY_MATERIAL.beam_500.IRON === 850);
ok("リモート適用でも BS は未設定のまま", windowObj.pricePartForEstimate("beam_500", "BS", 1, "retail").registered === false);

windowObj.applyPriceCatalog({
  ironPriceUnified: true,
  partsCatalog: { beam_500: { label: "Beam_500", unitPrice: 850, unitWeightG: 537.4 } },
  partPriceByMaterial: { beam_500: { IRON: 850, BS: 1790, SUS: 1385 } },
});
const registeredBs = windowObj.pricePartForEstimate("beam_500", "BS", 2, "retail");
const registeredSus = windowObj.pricePartForEstimate("beam_500", "SUS", 1, "retail");
ok("STAFF登録後のBSは見積に反映", registeredBs.registered === true && registeredBs.unitPrice === 1790 && registeredBs.sub === 3580);
ok("STAFF登録後のSUSは見積に反映", registeredSus.registered === true && registeredSus.unitPrice === 1385);
ok("登録後も他BEAMは維持", windowObj.PART_PRICE_BY_MATERIAL.beam_400.IRON === 780 && windowObj.PART_PRICE_BY_MATERIAL.beam_600.IRON === 920);

ok("既存400のバンドル初期値を破壊していない（テスト前スナップショット）", beam400Before.IRON === 680 && beam600Before.IRON === 800);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
