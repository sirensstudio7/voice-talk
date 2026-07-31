import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { keyToLabel, translationsEn } from "pptx-react-viewer/i18n";

/** Dedicated i18n instance for pptx-react-viewer (avoids clobbering the admin app). */
const pptxI18n = i18n.createInstance();

void pptxI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: {
      translation: translationsEn as Record<string, string>,
    },
  },
  // Keys are flat dotted strings like "pptx.statusBar.allSaved"
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: (key) => keyToLabel(key),
  react: { useSuspense: false },
});

export { pptxI18n };
