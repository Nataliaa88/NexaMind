'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/dashboard')
      } else {
        router.push('/auth/login')
      }
    }
    checkUser()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div>Loading...</div>
    </div>
  )
}
