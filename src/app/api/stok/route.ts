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
    const stocks = await prisma.stock.findMany({
      where: {
        outletId,
        deletedAt: null,
        product: {
          deletedAt: null,
          linkedProductId: null,
          linkedProductId2: null,
          operationalStocks: {
            none: {},
          },
        },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: [
        { product: { sortOrder: "asc" } },
        { product: { name: "asc" } },
      ],
    });
    return NextResponse.json(stocks);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memuat stok: " + error.message },
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
  if (user.role !== "DEVELOPER" && user.role !== "OWNER" && user.role !== "KOORLAP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { stockId, minStock } = await req.json();

    if (!stockId || minStock === undefined) {
      return NextResponse.json({ error: "Stock ID dan Min Stock harus diisi" }, { status: 400 });
    }

    const updated = await prisma.stock.update({
      where: { id: stockId },
      data: {
        minStock: parseInt(minStock),
      },
    });

    // Log Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        table: "stocks",
        recordId: stockId,
        details: JSON.stringify({ minStock }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui batas minimum stok: " + error.message },
      { status: 500 }
    );
  }
}

// POST /api/stok - Create a new stock item (Owner & Developer only)
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden: Owner/Developer only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, categoryId, minStock, initialStock, outletId } = body;

    if (!name || !categoryId || !outletId) {
      return NextResponse.json({ error: "Nama, kategori, dan outlet harus diisi" }, { status: 400 });
    }

    // Check duplicate name
    const existingProduct = await prisma.product.findFirst({
      where: { name, deletedAt: null },
    });
    if (existingProduct) {
      return NextResponse.json({ error: "Nama stok produk sudah digunakan" }, { status: 400 });
    }

    // Auto-generate SKU
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    const sku = `CPK-${random}-${timestamp}`;

    // Determine next sortOrder
    const maxOrderResult = await prisma.product.aggregate({
      _max: { sortOrder: true },
      where: { deletedAt: null },
    });
    const nextSortOrder = (maxOrderResult._max.sortOrder ?? 0) + 1;

    // Create Product (INACTIVE by default)
    const product = await prisma.product.create({
      data: {
        name,
        categoryId,
        sku,
        sellingPrice: 0,
        basePrice: 0,
        status: "INACTIVE",
        sortOrder: nextSortOrder,
      },
    });

    // Initialize Stock for all outlets
    const outlets = await prisma.outlet.findMany({ where: { deletedAt: null } });
    for (const o of outlets) {
      const isCurrentOutlet = o.id === outletId;
      const qty = isCurrentOutlet ? parseInt(initialStock || 0) : 0;

      const stock = await prisma.stock.create({
        data: {
          productId: product.id,
          outletId: o.id,
          initialStock: qty,
          quantity: qty,
          minStock: parseInt(minStock || 5),
        },
      });

      if (isCurrentOutlet && qty > 0) {
        await prisma.stockMovement.create({
          data: {
            stockId: stock.id,
            type: "IN",
            quantity: qty,
            notes: "Stok awal item baru",
            userId: user.id,
          },
        });
      }
    }

    // Log Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        table: "products",
        recordId: product.id,
        details: JSON.stringify({ name, sku, isStockItemOnly: true }),
      },
    });

    return NextResponse.json(product);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal membuat stok baru: " + error.message },
      { status: 500 }
    );
  }
}
