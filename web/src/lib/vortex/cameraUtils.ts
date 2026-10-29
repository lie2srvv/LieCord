/**
 * Camera enumeration, classification and mobile front/back detection utilities
 */

export interface CameraDevice {
    deviceId: string;
    label: string;
    facingMode?: "user" | "environment";
}

export function isMobileOrTouchDevice(): boolean {
    if (typeof window === "undefined") return false;
    if (typeof navigator === "undefined") return false;
    return Boolean(
        (window as any).isLieCordApp ||
        (window as any).LieCordNative ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
    );
}

export async function getAvailableCameras(): Promise<CameraDevice[]> {
    const isMobile = isMobileOrTouchDevice();
    if (isMobile) {
        // Mobile devices strictly have front and back camera modes.
        // Selecting "user" or "environment" via getUserMedia facingMode is universally
        // supported across all Android versions, iOS Safari, and Chromium WebViews.
        return [
            { deviceId: "", label: "Передняя камера", facingMode: "user" },
            { deviceId: "", label: "Задняя камера", facingMode: "environment" },
        ];
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
        return [];
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");

        if (videoDevices.length === 0) {
            return [];
        }

        return videoDevices.map((dev, idx) => ({
            deviceId: dev.deviceId,
            label: dev.label || `Веб-камера ${idx + 1}`,
            facingMode: undefined,
        }));
    } catch (e) {
        console.warn("[cameraUtils] Error enumerating cameras:", e);
        return [];
    }
}
