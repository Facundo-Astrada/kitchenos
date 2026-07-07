import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { CartaPublicaView, type PublicCartaCategoria, type PublicCartaItem } from './CartaPublicaView'

// Revalida cada 60s para que un 86 marcado en la app se refleje rápido (criterio Q1).
export const revalidate = 60

// Server Component público (sin sesión) — usa el admin client a propósito:
// no hay política RLS para lectura anónima de carta_items (y no queremos crear una:
// la tabla también guarda margen_pct que jamás debe llegar a un visitante sin login).
// La privacidad se garantiza acá, con un SELECT explícito de solo columnas de vidriera.
async function getCartaPublica(slug: string) {
  const supabase = createAdminClient()

  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('id, nombre, slug')
    .eq('slug', slug)
    .eq('carta_publica_activa', true)
    .maybeSingle()

  if (!restaurante) return null

  const [{ data: categorias }, { data: items }] = await Promise.all([
    supabase
      .from('carta_categorias')
      .select('id, nombre, icono, orden')
      .eq('restaurante_id', restaurante.id)
      .order('orden'),
    supabase
      .from('carta_items')
      .select('id, nombre, descripcion, precio_venta, foto_url, tags, categoria, disponible, orden')
      .eq('restaurante_id', restaurante.id)
      .order('orden'),
  ])

  return {
    nombre: restaurante.nombre as string,
    categorias: (categorias ?? []) as PublicCartaCategoria[],
    items: (items ?? []) as PublicCartaItem[],
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getCartaPublica(slug)
  if (!data) return { title: 'Carta no encontrada — KitchenOS' }
  return {
    title: `Carta — ${data.nombre}`,
    description: `Menú de ${data.nombre}, actualizado en vivo.`,
  }
}

export default async function CartaPublicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getCartaPublica(slug)
  if (!data) notFound()

  return <CartaPublicaView restauranteNombre={data.nombre} categorias={data.categorias} items={data.items} />
}
