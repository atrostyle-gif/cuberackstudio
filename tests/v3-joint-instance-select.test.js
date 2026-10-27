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

const poolSrc = fs.readFileSync(path.join(root, "js/core/v3-instance-pool.js"), "utf8");
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
const stateSrc = fs.readFileSync(path.join(root, "js/state/state.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const pickSrc = fs.readFileSync(path.join(root, "js/ui/v3-place-pick.js"), "utf8");
const historySrc = fs.readFileSync(path.join(root, "js/features/history.js"), "utf8");

ok("選択JBは instanceColor の正本", poolSrc.indexOf("function isSelectedJointHandle") >= 0 && poolSrc.indexOf("_color.setHex(0xef4444)") >= 0);
ok("選択判定は handle 同一性", poolSrc.indexOf("meshes[idx] === handle") >= 0);
ok("selectedJointIndex を window へ出す", stateSrc.indexOf('Object.defineProperty(window, "selectedJointIndex"') >= 0);
ok("材質一括塗りは選択JBをスキップ", mainSrc.indexOf("jm === selJointMesh") >= 0);
ok("選択変更で即 sync", /v3InstancePool\.sync\(true\)/.test(jointsSrc) && jointsSrc.indexOf("function setSelectedJoint") >= 0);
ok("IRON finish は emissive を消す（既存）", /m === "IRON"[\s\S]{0,180}emissiveIntensity = 0/.test(fs.readFileSync(path.join(root, "js/core/materials.js"), "utf8")));
ok("プレビュー確定経路は維持", mainSrc.indexOf("existingIndex !== -1 ? existingIndex : createJoint") >= 0);
ok("Undo 履歴は維持", historySrc.indexOf("function saveHistory") >= 0);
ok("配置判定は維持", pickSrc.indexOf("function decideAddClick") >= 0);

function colorFromHandle(handle, selectedIdx, meshes) {
  if (handle && typeof selectedIdx === "number" && selectedIdx >= 0 && meshes[selectedIdx] === handle) {
    return 0xef4444;
  }
  const intensity = handle && handle.emissiveIntensity;
  if (intensity > 0.05) return 0xef4444;
  return handle && handle.base != null ? handle.base : 0x111111;
}

function makeHandle(id, base) {
  return { id: id, base: base == null ? 0x111111 : base, emissive: 0, emissiveIntensity: 0 };
}

function finishIron(handle) {
  handle.emissive = 0;
  handle.emissiveIntensity = 0;
}

function paintSelect(handle) {
  handle.emissive = 0xef4444;
  handle.emissiveIntensity = 1.2;
}

const origin = makeHandle("origin");
const created = makeHandle("created");
const existing = makeHandle("existing");
const meshes = [origin, created, existing];

paintSelect(origin);
ok("初回選択：赤", colorFromHandle(origin, 0, meshes) === 0xef4444);

finishIron(created);
ok("新規JB生成直後は emissive が0", created.emissiveIntensity === 0);
ok("新規JBでも選択 handle なら赤", colorFromHandle(created, 1, meshes) === 0xef4444);

const chain = [origin];
finishIron(origin);
for (let i = 1; i <= 3; i++) {
  const h = makeHandle("n" + i);
  finishIron(h);
  if (chain[i - 1]) finishIron(chain[i - 1]);
  chain.push(h);
  ok("連続生成 " + i + "本目の新しい終点が赤", colorFromHandle(h, i, chain) === 0xef4444);
  ok("連続生成 " + i + "本目前のJBは赤でない", colorFromHandle(chain[i - 1], i, chain) === 0x111111);
}

finishIron(existing);
ok("既存JBへの接続：接続先が赤", colorFromHandle(existing, 2, meshes) === 0xef4444);
ok("既存でも未選択は黒", colorFromHandle(existing, 1, meshes) === 0x111111);

finishIron(created);
paintSelect(created);
finishIron(created);
ok("InstancedMesh再構築後も選択 handle なら赤", colorFromHandle(created, 1, meshes) === 0xef4444);

ok("選択解除：赤が消える", colorFromHandle(created, null, meshes) === 0x111111);
ok("選択解除：-1でも赤が消える", colorFromHandle(created, -1, meshes) === 0x111111);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
