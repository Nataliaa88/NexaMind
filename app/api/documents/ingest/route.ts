import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { buildEmbeddingsForChunks, splitTextIntoChunks } from '@/lib/server/rag'

function createErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return createErrorResponse('Token d’authentification manquant.', 401)
  }

  const supabaseAdmin = getSupabaseAdmin()
  const userResult = await supabaseAdmin.auth.getUser(token)
  if (userResult.error || !userResult.data.user) {
    return createErrorResponse('Utilisateur non authentifié.', 401)
  }

  let body: { documentId?: string }
  try {
    body = await request.json()
  } catch {
    return createErrorResponse('Corps de requête invalide. Attendu : JSON.', 400)
  }

  if (!body?.documentId) {
    return createErrorResponse('`documentId` est requis.', 400)
  }

  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .select('id,user_id,content')
    .eq('id', body.documentId)
    .single()

  if (documentError) {
    return createErrorResponse(`Impossible de lire le document : ${documentError.message}`, 500)
  }

  if (!document) {
    return createErrorResponse('Document introuvable.', 404)
  }

  if (document.user_id !== userResult.data.user.id) {
    return createErrorResponse('Accès refusé au document.', 403)
  }

  if (!document.content || !document.content.trim()) {
    return createErrorResponse('Le document ne contient pas de texte à indexer.', 400)
  }

  const chunks = splitTextIntoChunks(document.content)
  if (chunks.length === 0) {
    return createErrorResponse('Aucun chunk n’a pu être généré.', 500)
  }

  try {
    const embeddings = await buildEmbeddingsForChunks(chunks)

    const deleteResponse = await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('document_id', body.documentId)

    if (deleteResponse.error) {
      return createErrorResponse(`Impossible de supprimer les anciens chunks : ${deleteResponse.error.message}`, 500)
    }

    const rows = chunks.map((chunk, index) => ({
      document_id: body.documentId,
      chunk_index: index,
      chunk_text: chunk.chunkText,
      token_count: chunk.tokenCount,
      embedding: embeddings[index],
    }))

    const batchSize = 50
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize)
      const { error: insertError } = await supabaseAdmin.from('chunks').insert(batch)
      if (insertError) {
        return createErrorResponse(`Impossible d’enregistrer les chunks : ${insertError.message}`, 500)
      }
    }

    return NextResponse.json({ documentId: body.documentId, chunkCount: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue lors de la génération des embeddings.'
    return createErrorResponse(`Ingestion échouée : ${message}`, 500)
  }
}
