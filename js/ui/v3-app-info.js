// =========================================================
// CUI-3B.1: アプリバージョンの正本
// - 製品バージョン / 実装フェーズをここだけで管理する
// - 静的 HTML では実行時に Git SHA を取得しない
// =========================================================

(function () {
  const info = {
    name: "Cube Rack Studio",
    product: "3.0.0",
    phase: "CUI-3B.1",
    channel: "dev",
  };

  function productLabel() {
    return "v" + info.product;
  }

  function shortLabel() {
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
    isDev,
  };
})();
