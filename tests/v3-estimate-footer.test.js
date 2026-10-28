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

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const panelSrc = fs.readFileSync(path.join(root, "js/ui/v3-estimate-panel.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "js/ui/v3-workspace-ui.js"), "utf8");
const estSrc = fs.readFileSync(path.join(root, "js/features/estimate.js"), "utf8");

const actionsHtml = indexSrc.slice(
  indexSrc.indexOf('class="v3-cmd-pop-actions"'),
  indexSrc.indexOf("</div>", indexSrc.indexOf('class="v3-cmd-pop-actions"'))
);
const printIdx = actionsHtml.indexOf('id="v3-cmd-pop-print"');
const cancelIdx = actionsHtml.indexOf('id="v3-cmd-pop-cancel"');
const applyIdx = actionsHtml.indexOf('id="v3-cmd-pop-apply"');

ok("印刷と閉じるが同じフッター", printIdx >= 0 && cancelIdx >= 0);
ok("印刷は閉じるのすぐ左", printIdx >= 0 && printIdx < cancelIdx);
ok("適用は閉じるの右", cancelIdx < applyIdx);
ok("見積本文に印刷ボタンを残さない", panelSrc.indexOf("v3-est-actions") < 0 && !/function fill\([\s\S]*印刷/.test(panelSrc));
ok("印刷ボタンを複製しない", (indexSrc.match(/id="v3-cmd-pop-print"/g) || []).length === 1 && panelSrc.indexOf("v3-cmd-pop-print") < 0);
ok("印刷処理 sendToEstimate は変更しない", estSrc.indexOf("function sendToEstimate") >= 0 || estSrc.indexOf("window.sendToEstimate") >= 0);
ok("フッター印刷は sendToEstimate を呼ぶ", uiSrc.indexOf('id !== "estimate"') >= 0 && uiSrc.indexOf("window.sendToEstimate") >= 0);
ok("見積時だけ印刷を表示", uiSrc.indexOf('printBtn.hidden = id !== "estimate"') >= 0 && uiSrc.indexOf('classList.toggle("is-estimate", id === "estimate")') >= 0);
ok("フッターは右寄せ", /is-estimate[\s\S]{0,180}justify-content:\s*flex-end/.test(indexSrc));
ok("ボタン間隔は8〜12px", /is-estimate[\s\S]{0,180}gap:\s*10px/.test(indexSrc));
ok("ボタン高さを統一", /is-estimate[\s\S]{0,260}height:\s*32px/.test(indexSrc));
ok("狭い画面でも stretch で左に飛ばさない", !/is-estimate[\s\S]{0,400}justify-content:\s*stretch/.test(indexSrc));
ok("キャッシュ更新", indexSrc.indexOf("v3-workspace-ui.js?v=20261027-pub1") >= 0 && indexSrc.indexOf("v3-estimate-panel.js?v=20261028-est1") >= 0);
ok("fill() は合計と注記を描く", /function fill\([\s\S]*v3-est-total[\s\S]*v3-est-note[\s\S]*function render/.test(panelSrc) && panelSrc.indexOf("extraActions") < 0);
ok("閉じる時に印刷を隠す", uiSrc.indexOf('el.classList.remove("is-estimate")') >= 0 && uiSrc.indexOf("printBtn.hidden = true") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
