import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { Readable } from 'stream'

export type SupportedDocumentType = 'PDF' | 'TXT' | 'DOCX'

const MAX_FILE_BYTES = 30 * 1024 * 1024 // 30 MB

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getDocumentTypeFromMetadata(declaredType: string | null | undefined, fileName?: string): SupportedDocumentType {
  const normalizedType = declaredType?.toString().trim().toUpperCase()
  if (normalizedType === 'PDF' || normalizedType === 'TXT' || normalizedType === 'DOCX') {
    return normalizedType
  }

  const extension = fileName?.split('.').pop()?.trim().toUpperCase()
  if (extension === 'PDF' || extension === 'TXT' || extension === 'DOCX') {
    return extension
  }

  throw new Error('Type de document non supporté. Seuls PDF, TXT et DOCX sont pris en charge.')
}

export async function toBuffer(data: unknown): Promise<Buffer> {
  if (!data) {
    throw new Error('Contenu du fichier introuvable.')
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from((data as any).buffer)
  }

  if (typeof (data as any).arrayBuffer === 'function') {
    return Buffer.from(await (data as any).arrayBuffer())
  }

  if (data instanceof Readable) {
    const chunks: Buffer[] = []
    for await (const chunk of data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  if (typeof data === 'string') {
    return Buffer.from(data, 'utf8')
  }

  throw new Error('Impossible de convertir le fichier en Buffer.')
}

export async function extractTextFromDocument(buffer: Buffer, documentType: SupportedDocumentType, fileName?: string): Promise<string> {
  console.log('[extract-text] starting extraction', { fileName: fileName ?? null, size: buffer.length, type: documentType })

  if (buffer.length === 0) {
    console.error('[extract-text] file is empty')
    throw new Error('Le fichier est vide.')
  }

  if (buffer.length > MAX_FILE_BYTES) {
    console.error('[extract-text] file too large', { size: buffer.length, limit: MAX_FILE_BYTES })
    throw new Error('Le fichier est trop volumineux pour une extraction en continu. Limite : 30 MB.')
  }

  try {
    let extracted = ''

    switch (documentType) {
      case 'PDF': {
        console.log('[extract-text] using pdf-parse for PDF')
        const result = await pdfParse(buffer)
        extracted = result?.text ?? ''
        break
      }

      case 'TXT': {
        console.log('[extract-text] treating as TXT (utf8)')
        extracted = buffer.toString('utf8')
        break
      }

      case 'DOCX': {
        console.log('[extract-text] using mammoth for DOCX')
        const result = await mammoth.extractRawText({ buffer })
        extracted = result?.value ?? ''
        break
      }

      default: {
        console.error('[extract-text] unsupported type', { documentType })
        throw new Error('Type de document non supporté pour l’extraction.')
      }
    }

    const normalized = normalizeExtractedText(extracted)
    console.log('[extract-text] extraction complete', { extractedLength: normalized.length })

    return normalized
  } catch (err) {
    console.error('[extract-text] extraction failed', { err: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export default {
  getDocumentTypeFromMetadata,
  toBuffer,
  extractTextFromDocument,
  normalizeExtractedText,
}
