// =========================================================
// アプリバージョンの正本
// - 通常画面は製品バージョンのみ表示する
// - 実装フェーズ (CUI-3B.1) は内部管理用。ヘッダーには出さない
// - 静的 HTML では実行時に Git SHA を取得しない
// =========================================================

(function () {
  const info = {
    name: "Cube Rack Studio",
    product: "3.1.0",
    phase: "CUI-3B.1",
    channel: "dev",
  };

  function productLabel() {
    return "v" + info.product;
  }

  function shortLabel() {
    return productLabel();
  }

  function internalLabel() {
    return productLabel() + " · " + info.phase;
  }

  function isDev() {
    return info.channel === "dev";
  }

  window.v3AppInfo = {
    name: info.name,
    product: info.product,
    phase: info.phase,
    channel: info.channel,
    productLabel,
    shortLabel,
    internalLabel,
    isDev,
  };
})();
