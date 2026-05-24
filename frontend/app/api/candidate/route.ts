import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth-options'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      fullName, 
      phone, 
      state,
      district,
      pincode,
      address,
      currentRole, 
      yearsOfExperience, 
      highestEducation, 
      institution,
      farmingBackground,
      cropsGrown,
      farmSize,
      primaryExpertise
    } = body;

    // Get user by email or create if not exists
    let user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      // Create user if they don't exist (for demo credentials)
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name || 'Demo User',
        }
      });
    }

    // Create or update candidate profile
    const candidate = await prisma.candidate.upsert({
      where: { userId: user.id },
      update: {
        fullName,
        phone,
        state,
        district,
        pincode,
        address,
        currentRole,
        yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : null,
        highestEducation,
        institution,
        farmingBackground,
        cropsGrown,
        farmSize,
        primaryExpertise,
      },
      create: {
        userId: user.id,
        fullName,
        phone,
        state,
        district,
        pincode,
        address,
        currentRole,
        yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : null,
        highestEducation,
        institution,
        farmingBackground,
        cropsGrown,
        farmSize,
        primaryExpertise,
      },
    });

    return NextResponse.json(candidate, { status: 200 });
  } catch (error) {
    console.error('Error saving candidate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { candidate: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user.candidate, { status: 200 });
  } catch (error) {
    console.error('Error fetching candidate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const PHASE_MAP: Record<number, string> = {
  1: "onboarding",
  2: "interview",
  3: "summary",
  4: "offer",
  5: "signing",
  6: "joining",
};

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { phase } = await request.json();
    const phaseLabel = PHASE_MAP[phase];

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const candidate = await prisma.candidate.update({
      where: { userId: user.id },
      data: { currentPhase: phaseLabel },
    });

    return NextResponse.json({ currentPhase: candidate.currentPhase }, { status: 200 });
  } catch (error) {
    console.error("Error updating candidate phase:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete candidate record (cascade will handle any related data)
    await prisma.candidate.delete({
      where: { userId: user.id }
    });

    return NextResponse.json({ success: true, message: 'Candidate data deleted' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting candidate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
