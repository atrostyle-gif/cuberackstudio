"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pageStore = require(path.join(root, "js/app/drawing-page-store.js"));
const sheetSrc = fs.readFileSync(path.join(root, "js/app/drawing-sheet.js"), "utf8");
const orthoNavSrc = fs.readFileSync(path.join(root, "js/app/drawing-ortho-nav.js"), "utf8");
const isoNavSrc = fs.readFileSync(path.join(root, "js/app/drawing-iso-nav.js"), "utf8");

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

function addAndAttach(doc, payload, spec) {
  const page = pageStore.addPage(doc, spec);
  pageStore.attachToPayload(doc, payload);
  return page;
}

function slotMode(payload, pageId) {
  return payload._orthoSlots && payload._orthoSlots[pageId] && payload._orthoSlots[pageId].mode;
}

const payload = { joints: [{ x: 0, y: 0, z: 0 }], _orthoSlots: {}, _isoViews: {} };

const frontDoc = pageStore.createDefaultDocument({ drawingNoBase: "D-mix" });
const iso0 = frontDoc.pages[0];
const front = addAndAttach(frontDoc, payload, { kind: "ortho", orthoMode: "front" });
ok("正面図追加後のスロットは front", slotMode(payload, front.id) === "front");
const stayFrontMode = slotMode(payload, front.id);
const stayFrontPan = payload._orthoSlots[front.id].panU;
payload._orthoSlots[front.id].panU = 80;
pageStore.persistFromPayload(frontDoc, payload);
const left = addAndAttach(frontDoc, payload, { kind: "ortho", orthoMode: "left" });
ok("正面表示中に左側面を追加しても正面スロットは front", slotMode(payload, front.id) === stayFrontMode);
ok("正面のパンは左側面追加後も残る", payload._orthoSlots[front.id].panU === 80);
ok("追加した左側面は独自スロット", slotMode(payload, left.id) === "left");
ok("ISO視点は左側面追加で消えない", payload._isoViews && payload._isoViews[iso0.id]);

const leftDoc = pageStore.createDefaultDocument({});
const leftPage = addAndAttach(leftDoc, payload, { kind: "ortho", orthoMode: "left" });
payload._orthoSlots[leftPage.id].zoom = 1.4;
pageStore.persistFromPayload(leftDoc, payload);
const rightPage = addAndAttach(leftDoc, payload, { kind: "ortho", orthoMode: "right" });
ok("左側面表示中に右側面を追加しても左は left", slotMode(payload, leftPage.id) === "left");
ok("左側面のズームは維持", payload._orthoSlots[leftPage.id].zoom === 1.4);
ok("右側面は独自スロット", slotMode(payload, rightPage.id) === "right");

const topDoc = pageStore.createDefaultDocument({});
const topPage = addAndAttach(topDoc, payload, { kind: "ortho", orthoMode: "top" });
const backPage = addAndAttach(topDoc, payload, { kind: "ortho", orthoMode: "back" });
ok("上面表示中に背面を追加しても上面は top", slotMode(payload, topPage.id) === "top");
ok("背面は独自スロット", slotMode(payload, backPage.id) === "back");

const dupDoc = pageStore.createDefaultDocument({});
const frontA = addAndAttach(dupDoc, payload, { kind: "ortho", orthoMode: "front" });
payload._orthoSlots[frontA.id].panV = 40;
pageStore.persistFromPayload(dupDoc, payload);
const frontB = addAndAttach(dupDoc, payload, { kind: "ortho", orthoMode: "front" });
ok("同じ正面図を複数追加してもカメラは別", frontA.id !== frontB.id);
ok("既存正面のパンは2枚目追加後も残る", payload._orthoSlots[frontA.id].panV === 40);
ok("2枚目正面は初期パン", payload._orthoSlots[frontB.id].panV === 0);
ok("2枚目も front", slotMode(payload, frontA.id) === "front" && slotMode(payload, frontB.id) === "front");

const isoPayload = { _orthoSlots: {}, _isoViews: {} };
const isoDoc = pageStore.createDefaultDocument({});
isoDoc.pages[0].isoView = { preset: "front", pitchDeg: 12, yawDeg: 10, panX: 5, panY: 6, zoom: 1.2 };
pageStore.attachToPayload(isoDoc, isoPayload);
const isoId = isoDoc.pages[0].id;
ok("ISO視点は独立保持", isoPayload._isoViews[isoId].preset === "front" && isoPayload._isoViews[isoId].zoom === 1.2);
const leftId = isoDoc.pages.find(function (p) { return p.orthoMode === "left"; }).id;
isoPayload._orthoSlots[leftId].panU = 33;
pageStore.attachToPayload(isoDoc, isoPayload);
ok("正投影操作後もISO視点を維持", isoPayload._isoViews[isoId].zoom === 1.2
  && isoDoc.pages.find(function (p) { return p.id === leftId; }).orthoState.panU === 33);

ok("表示中ページIDでインデックスを維持", sheetSrc.indexOf("keepPageIndexById(stayId)") >= 0);
ok("オーバーレイrectsはページorthoMode", sheetSrc.indexOf("mode: pageMeta.orthoMode") >= 0);
ok("ISO overlay はページID単位", isoNavSrc.indexOf("viewsByPage") >= 0 && isoNavSrc.indexOf("activePageId") >= 0);
ok("WebGLは表示中ページのstate.mode", orthoNavSrc.indexOf("__CR_orthoViewMetrics(p, st.mode") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
