"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failed = [];
let passed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log("PASS  " + name);
  } else {
    failed.push(name + (detail ? " :: " + detail : ""));
    console.log("FAIL  " + name + (detail ? " :: " + detail : ""));
  }
}

const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const meshSrc = fs.readFileSync(path.join(root, "js/core/mesh.js"), "utf8");
const sceneSrc = fs.readFileSync(path.join(root, "js/core/scene.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
const connSrc = fs.readFileSync(path.join(root, "js/parts/connectors.js"), "utf8");
const legsSrc = fs.readFileSync(path.join(root, "js/parts/legs.js"), "utf8");

ok("instance pool が InstancedMesh を使う", poolSrc.indexOf("new THREE.InstancedMesh") >= 0);
ok("instanceId をハンドルへ戻す", poolSrc.indexOf("hit.instanceId") >= 0 && poolSrc.indexOf("hit.object = handle") >= 0);
ok("設計座標を書き換えない", poolSrc.indexOf("joints[") < 0);
ok("createCylinderBetween がプールを使う", meshSrc.indexOf("pool.createConnector") >= 0);
ok("共有ジオメトリは dispose しない", meshSrc.indexOf("v3Shared") >= 0);
ok("scene traverse を毎フレームしない", mainSrc.indexOf("scene.traverse((obj) => {") < 0 || mainSrc.indexOf("hideGridHelpers") >= 0);
ok("animate が instance sync する", mainSrc.indexOf("v3InstancePool.sync") >= 0);
ok("sortObjects 無効化", sceneSrc.indexOf("renderer.sortObjects = false") >= 0);
ok("index が pool を読む", indexSrc.indexOf("v3-instance-pool.js") >= 0);
ok("Joint が instanced handle を使える", jointsSrc.indexOf("createJoint(") >= 0 && jointsSrc.indexOf("v3Instanced") >= 0);
ok("Leg が instanced 登録される", legsSrc.indexOf("registerLeg") >= 0);
ok("脚破棄でプールから外す", legsSrc.indexOf("disposeHandle") >= 0 && legsSrc.indexOf("v3InstancedLeg") >= 0);
ok("カメラ far を拡大", sceneSrc.indexOf("500000") >= 0);
ok("図面用スナップショットを出力", poolSrc.indexOf("exportSnapshot") >= 0 && poolSrc.indexOf("PRODUCT_PREVIEW_SCALE") >= 0);
ok("スナップショット色はsRGB", poolSrc.indexOf("convertLinearToSRGB") >= 0 && poolSrc.indexOf("chartColorSrgb") >= 0);
ok("OFF時はMATERIAL_COLORを使う", poolSrc.indexOf("matColorSrgb") >= 0 && poolSrc.indexOf("MATERIAL_COLOR") >= 0);
ok("選択JBを instanceColor へ載せる", poolSrc.indexOf("isSelectedJointHandle") >= 0 && poolSrc.indexOf("0xef4444") >= 0);
ok("測定ハイライトが instanceColor を上書きする", (function () {
  const iColor = poolSrc.indexOf("function colorFromHandle");
  const iMeas = poolSrc.indexOf("_v3MeasHL", iColor);
  const iSel = poolSrc.indexOf("if (isSelectedJointHandle(handle))", iColor);
  return iColor >= 0 && iMeas >= 0 && iSel >= 0 && iMeas < iSel;
})());
ok("Beam削除は disposeHandle 経路", connSrc.indexOf("function deleteConnectorByMesh") >= 0 && connSrc.indexOf("disposeBeamMesh(beam)") >= 0);
ok("Pole削除は disposeHandle 経路", connSrc.indexOf("disposePoleMesh(pole)") >= 0);
ok("Joint削除は disposeSharedSafe", jointsSrc.indexOf("disposeSharedSafe(jointMeshes[index])") >= 0);
ok("Joint付随 Beam/Pole も dispose", jointsSrc.indexOf("disposeBeamMesh(beams[i])") >= 0 && jointsSrc.indexOf("disposePoleMesh(poles[i])") >= 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
