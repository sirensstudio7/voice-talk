"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    function checkQuery() {
      setValue(window.matchMedia(query).matches);
    }

    checkQuery();

    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", checkQuery);
    window.addEventListener("resize", checkQuery);

    return () => {
      mediaQuery.removeEventListener("change", checkQuery);
      window.removeEventListener("resize", checkQuery);
    };
  }, [query]);

  return value;
}
