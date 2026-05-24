import { useState, useCallback, useEffect } from 'react'
import type { Candidate } from '@/types'

interface AuthState {
  isAuthenticated: boolean
  candidate: Candidate | null
  isLoading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    candidate: null,
    isLoading: true,
  })

  const login = useCallback(async (email: string, token: string) => {
    setState(prev => ({ ...prev, isLoading: true }))
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      })
      const data = await response.json()
      if (data.success) {
        setState({
          isAuthenticated: true,
          candidate: data.data,
          isLoading: false,
        })
        localStorage.setItem('auth_token', data.data.token)
      }
    } catch {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    setState({
      isAuthenticated: false,
      candidate: null,
      isLoading: false,
    })
  }, [])

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setState(prev => ({ ...prev, isLoading: false }))
      return
    }
    // Verify token with backend
    try {
      const response = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (data.success) {
        setState({
          isAuthenticated: true,
          candidate: data.data,
          isLoading: false,
        })
      } else {
        logout()
      }
    } catch {
      logout()
    }
  }, [logout])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return { ...state, login, logout }
}