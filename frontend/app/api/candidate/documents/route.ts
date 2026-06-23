import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Look up candidate by user email — next-auth JWT session survives browser restarts
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { candidate: true },
    })

    if (!user?.candidate) {
      return NextResponse.json({ documents: [] })
    }

    const docs = await prisma.candidateDocument.findMany({
      where: { candidateId: user.candidate.id },
      orderBy: { createdAt: 'asc' },
      select: {
        fieldName: true,
        fileIndex: true,
        fileName: true,
        fileType: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      documents: docs.map(d => ({
        fieldName: d.fieldName,
        fileIndex: d.fileIndex,
        fileName: d.fileName,
        fileType: d.fileType,
        createdAt: d.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Look up candidate by user email — works even after browser restart (next-auth JWT session persists)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { candidate: true },
    })

    if (!user?.candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    const candidateId = user.candidate.id

    // Allowed file types (must match backend/app/api/candidate/documents.py)
    const ALLOWED_CONTENT_TYPES = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])

    const MAX_SIZES: Record<string, number> = {
      updated_resume: 5, marksheet_10: 10, marksheet_12: 10,
      grad_marksheets: 10, grad_certificate: 10, pg_marksheets: 10,
      pg_certificate: 10, experience_letter: 5, salary_slips: 5,
      aadhaar: 5, pan: 5, bank_details: 5, other_docs: 5, noc: 5,
    }

    const ALL_FIELD_KEYS = [
      'updated_resume', 'marksheet_10', 'marksheet_12',
      'grad_marksheets', 'grad_certificate', 'pg_marksheets',
      'pg_certificate', 'experience_letter', 'salary_slips',
      'aadhaar', 'pan', 'bank_details', 'other_docs', 'noc',
    ]

    const formData = await request.formData()
    const fileKeysInForm = Array.from(formData.keys()).filter(k => k !== 'credentials')

    if (fileKeysInForm.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    for (const fieldKey of fileKeysInForm) {
      if (!ALL_FIELD_KEYS.includes(fieldKey)) continue

      const files = formData.getAll(fieldKey).filter(v => v instanceof File) as File[]

      for (const file of files) {
        // Validate type
        const ext = file.name.toLowerCase().split('.').pop() || ''
        if (!ALLOWED_CONTENT_TYPES.has(file.type) && !['pdf', 'doc', 'docx'].includes(ext)) {
          return NextResponse.json(
            { error: `Only PDF and DOCX files are allowed for ${fieldKey}` },
            { status: 400 }
          )
        }

        // Validate size
        const maxMB = MAX_SIZES[fieldKey] ?? 5
        if (file.size > maxMB * 1024 * 1024) {
          return NextResponse.json(
            { error: `File exceeds ${maxMB}MB limit for ${fieldKey}` },
            { status: 400 }
          )
        }

        // Convert to base64
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')

        // Get next fileIndex for this candidate+field
        const lastDoc = await prisma.candidateDocument.findFirst({
          where: { candidateId, fieldName: fieldKey },
          orderBy: { fileIndex: 'desc' },
        })
        const nextIndex = (lastDoc?.fileIndex ?? 0) + 1

        // Save directly to Prisma (this DB is shared with backend via same host/port)
        await prisma.candidateDocument.create({
          data: {
            candidateId,
            fieldName: fieldKey,
            fileIndex: nextIndex,
            fileName: file.name,
            fileType: ext === 'pdf' ? 'pdf' : ext === 'doc' ? 'doc' : 'docx',
            fileData: base64,
          },
        })
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error uploading documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}