"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const northSrc = fs.readFileSync(path.join(root, "js/ui/v3-north.js"), "utf8");
const cadSrc = fs.readFileSync(path.join(root, "js/ui/v3-cad-toolbar.js"), "utf8");

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

function sliceBetween(src, start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + 1);
  if (a < 0 || b < 0) return "";
  return src.slice(a, b);
}

const viewMenu = sliceBetween(indexSrc, 'id="v3-north-view-menu"', 'id="v3-north-more"');
const moreMenu = sliceBetween(indexSrc, 'id="v3-north-more-menu"', 'id="v3-staff-entry-btn"');

ok("表示アイコンは Lucide eye", indexSrc.indexOf("M2.062 12.348") >= 0 && indexSrc.indexOf('aria-label="表示"') >= 0);
ok("開くはメニューではない", indexSrc.indexOf('id="v3-north-open-menu"') < 0 && indexSrc.indexOf("デザインを開く") < 0);
ok("その他アイコンは Lucide ellipsis", indexSrc.indexOf('id="v3-north-more"') >= 0 && indexSrc.indexOf('aria-label="その他"') >= 0);

ok("表示メニューはグリッドと背景写真", viewMenu.indexOf("グリッド") >= 0 && viewMenu.indexOf("背景写真") >= 0);
ok("表示メニューは2項目", (viewMenu.match(/role="menuitem"/g) || []).length === 2);
ok("表示にカラーチャートなし", viewMenu.indexOf("カラーチャート") < 0);
ok("表示に操作ヘルプなし", viewMenu.indexOf("操作ヘルプ") < 0);

ok("開くメニュー項目は無い", northSrc.indexOf("v3-north-open-menu") < 0 && northSrc.indexOf("v3-north-open-design") < 0);

ok("その他メニューは5項目", (moreMenu.match(/role="menuitem"/g) || []).length === 5);
ok("その他に図面・ヘルプ・説明書・FIT・UI初期化", moreMenu.indexOf("図面を開く") >= 0 && moreMenu.indexOf("操作ヘルプ") >= 0 && moreMenu.indexOf("説明書") >= 0 && moreMenu.indexOf("CUBERACK FIT") >= 0 && moreMenu.indexOf("UI配置を初期化") >= 0);
ok("その他にカラーチャートなし", moreMenu.indexOf("カラーチャート") < 0);
ok("その他にグリッドなし", moreMenu.indexOf("グリッド") < 0);

ok("ヘッダーメニューにカラーチャート重複なし", !/id="v3-north-(view|open|more)-menu"[\s\S]{0,800}カラーチャート/.test(indexSrc));
ok("CADツールバーにカラーチャート専用アイコン", cadSrc.indexOf('cmd: "colorchart"') >= 0 && cadSrc.indexOf("11-material.svg") >= 0);
ok("CADツールバーに図面出力", cadSrc.indexOf('cmd: "drawing"') >= 0 && cadSrc.indexOf("図面出力") >= 0 && cadSrc.indexOf("#btn-open-drawing") >= 0);

ok("既存ハンドラへ委譲", northSrc.indexOf("clickLegacy") >= 0 && northSrc.indexOf("data-click") >= 0);
ok("メニューは排他開閉", northSrc.indexOf("NORTH_MENUS") >= 0 && northSrc.indexOf("closeMenus()") >= 0);
ok("Escで閉じる", northSrc.indexOf('ev.key === "Escape"') >= 0);
ok("外側クリックで閉じる", northSrc.indexOf(".v3-north-menu-wrap") >= 0);
ok("画面端ではみ出さない", northSrc.indexOf("placeMenu") >= 0);
ok("リセットは既存confirm", fs.readFileSync(path.join(root, "main.js"), "utf8").indexOf("すべてのパーツを削除して初期状態に戻します") >= 0);
ok("コンパクトなメニューCSS", indexSrc.indexOf("font-size:14px") >= 0 && indexSrc.indexOf("height:38px") >= 0);
ok("ヘッダー高さは維持", indexSrc.indexOf("--v3-north-h:48px") >= 0);
ok("並べ替えcaptureはしきい値後", northSrc.indexOf("setPointerCapture") >= 0 && northSrc.indexOf("しきい値前に capture") >= 0);
ok("pointerdownではcaptureしない", /pointerdown[\s\S]{0,900}setPointerCapture/.test(northSrc) === false);
ok("材質アイコンは維持", cadSrc.indexOf("swatch-book.svg") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
