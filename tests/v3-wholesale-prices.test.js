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
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
const estHtml = fs.readFileSync(path.join(root, "estimate.html"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

ok("卸価格フィールドを export する", loaderSrc.indexOf("partWholesaleByMaterial") >= 0 && loaderSrc.indexOf("partsWholesale") >= 0 && loaderSrc.indexOf("scaffoldBoardWholesalePrices") >= 0 && loaderSrc.indexOf("scaffoldPanelWholesalePrices") >= 0);
ok("apply が卸価格を読む", loaderSrc.indexOf("hadMatWholesale") >= 0 && loaderSrc.indexOf("partWholesaleByMaterial") >= 0);
ok("空欄と0を区別する parseWholesaleInput", loaderSrc.indexOf("function parseWholesaleInput") >= 0);
ok("getWholesalePrice がある", catalogSrc.indexOf("window.getWholesalePrice") >= 0);
ok("基本パーツタブを廃止", adminHtml.indexOf('data-tab="basic"') < 0 && adminHtml.indexOf(">基本パーツ<") < 0);
ok("棚板・壁板に卸価格列", adminHtml.indexOf("<th>通常価格</th><th>卸価格</th>") >= 0);
ok("材種別タブに卸列", adminHtml.indexOf("小売価格") >= 0 && adminHtml.indexOf("卸価格") >= 0 && adminHtml.indexOf('colspan="2"') >= 0);
ok("Aは入力不可", adminHtml.indexOf('data-order-field="A"') < 0 && adminHtml.indexOf("基本価格係数（A）") >= 0);
ok("Bは入力不可", adminHtml.indexOf('data-order-field="B"') < 0 && adminHtml.indexOf("長さ係数（B）") >= 0);
ok("倍率は編集可", adminHtml.indexOf('data-order-field="k_cut"') >= 0 && adminHtml.indexOf('data-order-field="k_build"') >= 0);
ok("800mm以下／801mm以上の表示", adminHtml.indexOf("800mm以下 セットアップ費") >= 0 && adminHtml.indexOf("801mm以上 セットアップ費") >= 0 && adminHtml.indexOf("適用区分") >= 0);
ok("保存時にA/Bを維持", adminHtml.indexOf("A: prevG.A") >= 0 && adminHtml.indexOf("B: prevG.B") >= 0);
ok("既存RPCのまま", adminHtml.indexOf("savePriceCatalog") >= 0 && loaderSrc.indexOf("save_price_catalog") >= 0);
ok("見積は共有ヘルパで卸を参照", estSrc.indexOf("pricePartForEstimate") >= 0);
ok("キャッシュバンプ", indexSrc.indexOf("price-loader.js?v=20261027-pub1") >= 0 && indexSrc.indexOf("parts-catalog.js?v=20261027-sku1") >= 0);

const orderFnStart = adminHtml.indexOf("function renderOrderTab");
const orderFnEnd = adminHtml.indexOf("function readOrderPricingFromDom");
const orderFn = orderFnStart >= 0 && orderFnEnd > orderFnStart
  ? adminHtml.slice(orderFnStart, orderFnEnd)
  : "";
ok("オーダー品に卸価格入力欄を作らない", orderFn.indexOf("input-wholesale") < 0 && orderFn.indexOf('data-field="wholesale"') < 0 && orderFn.indexOf("data-wholesale-mat") < 0);

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

const getInfo = windowObj.getPartInfo;
const getWs = windowObj.getWholesalePrice;
const apply = windowObj.applyPriceCatalog;
const exp = windowObj.exportPriceCatalogSnapshot;
const parseWs = windowObj.parseWholesaleInput;
const calc = windowObj.calcOrderTotal;
const line = windowObj.priceOrderLineFromKey;

const jointRetail = getInfo("jointBall", "IRON").unitPrice;
const beamRetail = getInfo("beam_200", "BS").unitPrice;
const boardRetail = getInfo("shelfBoard_100x200", "IRON").unitPrice;
const bracketRetail = getInfo("shelfBracket_100", "IRON").unitPrice;

ok("通常価格 jointBall IRON は 600", jointRetail === 600);
ok("通常価格 beam_200 BS は 920", beamRetail === 920);
ok("通常価格 棚板 100×200 は 1210", boardRetail === 1210);
ok("通常価格 棚受け 100 は 330", bracketRetail === 330);

ok("空欄は未登録", parseWs("").ok && parseWs("").registered === false && parseWs("").value === null);
ok("卸価格 0 円は有効", parseWs("0").ok && parseWs("0").registered === true && parseWs("0").value === 0);
ok("負数は保存不可", parseWs("-1").ok === false);
ok("非数は保存不可", parseWs("abc").ok === false);

ok("未登録は通常価格へフォールバックしない", getWs("jointBall", "IRON").registered === false && getWs("jointBall", "IRON").value === null);

apply({
  partsWholesale: { shelfBracket_100: 0, wallBracket_200: 500 },
  partWholesaleByMaterial: {
    jointBall: { IRON: 480, BS: 0 },
    beam_200: { BS: 700 },
    shelfBracket_100: { IRON: 0 },
    wallBracket_200: { IRON: 500 },
  },
  scaffoldBoardWholesalePrices: { "100×200": 900 },
  scaffoldPanelWholesalePrices: { "200×300": 0 },
});

ok("材質別卸を個別登録できる", getWs("jointBall", "IRON").registered && getWs("jointBall", "IRON").value === 480);
ok("材質別卸 0 円を登録できる", getWs("jointBall", "BS").registered && getWs("jointBall", "BS").value === 0);
ok("未登録材質は未登録のまま", getWs("jointBall", "SUS").registered === false);
ok("Beam 卸は材質別マスター", getWs("beam_200", "BS").source === "partWholesaleByMaterial" && getWs("beam_200", "BS").value === 700);
ok("棚板卸はサイズ表", getWs("shelfBoard_100x200").source === "scaffoldBoardWholesalePrices" && getWs("shelfBoard_100x200").value === 900);
ok("壁板卸 0 円", getWs("wallPanel_200x300").registered && getWs("wallPanel_200x300").value === 0);
ok("金物卸は材種別マスター", getWs("shelfBracket_100").source === "partWholesaleByMaterial" && getWs("shelfBracket_100").value === 0);
ok("オーダー品は対象外", getWs("beam_custom_IRON_450", "IRON").order === true && getWs("beam_custom_IRON_450", "IRON").registered === false);
ok("旧オーダーキーも対象外", getWs("beam_custom_450", "IRON").order === true);

windowObj.PARTS_WHOLESALE.beam_200 = 1;
ok("材質別部材を基本卸だけで処理しない", getWs("beam_200", "IRON").registered === false && getWs("beam_200", "IRON").source !== "partsWholesale");
delete windowObj.PARTS_WHOLESALE.beam_200;

ok("卸を入れても通常価格は変わらない", getInfo("jointBall", "IRON").unitPrice === jointRetail && getInfo("beam_200", "BS").unitPrice === beamRetail && getInfo("shelfBoard_100x200").unitPrice === boardRetail && getInfo("shelfBracket_100").unitPrice === bracketRetail);

const snap = exp();
ok("スナップショットに卸価格がある", snap.partsWholesale.shelfBracket_100 === 0 && snap.partWholesaleByMaterial.jointBall.IRON === 480 && snap.scaffoldBoardWholesalePrices["100×200"] === 900);
ok("スナップショットに通常価格がある", snap.partsCatalog.jointBall.unitPrice === 600 && snap.partPriceByMaterial.beam_200.BS === 920);

apply({
  partsWholesale: {},
  partWholesaleByMaterial: {},
  scaffoldBoardWholesalePrices: {},
  scaffoldPanelWholesalePrices: {},
});
ok("空カタログは未登録に戻る", getWs("jointBall", "IRON").registered === false);

apply(snap);
ok("保存・再読込で卸価格が保持される", getWs("jointBall", "IRON").value === 480 && getWs("jointBall", "BS").value === 0 && getWs("shelfBracket_100").value === 0 && getWs("shelfBoard_100x200").value === 900);

apply({
  partsCatalog: { jointBall: { label: "Joint Ball", unitPrice: 600 } },
  partPriceByMaterial: { jointBall: { IRON: 600, BS: 700, SUS: 730 } },
});
ok("古い価格JSON（卸なし）を読める", getInfo("jointBall", "IRON").unitPrice === 600);
ok("古いJSONでも直前の卸は残せる（フィールド未指定）", getWs("jointBall", "IRON").value === 480);

apply({
  partsCatalog: snap.partsCatalog,
  partPriceByMaterial: snap.partPriceByMaterial,
  partsWholesale: {},
  partWholesaleByMaterial: {},
  scaffoldBoardWholesalePrices: {},
  scaffoldPanelWholesalePrices: {},
});
ok("卸フィールド空の新JSONは未登録", getWs("jointBall", "IRON").registered === false);

apply(snap);
ok("再適用後も通常価格キーが残る", !!exp().partsCatalog.jointBall && !!exp().partPriceByMaterial.beam_200 && !!exp().scaffoldBoardPrices["100×200"]);

ok("CAD見積の計算を壊さない", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570);
ok("印刷ヘルパも同額", line("beam_custom_IRON_450", "IRON", 2).total === 6570);
ok("800mm は CUT", calc({ type: "BEAM", material: "IRON", lengthMm: 800, qty: 1 }).mode === "CUT");
ok("801mm は BUILD", calc({ type: "BEAM", material: "IRON", lengthMm: 801, qty: 1 }).mode === "BUILD");

const paramsBefore = JSON.parse(JSON.stringify(windowObj.exportOrderPricingSnapshot().params.IRON.BEAM));
windowObj.applyOrderPricingOverrides({
  setupFeeCut: 3000,
  setupFeeBuild: 6000,
  params: {
    IRON: { BEAM: { k_cut: 2.10, k_build: 1.92 } },
  },
});
const paramsAfter = windowObj.exportOrderPricingSnapshot().params.IRON.BEAM;
ok("倍率だけ渡しても A/B は維持", paramsAfter.A === paramsBefore.A && paramsAfter.B === paramsBefore.B && paramsAfter.k_cut === 2.10);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
