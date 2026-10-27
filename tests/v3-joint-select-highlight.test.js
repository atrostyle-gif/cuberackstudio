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

const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const jointsSrc = fs.readFileSync(path.join(root, "js/parts/joints.js"), "utf8");
const pickSrc = fs.readFileSync(path.join(root, "js/ui/v3-place-pick.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

ok("選択復元関数がある", mainSrc.indexOf("function restoreSelectedJointVisual") >= 0);
ok("hidePreview の後に選択赤を戻す", /function hidePreview\(\) \{[\s\S]*?resetHighlight\?\.\(\);\s*restoreSelectedJointVisual\(\);/.test(mainSrc));
ok("resetHighlight の後に選択赤を戻す", /function resetHighlight\(\) \{[\s\S]*?restoreSelectedJointVisual\(\);/.test(mainSrc));
ok("setHighlight は選択JBを上書きしない", mainSrc.indexOf("if (mesh === selectedJointMesh()) return;") >= 0);
ok("配置先ハイライト後も選択を復元", /function highlightPlaceDest\([\s\S]*?restoreSelectedJointVisual\(\);/.test(mainSrc));
ok("選択時に instance pool を同期", /emissiveIntensity = 1\.2;[\s\S]{0,80}v3InstancePool/.test(jointsSrc));
ok("選択解除時も pool を同期", /選択中のジョイント: なし[\s\S]{0,120}v3InstancePool/.test(jointsSrc));
ok("プレビュー確定経路は維持", mainSrc.indexOf("setSelectedJoint(targetIndex)") >= 0 && mainSrc.indexOf("hidePreview()") >= 0);
ok("place-pick 判定は維持", pickSrc.indexOf("function decideAddClick") >= 0);
ok("index が更新キャッシュを読む", indexSrc.indexOf("main.js?v=20261027-h1") >= 0 && indexSrc.indexOf("joints.js?v=20261027-msdel1") >= 0);

function makeMat(name) {
  return { name: name, emissive: 0, intensity: 0 };
}

function simulateAddHighlight(opts) {
  opts = opts || {};
  const selectedIdx = opts.selectedIdx;
  const destIdx = opts.destIdx;
  const joints = [
    { mat: makeMat("j0") },
    { mat: makeMat("j1") },
    { mat: makeMat("j2") },
  ];
  let highlighted = null;
  let original = null;
  let selected = selectedIdx;

  function paintSelected(idx) {
    if (typeof selected === "number" && selected >= 0 && joints[selected]) {
      joints[selected].mat.emissive = 0;
      joints[selected].mat.intensity = 0;
    }
    selected = idx;
    if (typeof idx !== "number" || idx < 0) return;
    joints[idx].mat.emissive = 0xef4444;
    joints[idx].mat.intensity = 1.2;
  }

  function resetHl() {
    if (highlighted == null) return;
    joints[highlighted].mat = original;
    highlighted = null;
    original = null;
    if (typeof selected === "number" && selected >= 0) paintSelected(selected);
  }

  function setHl(idx) {
    if (idx === selected) return;
    if (highlighted === idx) return;
    resetHl();
    original = joints[idx].mat;
    joints[idx].mat = makeMat("hl");
    joints[idx].mat.emissive = 0xef4444;
    highlighted = idx;
  }

  paintSelected(selectedIdx);
  setHl(destIdx);
  paintSelected(destIdx);
  resetHl();
  return joints.map(function (j) { return j.mat.emissive; });
}

const afterBeam = simulateAddHighlight({ selectedIdx: 0, destIdx: 1 });
ok("初回JB選択で赤くなる", afterBeam[1] === 0xef4444);
ok("Beam追加後も選択JBが赤い", afterBeam[1] === 0xef4444);
ok("元のJBは赤が消える", afterBeam[0] === 0);

const afterPole = simulateAddHighlight({ selectedIdx: 1, destIdx: 2 });
ok("Pole追加後も選択JBが赤い", afterPole[2] === 0xef4444 && afterPole[1] === 0);

const keepSel = simulateAddHighlight({ selectedIdx: 0, destIdx: 0 });
ok("選択JBへ hover 差し替えしない", keepSel[0] === 0xef4444);

function simulateDeselect() {
  const joints = [{ mat: makeMat("j0") }];
  let selected = 0;
  joints[0].mat.emissive = 0xef4444;
  function paintSelected(idx) {
    if (typeof selected === "number" && selected >= 0) {
      joints[selected].mat.emissive = 0;
      joints[selected].mat.intensity = 0;
    }
    selected = idx;
  }
  paintSelected(null);
  if (typeof selected === "number" && selected >= 0) {
    joints[0].mat.emissive = 0xef4444;
  }
  return joints[0].mat.emissive;
}
ok("選択解除では赤が消える", simulateDeselect() === 0);

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
