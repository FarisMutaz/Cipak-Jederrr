"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  ShoppingCart,
  Boxes,
  DollarSign,
  ArrowDownRight,
  TrendingDown,
  Wallet,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Users,
  Store,
  Clock,
  CircleDot,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatRupiah } from "@/lib/utils";

type RangeFilter = "day" | "week" | "month" | "year";

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const userOutlets = user?.outlets || [];
  const activeOutletId = user?.activeOutletId;

  const { data: dbOutlets = [] } = useQuery({
    queryKey: ["outlets-dropdown-list", userRole],
    queryFn: async () => {
      if (userRole !== "DEVELOPER" && userRole !== "OWNER") return [];
      const res = await fetch("/api/outlets");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: userRole === "DEVELOPER" || userRole === "OWNER",
  });

  const outletsToUse = (userRole === "DEVELOPER" || userRole === "OWNER") && dbOutlets.length > 0
    ? dbOutlets
    : userOutlets;

  const [range, setRange] = useState<RangeFilter>("week");
  const [selectedOutlet, setSelectedOutlet] = useState<string>("ALL");

  const firstUserOutletId = userOutlets[0]?.id;
  const firstOutletToUseId = outletsToUse[0]?.id;

  // Sync state with activeOutletId when session updates
  useEffect(() => {
    if (userRole === "KASIR" && firstUserOutletId) {
      setSelectedOutlet(firstUserOutletId);
    } else if (activeOutletId) {
      setSelectedOutlet(activeOutletId);
    } else if (firstOutletToUseId) {
      setSelectedOutlet(firstOutletToUseId);
    }
  }, [activeOutletId, firstOutletToUseId, firstUserOutletId, userRole]);

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);

  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["dashboard-report-session", selectedOutlet, todayStr],
    queryFn: async () => {
      if (!selectedOutlet || selectedOutlet === "ALL") return null;
      const res = await fetch(`/api/laporan/session?outletId=${selectedOutlet}&date=${todayStr}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session && selectedOutlet !== "ALL",
  });

  const handleToggleSession = async (action: "OPEN" | "CLOSE") => {
    if (!selectedOutlet || selectedOutlet === "ALL") return;
    setIsUpdatingSession(true);
    try {
      const res = await fetch("/api/laporan/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId: selectedOutlet,
          date: todayStr,
          action,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || "Gagal mengubah status laporan");
      } else {
        refetchSession();
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan koneksi");
    } finally {
      setIsUpdatingSession(false);
    }
  };

  // Fetch Dashboard data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard", range, selectedOutlet],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?range=${range}&outletId=${selectedOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat data dashboard");
      return res.json();
    },
    enabled: !!session,
  });

  // Re-fetch when outlet or range changes
  useEffect(() => {
    if (session) {
      refetch();
      if (selectedOutlet !== "ALL") refetchSession();
    }
  }, [range, selectedOutlet, session]);

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        {/* Filter skeleton */}
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-border-custom h-14"></div>

        {/* Key stats row skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-border-custom h-32"></div>
          ))}
        </div>

        {/* Second stats row skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white p-5 rounded-xl border border-border-custom h-24"></div>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-border-custom h-96"></div>
          <div className="bg-white p-6 rounded-xl border border-border-custom h-96"></div>
        </div>
      </div>
    );
  }

  const { stats, charts, widgets } = data;

  const COLORS = ["#B51217", "#F5C14E", "#8C0D10"];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Top Filter Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-xl border border-border-custom gap-4 shadow-sm">
        <div>
          <h3 className="font-bold text-sm text-text-custom uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            Ringkasan Analisis
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Outlet Selector (Developers, Owners, and Koorlaps) */}
          {userRole !== "KASIR" && (
            <select
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
              className="px-3.5 py-1.5 bg-bg-custom border border-border-custom text-xs font-semibold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
            >
              {userRole === "DEVELOPER" || userRole === "OWNER" ? (
                <>
                  <option value="ALL">Semua Outlet</option>
                  {outletsToUse.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  <option value="ALL">Semua Outlet Saya</option>
                  {outletsToUse.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          )}

          {/* Time range selector */}
          <div className="flex items-center bg-bg-custom border border-border-custom rounded-xl p-0.5">
            {(
              [
                { key: "day", label: "Hari" },
                { key: "week", label: "Minggu" },
                { key: "month", label: "Bulan" },
                { key: "year", label: "Tahun" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setRange(t.key)}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all duration-200 cursor-pointer ${range === t.key ? "bg-primary text-white shadow-sm" : "text-gray-500 hover:text-text-custom"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Report Session Controls */}
      {selectedOutlet !== "ALL" && sessionData && (
        <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary shrink-0" />
            <div className="text-left">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">
                Sesi Laporan Hari Ini ({todayStr})
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-text-custom">Status:</span>
                {sessionData.status === "OPEN" ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200">
                    BUKA
                  </span>
                ) : sessionData.status === "CLOSED" ? (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-lg border border-red-200">
                    TUTUP
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-lg border border-gray-200">
                    BELUM DIBUKA
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {sessionData.status === "OPEN" ? (
              <button
                disabled={isUpdatingSession}
                onClick={() => handleToggleSession("CLOSE")}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-red-600/20 hover:shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingSession ? "Loading..." : "Tutup Toko Hari Ini"}
              </button>
            ) : sessionData.status === "CLOSED" ? (
              userRole === "OWNER" || userRole === "DEVELOPER" ? (
                <button
                  disabled={isUpdatingSession}
                  onClick={() => handleToggleSession("OPEN")}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20 hover:shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingSession ? "Loading..." : "Buka Toko Kembali"}
                </button>
              ) : (
                <span className="px-3 py-1.5 bg-gray-100 text-gray-400 border border-gray-200 rounded-xl text-xs font-bold italic">
                  Sesi Hari Ini Selesai
                </span>
              )
            ) : (
              <button
                disabled={isUpdatingSession}
                onClick={() => handleToggleSession("OPEN")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20 hover:shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingSession ? "Loading..." : "Buka Toko Hari Ini"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Row 1: KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Total Penjualan Hari Ini
            </span>
            <span className="font-extrabold text-lg text-text-custom leading-tight">
              {formatRupiah(stats.totalSalesToday)}
            </span>
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-0.5 mt-0.5 leading-none">
              <TrendingUp className="w-3 h-3" /> +12% dari kemarin
            </span>
          </div>
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform duration-300">
            <ShoppingCart className="w-5.5 h-5.5" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Total Transaksi
            </span>
            <span className="font-extrabold text-lg text-text-custom leading-tight">
              {stats.totalTransactions} Transaksi
            </span>
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-0.5 mt-0.5 leading-none">
              <TrendingUp className="w-3 h-3" /> +5% dari rata-rata
            </span>
          </div>
          <div className="w-12 h-12 bg-[#F5C14E]/10 rounded-2xl flex items-center justify-center text-[#F5C14E] group-hover:scale-105 transition-transform duration-300">
            <DollarSign className="w-5.5 h-5.5" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Total Produk Terjual
            </span>
            <span className="font-extrabold text-lg text-text-custom leading-tight">
              {stats.totalProductsSold} Porsi
            </span>
            <span className="text-[10px] font-bold text-[#F5C14E] flex items-center gap-0.5 mt-0.5 leading-none">
              ★ Cipak Koceak terlaris
            </span>
          </div>
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform duration-300">
            <Boxes className="w-5.5 h-5.5" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-6 rounded-xl border border-border-custom flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              Total Pendapatan
            </span>
            <span className="font-extrabold text-lg text-text-custom leading-tight">
              {formatRupiah(stats.totalRevenue)}
            </span>
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-0.5 mt-0.5 leading-none">
              <TrendingUp className="w-3 h-3" /> +15.5% target tercapai
            </span>
          </div>
          <div className="w-12 h-12 bg-[#F5C14E]/10 rounded-2xl flex items-center justify-center text-[#F5C14E] group-hover:scale-105 transition-transform duration-300">
            <TrendingUp className="w-5.5 h-5.5" />
          </div>
        </div>
      </div>

      {/* Row 2: Secondary Channels & Margin Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Cash */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Cash</span>
          <div className="flex items-end justify-between mt-2.5">
            <span className="font-bold text-sm text-text-custom">{formatRupiah(stats.cashAmount)}</span>
            <span className="px-2 py-0.5 bg-[#F5C14E]/15 text-[#b3861b] rounded text-[9px] font-bold">
              {stats.cashPercentage}%
            </span>
          </div>
        </div>

        {/* QRIS */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">QRIS</span>
          <div className="flex items-end justify-between mt-2.5">
            <span className="font-bold text-sm text-text-custom">{formatRupiah(stats.qrisAmount)}</span>
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[9px] font-bold">
              {stats.qrisPercentage}%
            </span>
          </div>
        </div>

        {/* GrabFood */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">GrabFood</span>
          <div className="flex items-end justify-between mt-2.5">
            <span className="font-bold text-sm text-text-custom">{formatRupiah(stats.grabfoodAmount)}</span>
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[9px] font-bold">
              {stats.grabfoodPercentage}%
            </span>
          </div>
        </div>

        {/* Expense */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Pengeluaran</span>
          <div className="flex items-end justify-between mt-2.5">
            <span className="font-bold text-sm text-text-custom">{formatRupiah(stats.totalExpenses)}</span>
            <span className="p-1 bg-primary/10 text-primary rounded-full">
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Gross Margin */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col justify-between hover:border-primary/20 transition-all duration-300">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Laba Kotor</span>
          <div className="flex items-end justify-between mt-2.5">
            <span className="font-bold text-sm text-text-custom">{formatRupiah(stats.grossProfit)}</span>
            <span className="p-1 bg-[#F5C14E]/20 text-[#b3861b] rounded-full">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Charts & Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Sales Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-border-custom shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
              Grafik Penjualan Harian
            </h4>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.dailySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B51217" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#B51217" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: any) => [formatRupiah(value), "Penjualan"]}
                  contentStyle={{ background: "#FFF", borderRadius: "10px", borderColor: "#ECECEC", fontSize: "11px" }}
                />
                <Area type="monotone" dataKey="amount" stroke="#B51217" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment & Top Products Grid */}
        <div className="bg-white p-6 rounded-xl border border-border-custom shadow-sm flex flex-col gap-6">
          {/* Payment Methods Chart */}
          <div className="flex flex-col gap-3">
            <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
              Metode Pembayaran
            </h4>
            <div className="flex items-center gap-4">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.paymentMethods}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={55}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {charts.paymentMethods.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legends */}
              <div className="flex flex-col gap-2 flex-1">
                {charts.paymentMethods.map((item: any, idx: number) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                      <span className="text-gray-500 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-text-custom">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <hr className="border-border-custom" />

          {/* Top Selling Products List */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
                Produk Terlaris
              </h4>
            </div>
            <div className="flex flex-col gap-2">
              {charts.topProducts.map((p: any) => (
                <div key={p.name} className="flex items-center justify-between p-2 hover:bg-bg-custom rounded-xl transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 bg-accent/20 text-[#b3861b] text-[10px] font-bold rounded-lg flex items-center justify-center shrink-0">
                      {p.rank}
                    </span>
                    <span className="text-xs font-bold text-text-custom leading-tight">{p.name}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-500 shrink-0">{p.quantity} Porsi</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Detail Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Widget 1: Low Stock */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
              Stok Hampir Habis
            </h4>
          </div>
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[220px]">
            {widgets.lowStock.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-6">Semua stok produk aman</p>
            ) : (
              widgets.lowStock.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs p-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {item.name.charAt(0)}
                    </div>
                    <div>
                      <h5 className="font-bold text-text-custom leading-tight">{item.name}</h5>
                      <p className="text-[10px] text-gray-400 mt-0.5">Stok: {item.stock}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${item.level === "Habis" ? "bg-primary/10 text-primary" : "bg-accent/15 text-[#b3861b]"
                    }`}>
                    {item.level}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Widget 2: Recent Transactions */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
              Transaksi Terakhir
            </h4>
          </div>
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[220px]">
            {widgets.recentTransactions.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-6">Belum ada transaksi hari ini</p>
            ) : (
              widgets.recentTransactions.map((t: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs p-1">
                  <div>
                    <h5 className="font-bold text-text-custom leading-tight">{t.invoice}</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">{t.time}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-bold text-text-custom">{formatRupiah(t.total)}</span>
                    <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded ${t.method === "CASH"
                        ? "bg-[#F5C14E]/15 text-[#b3861b]"
                        : "bg-primary/10 text-primary"
                      }`}>
                      {t.method}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Widget 3: Best Outlets */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
              Outlet Terbaik
            </h4>
          </div>
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[220px]">
            {widgets.bestOutlets.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 bg-primary/10 text-primary text-[10px] font-bold rounded-lg flex items-center justify-center shrink-0">
                    {item.rank}
                  </span>
                  <h5 className="font-bold text-text-custom leading-tight">{item.name}</h5>
                </div>
                <span className="font-bold text-gray-500 shrink-0">{formatRupiah(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Widget 4: Active Cashiers */}
        <div className="bg-white p-5 rounded-xl border border-border-custom shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-text-custom uppercase tracking-wider">
              Kasir Aktif Hari Ini
            </h4>
          </div>
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[220px]">
            {widgets.activeCashiers.map((cashier: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-accent/25 border border-accent flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {cashier.name.charAt(cashier.name.length - 1)}
                  </div>
                  <div>
                    <h5 className="font-bold text-text-custom leading-tight">{cashier.name}</h5>
                    <p className="text-[10px] text-gray-400 mt-0.5">{cashier.outlet}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[9px] text-gray-400 font-medium">{cashier.shift}</span>
                  <span className={`flex items-center gap-1 text-[9px] font-bold ${cashier.status === "Aktif" ? "text-emerald-500" : "text-gray-400"
                    }`}>
                    <CircleDot className="w-2 h-2 fill-current" /> {cashier.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
