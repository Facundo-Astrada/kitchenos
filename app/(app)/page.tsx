import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SWRFallback } from '@/components/SWRFallback'
import DashboardClientView from './DashboardClientView'

// Fecha UTC de hace N días. Con 3 días de margen cubre el "ayer" de la jornada
// operativa aunque UTC ya haya pasado al día siguiente (Argentina, de noche).
function haceDiasISO(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)
}

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

  // Lo que viaja acá se incrusta entero en el HTML. Antes iban TODAS las tareas
  // del restaurante (2.174 en Bros, sin filtro de fecha) y el catálogo completo
  // de productos: la página pesaba 1,7 MB y el celular tardaba varios segundos
  // solo en leerla, antes de mostrar nada. El Dashboard usa las tareas de hoy y
  // el arrastre de ayer, así que alcanza con los últimos días; la lista completa
  // (y el stock) la trae igual el cliente al montar.
  const desde = haceDiasISO(3)

  try {
    const [tareasRes, secRes, itemRes, rutRes] = await Promise.all([
      supabase.from('tareas').select('*').eq('restaurante_id', rid).gte('turno_fecha', desde).order('created_at', { ascending: false }),
      supabase.from('checklist_secciones').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('checklist_items').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('checklist_rutina').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
    ])

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
