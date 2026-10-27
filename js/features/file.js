// =========================================================
// ファイル操作機能
// =========================================================

const DEFAULT_START_DIR = "documents";
let currentFileHandle = null;

// タブタイトル更新
function updateTabTitle() {
  let title = `CubeRackStudio – ${window.currentFileName}`;
  if (window.isDirty) title += " *";

  document.title = title;

  const h1 = document.getElementById("page-title");
  if (h1) {
    h1.textContent = `CubeRackStudio（${window.currentFileName}${window.isDirty ? " *" : ""}）`;
  }
}

// 最近使用したファイルに追加
function addToRecentFiles(fileName) {
  let list = JSON.parse(localStorage.getItem(window.MRU_KEY) || "[]");
  list = list.filter((n) => n !== fileName);
  list.unshift(fileName);
  if (list.length > 5) list.length = 5;
  localStorage.setItem(window.MRU_KEY, JSON.stringify(list));
}

// 最近使用したファイル取得
function getRecentFiles() {
  return JSON.parse(localStorage.getItem(window.MRU_KEY) || "[]");
}

// 自動バックアップ
function autoBackup() {
  try {
    const text = makeDesignJsonText();
    const blob = new Blob([text], { type: "application/json" });

    if (window.showSaveFilePicker && navigator.storage.getDirectory) {
      navigator.storage.persist();
      navigator.storage.getDirectory().then(async (root) => {
        const handle = await root.getFileHandle("autosave.mfes.json", {
          create: true,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      });
    }
  } catch (e) {
    console.warn("autosave失敗:", e);
  }
}

// デザインJSONテキスト作成
function makeDesignJsonText() {
  // ローカルの createSnapshot 関数を直接呼び出す（無限再帰を防ぐため）
  return createSnapshotLocal();
}

// スナップショット作成（ローカル関数）
// V3 Phase 1:
//   - joint/beam/pole/leg の安定ID (id / aId / bId / jointId) を併せて保存する。
//   - 旧 Flat JSON 形式を維持（Phase 2 でラップ形式 { name, projectId, snapshot } に移行予定）。
//   - 既存の a / b / jointIndex / customLength / material は従来どおり保存する。
function createSnapshotLocal() {
  try { window.v3WorkLayers?.syncRackIds?.(); } catch (e) {}

  // joint は id が付いていれば一緒に保存（Phase 1 以降はほぼ必ず付く）
  const joint_serialized = joints.map((j) => {
    if (!j || typeof j !== "object") return j;
    const out = { x: j.x, y: j.y, z: j.z };
    if (typeof j.id === "string" && j.id.length > 0) out.id = j.id;
    if (typeof j.rackId === "string" && j.rackId.length > 0) out.rackId = j.rackId;
    if (j.material !== undefined) out.material = j.material;
    return out;
  });

  const workLayerFields = (typeof window.v3WorkLayers?.snapshotFields === "function")
    ? window.v3WorkLayers.snapshotFields()
    : {};

  return JSON.stringify({
    joints: joint_serialized,

    // ★ ビーム：オーダー情報も含めて保存。安定IDは **ある場合のみ** 書く（旧データのラウンドトリップ安定）
    beams: beams.map((b) => {
      const out = {
        a: b.a,
        b: b.b,
        isCustom: !!b.isCustom,
        customLength: b.customLength ?? null,
        material: window.normalizeMaterial?.(b.material) || "IRON",
      };
      const beamLen = Number(b.lengthMm);
      if (Number.isFinite(beamLen) && beamLen > 0) out.lengthMm = beamLen;
      if (typeof b.id === "string" && b.id.length > 0) out.id = b.id;
      if (typeof b.aId === "string" && b.aId.length > 0) out.aId = b.aId;
      if (typeof b.bId === "string" && b.bId.length > 0) out.bId = b.bId;
      return out;
    }),

    // ★ ポール：SKU lengthMm を保存（CAD 距離と分離。座標は変換しない）
    poles: poles.map((p) => {
      const out = {
        a: p.a,
        b: p.b,
        isCustom: !!p.isCustom,
        customLength: p.customLength ?? null,
        material: window.normalizeMaterial?.(p.material) || "IRON",
      };
      const poleLen = Number(p.lengthMm);
      if (Number.isFinite(poleLen) && poleLen > 0) out.lengthMm = poleLen;
      if (typeof p.id === "string" && p.id.length > 0) out.id = p.id;
      if (typeof p.aId === "string" && p.aId.length > 0) out.aId = p.aId;
      if (typeof p.bId === "string" && p.bId.length > 0) out.bId = p.bId;
      return out;
    }),

    legs: legs.map((l) => {
      const out = {
        jointIndex: l.jointIndex,
        material: window.normalizeMaterial?.(l.material) || "IRON",
      };
      if (typeof l.id === "string" && l.id.length > 0) out.id = l.id;
      if (typeof l.jointId === "string" && l.jointId.length > 0) out.jointId = l.jointId;
      return out;
    }),
    // v1.0.5+ manual legs: 手動LEGの jointIndex 一覧を保存（復元用）
    manualLegs: Array.from(window.manualLegJointSet || []),

    shelves: (window.shelves || []).map(s => ({
      j4: s.j4,
      thicknessMm: s.thicknessMm,
      material: s.material || "足場板",
      cellKey: s.cellKey || "", // 隣接判定用
      // Phase 5: optional stable shelf identity.  Old designs remain valid without it.
      ...(typeof s.id === "string" && s.id ? { id: s.id } : {}),
    })),
    panels: (window.panels || []).map(p => ({
      j4: p.j4,
      thicknessMm: p.thicknessMm,
      material: p.material || "足場板",
      side: p.side || "back",
    })),

    workLayers: workLayerFields.workLayers || [],
    activeLayerId: workLayerFields.activeLayerId || null,
    rackAssignments: workLayerFields.rackAssignments || {},

    measures: (window.v3Measure && typeof window.v3Measure.snapshotFields === "function"
      ? window.v3Measure.snapshotFields().measures
      : []) || [],
    measureUi: (window.v3Measure && typeof window.v3Measure.snapshotFields === "function"
      ? window.v3Measure.snapshotFields().measureUi
      : { globalVisible: true, rackVisible: {} }),

    // Reference-analysis settings only.  CAD geometry, pricing, and material data are untouched.
    structuralAnalysis: (window.v3StructuralAnalysis && typeof window.v3StructuralAnalysis.snapshot === "function")
      ? window.v3StructuralAnalysis.snapshot()
      : undefined,

    drawingDocument: window.v3DrawingDocumentCache || undefined,

    heightModel: window.__cubeRackHeightModel
      || (typeof window.inferHeightModelFromGeometry === "function"
        ? window.inferHeightModelFromGeometry(joints, poles)
        : undefined),
  });
}

// スナップショット作成（グローバル公開用）
function createSnapshot() {
  return createSnapshotLocal();
}

// JSONファイルダウンロード
function downloadJsonAsFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function confirmDiscardUnsaved(action) {
  if (!window.isDirty) return true;
  return window.confirm(
    "未保存の変更があります。" + action + "すると現在のデザインは失われます。よろしいですか？"
  );
}

function clearDesignFileState() {
  currentFileHandle = null;
  window.currentFileName = "未保存のデザイン";
  window.isDirty = false;
  updateTabTitle();
}

function newDesign() {
  const btn = document.getElementById("reset-btn");
  if (btn) btn.click();
}

// 上書き保存
async function saveDesignOverwrite() {
  const jsonText = makeDesignJsonText();

  if (!window.showSaveFilePicker || !window.showOpenFilePicker) {
    downloadJsonAsFile("mfes-design.json", jsonText);
    alert("このブラウザでは上書き保存は使えないので、ファイルをダウンロードしました。");
    return "ok";
  }

  try {
    if (!currentFileHandle) {
      return await saveDesignAs();
    }

    const writable = await currentFileHandle.createWritable();
    await writable.write(jsonText);
    await writable.close();

    window.isDirty = false;
    window.currentFileName = currentFileHandle.name;
    addToRecentFiles(window.currentFileName);
    updateTabTitle();
    return "ok";

    } catch (e) {
    console.error("上書き保存に失敗しました:", e);
    alert("上書き保存に失敗しました。権限やディスク状態を確認してください。");
    return "fail";
  }
}

// 名前を付けて保存
async function saveDesignAs() {
  const jsonText = makeDesignJsonText();

  if (!window.showSaveFilePicker) {
    downloadJsonAsFile("mfes-design.json", jsonText);
    alert("このブラウザでは『名前を付けて保存』ダイアログが使えないため、ファイルをダウンロードしました。");
    return "ok";
  }

  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const handle = await window.showSaveFilePicker({
      suggestedName: `mfes-design-${yyyy}${mm}${dd}.json`,
      types: [
        {
          description: "MFES デザイン JSON",
          accept: {
            "application/json": [".json"],
          },
        },
      ],
      startIn: currentFileHandle || DEFAULT_START_DIR,
    });

    currentFileHandle = handle;

    const writable = await handle.createWritable();
    await writable.write(jsonText);
    await writable.close();

    window.currentFileName = handle.name || "無題デザイン";
    window.isDirty = false;
    addToRecentFiles(window.currentFileName);
    updateTabTitle();
    return "ok";

    } catch (e) {
    if (e.name === "AbortError") {
      return "abort";
    }
    console.error("名前を付けて保存に失敗しました:", e);
    alert("名前を付けて保存に失敗しました。");
    return "fail";
  }
}

// ファイルピッカーから開く
async function openDesignFromFilePicker() {
  if (!confirmDiscardUnsaved("開く")) return;
  if (!window.showOpenFilePicker) {
    alert("このブラウザではファイルを開けません。Chrome など Chromium 系ブラウザをお試しください。");
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "MFES デザイン JSON",
          accept: {
            "application/json": [".json"],
          },
        },
      ],
      startIn: currentFileHandle || DEFAULT_START_DIR,
    });

    currentFileHandle = handle;

    const file = await handle.getFile();
    const text = await file.text();

    applySnapshotFromString(text);

    window.history = [text];
    window.historyIndex = 0;

    if (!window.__buildingAutoLayout) {
  if (typeof window.requestEstimateRender === "function") window.requestEstimateRender("after autolayout");
}

    window.isDirty = false;
    window.currentFileName = handle.name || "無題デザイン";
    addToRecentFiles(window.currentFileName);
    updateTabTitle();

    } catch (e) {
    if (e.name === "AbortError") {
      return;
    }
    console.error("ファイル読み込みに失敗しました:", e);
    alert("ファイルの読み込みに失敗しました。");
  }
}

// スナップショット作成（グローバル公開用）
function createSnapshot() {
  return createSnapshotLocal();
}

// スナップショット適用
// V3 Phase 1:
//   - ラップ形式 ({ snapshot: {...} }) で来た場合は snapshot を剥がして中身を使う（旧STAFFラップJSON互換）。
//     ただし外側のメタ (projectId / createdBy 等) は Phase 1 では一切 window に書き込まない。
//   - 読み込んだ id / aId / bId / jointId はそのまま保持する（上書きしない）。
//   - 配列再構築後に applyIdBackfillToWindow() を呼び、不足しているIDだけを補完する。
function applySnapshotFromString(snapshotString) {
  const raw = JSON.parse(snapshotString);

  // ラップ形式判定（旧STAFFラップ or 将来のV3ラップ）: snapshot キーの中身が object なら剥がす
  const isWrapped = !!(raw && typeof raw === "object" && raw.snapshot && typeof raw.snapshot === "object");
  const data = isWrapped ? raw.snapshot : raw;

  if (isWrapped) {
    try {
      console.log("[applySnapshotFromString] detected wrapped format (snapshot unwrapped)", {
        projectId: raw.projectId ?? null,
        name: raw.name ?? null,
      });
    } catch (_) {}
  }

  if (typeof clearAllMeshes === "function") clearAllMeshes();

// ---- joints ----
joints.length = 0;
(data.joints || []).forEach((j) => {
  // V3 Phase 1: id が入っていれば保持する（なければ後段の applyIdBackfillToWindow で補完）
  const next = {
    x: j.x,
    y: j.y,
    z: j.z,
    material: window.normalizeMaterial?.(j.material) || "IRON",
  };
  if (typeof j.id === "string" && j.id.length > 0) next.id = j.id;
  if (typeof j.rackId === "string" && j.rackId.length > 0) next.rackId = j.rackId;
  joints.push(next);
});

  function jointIndexById(id) {
    if (typeof id !== "string" || !id) return -1;
    for (let i = 0; i < joints.length; i++) {
      if (joints[i] && joints[i].id === id) return i;
    }
    return -1;
  }

  function resolveEndIndex(row, indexKey, idKey) {
    if (Number.isFinite(row[indexKey])) return row[indexKey];
    const idx = jointIndexById(row[idKey]);
    return idx >= 0 ? idx : row[indexKey];
  }

  // ---- beams ----
  beams.length = 0;
  (data.beams || []).forEach((b) => {
    // スナップショットに入っていた lengthMm / isOrder など
    // すべてそのまま引き継ぐ（id / aId / bId はスプレッドで保持される）
    const copy = {
      type: b.type || "beam",
      ...b,

      // ★material 未設定の旧データ互換（無ければIRON）
      material: window.normalizeMaterial?.(b.material) || "IRON",

      mesh: null,   // メッシュだけ描き直すので null に
      label: null,  // ラベルも描き直すので null に
    };
    copy.a = resolveEndIndex(copy, "a", "aId");
    copy.b = resolveEndIndex(copy, "b", "bId");
    beams.push(copy);
  });

  // ---- poles ----
  poles.length = 0;
  (data.poles || []).forEach((p) => {
    const copy = {
      type: p.type || "pole",
      ...p,

      // ★material 未設定の旧データ互換（無ければIRON）
      material: window.normalizeMaterial?.(p.material) || "IRON",

      mesh: null,
      label: null,
    };
    copy.a = resolveEndIndex(copy, "a", "aId");
    copy.b = resolveEndIndex(copy, "b", "bId");
    poles.push(copy);
  });

// ---- legs ----
legs.length = 0;
if (data.legs) {
  data.legs.forEach((l) => {
    let jointIndex = Number.isFinite(l.jointIndex) ? l.jointIndex : null;
    if (jointIndex == null) {
      const idx = jointIndexById(l.jointId);
      if (idx >= 0) jointIndex = idx;
    }
    if (jointIndex == null || !joints[jointIndex]) {
      console.warn("[applySnapshotFromString] skipped leg without resolvable joint", {
        jointIndex: l.jointIndex, jointId: l.jointId || null,
      });
      return;
    }

    // legs の材種が無い旧データは、対応するジョイント材種を採用（無ければIRON）
    const jm = joints[jointIndex]?.material;
    const material = window.normalizeMaterial?.(l.material ?? jm) || "IRON";

    // V3 Phase 1: id / jointId を保持
    const next = { jointIndex, material, mesh: null };
    if (typeof l.id === "string" && l.id.length > 0) next.id = l.id;
    if (typeof l.jointId === "string" && l.jointId.length > 0) next.jointId = l.jointId;
    if (Number.isFinite(l.height)) next.height = l.height;
    legs.push(next);
  });
}
// v1.0.5+ manual legs: 手動LEGの jointIndex を復元（後方互換: 無ければ空Set）
window.manualLegJointSet = new Set(Array.isArray(data.manualLegs) ? data.manualLegs : []);

// ---- shelves ---- 
(window.shelves || (window.shelves = [])).length = 0;
(data.shelves || []).forEach(s => {
  window.shelves.push({
    j4: s.j4 || [],
    thicknessMm: Number(s.thicknessMm || 18),
    material: s.material || "足場板",
    mesh: null,
    cellKey: s.cellKey || "", // 隣接判定用
    ...(typeof s.id === "string" && s.id ? { id: s.id } : {}),
  });
});

// ---- panels ----
(window.panels || (window.panels = [])).length = 0;
(data.panels || []).forEach(p => {
  window.panels.push({
    j4: p.j4 || [],
    thicknessMm: Number(p.thicknessMm || 18),
    material: p.material || "足場板",
    side: p.side || "back",
    mesh: null,
  });
  });

  // V3 Phase 1: 配列再構築後に ID 補完（冪等）。既存IDは上書きしない。
  if (typeof window.applyIdBackfillToWindow === "function") {
    try {
      window.applyIdBackfillToWindow();
    } catch (e) {
      console.warn("[applySnapshotFromString] applyIdBackfillToWindow failed", e);
    }
  }

  window.__cubeRackHeightModel = data.heightModel
    || (typeof window.inferHeightModelFromGeometry === "function"
      ? window.inferHeightModelFromGeometry(joints, poles)
      : "legacy");

  if (typeof window.v3WorkLayers?.loadFromSnapshot === "function") {
    try {
      window.v3WorkLayers.loadFromSnapshot(data);
      window.v3WorkLayers.syncRackIds();
    } catch (e) {
      console.warn("[applySnapshotFromString] work layer restore failed", e);
    }
  }

  if (window.v3Measure && typeof window.v3Measure.loadFromSnapshot === "function") {
    try {
      window.v3Measure.loadFromSnapshot(data);
    } catch (e) {
      console.warn("[applySnapshotFromString] measure restore failed", e);
    }
  }

  // Phase 5: settings restoration is intentionally separate from the CAD arrays.
  if (window.v3StructuralAnalysis && typeof window.v3StructuralAnalysis.loadFromSnapshot === "function") {
    try {
      window.v3StructuralAnalysis.loadFromSnapshot(data);
    } catch (e) {
      console.warn("[applySnapshotFromString] structural-analysis restore failed", e);
    }
  }

  if (data.drawingDocument && typeof data.drawingDocument === "object") {
    window.v3DrawingDocumentCache = data.drawingDocument;
  }

  if (typeof rebuildSceneFromData === "function") rebuildSceneFromData();
  
  // 見積も更新
  if (typeof window.requestEstimateRender === "function") {
    window.requestEstimateRender("after applySnapshot");
  }
  try { window.v3BsStock?.refreshUi?.(); } catch (e) {}
}

// シーン再構築（Undo/Redo / スナップショット適用用）
function rebuildSceneFromData() {
  // 既存メッシュを全部消す
  jointMeshes.forEach((m, idx) => {
    if (!m) return;
    if (typeof disposeJointMeshByIndex === "function") disposeJointMeshByIndex(idx);
  });
  if (typeof disposeBeamMesh === "function") {
    beams.forEach((b) => disposeBeamMesh(b));
  }
  if (typeof disposePoleMesh === "function") {
    poles.forEach((p) => disposePoleMesh(p));
  }
  if (typeof disposeLegMesh === "function") {
    legs.forEach((l) => disposeLegMesh(l));
  }
  if (window.v3InstancePool && typeof window.v3InstancePool.clear === "function") {
    window.v3InstancePool.clear();
  }

  // 板のメッシュも削除
  if (window.shelves) {
    window.shelves.forEach((s) => {
      if (s.mesh) {
        try {
          if (window.rackGroup && s.mesh.parent === window.rackGroup) {
            window.rackGroup.remove(s.mesh);
          }
          if (s.mesh.geometry) s.mesh.geometry.dispose();
          if (s.mesh.material) s.mesh.material.dispose();
        } catch (e) {
          console.warn("[rebuildSceneFromData] failed to dispose shelf mesh", e);
        }
        s.mesh = null;
      }
    });
  }

  if (window.panels) {
    window.panels.forEach((p) => {
      if (p.mesh) {
        try {
          if (window.rackGroup && p.mesh.parent === window.rackGroup) {
            window.rackGroup.remove(p.mesh);
          }
          if (p.mesh.geometry) p.mesh.geometry.dispose();
          if (p.mesh.material) p.mesh.material.dispose();
        } catch (e) {
          console.warn("[rebuildSceneFromData] failed to dispose panel mesh", e);
        }
        p.mesh = null;
      }
    });
  }

  jointMeshes.length = 0;

  // ジョイントを再生成
  joints.forEach((j) => {
    if (!window.jointGeometry || !window.jointMaterialNormal) return;
    const mesh = (window.v3InstancePool && window.v3InstancePool.enabled && typeof window.v3InstancePool.createJoint === "function")
      ? window.v3InstancePool.createJoint(j, window.normalizeMaterial ? window.normalizeMaterial(j.material) : j.material)
      : new THREE.Mesh(window.jointGeometry, window.jointMaterialNormal.clone());
    mesh.position.set(j.x, j.y, j.z);

    // ★材種色（ベース色）
    if (typeof window.applyMaterialColorToMesh === "function" && typeof window.normalizeMaterial === "function") {
      window.applyMaterialColorToMesh(mesh, window.normalizeMaterial(j.material));
    }

    if (window.rackGroup && !(mesh.userData && mesh.userData.v3Instanced)) {
      window.rackGroup.add(mesh);
    }
    jointMeshes.push(mesh);
    if (window.v3InstancePool) window.v3InstancePool.note();
  });

  // ビームを再生成（距離追従が正本）
  beams.forEach((b) => {
    const aPos = joints[b.a];
    const bPos = joints[b.b];
    if (!aPos || !bPos) return;

    if (typeof window.createCylinderBetween === "function" && window.beamMaterial) {
      b.mesh = window.createCylinderBetween(aPos, bPos, window.beamMaterial);
      if (b.mesh && typeof window.applyMaterialColorToMesh === "function" && typeof window.normalizeMaterial === "function") {
        window.applyMaterialColorToMesh(b.mesh, window.normalizeMaterial(b.material));
      }

      // ★ ここでは "見た目長さ固定" をしない
      //   - 形状は joints の距離で決まる（= updateConnectorMesh と同じ思想）
      //   - isCustom/customLength は「見積・色分け」用途で保持するだけ
      if (typeof window.updateConnectorMesh === "function" && b.mesh) {
        window.updateConnectorMesh(b.mesh, aPos, bPos);
      }
    }
  });

  // ポールを再生成（距離追従が正本）
  poles.forEach((p) => {
    const aPos = joints[p.a];
    const bPos = joints[p.b];
    if (!aPos || !bPos) return;

    if (typeof window.createCylinderBetween === "function" && window.poleMaterial) {
      p.mesh = window.createCylinderBetween(aPos, bPos, window.poleMaterial);
      if (p.mesh && typeof window.applyMaterialColorToMesh === "function" && typeof window.normalizeMaterial === "function") {
        window.applyMaterialColorToMesh(p.mesh, window.normalizeMaterial(p.material));
      }

      // ★ ここでは "見た目長さ固定" をしない
      if (typeof window.updateConnectorMesh === "function" && p.mesh) {
        window.updateConnectorMesh(p.mesh, aPos, bPos);
      }
    }
  });

  // 脚を再生成（自動LEG＝床＋手動LEG の両方に mesh を生成）
  legs.forEach((l) => {
    if (typeof window.createLegMeshForJointIndex === "function") {
      l.mesh = window.createLegMeshForJointIndex(l.jointIndex);
    }

    // ★legs.material が無い場合は joints の材種を引き継ぐ（無ければIRON）
    const jm = joints?.[l.jointIndex]?.material;
    const material = (typeof window.normalizeMaterial === "function") 
      ? window.normalizeMaterial(l.material ?? jm ?? "IRON") 
      : (l.material ?? jm ?? "IRON");

    if (l.mesh && typeof window.applyMaterialColorToMesh === "function") {
      window.applyMaterialColorToMesh(l.mesh, material);
    }
    l.material = material;
  });

  if (typeof window.setSelectedJoint === "function") {
    window.setSelectedJoint(null);
  }
  if (!window.__buildingAutoLayout) {
    if (typeof window.requestEstimateRender === "function") {
      window.requestEstimateRender("after autolayout");
    }
  }

  try {
    if (typeof window.syncDesignLengthFromJoints === "function") {
      window.syncDesignLengthFromJoints();
    }
  } catch (e) {
    console.warn("[rebuildSceneFromData] syncDesignLengthFromJoints failed", e);
  }

  // ★D1：状態に合わせて最終表示を再適用（ColorChart優先／OFFで材質色へ復帰）
  if (typeof window.reapplyConnectorVisuals === "function") {
    window.reapplyConnectorVisuals("after rebuildSceneFromData");
  }

  // Boards（棚板/壁板）- beam/poleの長さ変更に追従するため、最後に呼ぶ
  if (typeof window.rebuildBoards === "function") {
    window.rebuildBoards();
  }

  // 念のため：再構築後の最終同期（ここでズレを潰す）
  try { 
    if (typeof window.syncJointMeshesFromData === "function") {
      window.syncJointMeshesFromData();
    }
  } catch (e) {
    console.warn("[rebuildSceneFromData] syncJointMeshesFromData failed", e);
  }
  try { 
    if (typeof window.syncConnectorMeshesFromData === "function") {
      window.syncConnectorMeshesFromData();
    }
  } catch (e) {
    console.warn("[rebuildSceneFromData] syncConnectorMeshesFromData failed", e);
  }
  try { window.v3LayerPanel?.applyVisibility?.(); } catch (e) {}
  try { window.v3Measure?.refresh?.(); } catch (e) {}
  try { window.v3StructuralAnalysis?.schedule?.("scene rebuild"); } catch (e) {}
}

// ボタンイベント設定
(function initFileButtons() {
  const saveBtn = document.getElementById("save-design-btn");
  const saveAsBtn = document.getElementById("save-as-design-btn");
  const loadBtn = document.getElementById("load-design-btn");

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveDesignOverwrite();
    });
  }

  if (saveAsBtn) {
    saveAsBtn.addEventListener("click", () => {
      saveDesignAs();
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      openDesignFromFilePicker();
    });
  }
})();

// 自動バックアップ開始
setInterval(autoBackup, 600000);

// 初期タブタイトル更新
updateTabTitle();

// グローバルに公開
window.updateTabTitle = updateTabTitle;
window.addToRecentFiles = addToRecentFiles;
window.getRecentFiles = getRecentFiles;
window.autoBackup = autoBackup;
window.makeDesignJsonText = makeDesignJsonText;
window.downloadJsonAsFile = downloadJsonAsFile;
window.saveDesignOverwrite = saveDesignOverwrite;
window.saveDesignAs = saveDesignAs;
window.openDesignFromFilePicker = openDesignFromFilePicker;
window.newDesign = newDesign;
window.clearDesignFileState = clearDesignFileState;
window.confirmDiscardUnsaved = confirmDiscardUnsaved;
if (typeof createSnapshot === "function") window.createSnapshot = createSnapshot;
if (typeof applySnapshotFromString === "function") window.applySnapshotFromString = applySnapshotFromString;
window.rebuildSceneFromData = rebuildSceneFromData;
