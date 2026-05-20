import { createClient } from '@/lib/supabase/server'
import { SWRFallback } from '@/components/SWRFallback'
import TareasClientView from './ClientView'

export default async function TareasPage() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return <TareasClientView />

    const { data: ur } = await supabase
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .single()
    const rid = ur?.restaurante_id
    if (!rid) return <TareasClientView />

    const { data } = await supabase
      .from('tareas')
      .select('*')
      .eq('restaurante_id', rid)
      .order('created_at', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tareas = (data ?? []).map((t: any) => ({
      ...t,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
    }))

    return (
      <SWRFallback fallback={{ [`tareas-${rid}`]: tareas }}>
        <TareasClientView />
      </SWRFallback>
    )
  } catch {
    return <TareasClientView />
  }
}
