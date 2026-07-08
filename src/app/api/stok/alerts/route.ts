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
    return NextResponse.json({ error: "Outlet ID harus diisi" }, { status: 400 });
  }

  try {
    // Fetch all stocks for the outlet
    const stocks = await prisma.stock.findMany({
      where: {
        outletId,
        deletedAt: null,
        product: {
          status: "ACTIVE",
          deletedAt: null,
        },
      },
      include: {
        product: true,
      },
    });

    // Filter where quantity is less than or equal to minStock
    // Filter out if the product itself is inactive or soft deleted
    const lowStockAlerts = stocks
      .filter((s) => s.product && s.quantity <= s.minStock)
      .map((s) => ({
        id: s.id,
        productId: s.productId,
        quantity: s.quantity,
        minStock: s.minStock,
        product: {
          name: s.product.name,
          sku: s.product.sku,
        },
      }));

    return NextResponse.json(lowStockAlerts);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat peringatan stok: " + error.message },
      { status: 500 }
    );
  }
}
