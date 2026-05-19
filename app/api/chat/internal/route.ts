import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { getOpenAIChatCompletion } from '@/lib/server/openai'
import { getDocumentContextForUser, buildContextPrompt } from '@/lib/server/documentContext'
import { systemPrompts } from '@/lib/server/chatPrompts'

type Body = { query?: string }

interface ApiResponse {
  reply?: string
  sources?: Array<Record<string, unknown>>
  error?: string
}

function createError(message: string, status = 400): NextResponse<ApiResponse> {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  console.log('[chat/internal] POST called')

  let body: Body
  try {
    body = await request.json()
  } catch (err) {
    console.error('[chat/internal] JSON parse error', { err })
    return createError('Corps JSON invalide', 400)
  }

  const query = body?.query?.trim()
  if (!query) {
    console.warn('[chat/internal] missing or empty query')
    return createError('`query` est requis', 400)
  }

  const cookiesStore = await cookies()

  const processEnv = process as any
  const supabase = createServerClient(
    processEnv.env?.NEXT_PUBLIC_SUPABASE_URL || processEnv.env?.SUPABASE_URL || '',
    processEnv.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || processEnv.env?.SUPABASE_ANON_KEY || '',
    { cookies: cookiesStore }
  )

  const bearerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const {
    data: { user },
    error: authError,
  } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser()

  if (authError || !user) {
    console.error('[chat/internal] auth failed', { error: authError, bearerToken: Boolean(bearerToken) })
    return createError('Utilisateur non authentifié', 401)
  }

  const userId = user.id
  console.log('[chat/internal] authenticated user', { userId })

  try {
    console.log('[chat/internal] fetching document context')
    const documentContext = await getDocumentContextForUser(supabase, userId)

    const userPrompt = buildContextPrompt(query, documentContext, 'Interne')

    const messages = [
      { role: 'system' as const, content: systemPrompts.Interne },
      { role: 'user' as const, content: userPrompt },
    ]

    console.log('[chat/internal] calling OpenAI', {
      hasDocuments: documentContext.length > 0,
      queryLength: query.length,
    })

    const reply = await getOpenAIChatCompletion(messages)

    console.log('[chat/internal] OpenAI response received', { replyLength: reply.length })

    return NextResponse.json({ reply, sources: [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur serveur interne'
    const isOpenAIError = msg.includes('OpenAI') || msg.includes('401') || msg.includes('429')

    console.error('[chat/internal] request failed', {
      error: msg,
      isOpenAIError,
      stack: err instanceof Error ? err.stack : undefined,
    })

    return NextResponse.json(
      { error: `Recherche interne échouée : ${msg}` },
      { status: isOpenAIError ? 502 : 500 }
    )
  }
}