"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Bell, Calendar, LogOut, User, AlertTriangle, ChevronDown } from "lucide-react";
import { formatDayDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState<any[]>([]);

  const user = session?.user as any;
  const userName = user?.name || "User";
  const userRole = user?.role || "KASIR";
  const activeOutletId = user?.activeOutletId;

  // Format active path to page title
  const getPageTitle = () => {
    if (pathname.startsWith("/dashboard")) return "Dashboard";
    if (pathname.startsWith("/kasir")) return "Kasir";
    if (pathname.startsWith("/pengeluaran")) return "Pengeluaran";
    if (pathname.startsWith("/produk")) return "Produk";
    if (pathname.startsWith("/stok-opname")) return "Perlengkapan";
    if (pathname.startsWith("/stok")) return "Stok Produk";
    if (pathname.startsWith("/keuangan")) return "Keuangan";
    if (pathname.startsWith("/laporan")) return "Laporan";
    if (pathname.startsWith("/user-management")) return "Management User";
    if (pathname.startsWith("/outlet")) return "Management Outlet";
    if (pathname.startsWith("/pengaturan")) return "Pengaturan";
    return "Cipak Jederrr POS";
  };

  // Fetch low stock alerts dynamically from active outlet
  useEffect(() => {
    if (!activeOutletId) return;
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/stok/alerts?outletId=${activeOutletId}`);
        if (res.ok) {
          const data = await res.json();
          setLowStockAlerts(data);
        }
      } catch (error) {
        console.error("Failed to fetch stock alerts:", error);
      }
    };
    fetchAlerts();
    // Refresh alerts every 30s
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [activeOutletId]);

  return (
    <header className="h-16 bg-white border-b border-border-custom px-4 md:px-6 flex items-center justify-between shrink-0 relative z-30 no-print">
      {/* Page Title & Hamburger Trigger */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="p-2 -ml-1.5 hover:bg-bg-custom border border-transparent hover:border-border-custom rounded-xl lg:hidden text-text-custom transition-all"
          >
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <h2 className="font-bold text-sm md:text-lg text-text-custom leading-none">{getPageTitle()}</h2>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2.5 md:gap-4">
        {/* Date Display */}
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-bg-custom border border-border-custom rounded-xl text-xs font-semibold text-text-custom shadow-sm">
          <Calendar className="w-4 h-4 text-primary" />
          <span>{formatDayDate(new Date())}</span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => {
              setIsNotifOpen(!isNotifOpen);
              setIsProfileOpen(false);
            }}
            className="p-2.5 bg-bg-custom border border-border-custom hover:border-primary/30 text-text-custom rounded-xl transition-all duration-200 relative cursor-pointer"
          >
            <Bell className="w-4.5 h-4.5 text-primary" />
            {lowStockAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                {lowStockAlerts.length}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          <AnimatePresence>
            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-border-custom rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="p-4 border-b border-border-custom flex justify-between items-center bg-primary/5">
                  <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Notifikasi Stok</h4>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {lowStockAlerts.length} Peringatan
                  </span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {lowStockAlerts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">Tidak ada stok yang menipis</div>
                  ) : (
                    lowStockAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-3.5 border-b border-border-custom last:border-none flex gap-3 hover:bg-bg-custom transition-colors"
                      >
                        <AlertTriangle className="w-5 h-5 text-[#F5C14E] shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-bold text-text-custom">{alert.product.name}</h5>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Stok tinggal: <span className="font-semibold text-primary">{alert.quantity} porsi</span> (Min. {alert.minStock})
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotifOpen(false);
            }}
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-bg-custom rounded-xl transition-all duration-200 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden md:block">
              <h4 className="text-xs font-bold text-text-custom leading-tight">{userName}</h4>
              <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider">
                {userRole.toLowerCase()}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-border-custom rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="p-3 border-b border-border-custom bg-bg-custom">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Akun Anda</p>
                  <p className="text-xs font-bold text-text-custom truncate mt-0.5">{userName}</p>
                  <p className="text-[9px] text-gray-500 truncate">@{user?.username || user?.email}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout-log", { method: "POST" });
                    } catch (err) {
                      console.error("Failed to log logout:", err);
                    }
                    signOut({ callbackUrl: "/login" });
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-primary font-semibold hover:bg-primary/5 transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Keluar Sistem</span>
                </button>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
