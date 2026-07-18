import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER" && user.role !== "KOORLAP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = searchParams.get("page") || "1";
  const limit = searchParams.get("limit") || "15";
  const q = searchParams.get("q") || "";
  const action = searchParams.get("action") || "";
  const userId = searchParams.get("userId") || "";
  const outletId = searchParams.get("outletId") || "";
  const productId = searchParams.get("productId") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  try {
    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    // Fetch all matching logs
    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            username: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Format & parse JSON details field
    let formatted = logs.map((log) => {
      let detailsObj: any = {};
      if (log.details) {
        if (typeof log.details === "string") {
          try {
            detailsObj = JSON.parse(log.details);
          } catch (e) {
            detailsObj = { raw: log.details };
          }
        } else {
          detailsObj = log.details;
        }
      }

      return {
        id: log.id,
        createdAt: log.createdAt,
        userId: log.userId,
        userName: log.user.name,
        userRole: log.user.role.name,
        action: log.action,
        table: log.table,
        recordId: log.recordId,
        details: detailsObj,
      };
    });

    // Scoping check for KOORLAP role
    if (user.role === "KOORLAP") {
      const userOutlets = await prisma.userOutlet.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { outletId: true }
      });
      const assignedOutletIds = userOutlets.map(uo => uo.outletId);

      formatted = formatted.filter((log) => {
        if (log.userId === user.id) return true;
        if (log.details && log.details.outletId) {
          return assignedOutletIds.includes(log.details.outletId);
        }
        if (log.action === "SAVE_STOCK_ADJUSTMENT" && log.details && Array.isArray(log.details.adjustments)) {
          return log.details.adjustments.some((adj: any) =>
            Object.keys(adj.outlets || {}).some((oId) => assignedOutletIds.includes(oId))
          );
        }
        return false;
      });
    }

    // Filter by outletId (nested inside details JSON)
    if (outletId) {
      formatted = formatted.filter((log) => {
        if (log.action === "SAVE_STOCK_ADJUSTMENT" && log.details && Array.isArray(log.details.adjustments)) {
          return log.details.adjustments.some((adj: any) =>
            Object.keys(adj.outlets || {}).includes(outletId)
          );
        }
        return log.details?.outletId === outletId;
      });
    }

    // Filter by productId (nested inside details JSON)
    if (productId) {
      formatted = formatted.filter((log) => log.details?.productId === productId);
    }

    // Search query matching username, action, product name, outlet name, or notes
    if (q) {
      const lowerQ = q.toLowerCase();
      formatted = formatted.filter(
        (log) =>
          log.userName.toLowerCase().includes(lowerQ) ||
          log.action.toLowerCase().includes(lowerQ) ||
          log.details?.productName?.toLowerCase().includes(lowerQ) ||
          log.details?.outletName?.toLowerCase().includes(lowerQ) ||
          log.details?.notes?.toLowerCase().includes(lowerQ) ||
          log.table?.toLowerCase().includes(lowerQ)
      );
    }

    // Pagination
    const total = formatted.length;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 15;
    const offset = (pageNum - 1) * limitNum;
    const paginated = formatted.slice(offset, offset + limitNum);

    return NextResponse.json({
      logs: paginated,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error: any) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (user.role !== "DEVELOPER" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const clearAll = searchParams.get("clearAll") === "true";

  try {
    if (clearAll) {
      await prisma.auditLog.deleteMany({});
      return NextResponse.json({ message: "Semua log audit berhasil dihapus." });
    }

    if (!id) {
      return NextResponse.json({ error: "ID log harus diisi" }, { status: 400 });
    }

    await prisma.auditLog.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Log audit berhasil dihapus." });
  } catch (error: any) {
    console.error("Failed to delete audit log:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
