import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Install App" button that appears only when the browser supports PWA install
 * (Chrome/Edge/Samsung Internet on Android, etc.) and the app isn't already installed.
 * On iOS Safari (no install prompt API) we show a hint to use "Add to Home Screen".
 */
export function InstallButton({ className = "" }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Detect "already installed" (display-mode standalone)
    if (window.matchMedia?.("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    // iOS Safari has no beforeinstallprompt — show A2HS hint.
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isIOS) setIosHint(true);

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else if (iosHint) {
      alert(
        "To install ExamPrep:\n\n1. Tap the Share button in Safari\n2. Scroll down and tap \"Add to Home Screen\"\n3. Tap \"Add\""
      );
    }
  }

  if (!deferred && !iosHint) return null;

  return (
    <Button
      onClick={install}
      variant="outline"
      size="default"
      className={`gap-2 ${className}`}
      data-testid="button-install-app"
    >
      <Download className="w-4 h-4" /> Install App
    </Button>
  );
}
