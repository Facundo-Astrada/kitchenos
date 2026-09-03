import { describe, it, expect } from 'vitest'
import { clasificarArchivo } from './iaImport'

/**
 * Regresión del bug de import por IA reportado en sep 2026.
 *
 * Un PDF de ficha técnica se importaba y salía una receta completamente
 * distinta e inventada — dos importaciones del mismo archivo daban dos recetas
 * distintas. La causa no estaba en el modelo ni en el prompt: los PDF no
 * tenían rama de ruteo propia y caían en la de texto plano, que hace
 * `await file.text()`. Sobre un binario eso devuelve la sintaxis interna del
 * PDF decodificada como UTF-8, no la receta.
 *
 * Estos tests fijan la decisión de ruteo, que es la línea que estaba mal.
 */

const archivo = (name: string, type = '') => ({ name, type })

describe('clasificarArchivo', () => {
  describe('documentos binarios — la rama que faltaba', () => {
    it('manda los PDF por document, nunca por texto', () => {
      expect(clasificarArchivo(archivo('ficha-tecnica.pdf'))).toBe('documento')
      expect(clasificarArchivo(archivo('receta.PDF'))).toBe('documento')
      expect(clasificarArchivo(archivo('sin-extension', 'application/pdf'))).toBe('documento')
    })

    it('manda los Word por document (mammoth del lado del servidor)', () => {
      expect(clasificarArchivo(archivo('recetario.docx'))).toBe('documento')
      expect(clasificarArchivo(archivo('recetario.doc'))).toBe('documento')
      expect(clasificarArchivo(archivo('x', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')))
        .toBe('documento')
    })
  })

  describe('planillas', () => {
    it('reconoce Excel por extensión y por MIME', () => {
      expect(clasificarArchivo(archivo('costos.xlsx'))).toBe('planilla')
      expect(clasificarArchivo(archivo('viejo.xls'))).toBe('planilla')
      expect(clasificarArchivo(archivo('export.csv'))).toBe('planilla')
      expect(clasificarArchivo(archivo('x', 'application/vnd.ms-excel'))).toBe('planilla')
    })

    it('no ofrece .numbers como planilla — SheetJS no lo lee', () => {
      expect(clasificarArchivo(archivo('recetas.numbers'))).not.toBe('planilla')
    })
  })

  describe('imágenes', () => {
    it('gana el MIME de imagen sobre cualquier otra cosa', () => {
      expect(clasificarArchivo(archivo('foto.jpg', 'image/jpeg'))).toBe('imagen')
      expect(clasificarArchivo(archivo('captura.png', 'image/png'))).toBe('imagen')
      expect(clasificarArchivo(archivo('escaneo.heic', 'image/heic'))).toBe('imagen')
    })
  })

  describe('texto', () => {
    it('solo cae en texto lo que de verdad es texto', () => {
      expect(clasificarArchivo(archivo('notas.txt', 'text/plain'))).toBe('texto')
      expect(clasificarArchivo(archivo('pegado', ''))).toBe('texto')
    })

    it('un PDF nunca cae en texto, ni sin MIME ni con MIME equivocado', () => {
      // El navegador no siempre completa `type` — con `file.type` vacío, el
      // nombre tiene que alcanzar para no volver al camino roto.
      expect(clasificarArchivo(archivo('receta.pdf', ''))).toBe('documento')
      expect(clasificarArchivo(archivo('receta.pdf', 'application/octet-stream'))).toBe('documento')
    })
  })
})
