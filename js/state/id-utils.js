// =========================================================
// 安定ID生成ユーティリティ（V3 Phase 1）
//
// 設計書: docs/V3_PHASE0_AUDIT.md § 2, docs/V3_PHASE1_IMPLEMENTATION_PLAN.md Step 1
//
// - 全エンティティ (joint / beam / pole / leg) に不変の安定IDを採番する。
// - 本モジュールは window 上に id 生成関数だけを提供し、副作用を持たない。
// - 既存のインデックス参照 (a / b / jointIndex) は削除せず、ID はそれに併存する。
// - crypto.randomUUID() を優先し、非対応環境ではプレフィックス + 時刻36 + 乱数36 にフォールバックする。
// =========================================================
(function () {
  "use strict";

  // 内部: UUID または fallback を文字列として返す
  function _generate(prefix) {
    try {
      if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) {
      // 非 secure context 等で crypto.randomUUID が例外を投げる可能性に備える
    }
    try {
      if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        // RFC4122-like 文字列化（簡易）
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
        return (
          hex.slice(0, 8) + "-" +
          hex.slice(8, 12) + "-" +
          hex.slice(12, 16) + "-" +
          hex.slice(16, 20) + "-" +
          hex.slice(20, 32)
        );
      }
    } catch (_) {}
    // 最後の砦（crypto すら無い環境）
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  // 公開: 各エンティティ用の採番関数
  window.newJointClientId = function newJointClientId() {
    return _generate("j");
  };
  window.newBeamClientId = function newBeamClientId() {
    return _generate("b");
  };
  window.newPoleClientId = function newPoleClientId() {
    return _generate("p");
  };
  window.newLegClientId = function newLegClientId() {
    return _generate("l");
  };

  // 内部実装も参照できるようにしておく（テスト・デバッグ用）
  window.__v3IdGenerator = _generate;
})();
