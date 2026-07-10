import React from "react";

export default function Logo({ className = "w-32 h-32" }: { className?: string }) {
  return (
    <div className={`relative transition-transform hover:scale-105 duration-300 ${className}`}>
      <img
        src="/logo.png"
        alt="Cipak Jederrr Logo"
        className="w-full h-full object-contain"
      />
    </div>
  );
}
