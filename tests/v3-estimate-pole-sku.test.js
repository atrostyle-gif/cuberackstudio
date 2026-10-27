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

const sandbox = {
  window: {},
  console: console,
  Math: Math,
  Number: Number,
  String: String,
  Object: Object,
  Array: Array,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  Infinity: Infinity,
  NaN: NaN,
};
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/utils/common.js"), "utf8"),
  sandbox,
  { filename: "common.js" }
);
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/app/dimension-utils.js"), "utf8"),
  sandbox,
  { filename: "dimension-utils.js" }
);
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/data/parts-catalog.js"), "utf8"),
  sandbox,
  { filename: "parts-catalog.js" }
);

const W = sandbox.window;
W.POLE_LENGTH_OPTIONS = [50, 100, 200, 300, 400, 500, 600, 800];

function sku(pole, cad) {
  return W.resolvePoleSkuForEstimate(pole, cad);
}

ok("SKUヘルパがある", typeof W.resolvePoleSkuForEstimate === "function");
ok("POLE600 CAD654.7 + lengthMm600 → 規格100なしで 600", sku({ lengthMm: 600 }, 654.7).skuMm === 600 && sku({ lengthMm: 600 }, 654.7).custom === false);
ok("POLE100 CAD108.8 + lengthMm100 → 100", sku({ lengthMm: 100 }, 108.8).skuMm === 100 && sku({ lengthMm: 100 }, 108.8).custom === false);
ok("lengthMm無しでも CAD654.7 → 600", sku({}, 654.7).skuMm === 600 && sku({}, 654.7).custom === false);
ok("lengthMm無しでも CAD108.8 → 100", sku({}, 108.8).skuMm === 100 && sku({}, 108.8).custom === false);
ok("旧CAD600はSKU600のまま", sku({}, 600).skuMm === 600 && sku({}, 600).custom === false);
ok("旧CAD100はSKU100のまま", sku({}, 100).skuMm === 100 && sku({}, 100).custom === false);
ok("誤って入った lengthMm654.7 も CAD から 600 に戻す", sku({ lengthMm: 654.7 }, 654.7).skuMm === 600 && sku({ lengthMm: 654.7 }, 654.7).custom === false);
ok("Custom 450 は規格へ変換しない", sku({ isCustom: true, customLength: 450, lengthMm: 450 }, 450).custom === true && sku({ isCustom: true, customLength: 450 }, 450).skuMm === 450);
ok("Custom は CAD654.7 でも 600 にしない", sku({ isCustom: true, customLength: 655, lengthMm: 655 }, 654.7).custom === true && sku({ isCustom: true, customLength: 655 }, 654.7).skuMm === 655);

const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
ok("見積 Pole は resolvePoleSkuForEstimate を使う", estSrc.indexOf("resolvePoleSkuForEstimate") >= 0);
ok("見積 Pole は CAD距離をキーにしない", !/poles\.forEach\(\(p\) => \{[\s\S]{0,400}const nominalLen = Math\.round\(Math\.sqrt/.test(estSrc));
ok("Beam の CAD 丸めは残す", /beams\.forEach\(\(b\) => \{[\s\S]{0,350}const nominalLen = Math\.round\(Math\.sqrt/.test(estSrc));

const fileSrc = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
ok("スナップショットは poles lengthMm を保存", /poles: poles\.map\(\(p\) => \{[\s\S]{0,500}out\.lengthMm = poleLen/.test(fileSrc));
ok("スナップショットは beams lengthMm も保存", /beams: beams\.map\(\(b\) => \{[\s\S]{0,500}out\.lengthMm = beamLen/.test(fileSrc));
ok("読込は座標を書き換えない", fileSrc.indexOf("x: j.x") >= 0 && fileSrc.indexOf("y: j.y") >= 0 && fileSrc.indexOf("getPoleCadMmFromSku") < 0);

ok("pole_600 は登録", W.isRetailStockKeyRegistered("pole_600") === true);
ok("pole_100 は登録", W.isRetailStockKeyRegistered("pole_100") === true);
ok("beam_600 は登録", W.isRetailStockKeyRegistered("beam_600") === true);
ok("pole_655 は未登録", W.isRetailStockKeyRegistered("pole_655") === false);
ok("pole_109 は未登録", W.isRetailStockKeyRegistered("pole_109") === false);

const p600 = W.pricePartForEstimate("pole_600", "IRON", 16, "retail");
ok("pole_600 は登録単価", p600.registered === true && Number(p600.unitPrice) > 0 && p600.sub === p600.unitPrice * 16, JSON.stringify(p600));
const p100 = W.pricePartForEstimate("pole_100", "IRON", 4, "retail");
ok("pole_100 は登録単価", p100.registered === true && Number(p100.unitPrice) > 0 && p100.sub === p100.unitPrice * 4, JSON.stringify(p100));
const p655 = W.pricePartForEstimate("pole_655", "IRON", 16, "retail");
ok("pole_655 は未登録・単価null", p655.registered === false && p655.unitPrice === null && p655.sub === null, JSON.stringify(p655));
const p109 = W.pricePartForEstimate("pole_109", "IRON", 4, "retail");
ok("pole_109 は未登録・単価null", p109.registered === false && p109.unitPrice === null, JSON.stringify(p109));

const beam = W.pricePartForEstimate("beam_600", "IRON", 20, "retail");
ok("beam_600 は従来どおり登録単価", beam.registered === true && Number(beam.unitPrice) > 0);

const order = W.pricePartForEstimate("pole_custom_IRON_450", "IRON", 1, "retail");
ok("Custom Pole はオーダー経路", order.order === true && order.registered === true);

W.PARTS_CATALOG.jointBall.unitPrice = 0;
W.PART_PRICE_BY_MATERIAL.jointBall = { IRON: 0 };
const zero = W.pricePartForEstimate("jointBall", "IRON", 2, "retail");
ok("0円登録は incomplete にしない", zero.registered === true && zero.unitPrice === 0 && zero.sub === 0);

const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-estimate-panel.js"), "utf8");
ok("未登録SKUを警告文に出す", panelSrc.indexOf("部材単価が登録されていません（") >= 0);
ok("印刷は incomplete で止める", estSrc.indexOf("hasIncompleteEstimatePrices") >= 0 && estSrc.indexOf("payload.incomplete") >= 0);

const html = fs.readFileSync(path.join(root, "estimate.html"), "utf8");
ok("見積画面も未登録をモード不問で見る", html.indexOf("else if (!isOrderPart)") >= 0 && html.indexOf("priced.registered === false") >= 0);

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok("キャッシュ sku1", indexSrc.indexOf("estimate.js?v=20261027-sku1") >= 0 && indexSrc.indexOf("dimension-utils.js?v=20261027-sku1") >= 0 && indexSrc.indexOf("file.js?v=20261027-sku1") >= 0 && indexSrc.indexOf("parts-catalog.js?v=20261027-sku1") >= 0);

const outer4 = W.calcFrameOuterHeightMm(4 * 654.7, true, true);
const outerRaise = W.calcFrameOuterHeightMm(108.8 + 4 * 654.7, true, true);
ok("高さ 2652.1 は維持", Math.abs(outer4 - 2652.1) < 1e-9, String(outer4));
ok("高さ 2760.9 は維持", Math.abs(outerRaise - 2760.9) < 1e-9, String(outerRaise));

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
