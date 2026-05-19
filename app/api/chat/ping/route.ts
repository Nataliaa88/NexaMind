import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    return NextResponse.json({ status: 'ok', body })
  } catch (err) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
}
