// =========================================================
// Undo/Redo機能
// =========================================================

// 履歴管理は js/state/state.js で定義済み
// - history, historyIndex
// window経由でアクセス可能

// 履歴保存
function saveHistory(reason = "") {
  // ★ デバッグ時だけ trace を出す（通常は何も出ない）
  if (window.__CR_DBG_HISTORY__) {
    console.trace("[saveHistory trace]", reason);
  }

  const snapshot = window.createSnapshot();
  if (!snapshot) {
    console.warn("[saveHistory] createSnapshot returned empty");
    return;
  }

  // スナップショットにshelves/panelsが含まれているか確認
  try {
    const data = JSON.parse(snapshot);
    const shelfCount = (data.shelves || []).length;
    const panelCount = (data.panels || []).length;
    console.log(`[saveHistory] ${reason}: shelves=${shelfCount}, panels=${panelCount}, historyIndex=${window.historyIndex}, historyLength=${window.history.length}`);
  } catch (e) {
    console.warn("[saveHistory] failed to parse snapshot", e);
  }

  // 現在の履歴と比較（文字列比較ではなく、内容比較）
  if (window.historyIndex >= 0 && window.history[window.historyIndex]) {
    try {
      const currentData = JSON.parse(window.history[window.historyIndex]);
      const newData = JSON.parse(snapshot);
      // 簡易比較：shelves/panelsの数とj4の内容を比較
      const currentShelves = (currentData.shelves || []).length;
      const newShelves = (newData.shelves || []).length;
      const currentPanels = (currentData.panels || []).length;
      const newPanels = (newData.panels || []).length;
      
      // より詳細な比較：j4の内容も確認
      const shelvesMatch = currentShelves === newShelves && 
        JSON.stringify(currentData.shelves || []) === JSON.stringify(newData.shelves || []);
      const panelsMatch = currentPanels === newPanels && 
        JSON.stringify(currentData.panels || []) === JSON.stringify(newData.panels || []);
      
      if (shelvesMatch && panelsMatch && 
          JSON.stringify(currentData.joints || []) === JSON.stringify(newData.joints || []) &&
          JSON.stringify(currentData.beams || []) === JSON.stringify(newData.beams || []) &&
          JSON.stringify(currentData.poles || []) === JSON.stringify(newData.poles || [])) {
        console.log("[saveHistory] snapshot is same as current, skipping");
        return;
      }
    } catch (e) {
      // パースエラー時は文字列比較にフォールバック
      if (window.history[window.historyIndex] === snapshot) {
        console.log("[saveHistory] snapshot is same as current (string), skipping");
        return;
      }
    }
  }

  if (window.historyIndex < window.history.length - 1) {
    window.history = window.history.slice(0, window.historyIndex + 1);
  }

  window.history.push(snapshot);
  window.historyIndex = window.history.length - 1;
  console.log(`[saveHistory] saved: new historyIndex=${window.historyIndex}, historyLength=${window.history.length}`);
}
window.saveHistory = saveHistory; // グローバルに公開

// 元に戻す
function undo() {
  console.log(`[undo] before: historyIndex=${window.historyIndex}, historyLength=${window.history.length}`);
  if (window.historyIndex <= 0) {
    console.log("[undo] cannot undo: historyIndex <= 0");
    return;
  }
  
  // historyIndexを減らしてから、そのインデックスのスナップショットを適用
  window.historyIndex--;
  console.log(`[undo] after: historyIndex=${window.historyIndex}`);
  window.loadHistory(window.historyIndex);
}
window.undo = undo; // グローバルに公開

// 履歴読み込み
function loadHistory(index) {
  console.log(`[loadHistory] index=${index}, historyLength=${window.history.length}`);
  if (index < 0 || index >= window.history.length) {
    console.warn(`[loadHistory] invalid index: ${index}`);
    return;
  }
  const snapshot = window.history[index];
  if (!snapshot) {
    console.warn(`[loadHistory] snapshot is null at index ${index}`);
    return;
  }
  
  // スナップショットの内容を確認
  try {
    const data = JSON.parse(snapshot);
    const shelfCount = (data.shelves || []).length;
    const panelCount = (data.panels || []).length;
    console.log(`[loadHistory] restoring: shelves=${shelfCount}, panels=${panelCount}`);
  } catch (e) {
    console.warn("[loadHistory] failed to parse snapshot", e);
  }
  
  window.applySnapshotFromString(snapshot);
  console.log(`[loadHistory] restored successfully`);
}
window.loadHistory = loadHistory; // グローバルに公開

// やり直し
function redo() {
  if (window.historyIndex >= window.history.length - 1) return;
  window.historyIndex++;
  window.loadHistory(window.historyIndex);
}
window.redo = redo; // グローバルに公開

// キーボードショートカットの設定
(function initHistoryKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    // Ctrl+Z → Undo
    if (e.ctrlKey && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      e.preventDefault();
      if (window.historyIndex > 0) {
        window.historyIndex--;
        window.loadHistory(window.historyIndex);
      }
      return;
    }

    // Ctrl+Y または Ctrl+Shift+Z → Redo
    if ((e.ctrlKey && (e.key === "y" || e.key === "Y")) || 
        (e.ctrlKey && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
      e.preventDefault();
      if (window.historyIndex < window.history.length - 1) {
        window.historyIndex++;
        window.loadHistory(window.historyIndex);
      }
      return;
    }
  });
})();

// Undo/Redoボタンのイベントリスナーを設定
(function initHistoryButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (window.historyIndex > 0) {
        window.historyIndex--;
        window.loadHistory(window.historyIndex);
      }
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      if (window.historyIndex < window.history.length - 1) {
        window.historyIndex++;
        window.loadHistory(window.historyIndex);
      }
    });
  }
})();
