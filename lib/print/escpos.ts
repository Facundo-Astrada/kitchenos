// Cliente ESC/POS compartido (WebUSB + Web Bluetooth) — impresoras térmicas.
// navigator.usb / navigator.bluetooth no están en el DOM lib de TS por defecto (ver .claude/docs/hooks.md gotcha 6):
// se declaran interfaces mínimas locales y se castea el navigator.

interface PrinterUsbEp { direction: string; type: string; endpointNumber: number }
interface PrinterUsbIface {
  interfaceNumber: number
  alternates: { interfaceClass: number; endpoints: PrinterUsbEp[] }[]
}
interface PrinterUsbDevice {
  vendorId: number; productId: number
  configuration: { interfaces: PrinterUsbIface[] } | null
  open(): Promise<void>; selectConfiguration(n: number): Promise<void>
  claimInterface(n: number): Promise<void>; releaseInterface(n: number): Promise<void>
  transferOut(ep: number, data: Uint8Array): Promise<unknown>
}
interface PrinterBleChar { writeValueWithoutResponse(data: Uint8Array): Promise<void> }
interface PrinterBleGattServer {
  getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<PrinterBleChar> }>
}
interface PrinterBleDevice {
  id?: string
  gatt?: { connect(): Promise<PrinterBleGattServer> }
}

const BLE_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb'
const BLE_CHAR    = '00002af1-0000-1000-8000-00805f9b34fb'

const KOS_PRINTER_USB_KEY = 'kos_printer_usb'
const KOS_PRINTER_BT_KEY  = 'kos_printer_bt'

export function supportsWebUSB(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}
export function supportsWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export async function fetchEscPosBytes(payload: object): Promise<Uint8Array> {
  const res = await fetch('/api/ingest/escpos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json() as { ok: boolean; bytes: string; error?: string }
  if (!json.ok) throw new Error(json.error ?? 'Error generando ticket')
  const raw = atob(json.bytes)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function printViaUSB(bytes: Uint8Array): Promise<void> {
  type UsbApi = {
    getDevices(): Promise<PrinterUsbDevice[]>
    requestDevice(o: { filters: unknown[] }): Promise<PrinterUsbDevice>
  }
  const usb = (navigator as Navigator & { usb?: UsbApi }).usb
  if (!usb) throw new Error('WebUSB no disponible en este navegador')
  const saved = localStorage.getItem(KOS_PRINTER_USB_KEY)
  let device: PrinterUsbDevice | undefined
  const all = await usb.getDevices()
  if (saved) {
    const { vendorId, productId } = JSON.parse(saved) as { vendorId: number; productId: number }
    device = all.find(d => d.vendorId === vendorId && d.productId === productId)
  }
  if (!device) {
    device = await usb.requestDevice({ filters: [] })
    localStorage.setItem(KOS_PRINTER_USB_KEY, JSON.stringify({ vendorId: device.vendorId, productId: device.productId }))
  }
  await device.open()
  if (!device.configuration) await device.selectConfiguration(1)
  let ifaceNum = 0, epNum = 1
  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      if (alt.interfaceClass === 7) {
        ifaceNum = iface.interfaceNumber
        const ep = alt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk')
        if (ep) epNum = ep.endpointNumber
      }
    }
  }
  await device.claimInterface(ifaceNum)
  try {
    for (let i = 0; i < bytes.length; i += 512) await device.transferOut(epNum, bytes.slice(i, i + 512))
  } finally {
    await device.releaseInterface(ifaceNum)
  }
}

export async function printViaBluetooth(bytes: Uint8Array): Promise<void> {
  type BtApi = {
    requestDevice(o: { acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<PrinterBleDevice>
  }
  const bt = (navigator as Navigator & { bluetooth?: BtApi }).bluetooth
  if (!bt) throw new Error('Web Bluetooth no disponible en este navegador')
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: [BLE_SERVICE] })
  if (device.id) localStorage.setItem(KOS_PRINTER_BT_KEY, device.id)
  const server = await device.gatt?.connect()
  if (!server) throw new Error('No se pudo conectar al dispositivo Bluetooth')
  const service = await server.getPrimaryService(BLE_SERVICE)
  const char = await service.getCharacteristic(BLE_CHAR)
  for (let i = 0; i < bytes.length; i += 512) await char.writeValueWithoutResponse(bytes.slice(i, i + 512))
}

export function downloadEscPosBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
