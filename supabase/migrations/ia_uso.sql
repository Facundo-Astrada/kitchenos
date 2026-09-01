-- Libro de consumo de IA por cuenta (sept 2026).
--
-- Por qué existe: `pedirAClaude` ya logueaba tokens por llamada a stdout, pero
-- nada los persistía. Sin esto, el único costo variable de K-OS —los tokens de
-- Anthropic— es invisible, y cualquier precio de plan es una adivinanza sobre él.
-- Decisión de negocio 008: el Coach es el único consumo que escala peligroso
-- (~$0,05-0,15 por turno) y necesita tope; el tope necesita medición.
--
-- Escritura: SOLO desde API routes con el admin client (service role, bypassea RLS).
-- El cliente NO tiene policy de INSERT/UPDATE/DELETE a propósito — si pudiera
-- escribir, podría falsear su propio consumo hacia abajo y evadir el tope.
-- Misma lección que `user_restaurantes` (ratchet #6).

CREATE TABLE IF NOT EXISTS ia_uso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: hay llamadas sin tenant resuelto todavía (alta de cuenta).
  restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
  usuario_id UUID,
  -- Ruta que llamó, ej: 'importador/facturas-universal', 'coach'.
  tag TEXT NOT NULL,
  modelo TEXT NOT NULL,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida INTEGER NOT NULL DEFAULT 0,
  tokens_cache_lectura INTEGER NOT NULL DEFAULT 0,
  tokens_cache_escritura INTEGER NOT NULL DEFAULT 0,
  -- Calculado en TS con la tabla de precios de `lib/ia/precios.ts`, no en Postgres:
  -- los precios de Anthropic cambian y conviene que vivan en un solo lugar versionado.
  costo_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ia_uso ENABLE ROW LEVEL SECURITY;

-- Consulta típica: consumo de una cuenta en el mes corriente (para el tope del Coach).
CREATE INDEX IF NOT EXISTS idx_ia_uso_restaurante_fecha
  ON ia_uso(restaurante_id, created_at DESC);
-- Consulta de costo por flujo, para saber qué feature cuesta qué.
CREATE INDEX IF NOT EXISTS idx_ia_uso_tag_fecha
  ON ia_uso(tag, created_at DESC);

DROP POLICY IF EXISTS ia_uso_select ON ia_uso;

-- Solo lectura del propio tenant. Sin INSERT/UPDATE/DELETE: ver cabecera.
CREATE POLICY ia_uso_select ON ia_uso FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

NOTIFY pgrst, 'reload schema';
