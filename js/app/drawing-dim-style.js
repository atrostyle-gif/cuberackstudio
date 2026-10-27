// =========================================================
// 図面寸法の文字サイズ・位置・間隔（用紙mm）
// =========================================================
(function (root) {
  const FONT_SIZES = [2.5, 3, 3.5, 4, 5];
  const SIDES_H = ["auto", "above", "below"];
  const SIDES_V = ["auto", "left", "right"];

  function defaultStyle(isHorizontal) {
    return {
      fontSizeMm: 3.5,
      gapMm: 4,
      textSide: isHorizontal ? "auto" : "auto",
      labelOffsetMm: 0,
      labelOffsetCrossMm: 0,
    };
  }

  function keyOf(viewKey, direction) {
    return String(viewKey) + "_" + String(direction);
  }

  function getStyle(map, viewKey, direction, isHorizontal) {
    const k = keyOf(viewKey, direction);
    const base = defaultStyle(isHorizontal);
    const st = map && map[k];
    if (!st || typeof st !== "object") return base;
    return Object.assign(base, st);
  }

  function fontPxFromMm(mm, pxPerMmPaper) {
    const ppm = pxPerMmPaper > 0 ? pxPerMmPaper : 96 / 25.4;
    return Math.max(8, mm * ppm);
  }

  function gapPx(gapMm, pxPerMmPaper) {
    const ppm = pxPerMmPaper > 0 ? pxPerMmPaper : 96 / 25.4;
    return Math.max(2, gapMm * ppm);
  }

  function resolveTextSide(style, isHorizontal) {
    const side = style.textSide || "auto";
    if (isHorizontal) {
      if (side === "above" || side === "below") return side;
      return "below";
    }
    if (side === "left" || side === "right") return side;
    return "right";
  }

  const api = {
    FONT_SIZES: FONT_SIZES,
    SIDES_H: SIDES_H,
    SIDES_V: SIDES_V,
    defaultStyle: defaultStyle,
    keyOf: keyOf,
    getStyle: getStyle,
    fontPxFromMm: fontPxFromMm,
    gapPx: gapPx,
    resolveTextSide: resolveTextSide,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.v3DrawingDimStyle = api;
})(typeof window !== "undefined" ? window : globalThis);
