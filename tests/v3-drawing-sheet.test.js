"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const math = require(path.join(root, "js/app/drawing-math.js"));
const pageStore = require(path.join(root, "js/app/drawing-page-store.js"));
const dimStyle = require(path.join(root, "js/app/drawing-dim-style.js"));
const html = fs.readFileSync(path.join(root, "drawing.html"), "utf8");
const drawingSrc = fs.readFileSync(path.join(root, "js/app/drawing.js"), "utf8");
const sheetSrc = fs.readFileSync(path.join(root, "js/app/drawing-sheet.js"), "utf8");
const captureSrc = fs.readFileSync(path.join(root, "js/app/drawing-capture.js"), "utf8");
const isoNavSrc = fs.readFileSync(path.join(root, "js/app/drawing-iso-nav.js"), "utf8");
const previewSrc = fs.readFileSync(path.join(root, "js/app/drawing-preview.js"), "utf8");
const orthoNavSrc = fs.readFileSync(path.join(root, "js/app/drawing-ortho-nav.js"), "utf8");
const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");

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

ok("50.7 は小数のまま", math.formatDesignMm(50.7) === "50.7");
ok("123.7 は小数のまま", math.formatDesignMm(123.7) === "123.7");
ok("200 は整数表示", math.formatDesignMm(200) === "200");
ok("見積丸めしない（51にしない）", math.formatDesignMm(50.7) !== "51");
ok("A4横 297x210", math.paperMm("A4", "landscape").w === 297 && math.paperMm("A4", "landscape").h === 210);
ok("A4縦 210x297", math.paperMm("A4", "portrait").w === 210 && math.paperMm("A4", "portrait").h === 297);
ok("A3横 420x297", math.paperMm("A3", "landscape").w === 420);

ok("区画スパン", math.baySpans([0, 200, 500]).join(",") === "200,300");
ok("近接座標をまとめる", math.uniqueSorted([0, 0.2, 200]).length === 2);
ok("等区画は ×N 表示", math.summarizeSpans([300, 300, 300, 300, 300]) === "300 mm × 5");
ok("混在区画は列挙", math.summarizeSpans([123.7, 200]) === "123.7 / 200 mm");

const merged = math.mergeBom(
  [{ key: "beam_200", kind: "Beam", qty: 2, lengthMm: 200.5, material: "IRON" }],
  [{ key: "beam_200", kind: "Beam", qty: 99 }, { key: "sideCap", kind: "Part", name: "SideCap", qty: 4, material: "IRON" }]
);
ok("モデル部材を優先し見積重複を除外", merged.length === 2 && merged[0].qty === 2 && merged[0].lengthMm === 200.5);
ok("金物は見積から追加", merged.some(function (r) { return r.key === "sideCap"; }));

const pages = math.planSheetPages(9, true);
ok("部材ありはBOMページを含む", pages[0] === "iso" && pages.some(function (p) { return p.indexOf("bom") === 0; }));
ok("部材なしならISOのみ", math.planSheetPages(0, true).join(",") === "iso");

ok("お客様向け切替を廃止", html.indexOf("お客様向け") < 0 && html.indexOf('name="draw-type"') < 0);
ok("製作用切替を廃止", html.indexOf("製作用") < 0 && html.indexOf('value="both"') < 0);
ok("統合図面", html.indexOf("統合図面") >= 0);
ok("A4/A3", html.indexOf("A4") >= 0 && html.indexOf("A3") >= 0);
ok("縦横", html.indexOf("landscape") >= 0 && html.indexOf("portrait") >= 0);
ok("タイトル・図面番号・作成日", html.indexOf("draw-title") >= 0 && html.indexOf("draw-no") >= 0 && html.indexOf("draw-date") >= 0);
ok("寸法スイッチ", html.indexOf("draw-dims") >= 0);
ok("部材一覧は固定ページ", html.indexOf("draw-page-list") >= 0 && html.indexOf("draw-bom") < 0);
ok("PDFボタン", html.indexOf("PDF / 印刷") >= 0);
ok("フィットプレビュー", html.indexOf("フィット") >= 0 && html.indexOf("draw-stage") >= 0);
ok("複数ページナビ", html.indexOf("page-prev") >= 0 && html.indexOf("page-next") >= 0);
ok("従来エンジンを維持", html.indexOf("js/app/drawing.js") >= 0 && drawingSrc.indexOf("function drawView") >= 0);
ok("シートは drawView を再利用", sheetSrc.indexOf("core.drawView") >= 0);
ok("全面置換していない", sheetSrc.indexOf("エンジン置換ではない") >= 0);
ok("固定セットはISOとBOMを含む", sheetSrc.indexOf('kind: "iso"') >= 0 && sheetSrc.indexOf('kind: "bom"') >= 0);
ok("固定3面 ortho ページ廃止", sheetSrc.indexOf("renderOrthoSingle") >= 0 && sheetSrc.indexOf("lastOrthoRects = {") >= 0);
ok("印刷でページ分割", sheetSrc.indexOf("page-break-after") >= 0 || html.indexOf("page-break-after") >= 0);
ok("3Dキャプチャはカメラを戻す", captureSrc.indexOf("cadRenderer.render(scene, mainCam)") >= 0 || captureSrc.indexOf("renderer.render(scene, mainCam)") >= 0);
ok("メインカメラを書き換えない", captureSrc.indexOf("mainCam.clone") >= 0 && captureSrc.indexOf("mainCam.position.set") < 0);
ok("グリッドをキャプチャから除外", captureSrc.indexOf('type === "GridHelper"') >= 0 && captureSrc.indexOf("groundRingMesh") >= 0);
ok("既存InstancedMeshを再利用", captureSrc.indexOf("isInstancedMesh") >= 0 && captureSrc.indexOf("図面専用モデルは作らない") >= 0);
ok("オフスクリーンrenderer", captureSrc.indexOf("WebGLRenderer") >= 0 && captureSrc.indexOf("preserveDrawingBuffer") >= 0);
ok("キャプチャ材質は復元", captureSrc.indexOf("s.obj.material = s.old") >= 0);
ok("payload に extras", mainSrc.indexOf("v3BuildDrawingExtras") >= 0);
ok("第三角法の明記", sheetSrc.indexOf("第三角法") >= 0);
ok("加工情報を推測しない注記", sheetSrc.indexOf("モデルに無い情報") >= 0);
ok("既存 print を維持", drawingSrc.indexOf("window.print()") >= 0);
ok("従来タブを維持", html.indexOf('data-view="multi"') >= 0);
ok("正投影の線を細く", drawingSrc.indexOf("_lineScale") >= 0);
ok("図面専用カメラを使う", captureSrc.indexOf("applyDrawCamera") >= 0 && captureSrc.indexOf("mainCam.clone") >= 0);
ok("残存インスタンスをキャプチャから除外", captureSrc.indexOf("hideOrphanInstances") >= 0);
ok("3D操作はISOページ領域", html.indexOf("draw-iso-hit") >= 0 && html.indexOf("iso-view-nav") >= 0);
ok("視点ボタンがある", isoNavSrc.indexOf("アイソメ") >= 0 && isoNavSrc.indexOf("フィット") >= 0 && html.indexOf("iso-view-nav") >= 0);
ok("保存データへ視点を書かない", mainSrc.indexOf("__crDrawCam") < 0 && captureSrc.indexOf("localStorage.setItem") < 0);
ok("図面内WebGLプレビュー", html.indexOf("drawing-preview.js") >= 0 && previewSrc.indexOf("requestAnimationFrame") >= 0);
ok("操作中JPEGを連続生成しない", isoNavSrc.indexOf("if (!canLocal()) schedulePreview") >= 0);
ok("スナップショット転送", captureSrc.indexOf("buildPreviewSnapshot") >= 0 && poolSrc.indexOf("exportSnapshot") >= 0);
ok("CAD部材の二重管理をしない", previewSrc.indexOf("部材正本は持たない") >= 0);
ok("カラーチャートはCAD経由", html.indexOf("draw-colorchart") >= 0 && captureSrc.indexOf("CUBERACK_DRAWING_COLORCHART") >= 0 && captureSrc.indexOf("toggleColorChart") >= 0);
ok("独立色マスターを作らない", html.indexOf("LENGTH_COLOR_MAP") < 0);
ok("印刷照明は白背景", captureSrc.indexOf("paperBg") >= 0 && captureSrc.indexOf("0xffffff") >= 0);
ok("低性能向け品質", html.indexOf("draw-quality") >= 0 && previewSrc.indexOf('quality === "low"') >= 0);
ok("正投影独立操作", orthoNavSrc.indexOf("orthoPan") >= 0 && orthoNavSrc.indexOf("orthoZoom") >= 0 && html.indexOf("draw-ortho-overlay") >= 0);
ok("正投影に自由回転なし", orthoNavSrc.indexOf("orbit(") < 0);
ok("正投影視点切替", orthoNavSrc.indexOf("back") >= 0 && orthoNavSrc.indexOf("left") >= 0 && orthoNavSrc.indexOf("bottom") >= 0);
ok("正投影はセッション保持", orthoNavSrc.indexOf("セッション中のみ保持") >= 0);
ok("背面・左・下面の投影", drawingSrc.indexOf('mode === "back"') >= 0 && drawingSrc.indexOf('mode === "left"') >= 0 && drawingSrc.indexOf('mode === "bottom"') >= 0);
ok("寸法は図形に追従", drawingSrc.indexOf("offMm") >= 0 && drawingSrc.indexOf("camZoom") >= 0);
ok("寸法は設計実寸", drawingSrc.indexOf("payload.overall") >= 0 && drawingSrc.indexOf("見積の整数丸めは使わない") >= 0);
ok("印刷前に高品質キャプチャ", sheetSrc.indexOf("captureHighForPrint") >= 0);
ok("カラーチャートはSKU長さ色", poolSrc.indexOf("getPoleColorLengthMm") >= 0 && poolSrc.indexOf("getLengthColor") >= 0 && poolSrc.indexOf("convertLinearToSRGB") >= 0);
ok("図面プレビューは凡例と一致する材質", previewSrc.indexOf("MeshBasicMaterial") >= 0 && previewSrc.indexOf("NoToneMapping") >= 0);
ok("カラーOFFはStandard材質", previewSrc.indexOf("MeshStandardMaterial") >= 0 && previewSrc.indexOf("finishes") >= 0);
ok("HQキャプチャはカラー時トーンマップなし", captureSrc.indexOf("NoToneMapping") >= 0);
ok("HQキャプチャOFFはCAD仕上げを使う", captureSrc.indexOf("applyMaterialFinish") >= 0 && captureSrc.indexOf("Math.max(neu.metalness") < 0);
ok("使用長さ凡例", captureSrc.indexOf("usedLengths") >= 0 && sheetSrc.indexOf("drawPrintedLegend") >= 0);
ok("カラーOFFで凡例非表示", sheetSrc.indexOf("usedLegendRows") >= 0 && sheetSrc.indexOf("if (!on) return []") >= 0);
ok("凡例はスタンプ配置", sheetSrc.indexOf("draw-legend-stamp") >= 0 && sheetSrc.indexOf("drawPrintedLegend") >= 0);
ok("外々寸法は部材チェーン", math.computeRackOverall && math.chainOuterMm([200, 200]) > 400);
ok("寸法欄は横並び", sheetSrc.indexOf("dimPanelHeight") >= 0 && sheetSrc.indexOf("chunks.push") >= 0);
ok("captureはcomputeRackOverall", captureSrc.indexOf("computeRackOverall") >= 0);
ok("縦寸法は90度回転", drawingSrc.indexOf("rotate(-Math.PI / 2)") >= 0 && drawingSrc.indexOf("dimLabelBox") >= 0);
ok("寸法ヒットは文字含む", drawingSrc.indexOf("distToRect") >= 0 && drawingSrc.indexOf("dimScreenTol") >= 0);
ok("正投影は実形状", drawingSrc.indexOf("drawCapsule") >= 0 && drawingSrc.indexOf("depthW") >= 0);
ok("正投影WebGL", previewSrc.indexOf("attachOrtho") >= 0 && previewSrc.indexOf("OrthographicCamera") >= 0);
ok("側面WebGLはflipX", previewSrc.indexOf("frame.flipX") >= 0);
ok("スロットmodeで投影を上書きしない", drawingSrc.indexOf("slotCamEarly.mode !== mode") >= 0);
ok("寸法線ドラッグは値を変えない", drawingSrc.indexOf("offsetMm") >= 0 && drawingSrc.indexOf("__CR_beginDimDrag") >= 0);
ok("寸法線は最近傍を選ぶ", drawingSrc.indexOf("candidates.sort") >= 0 && drawingSrc.indexOf("distToSeg") >= 0);
ok("寸法線とパンは競合しない", orthoNavSrc.indexOf('type: "dim"') >= 0 && orthoNavSrc.indexOf('type: "pan"') >= 0);
ok("Shift+左は回転しない", isoNavSrc.indexOf("dragging.button === 0") >= 0 && isoNavSrc.indexOf("ev.shiftKey") >= 0);
ok("寸法線を用紙端で固定しない", drawingSrc.indexOf("rectRight - 72") < 0 && drawingSrc.indexOf("rectBottom - 36") < 0);
ok("カーソル基準ズーム", orthoNavSrc.indexOf("orthoZoomAt") >= 0);
ok("画面ピクセルを用紙座標へ", orthoNavSrc.indexOf("paperDelta") >= 0);
ok("ISOページ視点を独立保持", isoNavSrc.indexOf("viewsByPage") >= 0 && isoNavSrc.indexOf("_isoViews") >= 0);

const doc = pageStore.createDefaultDocument({ drawingNoBase: "D-20261023" });
ok("初期8ページ", doc.pages.length === 8 && doc.pages[0].kind === "iso" && doc.pages[1].kind === "bom");
ok("固定順はISO,BOM,六面", doc.pages.map(function (p) { return p.kind === "ortho" ? p.orthoMode : p.kind; }).join(",") === "iso,bom,front,back,left,right,top,bottom");
ok("初期枝番01-08", doc.pages.map(function (p) { return p.branch; }).join(",") === "01,02,03,04,05,06,07,08");
ok("図面番号枝番表示", pageStore.fullDrawingNo(doc, doc.pages[2]).indexOf("D-20261023-03") === 0);
ok("寸法文字サイズ選択肢", dimStyle.FONT_SIZES.indexOf(3.5) >= 0);
ok("印刷チェック一覧", html.indexOf("draw-page-print") >= 0 && html.indexOf("draw-page-list") >= 0 && html.indexOf("draw-print-all") >= 0);
ok("追加・削除UIを撤去", html.indexOf("draw-page-add-btn") < 0 && html.indexOf("draw-page-menu") < 0);
ok("図面設定は折りたたみ", html.indexOf("draw-page-settings") >= 0 && html.indexOf("draw-edit-kind") < 0);
ok("寸法インスペクタ", html.indexOf("draw-dim-inspector") >= 0 && html.indexOf("draw-dim-font") >= 0);
ok("空ドキュメントは8種へ移行", pageStore.loadDocument({ version: 1, pages: [] }).pages.length === 8);
const editDoc = pageStore.createDefaultDocument({ drawingNoBase: "D-1" });
const front = editDoc.pages.find(function (p) { return p.orthoMode === "front"; });
const brKeep = front.branch;
pageStore.updatePage(editDoc, front.id, { title: "正面カスタム" });
ok("編集で枝番維持", front.branch === brKeep && front.orthoMode === "front" && front.title === "正面カスタム");
ok("Rev欄", html.indexOf("draw-rev") >= 0);
ok("CAD保存にdrawingDocument", fs.readFileSync(path.join(root, "js/features/file.js"), "utf8").indexOf("drawingDocument") >= 0);
ok("寸法線と文字のヒット分離", drawingSrc.indexOf('hitPart: "label"') >= 0);
ok("オーバーレイは表示中ページの投影", sheetSrc.indexOf("function activeOrthoRects") >= 0 && sheetSrc.indexOf("keepPageIndexById") >= 0);
ok("全ページ描画後の lastOrthoRects を表示中カメラに使わない", sheetSrc.indexOf("syncPage(active, lastOrthoRects)") < 0 && sheetSrc.indexOf("syncPage(activePageMeta, lastOrthoRects)") < 0);
ok("ensureStateはrects.modeで既存カメラを上書きしない", orthoNavSrc.indexOf("if (mode && states[k].mode !== mode)") < 0);
ok("全ページの投影をページIDに固定", orthoNavSrc.indexOf("clampStatesToPages") >= 0 && orthoNavSrc.indexOf("overlayMode") >= 0);
ok("旧パネルアイコン非表示", fs.readFileSync(path.join(root, "index.html"), "utf8").indexOf("#v3-legacy-panel-toggle{ display:none") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
