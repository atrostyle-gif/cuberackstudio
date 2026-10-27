"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pageStore = require(path.join(root, "js/app/drawing-page-store.js"));
const sheetSrc = fs.readFileSync(path.join(root, "js/app/drawing-sheet.js"), "utf8");
const uiSrc = fs.readFileSync(path.join(root, "js/app/drawing-pages-ui.js"), "utf8");
const html = fs.readFileSync(path.join(root, "drawing.html"), "utf8");

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

const doc = pageStore.createDefaultDocument({ drawingNoBase: "D-FIX" });
ok("8種固定", doc.pages.length === 8 && doc.fixedSet === 8);
ok("ISOが先頭", doc.pages[0].kind === "iso" && pageStore.pageLabel(doc.pages[0]) === "3D完成図");
ok("BOMが2番目", doc.pages[1].kind === "bom");
ok("初期は全印刷", pageStore.printPages(doc).length === 8);

const front = doc.pages.find(function (p) { return p.orthoMode === "front"; });
front.orthoState.panU = 40;
front.print = false;
pageStore.setPagePrint(doc, front.id, false);
ok("チェック解除してもカメラ残る", front.orthoState.panU === 40 && front.print === false);
ok("印刷対象は7", pageStore.printPages(doc).length === 7);
ok("枝番はチェックで変わらない", front.branch === "03");

pageStore.setAllPrint(doc, false);
ok("全解除", pageStore.printPages(doc).length === 0);
pageStore.setAllPrint(doc, true);
ok("全選択", pageStore.printPages(doc).length === 8);

const old = {
  version: 1,
  nextBranch: 5,
  drawingNoBase: "D-OLD",
  dimOffsets: { pg_keep_width: { offsetMm: 12 } },
  pages: [
    { id: "iso_old", kind: "iso", branch: "01", isoView: { preset: "front", zoom: 1.3, pitchDeg: 12, yawDeg: 10, panX: 0, panY: 0 } },
    { id: "front_a", kind: "ortho", orthoMode: "front", branch: "03", orthoState: { mode: "front", panU: 88, panV: 2, zoom: 1.5 }, showDims: true },
    { id: "front_b", kind: "ortho", orthoMode: "front", branch: "04", orthoState: { mode: "front", panU: 1, panV: 2, zoom: 2 } },
    { id: "bom_old", kind: "bom", branch: "02", bomStart: 0 },
  ],
};
const migrated = pageStore.loadDocument(old);
ok("旧データは8種へ補完", migrated.pages.length === 8);
ok("既存ISOを引き継ぐ", migrated.pages[0].id === "iso_old" && migrated.pages[0].isoView.zoom === 1.3);
ok("既存正面を引き継ぐ", migrated.pages[2].id === "front_a" && migrated.pages[2].orthoState.panU === 88);
ok("既存枝番を維持", migrated.pages[0].branch === "01" && migrated.pages[2].branch === "03");
ok("同一視点の2枚目は消さない", migrated.archivedPages.some(function (p) { return p.id === "front_b" && p.orthoState.zoom === 2; }));
ok("寸法オフセットを残す", migrated.dimOffsets.pg_keep_width.offsetMm === 12);
ok("欠けた左右上下を補う", ["back", "left", "right", "top", "bottom"].every(function (m) {
  return migrated.pages.some(function (p) { return p.orthoMode === m; });
}));

const payload = { _orthoSlots: {}, _isoViews: {} };
pageStore.attachToPayload(migrated, payload);
ok("移行後もページIDでカメラ独立", payload._orthoSlots.front_a.panU === 88 && payload._orthoSlots.front_a.mode === "front");

ok("チェック操作はskipRedraw", uiSrc.indexOf('skipRedraw: true') >= 0 && uiSrc.indexOf("stopPropagation") >= 0);
ok("印刷はチェックした図面だけ", sheetSrc.indexOf("is-print") >= 0 && sheetSrc.indexOf("printNumbering") >= 0);
ok("印刷番号は対象だけ連番", sheetSrc.indexOf("targets.findIndex") >= 0);
ok("追加ボタンなし", html.indexOf("draw-page-add-btn") < 0 && uiSrc.indexOf("bindAdd") < 0);
ok("dw19の表示中ページ投影を維持", sheetSrc.indexOf("function activeOrthoRects") >= 0 && sheetSrc.indexOf("keepPageIndexById") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
