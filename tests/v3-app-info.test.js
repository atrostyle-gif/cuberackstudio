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

const sandbox = { window: {}, console: console };
sandbox.window.window = sandbox.window;
vm.runInNewContext(
  fs.readFileSync(path.join(root, "js/ui/v3-app-info.js"), "utf8"),
  sandbox,
  { filename: "v3-app-info.js" }
);

const info = sandbox.window.v3AppInfo;
ok("正本がある", !!info);
ok("製品バージョン 3.1.0", info.product === "3.1.0");
ok("表示は v3.1.0", info.productLabel() === "v3.1.0");
ok("shortLabel は製品版のみ", info.shortLabel() === "v3.1.0");
ok("内部フェーズは残す", info.phase === "CUI-3B.1");
ok("内部ラベルにフェーズを含む", info.internalLabel() === "v3.1.0 · CUI-3B.1");
ok("shortLabel に CUI を出さない", info.shortLabel().indexOf("CUI") < 0);

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const northSrc = fs.readFileSync(path.join(root, "js/ui/v3-north.js"), "utf8");
const verBtn = indexSrc.slice(
  indexSrc.indexOf('id="v3-north-ver"'),
  indexSrc.indexOf("</button>", indexSrc.indexOf('id="v3-north-ver"'))
);

ok("ヘッダー静的表示は v3.1.0", verBtn.indexOf(">v3.1.0<") >= 0);
ok("ヘッダーボタンに CUI-3B.1 を出さない", verBtn.indexOf("CUI-3B.1") < 0);
ok("ヘッダーに v3.0.0 を残さない", verBtn.indexOf("v3.0.0") < 0);
ok("フェーズ要素は hidden", /id="v3-north-ver-phase"[^>]*hidden/.test(verBtn));
ok("CSS でフェーズ非表示", indexSrc.indexOf(".v3-north-ver-phase{ display:none; }") >= 0);
ok("app-info キャッシュ", indexSrc.indexOf("v3-app-info.js?v=20261027-v31") >= 0);
ok("north キャッシュ", indexSrc.indexOf("v3-north.js?v=20261027-v31") >= 0);
ok("ヘッダーは productLabel を使う", northSrc.indexOf("info.productLabel()") >= 0);
ok("通常ダイアログは製品バージョンのみ", northSrc.indexOf('row("製品バージョン", info.productLabel())') >= 0);
ok("フェーズは STAFF 時のみ", northSrc.indexOf("実装フェーズ") >= 0 && northSrc.indexOf("isCubeRackStaffMode") >= 0);

const drawingSrc = fs.readFileSync(path.join(root, "drawing.html"), "utf8");
const estimateSrc = fs.readFileSync(path.join(root, "estimate.html"), "utf8");
const helpSrc = fs.readFileSync(path.join(root, "help.html"), "utf8");
ok("図面に旧製品版を出さない", drawingSrc.indexOf("v3.0.0") < 0 && drawingSrc.indexOf("CUI-3B.1") < 0);
ok("見積に旧製品版を出さない", estimateSrc.indexOf("v3.0.0") < 0 && estimateSrc.indexOf("CUI-3B.1") < 0);
ok("ヘルプに旧製品版を出さない", helpSrc.indexOf("v3.0.0") < 0 && helpSrc.indexOf("CUI-3B.1") < 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
