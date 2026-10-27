"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const northSrc = fs.readFileSync(path.join(root, "js/ui/v3-north.js"), "utf8");
const fileSrc = fs.readFileSync(path.join(root, "js/features/file.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");
const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-estimate-panel.js"), "utf8");
const toolbarSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");
const pageStoreSrc = fs.readFileSync(path.join(root, "js/app/drawing-page-store.js"), "utf8");
const sheetSrc = fs.readFileSync(path.join(root, "js/app/drawing-sheet.js"), "utf8");
const drawingHtml = fs.readFileSync(path.join(root, "drawing.html"), "utf8");
const estimateHtml = fs.readFileSync(path.join(root, "estimate.html"), "utf8");

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

ok("ヘッダーに新規ラベル", indexSrc.indexOf('id="v3-north-new"') >= 0 && indexSrc.indexOf(">新規</span>") >= 0);
ok("ヘッダーに開くラベル", indexSrc.indexOf('id="v3-north-open"') >= 0 && indexSrc.indexOf(">開く</span>") >= 0);
ok("ヘッダーに保存ラベル", indexSrc.indexOf('id="v3-north-save"') >= 0 && indexSrc.indexOf(">保存</span>") >= 0);
ok("ヘッダーに別名保存ラベル", indexSrc.indexOf('id="v3-north-save-as"') >= 0 && indexSrc.indexOf(">別名保存</span>") >= 0);
ok("フォルダメニューを撤去", indexSrc.indexOf('id="v3-north-file"') < 0 && northSrc.indexOf("v3-north-file-menu") < 0);
ok("電卓単独ボタンを撤去", indexSrc.indexOf('id="v3-north-estimate"') < 0);
ok("開くはデザインJSON直接", /id="v3-north-open"[^>]*data-north-id="open"/.test(indexSrc) && indexSrc.indexOf("v3-north-open-menu") < 0);
ok("開くメニューに図面は無い", !/id="v3-north-open"[\s\S]{0,400}図面を開く/.test(indexSrc));
ok("図面はCADとその他に残る", toolbarSrc.indexOf("#btn-open-drawing") >= 0 && /id="v3-north-more-menu"[\s\S]{0,500}図面を開く/.test(indexSrc));
ok("新規は開くの左のHTML順", indexSrc.indexOf('id="v3-north-new"') < indexSrc.indexOf('id="v3-north-open"'));
ok("新規ボタンは1つ", (indexSrc.match(/id="v3-north-new"/g) || []).length === 1);
ok("旧配置の新規は開くの左へ移行", northSrc.indexOf("fileOpsMigrated") >= 0);
ok("合計はクリックで見積", northSrc.indexOf("openEstimate(dst)") >= 0 && northSrc.indexOf('id === "v3-north-total"') >= 0);
ok("合計テキストを既存#totalから同期", northSrc.indexOf("formatTotalFromLegacy") >= 0 && northSrc.indexOf("v3-north-total-text") >= 0);
ok("保存状態を表示", northSrc.indexOf('kind === "busy" ? "保存中…"') >= 0 && northSrc.indexOf("保存しました") >= 0 && northSrc.indexOf("保存に失敗しました") >= 0);

ok("未保存確認がある", fileSrc.indexOf("function confirmDiscardUnsaved") >= 0 && fileSrc.indexOf("未保存の変更があります。") >= 0);
ok("開く前に未保存確認", /function openDesignFromFilePicker[\s\S]{0,180}confirmDiscardUnsaved\("開く"\)/.test(fileSrc));
ok("新規は既存resetへ委譲", fileSrc.indexOf("function newDesign") >= 0 && fileSrc.indexOf('getElementById("reset-btn")') >= 0);
ok("新規後にファイルハンドルをクリア", fileSrc.indexOf("function clearDesignFileState") >= 0 && mainSrc.indexOf("clearDesignFileState") >= 0);
ok("未保存時の新規確認", mainSrc.indexOf("保存せずに新規作成すると現在のデザインは失われます") >= 0);
ok("上書き保存は状態を返す", fileSrc.indexOf('return "ok"') >= 0 && fileSrc.indexOf('return "fail"') >= 0 && fileSrc.indexOf('return "abort"') >= 0);
ok("別名保存は新しいハンドル", /function saveDesignAs[\s\S]{0,900}currentFileHandle = handle/.test(fileSrc));
ok("保存形式はJSONのまま", fileSrc.indexOf("mfes-design") >= 0 && fileSrc.indexOf("application/json") >= 0);

ok("見積パネルは印刷を本体に置かない", panelSrc.indexOf("v3-est-actions") < 0 && panelSrc.indexOf("v3-est-print") < 0);
ok("印刷はフッター固定ボタン", indexSrc.indexOf('id="v3-cmd-pop-print"') >= 0 && indexSrc.indexOf('id="v3-cmd-pop-print"') < indexSrc.indexOf('id="v3-cmd-pop-cancel"'));
ok("印刷処理は既存sendToEstimate", fs.readFileSync(path.join(root, "js/ui/v3-workspace-ui.js"), "utf8").indexOf("window.sendToEstimate") >= 0 && estSrc.indexOf('window.open("estimate.html"') >= 0);
ok("見積書は既存estimate.html", estSrc.indexOf("function ()") >= 0 && estSrc.indexOf('window.open("estimate.html"') >= 0);
ok("payloadは既存parts+total", estSrc.indexOf("window.buildDraftEstimatePayload") >= 0 && estSrc.indexOf("currentEstimateParts") >= 0 && estSrc.indexOf("currentEstimateTotal") >= 0);
ok("payloadに架空会社情報なし", !/buildDraftEstimatePayload[\s\S]{0,800}(company|顧客名|架空)/.test(estSrc));
ok("見積印刷はCADを保存しない", panelSrc.indexOf("saveDesign") < 0);
ok("CAD見積コマンドは合計へ", toolbarSrc.indexOf('anchor: document.getElementById("v3-north-total")') >= 0);
ok("estimate.htmlに印刷確認", estimateHtml.indexOf("onclick=\"window.print()\"") >= 0);

ok("図面は固定8ページ", pageStoreSrc.indexOf("fixedSet: 8") >= 0 && pageStoreSrc.indexOf('{ key: "iso"') >= 0 && pageStoreSrc.indexOf('{ key: "bottom"') >= 0);
ok("図面に見積スロットを足していない", pageStoreSrc.indexOf("estimate") < 0 && pageStoreSrc.indexOf("見積書") < 0);
ok("図面印刷はキャンバス@page", sheetSrc.indexOf("function printAll") >= 0 && sheetSrc.indexOf("@page{ size:") >= 0);
ok("図面HTMLに見積チェックなし", drawingHtml.indexOf("見積書") < 0);
ok("見積HTMLに@page sizeなし", estimateHtml.indexOf("@page") < 0);
ok("図面と見積は別printジョブ", sheetSrc.indexOf("window.print()") >= 0 && estimateHtml.indexOf("window.print()") >= 0 && sheetSrc.indexOf("estimate.html") < 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
