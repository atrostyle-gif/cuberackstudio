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

function cad(skus) {
  return W.calcPoleCenterToCenterHeightMm(skus);
}

function product(skus) {
  return W.calcPoleOuterHeightMm(skus);
}

ok("600 = 200+400 CAD", Math.abs(cad([600]) - cad([200, 400])) < 1e-9, cad([600]) + " vs " + cad([200, 400]));
ok("600 = 300+300 CAD", Math.abs(cad([600]) - cad([300, 300])) < 1e-9, cad([600]) + " vs " + cad([300, 300]));
ok("800 = 600+200 CAD", Math.abs(cad([800]) - cad([600, 200])) < 1e-9, cad([800]) + " vs " + cad([600, 200]));
ok("800 = 400+400 CAD", Math.abs(cad([800]) - cad([400, 400])) < 1e-9, cad([800]) + " vs " + cad([400, 400]));
ok("50×2 = 100 CAD", Math.abs(cad([50, 50]) - cad([100])) < 1e-9, cad([50, 50]) + " vs " + cad([100]));
ok("50×4 = 200 CAD", Math.abs(cad([50, 50, 50, 50]) - cad([200])) < 1e-9, cad([50, 50, 50, 50]) + " vs " + cad([200]));
ok("50×12 = 600 CAD", Math.abs(cad(Array(12).fill(50)) - cad([600])) < 1e-9, cad(Array(12).fill(50)) + " vs " + cad([600]));

const tenA = [];
const tenB = [];
const tenC = [];
const tenD = [];
for (let i = 0; i < 10; i++) {
  tenA.push(600);
  tenB.push(200, 400);
  tenC.push(300, 300);
  tenD.push(800);
}
const tenE = [];
const tenF = [];
for (let i = 0; i < 10; i++) {
  tenE.push(600, 200);
  tenF.push(400, 400);
}
ok("10段 600 vs 200+400 CAD差0", Math.abs(cad(tenA) - cad(tenB)) < 1e-9, String(cad(tenA) - cad(tenB)));
ok("10段 600 vs 300+300 CAD差0", Math.abs(cad(tenA) - cad(tenC)) < 1e-9, String(cad(tenA) - cad(tenC)));
ok("10段 800 vs 600+200 CAD差0", Math.abs(cad(tenD) - cad(tenE)) < 1e-9, String(cad(tenD) - cad(tenE)));
ok("10段 800 vs 400+400 CAD差0", Math.abs(cad(tenD) - cad(tenF)) < 1e-9, String(cad(tenD) - cad(tenF)));
const ten50x2 = [];
const ten100 = [];
const ten50x4 = [];
const ten200 = [];
const ten50x12 = [];
const ten600 = [];
for (let i = 0; i < 10; i++) {
  ten100.push(100);
  ten200.push(200);
  ten600.push(600);
  for (let j = 0; j < 2; j++) ten50x2.push(50);
  for (let j = 0; j < 4; j++) ten50x4.push(50);
  for (let j = 0; j < 12; j++) ten50x12.push(50);
}
ok("10段 50×2 vs 100 CAD差0", Math.abs(cad(ten50x2) - cad(ten100)) < 1e-9, String(cad(ten50x2) - cad(ten100)));
ok("10段 50×4 vs 200 CAD差0", Math.abs(cad(ten50x4) - cad(ten200)) < 1e-9, String(cad(ten50x4) - cad(ten200)));
ok("10段 50×12 vs 600 CAD差0", Math.abs(cad(ten50x12) - cad(ten600)) < 1e-9, String(cad(ten50x12) - cad(ten600)));

ok("有効長50=36.3", W.getPoleEffectiveLengthMm(50) === 36.3);
ok("有効長100=90.8", W.getPoleEffectiveLengthMm(100) === 90.8);
ok("有効長200=200.0", W.getPoleEffectiveLengthMm(200) === 200);
ok("有効長300=309.2", W.getPoleEffectiveLengthMm(300) === 309.2);
ok("有効長400=418.3", W.getPoleEffectiveLengthMm(400) === 418.3);
ok("有効長500=527.6", W.getPoleEffectiveLengthMm(500) === 527.6);
ok("有効長600=636.7", W.getPoleEffectiveLengthMm(600) === 636.7);
ok("有効長800=855.1", W.getPoleEffectiveLengthMm(800) === 855.1);

ok("600実寸 688.0", Math.abs(product([600]) - 688) < 1e-9, String(product([600])));
ok("200+400実寸は600と異なる", Math.abs(product([200, 400]) - product([600])) > 0.05, String(product([200, 400])));
ok("300+300実寸は600と異なる", Math.abs(product([300, 300]) - product([600])) > 0.05, String(product([300, 300])));

const joints600 = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 654, z: 0 }];
const poles600 = [{ a: 0, b: 1, lengthMm: 600 }];
const jointsCombo = [
  { x: 200, y: 0, z: 0 }, { x: 200, y: 218, z: 0 }, { x: 200, y: 654, z: 0 },
];
const polesCombo = [
  { a: 0, b: 1, lengthMm: 200 },
  { a: 1, b: 2, lengthMm: 400 },
];
const cols = W.collectVerticalPoleSkuColumns(
  joints600.concat(jointsCombo),
  poles600.concat(polesCombo.map(function (p) {
    return { a: p.a + 2, b: p.b + 2, lengthMm: p.lengthMm };
  }))
);
const sum = W.summarizeRackProductHeightMm(cols, true, true);
ok("混在列は単一寸法にしない", sum.unique === false && sum.value == null && !!sum.text && !!sum.note, JSON.stringify(sum));
ok("混在列の範囲は688近傍", Math.abs(sum.min - 687.6) < 0.05 && Math.abs(sum.max - 688) < 0.05, JSON.stringify(sum));

const sharedJs = [
  { x: 0, y: 0, z: 0 }, { x: 0, y: 654, z: 0 },
  { x: 200, y: 0, z: 0 }, { x: 200, y: 218, z: 0 }, { x: 200, y: 654, z: 0 },
];
const sharedPs = [
  { a: 0, b: 1, lengthMm: 600 },
  { a: 2, b: 3, lengthMm: 200 },
  { a: 3, b: 4, lengthMm: 400 },
  { a: 2, b: 4, lengthMm: 600 },
];
const sharedSum = W.summarizeRackProductHeightMm(W.collectVerticalPoleSkuColumns(sharedJs, sharedPs), true, true);
ok("共有柱の重複Poleは二重計上しない", Math.abs(sharedSum.min - 687.6) < 0.05 && Math.abs(sharedSum.max - 688) < 0.05, JSON.stringify(sharedSum));

ok("lengthMm600 を CAD654 でも保持", W.resolvePoleSkuForEstimate({ lengthMm: 600 }, 654).skuMm === 600);
ok("lengthMm200 を CAD218 でも保持", W.resolvePoleSkuForEstimate({ lengthMm: 200 }, 218).skuMm === 200);
ok("CAD654 のみでも 600", W.resolvePoleSkuForEstimate({}, 654).skuMm === 600);
ok("CAD218 のみでも 200", W.resolvePoleSkuForEstimate({}, 218).skuMm === 200);
ok("POLE50 lengthMm を CAD54.5 でも保持", W.resolvePoleSkuForEstimate({ lengthMm: 50 }, 54.5).skuMm === 50 && W.resolvePoleSkuForEstimate({ lengthMm: 50 }, 54.5).custom === false);
ok("CAD54.5 のみでも SKU50", W.resolvePoleSkuForEstimate({}, 54.5).skuMm === 50 && W.resolvePoleSkuForEstimate({}, 54.5).custom === false);
ok("実測CAD54.3 のみでも SKU50", W.resolvePoleSkuForEstimate({}, 54.3).skuMm === 50);
ok("旧CAD50 は SKU50", W.resolvePoleSkuForEstimate({ lengthMm: 50 }, 50).skuMm === 50);
ok("POLE50 を 100 へ丸めない", W.resolvePoleSkuForEstimate({ lengthMm: 50 }, 54.5).skuMm !== 100);
ok("Custom 109 は 100 にしない", W.resolvePoleSkuForEstimate({ isCustom: true, customLength: 109, lengthMm: 109 }, 109).custom === true
  && W.resolvePoleSkuForEstimate({ isCustom: true, customLength: 109, lengthMm: 109 }, 109).skuMm === 109);

const p600 = W.pricePartForEstimate("pole_600", "IRON", 4, "retail");
ok("pole_600 は0円にならない", p600.registered === true && Number(p600.unitPrice) > 0, JSON.stringify(p600));
const p200 = W.pricePartForEstimate("pole_200", "IRON", 4, "retail");
ok("pole_200 は登録単価", p200.registered === true && Number(p200.unitPrice) > 0);
ok("pole_654 は未登録", W.pricePartForEstimate("pole_654", "IRON", 1, "retail").registered === false);
ok("pole_218 は未登録", W.pricePartForEstimate("pole_218", "IRON", 1, "retail").registered === false);
const p50 = W.pricePartForEstimate("pole_50", "IRON", 4, "retail");
ok("pole_50 は0円にならない", p50.registered === true && Number(p50.unitPrice) > 0, JSON.stringify(p50));
ok("pole_55 は未登録", W.pricePartForEstimate("pole_55", "IRON", 1, "retail").registered === false);

const fileSrc = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
ok("読込は座標を変換しない", fileSrc.indexOf("x: j.x") >= 0 && fileSrc.indexOf("y: j.y") >= 0 && fileSrc.indexOf("getPoleCadMmFromSku") < 0);
ok("heightModel は推論のみ", fileSrc.indexOf("inferHeightModelFromGeometry") >= 0);

const connSrc = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
ok("既存SKUはCADから上書きしない", connSrc.indexOf("if (asPole && item.isCustom) return;") >= 0);
ok("preset lengthMm を保持", connSrc.indexOf("asPole && stored > 0") >= 0);

const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
ok("外寸高さは製品サマリ", estSrc.indexOf("summarizeRackProductHeightMm") >= 0);
ok("CAD span を実寸にしない", estSrc.indexOf("外寸：高さ（製品実寸。CAD span は実寸として使わない）") >= 0);

const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-estimate-panel.js"), "utf8");
ok("見積明細に寸法列を出さない", panelSrc.indexOf(">寸法<") < 0 && panelSrc.indexOf("<th>種類</th>") < 0 && panelSrc.indexOf("col-name") >= 0);

const drawSrc = fs.readFileSync(path.join(root, "js/app/drawing.js"), "utf8");
ok("図面HはCAD overwriteしない", drawSrc.indexOf("summarizeRackProductHeightMm") >= 0
  && !/Hmm = window\.calcFrameOuterHeightMm\(maxJY - minJY/.test(drawSrc));

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok("キャッシュ m109", indexSrc.indexOf("dimension-utils.js?v=20261028-sku1") >= 0
  && indexSrc.indexOf("estimate.js?v=20261028-est1") >= 0
  && indexSrc.indexOf("v3-estimate-panel.js?v=20261028-est1") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
