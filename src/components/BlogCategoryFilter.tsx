"use client";

import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "DUI", value: "dui" },
  { label: "Drug Cases", value: "drug-cases" },
  { label: "White Collar", value: "white-collar" },
  { label: "General Defense", value: "general-defense" },
];

export function BlogCategoryFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("category") || "";

  const handleFilter = (value: string) => {
    if (value) {
      router.push(`/blog?category=${value}`, { scroll: false });
    } else {
      router.push("/blog", { scroll: false });
    }
  };

  return (
    <div className="mt-8 flex flex-wrap gap-2">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          onClick={() => handleFilter(cat.value)}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            current === cat.value
              ? "bg-amber-500 text-black"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
