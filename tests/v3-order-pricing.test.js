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

const orderSrc = fs.readFileSync(path.join(root, "js/app/order-pricing.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
const estHtml = fs.readFileSync(path.join(root, "estimate.html"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin-pricing-9fd83.html"), "utf8");
const loaderSrc = fs.readFileSync(path.join(root, "js/data/price-loader.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const catalogSrc = fs.readFileSync(path.join(root, "js/data/parts-catalog.js"), "utf8");

ok("calcOrderTotal が正本", orderSrc.indexOf("function calcOrderTotal") >= 0);
ok("CUT/BUILD 境界は 800", orderSrc.indexOf("L <= 800") >= 0);
ok("セットアップ費デフォルト 3000/6000", orderSrc.indexOf("DEFAULT_SETUP_FEE_CUT = 3000") >= 0 && orderSrc.indexOf("DEFAULT_SETUP_FEE_BUILD = 6000") >= 0);
ok("setupFee を orderPricing に出す", orderSrc.indexOf("setupFeeCut") >= 0 && orderSrc.indexOf("setupFeeBuild") >= 0);
ok("不正なセットアップ費はデフォルトへ", orderSrc.indexOf("function parseSetupFee") >= 0 && orderSrc.indexOf("n < 0) return fallback") >= 0);
ok("CUT は材種別マスターを参照", orderSrc.indexOf("PART_PRICE_BY_MATERIAL") >= 0 && orderSrc.indexOf("function catalogCutPrice") >= 0);
ok("CAD見積は priceOrderLineFromKey", estSrc.indexOf("priceOrderLineFromKey") >= 0);
ok("印刷HTMLが order-pricing を読む", estHtml.indexOf("js/app/order-pricing.js") >= 0);
ok("印刷が calcOrderTotal を使う", estHtml.indexOf("priceOrderLineFromKey") >= 0);
ok("印刷から5000円按分を外した", estHtml.indexOf("ORDER_FEE_TOTAL_YEN") < 0 && estHtml.indexOf("_orderSurchargePerPiece") < 0);
ok("payload は parts+total のまま", estSrc.indexOf("buildDraftEstimatePayload") >= 0 && /return \{\s*parts: partsWithMaterial,\s*total:/.test(estSrc));
ok("管理画面にオーダー計算タブ", adminHtml.indexOf('data-tab="order"') >= 0 && adminHtml.indexOf("800mm以下 セットアップ費") >= 0);
ok("プレビュー入力がある", adminHtml.indexOf("order-preview-len") >= 0 && adminHtml.indexOf("calcOrderTotal") >= 0);
ok("保存は既存RPC", adminHtml.indexOf("savePriceCatalog") >= 0 && loaderSrc.indexOf("save_price_catalog") >= 0);
ok("export に setupFee を含める", loaderSrc.indexOf("exportOrderPricingSnapshot") >= 0 && orderSrc.indexOf("setupFeeCut: SETUP_FEE_CUT") >= 0);
ok("規格長さ配列は維持", orderSrc.indexOf("25, 50, 100, 150, 200, 300, 400, 500, 600, 800") >= 0);
ok("キャッシュ更新", indexSrc.indexOf("order-pricing.js?v=20261027-order1") >= 0 && indexSrc.indexOf("estimate.js?v=20261027-sku1") >= 0);
ok("オーダー計算エンジンに卸価格を持たせない", orderSrc.indexOf("wholesale") < 0);

const windowObj = {
  PART_PRICE_BY_MATERIAL: {
    beam_25: { IRON: 380, BS: 500, SUS: 580 },
    beam_50: { IRON: 420, BS: 570, SUS: 670 },
    beam_100: { IRON: 470, BS: 650, SUS: 730 },
    beam_150: { IRON: 470, BS: 790, SUS: 780 },
    beam_200: { IRON: 500, BS: 920, SUS: 830 },
    beam_300: { IRON: 580, BS: 1200, SUS: 1020 },
    beam_400: { IRON: 680, BS: 1380, SUS: 1200 },
    beam_500: { IRON: 850, BS: 1790, SUS: 1385 },
    beam_600: { IRON: 800, BS: 2200, SUS: 1570 },
    beam_800: { IRON: 930, BS: 2570, SUS: 2020 },
    pole_50: { IRON: 410, BS: 520, SUS: 600 },
    pole_100: { IRON: 470, BS: 580, SUS: 650 },
    pole_200: { IRON: 500, BS: 870, SUS: 830 },
    pole_300: { IRON: 580, BS: 1120, SUS: 1020 },
    pole_400: { IRON: 680, BS: 1380, SUS: 1200 },
    pole_500: { IRON: 750, BS: 1700, SUS: 1400 },
    pole_600: { IRON: 800, BS: 2020, SUS: 1570 },
    pole_800: { IRON: 930, BS: 2380, SUS: 1830 },
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
};
vm.runInNewContext(orderSrc, sandbox);

const calc = windowObj.calcOrderTotal;
const apply = windowObj.applyOrderPricingOverrides;
const exp = windowObj.exportOrderPricingSnapshot;
const line = windowObj.priceOrderLineFromKey;

ok("IRON Beam 450×2 = 6570", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570);
ok("BS Pole 180×1 = 4827", calc({ type: "POLE", material: "BS", lengthMm: 180, qty: 1 }).total === 4827);
ok("IRON Beam 1200×3 = 12948", calc({ type: "BEAM", material: "IRON", lengthMm: 1200, qty: 3 }).total === 12948);
ok("800mm は CUT", calc({ type: "POLE", material: "SUS", lengthMm: 800, qty: 4 }).mode === "CUT");
ok("801mm は BUILD", calc({ type: "POLE", material: "SUS", lengthMm: 801, qty: 4 }).mode === "BUILD");

apply({ setupFeeCut: 0, setupFeeBuild: 0, params: windowObj.DEFAULT_ORDER_PARAMS });
ok("セットアップ費0円を設定できる", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 3570 && calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).setupFee === 0);

apply({
  setupFeeCut: 3000,
  setupFeeBuild: 6000,
  params: {
    IRON: { BEAM: { A: 390.68, B: 0.6797, k_cut: 1, k_build: 1.92 } },
  },
});
ok("係数変更でCUT結果が変わる", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 4700);

apply({ setupFeeCut: -10, setupFeeBuild: "x" });
ok("不正値はデフォルトへ戻す", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).setupFee === 3000);

apply({
  setupFeeCut: 3000,
  setupFeeBuild: 6000,
  params: windowObj.DEFAULT_ORDER_PARAMS,
});
ok("デフォルト再適用で現行結果を維持", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570);

const snap = exp();
apply({ setupFeeCut: 100, setupFeeBuild: 200, params: windowObj.DEFAULT_ORDER_PARAMS });
apply(snap);
ok("保存スナップショット再読込で値が戻る", exp().setupFeeCut === snap.setupFeeCut && exp().setupFeeBuild === snap.setupFeeBuild);
ok("再読込後も 6570", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570);

const cad = line("beam_custom_IRON_450", "IRON", 2);
const print = line("beam_custom_IRON_450", "IRON", 2);
ok("CADと印刷ヘルパが同額", cad && print && cad.total === print.total && cad.total === 6570);
ok("旧キー beam_custom_450 も同じ", line("beam_custom_450", "IRON", 2).total === 6570);

windowObj.PART_PRICE_BY_MATERIAL.beam_500.IRON = 1000;
ok("CUTは材種別マスター変更に追従", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).stockPrice === 1000);
windowObj.PART_PRICE_BY_MATERIAL.beam_500.IRON = 850;
ok("規格単価を戻すと現行CUTに戻る", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570);

ok("getPartInfo の規格単価経路は残る", catalogSrc.indexOf("function resolveUnitPrice") >= 0 && catalogSrc.indexOf("PART_PRICE_BY_MATERIAL") >= 0);
ok("保存JSONに通常価格キーを残す", loaderSrc.indexOf("partsCatalog") >= 0 && loaderSrc.indexOf("partPriceByMaterial") >= 0 && loaderSrc.indexOf("scaffoldBoardPrices") >= 0);

const stockLens = [25, 50, 100, 150, 200, 300, 400, 500, 600, 800];
let mapped = true;
stockLens.forEach(function (len) {
  if (!windowObj.PART_PRICE_BY_MATERIAL["beam_" + len]) mapped = false;
});
[50, 100, 200, 300, 400, 500, 600, 800].forEach(function (len) {
  if (!windowObj.PART_PRICE_BY_MATERIAL["pole_" + len]) mapped = false;
});
ok("CUT規格長さは材種別キーに対応する", mapped);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
