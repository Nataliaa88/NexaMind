function getOpenAIConfig() {
  const processEnv = process as any
  const OPENAI_API_KEY = processEnv.env?.OPENAI_API_KEY
  const OPENAI_EMBEDDING_MODEL = processEnv.env?.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large'
  const OPENAI_CHAT_MODEL = processEnv.env?.OPENAI_MODEL ?? 'gpt-4o-mini'

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY doit être défini dans l’environnement.')
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  }

  return { headers, OPENAI_EMBEDDING_MODEL, OPENAI_CHAT_MODEL }
}

export async function getOpenAIEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) {
    return []
  }

  const { headers, OPENAI_EMBEDDING_MODEL } = getOpenAIConfig()
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: inputs,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI embeddings failed: ${response.status} ${errorText}`)
  }
  let data: any
  try {
    data = await response.json()
  } catch (parseErr) {
    const raw = await response.text()
    throw new Error(`Réponse non JSON reçue (embeddings): ${raw}`)
  }
  if (!Array.isArray(data.data)) {
    throw new Error('Réponse OpenAI embeddings invalide.')
  }

  return data.data.map((item: any) => {
    if (!Array.isArray(item.embedding)) {
      throw new Error('Embedding OpenAI manquant ou mal formé.')
    }
    return item.embedding as number[]
  })
}

export async function getOpenAIChatCompletion(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
  const { headers, OPENAI_CHAT_MODEL } = getOpenAIConfig()
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 512,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[openai] non-ok response', { status: response.status, statusText: response.statusText, bodyPreview: errorText?.slice(0, 200) })
    throw new Error(`OpenAI completion failed: ${response.status} ${errorText}`)
  }

  let completionData: any
  try {
    completionData = await response.json()
  } catch (parseErr) {
    const raw = await response.text()
    console.error('[openai] failed to parse JSON (completion)', { parseErr: String(parseErr), status: response.status, rawPreview: raw?.slice(0, 1000) })
    throw new Error(`Réponse non JSON reçue (completion): ${raw}`)
  }

  const reply = completionData?.choices?.[0]?.message?.content
  if (typeof reply !== 'string') {
    throw new Error('Réponse OpenAI invalide.')
  }
  return reply.trim()
}
