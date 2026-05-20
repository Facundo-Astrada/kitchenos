import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SWRFallback } from '@/components/SWRFallback'
import DashboardClientView from './DashboardClientView'

export default async function DashboardPage() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return <DashboardClientView />

    const { data: ur } = await supabase
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .single()
    const rid = ur?.restaurante_id
    if (!rid) return <DashboardClientView />

    // Onboarding redirect: si todo está vacío, llevarlo al wizard
    const [{ count: cProd }, { count: cFact }, { count: cRec }] = await Promise.all([
      supabase.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', rid),
      supabase.from('facturas').select('*', { count: 'exact', head: true }).eq('restaurante_id', rid),
      supabase.from('recetas').select('*', { count: 'exact', head: true }).eq('restaurante_id', rid),
    ])
    if ((cProd ?? 0) === 0 && (cFact ?? 0) === 0 && (cRec ?? 0) === 0) {
      redirect('/onboarding')
    }

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
