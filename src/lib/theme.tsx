import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

const THEME_MIGRATION = "cenops-theme-v1";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const saved = storage?.getItem("aegis-theme") as Theme | null;
    const migrated = storage?.getItem(THEME_MIGRATION);

    // The Cenops console is intentionally dark-first. Preserve an explicit
    // choice after this one-time visual migration, while existing sessions
    // move away from the old light console automatically.
    if (!migrated) {
      setTheme("dark");
      storage?.setItem("aegis-theme", "dark");
      storage?.setItem(THEME_MIGRATION, "1");
    } else if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("aegis-theme", theme);
  }, [theme, hydrated]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
