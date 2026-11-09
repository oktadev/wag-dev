"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const subscribe = () => () => {};

/** Light / system / dark. Renders after mount so the server and first client render agree. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <ToggleGroup
      value={mounted && theme ? [theme] : []}
      onValueChange={(v) => v[0] && setTheme(v[0])}
      variant="outline"
      size="sm"
      aria-label="Theme"
    >
      <ToggleGroupItem value="light" aria-label="Light mode"><SunIcon /></ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="Match system"><MonitorIcon /></ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark mode"><MoonIcon /></ToggleGroupItem>
    </ToggleGroup>
  );
}
