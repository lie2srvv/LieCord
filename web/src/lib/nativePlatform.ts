import { isTouchscreenDevice } from "./isTouchscreenDevice";

/**
 * Helpers for native desktop platform detection and window behavior
 */

export function isMobileOrTablet(): boolean {
    if (typeof window === "undefined") return false;
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    if (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(
            ua
        )
    ) {
        return true;
    }
    // iOS iPad reporting as Macintosh Safari
    if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) {
        return true;
    }
    return isTouchscreenDevice;
}

export const isMac =
    typeof navigator !== "undefined" &&
    !isMobileOrTablet() &&
    (/Macintosh|MacIntel|MacPPC|Mac68K|Mac OS X/i.test(navigator.userAgent) ||
        (navigator.platform && navigator.platform.toLowerCase().includes("mac")));

export function getIsDesktop(): boolean {
    if (typeof window === "undefined") return false;
    if (isMobileOrTablet()) return false;
    return Boolean(
        (window as any).isNative ||
        (window as any).native ||
        (window as any).desktopConfig ||
        (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent))
    );
}

export const isDesktop = typeof window !== "undefined" && getIsDesktop();

export function shouldShowTitlebar(): boolean {
    if (isMobileOrTablet()) return false;
    if (!getIsDesktop()) return false;
    if (isMac) return true;
    const cfg =
        (window as any).native?.getConfig?.() ||
        (window as any).desktopConfig?.get?.() ||
        {};
    // On Windows/Linux: show titlebar unless customFrame was explicitly disabled
    if (cfg?.customFrame === false || cfg?.frame === true) {
        return false;
    }
    return true;
}
