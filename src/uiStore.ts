import { create } from "zustand";
import type { SearchQuery, SearchResult } from "@/types";

interface UiState {
  lastSearch: { query: SearchQuery; results: SearchResult[] } | null;
  setLastSearch: (query: SearchQuery, results: SearchResult[]) => void;
  clearLastSearch: () => void;
}

/** 临时 UI 状态：记录最近一次检索（供导出"仅检索结果"使用） */
export const useUiStore = create<UiState>((set) => ({
  lastSearch: null,
  setLastSearch: (query, results) => set({ lastSearch: { query, results } }),
  clearLastSearch: () => set({ lastSearch: null }),
}));
