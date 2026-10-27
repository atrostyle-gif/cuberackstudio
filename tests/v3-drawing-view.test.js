"use strict";

const path = require("path");
const fs = require("fs");
const view = require(path.join(__dirname, "..", "js/app/drawing-view.js"));

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

function nearly(a, b, eps) {
  return Math.abs(a - b) < (eps || 1e-6);
}

const front = view.directionOf("front");
ok("正面は Three +Z", nearly(front.z, 1, 1e-3) && nearly(front.x, 0, 1e-3) && nearly(front.y, 0, 1e-3));
const back = view.directionOf("back");
ok("背面は Three -Z", nearly(back.z, -1, 1e-3) && nearly(back.x, 0, 1e-3));
const left = view.directionOf("left");
ok("左側面は Three -X", nearly(left.x, -1, 1e-3) && nearly(left.z, 0, 1e-3));
const right = view.directionOf("right");
ok("右側面は Three +X", nearly(right.x, 1, 1e-3) && nearly(right.z, 0, 1e-3));
const top = view.directionOf("top");
ok("上面は Three +Y", top.y > 0.99 && Math.abs(top.x) < 0.02);
const bottom = view.directionOf("bottom");
ok("下面は Three -Y", bottom.y < -0.99 && Math.abs(bottom.x) < 0.02);
const iso = view.directionOf("iso");
ok("アイソメは斜め", iso.x > 0.4 && iso.y > 0.3 && iso.z > 0.4);

const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 600, y: 1500, z: 1500 } };
const st = view.applyPreset("front", box, 1.6);
const pose = view.cameraPose(st);
ok("正面カメラは +Z 側", pose.position.z > pose.target.z && nearly(pose.position.x, pose.target.x, 1));
const backPose = view.cameraPose(view.applyPreset("back", box, 1.6));
ok("背面カメラは -Z 側", backPose.position.z < backPose.target.z);
const leftPose = view.cameraPose(view.applyPreset("left", box, 1.6));
ok("左カメラは -X 側", leftPose.position.x < leftPose.target.x);
const rightPose = view.cameraPose(view.applyPreset("right", box, 1.6));
ok("右カメラは +X 側", rightPose.position.x > rightPose.target.x);
const topPose = view.cameraPose(view.applyPreset("top", box, 1.6));
ok("上カメラは +Y 側", topPose.position.y > topPose.target.y);
const botPose = view.cameraPose(view.applyPreset("bottom", box, 1.6));
ok("下カメラは -Y 側", botPose.position.y < botPose.target.y);

const orb = view.orbit(st, 40, 0, 200, 120);
ok("回転後は自由視点", orb.preset === "free" && orb.theta !== st.theta);
const panned = view.pan(st, 30, 0, 200, 120);
ok("パンでターゲットが動く", panned.target.x !== st.target.x || panned.target.z !== st.target.z);
const zoomed = view.zoomBy(st, -400);
ok("ホイールでズームイン", zoomed.zoom > st.zoom && zoomed.radius < st.radius);
ok("ズーム上限", view.clampZoom(99) === view.ZOOM_MAX);
ok("ズーム下限", view.clampZoom(0) === view.ZOOM_MIN);
const over = view.zoomBy(Object.assign({}, st, { zoom: view.ZOOM_MAX, radius: st.fitRadius / view.ZOOM_MAX }), -800);
ok("ズームは上限で止まる", over.zoom === view.ZOOM_MAX);

const fitted = view.fitKeepAngle(panned, box, 1.6);
ok("フィットは角度維持", nearly(fitted.theta, panned.theta) && nearly(fitted.phi, panned.phi) && fitted.zoom === 1);
ok("フィットは中央へ", nearly(fitted.target.x, 300, 1) && nearly(fitted.target.z, 750, 1));

const src = fs.readFileSync(path.join(__dirname, "..", "js/app/drawing-capture.js"), "utf8");
ok("CADカメラを書き換えない", src.indexOf("mainCam.clone") >= 0 && src.indexOf("mainCam.position.set") < 0);
ok("キャプチャ重複をキューする", src.indexOf("captureBusy") >= 0 && src.indexOf("captureQueued") >= 0);
ok("軽量プレビューと高品質を分ける", src.indexOf('quality === "preview"') >= 0 && src.indexOf("withProductThickness") >= 0);

const fitted2 = view.orthoFit(view.orthoPan(view.orthoDefault("front"), 40, 10, 2));
ok("正投影パン後フィットは原点", fitted2.panU === 0 && fitted2.panV === 0 && fitted2.zoom === 1);
const panR = view.orthoPan(view.orthoDefault("left"), 40, 0, 2);
ok("右ドラッグは panU 減少（図が右へ）", panR.panU < 0);
const panD = view.orthoPan(view.orthoDefault("right"), 0, 30, 2);
ok("下ドラッグは panV 減少（図が下へ）", panD.panV < 0);
const zoomKeep = view.orthoZoomAt(view.orthoDefault("front"), -400, { u: 100, v: -50 }, 300, -750);
ok("カーソル位置ズームは pan を補正", zoomKeep.zoom > 1 && Number.isFinite(zoomKeep.panU) && Number.isFinite(zoomKeep.panV));
ok("UV投影は左右を分離", view.projectUv(0, 0, 100, "right").u > 0 && view.projectUv(0, 0, 100, "left").u < 0);
const oz = view.orthoZoom(view.orthoDefault("top"), -400);
ok("正投影ズームイン", oz.zoom > 1);
ok("正投影プリセットは回転しない", view.orthoPreset("left").mode === "left" && view.orthoPreset("back").mode === "back");
ok("正投影に自由回転なし", typeof view.orthoOrbit !== "function");
const ofront = view.orthoFrame(view.orthoDefault("front"), box, { w: 400, h: 300 }, 1, { minU: 0, maxU: 600, minV: -1500, maxV: 0 });
ok("正投影カメラは正面+Z", ofront.position.z > ofront.target.z && Math.abs(ofront.position.x - ofront.target.x) < 1);
const otop = view.orthoFrame(view.orthoDefault("top"), box, { w: 400, h: 300 }, 1, { minU: 0, maxU: 600, minV: 0, maxV: 1500 });
ok("正投影カメラは上面+Y", otop.position.y > otop.target.y);

const isoNav = fs.readFileSync(path.join(__dirname, "..", "js/app/drawing-iso-nav.js"), "utf8");
ok("左ドラッグ回転", isoNav.indexOf("orbit(") >= 0);
ok("Shift+左ドラッグはパン", isoNav.indexOf("shiftKey") >= 0 && isoNav.indexOf("dragging.shift") >= 0);
ok("右ドラッグパン", isoNav.indexOf("pan(") >= 0);
ok("ホイールズーム", isoNav.indexOf("zoomBy(") >= 0);
ok("ダブルクリック初期フィット", isoNav.indexOf("dblclick") >= 0 && isoNav.indexOf('applyPreset("iso"') >= 0);
ok("3D領域外では操作しない", isoNav.indexOf("pageActive") >= 0);
ok("右クリックメニュー抑制", isoNav.indexOf("contextmenu") >= 0);
ok("操作中はローカルWebGLを優先", isoNav.indexOf("canLocal") >= 0 && isoNav.indexOf("schedulePreview") >= 0);
ok("印刷時は高品質キャプチャ", isoNav.indexOf("captureHighForPrint") >= 0);

const fileSrc = fs.readFileSync(path.join(__dirname, "..", "js/features/file.js"), "utf8");
ok("CAD保存に図面視点を含めない", fileSrc.indexOf("__crDrawCam") < 0 && fileSrc.indexOf("captures.view") < 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
