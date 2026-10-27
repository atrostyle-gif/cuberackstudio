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

ok("基本パーツタブがない", adminHtml.indexOf('data-tab="basic"') < 0 && adminHtml.indexOf("tab-basic") < 0 && adminHtml.indexOf(">基本パーツ<") < 0);
ok("材種別は2段見出し", adminHtml.indexOf("小売価格") >= 0 && adminHtml.indexOf('colspan="2" class="mat-head mat-g">IRON') >= 0);
ok("材質グループに縦線クラス", adminHtml.indexOf('td class="mat-g"') >= 0 && adminHtml.indexOf("border-left: 1px solid") >= 0);
ok("残タブは材種別・棚板・壁板・オーダー", adminHtml.indexOf('data-tab="material"') >= 0 && adminHtml.indexOf('data-tab="board"') >= 0 && adminHtml.indexOf('data-tab="panel"') >= 0 && adminHtml.indexOf('data-tab="order"') >= 0);
ok("初回移行フラグ ironPriceUnified", loaderSrc.indexOf("ironPriceUnified") >= 0 && loaderSrc.indexOf("function unifyIronPrices") >= 0);
ok("保存時にフラグを付ける", adminHtml.indexOf("catalog.ironPriceUnified = true") >= 0);
ok("見積は共有ヘルパで卸を参照", estSrc.indexOf("pricePartForEstimate") >= 0);
ok("キャッシュバンプ", indexSrc.indexOf("price-loader.js?v=20261027-pub1") >= 0);
ok("キー列を出さない", adminHtml.indexOf(">キー<") < 0 && adminHtml.indexOf("部材名") >= 0);
ok("価格入力は右揃え", adminHtml.indexOf("text-align: right") >= 0);

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
const unify = windowObj.unifyIronPrices;
const calc = windowObj.calcOrderTotal;
const line = windowObj.priceOrderLineFromKey;

const BASIC_KEYS = [
  "jointBall", "jointCap", "topCap", "sideCap", "legBoss", "leg", "beamNut", "m5Screw",
  "beam_25", "beam_50", "beam_100", "beam_150", "beam_200", "beam_300", "beam_400", "beam_500", "beam_600", "beam_800",
  "pole_50", "pole_100", "pole_200", "pole_300", "pole_400", "pole_500", "pole_600", "pole_800",
  "shelfBracket_100", "shelfBracket_200", "shelfBracket_300", "shelfBracket_400", "shelfBracket_600",
  "wallBracket_100", "wallBracket_200", "wallBracket_300", "wallBracket_400", "wallBracket_600", "wallBracket_800",
];

const live = exp();
const missing = BASIC_KEYS.filter((k) => !live.partPriceByMaterial[k] || typeof live.partPriceByMaterial[k].IRON !== "number");
ok("基本パーツの全対象部材が材種別にある", missing.length === 0, missing.join(","));
ok("棚板・壁板の総称キーは材種別に出さない", !live.partPriceByMaterial.shelfBoard && !live.partPriceByMaterial.wallPanel);

const oldJson = {
  partsCatalog: {
    jointBall: { label: "Joint Ball", unitPrice: 611, unitWeightG: 17.1 },
    shelfBracket_100: { label: "棚受け金物（標準） 100幅用", unitPrice: 330, unitWeightG: 0 },
    beam_200: { label: "Beam_200", unitPrice: 500, unitWeightG: 203.2 },
  },
  partPriceByMaterial: {
    jointBall: { IRON: 600, BS: 700, SUS: 730 },
    beam_200: { IRON: 500, BS: 920, SUS: 830 },
  },
  partsWholesale: { shelfBracket_100: 0 },
  partWholesaleByMaterial: { jointBall: { IRON: 480 } },
  scaffoldBoardPrices: { "100×200": 1210 },
  scaffoldPanelPrices: { "200×300": 1870 },
  orderPricing: { setupFeeCut: 3000, setupFeeBuild: 6000 },
};

const migrated = unify(JSON.parse(JSON.stringify(oldJson)));
ok("旧基本価格をIRONへ引き継ぐ", migrated.partPriceByMaterial.jointBall.IRON === 611);
ok("既存IRONと違う場合は基本価格を優先", migrated.partPriceByMaterial.jointBall.IRON === 611);
ok("BS・SUSは変えない", migrated.partPriceByMaterial.jointBall.BS === 700 && migrated.partPriceByMaterial.jointBall.SUS === 730);
ok("金物が材種別に入る", migrated.partPriceByMaterial.shelfBracket_100.IRON === 330);
ok("無いBS・SUSを0で埋めない", migrated.partPriceByMaterial.shelfBracket_100.BS === undefined && migrated.partPriceByMaterial.shelfBracket_100.SUS === undefined);
ok("既存の卸IRONを失わない", migrated.partWholesaleByMaterial.jointBall.IRON === 480);
ok("基本側の卸0円をIRON卸へ移す", migrated.partWholesaleByMaterial.shelfBracket_100.IRON === 0);
ok("初回移行でフラグが立つ", migrated.ironPriceUnified === true);
ok("unitPrice を IRON に合わせる", migrated.partsCatalog.jointBall.unitPrice === 611);

const second = unify(JSON.parse(JSON.stringify(migrated)));
second.partPriceByMaterial.jointBall.IRON = 999;
second.partsCatalog.jointBall.unitPrice = 611;
const again = unify(second);
ok("移行の再実行でIRONを上書きしない", again.partPriceByMaterial.jointBall.IRON === 999);
ok("再実行後は unitPrice を IRON に同期", again.partsCatalog.jointBall.unitPrice === 999);

apply({
  ironPriceUnified: true,
  partsCatalog: { jointBall: { label: "Joint Ball", unitPrice: 611, unitWeightG: 17.1 } },
  partPriceByMaterial: { jointBall: { IRON: 888, BS: 700, SUS: 730 } },
});
ok("IRON変更は再読込で unitPrice に戻されない", getInfo("jointBall", "IRON").unitPrice === 888);
ok("フラグ付きJSONでは古いunitPriceでIRONを上書きしない", windowObj.PART_PRICE_BY_MATERIAL.jointBall.IRON === 888);

apply({
  ironPriceUnified: true,
  partsCatalog: live.partsCatalog,
  partPriceByMaterial: live.partPriceByMaterial,
  scaffoldBoardPrices: live.scaffoldBoardPrices,
  scaffoldPanelPrices: live.scaffoldPanelPrices,
  orderPricing: live.orderPricing,
  partsWholesale: {},
  partWholesaleByMaterial: {
    jointBall: { IRON: 0 },
  },
});
ok("卸0円は登録", getWs("jointBall", "IRON").registered === true && getWs("jointBall", "IRON").value === 0);
ok("未登録材質は未登録", getWs("jointBall", "BS").registered === false);

ok("CAD通常価格と印刷ヘルパが一致", getInfo("beam_200", "BS").unitPrice === 920);
ok("棚受けも材種別IRONを参照", getInfo("shelfBracket_100", "IRON").unitPrice === 330);
ok("CUT参照は材種別マスター", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).stockPrice === windowObj.PART_PRICE_BY_MATERIAL.beam_500.IRON);
ok("オーダー計算金額を維持", calc({ type: "BEAM", material: "IRON", lengthMm: 450, qty: 2 }).total === 6570);
ok("印刷オーダーも同額", line("beam_custom_IRON_450", "IRON", 2).total === 6570);
ok("棚板価格はサイズ表のまま", getInfo("shelfBoard_100x200").unitPrice === 1210);
ok("壁板価格はサイズ表のまま", getInfo("wallPanel_200x300").unitPrice === 1870);
ok("BS価格は移行で変わらない", getInfo("beam_200", "BS").unitPrice === 920);
ok("エクスポートに通常価格キーが残る", !!exp().partsCatalog.jointBall && !!exp().partPriceByMaterial.beam_200 && !!exp().scaffoldBoardPrices["100×200"] && exp().ironPriceUnified === true);
ok("ラベル・重量を維持", exp().partsCatalog.jointBall.label === "Joint Ball" && exp().partsCatalog.jointBall.unitWeightG === 17.1);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
