// =========================================================
// ID補完・整合性チェック（V3 Phase 1）
//
// 設計書: docs/V3_PHASE0_AUDIT.md § 2.6, 3, docs/V3_PHASE1_IMPLEMENTATION_PLAN.md Step 2
//
// 役割:
//   - 既存の joints / beams / poles / legs 配列に対して、不足している id / aId / bId / jointId を補完する。
//   - 2 回以上適用しても同じ結果になる（冪等）。
//   - 既存 ID は絶対に上書きしない。
//   - 重複 ID や欠損参照を検出し、コンソールに警告する（例外は投げない：既存機能を止めない）。
//   - 自動的な Firestore 同期や外部書き込みは行わない（純粋にローカル state を整えるのみ）。
//
// 注意:
//   - 本モジュールは window.applyIdBackfillToWindow のみを window に公開する。
//   - 補完に失敗しても throw しない。失敗は console.warn で通知し、呼び出し元の既存処理は継続可能にする。
// =========================================================
(function () {
  "use strict";

  const WARN_PREFIX = "[v3-ensure-ids]";

  function _warn(msg, data) {
    try {
      if (data !== undefined) console.warn(WARN_PREFIX, msg, data);
      else console.warn(WARN_PREFIX, msg);
    } catch (_) {}
  }

  function _isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
  }

  function _hasFn(name) {
    return typeof window[name] === "function";
  }

  // joints 配列に id を補完する（冪等）。
  // 戻り値: { added: number, kept: number, duplicates: string[] }
  function ensureJointIds(arr) {
    const result = { added: 0, kept: 0, duplicates: [] };
    if (!Array.isArray(arr)) return result;

    const seen = new Set();
    for (let i = 0; i < arr.length; i++) {
      const j = arr[i];
      if (!j || typeof j !== "object") continue;

      if (_isNonEmptyString(j.id)) {
        if (seen.has(j.id)) {
          // 重複 ID 検出。既存 ID を変更せず、警告のみ出す（破壊的変更を避ける）。
          result.duplicates.push(j.id);
          _warn("duplicate joint id detected (keeping as-is)", { index: i, id: j.id });
        } else {
          seen.add(j.id);
        }
        result.kept++;
      } else {
        // id 未設定 → 新規採番
        if (!_hasFn("newJointClientId")) {
          _warn("newJointClientId is not available; skip id backfill");
          continue;
        }
        let newId = window.newJointClientId();
        // ごくまれな衝突にも備える（確率は無視できるが安全策）
        let tries = 0;
        while (seen.has(newId) && tries < 5) {
          newId = window.newJointClientId();
          tries++;
        }
        j.id = newId;
        seen.add(newId);
        result.added++;
      }
    }
    return result;
  }

  // joint の id から index を引く補助。見つからなければ -1。
  function _findJointIndexById(joints, id) {
    if (!Array.isArray(joints) || !_isNonEmptyString(id)) return -1;
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (j && j.id === id) return i;
    }
    return -1;
  }

  // beams / poles 配列に id / aId / bId を補完する。
  // joints には既に id が付いている前提（ensureJointIds を先に呼ぶこと）。
  function ensureConnectorIds(beams, poles, joints) {
    const result = {
      beam: { added: 0, kept: 0, aIdFilled: 0, bIdFilled: 0, aIdMissing: 0, bIdMissing: 0, duplicates: [] },
      pole: { added: 0, kept: 0, aIdFilled: 0, bIdFilled: 0, aIdMissing: 0, bIdMissing: 0, duplicates: [] },
    };

    function _fix(arr, newIdFn, tag) {
      const info = result[tag];
      if (!Array.isArray(arr)) return;
      const seen = new Set();

      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b || typeof b !== "object") continue;

        // --- 本体 id ---
        if (_isNonEmptyString(b.id)) {
          if (seen.has(b.id)) {
            info.duplicates.push(b.id);
            _warn(`duplicate ${tag} id detected (keeping as-is)`, { index: i, id: b.id });
          } else {
            seen.add(b.id);
          }
          info.kept++;
        } else {
          let newId = newIdFn();
          let tries = 0;
          while (seen.has(newId) && tries < 5) {
            newId = newIdFn();
            tries++;
          }
          b.id = newId;
          seen.add(newId);
          info.added++;
        }

        // --- aId ---
        if (!_isNonEmptyString(b.aId)) {
          const aIdx = (typeof b.a === "number") ? b.a : -1;
          if (Array.isArray(joints) && aIdx >= 0 && joints[aIdx] && _isNonEmptyString(joints[aIdx].id)) {
            b.aId = joints[aIdx].id;
            info.aIdFilled++;
          } else {
            // 補完できない。既存の数値インデックスは維持する。
            info.aIdMissing++;
            _warn(`${tag}.aId cannot be resolved (keeping as null)`, { index: i, aIndex: aIdx });
          }
        } else {
          // 既にある場合は整合性だけ確認する（警告のみ、修正しない）。
          const aIdx = (typeof b.a === "number") ? b.a : -1;
          if (aIdx >= 0 && Array.isArray(joints) && joints[aIdx] && _isNonEmptyString(joints[aIdx].id)) {
            if (joints[aIdx].id !== b.aId) {
              _warn(`${tag}.aId does not match joints[a].id (keeping existing aId)`, {
                index: i, aIndex: aIdx, aId: b.aId, jointId: joints[aIdx].id,
              });
            }
          }
        }

        // --- bId ---
        if (!_isNonEmptyString(b.bId)) {
          const bIdx = (typeof b.b === "number") ? b.b : -1;
          if (Array.isArray(joints) && bIdx >= 0 && joints[bIdx] && _isNonEmptyString(joints[bIdx].id)) {
            b.bId = joints[bIdx].id;
            info.bIdFilled++;
          } else {
            info.bIdMissing++;
            _warn(`${tag}.bId cannot be resolved (keeping as null)`, { index: i, bIndex: bIdx });
          }
        } else {
          const bIdx = (typeof b.b === "number") ? b.b : -1;
          if (bIdx >= 0 && Array.isArray(joints) && joints[bIdx] && _isNonEmptyString(joints[bIdx].id)) {
            if (joints[bIdx].id !== b.bId) {
              _warn(`${tag}.bId does not match joints[b].id (keeping existing bId)`, {
                index: i, bIndex: bIdx, bId: b.bId, jointId: joints[bIdx].id,
              });
            }
          }
        }
      }
    }

    _fix(beams, window.newBeamClientId, "beam");
    _fix(poles, window.newPoleClientId, "pole");

    return result;
  }

  // legs 配列に id / jointId を補完する。
  function ensureLegIds(legs, joints) {
    const result = { added: 0, kept: 0, jointIdFilled: 0, jointIdMissing: 0, duplicates: [] };
    if (!Array.isArray(legs)) return result;

    const seen = new Set();
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (!l || typeof l !== "object") continue;

      if (_isNonEmptyString(l.id)) {
        if (seen.has(l.id)) {
          result.duplicates.push(l.id);
          _warn("duplicate leg id detected (keeping as-is)", { index: i, id: l.id });
        } else {
          seen.add(l.id);
        }
        result.kept++;
      } else {
        if (!_hasFn("newLegClientId")) {
          _warn("newLegClientId is not available; skip id backfill");
          continue;
        }
        let newId = window.newLegClientId();
        let tries = 0;
        while (seen.has(newId) && tries < 5) {
          newId = window.newLegClientId();
          tries++;
        }
        l.id = newId;
        seen.add(newId);
        result.added++;
      }

      // jointId の補完
      if (!_isNonEmptyString(l.jointId)) {
        const jIdx = (typeof l.jointIndex === "number") ? l.jointIndex : -1;
        if (Array.isArray(joints) && jIdx >= 0 && joints[jIdx] && _isNonEmptyString(joints[jIdx].id)) {
          l.jointId = joints[jIdx].id;
          result.jointIdFilled++;
        } else {
          result.jointIdMissing++;
          _warn("leg.jointId cannot be resolved (keeping as null)", { index: i, jointIndex: jIdx });
        }
      } else {
        const jIdx = (typeof l.jointIndex === "number") ? l.jointIndex : -1;
        if (jIdx >= 0 && Array.isArray(joints) && joints[jIdx] && _isNonEmptyString(joints[jIdx].id)) {
          if (joints[jIdx].id !== l.jointId) {
            _warn("leg.jointId does not match joints[jointIndex].id (keeping existing jointId)", {
              index: i, jointIndex: jIdx, legJointId: l.jointId, jointId: joints[jIdx].id,
            });
          }
        }
      }
    }
    return result;
  }

  // window 上の joints / beams / poles / legs 全体に補完を適用する統合エントリ。
  // 戻り値はテスト・デバッグ用のサマリ。既存機能からは戻り値を無視して差し支えない。
  function applyIdBackfillToWindow() {
    try {
      const joints = window.joints;
      const beams = window.beams;
      const poles = window.poles;
      const legs = window.legs;

      const j = ensureJointIds(joints);
      const c = ensureConnectorIds(beams, poles, joints);
      const l = ensureLegIds(legs, joints);

      // サマリログは閾値ベースで出す（通常の操作毎のノイズを避ける）
      const added = j.added + c.beam.added + c.pole.added + l.added;
      const warnings =
        j.duplicates.length +
        c.beam.duplicates.length + c.beam.aIdMissing + c.beam.bIdMissing +
        c.pole.duplicates.length + c.pole.aIdMissing + c.pole.bIdMissing +
        l.duplicates.length + l.jointIdMissing;

      if (added > 0 || warnings > 0) {
        try {
          console.log("[v3-ensure-ids] applied", {
            addedJoints: j.added, keptJoints: j.kept,
            addedBeams: c.beam.added, keptBeams: c.beam.kept,
            addedPoles: c.pole.added, keptPoles: c.pole.kept,
            addedLegs: l.added, keptLegs: l.kept,
            warnings,
          });
        } catch (_) {}
      }

      return { joints: j, connectors: c, legs: l };
    } catch (e) {
      _warn("applyIdBackfillToWindow failed (continuing)", e);
      return null;
    }
  }

  // --- 診断用: 現在の window 配列の整合性をチェック（副作用なし）---
  function validateIdConsistency() {
    const issues = [];
    const joints = window.joints || [];
    const beams = window.beams || [];
    const poles = window.poles || [];
    const legs = window.legs || [];

    // joint 側: 重複 id チェック
    const jointIds = new Set();
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (!j) continue;
      if (!_isNonEmptyString(j.id)) {
        issues.push({ scope: "joint", index: i, type: "missing-id" });
        continue;
      }
      if (jointIds.has(j.id)) {
        issues.push({ scope: "joint", index: i, type: "duplicate-id", id: j.id });
      }
      jointIds.add(j.id);
    }

    // connector 側: aId/bId 整合
    function _checkConn(arr, tag) {
      const ids = new Set();
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b) continue;
        if (!_isNonEmptyString(b.id)) {
          issues.push({ scope: tag, index: i, type: "missing-id" });
        } else if (ids.has(b.id)) {
          issues.push({ scope: tag, index: i, type: "duplicate-id", id: b.id });
        } else {
          ids.add(b.id);
        }
        const aIdx = (typeof b.a === "number") ? b.a : -1;
        const bIdx = (typeof b.b === "number") ? b.b : -1;
        if (_isNonEmptyString(b.aId) && aIdx >= 0 && joints[aIdx] && joints[aIdx].id !== b.aId) {
          issues.push({ scope: tag, index: i, type: "aId-mismatch", aId: b.aId, jointId: joints[aIdx].id });
        }
        if (_isNonEmptyString(b.bId) && bIdx >= 0 && joints[bIdx] && joints[bIdx].id !== b.bId) {
          issues.push({ scope: tag, index: i, type: "bId-mismatch", bId: b.bId, jointId: joints[bIdx].id });
        }
      }
    }
    _checkConn(beams, "beam");
    _checkConn(poles, "pole");

    // legs
    const legIds = new Set();
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (!l) continue;
      if (!_isNonEmptyString(l.id)) {
        issues.push({ scope: "leg", index: i, type: "missing-id" });
      } else if (legIds.has(l.id)) {
        issues.push({ scope: "leg", index: i, type: "duplicate-id", id: l.id });
      } else {
        legIds.add(l.id);
      }
      const jIdx = (typeof l.jointIndex === "number") ? l.jointIndex : -1;
      if (_isNonEmptyString(l.jointId) && jIdx >= 0 && joints[jIdx] && joints[jIdx].id !== l.jointId) {
        issues.push({ scope: "leg", index: i, type: "jointId-mismatch", legJointId: l.jointId, jointId: joints[jIdx].id });
      }
    }
    return issues;
  }

  // --- 公開 API ---
  window.applyIdBackfillToWindow = applyIdBackfillToWindow;
  window.__v3EnsureJointIds = ensureJointIds;
  window.__v3EnsureConnectorIds = ensureConnectorIds;
  window.__v3EnsureLegIds = ensureLegIds;
  window.__v3FindJointIndexById = _findJointIndexById;
  window.__v3ValidateIdConsistency = validateIdConsistency;
})();
