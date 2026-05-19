import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { extractTextFromDocument, getDocumentTypeFromMetadata, toBuffer } from '@/lib/document-processing/extract-text'

const processEnv = process as any
const STORAGE_BUCKET = processEnv.env?.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'documents'

function createErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    console.error('[extract route] missing auth token')
    return createErrorResponse('Token d’authentification manquant.', 401)
  }

  const supabaseAdmin = getSupabaseAdmin()
  const userResult = await supabaseAdmin.auth.getUser(token)
  if (userResult.error || !userResult.data.user) {
    console.error('[extract route] auth failed', { err: userResult.error })
    return createErrorResponse('Utilisateur non authentifié.', 401)
  }

  let body: { documentId?: string }
  try {
    body = await request.json()
  } catch (error) {
    console.error('[extract route] invalid JSON body', { err: error })
    return createErrorResponse('Corps de requête invalide. Attendu : JSON.', 400)
  }

  if (!body?.documentId) {
    console.warn('[extract route] missing documentId in body')
    return createErrorResponse('`documentId` est requis.', 400)
  }

  console.log('[extract route] starting extraction pipeline', { documentId: body.documentId })

  // 1. Read document metadata
  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .select('id,storage_path,type,title,user_id')
    .eq('id', body.documentId)
    .single()

  if (documentError) {
    console.error('[extract route] failed to read document record', { err: documentError })
    return createErrorResponse(`Impossible de lire le document : ${documentError.message}`, 500)
  }

  if (!document) {
    console.error('[extract route] document not found', { documentId: body.documentId })
    return createErrorResponse('Document introuvable.', 404)
  }

  if (document.user_id !== userResult.data.user.id) {
    console.error('[extract route] user mismatch', { docUser: document.user_id, requester: userResult.data.user.id })
    return createErrorResponse('Accès refusé au document.', 403)
  }

  if (!document.storage_path) {
    console.error('[extract route] missing storage_path on document record', { document })
    return createErrorResponse('Le chemin de stockage du document est manquant.', 400)
  }

  console.log('[extract route] downloading file from storage', { storagePath: document.storage_path })
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(document.storage_path)

  if (downloadError || !fileData) {
    console.error('[extract route] download failed', { err: downloadError })
    return createErrorResponse(`Erreur lors du téléchargement du document : ${downloadError?.message ?? 'fichier absent'}`, 500)
  }

  // 2. Convert to buffer and log size
  let buffer: Buffer
  try {
    buffer = await toBuffer(fileData)
    console.log('[extract route] buffer created', { byteLength: buffer.length })
  } catch (err) {
    console.error('[extract route] toBuffer failed', { err })
    return createErrorResponse(`Impossible de convertir le fichier en Buffer : ${err instanceof Error ? err.message : String(err)}`, 500)
  }

  // 3. Detect basic MIME/type from buffer signature and metadata
  let detectedMime = 'unknown'
  try {
    const sig = buffer.slice(0, 4).toString('binary')
    if (sig.startsWith('%PDF')) detectedMime = 'application/pdf'
    else if (sig === 'PK\u0003\u0004' || sig === 'PK\x03\x04') detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else detectedMime = 'application/octet-stream'
    console.log('[extract route] detected mime', { signature: sig, detectedMime })
  } catch (err) {
    console.warn('[extract route] mime detection failed', { err })
  }

  // 4. Determine document type to use for extraction
  let documentType: 'PDF' | 'TXT' | 'DOCX'
  try {
    documentType = getDocumentTypeFromMetadata(document.type, document.title ?? undefined)
    console.log('[extract route] documentType from metadata', { documentType })
  } catch (err) {
    // Fallback to heuristic
    if (detectedMime === 'application/pdf') documentType = 'PDF'
    else if (detectedMime.includes('openxml')) documentType = 'DOCX'
    else documentType = 'TXT'
    console.warn('[extract route] falling back to heuristic documentType', { documentType, detectedMime })
  }

  // 5. Extraction
  let extractedText = ''
  try {
    console.log('[extract route] starting extraction', { documentType })
    extractedText = await extractTextFromDocument(buffer, documentType as any, document.title ?? undefined)
    console.log('[extract route] extraction finished', { extractedLength: extractedText.length })
  } catch (err) {
    console.error('[extract route] extraction error', { err: err instanceof Error ? err.message : String(err) })
    return createErrorResponse(`Extraction échouée : ${err instanceof Error ? err.message : String(err)}`, 500)
  }

  // 6. Update Supabase documents.content
  try {
    console.log('[extract route] updating document record with extracted content (truncated for log)', { excerpt: extractedText.substring(0, 120) })
    const { error: updateError } = await supabaseAdmin.from('documents').update({ content: extractedText }).eq('id', body.documentId)

    if (updateError) {
      console.error('[extract route] supabase update failed', { err: updateError })
      return createErrorResponse(`Impossible de sauvegarder le contenu extrait : ${updateError.message}`, 500)
    }

    // 7. Verify update
    try {
      const { data: verifyDoc, error: verifyError } = await supabaseAdmin.from('documents').select('id,content').eq('id', body.documentId).single()
      if (verifyError) {
        console.error('[extract route] verification read failed', { err: verifyError })
      } else {
        console.log('[extract route] verification read success', { id: verifyDoc.id, contentLength: typeof verifyDoc.content === 'string' ? verifyDoc.content.length : 0 })
      }
    } catch (e) {
      console.warn('[extract route] verification read threw', { err: e })
    }

    console.log('[extract route] extraction pipeline completed successfully', { documentId: body.documentId })
    return NextResponse.json({ documentId: body.documentId, extractedText })
  } catch (err) {
    console.error('[extract route] unexpected error during update', { err })
    return createErrorResponse(`Erreur lors de la sauvegarde du contenu : ${err instanceof Error ? err.message : String(err)}`, 500)
  }
}
