-- 既存プロジェクト向け: テーブル直接書き込みを禁止し、SELECT + RPC のみに揃える
-- Supabase Dashboard → SQL → New query で実行

ALTER TABLE public.price_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_catalog_public_read" ON public.price_catalog;
CREATE POLICY "price_catalog_public_read"
  ON public.price_catalog
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "price_catalog_public_insert" ON public.price_catalog;
DROP POLICY IF EXISTS "price_catalog_public_update" ON public.price_catalog;
DROP POLICY IF EXISTS "price_catalog_public_delete" ON public.price_catalog;
DROP POLICY IF EXISTS "price_catalog_public_write" ON public.price_catalog;

REVOKE ALL ON public.price_catalog FROM anon, authenticated;
GRANT SELECT ON public.price_catalog TO anon, authenticated;

REVOKE ALL ON FUNCTION public.save_price_catalog(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_price_catalog(jsonb, text) TO anon, authenticated;
