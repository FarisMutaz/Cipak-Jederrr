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
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (!outletId || !date) {
    return NextResponse.json({ error: "outletId dan date wajib diisi" }, { status: 400 });
  }

  try {
    const reportSession = await prisma.dailyReportSession.findUnique({
      where: {
        outletId_date: {
          outletId,
          date,
        },
      },
      include: {
        openedBy: {
          select: { name: true, username: true },
        },
        closedBy: {
          select: { name: true, username: true },
        },
      },
    });

    if (!reportSession) {
      return NextResponse.json({
        status: "NOT_OPENED",
        session: null,
      });
    }

    return NextResponse.json({
      status: reportSession.status,
      session: reportSession,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const userId = user.id;

  try {
    const body = await req.json();
    const { outletId, date, action } = body; // action: "OPEN" | "CLOSE"

    if (!outletId || !date || !action) {
      return NextResponse.json({ error: "outletId, date, dan action wajib diisi" }, { status: 400 });
    }

    if (action !== "OPEN" && action !== "CLOSE") {
      return NextResponse.json({ error: "action harus berupa OPEN atau CLOSE" }, { status: 400 });
    }

    const reportSession = await prisma.dailyReportSession.findUnique({
      where: {
        outletId_date: {
          outletId,
          date,
        },
      },
    });

    let result;

    if (action === "OPEN") {
      if (reportSession) {
        if (reportSession.status === "CLOSED") {
          const isAllowedUser = user.role === "OWNER" || user.role === "DEVELOPER";
          if (!isAllowedUser) {
            return NextResponse.json(
              { error: "Laporan untuk hari ini sudah ditutup dan tidak dapat dibuka kembali." },
              { status: 400 }
            );
          }
        }
        if (reportSession.status === "OPEN") {
          return NextResponse.json(
            { error: "Laporan hari ini sudah dalam keadaan terbuka." },
            { status: 400 }
          );
        }
      }

      if (reportSession) {
        result = await prisma.dailyReportSession.update({
          where: { id: reportSession.id },
          data: {
            status: "OPEN",
            openedAt: new Date(),
            openedById: userId,
            closedAt: null,
            closedById: null,
          },
        });
      } else {
        result = await prisma.dailyReportSession.create({
          data: {
            outletId,
            date,
            status: "OPEN",
            openedAt: new Date(),
            openedById: userId,
          },
        });
      }
    } else {
      // CLOSE
      if (!reportSession) {
        return NextResponse.json(
          { error: "Laporan harus dibuka terlebih dahulu sebelum bisa ditutup." },
          { status: 400 }
        );
      }
      if (reportSession.status === "CLOSED") {
        return NextResponse.json(
          { error: "Laporan hari ini sudah ditutup dan tidak bisa ditutup kembali." },
          { status: 400 }
        );
      }

      result = await prisma.dailyReportSession.update({
        where: { id: reportSession.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: userId,
        },
      });
    }

    return NextResponse.json({ success: true, session: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
