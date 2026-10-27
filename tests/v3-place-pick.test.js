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

const pickSrc = fs.readFileSync(path.join(root, "js/ui/v3-place-pick.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");
const boardsSrc = fs.readFileSync(path.join(root, "js/parts/boards.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const historySrc = fs.readFileSync(path.join(root, "js/features/history.js"), "utf8");
const eastSrc = fs.readFileSync(path.join(root, "js/ui/v3-east-rail.js"), "utf8");

ok("place-pick を index が読む", indexSrc.indexOf("js/ui/v3-place-pick.js") >= 0);
ok("main が decideAddClick を使う", mainSrc.indexOf("decideAddClick") >= 0 && mainSrc.indexOf("rememberPlaceCandidate") >= 0);
ok("click は配置をジョイント選択より優先", mainSrc.indexOf("プレビュー確定へ進む（ジョイント選択へ落とさない）") >= 0);
ok("ハイライト対象を配置先に合わせる", mainSrc.indexOf("highlightPlaceDest") >= 0 && mainSrc.indexOf("v3InstancePool?.note") >= 0);
ok("板はプレビュー確定を優先", mainSrc.indexOf("decideBoardClick") >= 0 && mainSrc.indexOf("hitBoardPreviewMesh") >= 0);
ok("4点選択そのものは残す", boardsSrc.indexOf("addJointToBoardSelection") >= 0 && boardsSrc.indexOf("selectedJoints4.length >= 4") >= 0);
ok("板 Undo 履歴は残す", boardsSrc.indexOf('saveHistory?.("add board")') >= 0);
ok("部材追加 Undo は残す", mainSrc.indexOf('saveHistory", "add "') >= 0 || mainSrc.indexOf('saveHistory", "add " + uiPartType') >= 0);
ok("history モジュールは維持", historySrc.indexOf("function saveHistory") >= 0 || historySrc.indexOf("saveHistory") >= 0);
ok("判定は canvas rect", mainSrc.indexOf("function projectWorldToClient") >= 0 && mainSrc.indexOf("getBoundingClientRect()") >= 0);
ok("window.innerWidth で配置判定しない", !/function projectWorldToClient[\s\S]{0,400}innerWidth/.test(mainSrc));
ok("East Rail 幅変更は resizeV3View", eastSrc.indexOf("resizeV3View") >= 0);
ok("半径を無条件に広げない", pickSrc.indexOf("PLACE_HIT_PX = 22") >= 0 && mainSrc.indexOf("pickJointIndexByClientPos(e.clientX, e.clientY, 28)") >= 0);

const sandbox = { window: {}, console: console };
sandbox.window.window = sandbox.window;
vm.runInNewContext(pickSrc, sandbox);
const pick = sandbox.window.v3PlacePick;
ok("place-pick 起動", !!(pick && pick.decideAddClick && pick.makePlaceCandidate));

function orthoProject(scale, origin) {
  origin = origin || { x: 100, y: 100 };
  scale = scale || 1;
  return function (pos) {
    return { x: origin.x + pos.x * scale, y: origin.y - pos.z * scale };
  };
}

function jointsOnX(step, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ x: i * step, y: 0, z: 0 });
  return out;
}

const joints = jointsOnX(25, 12);
const lens = [25, 50, 100, 150, 200];
lens.forEach(function (len) {
  const destIdx = len / 25;
  const cand = pick.makePlaceCandidate({
    kind: "beam",
    fromJoint: 0,
    fromPos: joints[0],
    toPos: joints[destIdx],
    lengthMm: len,
    axis: "x",
    dir: 1,
    toJoint: destIdx,
  });
  pick.setCandidate(cand);
  const project = orthoProject(1, { x: 0, y: 0 });
  const click = project(joints[destIdx]);
  const nearOther = destIdx > 1 ? destIdx - 1 : 1;
  const decided = pick.decideAddClick({
    candidate: cand,
    selectedJointIndex: 0,
    nearJointIndex: nearOther,
    clientX: click.x,
    clientY: click.y,
    project: project,
    joints: joints,
    lengthMm: len,
    canAdd: true,
  });
  ok("短い Beam " + len + "mm は正しい候補", decided.action === "place" && cand.toJoint === destIdx, "action=" + decided.action + " dest=" + cand.toJoint);
});

{
  const cand = pick.makePlaceCandidate({
    kind: "beam",
    fromJoint: 0,
    fromPos: joints[0],
    toPos: joints[8],
    lengthMm: 200,
    axis: "x",
    dir: 1,
    toJoint: 8,
  });
  const project = orthoProject(1, { x: 0, y: 0 });
  const dest = project(joints[8]);
  const mid = project(joints[2]);
  ok("ハイライト対象は配置先ジョイント", cand.toJoint === 8);
  const onDest = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 8,
    clientX: dest.x, clientY: dest.y, project: project, joints: joints, lengthMm: 200, canAdd: true,
  });
  ok("有効プレビューから追加確定", onDest.action === "place");
  const onSeg = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 2,
    clientX: mid.x, clientY: mid.y, project: project, joints: joints, lengthMm: 200, canAdd: true,
  });
  ok("クリック確定後にジョイント選択へ流れない", onSeg.action === "place");
  const away = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 11,
    clientX: 900, clientY: 900, project: project, joints: joints, lengthMm: 200, canAdd: true,
  });
  ok("候補範囲外の別ジョイントは選択", away.action === "select-joint" && away.jointIndex === 11);
  const blocked = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 8,
    clientX: dest.x, clientY: dest.y, project: project, joints: joints, lengthMm: 200, canAdd: true,
    isBlocked: function () { return true; },
  });
  ok("無効な候補では誤生成しない", blocked.action === "cancel-preview");
  const drag = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 8,
    clientX: dest.x, clientY: dest.y, project: project, joints: joints, lengthMm: 200, canAdd: true,
    didDrag: true,
  });
  ok("視点回転ドラッグは無視", drag.action === "ignore");
}

{
  const poleJoints = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 50, z: 0 },
    { x: 0, y: 100, z: 0 },
  ];
  const cand = pick.makePlaceCandidate({
    kind: "pole",
    fromJoint: 0,
    fromPos: poleJoints[0],
    toPos: poleJoints[1],
    lengthMm: 50,
    axis: "y",
    dir: 1,
    toJoint: 1,
  });
  const project = function (pos) { return { x: 40, y: 200 - pos.y }; };
  const click = project(poleJoints[1]);
  const decided = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 1,
    clientX: click.x, clientY: click.y, project: project, joints: poleJoints, lengthMm: 50, canAdd: true,
  });
  ok("短い Pole 50mm は正しい候補", decided.action === "place" && cand.kind === "pole");
}

{
  const zoom = orthoProject(4, { x: 50, y: 80 });
  const cand = pick.makePlaceCandidate({
    kind: "beam", fromJoint: 0, fromPos: joints[0], toPos: joints[4],
    lengthMm: 100, axis: "x", dir: 1, toJoint: 4,
  });
  const click = zoom(joints[4]);
  const decided = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 3,
    clientX: click.x, clientY: click.y, project: zoom, joints: joints, lengthMm: 100, canAdd: true,
  });
  ok("ズーム後も同じ候補", decided.action === "place");
}

{
  const shifted = orthoProject(1, { x: 400, y: 120 });
  const cand = pick.makePlaceCandidate({
    kind: "beam", fromJoint: 0, fromPos: joints[0], toPos: joints[2],
    lengthMm: 50, axis: "x", dir: 1, toJoint: 2,
  });
  const click = shifted(joints[2]);
  const decided = pick.decideAddClick({
    candidate: cand, selectedJointIndex: 0, nearJointIndex: 1,
    clientX: click.x, clientY: click.y, project: shifted, joints: joints, lengthMm: 50, canAdd: true,
  });
  ok("canvas 原点ずれ（East Rail幅）でも候補一致", decided.action === "place");
}

{
  const j4 = [0, 1, 5, 4];
  const boardJoints = [
    { x: 0, y: 0, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 200, y: 0, z: 50 },
    { x: 0, y: 0, z: 50 },
    { x: 0, y: 0, z: 200 },
    { x: 200, y: 0, z: 200 },
  ];
  const project = orthoProject(1, { x: 10, y: 10 });
  const inside = { x: 10 + 100, y: 10 - 100 };
  const corner = project(boardJoints[0]);
  const placeInside = pick.decideBoardClick({
    previewJ4: j4, joints: boardJoints, clientX: inside.x, clientY: inside.y,
    project: project, nearJointIndex: 0, selectedCount: 0,
  });
  ok("棚板プレビューから確定", placeInside.action === "place");
  const placeCorner = pick.decideBoardClick({
    previewJ4: j4, joints: boardJoints, clientX: corner.x, clientY: corner.y,
    project: project, nearJointIndex: 0, selectedCount: 0,
  });
  ok("プレビュー確定時に4点選択へ誤遷移しない", placeCorner.action === "place");
  const autoNear = pick.decideBoardClick({
    previewJ4: null, joints: boardJoints, clientX: corner.x, clientY: corner.y,
    project: project, nearJointIndex: 0, selectedCount: 0, placeMode: "auto",
  });
  ok("自動配置では4点選択へ誤遷移しない", autoNear.action === "none");
  const pickJoint = pick.decideBoardClick({
    previewJ4: null, joints: boardJoints, clientX: corner.x, clientY: corner.y,
    project: project, nearJointIndex: 0, selectedCount: 0, placeMode: "pick4",
  });
  ok("4点選択モードは維持", pickJoint.action === "pick-joint" && pickJoint.jointIndex === 0);
  const noPrev = pick.decideBoardClick({
    previewJ4: null, joints: boardJoints, clientX: 800, clientY: 800,
    project: project, nearJointIndex: -1, selectedCount: 0, placeMode: "auto",
  });
  ok("プレビュー無しでは板を作らない", noPrev.action === "none");
  const autoPlace = pick.decideBoardClick({
    previewJ4: j4, joints: boardJoints, clientX: inside.x, clientY: inside.y,
    project: project, nearJointIndex: 0, selectedCount: 0, placeMode: "auto",
  });
  ok("自動配置はプレビュー上クリックで確定", autoPlace.action === "place" && autoPlace.j4 && autoPlace.j4.join(",") === j4.join(","));
}

{
  const cand = pick.makePlaceCandidate({
    kind: "beam", fromJoint: 0, fromPos: joints[0], lengthMm: 0, axis: "x", dir: 1,
  });
  ok("長さ0は無効候補", cand.valid === false);
}

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) {
  failed.forEach(function (f) { console.log(" - " + f); });
  process.exit(1);
}
