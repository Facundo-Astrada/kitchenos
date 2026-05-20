import { createClient } from '@/lib/supabase/server'
import { SWRFallback } from '@/components/SWRFallback'
import StockClientView from './ClientView'

export default async function StockPage() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return <StockClientView />

    const { data: ur } = await supabase
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .single()
    const rid = ur?.restaurante_id
    if (!rid) return <StockClientView />

    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('restaurante_id', rid)
      .eq('activo', true)
      .order('categoria')
      .order('nombre')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productos = (data ?? []).map((p: any) => ({
      ...p,
      estado: p.stock_actual <= p.stock_critico ? 'critico'
            : p.stock_actual <= p.stock_minimo  ? 'bajo'
            : 'ok',
    }))

    return (
      <SWRFallback fallback={{ [`stock-${rid}`]: productos }}>
        <StockClientView />
      </SWRFallback>
    )
  } catch {
    return <StockClientView />
  }
}
