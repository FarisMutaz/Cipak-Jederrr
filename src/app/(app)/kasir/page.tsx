"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  User,
  CreditCard,
  Smartphone,
  Truck,
  Loader2,
  MapPin,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface CartItem {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  quantity: number;
  stock: number;
}

export default function KasirPage() {
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

  const [activeOutlet, setActiveOutlet] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS" | "GRABFOOD">("CASH");
  const [notes, setNotes] = useState("");

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"menu" | "cart">("menu");

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
    }
  }, [activeOutletId, firstOutletToUseId, firstUserOutletId, userRole]);

  // Fetch categories
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch (error) {
        console.error("Failed to load categories:", error);
      }
    };
    fetchCats();
  }, []);

  // Fetch products with stock for activeOutlet
  const { data: products = [], isLoading: isLoadingProds, isError: isErrorProds, error: errorProds, refetch: refetchProds } = useQuery({
    queryKey: ["cashier-products", activeOutlet],
    queryFn: async () => {
      if (!activeOutlet) return [];
      const res = await fetch(`/api/products?outletId=${activeOutlet}`);
      if (!res.ok) throw new Error("Gagal memuat produk");
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["report-session-cashier", activeOutlet, todayStr],
    queryFn: async () => {
      if (!activeOutlet) return null;
      const res = await fetch(`/api/laporan/session?outletId=${activeOutlet}&date=${todayStr}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!activeOutlet,
  });

  // Re-fetch session data and products when activeOutlet changes
  useEffect(() => {
    if (activeOutlet) {
      refetchProds();
      refetchSession();
      setCart([]); // Clear cart when switching outlet
    }
  }, [activeOutlet]);

  // Handle Cart Operations
  const addToCart = (product: any) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        triggerAlert("error", `Stok tidak mencukupi. Maksimal: ${product.stock} pcs`);
        return;
      }
      setCart(
        cart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      if (product.stock <= 0) {
        triggerAlert("error", "Produk sedang kosong");
        return;
      }
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          sellingPrice: product.sellingPrice,
          quantity: 1,
          stock: product.stock,
        },
      ]);
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.id === productId) {
            const nextQty = item.quantity + delta;
            if (nextQty > item.stock) {
              triggerAlert("error", `Stok tidak mencukupi. Maksimal: ${item.stock} pcs`);
              return item;
            }
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const triggerAlert = (type: "success" | "error", text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Submit Transaction Mutation
  const transactionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Gagal menyimpan transaksi");
      }
      return res.json();
    },
    onSuccess: (data) => {
      triggerAlert("success", `Transaksi ${data.invoiceNumber} berhasil disimpan!`);
      setCart([]);
      setNotes("");
      // Refetch stocks
      queryClient.invalidateQueries({ queryKey: ["cashier-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: any) => {
      triggerAlert("error", error.message);
    },
  });

  const handleCheckout = () => {
    if (sessionData?.status !== "OPEN") {
      triggerAlert("error", "Laporan outlet hari ini belum dibuka atau sudah ditutup.");
      return;
    }
    if (cart.length === 0) {
      triggerAlert("error", "Keranjang masih kosong");
      return;
    }

    const payload = {
      outletId: activeOutlet,
      paymentMethod,
      notes: notes || null,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    };

    transactionMutation.mutate(payload);
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const total = subtotal;

  // Filter products by search and category
  const filteredProducts = products.filter((p: any) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "ALL" || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-88px)] relative select-none">
      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden bg-white border border-border-custom rounded-xl p-1 shrink-0">
        <button
          onClick={() => setActiveTab("menu")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
            activeTab === "menu"
              ? "bg-primary text-white shadow-sm"
              : "text-gray-500 hover:text-text-custom"
          }`}
        >
          Menu
        </button>
        <button
          onClick={() => setActiveTab("cart")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
            activeTab === "cart"
              ? "bg-primary text-white shadow-sm"
              : "text-gray-500 hover:text-text-custom"
          }`}
        >
          Keranjang {cart.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              activeTab === "cart" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
            }`}>{cart.length}</span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
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

      {/* Left Column: Product Selection */}
      <div className={`lg:col-span-2 flex flex-col gap-4 overflow-hidden h-full ${activeTab === "menu" ? "flex" : "hidden lg:flex"}`}>
        {/* Search & Scoped Outlet Picker */}
        <div className="bg-white p-4 rounded-xl border border-border-custom shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
          {/* Search bar */}
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari produk berdasarkan nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap w-full sm:w-auto justify-end">
            {/* Session Indicator & Close Button */}
            {sessionData && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Laporan:</span>
                {sessionData.status === "OPEN" ? (
                  <>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-extrabold rounded-lg border border-emerald-200">
                      BUKA
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm("Apakah Anda yakin ingin menutup laporan hari ini? Setelah ditutup, transaksi tidak dapat dicatat.")) return;
                        try {
                          const res = await fetch("/api/laporan/session", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              outletId: activeOutlet,
                              date: todayStr,
                              action: "CLOSE",
                            }),
                          });
                          if (res.ok) {
                            refetchSession();
                            triggerAlert("success", "Laporan hari ini berhasil ditutup!");
                          } else {
                            const err = await res.json();
                            triggerAlert("error", err.error || "Gagal menutup laporan");
                          }
                        } catch (e) {
                          triggerAlert("error", "Koneksi gagal");
                        }
                      }}
                      className="text-[10px] font-bold text-red-600 hover:text-red-800 underline transition-colors cursor-pointer"
                    >
                      Tutup
                    </button>
                  </>
                ) : (
                  <>
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-extrabold rounded-lg border border-red-200">
                      TUTUP
                    </span>
                    {(userRole === "OWNER" || userRole === "DEVELOPER") && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/laporan/session", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                outletId: activeOutlet,
                                date: todayStr,
                                action: "OPEN",
                              }),
                            });
                            if (res.ok) {
                              refetchSession();
                              triggerAlert("success", "Laporan harian berhasil dibuka kembali!");
                            } else {
                              const err = await res.json();
                              triggerAlert("error", err.error || "Gagal membuka laporan");
                            }
                          } catch (e) {
                            triggerAlert("error", "Koneksi gagal");
                          }
                        }}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 underline transition-colors cursor-pointer ml-1"
                      >
                        Buka
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Scoped Outlet dropdown */}
            {userRole !== "KASIR" && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-primary" /> Outlet:
                </span>
                <select
                  value={activeOutlet}
                  onChange={(e) => setActiveOutlet(e.target.value)}
                  className="px-3 py-1.5 bg-bg-custom border border-border-custom text-xs font-bold rounded-xl focus:outline-none focus:border-primary/50 text-text-custom"
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
        </div>

        {/* Warning Banners */}
        {sessionData && sessionData.status !== "OPEN" && (
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 no-print ${
            sessionData.status === "CLOSED"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            <div className="flex items-center gap-3">
              <AlertCircle className={`w-5 h-5 shrink-0 ${sessionData.status === "CLOSED" ? "text-red-600" : "text-amber-600"}`} />
              <div className="text-left">
                <p className="text-xs font-bold">
                  {sessionData.status === "CLOSED"
                    ? "Laporan Outlet Hari Ini Sudah Ditutup"
                    : "Laporan Outlet Hari Ini Belum Dibuka"}
                </p>
                <p className="text-[10px] opacity-80 mt-0.5">
                  {sessionData.status === "CLOSED"
                    ? "Transaksi tidak dapat disimpan karena laporan hari ini sudah diakhiri."
                    : "Silakan buka laporan terlebih dahulu sebelum mencatat transaksi."}
                </p>
              </div>
            </div>
            {(sessionData.status !== "CLOSED" || userRole === "OWNER" || userRole === "DEVELOPER") && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/laporan/session", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        outletId: activeOutlet,
                        date: todayStr,
                        action: "OPEN",
                      }),
                    });
                    if (res.ok) {
                      refetchSession();
                      triggerAlert("success", "Laporan harian berhasil dibuka!");
                    } else {
                      const err = await res.json();
                      triggerAlert("error", err.error || "Gagal membuka laporan");
                    }
                  } catch (e) {
                    triggerAlert("error", "Koneksi gagal");
                  }
                }}
                className="px-4 py-2 text-white font-extrabold text-xs rounded-xl shadow-sm cursor-pointer transition-all active:scale-95 shrink-0 bg-amber-600 hover:bg-amber-700"
              >
                {sessionData.status === "CLOSED" ? "Buka Kembali Laporan Hari Ini" : "Buka Laporan Hari Ini"}
              </button>
            )}
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all duration-200 shrink-0 cursor-pointer ${
              selectedCategory === "ALL"
                ? "bg-primary text-white shadow-sm shadow-primary/20"
                : "bg-white border border-border-custom text-gray-500 hover:bg-gray-50"
            }`}
          >
            Semua Menu
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all duration-200 shrink-0 cursor-pointer ${
                selectedCategory === c.id
                  ? "bg-primary text-white shadow-sm shadow-primary/20"
                  : "bg-white border border-border-custom text-gray-500 hover:bg-gray-50"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto pr-1 pb-4">
          {isLoadingProds ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs">Memuat katalog menu...</span>
            </div>
          ) : isErrorProds ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-[#E84E4E] bg-white rounded-xl border border-border-custom px-4">
              <AlertCircle className="w-8 h-8 animate-bounce text-primary" />
              <span className="text-xs font-extrabold">Gagal memuat katalog menu</span>
              <span className="text-[10px] text-gray-400 leading-normal max-w-xs text-center">
                {(errorProds as any)?.message || "Terjadi kesalahan koneksi database."}
              </span>
              <span className="text-[10px] text-gray-500 font-bold bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-1.5 mt-1">
                Pastikan terminal database (`npx prisma dev`) sudah berjalan.
              </span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-24 text-xs text-gray-400 bg-white rounded-xl border border-border-custom">
              Tidak ada produk yang cocok
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {filteredProducts.map((p: any) => {
                const isOutOfStock = p.stock <= 0;
                const inCartItem = cart.find((item) => item.id === p.id);

                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && addToCart(p)}
                    className={`bg-white rounded-xl border px-3.5 py-3 flex items-center justify-between shadow-sm relative overflow-hidden transition-all duration-200 group cursor-pointer select-none ${
                      isOutOfStock
                        ? "border-gray-200 opacity-60 cursor-not-allowed bg-gray-50"
                        : "border-border-custom hover:border-primary/40 hover:shadow-md"
                    }`}
                  >
                    {/* Left: Product Name & Price */}
                    <div className="flex flex-col gap-1 min-w-0 pr-4">
                      <h4 className="font-bold text-xs text-text-custom leading-tight truncate">
                        {p.name}
                      </h4>
                      <span className="font-extrabold text-xs text-primary">
                        {formatRupiah(p.sellingPrice)}
                      </span>
                    </div>

                    {/* Right: Stock info and cart count indicator */}
                    <div className="flex items-center gap-3.5 shrink-0">
                      {/* Stock badge */}
                      <div>
                        {isOutOfStock ? (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-bold rounded">
                            Habis
                          </span>
                        ) : p.stock <= 5 ? (
                          <span className="px-2 py-0.5 bg-accent/20 text-[#b3861b] text-[9px] font-bold rounded">
                            Limit: {p.stock}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-bold rounded">
                            Stok: {p.stock}
                          </span>
                        )}
                      </div>

                      {/* Quantity in cart badge */}
                      {inCartItem && (
                        <span className="w-5.5 h-5.5 bg-primary text-white font-bold rounded-full flex items-center justify-center text-[10px] shadow-sm shrink-0">
                          {inCartItem.quantity}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Checkout Cart Pane */}
      <div className={`bg-white border border-border-custom rounded-xl p-4 flex flex-col justify-between shadow-sm overflow-hidden h-full ${activeTab === "cart" ? "flex" : "hidden lg:flex"}`}>
        {/* Cart Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border-custom shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h3 className="font-extrabold text-sm text-text-custom">Keranjang Kasir</h3>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-[10px] text-gray-400 hover:text-primary font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Kosongkan
            </button>
          )}
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto my-3 pr-1">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-12">
              <ShoppingCart className="w-10 h-10 opacity-30 stroke-1" />
              <p className="text-xs font-semibold">Keranjang masih kosong</p>
              <p className="text-[10px] text-center text-gray-400 px-4 leading-normal mt-0.5">
                Silakan klik pada produk di sisi kiri untuk menambahkannya ke daftar belanja transaksi.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {cart.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-3 bg-bg-custom border border-border-custom rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-text-custom leading-tight truncate">
                        {item.name}
                      </h4>
                      {/* SKU removed */}
                      <p className="font-bold text-[11px] text-primary mt-1">
                        {formatRupiah(item.sellingPrice * item.quantity)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateCartQty(item.id, -1)}
                        className="w-6.5 h-6.5 rounded-lg border border-border-custom hover:border-primary/30 flex items-center justify-center text-text-custom hover:text-primary bg-white cursor-pointer active:scale-95 transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold text-text-custom">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQty(item.id, 1)}
                        className="w-6.5 h-6.5 rounded-lg border border-border-custom hover:border-primary/30 flex items-center justify-center text-text-custom hover:text-primary bg-white cursor-pointer active:scale-95 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="w-6.5 h-6.5 rounded-lg hover:bg-primary/10 flex items-center justify-center text-gray-400 hover:text-primary cursor-pointer transition-colors ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Checkout Forms (Footer Panel) */}
        <div className="border-t border-border-custom pt-4 shrink-0 flex flex-col gap-4">
          {/* Notes Input */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-primary" /> Catatan Transaksi (Opsional)
            </span>
            <input
              type="text"
              placeholder="Tambahkan catatan jika diperlukan..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="px-3 py-2 bg-bg-custom border border-border-custom rounded-xl text-xs focus:outline-none focus:border-primary/50 text-text-custom"
            />
          </div>

          {/* Payment Method Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-primary" /> Metode Pembayaran
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "CASH", label: "Cash", icon: Wallet },
                { key: "QRIS", label: "QRIS", icon: Smartphone },
                { key: "GRABFOOD", label: "GrabFood", icon: Truck },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.key;

                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPaymentMethod(m.key as any)}
                    className={`py-2 px-1 border rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/5 text-primary font-bold shadow-sm"
                        : "border-border-custom hover:bg-gray-50 text-gray-500 text-xs"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] leading-none">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtotal Display */}
          <div className="flex flex-col gap-1.5 p-3.5 bg-bg-custom border border-border-custom rounded-xl">
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Subtotal</span>
              <span className="font-semibold">{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Pajak (0%)</span>
              <span className="font-semibold">Rp 0</span>
            </div>
            <div className="flex justify-between items-center border-t border-dashed border-gray-300 pt-2 text-xs font-bold text-text-custom">
              <span>Total Pembayaran</span>
              <span className="text-primary text-sm font-extrabold">{formatRupiah(total)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || transactionMutation.isPending || sessionData?.status !== "OPEN"}
            className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {transactionMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan Transaksi...</span>
              </>
            ) : sessionData?.status !== "OPEN" ? (
              <>
                <AlertCircle className="w-4 h-4" />
                <span>Laporan Belum Dibuka / Sudah Ditutup</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Transaksi</span>
              </>
            )}
          </button>
        </div>
      </div>
      </div>

      {/* Floating Checkout Button on Mobile */}
      {activeTab === "menu" && cart.length > 0 && (
        <button
          onClick={() => setActiveTab("cart")}
          className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-white px-6 py-3 rounded-full font-bold text-xs shadow-xl flex items-center gap-2.5 z-40 border border-white/25 hover:scale-105 active:scale-95 transition-all"
        >
          <ShoppingCart className="w-4.5 h-4.5" />
          <span>Lihat Keranjang ({cart.length} item) — {formatRupiah(total)}</span>
        </button>
      )}
    </div>
  );
}
