import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any)?.role;
  if (role !== "DEVELOPER" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("all") === "true";

    const whereClause: any = {
      deletedAt: null,
    };

    if (!includeInactive) {
      whereClause.status = "ACTIVE";
    }

    const outlets = await prisma.outlet.findMany({
      where: whereClause,
      orderBy: {
        name: "asc",
      },
    });
    return NextResponse.json(outlets);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat outlet: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, address, phone, email, status } = body;

    if (!name) {
      return NextResponse.json({ error: "Nama outlet wajib diisi" }, { status: 400 });
    }

    // Check uniqueness
    const existing = await prisma.outlet.findFirst({
      where: {
        name,
        deletedAt: null,
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Nama outlet sudah digunakan" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const newOutlet = await tx.outlet.create({
        data: {
          name,
          address: address || null,
          phone: phone || null,
          email: email || null,
          status: status || "ACTIVE",
        },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          table: "outlets",
          recordId: newOutlet.id,
          details: JSON.stringify({ name, address, phone, email }),
        },
      });

      return newOutlet;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menambahkan outlet: " + error.message },
      { status: 500 }
    );
  }
}
