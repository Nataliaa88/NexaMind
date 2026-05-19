declare module 'pdf-parse' {
  export interface PDFParseResult {
    text?: string
    numpages?: number
    numrender?: number
    info?: Record<string, unknown>
    metadata?: Record<string, unknown>
    version?: string
  }

  function pdfParse(data: Buffer | Uint8Array | string, options?: Record<string, unknown>): Promise<PDFParseResult>

  export default pdfParse
}
