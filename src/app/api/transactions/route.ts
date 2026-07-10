import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { PaymentMethod, StockMovementType } from "@prisma/client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const cashierId = user.id;

  try {
    const body = await req.json();
    const { outletId, paymentMethod, notes, items } = body;

    if (!outletId || !paymentMethod || !items || items.length === 0) {
      return NextResponse.json({ error: "Data transaksi tidak lengkap" }, { status: 400 });
    }

    // Verify cashier access to outlet
    const userRole = user.role;
    const userOutlets = user.outlets || [];
    const hasAccess =
      userRole === "DEVELOPER" ||
      userRole === "OWNER" ||
      userOutlets.some((o: any) => o.id === outletId);

    if (!hasAccess) {
      return NextResponse.json({ error: "Anda tidak memiliki akses ke outlet ini" }, { status: 403 });
    }

    // Run transaction atomically
    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Invoice Number: TRX-DDMMYY-001
      const now = new Date();
      const datePrefix =
        now.getDate().toString().padStart(2, "0") +
        (now.getMonth() + 1).toString().padStart(2, "0") +
        now.getFullYear().toString().slice(-2); // e.g. 020726 for 02 Jul 2026

      // Fetch global prefix
      const settings = await tx.setting.findFirst();
      const prefix = settings?.prefixInvoice || "TRX";

      // Count transactions today for counter
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const trxCount = await tx.transaction.count({
        where: {
          outletId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const nextCounter = (trxCount + 1).toString().padStart(3, "0");
      const invoiceNumber = `${prefix}-${datePrefix}-${nextCounter}`;

      // Calculate Subtotal & Total
      let subtotal = 0;
      const transactionItems = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product || product.status !== "ACTIVE" || product.deletedAt) {
          throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan atau tidak aktif`);
        }

        const itemSubtotal = product.sellingPrice * item.quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          productId: product.id,
          quantity: item.quantity,
          price: product.sellingPrice,
          cost: product.basePrice, // Save historical base price (modal)
          subtotal: itemSubtotal,
        });

        // 2. Adjust Stock
        const opStockLinks = await tx.productOperationalStock.findMany({
          where: { productId: product.id },
        });

        if (opStockLinks.length > 0) {
          for (const link of opStockLinks) {
            const deductionQty = item.quantity * (link.deductionQty || 1);
            const opStock = await tx.operationalStock.findUnique({
              where: {
                name_outletId: {
                  name: link.operationalStockName,
                  outletId: outletId,
                },
              },
            });

            if (!opStock) {
              throw new Error(`Bahan operasional "${link.operationalStockName}" tidak terdaftar di outlet ini`);
            }

            // Decrement operational stock quantity and increment stockOut
            await tx.operationalStock.update({
              where: { id: opStock.id },
              data: {
                quantity: { decrement: deductionQty },
                stockOut: { increment: deductionQty },
              },
            });

            // Log Operational Stock Movement
            await tx.operationalStockMovement.create({
              data: {
                operationalStockId: opStock.id,
                type: "OUT",
                quantity: deductionQty,
                notes: `Penjualan ${invoiceNumber} (${product.name} x${item.quantity})`,
                userId: cashierId,
              },
            });
          }
        }

        // Adjust product stock or linked product stock
        const hasLinks = !!product.linkedProductId || !!product.linkedProductId2;

        if (hasLinks) {
          if (product.linkedProductId) {
            const deductionQty1 = item.quantity * (product.stockDeductionQty || 1);
            const stock1 = await tx.stock.findUnique({
              where: {
                productId_outletId: {
                  productId: product.linkedProductId,
                  outletId: outletId,
                },
              },
            });
            if (!stock1) {
              throw new Error(`Stok utama 1 untuk produk ${product.name} tidak terdaftar di outlet ini`);
            }
            await tx.stock.update({
              where: { id: stock1.id },
              data: {
                quantity: { decrement: deductionQty1 },
                sold: { increment: deductionQty1 },
              },
            });
            await tx.stockMovement.create({
              data: {
                stockId: stock1.id,
                type: StockMovementType.OUT,
                quantity: deductionQty1,
                notes: `Penjualan ${invoiceNumber} (${product.name} x${item.quantity})`,
                userId: cashierId,
              },
            });
          }

          if (product.linkedProductId2) {
            const deductionQty2 = item.quantity * (product.stockDeductionQty2 || 1);
            const stock2 = await tx.stock.findUnique({
              where: {
                productId_outletId: {
                  productId: product.linkedProductId2,
                  outletId: outletId,
                },
              },
            });
            if (!stock2) {
              throw new Error(`Stok utama 2 untuk produk ${product.name} tidak terdaftar di outlet ini`);
            }
            await tx.stock.update({
              where: { id: stock2.id },
              data: {
                quantity: { decrement: deductionQty2 },
                sold: { increment: deductionQty2 },
              },
            });
            await tx.stockMovement.create({
              data: {
                stockId: stock2.id,
                type: StockMovementType.OUT,
                quantity: deductionQty2,
                notes: `Penjualan ${invoiceNumber} (${product.name} x${item.quantity})`,
                userId: cashierId,
              },
            });
          }
        } else if (opStockLinks.length === 0) {
          const deductionQty = item.quantity;
          const stock = await tx.stock.findUnique({
            where: {
              productId_outletId: {
                productId: product.id,
                outletId: outletId,
              },
            },
          });
          if (!stock) {
            throw new Error(`Stok untuk produk ${product.name} tidak terdaftar di outlet ini`);
          }
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantity: { decrement: deductionQty },
              sold: { increment: deductionQty },
            },
          });
          await tx.stockMovement.create({
            data: {
              stockId: stock.id,
              type: StockMovementType.OUT,
              quantity: deductionQty,
              notes: `Penjualan ${invoiceNumber} (${product.name} x${item.quantity})`,
              userId: cashierId,
            },
          });
        }
      }

      // 3. Save Transaction
      const transaction = await tx.transaction.create({
        data: {
          invoiceNumber,
          outletId,
          cashierId,
          subtotal,
          total: subtotal, // Tax/discounts can go here in future
          paymentMethod: paymentMethod as PaymentMethod,
          notes,
          items: {
            create: transactionItems,
          },
        },
        include: {
          items: true,
        },
      });

      // 4. Save Revenue
      await tx.revenue.create({
        data: {
          outletId,
          transactionId: transaction.id,
          amount: subtotal,
          method: paymentMethod as PaymentMethod,
          date: now,
          userId: cashierId,
        },
      });

      // 5. Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: cashierId,
          action: "CREATE",
          table: "transactions",
          recordId: transaction.id,
          details: JSON.stringify({ invoiceNumber, total: subtotal }),
        },
      });

      return transaction;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Gagal memproses transaksi" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const outletId = searchParams.get("outletId");
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const skip = (page - 1) * limit;

  const user = session.user as any;
  const userRole = user.role;
  const userOutlets = user.outlets || [];

  // Determine target outletId
  let targetOutletId = outletId || user.activeOutletId;

  // Role scoping check
  if (userRole !== "DEVELOPER" && userRole !== "OWNER") {
    // Cashier/Koorlap can only see allowed outlets
    if (targetOutletId === "ALL" || !targetOutletId) {
      targetOutletId = user.activeOutletId;
    }
    const hasAccess = userOutlets.some((o: any) => o.id === targetOutletId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden: Scoped outlet access only" }, { status: 403 });
    }
  }

  // Construct filters
  const whereClause: any = {
    deletedAt: null,
  };

  if (targetOutletId && targetOutletId !== "ALL") {
    whereClause.outletId = targetOutletId;
  }

  if (search) {
    whereClause.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { cashier: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  try {
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where: whereClause,
        include: {
          items: {
            include: {
              product: true,
            },
          },
          cashier: {
            select: {
              name: true,
            },
          },
          outlet: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.transaction.count({
        where: whereClause,
      }),
    ]);

    return NextResponse.json({
      transactions,
      page,
      limit,
      totalCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal mengambil data transaksi: " + error.message },
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
  const userRole = user.role;

  // Only OWNER and DEVELOPER can delete transactions
  if (userRole !== "OWNER" && userRole !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden: Hanya Owner atau Developer yang dapat menghapus transaksi" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID Transaksi harus ditentukan" }, { status: 400 });
  }

  try {
    // 1. Fetch transaction and its items
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!transaction || transaction.deletedAt) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    // 2. Perform deletion and stock revert inside a transaction
    await prisma.$transaction(async (tx) => {
      // Soft delete the transaction
      await tx.transaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Soft delete related revenue
      await tx.revenue.updateMany({
        where: { transactionId: id },
        data: { deletedAt: new Date() },
      });

      // Revert stocks for each item
      for (const item of transaction.items) {
        const product = item.product;
        const opStockLinks = await tx.productOperationalStock.findMany({
          where: { productId: product.id },
        });

        if (opStockLinks.length > 0) {
          for (const link of opStockLinks) {
            const deductionQty = item.quantity * (link.deductionQty || 1);
            const opStock = await tx.operationalStock.findUnique({
              where: {
                name_outletId: {
                  name: link.operationalStockName,
                  outletId: transaction.outletId,
                },
              },
            });

            if (opStock) {
              // Revert quantity and stockOut counter
              await tx.operationalStock.update({
                where: { id: opStock.id },
                data: {
                  quantity: { increment: deductionQty },
                  stockOut: { decrement: deductionQty },
                },
              });

              // Log operational stock movement for cancellation
              await tx.operationalStockMovement.create({
                data: {
                  operationalStockId: opStock.id,
                  type: "IN",
                  quantity: deductionQty,
                  notes: `Pembatalan Penjualan ${transaction.invoiceNumber} (${product.name} x${item.quantity})`,
                  userId: user.id,
                },
              });
            }
          }
        }

        // Revert product stock or linked product stock
        const hasLinks = !!product.linkedProductId || !!product.linkedProductId2;

        if (hasLinks) {
          if (product.linkedProductId) {
            const deductionQty1 = item.quantity * (product.stockDeductionQty || 1);
            const stock1 = await tx.stock.findUnique({
              where: {
                productId_outletId: {
                  productId: product.linkedProductId,
                  outletId: transaction.outletId,
                },
              },
            });
            if (stock1) {
              await tx.stock.update({
                where: { id: stock1.id },
                data: {
                  quantity: { increment: deductionQty1 },
                  sold: { decrement: deductionQty1 },
                },
              });
              await tx.stockMovement.create({
                data: {
                  stockId: stock1.id,
                  type: StockMovementType.IN,
                  quantity: deductionQty1,
                  notes: `Pembatalan Penjualan ${transaction.invoiceNumber} (${product.name} x${item.quantity})`,
                  userId: user.id,
                },
              });
            }
          }

          if (product.linkedProductId2) {
            const deductionQty2 = item.quantity * (product.stockDeductionQty2 || 1);
            const stock2 = await tx.stock.findUnique({
              where: {
                productId_outletId: {
                  productId: product.linkedProductId2,
                  outletId: transaction.outletId,
                },
              },
            });
            if (stock2) {
              await tx.stock.update({
                where: { id: stock2.id },
                data: {
                  quantity: { increment: deductionQty2 },
                  sold: { decrement: deductionQty2 },
                },
              });
              await tx.stockMovement.create({
                data: {
                  stockId: stock2.id,
                  type: StockMovementType.IN,
                  quantity: deductionQty2,
                  notes: `Pembatalan Penjualan ${transaction.invoiceNumber} (${product.name} x${item.quantity})`,
                  userId: user.id,
                },
              });
            }
          }
        } else if (opStockLinks.length === 0) {
          const deductionQty = item.quantity;
          const stock = await tx.stock.findUnique({
            where: {
              productId_outletId: {
                productId: product.id,
                outletId: transaction.outletId,
              },
            },
          });
          if (stock) {
            await tx.stock.update({
              where: { id: stock.id },
              data: {
                quantity: { increment: deductionQty },
                sold: { decrement: deductionQty },
              },
            });
            await tx.stockMovement.create({
              data: {
                stockId: stock.id,
                type: StockMovementType.IN,
                quantity: deductionQty,
                notes: `Pembatalan Penjualan ${transaction.invoiceNumber} (${product.name} x${item.quantity})`,
                userId: user.id,
              },
            });
          }
        }
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          table: "transactions",
          recordId: id,
          details: JSON.stringify({ invoiceNumber: transaction.invoiceNumber, total: transaction.total }),
        },
      });
    });

    return NextResponse.json({ success: true, message: "Transaksi berhasil dibatalkan" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Gagal menghapus transaksi: " + error.message },
      { status: 500 }
    );
  }
}
