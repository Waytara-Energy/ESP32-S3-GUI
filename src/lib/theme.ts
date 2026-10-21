// Light, dark or follow the device, like the dashboard. The choice is kept in this browser; the page works without storage.

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "wt-theme";

export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readTheme(storage: Pick<Storage, "getItem"> | null = safeStorage()): ThemeChoice {
  try {
    const v = storage?.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function isDark(choice: ThemeChoice, prefersDark: boolean): boolean {
  return choice === "dark" || (choice === "system" && prefersDark);
}

export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): void {
  const prefersDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", isDark(choice, prefersDark));
}

export function saveTheme(choice: ThemeChoice, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (choice === "system") storage?.removeItem(KEY);
    else storage?.setItem(KEY, choice);
  } catch {
    /* not kept */
  }
}
