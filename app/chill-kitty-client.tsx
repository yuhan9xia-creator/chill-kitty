"use client";

import { useEffect, useSyncExternalStore } from "react";
import ChillKittyApp from "../chill-kitty/App";

const subscribe = () => () => {};

export default function ChillKittyClient() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    const applyScale = () => {
      const designWidth = 393;
      const designHeight = 750;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scale = viewportWidth < 768
        ? viewportWidth / designWidth
        : viewportHeight / designHeight;
      const appHeight = viewportWidth < 768
        ? viewportHeight / scale
        : designHeight;

      document.documentElement.style.setProperty("--app-scale", String(scale));
      document.documentElement.style.setProperty("--app-h", `${appHeight}px`);
    };

    applyScale();
    window.addEventListener("resize", applyScale);
    return () => window.removeEventListener("resize", applyScale);
  }, []);

  if (!mounted) {
    return <main className="min-h-screen bg-[#F0EEE9]" aria-label="Loading Fridge Cat" />;
  }

  return <ChillKittyApp />;
}
