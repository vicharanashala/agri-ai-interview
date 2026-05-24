import type { InterviewSession, Message, Evaluation, ApiResponse } from '@/types'

const API_BASE = '/api/interview'

interface StartInterviewResponse extends ApiResponse<InterviewSession> {
  question?: string
}

export async function startInterview(candidateId: string): Promise<StartInterviewResponse> {
  const response = await fetch(`${API_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId }),
  })
  return response.json()
}

export async function sendMessage(sessionId: string, content: string): Promise<ApiResponse<Message>> {
  const response = await fetch(`${API_BASE}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, content }),
  })
  return response.json()
}

export async function endInterview(sessionId: string): Promise<ApiResponse<{ evaluation: Evaluation }>> {
  const response = await fetch(`${API_BASE}/end/${sessionId}`, {
    method: 'POST',
  })
  return response.json()
}

export async function evaluateInterview(sessionId: string): Promise<ApiResponse<Evaluation>> {
  const response = await fetch(`${API_BASE}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  return response.json()
}

export async function checkInterviewStatus(sessionId: string): Promise<ApiResponse<{ status: string }>> {
  const response = await fetch(`${API_BASE}/status/check?sessionId=${sessionId}`)
  return response.json()
}