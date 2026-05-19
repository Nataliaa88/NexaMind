'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, Sparkles, UserCircle2 } from "lucide-react";

export default function Navbar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    router.push(`/dashboard?search=${encodeURIComponent(normalizedQuery)}`);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90 md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Tableau de bord
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
            Bienvenue chez NexaMind AI
          </h2>
        </div>

        <div />
      </div>
    </header>
  );
}
