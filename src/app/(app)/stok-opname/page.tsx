"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  Boxes,
  Plus,
  Search,
  Settings2,
  RefreshCw,
  History,
  FileSpreadsheet,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  User,
  PlusCircle,
  Building,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Copy,
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

// Zod schemas for modals
const addStockSchema = zod.object({
  name: zod.string().min(2, { message: "Nama barang minimal 2 karakter" }),
  unit: zod.string().min(1, { message: "Satuan harus diisi (misal: pcs, kg, pack)" }),
  minStock: zod.coerce.number().min(0, { message: "Batas minimal tidak boleh negatif" }),
  initialStock: zod.coerce.number().min(0, { message: "Stok awal tidak boleh negatif" }),
  qtyPerUnit: zod.coerce.number().min(1, { message: "Isi per unit minimal 1" }),
});

const adjustStockSchema = zod.object({
  type: zod.enum(["INITIAL", "IN", "OUT"], { message: "Tipe penyesuaian harus dipilih" }),
  qty: zod.coerce.number().min(0.01, { message: "Jumlah harus minimal 0.01" }),
  notes: zod.string().optional(),
  useBuyUnit: zod.boolean().optional(),
  qtyPerUnit: zod.coerce.number().min(1, { message: "Isi per unit minimal 1" }).optional(),
});

type AddStockForm = zod.infer<typeof addStockSchema>;
type AdjustStockForm = zod.infer<typeof adjustStockSchema>;

export default function StokOpnamePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const userOutlets = user?.outlets || [];
  const activeOutletId = user?.activeOutletId;
  const confirm = useConfirm();

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

  const [activeOutlet, setActiveOutlet] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"current" | "mutations">("current");
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isMinStockOpen, setIsMinStockOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [minStockValue, setMinStockValue] = useState<number>(0);
  const [qtyPerUnitValue, setQtyPerUnitValue] = useState<number>(1);

  // Copy modal states
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copyFromOutlet, setCopyFromOutlet] = useState<string>("");
  const [initialStockMode, setInitialStockMode] = useState<"zero" | "copy">("zero");

  const firstUserOutletId = userOutlets[0]?.id;
  const firstOutletToUseId = outletsToUse[0]?.id;

  // Sync activeOutlet
  useEffect(() => {
    if (userRole === "KASIR" && firstUserOutletId) {
      setActiveOutlet(firstUserOutletId);
    } else if (activeOutletId && activeOutletId !== "ALL") {
      setActiveOutlet(activeOutletId);
    } else if (firstOutletToUseId) {
      setActiveOutlet(firstOutletToUseId);
    }
  }, [activeOutletId, firstOutletToUseId, firstUserOutletId, userRole]);

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Queries
  const { data: opStocks = [], isLoading: isLoadingStocks, refetch: refetchStocks } = useQuery({
    queryKey: ["stok-opname-list", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok-opname?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat stok opname");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  const { data: movements = [], isLoading: isLoadingMovements, refetch: refetchMovements } = useQuery({
    queryKey: ["stok-opname-movements", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok-opname/movements?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat riwayat mutasi");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  useEffect(() => {
    if (activeOutlet) {
      refetchStocks();
      refetchMovements();
    }
  }, [activeOutlet]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok-opname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal membuat barang baru");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Barang baru berhasil ditambahkan!");
      setIsAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok-opname/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyesuaikan stok");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Stok berhasil diperbarui!");
      setIsAdjustOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const updateMinStockMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok-opname", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal memperbarui batas minimum");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Batas minimum stok berhasil diperbarui!");
      setIsMinStockOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (stockId: string) => {
      const res = await fetch(`/api/stok-opname?stockId=${stockId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus barang");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Barang berhasil dihapus!");
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok-opname/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyalin barang");
      }
      return res.json();
    },
    onSuccess: (data) => {
      triggerAlert("success", data.message || "Barang berhasil disalin!");
      setIsCopyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  // React Hook Forms
  const addForm = useForm<any>({
    resolver: zodResolver(addStockSchema),
    defaultValues: { name: "", unit: "pcs", minStock: 10, initialStock: 0, qtyPerUnit: 1 },
  });

  const adjustForm = useForm<any>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: { type: "IN", qty: 1, notes: "", useBuyUnit: false, qtyPerUnit: 1 },
  });

  const onAddSubmit = (data: AddStockForm) => {
    if (!activeOutlet) {
      triggerAlert("error", "Pilih outlet terlebih dahulu");
      return;
    }
    createMutation.mutate({ ...data, outletId: activeOutlet });
  };

  const onAdjustSubmit = (data: AdjustStockForm) => {
    if (!selectedStock) return;
    adjustMutation.mutate({
      stockId: selectedStock.id,
      ...data,
    });
  };

  const onMinStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock) return;
    updateMinStockMutation.mutate({
      stockId: selectedStock.id,
      minStock: minStockValue,
      qtyPerUnit: qtyPerUnitValue,
    });
  };

  // Mutation: Delete a movement from history (reverse stock)
  const deleteMovementMutation = useMutation({
    mutationFn: async (movementId: string) => {
      const res = await fetch(`/api/stok-opname/movements?id=${movementId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus riwayat mutasi");
      }
      return res.json();
    },
    onSuccess: (res) => {
      triggerAlert("success", res.message || "Riwayat mutasi berhasil dihapus!");
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDeleteMovement = async (movementId: string, itemName: string) => {
    const ok = await confirm({
      title: "Hapus Riwayat Mutasi",
      message: `Apakah Anda yakin ingin menghapus riwayat mutasi "${itemName}"? Stok perlengkapan akan disesuaikan secara otomatis.`,
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteMovementMutation.mutate(movementId);
    }
  };

  const isOwnerOrDev = userRole === "OWNER" || userRole === "DEVELOPER";

  // Filter stocks
  const filteredStocks = opStocks.filter((s: any) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Statistics calculations
  const totalItems = opStocks.length;
  const lowStockItems = opStocks.filter((s: any) => s.quantity <= s.minStock).length;
  
  // Calculate today's adjustments
  const today = new Date().toISOString().split("T")[0];
  const todayMutations = movements.filter((m: any) => m.createdAt.startsWith(today)).length;

  return (
    <div className="flex flex-col gap-5 animate-fade-in relative pb-10">
      {/* Alert Notification */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-50 px-6 py-3.5 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-bold text-white ${
              alertMsg.type === "success" ? "bg-emerald-500" : "bg-primary"
            }`}
          >
            {alertMsg.type === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{alertMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar: Selector & Tab Switching */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-border-custom p-4 rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-text-custom">
            <Boxes className="w-5 h-5 text-primary" />
            <h2 className="font-extrabold text-base tracking-tight">Perlengkapan Bahan Operasional</h2>
          </div>

          {/* Active Outlet Selection */}
          {userRole !== "KASIR" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Outlet:</span>
              <select
                value={activeOutlet}
                onChange={(e) => setActiveOutlet(e.target.value)}
                className="px-3.5 py-1.5 bg-bg-custom border border-border-custom rounded-lg text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
              >
                {outletsToUse.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tab Controls */}
        <div className="flex gap-1.5 bg-bg-custom p-1 rounded-xl border border-border-custom self-start md:self-auto">
          <button
            onClick={() => setActiveTab("current")}
            className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
              activeTab === "current"
                ? "bg-white text-text-custom shadow-sm"
                : "text-gray-400 hover:text-text-custom"
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Stok Terkini</span>
          </button>
          <button
            onClick={() => setActiveTab("mutations")}
            className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
              activeTab === "mutations"
                ? "bg-white text-text-custom shadow-sm"
                : "text-gray-400 hover:text-text-custom"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat Mutasi</span>
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1 */}
        <div className="bg-white border border-border-custom p-4.5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Item Barang</span>
            <span className="text-xl font-black text-text-custom">{totalItems} <span className="text-xs font-bold text-gray-400">jenis</span></span>
          </div>
          <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-gray-500">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2 */}
        <div className={`border p-4.5 rounded-xl shadow-sm flex items-center justify-between transition-colors ${
          lowStockItems > 0 ? "bg-red-50/50 border-red-100" : "bg-white border-border-custom"
        }`}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Perlu Restock / Penyesuaian</span>
            <span className={`text-xl font-black ${
              lowStockItems > 0 ? "text-primary" : "text-text-custom"
            }`}>{lowStockItems} <span className="text-xs font-bold text-gray-400">item</span></span>
          </div>
          <div className={`p-2.5 rounded-xl border ${
            lowStockItems > 0
              ? "bg-red-100/50 border-red-200 text-primary animate-pulse"
              : "bg-gray-50 border-gray-100 text-gray-500"
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-border-custom p-4.5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mutasi Hari Ini</span>
            <span className="text-xl font-black text-text-custom">{todayMutations} <span className="text-xs font-bold text-gray-400">kali</span></span>
          </div>
          <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-gray-500">
            <History className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden flex flex-col gap-4 p-5">
        {activeTab === "current" ? (
          /* TAB 1: CURRENT STOCKS */
          <>
            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama bahan operasional..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                />
              </div>

              {isOwnerOrDev && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => {
                      setCopyFromOutlet("");
                      setInitialStockMode("zero");
                      setIsCopyOpen(true);
                    }}
                    className="py-2 px-3.5 bg-white hover:bg-gray-50 text-text-custom border border-border-custom rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    <span>Salin Dari Outlet</span>
                  </button>
                  <button
                    onClick={() => {
                      addForm.reset({ name: "", unit: "pcs", minStock: 10, initialStock: 0, qtyPerUnit: 1 });
                      setIsAddOpen(true);
                    }}
                    className="py-2 px-3.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Barang Perlengkapan</span>
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[300px]">
              {isLoadingStocks ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs">Memuat data stok...</span>
                </div>
              ) : filteredStocks.length === 0 ? (
                <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-xl border border-border-custom border-dashed">
                  {searchQuery ? "Tidak ada barang perlengkapan yang cocok dengan pencarian." : "Belum ada barang perlengkapan untuk outlet ini."}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                      <th className="py-2.5 px-3">Nama Barang</th>
                      <th className="py-2.5 px-3">Satuan</th>
                      <th className="py-2.5 px-3 text-center">Isi / Unit Beli</th>
                      <th className="py-2.5 px-3 text-center text-blue-600 font-extrabold">Stok</th>
                      <th className="py-2.5 px-3 text-center">Batas Limit</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      {isOwnerOrDev && <th className="py-2.5 px-3 text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.map((item: any) => {
                      const isLow = item.quantity <= item.minStock;
                      const isOut = item.quantity <= 0;

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                        >
                          <td className="py-3 px-3 font-bold text-text-custom">{item.name}</td>
                          <td className="py-3 px-3 text-gray-500 font-semibold">{item.unit}</td>
                          <td className="py-3 px-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 border border-violet-100 text-violet-700 text-[10px] font-extrabold">
                              1 beli = {item.qtyPerUnit ?? 1} {item.unit}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-black text-blue-700">{item.quantity}</td>
                          <td className="py-3 px-3 text-center font-bold text-gray-400">{item.minStock}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                              isOut
                                ? "bg-red-50 text-red-600 border-red-100"
                                : isLow
                                ? "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                                : "bg-emerald-50 text-emerald-600 border-emerald-100"
                            }`}>
                              {isOut ? "Habis" : isLow ? "Perlu Restok" : "Aman"}
                            </span>
                          </td>
                          {isOwnerOrDev && (
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Adjust Stock Button */}
                                <button
                                  onClick={() => {
                                    setSelectedStock(item);
                                    adjustForm.reset({ type: "IN", qty: 1, notes: "", useBuyUnit: false, qtyPerUnit: item.qtyPerUnit || 1 });
                                    setIsAdjustOpen(true);
                                  }}
                                  className="px-2 py-1 bg-primary/5 hover:bg-primary/10 text-primary border border-primary/15 rounded-lg text-[10px] font-extrabold transition-colors cursor-pointer"
                                >
                                  Sesuaikan
                                </button>

                                {/* Edit Limit */}
                                <button
                                  onClick={() => {
                                    setSelectedStock(item);
                                    setMinStockValue(item.minStock);
                                    setQtyPerUnitValue(item.qtyPerUnit || 1);
                                    setIsMinStockOpen(true);
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-400 hover:text-text-custom rounded-lg border border-transparent hover:border-gray-200 transition-all cursor-pointer"
                                  title="Atur Batas Limit & Isi per Unit"
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete Button */}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Hapus Barang Perlengkapan",
                                      message: `Apakah Anda yakin ingin menghapus barang perlengkapan "${item.name}"?`,
                                      confirmText: "Ya, Hapus",
                                      variant: "danger",
                                    });
                                    if (ok) {
                                      deleteMutation.mutate(item.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                  className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg border border-transparent hover:border-red-200 transition-all cursor-pointer disabled:opacity-50"
                                  title="Hapus Barang Perlengkapan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          /* TAB 2: RIWAYAT MUTASI */
          <>
            <div className="overflow-x-auto min-h-[300px]">
              {isLoadingMovements ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs">Memuat data riwayat mutasi...</span>
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-xl border border-border-custom border-dashed">
                  Belum ada riwayat mutasi perlengkapan untuk outlet ini.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                      <th className="py-2.5 px-3">Tanggal / Waktu</th>
                      <th className="py-2.5 px-3">Nama Barang</th>
                      <th className="py-2.5 px-3 text-center">Tipe</th>
                      <th className="py-2.5 px-3 text-center">Jumlah</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                      <th className="py-2.5 px-3">Oleh</th>
                      {isOwnerOrDev && <th className="py-2.5 px-3 text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((log: any) => {
                      const isAdd = log.type === "IN";
                      const isAdjust = log.type === "ADJUSTMENT";

                      return (
                        <tr
                          key={log.id}
                          className="border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors"
                        >
                          <td className="py-3 px-3 font-semibold text-gray-500">
                            {formatDate(log.createdAt)}
                          </td>
                          <td className="py-3 px-3 font-bold text-text-custom">{log.itemName}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                              isAdd
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : isAdjust
                                ? "bg-amber-50 text-amber-600 border-amber-100"
                                : "bg-red-50 text-red-600 border-red-100"
                            }`}>
                              {log.type === "ADJUSTMENT" ? "Set Awal" : log.type}
                            </span>
                          </td>
                          <td className={`py-3 px-3 text-center font-bold ${
                            isAdd ? "text-emerald-600" : isAdjust ? "text-amber-600" : "text-red-500"
                          }`}>
                            {isAdd ? "+" : isAdjust ? "Set: " : "-"}{log.quantity} {log.unit}
                          </td>
                          <td className="py-3 px-3 text-gray-500">{log.notes || "-"}</td>
                          <td className="py-3 px-3 text-gray-500 italic flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span>{log.userName}</span>
                          </td>
                          {isOwnerOrDev && (
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => handleDeleteMovement(log.id, log.itemName)}
                                disabled={deleteMovementMutation.isPending}
                                className="p-1.5 hover:bg-primary/10 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                                title="Hapus Riwayat"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: ADD NEW ITEM */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white border border-border-custom rounded-2xl shadow-xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-custom">
              <div className="flex items-center gap-2 text-text-custom">
                <PlusCircle className="w-5 h-5 text-primary" />
                <h3 className="font-extrabold text-sm">Tambah Barang Perlengkapan Baru</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-gray-400 hover:text-text-custom text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Barang</label>
                <input
                  type="text"
                  placeholder="Contoh: Cup Plastik 16oz, Cabai Rawit"
                  {...addForm.register("name")}
                  className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-semibold"
                />
                {addForm.formState.errors.name && (
                  <span className="text-[9px] text-primary font-bold">{addForm.formState.errors.name.message as string}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Satuan</label>
                  <input
                    type="text"
                    placeholder="pcs, kg, pack, tabung"
                    {...addForm.register("unit")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  {addForm.formState.errors.unit && (
                    <span className="text-[9px] text-primary font-bold">{addForm.formState.errors.unit.message as string}</span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Limit Minimal (Aman)</label>
                  <input
                    type="number"
                    placeholder="10"
                    step="any"
                    {...addForm.register("minStock")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  {addForm.formState.errors.minStock && (
                    <span className="text-[9px] text-primary font-bold">{addForm.formState.errors.minStock.message as string}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Stok Awal di Outlet</label>
                  <input
                    type="number"
                    placeholder="0"
                    step="any"
                    {...addForm.register("initialStock")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  {addForm.formState.errors.initialStock && (
                    <span className="text-[9px] text-primary font-bold">{addForm.formState.errors.initialStock.message as string}</span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Isi per Unit Beli</label>
                  <input
                    type="number"
                    placeholder="Misal: 50"
                    {...addForm.register("qtyPerUnit")}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  <span className="text-[10px] text-gray-400 leading-relaxed">Jumlah {addForm.watch("unit") || "pcs"} dalam 1x beli</span>
                  {addForm.formState.errors.qtyPerUnit && (
                    <span className="text-[9px] text-primary font-bold">{addForm.formState.errors.qtyPerUnit.message as string}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-border-custom">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 bg-gray-50 border border-gray-150 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/10 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Tambah Barang</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 2: ADJUST STOCK */}
      {isAdjustOpen && selectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white border border-border-custom rounded-2xl shadow-xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-custom">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-extrabold text-sm text-text-custom">Sesuaikan Stok Perlengkapan</h3>
                <span className="text-[10px] font-bold text-gray-400 uppercase">
                  {selectedStock.name} ({selectedStock.quantity} {selectedStock.unit} Tersisa)
                </span>
              </div>
              <button
                onClick={() => setIsAdjustOpen(false)}
                className="text-gray-400 hover:text-text-custom text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={adjustForm.handleSubmit(onAdjustSubmit)} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tipe Penyesuaian</label>
                <select
                  {...adjustForm.register("type")}
                  className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                >
                  <option value="INITIAL">Set Stok Awal (Overwrite)</option>
                  <option value="IN">Stok Masuk (+ Tambah)</option>
                  <option value="OUT">Stok Keluar (- Kurang)</option>
                </select>
                {adjustForm.formState.errors.type && (
                  <span className="text-[9px] text-primary font-bold">{adjustForm.formState.errors.type.message as string}</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                  Jumlah Penyesuaian
                </label>
                <input
                  type="number"
                  placeholder="10"
                  step="any"
                  {...adjustForm.register("qty")}
                  className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                />
                {adjustForm.formState.errors.qty && (
                  <span className="text-[9px] text-primary font-bold">{adjustForm.formState.errors.qty.message as string}</span>
                )}
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="adjustUseBuyUnit"
                  {...adjustForm.register("useBuyUnit")}
                  className="rounded border-border-custom text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <label htmlFor="adjustUseBuyUnit" className="text-[11px] font-extrabold text-gray-500 cursor-pointer">
                  Sesuaikan dalam Unit Beli (misal: Pack / Karton)
                </label>
              </div>

              {adjustForm.watch("useBuyUnit") && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-bg-custom rounded-xl border border-border-custom">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                      Isi per Unit Beli
                    </label>
                    <input
                      type="number"
                      placeholder="50"
                      {...adjustForm.register("qtyPerUnit")}
                      className="px-3.5 py-1.5 bg-white border border-border-custom rounded-lg text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                    />
                    {adjustForm.formState.errors.qtyPerUnit && (
                      <span className="text-[9px] text-primary font-bold">{adjustForm.formState.errors.qtyPerUnit.message as string}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 justify-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total Konversi</span>
                    <span className="text-xs font-black text-primary">
                      {parseFloat(adjustForm.watch("qty") || 0) * parseFloat(adjustForm.watch("qtyPerUnit") || 1)} {selectedStock.unit}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Keterangan / Alasan</label>
                <input
                  type="text"
                  placeholder="Sebab disesuaikan, misal: Stok Terbuang / Kadaluarsa"
                  {...adjustForm.register("notes")}
                  className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-border-custom">
                <button
                  type="button"
                  onClick={() => setIsAdjustOpen(false)}
                  className="px-4 py-2 bg-gray-50 border border-gray-150 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={adjustMutation.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/10 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {adjustMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 3: MIN STOCK CONFIG */}
      {isMinStockOpen && selectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm bg-white border border-border-custom rounded-2xl shadow-xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-custom">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-extrabold text-sm text-text-custom">Pengaturan Barang Perlengkapan</h3>
                <span className="text-[10px] font-bold text-gray-400 uppercase">{selectedStock.name}</span>
              </div>
              <button
                onClick={() => setIsMinStockOpen(false)}
                className="text-gray-400 hover:text-text-custom text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={onMinStockSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    Batas Alert Minimal ({selectedStock.unit})
                  </label>
                  <input
                    type="number"
                    value={minStockValue}
                    step="any"
                    onChange={(e) => setMinStockValue(parseFloat(e.target.value) || 0)}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  <span className="text-[10px] text-gray-400 leading-relaxed">
                    Jika stok aktual turun di bawah batas ini, status item akan berubah menjadi <span className="text-amber-500 font-bold">Perlu Restok</span>.
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    Isi per Unit Beli
                  </label>
                  <input
                    type="number"
                    value={qtyPerUnitValue}
                    onChange={(e) => setQtyPerUnitValue(parseInt(e.target.value) || 1)}
                    className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
                  />
                  <span className="text-[10px] text-gray-400 leading-relaxed">
                    Faktor pengali konversi saat membeli barang di menu pengeluaran (misal 1 unit/pack berisi 50 {selectedStock.unit}).
                  </span>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-border-custom">
                <button
                  type="button"
                  onClick={() => setIsMinStockOpen(false)}
                  className="px-4 py-2 bg-gray-50 border border-gray-150 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updateMinStockMutation.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/10 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {updateMinStockMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Pengaturan</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 4: COPY STOCKS FROM ANOTHER OUTLET */}
      {isCopyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white border border-border-custom rounded-2xl shadow-xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border-custom">
              <div className="flex items-center gap-2 text-text-custom">
                <Copy className="w-5 h-5 text-primary" />
                <h3 className="font-extrabold text-sm">Salin Barang Perlengkapan dari Outlet Lain</h3>
              </div>
              <button
                onClick={() => setIsCopyOpen(false)}
                className="text-gray-400 hover:text-text-custom text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Salin Dari Outlet</label>
                <select
                  value={copyFromOutlet}
                  onChange={(e) => setCopyFromOutlet(e.target.value)}
                  className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                >
                  <option value="">-- Pilih Outlet Asal --</option>
                  {outletsToUse
                    .filter((o: any) => o.id !== activeOutlet)
                    .map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex flex-col gap-2 bg-bg-custom p-3.5 rounded-xl border border-border-custom">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pilihan Nilai Stok Awal</span>
                
                <div className="flex flex-col gap-2.5 mt-1.5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="initialStockMode"
                      value="zero"
                      checked={initialStockMode === "zero"}
                      onChange={() => setInitialStockMode("zero")}
                      className="mt-0.5 border-border-custom text-primary focus:ring-primary w-4 h-4"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-text-custom">Set Jumlah Stok Ke 0</span>
                      <span className="text-[10px] text-gray-400">Salin hanya daftar nama barang, satuan, dan limit, tapi set stok awal ke 0 di outlet tujuan.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="initialStockMode"
                      value="copy"
                      checked={initialStockMode === "copy"}
                      onChange={() => setInitialStockMode("copy")}
                      className="mt-0.5 border-border-custom text-primary focus:ring-primary w-4 h-4"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-text-custom font-black">Salin Jumlah Stok Saat Ini</span>
                      <span className="text-[10px] text-gray-400">Salin daftar barang beserta jumlah stok saat ini dari outlet asal ke outlet tujuan.</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="text-[10px] text-amber-500 font-bold bg-amber-50/50 border border-amber-100/50 p-2.5 rounded-xl">
                Catatan: Barang yang sudah ada di outlet tujuan dengan nama yang sama tidak akan ditimpa atau diduplikasi.
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-border-custom">
                <button
                  type="button"
                  onClick={() => setIsCopyOpen(false)}
                  className="px-4 py-2 bg-gray-50 border border-gray-150 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={copyMutation.isPending || !copyFromOutlet}
                  onClick={() => {
                    copyMutation.mutate({
                      fromOutletId: copyFromOutlet,
                      toOutletId: activeOutlet,
                      initialStockMode,
                    });
                  }}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/10 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {copyMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Mulai Salin</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
