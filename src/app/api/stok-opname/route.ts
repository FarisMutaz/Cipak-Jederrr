import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const uniqueNames = searchParams.get("uniqueNames") === "true";

  if (uniqueNames) {
    try {
      const stocks = await prisma.operationalStock.findMany({
        where: {
          deletedAt: null,
        },
        select: {
          name: true,
        },
        distinct: ["name"],
        orderBy: {
          name: "asc",
        },
      });
      return NextResponse.json(stocks.map((s) => s.name));
    } catch (error: any) {
      return NextResponse.json(
        { error: "Gagal memuat nama bahan operasional: " + error.message },
        { status: 500 }
      );
    }
  }

  const outletId = searchParams.get("outletId");

  if (!outletId) {
    return NextResponse.json({ error: "Outlet ID harus ditentukan" }, { status: 400 });
  }

  const user = session.user as any;
  const userRole = user.role;
  const userOutlets = user.outlets || [];

  // Scoping check
  if (userRole !== "DEVELOPER" && userRole !== "OWNER") {
    const hasAccess = userOutlets.some((o: any) => o.id === outletId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: Scoped outlet access only" }, { status: 403 });
    }
  }

  try {
    const stocks = await prisma.operationalStock.findMany({
      where: {
        outletId,
        deletedAt: null,
      },
      orderBy: {
        name: "asc",
      },
    });
    return NextResponse.json(stocks);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat stok opname: " + error.message },
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
    return NextResponse.json({ error: "Forbidden: Akses tidak diizinkan" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, unit, minStock, initialStock, outletId, qtyPerUnit } = body;

    if (!name || !outletId) {
      return NextResponse.json({ error: "Nama barang dan outlet harus diisi" }, { status: 400 });
    }

    // Check duplicate name in the same outlet (active or deleted)
    const existingAny = await prisma.operationalStock.findFirst({
      where: {
        name,
        outletId,
      },
    });

    if (existingAny && existingAny.deletedAt === null) {
      return NextResponse.json({ error: "Barang dengan nama ini sudah ada di outlet" }, { status: 400 });
    }

    const qty = parseFloat(initialStock || 0);

    const result = await prisma.$transaction(async (tx) => {
      let stock;
      if (existingAny && existingAny.deletedAt !== null) {
        // Restore soft-deleted item
        stock = await tx.operationalStock.update({
          where: { id: existingAny.id },
          data: {
            unit: unit || "pcs",
            initialStock: qty,
            quantity: qty,
            minStock: parseFloat(minStock || 5),
            qtyPerUnit: parseInt(qtyPerUnit || 1),
            deletedAt: null, // Restore
          },
        });
      } else {
        // Create new item
        stock = await tx.operationalStock.create({
          data: {
            name,
            unit: unit || "pcs",
            outletId,
            initialStock: qty,
            quantity: qty,
            minStock: parseFloat(minStock || 5),
            qtyPerUnit: parseInt(qtyPerUnit || 1),
          },
        });
      }

      if (qty > 0) {
        await tx.operationalStockMovement.create({
          data: {
            operationalStockId: stock.id,
            type: "IN",
            quantity: qty,
            notes: "Stok awal barang baru",
            userId: user.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          table: "operational_stocks",
          recordId: stock.id,
          details: JSON.stringify({ name, initialStock: qty }),
        },
      });

      return stock;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal membuat barang baru: " + error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden: Akses tidak diizinkan" }, { status: 403 });
  }

  try {
    const { stockId, minStock, qtyPerUnit } = await req.json();

    if (!stockId || (minStock === undefined && qtyPerUnit === undefined)) {
      return NextResponse.json({ error: "Stock ID dan setidaknya satu field harus diisi" }, { status: 400 });
    }

    const updated = await prisma.operationalStock.update({
      where: { id: stockId },
      data: {
        ...(minStock !== undefined && { minStock: parseFloat(minStock) }),
        ...(qtyPerUnit !== undefined && { qtyPerUnit: parseInt(qtyPerUnit) }),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        table: "operational_stocks",
        recordId: stockId,
        details: JSON.stringify({ minStock }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui batas minimum: " + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden: Akses tidak diizinkan" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const stockId = searchParams.get("stockId");

    if (!stockId) {
      return NextResponse.json({ error: "Stock ID harus ditentukan" }, { status: 400 });
    }

    const stock = await prisma.operationalStock.update({
      where: { id: stockId },
      data: {
        deletedAt: new Date(),
      },
    });

    // Log Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        table: "operational_stocks",
        recordId: stockId,
        details: JSON.stringify({ name: stock.name, outletId: stock.outletId }),
      },
    });

    return NextResponse.json({ success: true, message: "Barang opname berhasil dihapus" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus barang opname: " + error.message },
      { status: 500 }
    );
  }
}
