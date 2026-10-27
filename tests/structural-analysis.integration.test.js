"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
function loadAppModel(model) {
  const box = { console, Number, Math, Map, Set, Object, Array };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(`const joints = globalThis.__model.joints; const beams = globalThis.__model.beams; const poles = globalThis.__model.poles;`, Object.assign(box, { __model: model }));
  vm.runInContext(fs.readFileSync(path.join(root, "js/structural/engine.js"), "utf8"), box);
  vm.runInContext(fs.readFileSync(path.join(root, "js/features/structural-analysis.js"), "utf8"), box);
  return box;
}
function fixture() {
  return {
    joints: [
      { id:"base-a", x:0, y:0, z:0 }, { id:"base-b", x:600, y:0, z:0 },
      { id:"top-a", x:0, y:600, z:0 }, { id:"top-b", x:600, y:600, z:0 },
    ],
    beams: [{ id:"beam-top", a:2, b:3 }],
    poles: [{ id:"pole-a", a:2, b:0 }, { id:"pole-b", a:3, b:1 }],
  };
}
function options() {
  return {
    floorSupportJointIds:["base-a", "base-b"],
    effectiveLengthFactor:1,
    shelfLoads:[{ id:"shelf-1", loadN:100, supports:[{ beamId:"beam-top", share:1, kind:"uniform" }] }],
    referenceLimits:{ maxBendingStressMPa:147, maxDeflectionRatio:300 },
  };
}
function fiveByFiveModel() {
  const joints = [], beams = [], poles = [];
  const index = (level, depth, column) => (level * 2 + depth) * 6 + column;
  for (let level = 0; level <= 5; level += 1) {
    for (let depth = 0; depth <= 1; depth += 1) {
      for (let column = 0; column <= 5; column += 1) {
        joints.push({ id: "j-" + level + "-" + depth + "-" + column, x: column * 600, y: level * 600, z: depth * 400 });
      }
    }
  }
  for (let level = 0; level <= 5; level += 1) {
    for (let depth = 0; depth <= 1; depth += 1) {
      for (let column = 0; column < 5; column += 1) beams.push({ id: "bx-" + level + "-" + depth + "-" + column, a: index(level, depth, column), b: index(level, depth, column + 1) });
    }
    for (let column = 0; column <= 5; column += 1) beams.push({ id: "bz-" + level + "-" + column, a: index(level, 0, column), b: index(level, 1, column) });
  }
  for (let level = 0; level < 5; level += 1) {
    for (let depth = 0; depth <= 1; depth += 1) {
      for (let column = 0; column <= 5; column += 1) poles.push({ id: "p-" + level + "-" + depth + "-" + column, a: index(level, depth, column), b: index(level + 1, depth, column) });
    }
  }
  return { joints, beams, poles, baseIds: joints.filter(j => j.y === 0).map(j => j.id) };
}

{
  const model = fixture(), before = JSON.stringify(model), app = loadAppModel(model), result = app.getCubeRackStructuralAnalysis(options());
  assert.strictEqual(result.status, "PASS");
  assert.strictEqual(result.completeRackStatus, "UNKNOWN", "Unqualified JOINTs must block complete-rack safety.");
  assert.ok(result.beamResults["beam-top"].maxDeflectionMm > 0);
  assert.strictEqual(JSON.stringify(model), before, "The adapter must not mutate CAD data.");
}
{
  const app = loadAppModel(fixture()), missingSupport = options();
  missingSupport.floorSupportJointIds = [];
  const result = app.getCubeRackStructuralAnalysis(missingSupport);
  assert.strictEqual(result.status, "INPUT_ERROR");
  assert.match(result.errors.join(" "), /NO_GRAVITY_PATH/);
}
{
  const app = loadAppModel(fixture()), shared = options();
  shared.shelfLoads = [
    { id:"shelf-a", loadN:100, supports:[{ beamId:"beam-top", share:1, kind:"uniform" }] },
    { id:"shelf-b", loadN:100, supports:[{ beamId:"beam-top", share:1, kind:"uniform" }] },
  ];
  const result = app.getCubeRackStructuralAnalysis(shared);
  assert.ok(Math.abs(result.beamResults["beam-top"].reactionAN - 102.8796689) < 1e-6, "Two shelves must be added once each, plus BEAM self weight.");
}
{
  const shortModel = fixture(), longModel = fixture();
  longModel.joints[1].x = 1200; longModel.joints[3].x = 1200;
  const shortResult = loadAppModel(shortModel).getCubeRackStructuralAnalysis(options());
  const longResult = loadAppModel(longModel).getCubeRackStructuralAnalysis(options());
  assert.ok(longResult.beamResults["beam-top"].maxDeflectionMm > shortResult.beamResults["beam-top"].maxDeflectionMm, "Changing rack length must rebuild the analysis input.");
}
{
  const app = loadAppModel(fixture()), removed = options();
  removed.shelfLoads = [];
  const result = app.getCubeRackStructuralAnalysis(removed);
  assert.strictEqual(result.status, "PASS");
  assert.strictEqual(result.memberReferenceCapacity.status, "UNKNOWN", "Removing the shelf load must remove reference-payload input rather than retain stale load.");
}
{
  const model = fixture();
  model.joints[3].x = 550; // Deliberately diagonal POLE after the rack is edited into an unsupported geometry.
  const result = loadAppModel(model).getCubeRackStructuralAnalysis(options());
  assert.strictEqual(result.status, "INPUT_ERROR");
  assert.match(result.errors.join(" "), /not vertical/);
}
{
  const model = fiveByFiveModel();
  assert.strictEqual(model.joints.length, 72);
  assert.strictEqual(model.baseIds.length, 12);
  const result = loadAppModel(model).getCubeRackStructuralAnalysis({ floorSupportJointIds: model.baseIds, shelfLoads: [] });
  assert.strictEqual(result.status, "PASS", "Every lowest JOINT explicitly supported must close the gravity path.");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.sourceSummary)), { cadJointCount: 72, analysisNodeCount: 72, beamCount: 96, poleCount: 60, selectedFloorSupportCount: 12 });
}
{
  const model = fiveByFiveModel();
  const result = loadAppModel(model).getCubeRackStructuralAnalysis({ floorSupportJointIds: model.baseIds.slice(0, -1), shelfLoads: [] });
  assert.strictEqual(result.status, "INPUT_ERROR");
  assert.match(result.errors.join(" "), /NO_GRAVITY_PATH/, "A missing lowest support must be reported, never inferred.");
}
console.log("PASS structural-analysis integration: 8 checks");
