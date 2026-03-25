"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_DISMISS_CHROMIUM = "bp:pwa-install-dismissed";
const STORAGE_DISMISS_IOS = "bp:pwa-ios-install-hint-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true
  )
    return true;
  return false;
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const isOtherIOSBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo/i.test(ua);
  return !isOtherIOSBrowser;
}

export function PwaInstallBanners() {
  const [mounted, setMounted] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissedChromium, setDismissedChromium] = useState(false);
  const [dismissedIos, setDismissedIos] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstalled(isStandalone());
    setMobile(isMobileViewport());
    setDismissedChromium(
      localStorage.getItem(STORAGE_DISMISS_CHROMIUM) === "1",
    );
    setDismissedIos(localStorage.getItem(STORAGE_DISMISS_IOS) === "1");
    setIosDevice(isIosSafari());

    const onResize = () => setMobile(isMobileViewport());
    window.addEventListener("resize", onResize);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismissChromium = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_DISMISS_CHROMIUM, "1");
    } catch {
      /* ignore */
    }
    setDismissedChromium(true);
    setDeferred(null);
  }, []);

  const dismissIos = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_DISMISS_IOS, "1");
    } catch {
      /* ignore */
    }
    setDismissedIos(true);
  }, []);

  const onAddToHome = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === "accepted") {
        setInstalled(true);
      }
    } catch {
      setDeferred(null);
    }
  }, [deferred]);

  if (!mounted) return null;
  if (!mobile || installed) return null;

  const showChromiumBanner =
    !dismissedChromium && deferred != null && !iosDevice;
  const showIosBanner = iosDevice && !dismissedIos;

  if (!showChromiumBanner && !showIosBanner) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showChromiumBanner ? (
        <div
          className="pointer-events-auto mx-auto flex w-full max-w-lg flex-col gap-2 rounded-xl border border-[#E8C84A]/40 bg-[#0a1628]/95 px-3 py-3 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
          role="region"
          aria-label="Install app"
        >
          <p className="text-left text-xs leading-snug text-white/90 sm:flex-1">
            📱 Add Blueprint AI to your home screen for the best experience
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onAddToHome()}
              className="btn-primary min-h-0 rounded-lg px-3 py-2 text-xs"
            >
              Add to Home Screen
            </button>
            <button
              type="button"
              onClick={dismissChromium}
              className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {showIosBanner ? (
        <div
          className="pointer-events-auto mx-auto w-full max-w-lg rounded-lg border border-white/15 bg-[#071422]/95 px-3 py-2 text-center text-[11px] leading-snug text-white/70 shadow-md backdrop-blur-sm"
          role="status"
        >
          <p>
            To install: tap <strong className="text-[#E8C84A]">Share</strong> →{" "}
            <strong className="text-[#E8C84A]">Add to Home Screen</strong>
          </p>
          <button
            type="button"
            onClick={dismissIos}
            className="mt-1.5 text-[10px] font-medium text-white/45 underline hover:text-white/70"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
