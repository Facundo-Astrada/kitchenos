// Historial de conversaciones del Kitchen Coach (localStorage, por restaurante).
// La conversación ACTIVA la persiste useKitchenCoach bajo `kc_active_<rid>`.
// Las conversaciones ARCHIVADAS (las que el usuario dejó atrás con "Nueva conversación")
// viven acá bajo `kc_convos_<rid>`. Sin DB: es historial por dispositivo, suficiente
// para no perder el hilo al recargar y poder volver a chats recientes.
import type { CoachMessage } from '@/lib/hooks/useKitchenCoach'

interface SerMsg { id: string; role: 'user' | 'assistant'; content: string; timestamp: string; options?: string[] }

export interface ArchivedConvo {
  id: string
  title: string
  updatedAt: string
  messages: SerMsg[]
}

const MAX_CONVOS = 20
const convosKey = (rid: string) => `kc_convos_${rid}`

function tituloDe(messages: CoachMessage[]): string {
  const primerUsuario = messages.find(m => m.role === 'user' && m.content.trim())
  const base = primerUsuario?.content.trim() ?? 'Conversación'
  return base.length > 60 ? base.slice(0, 60) + '…' : base
}

export function listConvos(rid: string): ArchivedConvo[] {
  if (!rid) return []
  try {
    const raw = localStorage.getItem(convosKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ArchivedConvo[]
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveConvos(rid: string, convos: ArchivedConvo[]): void {
  try { localStorage.setItem(convosKey(rid), JSON.stringify(convos.slice(0, MAX_CONVOS))) } catch { /* ignore */ }
}

// Archiva una conversación (la manda al historial). Ignora las vacías.
export function archiveConvo(rid: string, messages: CoachMessage[]): void {
  if (!rid) return
  const utiles = messages.filter(m => m.content !== '')
  if (utiles.length === 0) return
  const convo: ArchivedConvo = {
    id: crypto.randomUUID(),
    title: tituloDe(utiles),
    updatedAt: new Date().toISOString(),
    messages: utiles.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp.toISOString(), options: m.options })),
  }
  saveConvos(rid, [convo, ...listConvos(rid)])
}

export function deleteConvo(rid: string, id: string): void {
  if (!rid) return
  saveConvos(rid, listConvos(rid).filter(c => c.id !== id))
}

export function toMessages(convo: ArchivedConvo): CoachMessage[] {
  return convo.messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: new Date(m.timestamp), options: m.options }))
}
