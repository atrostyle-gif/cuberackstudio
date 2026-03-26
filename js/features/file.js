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
function createSnapshotLocal() {
  return JSON.stringify({
    joints: JSON.parse(JSON.stringify(joints)),

    // ★ ビーム：オーダー情報も含めて保存
    beams: beams.map((b) => ({
      a: b.a,
      b: b.b,
      isCustom: !!b.isCustom,
      customLength: b.customLength ?? null,
      material: window.normalizeMaterial?.(b.material) || "IRON",
    })),

    // ★ ポール：同じくオーダー情報を保存
    poles: poles.map((p) => ({
      a: p.a,
      b: p.b,
      isCustom: !!p.isCustom,
      customLength: p.customLength ?? null,
      material: window.normalizeMaterial?.(p.material) || "IRON",
    })),

    legs: legs.map((l) => ({ 
      jointIndex: l.jointIndex,
      material: window.normalizeMaterial?.(l.material) || "IRON",
    })),
    // v1.0.5+ manual legs: 手動LEGの jointIndex 一覧を保存（復元用）
    manualLegs: Array.from(window.manualLegJointSet || []),

    shelves: (window.shelves || []).map(s => ({
      j4: s.j4,
      thicknessMm: s.thicknessMm,
      material: s.material || "足場板",
      cellKey: s.cellKey || "", // 隣接判定用
    })),
    panels: (window.panels || []).map(p => ({
      j4: p.j4,
      thicknessMm: p.thicknessMm,
      material: p.material || "足場板",
      side: p.side || "back",
    })),
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

// 上書き保存
async function saveDesignOverwrite() {
  const jsonText = makeDesignJsonText();

  if (!window.showSaveFilePicker || !window.showOpenFilePicker) {
    downloadJsonAsFile("mfes-design.json", jsonText);
    alert("このブラウザでは上書き保存は使えないので、ファイルをダウンロードしました。");
    return;
  }

  try {
    if (!currentFileHandle) {
      await saveDesignAs();
      return;
    }

    const writable = await currentFileHandle.createWritable();
    await writable.write(jsonText);
    await writable.close();

    window.isDirty = false;
    window.currentFileName = currentFileHandle.name;
    addToRecentFiles(window.currentFileName);
    updateTabTitle();

    } catch (e) {
    console.error("上書き保存に失敗しました:", e);
    alert("上書き保存に失敗しました。権限やディスク状態を確認してください。");
  }
}

// 名前を付けて保存
async function saveDesignAs() {
  const jsonText = makeDesignJsonText();

  if (!window.showSaveFilePicker) {
    downloadJsonAsFile("mfes-design.json", jsonText);
    alert("このブラウザでは『名前を付けて保存』ダイアログが使えないため、ファイルをダウンロードしました。");
    return;
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

    } catch (e) {
    if (e.name === "AbortError") {
      return;
    }
    console.error("名前を付けて保存に失敗しました:", e);
    alert("名前を付けて保存に失敗しました。");
  }
}

// ファイルピッカーから開く
async function openDesignFromFilePicker() {
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
function applySnapshotFromString(snapshotString) {
  const data = JSON.parse(snapshotString);

  if (typeof clearAllMeshes === "function") clearAllMeshes();

// ---- joints ----
joints.length = 0;
(data.joints || []).forEach((j) => {
  joints.push({
    x: j.x,
    y: j.y,
    z: j.z,
    material: window.normalizeMaterial?.(j.material) || "IRON",
  });
});

  // ---- beams ----
  beams.length = 0;
  (data.beams || []).forEach((b) => {
    // スナップショットに入っていた lengthMm / isOrder など
    // すべてそのまま引き継ぐ
    const copy = {
      type: b.type || "beam",
      ...b,

      // ★material 未設定の旧データ互換（無ければIRON）
      material: window.normalizeMaterial?.(b.material) || "IRON",

      mesh: null,   // メッシュだけ描き直すので null に
      label: null,  // ラベルも描き直すので null に
    };
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
    poles.push(copy);
  });

// ---- legs ----
legs.length = 0;
if (data.legs) {
  data.legs.forEach((l) => {
    const jointIndex = l.jointIndex;

    // legs の材種が無い旧データは、対応するジョイント材種を採用（無ければIRON）
    const jm = joints?.[jointIndex]?.material;
    const material = window.normalizeMaterial?.(l.material ?? jm) || "IRON";

    legs.push({ jointIndex, material, mesh: null });
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

  if (typeof rebuildSceneFromData === "function") rebuildSceneFromData();
  
  // 見積も更新
  if (typeof window.requestEstimateRender === "function") {
    window.requestEstimateRender("after applySnapshot");
  }
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
    const mesh = new THREE.Mesh(window.jointGeometry, window.jointMaterialNormal.clone());
    mesh.position.set(j.x, j.y, j.z);

    // ★材種色（ベース色）
    if (typeof window.applyMaterialColorToMesh === "function" && typeof window.normalizeMaterial === "function") {
      window.applyMaterialColorToMesh(mesh, window.normalizeMaterial(j.material));
    }

    if (window.rackGroup) {
      window.rackGroup.add(mesh);
    }
    jointMeshes.push(mesh);
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
if (typeof createSnapshot === "function") window.createSnapshot = createSnapshot;
if (typeof applySnapshotFromString === "function") window.applySnapshotFromString = applySnapshotFromString;
window.rebuildSceneFromData = rebuildSceneFromData;