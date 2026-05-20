CREATE TABLE IF NOT EXISTS plato_plazas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plato_id uuid REFERENCES recetas(id) ON DELETE CASCADE,
  plaza text NOT NULL,
  ingredientes text[],
  instruccion text,
  orden integer NOT NULL DEFAULT 0
);
