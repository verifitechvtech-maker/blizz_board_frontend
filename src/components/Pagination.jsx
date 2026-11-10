import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/* =========================================================
   Pagination for every list (same look everywhere)
   const page = usePagination(list, { id: "tasks", resetKey: search + filter });
   page.items.map(...)        ← only the rows of the current page
   <Pagination {...page} />   ← "Showing 11–20 of 57", page numbers, per-page size
   • the per-page size is remembered per list (this browser only)
   • a new search / filter (resetKey) goes back to page 1
========================================================= */

export const PAGE_SIZES = [10, 20, 50, 100];

const readSize = (id, fallback) => {
  try {
    const v = Number(localStorage.getItem(`pageSize:${id}`));
    return PAGE_SIZES.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export const usePagination = (list, { id = "list", pageSize: initial = 10, resetKey = "" } = {}) => {
  const all = Array.isArray(list) ? list : [];
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(() => readSize(id, initial));

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // new search / filter → first page
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // list got shorter (deleted / filtered) → stay on a page that exists
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const current = Math.min(page, totalPages);
  const items = useMemo(() => all.slice((current - 1) * pageSize, current * pageSize), [all, current, pageSize]);

  const setPageSize = (size) => {
    setSize(size);
    setPage(1);
    try {
      localStorage.setItem(`pageSize:${id}`, String(size));
    } catch {
      /* remembered for this visit only */
    }
  };

  return { items, page: current, setPage, pageSize, setPageSize, total, totalPages };
};

// 1 … 4 5 [6] 7 8 … 20
const pageList = (page, totalPages) => {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
};

export const Pagination = ({ page, setPage, pageSize, setPageSize, total, totalPages, label = "items", dark = false }) => {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (p) => {
    setPage(Math.min(totalPages, Math.max(1, p)));
  };

  return (
    <nav className={`pg ${dark ? "pg-dark" : ""}`} aria-label={`${label} pages`}>
      <style>{css}</style>
      <span className="pg-info">
        Showing <b>{from}–{to}</b> of <b>{total}</b> {label}
      </span>

      {totalPages > 1 && (
        <span className="pg-pages">
          <button type="button" className="pg-btn" onClick={() => go(1)} disabled={page === 1} aria-label="First page">
            <ChevronsLeft size={14} />
          </button>
          <button type="button" className="pg-btn" onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          {pageList(page, totalPages).map((p) =>
            typeof p === "string" ? (
              <span key={p} className="pg-gap" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`pg-btn pg-num ${p === page ? "on" : ""}`}
                onClick={() => go(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}
          <button type="button" className="pg-btn" onClick={() => go(page + 1)} disabled={page === totalPages} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
          <button type="button" className="pg-btn" onClick={() => go(totalPages)} disabled={page === totalPages} aria-label="Last page">
            <ChevronsRight size={14} />
          </button>
        </span>
      )}

      <label className="pg-size">
        <span>Per page</span>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </nav>
  );
};

const css = `
  .pg{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 14px;margin-top:16px;padding:10px 12px;
    border:1px solid #d5e7ee;border-radius:14px;background:rgba(255,255,255,.85);color:#16344d;font-size:12.5px}
  .pg-info{color:#6e8799}
  .pg-info b{color:#123b5d}
  .pg-pages{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
  .pg-btn{min-width:32px;height:32px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d5e7ee;
    border-radius:9px;background:#fff;color:#123b5d;font-weight:700;font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s}
  .pg-btn:hover:not(:disabled){border-color:#16a6b8;background:#e7f8fa}
  .pg-btn:disabled{opacity:.4;cursor:not-allowed}
  .pg-num.on{background:linear-gradient(135deg,#16a6b8,#08798c);border-color:transparent;color:#fff}
  .pg-btn:focus-visible,.pg-size select:focus-visible{outline:3px solid #7fe3ee;outline-offset:1px}
  .pg-gap{padding:0 4px;color:#6e8799}
  .pg-size{display:flex;align-items:center;gap:6px;color:#6e8799}
  .pg-size select{height:32px;border:1px solid #d5e7ee;border-radius:9px;background:#fff;color:#123b5d;font-weight:700;padding:0 6px;cursor:pointer}
  .pg-dark{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#e8f3f7}
  .pg-dark .pg-info,.pg-dark .pg-size{color:#9fb9c6}
  .pg-dark .pg-info b{color:#fff}
  .pg-dark .pg-btn,.pg-dark .pg-size select{background:#12304a;border-color:rgba(255,255,255,.15);color:#e8f3f7}
  @media (max-width:640px){.pg{justify-content:center}.pg-info{width:100%;text-align:center}}
`;
