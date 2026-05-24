// Common types for the AI Interview Platform

export interface Candidate {
  id: string
  name: string
  email: string
  phone?: string
  createdAt: Date
  updatedAt: Date
}

export interface InterviewSession {
  id: string
  candidateId: string
  status: 'pending' | 'active' | 'completed' | 'cancelled'
  startedAt?: Date
  endedAt?: Date
  questions: Question[]
}

export interface Question {
  id: string
  text: string
  category: string
  order: number
}

export interface Message {
  id: string
  sessionId: string
  content: string
  sender: 'candidate' | 'ai'
  timestamp: Date
}

export interface Evaluation {
  id: string
  sessionId: string
  score: number
  feedback: string
  strengths: string[]
  areasForImprovement: string[]
  evaluatedAt: Date
}

export interface OfferLetter {
  id: string
  candidateId: string
  position: string
  salary: string
  startDate: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
}

export interface JoiningDetails {
  id: string
  candidateId: string
  preferredStartDate: string
  noticePeriod: string
  currentLocation: string
  remarks?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface InterviewState {
  sessionId: string | null
  status: 'idle' | 'loading' | 'active' | 'error'
  messages: Message[]
  currentQuestion: string | null
  evaluation: Evaluation | null
}