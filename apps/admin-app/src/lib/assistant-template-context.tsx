"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ASSISTANT_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getAssistantTemplate,
  type AssistantTemplate,
} from "@/lib/assistant-templates";

const STORAGE_KEY = "eva_admin_assistant_template";

type AssistantTemplateContextValue = {
  selectedTemplateId: string;
  selectedTemplate: AssistantTemplate;
  setSelectedTemplateId: (id: string) => void;
};

const AssistantTemplateContext = createContext<AssistantTemplateContextValue | null>(null);

export function AssistantTemplateProvider({ children }: { children: ReactNode }) {
  const [selectedTemplateId, setSelectedTemplateIdState] = useState(DEFAULT_TEMPLATE_ID);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && getAssistantTemplate(stored)) {
      setSelectedTemplateIdState(stored);
    }
  }, []);

  const setSelectedTemplateId = useCallback((id: string) => {
    if (!getAssistantTemplate(id)) {
      return;
    }

    setSelectedTemplateIdState(id);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const selectedTemplate = useMemo(() => {
    return getAssistantTemplate(selectedTemplateId) ?? ASSISTANT_TEMPLATES[0];
  }, [selectedTemplateId]);

  const value = useMemo(
    () => ({
      selectedTemplateId,
      selectedTemplate,
      setSelectedTemplateId,
    }),
    [selectedTemplateId, selectedTemplate, setSelectedTemplateId],
  );

  return (
    <AssistantTemplateContext.Provider value={value}>
      {children}
    </AssistantTemplateContext.Provider>
  );
}

export function useAssistantTemplate() {
  const context = useContext(AssistantTemplateContext);
  if (!context) {
    throw new Error("useAssistantTemplate must be used within AssistantTemplateProvider");
  }

  return context;
}
