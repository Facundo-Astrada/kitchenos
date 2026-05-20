import { createClient } from '@/lib/supabase/server'
import { SWRFallback } from '@/components/SWRFallback'
import ChecklistClientView from './ClientView'

export default async function ChecklistPage() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return <ChecklistClientView />

    const { data: ur } = await supabase
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .single()
    const rid = ur?.restaurante_id
    if (!rid) return <ChecklistClientView />

    const [secRes, itemRes, rutRes, tareasRes] = await Promise.all([
      supabase.from('checklist_secciones').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('checklist_items').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('checklist_rutina').select('*').eq('restaurante_id', rid).order('orden', { ascending: true }),
      supabase.from('tareas').select('*').eq('restaurante_id', rid).order('created_at', { ascending: false }),
    ])

    const checklistConfig = {
      secciones: secRes.data ?? [],
      items: itemRes.data ?? [],
      rutinas: rutRes.data ?? [],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tareas = (tareasRes.data ?? []).map((t: any) => ({
      ...t,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
    }))

    return (
      <SWRFallback fallback={{
        [`checklist-config-${rid}`]: checklistConfig,
        [`tareas-${rid}`]: tareas,
      }}>
        <ChecklistClientView />
      </SWRFallback>
    )
  } catch {
    return <ChecklistClientView />
  }
}
