"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  Plus,
  ShoppingBag,
  Trash2,
  Calendar as CalendarIcon,
  User,
  Building,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/components/confirm-dialog";

const expenseSchema = zod.object({
  date: zod.string().min(1, { message: "Tanggal harus diisi" }),
  itemName: zod.string().min(2, { message: "Nama barang/pengeluaran minimal 2 karakter" }),
  supplier: zod.string().optional(),
  qty: zod.coerce.number().min(1, { message: "Qty minimal 1" }),
  price: zod.coerce.number().min(100, { message: "Harga minimal Rp 100" }),
  notes: zod.string().optional(),
  operationalStockId: zod.string().optional().nullable(),
});

type ExpenseForm = zod.infer<typeof expenseSchema>;

export default function PengeluaranPage() {
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
  const [selectedItemId, setSelectedItemId] = useState<string>("__MANUAL__");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isOwnerOrDeveloper = userRole === "OWNER" || userRole === "DEVELOPER";

  // Clear selections when activeOutlet changes
  useEffect(() => {
    setSelectedIds([]);
  }, [activeOutlet]);

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

  // Form Setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      itemName: "",
      supplier: "",
      qty: 1,
      price: 0,
      notes: "",
      operationalStockId: null as string | null,
    },
  });

  // Fetch operational stocks for the dropdown mapping
  const { data: opStocks = [] } = useQuery({
    queryKey: ["stok-opname-list", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/stok-opname?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat operational stock");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  // Fetch expense list (reusing the /api/shopping route)
  const { data: expenseList = [], isLoading, refetch } = useQuery({
    queryKey: ["expense-list", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/shopping?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat daftar pengeluaran");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  useEffect(() => {
    if (activeOutlet) {
      refetch();
      setSelectedItemId("__MANUAL__");
      setValue("itemName", "");
      setValue("operationalStockId", null);
    }
  }, [activeOutlet]);

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Add Expense Mutation (reusing the /api/shopping POST)
  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal mencatat pengeluaran");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Pengeluaran berhasil dicatat!");
      reset({
        date: new Date().toISOString().split("T")[0],
        itemName: "",
        supplier: "",
        qty: 1,
        price: 0,
        notes: "",
        operationalStockId: null,
      });
      setSelectedItemId("__MANUAL__");
      queryClient.invalidateQueries({ queryKey: ["expense-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  // Delete Expense Mutation (reusing /api/shopping Route DELETE)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shopping?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus pengeluaran");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Pengeluaran berhasil dihapus!");
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["expense-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-list"] });
      queryClient.invalidateQueries({ queryKey: ["stok-opname-movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const handleDeleteSelected = async () => {
    const ok = await confirm({
      title: "Hapus Pengeluaran Terpilih",
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} catatan pengeluaran terpilih secara massal? Tindakan ini juga akan membalikkan penambahan stok opname terkait.`,
      confirmText: "Ya, Hapus Semua",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate(selectedIds.join(","));
    }
  };

  const onSubmit = (data: any) => {
    if (!activeOutlet) {
      triggerAlert("error", "Pilih outlet terlebih dahulu");
      return;
    }
    addMutation.mutate({
      ...data,
      outletId: activeOutlet,
    });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Hapus Pengeluaran",
      message: "Apakah Anda yakin ingin menghapus catatan pengeluaran ini? Tindakan ini juga akan membalikkan penambahan stok opname terkait.",
      confirmText: "Ya, Hapus",
      variant: "danger",
    });
    if (ok) {
      deleteMutation.mutate(id);
    }
  };

  // Determine current unit suffix for qty label
  const selectedUnit = selectedItemId !== "__MANUAL__"
    ? opStocks.find((s: any) => s.id === selectedItemId)?.unit || "pcs"
    : "unit";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in relative">
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

      {/* Form: Record Expense (Left Column) */}
      <div className="bg-white border border-border-custom rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border-custom">
          <ShoppingBag className="w-5 h-5 text-primary" />
          <h3 className="font-extrabold text-sm text-text-custom">Catat Pengeluaran Operasional</h3>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
          {/* Active Outlet Selection */}
          {userRole !== "KASIR" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Outlet</label>
              <select
                value={activeOutlet}
                onChange={(e) => setActiveOutlet(e.target.value)}
                className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
              >
                {outletsToUse.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tanggal</label>
            <input
              type="date"
              {...register("date")}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
            {errors.date && <span className="text-[9px] text-primary font-bold">{errors.date.message}</span>}
          </div>

          {/* Item Selection Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pilih Barang / Stok Opname</label>
            <select
              value={selectedItemId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedItemId(val);
                if (val === "__MANUAL__") {
                  setValue("itemName", "");
                  setValue("operationalStockId", null);
                } else {
                  const found = opStocks.find((s: any) => s.id === val);
                  if (found) {
                    setValue("itemName", found.name);
                    setValue("operationalStockId", found.id);
                  }
                }
              }}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-semibold"
            >
              <option value="__MANUAL__">Lainnya (Ketik Manual)...</option>
              {opStocks.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Item Name (Text input, only if manual is selected) */}
          {selectedItemId === "__MANUAL__" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Barang / Pengeluaran</label>
              <input
                type="text"
                placeholder="Contoh: Minyak Goreng, Bumbu, Gas, Sewa Ruko"
                {...register("itemName")}
                className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
              />
              {errors.itemName && <span className="text-[9px] text-primary font-bold">{errors.itemName.message}</span>}
            </div>
          )}

          {/* Supplier */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Supplier (Opsional)</label>
            <input
              type="text"
              placeholder="Contoh: Pasar Induk, Agen Plastik"
              {...register("supplier")}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>

          {/* Qty & Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                Quantity ({selectedUnit})
              </label>
              <input
                type="number"
                placeholder="1"
                {...register("qty")}
                className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
              />
              {errors.qty && <span className="text-[9px] text-primary font-bold">{errors.qty.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Harga Satuan</label>
              <input
                type="number"
                placeholder="15000"
                {...register("price")}
                className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
              />
              {errors.price && <span className="text-[9px] text-primary font-bold">{errors.price.message}</span>}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Keterangan (Opsional)</label>
            <input
              type="text"
              placeholder="Catatan pengeluaran tambahan..."
              {...register("notes")}
              className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer mt-2 disabled:opacity-50"
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Simpan Pengeluaran</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* List: Expense Logs (Right Column) */}
      <div className="lg:col-span-2 bg-white border border-border-custom rounded-xl p-5 shadow-sm flex flex-col gap-4 overflow-hidden h-[calc(100vh-88px)] lg:h-auto">
        <div className="flex items-center justify-between pb-3 border-b border-border-custom">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h3 className="font-extrabold text-sm text-text-custom">Daftar Pengeluaran Harian</h3>
          </div>
          {userRole === "KASIR" && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-bg-custom px-2.5 py-1 rounded-lg">
              <Building className="w-3.5 h-3.5 text-primary" />
              <span>Scoping: {userOutlets[0]?.name || "Lock"}</span>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto max-h-[500px] pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs">Memuat daftar pengeluaran...</span>
            </div>
          ) : expenseList.length === 0 ? (
            <div className="text-center py-20 text-xs text-gray-400 bg-bg-custom rounded-xl border border-border-custom border-dashed">
              Belum ada pengeluaran operasional hari ini untuk outlet ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {isOwnerOrDeveloper && selectedIds.length > 0 && (
                <div className="bg-primary/5 border border-border-custom px-4 py-2.5 rounded-xl flex items-center justify-between mb-3 animate-fade-in shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {selectedIds.length} item pengeluaran terpilih
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

              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                    {isOwnerOrDeveloper && (
                      <th className="py-2.5 px-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={expenseList.length > 0 && selectedIds.length === expenseList.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(expenseList.map((item: any) => item.id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Barang / Deskripsi</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Harga</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3">Pencatat</th>
                    {isOwnerOrDeveloper && <th className="py-2.5 px-3 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {expenseList.map((item: any) => (
                    <tr key={item.id} className={`border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-colors ${
                      selectedIds.includes(item.id) ? "bg-primary/5" : ""
                    }`}>
                      {isOwnerOrDeveloper && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedIds((prev) => prev.filter((id) => id !== item.id));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                          />
                        </td>
                      )}
                      <td className="py-3 px-3 font-semibold text-gray-600 shrink-0">
                        {formatDate(item.date)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-text-custom flex items-center gap-1.5">
                          <span>{item.itemName}</span>
                          {item.operationalStockId && (
                            <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-100">
                              Stok Mapped
                            </span>
                          )}
                        </div>
                        {item.notes && <div className="text-[10px] text-gray-400 mt-0.5">{item.notes}</div>}
                      </td>
                      <td className="py-3 px-3 text-gray-500">{item.supplier || "-"}</td>
                      <td className="py-3 px-3 text-center font-bold text-gray-600">{item.qty}</td>
                      <td className="py-3 px-3 text-right text-gray-500">{formatRupiah(item.price)}</td>
                      <td className="py-3 px-3 text-right font-extrabold text-primary">{formatRupiah(item.total)}</td>
                      <td className="py-3 px-3 text-gray-500 italic flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate max-w-[80px]">{item.user?.name || "Sistem"}</span>
                      </td>
                      {isOwnerOrDeveloper && (
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 hover:bg-primary/10 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
