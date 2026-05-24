import { useState, useCallback } from 'react'
import type { Message, InterviewState } from '@/types'

export function useInterview() {
  const [state, setState] = useState<InterviewState>({
    sessionId: null,
    status: 'idle',
    messages: [],
    currentQuestion: null,
    evaluation: null,
  })

  const startInterview = useCallback(async (candidateId: string) => {
    setState(prev => ({ ...prev, status: 'loading' }))
    try {
      const response = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      })
      const data = await response.json()
      if (data.success) {
        setState(prev => ({
          ...prev,
          sessionId: data.data.sessionId,
          status: 'active',
          messages: data.data.messages || [],
          currentQuestion: data.data.question,
        }))
      }
    } catch {
      setState(prev => ({ ...prev, status: 'error' }))
    }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!state.sessionId) return
    try {
      const response = await fetch('/api/interview/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, content }),
      })
      const data = await response.json()
      if (data.success) {
        const newMessage: Message = {
          id: Date.now().toString(),
          sessionId: state.sessionId,
          content,
          sender: 'candidate',
          timestamp: new Date(),
        }
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, newMessage, data.data],
          currentQuestion: data.data.sender === 'ai' ? data.data.content : prev.currentQuestion,
        }))
      }
    } catch {
      setState(prev => ({ ...prev, status: 'error' }))
    }
  }, [state.sessionId])

  const endInterview = useCallback(async () => {
    if (!state.sessionId) return
    try {
      const response = await fetch(`/api/interview/end/${state.sessionId}`, {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        setState(prev => ({ ...prev, status: 'idle', evaluation: data.data.evaluation }))
      }
    } catch {
      setState(prev => ({ ...prev, status: 'error' }))
    }
  }, [state.sessionId])

  return { state, startInterview, sendMessage, endInterview }
}