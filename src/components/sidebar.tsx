"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Package,
  Boxes,
  ClipboardList,
  TrendingUp,
  FileBarChart2,
  Users,
  Settings,
  LogOut,
  MapPin,
  ChevronRight,
  X,
  Loader2,
  History,
  FileSpreadsheet,
} from "lucide-react";
import Logo from "./logo";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  href: string;
  icon: React.ComponentType<any>;
  roles: string[];
}

const MENU_ITEMS: MenuItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["DEVELOPER", "OWNER", "KOORLAP", "KASIR"] },
  { title: "Kasir", href: "/kasir", icon: ShoppingCart, roles: ["DEVELOPER", "OWNER", "KOORLAP", "KASIR"] },
  { title: "Riwayat Transaksi", href: "/riwayat-transaksi", icon: History, roles: ["DEVELOPER", "OWNER", "KOORLAP", "KASIR"] },
  { title: "Pengeluaran", href: "/pengeluaran", icon: ShoppingBag, roles: ["DEVELOPER", "OWNER", "KOORLAP", "KASIR"] },
  { title: "Produk", href: "/produk", icon: Package, roles: ["DEVELOPER", "OWNER"] },
  { title: "Stok Produk", href: "/stok", icon: Boxes, roles: ["DEVELOPER", "OWNER", "KOORLAP", "KASIR"] },
  { title: "Input Stok", href: "/input-stok", icon: FileSpreadsheet, roles: ["DEVELOPER", "OWNER"] },
  { title: "Perlengkapan", href: "/stok-opname", icon: ClipboardList, roles: ["DEVELOPER", "OWNER", "KOORLAP", "KASIR"] },
  { title: "Keuangan", href: "/keuangan", icon: TrendingUp, roles: ["DEVELOPER", "OWNER"] },
  { title: "Laporan", href: "/laporan", icon: FileBarChart2, roles: ["DEVELOPER", "OWNER", "KOORLAP"] },
  { title: "Management User", href: "/user-management", icon: Users, roles: ["DEVELOPER", "OWNER"] },
  { title: "Management Outlet", href: "/outlet", icon: MapPin, roles: ["DEVELOPER", "OWNER"] },
  { title: "Pengaturan", href: "/pengaturan", icon: Settings, roles: ["DEVELOPER"] },
];

export default function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, update } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allOutlets, setAllOutlets] = useState<any[]>([]);
  const [isLoadingOutlets, setIsLoadingOutlets] = useState(false);

  const user = session?.user as any;
  const userRole = user?.role || "KASIR";
  const userOutlets: any[] = user?.outlets || [];
  const activeOutletId = user?.activeOutletId;

  // Derive activeOutlet without storing it in state (prevents infinite loop)
  const activeOutlet = React.useMemo(() => {
    if (activeOutletId && userOutlets.length > 0) {
      const found = userOutlets.find((o: any) => o.id === activeOutletId);
      if (found) return found;
    }
    if (activeOutletId && allOutlets.length > 0) {
      const found = allOutlets.find((o: any) => o.id === activeOutletId);
      if (found) return found;
    }
    return userOutlets[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId, userOutlets.map((o: any) => o.id).join(","), allOutlets.map((o: any) => o.id).join(",")]);


  // Load all outlets for DEVELOPER and OWNER roles
  const loadAllOutlets = async () => {
    if (userRole !== "DEVELOPER" && userRole !== "OWNER") return;
    setIsLoadingOutlets(true);
    try {
      const res = await fetch("/api/outlets");
      if (res.ok) {
        const data = await res.json();
        setAllOutlets(data);
        // If developer/owner doesn't have an active outlet, default to the first one in the list
        if (!activeOutletId && data.length > 0) {
          await handleOutletChange(data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load outlets:", error);
    } finally {
      setIsLoadingOutlets(false);
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      loadAllOutlets();
    }
  }, [isModalOpen]);

  const handleOutletChange = async (outletId: string) => {
    await update({ activeOutletId: outletId });
    setIsModalOpen(false);
    // Refresh page to load fresh scoped data
    router.refresh();
  };

  const allowedMenuItems = MENU_ITEMS.filter((item) => item.roles.includes(userRole));

  const showGantiOutlet = userRole !== "KASIR"; // Kasir only has one outlet, locked.

  const sidebarContent = (
    <>
      {/* Top Section */}
      <div className="flex flex-col gap-6">
        {/* Logo and Brand */}
        <div className="flex justify-center py-2">
          <Logo className="w-28 h-28" />
        </div>

        {/* Menu Items */}
        <nav className="flex flex-col gap-1">
          {allowedMenuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} onClick={onClose}>
                <span
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
                    isActive
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "text-text-custom hover:bg-primary/5 hover:text-primary"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-transform duration-200 group-hover:scale-110",
                      isActive ? "text-white" : "text-gray-400 group-hover:text-primary"
                    )}
                  />
                  {item.title}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section - Active Outlet Info */}
      <div className="flex flex-col gap-3">
        {activeOutlet && (
          <div className="p-3 bg-bg-custom border border-border-custom rounded-xl flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-primary">
              <MapPin className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Outlet Aktif</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-text-custom leading-tight">{activeOutlet.name}</h4>
              <p className="text-[10px] text-gray-500 leading-normal mt-0.5 line-clamp-2">
                {activeOutlet.address || "Tidak ada alamat"}
              </p>
            </div>
            {showGantiOutlet && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full text-center py-1.5 border border-primary/20 hover:border-primary text-primary hover:bg-primary/5 bg-white text-xs font-semibold rounded-lg transition-colors mt-1"
              >
                Ganti Outlet
              </button>
            )}
          </div>
        )}

        <div className="text-[10px] text-gray-400 text-center mt-1">
          Versi 1.0.0
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (visible on large screens, hidden on mobile) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-border-custom h-screen flex-col justify-between p-4 shrink-0 no-print overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay (backdrop) */}
      <AnimatePresence>
        {isOpen && (
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden no-print"
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer (slide out from left) */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed inset-y-0 left-0 w-64 bg-white border-r border-border-custom h-screen flex flex-col justify-between p-4 z-50 shadow-2xl lg:hidden no-print overflow-y-auto"
          >
            {/* Mobile close button inside sidebar */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 hover:bg-bg-custom rounded-xl text-gray-400 hover:text-text-custom transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Modal - Outlet Picker */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md p-6 border border-border-custom shadow-xl relative"
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-base text-text-custom">Pilih Outlet</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-text-custom transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Outlet List */}
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {userRole === "DEVELOPER" || userRole === "OWNER" ? (
                  isLoadingOutlets ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-xs">Memuat daftar outlet...</span>
                    </div>
                  ) : allOutlets.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-500">Tidak ada outlet aktif</div>
                  ) : (
                    allOutlets.map((o) => {
                      const isCurrent = o.id === activeOutletId;
                      return (
                        <button
                          key={o.id}
                          onClick={() => handleOutletChange(o.id)}
                          className={cn(
                            "w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all duration-200",
                            isCurrent
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border-custom hover:border-primary/50 hover:bg-gray-50"
                          )}
                        >
                          <div>
                            <h4 className="font-bold text-sm">{o.name}</h4>
                            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{o.address}</p>
                          </div>
                          {isCurrent && <ChevronRight className="w-4 h-4" />}
                        </button>
                      );
                    })
                  )
                ) : (
                  // Koorlaps select from their userOutlets
                  userOutlets.map((uo: any) => {
                    const isCurrent = uo.id === activeOutletId;
                    return (
                      <button
                        key={uo.id}
                        onClick={() => handleOutletChange(uo.id)}
                        className={cn(
                          "w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all duration-200",
                          isCurrent
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border-custom hover:border-primary/50 hover:bg-gray-50"
                        )}
                      >
                        <div>
                          <h4 className="font-bold text-sm">{uo.name}</h4>
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{uo.address}</p>
                        </div>
                        {isCurrent && <ChevronRight className="w-4 h-4" />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
