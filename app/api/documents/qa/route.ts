import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { getOpenAIChatCompletion, getOpenAIEmbeddings } from '@/lib/server/openai'
import { cosineSimilarity } from '@/lib/server/rag'
import { buildRagUserPrompt, systemPrompts, ChatMode } from '@/lib/server/chatPrompts'

function createErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function sortChunksBySimilarity(chunks: any[], queryEmbedding: number[]) {
  return chunks
    .map((chunk) => ({
      ...chunk,
      similarity: cosineSimilarity(chunk.embedding ?? [], queryEmbedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
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

  let body: { query?: string; source?: ChatMode; limit?: number }
  try {
    body = await request.json()
  } catch {
    return createErrorResponse('Corps de requête invalide. Attendu : JSON.', 400)
  }

  if (!body?.query || !body.query.trim()) {
    return createErrorResponse('`query` est requis.', 400)
  }

  const source: ChatMode = body.source ?? 'Mixte'
  const limit = Math.min(Math.max(body.limit ?? 4, 1), 6)

  if (source === 'IA') {
    try {
      const reply = await getOpenAIChatCompletion([
        { role: 'system', content: systemPrompts.IA },
        { role: 'user', content: body.query },
      ])
      return NextResponse.json({ reply, sources: [] })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue pendant l’appel IA.'
      return createErrorResponse(`Recherche IA échouée : ${message}`, 500)
    }
  }

  const embeddingResult = await getOpenAIEmbeddings([body.query])
  const queryEmbedding = embeddingResult[0]

  try {
    const { data: docs, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('id,title,user_id')
      .eq('user_id', userResult.data.user.id)

    if (docsError) {
      return createErrorResponse(`Impossible de lire les documents : ${docsError.message}`, 500)
    }

    const documentIds = docs?.map((doc: any) => doc.id) ?? []
    if (documentIds.length === 0) {
      return createErrorResponse('Aucun document associé à cet utilisateur.', 404)
    }

    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('chunks')
      .select('id,document_id,chunk_text,chunk_index,embedding')
      .in('document_id', documentIds)

    if (chunksError) {
      return createErrorResponse(`Impossible de charger les chunks : ${chunksError.message}`, 500)
    }

    if (!chunks || chunks.length === 0) {
      return createErrorResponse('Aucun chunk disponible pour la recherche. Ingérez d’abord vos documents.', 404)
    }

    const topChunks = sortChunksBySimilarity(chunks, queryEmbedding).slice(0, limit)
    const userPrompt = buildRagUserPrompt(body.query, topChunks, source)

    const reply = await getOpenAIChatCompletion([
      { role: 'system', content: systemPrompts[source] },
      { role: 'user', content: userPrompt },
    ])

    return NextResponse.json({
      reply,
      sources: topChunks.map((chunk) => ({
        documentId: chunk.document_id,
        chunkIndex: chunk.chunk_index,
        chunkText: chunk.chunk_text,
        similarity: chunk.similarity,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue pendant la recherche QA.'
    return createErrorResponse(`Recherche QA échouée : ${message}`, 500)
  }
}
