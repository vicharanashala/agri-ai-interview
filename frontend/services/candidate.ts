import type { Candidate, ApiResponse } from '@/types'

const API_BASE = '/api/candidate'

export async function getCandidate(id: string): Promise<ApiResponse<Candidate>> {
  const response = await fetch(`${API_BASE}/${id}`)
  return response.json()
}

export async function createCandidate(data: Partial<Candidate>): Promise<ApiResponse<Candidate>> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.json()
}

export async function updateCandidate(id: string, data: Partial<Candidate>): Promise<ApiResponse<Candidate>> {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.json()
}