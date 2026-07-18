"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function InputStokForm() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";

  const isOwnerOrDev = userRole === "OWNER" || userRole === "DEVELOPER" || userRole === "KOORLAP";

  // Fetch outlets & product stock details
  const { data: rawData, isLoading: isLoadingGrid, refetch: refetchGrid } = useQuery({
    queryKey: ["stok-distribution-list"],
    queryFn: async () => {
      const res = await fetch("/api/stok/distribution");
      if (!res.ok) throw new Error("Gagal memuat data stok");
      return res.json();
    },
    enabled: isOwnerOrDev,
  });

  const outlets = rawData?.outlets || [];
  const products = rawData?.products || [];

  const [gridData, setGridData] = useState<any[]>([]);
  const [globalNotes, setGlobalNotes] = useState<string>("Stok Tambahan");
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Initialize grid inputs when rawData is loaded
  useEffect(() => {
    if (products.length > 0 && outlets.length > 0) {
      const initialGrid = products.map((p: any) => {
        const distOutlets: Record<string, any> = {};
        outlets.forEach((o: any) => {
          distOutlets[o.id] = ""; // Empty string for blank input
        });

        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          stocks: p.stocks || {}, // current quantities: { [outletId]: qty }
          stockIds: p.stockIds || {}, // stock IDs: { [outletId]: id }
          outlets: distOutlets, // addition inputs: { [outletId]: val }
        };
      });
      setGridData(initialGrid);
    }
  }, [rawData, products, outlets]);

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // Handle cell input changes
  const handleOutletQtyChange = (productId: string, outletId: string, value: string) => {
    const numericVal = Math.max(0, parseInt(value) || 0);
    setGridData((prev) =>
      prev.map((row) => {
        if (row.productId === productId) {
          return {
            ...row,
            outlets: {
              ...row.outlets,
              [outletId]: value === "" ? "" : numericVal,
            },
          };
        }
        return row;
      })
    );
  };

  // Mutation: Save stock adjustment
  const adjustMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/stok/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan penyesuaian");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Stok tambahan berhasil disimpan!");
      // Reset grid
      setGridData((prev) =>
        prev.map((row) => {
          const resetOutlets: Record<string, any> = {};
          Object.keys(row.outlets).forEach((k) => {
            resetOutlets[k] = "";
          });
          return { ...row, outlets: resetOutlets };
        })
      );
      setGlobalNotes("Stok Tambahan");
      queryClient.invalidateQueries({ queryKey: ["stok-distribution-list"] });
      queryClient.invalidateQueries({ queryKey: ["movements-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleSave = () => {
    const adjustments: any[] = [];
    gridData.forEach((row) => {
      Object.entries(row.outlets).forEach(([outletId, qty]) => {
        const numericQty = Number(qty);
        if (numericQty > 0) {
          const stockId = row.stockIds[outletId];
          if (stockId) {
            adjustments.push({
              stockId,
              type: "IN",
              qty: numericQty,
              notes: globalNotes.trim() || "Stok Tambahan",
            });
          }
        }
      });
    });

    if (adjustments.length === 0) {
      triggerAlert("error", "Harap isi minimal satu kolom jumlah tambahan sebelum menyimpan.");
      return;
    }

    adjustMutation.mutate({
      adjustments,
      notes: globalNotes.trim() || "Stok Tambahan",
    });
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

      {/* Header Panel */}
      <div className="bg-white p-4.5 rounded-xl border border-border-custom shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/5 border border-primary/10 rounded-xl text-primary">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-extrabold text-base text-text-custom leading-tight">Input Stok Tambahan</h2>
            <p className="text-[10px] text-gray-400 mt-0.5 font-medium leading-normal">
              Masukkan jumlah stok produk tambahan (+) yang masuk ke outlet masing-masing.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid Table Card */}
      <div className="bg-white border border-border-custom rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Table Toolbar */}
        <div className="p-5 border-b border-border-custom flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-gray-50/50">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Catatan / Alasan:</label>
            <input
              type="text"
              placeholder="Contoh: Kiriman supplier, restock"
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-white border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
            />
          </div>

          <div className="flex items-center gap-2.5 self-stretch md:self-auto justify-end">
            <button
              onClick={() => refetchGrid()}
              disabled={isLoadingGrid}
              className="p-2 border border-border-custom hover:border-primary/20 text-gray-400 hover:text-primary rounded-xl transition-all cursor-pointer bg-white"
              title="Reload Data"
            >
              <Loader2 className={cn("w-4 h-4", isLoadingGrid && "animate-spin")} />
            </button>
            <button
              onClick={handleSave}
              disabled={adjustMutation.isPending || isLoadingGrid}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/25 hover:shadow-lg transition-all duration-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {adjustMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Stok Tambahan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto min-h-[350px]">
          {isLoadingGrid ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-semibold">Memuat tabel stok produk...</span>
            </div>
          ) : gridData.length === 0 ? (
            <div className="text-center py-20 text-xs text-gray-400">
              Tidak ada produk terdaftar untuk outlet Anda.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom/50">
                  <th className="py-3 px-4 text-center w-12">No</th>
                  <th className="py-3 px-4 min-w-[200px]">Nama Barang</th>
                  {outlets.map((o: any) => (
                    <th key={o.id} className="py-3 px-4 text-center min-w-[100px]">
                      {o.name.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridData.map((row, idx) => (
                  <tr key={row.productId} className="border-b border-border-custom last:border-none hover:bg-bg-custom/10 transition-colors">
                    <td className="py-3.5 px-4 text-center font-bold text-gray-400">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-text-custom">{row.name}</span>
                        <span className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">{row.sku}</span>
                      </div>
                    </td>
                    {outlets.map((o: any) => {
                      const currentStock = row.stocks[o.id] || 0;
                      const val = row.outlets[o.id] ?? "";

                      return (
                        <td key={o.id} className="py-3.5 px-4">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] text-gray-400 font-bold">
                              ({currentStock} pcs)
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={val}
                              onChange={(e) => handleOutletQtyChange(row.productId, o.id, e.target.value)}
                              className="w-16 px-2 py-1 bg-bg-custom border border-border-custom rounded-lg text-xs font-bold text-center focus:outline-none focus:border-primary/50 text-text-custom"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
