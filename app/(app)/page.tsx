import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SWRFallback } from '@/components/SWRFallback'
import DashboardClientView from './DashboardClientView'

export default async function DashboardPage() {
  const supabase = await createClient()
  // getClaims() en vez de getUser(): verificación local del JWT (JWT signing
  // keys asimétricas), sin round-trip extra a Supabase Auth — proxy.ts ya
  // validó la sesión antes de dejar entrar a esta ruta.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims.sub
  if (!userId) return <DashboardClientView />

  const { data: ur } = await supabase
    .from('user_restaurantes')
    .select('restaurante_id')
    .eq('user_id', userId)
    .single()
  const rid = ur?.restaurante_id
  if (!rid) return <DashboardClientView />

  // Onboarding redirect: por persona (primer login), no por restaurante
  // vacío — un cocinero invitado a un restaurante que ya opera también
  // tiene que verlo. Mismo patrón que onboarding_visto_at (carta de
  // bienvenida), columna propia en vez de mezclarse con tours_vistos
  // (esa es solo para claves de lib/coach/tours.ts).
  //
  // `redirect()` tiene que llamarse FUERA de cualquier try/catch: tira una
  // excepción especial (NEXT_REDIRECT) que el framework atrapa en un borde
  // más arriba — un catch genérico acá abajo se la come antes, y la
  // redirección nunca pasa (bug real encontrado en esta sesión: el gate
  // viejo por restaurante vacío tenía el mismo problema y jamás disparó).
  const { data: miembro } = await supabase
    .from('equipo_miembros')
    .select('onboarding_wizard_visto_at')
    .eq('restaurante_id', rid)
    .eq('auth_user_id', userId)
    .eq('activo', true)
    .maybeSingle()
  if (!miembro?.onboarding_wizard_visto_at) {
    redirect('/onboarding')
  }

  try {
    const [stockRes, tareasRes, secRes, itemRes, rutRes] = await Promise.all([
      supabase.from('productos').select('*').eq('restaurante_id', rid).eq('activo', true).order('categoria').order('nombre'),
      supabase.from('tareas').select('*').eq('restaurante_id', rid).order('created_at', { ascending: false }),
      supabase.from('checklist_secciones').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('checklist_items').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('checklist_rutina').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productos = (stockRes.data ?? []).map((p: any) => ({
      ...p,
      estado: p.stock_actual <= p.stock_critico ? 'critico'
            : p.stock_actual <= p.stock_minimo  ? 'bajo'
            : 'ok',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tareas = (tareasRes.data ?? []).map((t: any) => ({
      ...t,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
    }))

    const checklistConfig = {
      secciones: secRes.data ?? [],
      items: itemRes.data ?? [],
      rutinas: rutRes.data ?? [],
    }

    return (
      <SWRFallback fallback={{
        [`stock-${rid}`]: productos,
        [`tareas-${rid}`]: tareas,
        [`checklist-config-${rid}`]: checklistConfig,
      }}>
        <DashboardClientView />
      </SWRFallback>
    )
  } catch {
    return <DashboardClientView />
  }
}
