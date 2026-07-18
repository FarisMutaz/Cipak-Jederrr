"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Search,
  Calendar,
  User as UserIcon,
  Building,
  Package,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Eye,
  Settings,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDayDate } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";

export default function AuditLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";

  useEffect(() => {
    if (status !== "loading" && session && userRole !== "DEVELOPER" && userRole !== "OWNER") {
      router.push("/dashboard");
    }
  }, [status, session, userRole, router]);

  if (status === "loading" || (session && userRole !== "DEVELOPER" && userRole !== "OWNER")) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
        <Loader2 className="w-9 h-9 animate-spin text-primary" />
        <span className="text-xs font-bold">Memeriksa hak akses...</span>
      </div>
    );
  }

  // Filter States
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [productId, setProductId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 15;

  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const isOwnerOrDev = userRole === "OWNER" || userRole === "DEVELOPER";

  // Deletion Mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ id, clearAll }: { id?: string; clearAll?: boolean }) => {
      let url = "/api/audit-logs";
      if (clearAll) {
        url += "?clearAll=true";
      } else if (id) {
        url += `?id=${id}`;
      }
      const res = await fetch(url, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus log audit");
      }
      return res.json();
    },
    onSuccess: (data) => {
      triggerAlert("success", data.message || "Log audit berhasil dihapus.");
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Hapus Log Audit",
      message: "Apakah Anda yakin ingin menghapus catatan log audit ini secara permanen?",
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate({ id });
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: "Bersihkan Semua Log Audit",
      message: "Apakah Anda yakin ingin menghapus SELURUH catatan log audit di sistem secara permanen? Tindakan ini tidak dapat dibatalkan.",
      confirmText: "Ya, Bersihkan Semua",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate({ clearAll: true });
    }
  };

  // Selected Log for Detailed Modal View
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // Queries for Dropdowns
  const { data: usersList = [] } = useQuery({
    queryKey: ["users-dropdown"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rawOutletsList = [] } = useQuery({
    queryKey: ["outlets-dropdown"],
    queryFn: async () => {
      const res = await fetch("/api/outlets");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOwnerOrDev,
  });

  const outletsList = isOwnerOrDev ? rawOutletsList : (user?.outlets || []);

  const { data: productsList = [] } = useQuery({
    queryKey: ["products-dropdown"],
    queryFn: async () => {
      const res = await fetch("/api/products?includeInactive=true");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Query: Fetch Audit Logs
  const { data: logsData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["audit-logs", page, q, action, userId, outletId, productId, startDate, endDate],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        q,
        action,
        userId,
        outletId,
        productId,
        startDate,
        endDate,
      });
      const res = await fetch(`/api/audit-logs?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat log audit");
      return res.json();
    },
    enabled: userRole === "DEVELOPER" || userRole === "OWNER",
  });

  const logs = logsData?.logs || [];
  const total = logsData?.total || 0;
  const totalPages = logsData?.totalPages || 1;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [q, action, userId, outletId, productId, startDate, endDate]);

  // Action badge mapping
  const getActionBadge = (act: string) => {
    const baseClass = "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ";
    switch (act) {
      case "LOGIN":
        return <span className={baseClass + "bg-blue-50 text-blue-700 border-blue-200"}>LOGIN</span>;
      case "LOGOUT":
        return <span className={baseClass + "bg-slate-50 text-slate-700 border-slate-200"}>LOGOUT</span>;
      case "DISTRIBUTION":
        return <span className={baseClass + "bg-emerald-50 text-emerald-700 border-emerald-200"}>DISTRIBUSI</span>;
      case "SISA_STOK":
        return <span className={baseClass + "bg-amber-50 text-amber-700 border-amber-200"}>SISA STOK</span>;
      case "RETUR_GUDANG":
        return <span className={baseClass + "bg-violet-50 text-violet-700 border-violet-200"}>RETUR GUDANG</span>;
      case "CREATE":
        return <span className={baseClass + "bg-teal-50 text-teal-700 border-teal-200"}>TAMBAH</span>;
      case "UPDATE":
        return <span className={baseClass + "bg-indigo-50 text-indigo-700 border-indigo-200"}>EDIT</span>;
      case "DELETE":
        return <span className={baseClass + "bg-rose-50 text-rose-700 border-rose-200"}>HAPUS</span>;
      default:
        return <span className={baseClass + "bg-gray-50 text-gray-700 border-gray-200"}>{act}</span>;
    }
  };

  // Human friendly action names
  const getActionName = (act: string) => {
    switch (act) {
      case "LOGIN":
        return "Masuk Sistem";
      case "LOGOUT":
        return "Keluar Sistem";
      case "DISTRIBUTION":
        return "Distribusi Stok";
      case "SISA_STOK":
        return "Pencatatan Sisa";
      case "RETUR_GUDANG":
        return "Retur ke Gudang";
      case "CREATE":
        return "Tambah Data";
      case "UPDATE":
        return "Ubah Data";
      case "DELETE":
        return "Hapus Data";
      default:
        return act;
    }
  };

  // Render log details summary inline
  const getLogSummary = (log: any) => {
    const details = log.details || {};
    if (log.action === "LOGIN" || log.action === "LOGOUT") {
      return `Pengguna @${details.username || log.userName} berhasil ${log.action === "LOGIN" ? "masuk ke" : "keluar dari"} sistem`;
    }
    if (log.action === "DISTRIBUTION") {
      return `Distribusi ${details.amount} pcs ${details.productName || "stok"} ke outlet ${details.outletName || "tujuan"}`;
    }
    if (log.action === "SISA_STOK") {
      return `Pencatatan sisa stok ${details.amount} pcs ${details.productName || "stok"} di outlet ${details.outletName || "asal"}`;
    }
    if (log.action === "RETUR_GUDANG") {
      return `Pengembalian ${details.amount} pcs ${details.productName || "stok"} ke Gudang Utama`;
    }
    if (log.action === "CREATE") {
      return `Menambahkan data baru pada tabel ${log.table}: ${details.name || details.username || log.recordId}`;
    }
    if (log.action === "UPDATE") {
      return `Memperbarui data pada tabel ${log.table}: ${details.name || details.username || log.recordId}`;
    }
    if (log.action === "DELETE") {
      return `Menghapus data pada tabel ${log.table}: ${details.name || details.username || log.recordId}`;
    }
    return `Aktivitas ${log.action} pada tabel ${log.table} (${log.recordId})`;
  };

  // Client side CSV Exporter
  const handleExportCSV = () => {
    if (logs.length === 0) return;

    // Headers in Indonesian matching user's layout
    const headers = ["Tanggal", "Jam", "Pengguna", "Role", "Aktivitas", "Tabel", "Detail Deskripsi"];

    const rows = logs.map((log: any) => {
      const dateObj = new Date(log.createdAt);
      const dateStr = dateObj.toLocaleDateString("id-ID", { year: "numeric", month: "2-digit", day: "2-digit" });
      const timeStr = dateObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const summary = getLogSummary(log).replace(/"/g, '""');

      return [
        dateStr,
        timeStr,
        log.userName,
        log.userRole,
        getActionName(log.action),
        log.table,
        `"${summary}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e: any[]) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Audit_Logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in relative pb-10">
      {/* Toast Alerts */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-50 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 text-xs font-bold text-white max-w-md ${
              alertMsg.type === "success" ? "bg-emerald-500" : "bg-primary"
            }`}
          >
            {alertMsg.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <span>{alertMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-border-custom p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-extrabold text-lg text-text-custom tracking-tight">Audit Logs</h2>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Pantau aktivitas sistem, distribusi stok, penyesuaian inventory, dan log masuk/keluar pengguna secara real-time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          {isOwnerOrDev && (
            <button
              onClick={handleClearAll}
              disabled={logs.length === 0 || deleteMutation.isPending}
              className={`py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 border transition-all duration-150 cursor-pointer ${
                logs.length === 0 || deleteMutation.isPending
                  ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
                  : "bg-white border-primary/20 hover:border-primary text-primary hover:bg-primary/5"
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Bersihkan Log</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className={`py-2.5 px-4.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all duration-150 cursor-pointer ${
              logs.length === 0
                ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 hover:shadow-lg"
            }`}
          >
            <FileDown className="w-4 h-4" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-border-custom p-5 rounded-xl shadow-sm flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kata kunci..."
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs font-semibold focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>

          {/* User selector */}
          <div className="relative">
            <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs font-bold text-text-custom focus:outline-none focus:border-primary/50"
            >
              <option value="">Semua Pengguna</option>
              {usersList.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>

          {/* Outlet selector */}
          <div className="relative">
            <Building className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs font-bold text-text-custom focus:outline-none focus:border-primary/50"
            >
              <option value="">Semua Outlet</option>
              {outletsList.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Product selector */}
          <div className="relative">
            <Package className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs font-bold text-text-custom focus:outline-none focus:border-primary/50"
            >
              <option value="">Semua Produk</option>
              {productsList.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          {/* Action Selector */}
          <div className="relative">
            <Settings className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs font-bold text-text-custom focus:outline-none focus:border-primary/50"
            >
              <option value="">Semua Transaksi</option>
              <option value="DISTRIBUTION">Distribusi Stok</option>
              <option value="SISA_STOK">Sisa Stok</option>
              <option value="RETUR_GUDANG">Retur Gudang</option>
              <option value="CREATE">Tambah Data</option>
              <option value="UPDATE">Ubah Data</option>
              <option value="DELETE">Hapus Data</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Mulai Tanggal:</span>
            <div className="relative w-full">
              <Calendar className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 bg-bg-custom border border-border-custom rounded-xl text-xs font-semibold focus:outline-none focus:border-primary/50 text-text-custom"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Sampai Tanggal:</span>
            <div className="relative w-full">
              <Calendar className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 bg-bg-custom border border-border-custom rounded-xl text-xs font-semibold focus:outline-none focus:border-primary/50 text-text-custom"
              />
            </div>
          </div>

          {/* Reset Filters button */}
          <button
            onClick={() => {
              setQ("");
              setAction("");
              setUserId("");
              setOutletId("");
              setProductId("");
              setStartDate("");
              setEndDate("");
            }}
            className="py-2.5 px-4 bg-bg-custom hover:bg-gray-100 border border-border-custom text-text-custom text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden flex flex-col p-5 gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 className="w-9 h-9 animate-spin text-primary" />
            <span className="text-xs font-bold">Memuat log aktivitas...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-xl border border-dashed border-border-custom">
            Tidak ada data log audit yang sesuai dengan filter.
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                    <th className="py-3.5 px-4">Waktu</th>
                    <th className="py-3.5 px-4">Pengguna</th>
                    <th className="py-3.5 px-4">Jenis Transaksi</th>
                    <th className="py-3.5 px-4">Deskripsi</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => {
                    const dateObj = new Date(log.createdAt);
                    const formattedDate = dateObj.toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                    const formattedTime = dateObj.toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <tr
                        key={log.id}
                        className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-text-custom">{formattedDate}</span>
                            <span className="text-[10px] text-gray-400 font-semibold">{formattedTime} WIB</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-text-custom">{log.userName}</span>
                            <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider">
                              {log.userRole}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">{getActionBadge(log.action)}</td>
                        <td className="py-3.5 px-4 font-semibold text-gray-600 max-w-xs md:max-w-md truncate">
                          {getLogSummary(log)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="p-1.5 hover:bg-primary/10 text-primary hover:text-primary-dark rounded-lg border border-transparent hover:border-primary/20 transition-all cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-extrabold"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Detail</span>
                            </button>
                            {isOwnerOrDev && (
                              <button
                                onClick={() => handleDelete(log.id)}
                                disabled={deleteMutation.isPending}
                                className="p-1.5 hover:bg-primary/10 text-primary hover:text-primary-dark rounded-lg border border-transparent hover:border-primary/20 transition-all cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-extrabold disabled:opacity-50"
                                title="Hapus Log"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-border-custom pt-4 text-xs font-semibold text-gray-500">
              <span>
                Menampilkan <strong className="text-text-custom">{logs.length}</strong> dari{" "}
                <strong className="text-text-custom">{total}</strong> data
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-border-custom rounded-xl hover:bg-bg-custom transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4 text-text-custom" />
                </button>
                <span className="text-xs font-bold text-text-custom">
                  Halaman {page} dari {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border border-border-custom rounded-xl hover:bg-bg-custom transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4 text-text-custom" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-border-custom rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-primary/5 border-b border-border-custom px-5 py-4 flex justify-between items-center text-primary">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  <span className="font-extrabold text-sm uppercase tracking-wide">Detail Log Audit</span>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 flex flex-col gap-4 max-h-[400px] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 border-b border-border-custom pb-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Tanggal & Waktu</span>
                    <span className="text-xs font-extrabold text-text-custom">
                      {new Date(selectedLog.createdAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Pengguna</span>
                    <span className="text-xs font-extrabold text-text-custom">
                      {selectedLog.userName} (@{selectedLog.details?.username || selectedLog.userName})
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Role</span>
                    <span className="text-xs font-extrabold text-text-custom uppercase tracking-wide">
                      {selectedLog.userRole}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Tabel Database</span>
                    <span className="text-xs font-mono text-gray-700 bg-bg-custom border border-border-custom px-1.5 py-0.5 rounded-md self-start">
                      {selectedLog.table}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Aktivitas</span>
                  <div className="flex items-center gap-2">
                    {getActionBadge(selectedLog.action)}
                    <span className="text-xs font-extrabold text-text-custom">
                      {getActionName(selectedLog.action)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-border-custom pt-4">
                  <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Deskripsi Lengkap</span>
                  <p className="text-xs font-semibold text-gray-700 bg-bg-custom p-3 border border-border-custom rounded-xl leading-relaxed">
                    {getLogSummary(selectedLog)}
                  </p>
                </div>

                {/* Raw Details JSON Viewer */}
                <div className="flex flex-col gap-2 border-t border-border-custom pt-4">
                  <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Raw JSON Data</span>
                  <pre className="text-[10px] font-mono bg-slate-900 text-slate-100 p-3 rounded-xl overflow-x-auto max-h-40 leading-normal">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-border-custom bg-bg-custom px-5 py-3.5 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-4.5 py-2 bg-white hover:bg-gray-50 border border-border-custom text-text-custom text-xs font-black rounded-xl transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
