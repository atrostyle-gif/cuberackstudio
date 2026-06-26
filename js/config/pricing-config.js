// 価格表の Supabase 接続設定（Netlify 公開時は全 PC で同じ値を使用）
window.PRICING_CONFIG = {
  supabaseUrl: "https://rwvjtlespuvvrguwehlt.supabase.co",
  supabaseAnonKey: "sb_publishable_Es-225UkrLquPtUrXmb4OQ_QEJrzJvU",
  adminPassword: "CubeRack3296",

  // localStorage キャッシュ（オフライン・読み込み高速化）
  cacheKey: "cuberack_price_catalog_v1",
  cacheTtlMs: 5 * 60 * 1000,
};
