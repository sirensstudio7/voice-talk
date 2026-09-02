import { create } from "zustand";

export interface SelectedTreatment {
  productId: string;
  name: string;
  durationMin?: number;
  price?: number;
}

interface UiStore {
  menuPanelOpen: boolean;
  checkoutPanelOpen: boolean;
  bookingPanelOpen: boolean;
  selectedTreatment: SelectedTreatment | null;

  setMenuPanelOpen: (open: boolean) => void;
  openMenuPanel: () => void;
  closeMenuPanel: () => void;
  
  setCheckoutPanelOpen: (open: boolean) => void;
  openCheckoutPanel: () => void;
  closeCheckoutPanel: () => void;

  setBookingPanelOpen: (open: boolean) => void;
  openBookingPanel: (treatment: SelectedTreatment) => void;
  closeBookingPanel: () => void;
  
  reset: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  menuPanelOpen: false,
  checkoutPanelOpen: false,
  bookingPanelOpen: false,
  selectedTreatment: null,

  setMenuPanelOpen: (open) => set({ menuPanelOpen: open }),
  openMenuPanel: () => set({ menuPanelOpen: true }),
  closeMenuPanel: () => set({ menuPanelOpen: false }),

  setCheckoutPanelOpen: (open) => set({ checkoutPanelOpen: open }),
  openCheckoutPanel: () => set({ checkoutPanelOpen: true }),
  closeCheckoutPanel: () => set({ checkoutPanelOpen: false }),

  setBookingPanelOpen: (open) => set({ bookingPanelOpen: open }),
  openBookingPanel: (treatment) =>
    set({
      selectedTreatment: treatment,
      bookingPanelOpen: true,
      menuPanelOpen: false,
    }),
  closeBookingPanel: () =>
    set({
      bookingPanelOpen: false,
      selectedTreatment: null,
    }),
    
  reset: () => set({
    menuPanelOpen: false,
    checkoutPanelOpen: false,
    bookingPanelOpen: false,
    selectedTreatment: null,
  })
}));
