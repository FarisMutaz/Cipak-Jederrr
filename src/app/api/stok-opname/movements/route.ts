import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const outletId = searchParams.get("outletId");

  if (!outletId) {
    return NextResponse.json({ error: "Outlet ID harus ditentukan" }, { status: 400 });
  }

  try {
    const movements = await prisma.operationalStockMovement.findMany({
      where: {
        operationalStock: {
          outletId,
          deletedAt: null,
        },
      },
      include: {
        operationalStock: true,
        user: {
          select: { name: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    const formatted = movements.map((m) => ({
      id: m.id,
      itemName: m.operationalStock.name,
      unit: m.operationalStock.unit,
      type: m.type, // IN, OUT, ADJUSTMENT
      quantity: m.quantity,
      notes: m.notes,
      createdAt: m.createdAt,
      userName: m.user?.name || "Sistem",
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat log riwayat stok opname: " + error.message },
      { status: 500 }
    );
  }
}
