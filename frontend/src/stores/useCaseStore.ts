import { create } from "zustand";

interface PendingCase {
  prompt: string;
  file: File | null;
}

interface CaseStore {
  pending: PendingCase | null;
  setPending: (data: PendingCase) => void;
  clearPending: () => void;
}

export const useCaseStore = create<CaseStore>((set) => ({
  pending: null,
  setPending: (data) => set({ pending: data }),
  clearPending: () => set({ pending: null }),
}));
