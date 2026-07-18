import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: true, message: "No active session to log" });
    }

    const user = session.user as any;
    
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGOUT",
        table: "users",
        recordId: user.id,
        details: JSON.stringify({ username: user.username || user.email }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to log logout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
