import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { getOpenAIChatCompletion, getOpenAIEmbeddings } from '@/lib/server/openai'
import { cosineSimilarity, buildEmbeddingsForChunks, splitTextIntoChunks } from '@/lib/server/rag'
import { getDocumentContextForUser } from '@/lib/server/documentContext'
import { buildRagUserPrompt, buildUnifiedChatSystemPrompt, systemPrompts } from '@/lib/server/chatPrompts'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { extractTextFromDocument, getDocumentTypeFromMetadata, toBuffer } from '@/lib/document-processing/extract-text'

type Body = {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  sharedDocument?: {
    id: string
    title?: string
    type?: 'PDF' | 'TXT' | 'DOCX'
    fileUrl?: string | null
    createdAt?: string
    content?: string
  }
}

function createError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

type ChunkRow = {
  id: string
  document_id: string
  chunk_text: string
  chunk_index: number
  embedding: number[]
}

function sortChunksBySimilarity(chunks: ChunkRow[], queryEmbedding: number[]) {
  return chunks
    .map((chunk) => ({
      ...chunk,
      similarity: cosineSimilarity(chunk.embedding ?? [], queryEmbedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
}

function getLastUserMessage(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  return lastUser?.content?.trim() ?? ''
}

function buildTopChunksContext(topChunks: ChunkRow[], documents: Array<{ id: string; title: string }>) {
  const byDocument = documents.reduce<Record<string, string>>((acc, doc) => {
    acc[doc.id] = doc.title || 'Document sans titre'
    return acc
  }, {})

  return topChunks
    .map(
      (chunk, index) =>
        `=== Passage ${index + 1} (Document ${chunk.document_id} - ${byDocument[chunk.document_id]}) ===\n${chunk.chunk_text}`
    )
    .join('\n\n')
}

const processEnv = process as any
const STORAGE_BUCKET = processEnv.env?.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'documents'

async function retrieveTopChunksForQuery(
  supabase: ReturnType<typeof createServerClient>,
  documentIds: string[],
  query: string,
  limit = 4
) {
  if (!query.trim() || documentIds.length === 0) {
    return [] as ChunkRow[]
  }

  const embeddingResult = await getOpenAIEmbeddings([query])
  const queryEmbedding = embeddingResult[0]
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return []
  }

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('id,document_id,chunk_text,chunk_index,embedding')
    .in('document_id', documentIds)

  if (chunksError || !chunks) {
    console.warn('[chat/ia] chunk retrieval failed', { error: chunksError })
    return []
  }

  const topChunks = sortChunksBySimilarity(chunks as ChunkRow[], queryEmbedding).slice(0, limit)
  return topChunks
}

async function extractDocumentContentIfMissing(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  documentId: string,
  userId: string
) {
  const { data: document, error } = await supabaseAdmin
    .from('documents')
    .select('id,user_id,title,content,storage_path,type')
    .eq('id', documentId)
    .single()

  if (error || !document) {
    console.warn('[chat/ia] shared document lookup failed', { documentId, error })
    return null
  }

  if (document.user_id !== userId) {
    console.warn('[chat/ia] shared document user mismatch', { documentId, owner: document.user_id, requester: userId })
    return null
  }

  const existingText = document.content?.trim()
  if (existingText) {
    return existingText
  }

  if (!document.storage_path) {
    console.warn('[chat/ia] shared document has no storage path', { documentId })
    return null
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(document.storage_path)

  if (downloadError || !fileData) {
    console.error('[chat/ia] shared document download failed', { documentId, error: downloadError })
    return null
  }

  let buffer: Buffer
  try {
    buffer = await toBuffer(fileData)
  } catch (err) {
    console.error('[chat/ia] buffer conversion failed', { documentId, err })
    return null
  }

  let documentType: 'PDF' | 'TXT' | 'DOCX'
  try {
    documentType = getDocumentTypeFromMetadata(document.type, document.title ?? undefined)
  } catch (err) {
    console.warn('[chat/ia] document type fallback', { documentId, err })
    documentType = 'PDF'
  }

  let extractedText: string
  try {
    extractedText = await extractTextFromDocument(buffer, documentType, document.title ?? undefined)
  } catch (err) {
    console.error('[chat/ia] shared document extraction failed', { documentId, err })
    return null
  }

  if (!extractedText.trim()) {
    console.warn('[chat/ia] extracted text is empty', { documentId })
    return null
  }

  const { error: updateError } = await supabaseAdmin
    .from('documents')
    .update({ content: extractedText })
    .eq('id', documentId)

  if (updateError) {
    console.error('[chat/ia] failed to update document content after extraction', { documentId, error: updateError })
  }

  return extractedText
}

async function ensureChunksForDocument(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  documentId: string,
  content: string
) {
  if (!content.trim()) {
    return false
  }

  const { data: existingChunks, error: existingError } = await supabaseAdmin
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .limit(1)

  if (existingError) {
    console.warn('[chat/ia] chunk existence check failed', { documentId, error: existingError })
  }

  if (existingChunks && existingChunks.length > 0) {
    return true
  }

  const chunks = splitTextIntoChunks(content)
  if (chunks.length === 0) {
    console.warn('[chat/ia] no chunks generated for document', { documentId })
    return false
  }

  const embeddings = await buildEmbeddingsForChunks(chunks)
  const rows = chunks.map((chunk, index) => ({
    document_id: documentId,
    chunk_index: index,
    chunk_text: chunk.chunkText,
    token_count: chunk.tokenCount,
    embedding: embeddings[index],
  }))

  const { error: deleteError } = await supabaseAdmin.from('chunks').delete().eq('document_id', documentId)
  if (deleteError) {
    console.warn('[chat/ia] failed to delete old chunks', { documentId, error: deleteError })
  }

  const batchSize = 50
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
    const { error: insertError } = await supabaseAdmin.from('chunks').insert(batch)
    if (insertError) {
      console.error('[chat/ia] failed to insert chunks', { documentId, error: insertError })
      return false
    }
  }

  return true
}

export async function POST(request: Request) {
  console.log('[chat/ia] POST called')

  let body: Body
  try {
    body = await request.json()
  } catch (err) {
    console.error('[chat/ia] invalid JSON body', err)
    return createError('Corps JSON invalide', 400)
  }

  const messages = body?.messages ?? []
  const sharedDocument = body?.sharedDocument

  if (!Array.isArray(messages) || messages.length === 0) {
    return createError('`messages` est requis', 400)
  }

  const processEnv = process as any
  const supabase = createServerClient(
    processEnv.env?.NEXT_PUBLIC_SUPABASE_URL || processEnv.env?.SUPABASE_URL || '',
    processEnv.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || processEnv.env?.SUPABASE_ANON_KEY || '',
    { cookies: await cookies() }
  )

  const bearerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const {
    data: { user },
    error: authError,
  } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser()

  if (authError || !user) {
    console.error('[chat/ia] auth failed', { error: authError, bearerToken: Boolean(bearerToken) })
    return createError('Utilisateur non authentifié', 401)
  }

  const userId = user.id
  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id,title,content,storage_path,type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (docsError) {
      console.error('[chat/ia] documents fetch failed', { error: docsError })
      return createError(`Impossible de charger les documents : ${docsError.message}`, 500)
    }

    const lastUserMessage = getLastUserMessage(messages)
    if (!lastUserMessage) {
      return createError('Aucune question utilisateur trouvée dans le message.', 400)
    }

    let sharedDocumentContent = sharedDocument?.content?.trim() ?? ''
    if (sharedDocument?.id && !sharedDocumentContent) {
      const matchedDocument = Array.isArray(documents)
        ? documents.find((doc) => String(doc.id) === String(sharedDocument.id))
        : undefined

      if (matchedDocument?.content?.trim()) {
        sharedDocumentContent = matchedDocument.content.trim()
      } else {
        const extracted = await extractDocumentContentIfMissing(supabaseAdmin, sharedDocument.id, userId)
        if (extracted) {
          sharedDocumentContent = extracted
        }
      }
    }

    if (sharedDocumentContent && sharedDocument?.id) {
      await ensureChunksForDocument(supabaseAdmin, sharedDocument.id, sharedDocumentContent)
    }

    const documentIds = Array.isArray(documents) ? documents.map((doc) => doc.id) : []
    let topChunks = await retrieveTopChunksForQuery(supabase, documentIds, lastUserMessage, 4)

    if (topChunks.length === 0 && Array.isArray(documents) && documents.length > 0) {
      for (const doc of documents) {
        if (doc.content?.trim()) {
          await ensureChunksForDocument(supabaseAdmin, doc.id, doc.content.trim())
        }
      }
      topChunks = await retrieveTopChunksForQuery(supabase, documentIds, lastUserMessage, 4)
    }

    let finalDocumentContext = ''
    let payloadMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>

    if (topChunks.length > 0) {
      const ragPrompt = buildRagUserPrompt(lastUserMessage, topChunks, 'Interne')
      payloadMessages = [
        { role: 'system', content: systemPrompts.Interne },
        { role: 'user', content: ragPrompt },
      ]
    } else {
      if (sharedDocumentContent) {
        const sharedTitle = sharedDocument?.title ? sharedDocument.title.trim() : 'Document partagé'
        const sharedId = sharedDocument?.id ?? 'document-partage'
        finalDocumentContext = `=== Shared Document: ${sharedTitle} (${sharedId}) ===\n${sharedDocumentContent}`
      } else {
        finalDocumentContext = await getDocumentContextForUser(supabase, userId)
      }

      const systemPrompt = buildUnifiedChatSystemPrompt(finalDocumentContext)
      payloadMessages = [{ role: 'system', content: systemPrompt }, ...messages]
    }

    const reply = await getOpenAIChatCompletion(payloadMessages)

    const sources = Array.isArray(documents) ? documents.map((doc) => ({ id: doc.id, title: doc.title })) : []
    if (sharedDocument) {
      sources.unshift({ id: sharedDocument.id, title: sharedDocument.title ?? 'Document partagé' })
    }

    return NextResponse.json({ reply, sources })
  } catch (err) {
    console.error('[chat/ia] request failed', { error: err })
    const msg = err instanceof Error ? err.message : 'Erreur IA interne'
    return NextResponse.json({ error: `IA échouée : ${msg}` }, { status: 500 })
  }
}
