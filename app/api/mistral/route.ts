import { NextResponse } from 'next/server'
import { buildMistralMessages, systemPrompts, ChatMode } from '@/lib/server/chatPrompts'

const processEnv = process as any
const OPENAI_API_KEY = processEnv.env?.OPENAI_API_KEY
const OPENAI_MODEL = processEnv.env?.OPENAI_MODEL ?? 'gpt-4o-mini'
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

export async function POST(request: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY non défini' }, { status: 500 })
  }

  let body: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; source?: ChatMode }

  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const { messages, source = 'Mixte' } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Aucun message envoyé' }, { status: 400 })
  }

  const promptSource: ChatMode = source in systemPrompts ? source : 'Mixte'

  const payload = {
    model: OPENAI_MODEL,
    messages: buildMistralMessages(promptSource, messages),
    temperature: 0.2,
    max_tokens: 512,
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      const errorMessage =
        response.status === 401
          ? 'Clé OpenAI invalide ou non autorisée. Vérifiez le token dans .env.local.'
          : `Erreur OpenAI: ${response.status} ${errorBody}`

      return NextResponse.json(
        { error: errorMessage, details: errorBody },
        { status: response.status }
      )
    }

    const data = await response.json()
    const assistantReply = data?.choices?.[0]?.message?.content ?? null

    if (!assistantReply) {
      return NextResponse.json({ error: 'Aucune réponse renvoyée par OpenAI' }, { status: 502 })
    }

    return NextResponse.json({ reply: assistantReply.trim(), model: OPENAI_MODEL })
  } catch (error) {
    return NextResponse.json({ error: `Problème de connexion à OpenAI: ${String(error)}` }, { status: 502 })
  }
}
