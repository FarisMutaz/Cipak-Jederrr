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
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
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
    // Verify user exists in database to prevent foreign key errors due to stale session cookies (e.g. after database seeding/resets)
    const userExists = await prisma.user.findUnique({
      where: { id: user.id, deletedAt: null },
    });
    if (!userExists) {
      return NextResponse.json(
        { error: "Sesi Anda tidak valid atau database telah diperbarui. Silakan keluar (logout) lalu masuk kembali." },
        { status: 401 }
      );
    }

    console.log("POST /api/stok request received. User:", user);
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

    // Run the entire product, stock initialization, and audit logging in a transaction
    const product = await prisma.$transaction(async (tx) => {
      // Create Product (INACTIVE by default)
      const newProduct = await tx.product.create({
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
      const outlets = await tx.outlet.findMany({ where: { deletedAt: null } });
      for (const o of outlets) {
        const isCurrentOutlet = o.id === outletId;
        const qty = isCurrentOutlet ? parseInt(initialStock || 0) : 0;

        const stock = await tx.stock.create({
          data: {
            productId: newProduct.id,
            outletId: o.id,
            initialStock: qty,
            quantity: qty,
            minStock: parseInt(minStock || 5),
          },
        });

        if (isCurrentOutlet && qty > 0) {
          await tx.stockMovement.create({
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
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          table: "products",
          recordId: newProduct.id,
          details: JSON.stringify({ name, sku, isStockItemOnly: true }),
        },
      });

      return newProduct;
    });

    return NextResponse.json(product);
  } catch (error: any) {
    console.error("POST /api/stok failed with error:", error);
    return NextResponse.json(
      { error: "Gagal membuat stok baru: " + error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/stok - Reset all stock counters to 0 for an outlet (Owner & Developer only)
export async function PATCH(req: Request) {
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
    const { action, outletId } = body;

    if (action !== "RESET_ALL") {
      return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    }

    if (!outletId) {
      return NextResponse.json({ error: "Outlet ID harus ditentukan" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // Find all stocks in this outlet that are not deleted
      const stocks = await tx.stock.findMany({
        where: {
          outletId,
          deletedAt: null,
        },
        select: { id: true },
      });

      const stockIds = stocks.map((s) => s.id);

      if (stockIds.length > 0) {
        // Delete all movement logs for these stocks
        await tx.stockMovement.deleteMany({
          where: {
            stockId: { in: stockIds },
          },
        });

        // Reset all stock counters to 0
        await tx.stock.updateMany({
          where: {
            id: { in: stockIds },
          },
          data: {
            initialStock: 0,
            stockIn: 0,
            stockOut: 0,
            sold: 0,
            quantity: 0,
          },
        });
      }

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          table: "stocks",
          recordId: outletId,
          details: JSON.stringify({ action: "RESET_ALL", outletId }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Seluruh stok produk di outlet ini berhasil di-reset menjadi 0!",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal me-reset stok: " + error.message },
      { status: 500 }
    );
  }
}
