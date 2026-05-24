import type { Candidate, ApiResponse } from '@/types'

const API_BASE = '/api/auth'

interface LoginRequest {
  email: string
  token: string
}

interface LoginResponse extends ApiResponse<Candidate> {
  token?: string
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.json()
}

export async function logout(): Promise<ApiResponse<void>> {
  const response = await fetch(`${API_BASE}/logout`, {
    method: 'POST',
  })
  return response.json()
}

export async function verifyAuth(): Promise<ApiResponse<Candidate>> {
  const token = localStorage.getItem('auth_token')
  if (!token) {
    return { success: false, error: 'No token found' }
  }
  const response = await fetch(`${API_BASE}/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.json()
}