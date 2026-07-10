import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// PUT /api/products/[id] - Update product details
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, categoryId, sku, barcode, sellingPrice, basePrice, status, linkedProductId, linkedProductId2, operationalStocks, stockDeductionQty, stockDeductionQty2 } = body;

    // Check SKU duplicate (excluding self)
    if (sku) {
      const existing = await prisma.product.findFirst({
        where: {
          sku,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (existing) {
        return NextResponse.json({ error: "SKU produk sudah digunakan" }, { status: 400 });
      }
    }

    const oldProduct = await prisma.product.findUnique({
      where: { id },
      select: {
        linkedProductId: true,
        linkedProductId2: true,
        operationalStocks: true,
      },
    });

    if (oldProduct) {
      const hasLinkedIdInBody = linkedProductId !== undefined;
      const targetLinkedId = hasLinkedIdInBody ? (linkedProductId || null) : oldProduct.linkedProductId;

      const hasLinkedId2InBody = linkedProductId2 !== undefined;
      const targetLinkedId2 = hasLinkedId2InBody ? (linkedProductId2 || null) : oldProduct.linkedProductId2;

      const hasOpStocksInBody = operationalStocks !== undefined;
      const targetHasOpStocks = hasOpStocksInBody ? (operationalStocks && operationalStocks.length > 0) : (oldProduct.operationalStocks.length > 0);

      const isCurrentlyLinked = !!oldProduct.linkedProductId || !!oldProduct.linkedProductId2 || oldProduct.operationalStocks.length > 0;
      const willBeLinked = !!targetLinkedId || !!targetLinkedId2 || targetHasOpStocks;

      if (!isCurrentlyLinked && willBeLinked) {
        // Transition: independent -> linked. Delete independent stock records
        await prisma.stock.deleteMany({
          where: { productId: id },
        });
      } else if (isCurrentlyLinked && !willBeLinked) {
        // Transition: linked -> independent. Initialize stock records for all outlets
        const outlets = await prisma.outlet.findMany({ where: { deletedAt: null } });
        for (const o of outlets) {
          await prisma.stock.create({
            data: {
              productId: id,
              outletId: o.id,
              initialStock: 0,
              quantity: 0,
              minStock: 5,
            },
          });
        }
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name,
        categoryId,
        sku,
        barcode: barcode || null,
        sellingPrice: sellingPrice ? parseFloat(sellingPrice) : undefined,
        basePrice: basePrice ? parseFloat(basePrice) : undefined,
        status,
        linkedProductId: linkedProductId === undefined ? undefined : (linkedProductId || null),
        stockDeductionQty: stockDeductionQty === undefined ? undefined : parseInt(stockDeductionQty),
        linkedProductId2: linkedProductId2 === undefined ? undefined : (linkedProductId2 || null),
        stockDeductionQty2: stockDeductionQty2 === undefined ? undefined : parseInt(stockDeductionQty2),
        operationalStocks: operationalStocks === undefined ? undefined : {
          deleteMany: {},
          create: operationalStocks.map((os: any) => ({
            operationalStockName: os.name,
            deductionQty: parseFloat(os.deductionQty || 1),
          })),
        },
      },
    });

    // Log Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        table: "products",
        recordId: id,
        details: JSON.stringify(body),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui produk: " + error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/products/[id] - Soft delete product
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          deletedAt: now,
        },
      });

      // Soft-delete child/derived products linked to this parent
      await tx.product.updateMany({
        where: {
          OR: [
            { linkedProductId: id },
            { linkedProductId2: id }
          ],
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          table: "products",
          recordId: id,
          details: JSON.stringify({ name: product.name, sku: product.sku }),
        },
      });

      return product;
    });

    return NextResponse.json({ success: true, message: "Produk berhasil dihapus" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus produk: " + error.message },
      { status: 500 }
    );
  }
}
