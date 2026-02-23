import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || !session.user) {
      return NextResponse.json({ isConnected: false }, { status: 200 });
    }

    // Defensive check: ensure user.id exists
    if (!session.user.id) {
      console.error('Session user missing id property');
      return NextResponse.json({ isConnected: false }, { status: 200 });
    }

    const googleAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'google',
      },
    });

    return NextResponse.json({
      isConnected: !!googleAccount,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json({ isConnected: false }, { status: 200 });
  }
}
