import { getOpenAIEmbeddings } from '@/lib/server/openai'

export type ChunkRecord = {
  chunkText: string
  chunkIndex: number
  tokenCount: number
}

const DEFAULT_CHUNK_SIZE = 800
const DEFAULT_CHUNK_OVERLAP = 150

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitTextIntoChunks(
  rawText: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
): ChunkRecord[] {
  const normalized = normalizeText(rawText)
  if (!normalized) {
    return []
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized]
  const chunks: ChunkRecord[] = []
  let currentChunk = ''

  const pushChunk = () => {
    if (!currentChunk.trim()) return
    const tokenCount = estimateTokens(currentChunk)
    chunks.push({ chunkText: currentChunk.trim(), chunkIndex: chunks.length, tokenCount })
  }

  for (const sentence of sentences) {
    const candidate = currentChunk ? `${currentChunk} ${sentence.trim()}` : sentence.trim()
    if (candidate.length > chunkSize && currentChunk) {
      pushChunk()
      const overlapText = currentChunk.slice(-overlap)
      currentChunk = overlapText.trim() ? `${overlapText.trim()} ${sentence.trim()}` : sentence.trim()
    } else {
      currentChunk = candidate
    }
  }

  if (currentChunk.trim()) {
    pushChunk()
  }

  return chunks
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length)
  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i]
    magA += a[i] ** 2
    magB += b[i] ** 2
  }

  if (magA === 0 || magB === 0) {
    return 0
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export async function buildEmbeddingsForChunks(chunks: ChunkRecord[]) {
  const texts = chunks.map((chunk) => chunk.chunkText)
  const embeddings = await getOpenAIEmbeddings(texts)
  if (embeddings.length !== chunks.length) {
    throw new Error('Le nombre d’embeddings ne correspond pas au nombre de chunks.')
  }
  return embeddings
}
