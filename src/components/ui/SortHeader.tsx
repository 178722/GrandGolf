"use client";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

/** 見出しクリックで 昇順 → 降順 → 解除（既定の並び） と切り替える */
export function nextSort<K extends string>(
  cur: SortState<K>,
  key: K,
): SortState<K> {
  if (!cur || cur.key !== key) return { key, dir: "asc" };
  if (cur.dir === "asc") return { key, dir: "desc" };
  return null;
}

/** 並べ替え可能な表の見出しセル */
export function SortHeader<K extends string>({
  sortKey,
  label,
  sort,
  onSort,
  className = "px-4 py-2 font-medium",
}: {
  sortKey: K;
  label: string;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : null;
  return (
    <th
      className={className}
      aria-sort={
        dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"
      }
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-gray-900"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span
          aria-hidden
          className={active ? "text-green-700" : "text-gray-300"}
        >
          {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "⇅"}
        </span>
      </button>
    </th>
  );
}
