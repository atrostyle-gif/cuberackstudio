"use strict";

const fs = require("fs");
const path = require("path");

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

const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-estimate-panel.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
const estHtml = fs.readFileSync(path.join(root, "estimate.html"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

ok("一般列は部材名材質数量単価小計",
  panelSrc.indexOf("col-name") >= 0 && panelSrc.indexOf("部材名") >= 0 &&
  panelSrc.indexOf("col-mat") >= 0 && panelSrc.indexOf("材質") >= 0 &&
  panelSrc.indexOf("col-qty") >= 0 && panelSrc.indexOf("数量") >= 0 &&
  panelSrc.indexOf("col-unit") >= 0 && panelSrc.indexOf("単価") >= 0 &&
  panelSrc.indexOf("col-sub") >= 0 && panelSrc.indexOf("小計") >= 0);

ok("種類列を出さない", panelSrc.indexOf(">種類<") < 0 && panelSrc.indexOf("<th>種類</th>") < 0);
ok("寸法列を出さない", panelSrc.indexOf(">寸法<") < 0 && panelSrc.indexOf("getPoleProductLengthMm") < 0);
ok("在庫見出しはSTAFF分岐内", panelSrc.indexOf("staff ?") >= 0 && panelSrc.indexOf("col-stock") >= 0 && panelSrc.indexOf("在庫") >= 0);
ok("在庫セルもSTAFF分岐内", panelSrc.indexOf("if (staff) td(stockLabel(row)") >= 0);
ok("一般はstockLabelを呼ばない", panelSrc.indexOf("if (!isStaff()) return \"\"") >= 0);
ok("CSS非表示に頼らない", panelSrc.indexOf("display:none") < 0 && panelSrc.indexOf("visibility:hidden") < 0);
ok("切替時にテーブルを作り直す", panelSrc.indexOf("root.innerHTML = \"\"") >= 0);
ok("STAFF判定は既存関数", panelSrc.indexOf("isCubeRackStaffMode") >= 0);
ok("STAFF切替で再描画", panelSrc.indexOf("cuberack:staff-mode-enabled") >= 0 && panelSrc.indexOf("cuberack:staff-mode-disabled") >= 0);
ok("見積計算ロジックは触らない", estSrc.indexOf("window.currentEstimateLines = estimateLines") >= 0 && estSrc.indexOf("function calcAndRenderEstimate") >= 0);

const payloadFn = estSrc.slice(
  estSrc.indexOf("window.buildDraftEstimatePayload"),
  estSrc.indexOf("window.sendToEstimate")
);
ok("draftEstimateに在庫を載せない",
  payloadFn.indexOf("parts: partsWithMaterial") >= 0 && payloadFn.indexOf("stock") < 0);
ok("印刷在庫はSTAFF時のみsessionStorage",
  /sendToEstimate[\s\S]*isCubeRackStaffMode[\s\S]{0,800}cuberack_print_show_stock/.test(estSrc));
ok("印刷在庫をlocalStorageに書かない", estSrc.indexOf("localStorage.setItem(\"cuberack_print_stock\"") < 0);

ok("印刷は種類・寸法列なし",
  estHtml.indexOf(">種類<") < 0 &&
  estHtml.indexOf(">寸法<") < 0 &&
  estHtml.indexOf("パーツ名") >= 0);
ok("印刷の在庫はSTAFF判定",
  estHtml.indexOf("function printShowsStock") >= 0 &&
  estHtml.indexOf("applyEstimateHead(showStock)") >= 0 &&
  estHtml.indexOf("if (tdStock) tr.appendChild(tdStock)") >= 0);
ok("印刷はSTAFF終了で在庫を消す",
  estHtml.indexOf("cuberack:staff-mode-disabled") >= 0 &&
  estHtml.indexOf("removeItem(\"cuberack_print_show_stock\")") >= 0 &&
  estHtml.indexOf("document.addEventListener(\"cuberack:staff-mode-enabled\"") >= 0 &&
  estHtml.indexOf("document.addEventListener(\"cuberack:staff-mode-disabled\"") >= 0);
ok("列幅を固定", indexSrc.indexOf("table-layout:fixed") >= 0 && indexSrc.indexOf(".v3-est-table .col-stock") >= 0);
ok("iPad幅でも列を縮める", indexSrc.indexOf("@media (max-width: 820px)") >= 0);
ok("キャッシュ est1",
  indexSrc.indexOf("v3-estimate-panel.js?v=20261028-est1") >= 0 &&
  indexSrc.indexOf("estimate.js?v=20261028-est1") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
