"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import {
  Plus,
  Package,
  Edit2,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  Tag,
  GripVertical,
} from "lucide-react";
import { cn, formatRupiah } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const productSchema = zod.object({
  name: zod.string().min(2, { message: "Nama produk minimal 2 karakter" }),
  categoryId: zod.string().min(1, { message: "Pilih kategori" }),
  sku: zod.string().optional(),
  barcode: zod.string().optional(),
  sellingPrice: zod.coerce.number().min(100, { message: "Harga jual minimal Rp 100" }),
  basePrice: zod.coerce.number().min(100, { message: "Harga modal minimal Rp 100" }),
  status: zod.enum(["ACTIVE", "INACTIVE"]),
  linkedProductId: zod.string().nullable().optional(),
  linkedProductId2: zod.string().nullable().optional(),
  linkedOperationalStockName: zod.string().nullable().optional(),
  stockDeductionQty: zod.coerce.number().min(1, { message: "Pengurangan minimal 1" }),
  stockDeductionQty2: zod.coerce.number().min(1, { message: "Pengurangan minimal 1" }),
});

type ProductForm = zod.infer<typeof productSchema>;

export default function ProdukPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user as any;
  const userRole = user?.role || "KASIR";

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [opStockNames, setOpStockNames] = useState<string[]>([]);
  const [selectedOpStocks, setSelectedOpStocks] = useState<{ name: string; deductionQty: number }[]>([]);
  const [newOpStockName, setNewOpStockName] = useState<string>("");
  const [newOpStockQty, setNewOpStockQty] = useState<number>(1);

  // Redirect if not Owner/Developer (redundant fallback)
  useEffect(() => {
    if (session && userRole !== "DEVELOPER" && userRole !== "OWNER") {
      window.location.href = "/dashboard";
    }
  }, [session, userRole]);

  // Fetch Categories & OpStock Names
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch (error) {
        console.error(error);
      }
    };
    const fetchOpStockNames = async () => {
      try {
        const res = await fetch("/api/stok-opname?uniqueNames=true");
        if (res.ok) {
          const data = await res.json();
          setOpStockNames(data);
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchCats();
    fetchOpStockNames();
  }, []);

  // Fetch Products (including inactive)
  const { data: products = [], isLoading, isError, error } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const res = await fetch("/api/products?includeInactive=true");
      if (!res.ok) throw new Error("Gagal memuat produk");
      return res.json();
    },
    enabled: !!session,
  });

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      sku: "",
      barcode: "",
      sellingPrice: 0,
      basePrice: 0,
      status: "ACTIVE" as const,
      linkedProductId: "",
      linkedProductId2: "",
      stockDeductionQty: 1,
      stockDeductionQty2: 1,
    },
  });

  // Handle Edit preparation
  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setValue("name", product.name);
    setValue("categoryId", product.categoryId);
    setValue("sku", product.sku);
    setValue("barcode", product.barcode || "");
    setValue("sellingPrice", product.sellingPrice);
    setValue("basePrice", product.basePrice);
    setValue("status", product.status);
    setValue("linkedProductId", product.linkedProductId || "");
    setValue("linkedProductId2", product.linkedProductId2 || "");
    if (product.operationalStocks) {
      setSelectedOpStocks(
        product.operationalStocks.map((os: any) => ({
          name: os.operationalStockName,
          deductionQty: os.deductionQty,
        }))
      );
    } else {
      setSelectedOpStocks([]);
    }
    setNewOpStockName("");
    setNewOpStockQty(1);
    setValue("stockDeductionQty", product.stockDeductionQty || 1);
    setValue("stockDeductionQty2", product.stockDeductionQty2 || 1);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingProduct(null);
    reset({
      name: "",
      categoryId: categories[0]?.id || "",
      sku: "",
      barcode: "",
      sellingPrice: 0,
      basePrice: 0,
      status: "ACTIVE",
      linkedProductId: "",
      linkedProductId2: "",
      stockDeductionQty: 1,
      stockDeductionQty2: 1,
    });
    setSelectedOpStocks([]);
    setNewOpStockName("");
    setNewOpStockQty(1);
    setIsModalOpen(true);
  };

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Add/Edit Mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : `/api/products`;
      const method = editingProduct ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          linkedProductId: data.linkedProductId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan produk");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", editingProduct ? "Produk berhasil diperbarui!" : "Produk baru berhasil ditambah!");
      setIsModalOpen(false);
      setEditingProduct(null);
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus produk");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerAlert("success", "Produk berhasil dihapus!");
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  // Reorder Mutation
  const reorderMutation = useMutation({
    mutationFn: async (items: { id: string; sortOrder: number }[]) => {
      const res = await fetch("/api/products/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal mengubah urutan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      triggerAlert("success", "Urutan menu berhasil diperbarui!");
    },
    onError: (err: any) => {
      triggerAlert("error", err.message);
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus produk ini? Stok dan data transaksi lama tetap akan aman di sistem.")) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleStatus = (product: any) => {
    const nextStatus = product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setEditingProduct(product);
    saveMutation.mutate({
      name: product.name,
      categoryId: product.categoryId,
      sku: product.sku,
      barcode: product.barcode || "",
      sellingPrice: product.sellingPrice,
      basePrice: product.basePrice,
      status: nextStatus,
      linkedProductId: product.linkedProductId || null,
      stockDeductionQty: product.stockDeductionQty || 1,
      linkedProductId2: product.linkedProductId2 || null,
      stockDeductionQty2: product.stockDeductionQty2 || 1,
      operationalStocks: product.operationalStocks ? product.operationalStocks.map((os: any) => ({
        name: os.operationalStockName,
        deductionQty: os.deductionQty
      })) : [],
    } as any);
  };

  // Move product up/down in order
  const handleMove = (productId: string, direction: "up" | "down") => {
    // We work on the FULL (unfiltered) list for order integrity
    const allProducts = [...products].sort((a: any, b: any) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

    const idx = allProducts.findIndex((p: any) => p.id === productId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === allProducts.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newList = [...allProducts];
    // Swap
    const tmp = newList[idx];
    newList[idx] = newList[swapIdx];
    newList[swapIdx] = tmp;

    // Assign sequential sortOrder values
    const items = newList.map((p: any, i: number) => ({ id: p.id, sortOrder: i + 1 }));
    reorderMutation.mutate(items);
  };

  const handleDragReorder = (fromIdx: number, toIdx: number) => {
    const currentList = [...filteredProducts];
    const draggedItem = currentList[fromIdx];
    
    currentList.splice(fromIdx, 1);
    currentList.splice(toIdx, 0, draggedItem);

    const reorderedIds = currentList.map((p: any) => p.id);
    
    const allProducts = [...products].sort((a: any, b: any) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

    const reorderedItems = allProducts
      .filter((p: any) => reorderedIds.includes(p.id))
      .sort((a: any, b: any) => reorderedIds.indexOf(a.id) - reorderedIds.indexOf(b.id));
    const otherItems = allProducts.filter((p: any) => !reorderedIds.includes(p.id));

    const finalSorted = [...reorderedItems, ...otherItems];
    const items = finalSorted.map((p: any, i: number) => ({ id: p.id, sortOrder: i + 1 }));
    reorderMutation.mutate(items);
  };

  const onFormSubmit = (data: ProductForm) => {
    const generatedSku = editingProduct?.sku || "CPK-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString().slice(-4);
    
    saveMutation.mutate({
      ...data,
      sku: generatedSku,
      linkedProductId: data.linkedProductId || null,
      linkedProductId2: data.linkedProductId2 || null,
      operationalStocks: selectedOpStocks,
    } as any);
  };

  // Filtering — filter then sort by sortOrder
  const filteredProducts = products
    .filter((p: any) => {
      const isActive = p.status === "ACTIVE";
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "ALL" || p.categoryId === selectedCategory;
      return isActive && matchesSearch && matchesCategory;
    })
    .sort((a: any, b: any) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

  // All products sorted (for determining first/last positions in full list)
  const allSorted = [...products]
    .filter((p: any) => p.status === "ACTIVE")
    .sort((a: any, b: any) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="flex flex-col gap-6 relative">
      <div className="flex flex-col gap-6 animate-fade-in">
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

      {/* Header controls card */}
      <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari produk berdasarkan nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-bg-custom border border-border-custom text-xs font-semibold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
          >
            <option value="ALL">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Reorder hint badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] font-bold text-amber-600">
            <GripVertical className="w-3.5 h-3.5" />
            <span>Gunakan ↑↓ untuk atur urutan</span>
          </div>

          {/* Add product button */}
          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Products list card */}
      <div className="bg-white border border-border-custom rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs">Memuat katalog produk...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#E84E4E]">
            <AlertCircle className="w-8 h-8 animate-bounce text-primary" />
            <span className="text-xs font-extrabold">Gagal memuat katalog produk</span>
            <span className="text-[10px] text-gray-400 leading-normal max-w-xs text-center">
              {(error as any)?.message || "Terjadi kesalahan koneksi database."}
            </span>
            <span className="text-[10px] text-gray-500 font-bold bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-1.5 mt-1">
              Pastikan terminal database (`npx prisma dev`) sudah berjalan.
            </span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-24 text-xs text-gray-400">
            Katalog produk masih kosong. Silakan tambahkan produk baru.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-custom text-gray-400 font-bold uppercase tracking-wider bg-bg-custom">
                  <th className="py-3.5 px-4">Nama Produk</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4 text-right">Harga Modal (HPP)</th>
                  <th className="py-3.5 px-4 text-right">Harga Jual</th>
                  <th className="py-3.5 px-4 text-center">Status POS</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p: any, idx: number) => {
                  const isPending = reorderMutation.isPending;

                  return (
                    <motion.tr
                      key={p.id}
                      layout
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedIdx !== null && draggedIdx !== idx) {
                          setDragOverIdx(idx);
                        }
                      }}
                      onDragLeave={() => {
                        setDragOverIdx(null);
                      }}
                      onDrop={() => {
                        if (draggedIdx !== null && draggedIdx !== idx) {
                          handleDragReorder(draggedIdx, idx);
                        }
                        setDraggedIdx(null);
                        setDragOverIdx(null);
                      }}
                      className={`border-b border-border-custom last:border-none hover:bg-bg-custom/30 transition-all duration-150 ${
                        draggedIdx === idx ? "opacity-30 bg-gray-100" : ""
                      } ${dragOverIdx === idx ? "border-t-2 border-primary bg-primary/5" : ""}`}
                    >
                      <td className="py-3.5 px-4 font-bold text-text-custom">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span>{p.name}</span>
                            {p.linkedProductId && (
                              <span className="text-[9px] text-gray-400 font-normal">
                                Hubung 1: {p.linkedProductName} (x{p.stockDeductionQty})
                              </span>
                            )}
                            {p.linkedProductId2 && (
                              <span className="text-[9px] text-gray-400 font-normal">
                                Hubung 2: {p.linkedProductName2} (x{p.stockDeductionQty2})
                              </span>
                            )}
                            {p.operationalStocks && p.operationalStocks.length > 0 && (
                              <span className="text-[9px] text-purple-500 font-semibold">
                                Bahan: {p.operationalStocks.map((os: any) => `${os.operationalStockName} (x${os.deductionQty})`).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-500 font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5 text-gray-400" />
                            {p.categoryName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-gray-500">
                        {formatRupiah(p.basePrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-primary">
                        {formatRupiah(p.sellingPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleStatus(p)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold cursor-pointer transition-colors ${
                            p.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {p.status === "ACTIVE" ? (
                            <>
                              <Eye className="w-3 h-3" /> Aktif
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" /> Nonaktif
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <div
                            draggable={!reorderMutation.isPending}
                            onDragStart={(e) => {
                              setDraggedIdx(idx);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggedIdx(null);
                              setDragOverIdx(null);
                            }}
                            title="Tarik untuk mengubah urutan"
                            className="drag-handle p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing transition-colors"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 hover:bg-primary/5 rounded-lg text-gray-400 hover:text-primary transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {/* Modal dialog - Add / Edit Form */}
    <AnimatePresence>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl w-full max-w-2xl p-6 border border-border-custom shadow-xl relative overflow-y-auto max-h-[90vh]"
          >
              {/* Header */}
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-border-custom">
                <h3 className="font-extrabold text-sm text-text-custom flex items-center gap-1.5">
                  <Package className="w-5 h-5 text-primary" />
                  {editingProduct ? "Edit Detail Produk" : "Tambah Produk Baru"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-text-custom transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left Column */}
                  <div className="flex flex-col gap-4">
                    {/* Product Name */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nama Produk</label>
                      <input
                        type="text"
                        placeholder="Contoh: Cipak Koceak 5000"
                        {...register("name")}
                        className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                      />
                      {errors.name && <span className="text-[9px] text-primary font-bold">{errors.name.message}</span>}
                    </div>

                    {/* Category Selection (Single Category) */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Kategori</label>
                      <select
                        {...register("categoryId")}
                        className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {errors.categoryId && (
                        <span className="text-[9px] text-primary font-bold">{errors.categoryId.message}</span>
                      )}
                    </div>

                    {/* Status Toggle */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status Awal</label>
                      <select
                        {...register("status")}
                        className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                      >
                        <option value="ACTIVE">Aktif (Tampil di Kasir & Stok)</option>
                        <option value="INACTIVE">Nonaktif (Sembunyikan dari Kasir & Stok)</option>
                      </select>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col gap-4">
                    {/* Hubungkan ke Stok Utama 1 (Dua Kolom) */}
                    <div className={cn("grid gap-3 transition-all", watch("linkedProductId") ? "grid-cols-3" : "grid-cols-1")}>
                      <div className={cn("flex flex-col gap-1.5", watch("linkedProductId") ? "col-span-2" : "col-span-1")}>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Hubungkan ke Stok Utama 1</label>
                        <select
                          {...register("linkedProductId")}
                          onChange={(e) => {
                            const val = e.target.value;
                            setValue("linkedProductId", val);
                            if (val) {
                              const found = products.find((p: any) => p.id === val);
                              if (found) {
                                setValue("categoryId", found.categoryId);
                                setValue("basePrice", found.basePrice);
                              }
                            }
                          }}
                          className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                        >
                          <option value="">-- Produk Stok Mandiri (Miliki Stok Sendiri) --</option>
                          {products
                            .filter((p: any) => !p.linkedProductId && (!p.operationalStocks || p.operationalStocks.length === 0) && p.id !== editingProduct?.id && p.id !== watch("linkedProductId2"))
                            .map((p: any) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        {errors.linkedProductId && (
                          <span className="text-[9px] text-primary font-bold">{errors.linkedProductId.message}</span>
                        )}
                      </div>

                      {watch("linkedProductId") && (
                        <div className="flex flex-col gap-1.5 col-span-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pengurangan 1</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            {...register("stockDeductionQty")}
                            className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                          />
                          {errors.stockDeductionQty && (
                            <span className="text-[9px] text-primary font-bold">{errors.stockDeductionQty.message}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Hubungkan ke Stok Utama 2 (Dua Kolom - Opsional) */}
                    {watch("linkedProductId") && (
                      <div className={cn("grid gap-3 transition-all", watch("linkedProductId2") ? "grid-cols-3" : "grid-cols-1")}>
                        <div className={cn("flex flex-col gap-1.5", watch("linkedProductId2") ? "col-span-2" : "col-span-1")}>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Hubungkan ke Stok Utama 2 (Opsional)</label>
                          <select
                            {...register("linkedProductId2")}
                            onChange={(e) => {
                              const val = e.target.value;
                              setValue("linkedProductId2", val);
                            }}
                            className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                          >
                            <option value="">-- Tidak Ada Stok Utama Kedua --</option>
                            {products
                              .filter((p: any) => !p.linkedProductId && (!p.operationalStocks || p.operationalStocks.length === 0) && p.id !== editingProduct?.id && p.id !== watch("linkedProductId"))
                              .map((p: any) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                          {errors.linkedProductId2 && (
                            <span className="text-[9px] text-primary font-bold">{errors.linkedProductId2.message}</span>
                          )}
                        </div>

                        {watch("linkedProductId2") && (
                          <div className="flex flex-col gap-1.5 col-span-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pengurangan 2</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="1"
                              {...register("stockDeductionQty2")}
                              className="px-3.5 py-2.5 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                            />
                            {errors.stockDeductionQty2 && (
                              <span className="text-[9px] text-primary font-bold">{errors.stockDeductionQty2.message}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Resep Bahan Operasional (Stok Opname) */}
                    <div className="flex flex-col gap-2.5 border-t border-border-custom pt-3.5">
                      <label className="text-[10px] font-extrabold text-purple-600 uppercase tracking-wide">Bahan Operasional (Stok Opname) yang Dikurangi</label>
                      
                      {/* List of currently selected ingredients */}
                      {selectedOpStocks.length > 0 ? (
                        <div className="flex flex-col gap-1.5 mb-2 max-h-[140px] overflow-y-auto pr-1">
                          {selectedOpStocks.map((os, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-bg-custom border border-border-custom px-3 py-1.5 rounded-lg text-xs font-bold">
                              <span className="text-text-custom">{os.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-gray-400">x{os.deductionQty}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOpStocks(selectedOpStocks.filter((_, i) => i !== idx));
                                  }}
                                  className="text-primary hover:text-red-600 transition"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-500 italic mb-2">Belum ada bahan operasional yang dihubungkan.</span>
                      )}

                      {/* Add new ingredient form inline */}
                      <div className="flex items-center gap-2">
                        <select
                          value={newOpStockName}
                          onChange={(e) => setNewOpStockName(e.target.value)}
                          className="flex-1 px-3 py-2 bg-bg-custom border border-border-custom rounded-lg text-xs focus:outline-none text-text-custom font-bold"
                        >
                          <option value="">-- Pilih Bahan --</option>
                          {opStockNames
                            .filter(name => !selectedOpStocks.some(os => os.name === name))
                            .map(name => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={newOpStockQty}
                          onChange={(e) => setNewOpStockQty(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                          className="w-16 px-3 py-2 bg-bg-custom border border-border-custom rounded-lg text-xs text-center focus:outline-none text-text-custom font-bold"
                          placeholder="Qty"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newOpStockName) {
                              setSelectedOpStocks([...selectedOpStocks, { name: newOpStockName, deductionQty: newOpStockQty }]);
                              setNewOpStockName("");
                              setNewOpStockQty(1);
                            }
                          }}
                          className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shrink-0"
                        >
                          + Tambah
                        </button>
                      </div>
                    </div>

                    {/* Prices HPP & Jual */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Harga Modal (HPP)</label>
                        <input
                          type="number"
                          placeholder="7000"
                          {...register("basePrice")}
                          className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                        />
                        {errors.basePrice && (
                          <span className="text-[9px] text-primary font-bold">{errors.basePrice.message}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Harga Jual</label>
                        <input
                          type="number"
                          placeholder="12000"
                          {...register("sellingPrice")}
                          className="px-3.5 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom font-bold"
                        />
                        {errors.sellingPrice && (
                          <span className="text-[9px] text-primary font-bold">{errors.sellingPrice.message}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[9px] text-gray-400 leading-normal border-t pt-2 mt-1">
                  * Jumlah pengurangan stok adalah unit stok utama yang berkurang saat produk ini terjual 1 unit (contoh: isi 2 untuk porsi jumbo).
                </p>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 mt-3.5 pt-3 border-t border-border-custom">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 border border-border-custom hover:bg-gray-50 text-gray-500 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className={cn(
                      "px-6 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer",
                      saveMutation.isPending
                        ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none"
                        : "bg-primary hover:bg-primary-dark text-white shadow-primary/20 hover:shadow-lg"
                    )}
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Simpan Produk</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
