-- CUBERACK 価格表（Supabase SQL Editor で実行）
-- 1. この SQL を Supabase Dashboard → SQL → New query に貼り付けて Run
-- 2. CHANGE_ME_ADMIN_PASSWORD を pricing-config.js の adminPassword と同じ値に変更
--
-- 権限方針:
--   price_catalog: anon / authenticated は SELECT のみ（公開側の価格取得用）
--   INSERT / UPDATE / DELETE はテーブル直接操作不可
--   価格変更は save_price_catalog RPC のみ（関数内で管理者パスワードを検証）

CREATE TABLE IF NOT EXISTS public.price_catalog (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  catalog_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.price_catalog (id, catalog_json)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.price_catalog ENABLE ROW LEVEL SECURITY;

-- 読み取り専用ポリシー（公開側 index.html 用）
DROP POLICY IF EXISTS "price_catalog_public_read" ON public.price_catalog;
CREATE POLICY "price_catalog_public_read"
  ON public.price_catalog
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 誤って作成された書き込みポリシーがあれば削除
DROP POLICY IF EXISTS "price_catalog_public_insert" ON public.price_catalog;
DROP POLICY IF EXISTS "price_catalog_public_update" ON public.price_catalog;
DROP POLICY IF EXISTS "price_catalog_public_delete" ON public.price_catalog;
DROP POLICY IF EXISTS "price_catalog_public_write" ON public.price_catalog;

-- テーブル権限: SELECT のみ付与（RLS と併用）
REVOKE ALL ON public.price_catalog FROM anon, authenticated;
GRANT SELECT ON public.price_catalog TO anon, authenticated;

-- 価格保存 RPC（SECURITY DEFINER で RLS をバイパスし、パスワード検証後にのみ書き込み）
CREATE OR REPLACE FUNCTION public.save_price_catalog(payload jsonb, admin_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected text := 'CubeRack3296';
BEGIN
  IF admin_password IS NULL OR admin_password <> expected THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.price_catalog (id, catalog_json, updated_at)
  VALUES (1, payload, now())
  ON CONFLICT (id) DO UPDATE
    SET catalog_json = EXCLUDED.catalog_json,
        updated_at = now();

  RETURN (SELECT catalog_json FROM public.price_catalog WHERE id = 1);
END;
$$;

REVOKE ALL ON FUNCTION public.save_price_catalog(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_price_catalog(jsonb, text) TO anon, authenticated;
