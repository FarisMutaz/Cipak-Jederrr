import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function DELETE(req: Request) {
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
    const { productIds } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "Pilih produk yang ingin dihapus" }, { status: 400 });
    }

    const now = new Date();
    const results = await prisma.$transaction(async (tx) => {
      // Get product details for audit log
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true },
      });

      // Soft delete the selected products
      const count = await tx.product.updateMany({
        where: { id: { in: productIds } },
        data: { deletedAt: now },
      });

      // Soft delete child/derived products linked to these parents
      await tx.product.updateMany({
        where: {
          OR: [
            { linkedProductId: { in: productIds } },
            { linkedProductId2: { in: productIds } }
          ],
          deletedAt: null,
        },
        data: { deletedAt: now },
      });

      // Log Audit
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE_BULK",
          table: "products",
          recordId: "BULK",
          details: JSON.stringify({
            count: count.count,
            deletedProducts: products,
          }),
        },
      });

      return count;
    });

    return NextResponse.json({
      success: true,
      message: `${results.count} produk berhasil dihapus`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus produk secara massal: " + error.message },
      { status: 500 }
    );
  }
}
