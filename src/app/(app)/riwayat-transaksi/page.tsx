"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  History,
  Search,
  Trash2,
  Calendar,
  User,
  Building,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

export default function RiwayatTransaksiPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
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

  const [activeOutlet, setActiveOutlet] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const limit = 15;

  const [selectedTrx, setSelectedTrx] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const confirm = useConfirm();

  // Clear selections when filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [page, activeOutlet, debouncedSearch]);

  const firstUserOutletId = userOutlets[0]?.id;
  const firstOutletToUseId = outletsToUse[0]?.id;

  // Sync activeOutlet
  useEffect(() => {
    if (userRole === "KASIR" && firstUserOutletId) {
      setActiveOutlet(firstUserOutletId);
    } else if (activeOutletId) {
      setActiveOutlet(activeOutletId);
    } else if (firstOutletToUseId) {
      setActiveOutlet(firstOutletToUseId);
    } else {
      setActiveOutlet("ALL");
    }
  }, [activeOutletId, firstOutletToUseId, firstUserOutletId, userRole]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  // Alert trigger
  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Query transactions list
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transactions-history", activeOutlet, debouncedSearch, page],
    queryFn: async () => {
      const url = new URL("/api/transactions", window.location.origin);
      url.searchParams.set("outletId", activeOutlet);
      url.searchParams.set("search", debouncedSearch);
      url.searchParams.set("page", page.toString());
      url.searchParams.set("limit", limit.toString());

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Gagal mengambil riwayat transaksi");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus transaksi");
      }
      return res.json();
    },
    onSuccess: (res) => {
      triggerAlert("success", res.message || "Transaksi berhasil dihapus & stok telah dikembalikan!");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["transactions-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["laporan"] });
      queryClient.invalidateQueries({ queryKey: ["stok"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDeleteSingle = async (trx: any) => {
    const ok = await confirm({
      title: "Batalkan Transaksi?",
      message: `Apakah Anda yakin ingin membatalkan transaksi ${trx.invoiceNumber} sebesar ${formatRupiah(trx.total)}? Stok akan dikembalikan otomatis ke inventory.`,
      confirmText: "Ya, Batalkan",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate(trx.id);
    }
  };

  const handleDeleteSelected = async () => {
    const ok = await confirm({
      title: "Batalkan Transaksi Terpilih?",
      message: `Apakah Anda yakin ingin membatalkan ${selectedIds.length} transaksi terpilih secara massal? Stok untuk masing-masing transaksi akan dikembalikan otomatis.`,
      confirmText: "Ya, Batalkan Semua",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate(selectedIds.join(","));
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (data?.totalCount ? Math.ceil(data.totalCount / limit) : 1)) {
      setPage(newPage);
    }
  };

  const totalPages = data?.totalCount ? Math.ceil(data.totalCount / limit) : 1;
  const isOwnerOrDeveloper = userRole === "OWNER" || userRole === "DEVELOPER";

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-border-custom p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-text-custom tracking-tight">Riwayat Transaksi</h1>
            <p className="text-xs text-gray-500 mt-0.5">Pantau dan kelola seluruh transaksi penjualan kasir</p>
          </div>
        </div>

        {/* Filters and Scoping */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari Invoice / Kasir..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-semibold placeholder:text-gray-400"
            />
          </div>

          {/* Outlet Selection */}
          {userRole !== "KASIR" && (
            <select
              value={activeOutlet}
              onChange={(e) => {
                setActiveOutlet(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
            >
              {userRole === "DEVELOPER" || userRole === "OWNER" ? (
                <option value="ALL">Semua Outlet</option>
              ) : null}
              {outletsToUse.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {userRole === "KASIR" && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 bg-bg-custom px-3 py-2 rounded-xl border">
              <Building className="w-3.5 h-3.5 text-primary" />
              <span>{userOutlets[0]?.name || "Lock Outlet"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Notifications */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl border shadow-xl text-xs font-bold text-white ${
              alertMsg.type === "success" ? "bg-emerald-600 border-emerald-700" : "bg-primary border-primary-dark"
            }`}
          >
            {alertMsg.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{alertMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Table Panel */}
      <div className="bg-white border border-border-custom rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {isOwnerOrDeveloper && selectedIds.length > 0 && (
          <div className="bg-primary/5 border-b border-border-custom px-6 py-3 flex items-center justify-between animate-fade-in shrink-0">
            <span className="text-xs font-bold text-primary">
              {selectedIds.length} transaksi terpilih untuk dihapus/dibatalkan
            </span>
            <button
              onClick={handleDeleteSelected}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-[10px] font-bold shadow-md shadow-primary/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Hapus Terpilih ({selectedIds.length})</span>
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 gap-3 text-gray-400">
            <Loader2 className="w-9 h-9 animate-spin text-primary" />
            <span className="text-xs font-semibold">Memuat riwayat transaksi...</span>
          </div>
        ) : !data?.transactions || data.transactions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 gap-2.5 text-gray-400 bg-bg-custom/30 m-4 rounded-xl border border-dashed border-border-custom">
            <History className="w-10 h-10 text-gray-300" />
            <span className="text-xs font-semibold">Tidak ditemukan transaksi penjualan</span>
          </div>
        ) : (
          <div className="flex-grow overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-custom bg-bg-custom text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                  {isOwnerOrDeveloper && (
                    <th className="py-3 px-4 text-center w-10">
                      <input
                        type="checkbox"
                        checked={data?.transactions?.length > 0 && selectedIds.length === data.transactions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(data.transactions.map((t: any) => t.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Tanggal / Waktu</th>
                  <th className="py-3 px-4">No. Invoice</th>
                  <th className="py-3 px-4">Outlet</th>
                  <th className="py-3 px-4">Kasir</th>
                  <th className="py-3 px-4">Menu Penjualan</th>
                  <th className="py-3 px-4 text-center">Metode</th>
                  <th className="py-3 px-4 text-right">Total Transaksi</th>
                  <th className="py-3 px-4 text-center w-24">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((trx: any) => {
                  // Summarize items
                  const menuSummary = trx.items
                    .map((item: any) => `${item.product.name} (x${item.quantity})`)
                    .join(", ");

                  return (
                    <tr
                      key={trx.id}
                      className={`border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors ${
                        selectedIds.includes(trx.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      {/* Select Checkbox */}
                      {isOwnerOrDeveloper && (
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(trx.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds((prev) => [...prev, trx.id]);
                              } else {
                                setSelectedIds((prev) => prev.filter((id) => id !== trx.id));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                          />
                        </td>
                      )}

                      {/* Date & Time */}
                      <td className="py-3.5 px-4 font-semibold text-gray-600">
                        <div className="flex flex-col">
                          <span>{formatDate(trx.createdAt)}</span>
                          <span className="text-[10px] text-gray-400 font-medium mt-0.5">
                            {new Date(trx.createdAt).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Invoice */}
                      <td className="py-3.5 px-4 font-bold text-text-custom font-mono">
                        {trx.invoiceNumber}
                      </td>

                      {/* Outlet */}
                      <td className="py-3.5 px-4 text-gray-600 font-bold">
                        {trx.outlet.name}
                      </td>

                      {/* Cashier */}
                      <td className="py-3.5 px-4 text-gray-500 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{trx.cashier.name}</span>
                        </div>
                      </td>

                      {/* Menu Summary */}
                      <td className="py-3.5 px-4 text-gray-500 max-w-xs truncate" title={menuSummary}>
                        {menuSummary}
                      </td>

                      {/* Payment Method */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider ${
                            trx.paymentMethod === "CASH"
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              : trx.paymentMethod === "QRIS"
                              ? "bg-blue-50 text-blue-600 border border-blue-100"
                              : "bg-amber-50 text-amber-600 border border-amber-100"
                          }`}
                        >
                          {trx.paymentMethod}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right font-extrabold text-primary text-sm">
                        {formatRupiah(trx.total)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedTrx(trx)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-text-custom transition-colors cursor-pointer"
                            title="Detail Struk"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Only show delete option for OWNER/DEVELOPER */}
                          {isOwnerOrDeveloper && (
                            <button
                              onClick={() => handleDeleteSingle(trx)}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 hover:bg-primary/10 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                              title="Batalkan & Hapus Transaksi"
                            >
                              <Trash2 className="w-4 h-4" />
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
        )}

        {/* Pagination Footer */}
        {data?.totalCount > limit && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-custom bg-bg-custom/20">
            <span className="text-[11px] text-gray-500 font-bold">
              Menampilkan {Math.min(data.totalCount, (page - 1) * limit + 1)}-
              {Math.min(data.totalCount, page * limit)} dari {data.totalCount} transaksi
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                className="p-2 border border-border-custom bg-white hover:bg-gray-50 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 transition-colors shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-black text-text-custom px-3 py-1.5 border rounded-xl bg-white shadow-sm">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
                className="p-2 border border-border-custom bg-white hover:bg-gray-50 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 transition-colors shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal 1: Detail Struk / Invoice Detail Drawer */}
      <AnimatePresence>
        {selectedTrx && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md p-6 border border-border-custom shadow-2xl relative overflow-y-auto max-h-[90vh]"
            >
              {/* Receipt Header */}
              <div className="text-center pb-4 border-b border-dashed border-gray-200">
                <h3 className="font-black text-lg text-text-custom tracking-tight">CIPAK JEDERRR</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                  Outlet: {selectedTrx.outlet.name}
                </p>
                {selectedTrx.outlet.address && (
                  <p className="text-[9px] text-gray-400 font-medium px-4 mt-0.5 line-clamp-1">
                    {selectedTrx.outlet.address}
                  </p>
                )}
              </div>

              {/* Invoice Meta */}
              <div className="flex flex-col gap-1.5 py-4 text-[11px] text-gray-500 font-semibold border-b border-dashed border-gray-200">
                <div className="flex justify-between">
                  <span>No. Invoice:</span>
                  <span className="font-bold text-text-custom font-mono">{selectedTrx.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal & Waktu:</span>
                  <span className="font-bold text-text-custom">
                    {formatDate(selectedTrx.createdAt)} -{" "}
                    {new Date(selectedTrx.createdAt).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Kasir:</span>
                  <span className="font-bold text-text-custom">{selectedTrx.cashier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Metode Pembayaran:</span>
                  <span className="font-bold text-text-custom uppercase">{selectedTrx.paymentMethod}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="flex flex-col gap-3 py-4 border-b border-dashed border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Item Belanja</span>
                <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                  {selectedTrx.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs font-semibold">
                      <div className="flex flex-col">
                        <span className="text-text-custom font-bold">{item.product.name}</span>
                        <span className="text-[10px] text-gray-400">
                          {item.quantity} x {formatRupiah(item.price)}
                        </span>
                      </div>
                      <span className="font-bold text-text-custom">{formatRupiah(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Footer */}
              <div className="flex flex-col gap-1.5 py-4 mb-4">
                <div className="flex justify-between items-center text-sm font-black">
                  <span className="text-text-custom uppercase tracking-wide">Total Pembayaran</span>
                  <span className="text-primary text-base">{formatRupiah(selectedTrx.total)}</span>
                </div>
                {selectedTrx.notes && (
                  <div className="bg-bg-custom border p-2.5 rounded-lg text-[10px] text-gray-500 font-semibold mt-2">
                    <span className="font-black text-text-custom block mb-0.5 uppercase tracking-wide">Catatan Transaksi:</span>
                    {selectedTrx.notes}
                  </div>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedTrx(null)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-text-custom rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer text-center"
              >
                Tutup Struk
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Delete / Cancel Transaction Confirmation was removed and replaced by custom confirm hook */}
    </div>
  );
}
