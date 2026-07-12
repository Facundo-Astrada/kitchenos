// PostgREST devuelve máx. 1000 filas por request pase lo que pase (incluso con
// .limit() explícito) — un select sin `.range()` sobre una tabla grande trunca en
// silencio. Confirmado jul 2026: Bros tiene 2800 facturas; sin paginar, un select
// solo trae las primeras 1000 en orden no garantizado — "la factura más reciente"
// podía terminar siendo cualquiera. fetchAllRows pagina hasta traer todo.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE_SIZE = 1000
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}
