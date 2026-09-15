import { describe, it, expect } from 'vitest'
import { urlBase64ToUint8Array } from './subscribir'

describe('urlBase64ToUint8Array', () => {
  it('decodifica una clave VAPID real (87 chars, sin padding, con - y _)', () => {
    const clave = 'BDWeiY-NF5KjxoEfZGI8KYd341eMArxJ5GvQ0R4c8LHp7mYeRMC77CLo0RlM8IWrPIDH4drIOnZnMB4uNCW2Ucs'
    const bytes = urlBase64ToUint8Array(clave)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(65) // clave pública EC P-256 sin comprimir: 0x04 + 32 + 32
    expect(bytes[0]).toBe(0x04)
  })

  it('agrega el padding correcto según el resto de la longitud', () => {
    // 'f' → 1 byte → base64url de 2 chars, necesita 2 '='
    expect(urlBase64ToUint8Array('Zg')).toEqual(new TextEncoder().encode('f'))
    // 'fo' → 2 bytes → base64url de 3 chars, necesita 1 '='
    expect(urlBase64ToUint8Array('Zm8')).toEqual(new TextEncoder().encode('fo'))
    // 'foo' → 3 bytes → base64url de 4 chars, sin padding
    expect(urlBase64ToUint8Array('Zm9v')).toEqual(new TextEncoder().encode('foo'))
  })

  it('traduce - y _ al alfabeto base64 estándar (+ y /)', () => {
    // bytes 0xfb 0xff → base64 estándar "+/8=" → base64url "-_8"
    expect(urlBase64ToUint8Array('-_8')).toEqual(new Uint8Array([0xfb, 0xff]))
  })
})
