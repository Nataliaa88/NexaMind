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

export function getDocumentTypeFromMetadata(
  declaredType: string | null | undefined,
  fileName?: string
): SupportedDocumentType {
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
    return Buffer.from(data.buffer)
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

export async function extractTextFromDocument(
  buffer: Buffer,
  documentType: SupportedDocumentType,
  fileName?: string
): Promise<string> {
  if (buffer.length === 0) {
    throw new Error('Le fichier est vide.')
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('Le fichier est trop volumineux pour une extraction en continu. Limite : 30 MB.')
  }

  switch (documentType) {
    case 'PDF': {
      const result = await pdfParse(buffer)
      const text = result.text ?? ''
      return normalizeExtractedText(text)
    }

    case 'TXT': {
      const text = buffer.toString('utf8')
      return normalizeExtractedText(text)
    }

    case 'DOCX': {
      const result = await mammoth.extractRawText({ buffer })
      return normalizeExtractedText(result.value ?? '')
    }

    default:
      throw new Error('Type de document non supporté pour l’extraction.')
  }
}
