import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { Notification, app, ipcMain, nativeImage } from "electron";
import { mainWindow } from "./window";
import iconAsset from "../../assets/desktop/icon.png?asset";

interface ShowNotificationPayload {
  title: string;
  body: string;
  iconUrl?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  silent?: boolean;
}

interface IncomingCallPayload {
  channelId: string;
  callerId: string;
  callerName: string;
  avatarUrl?: string | null;
}

const activeNotifications: Map<string, Notification> = new Map();
let currentIncomingCallNotification: Notification | null = null;
let currentCallChannelId: string | null = null;
let flashInterval: NodeJS.Timeout | null = null;

// Ensure temporary cache directory for downloaded notification avatars
const avatarCacheDir = path.join(os.tmpdir(), "liecord-avatars");
try {
  fs.mkdirSync(avatarCacheDir, { recursive: true });
} catch (e) {
  console.error("Failed to create avatarCacheDir:", e);
}

/**
 * Download remote avatar into a local temp file so that Linux D-Bus notification daemons
 * (dunst, mako, swaync, hyprland, gnome, kde) can display it reliably.
 */
async function getOrFetchAvatarLocalPath(url?: string | null): Promise<string | null> {
  if (!url || !url.startsWith("http")) return null;

  try {
    const hash = crypto.createHash("md5").update(url).digest("hex");
    const localFile = path.join(avatarCacheDir, `${hash}.png`);

    if (fs.existsSync(localFile)) {
      return localFile;
    }

    return await new Promise<string | null>((resolve) => {
      const client = url.startsWith("https") ? https : http;
      const req = client.get(url, { timeout: 4000 }, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const fileStream = fs.createWriteStream(localFile);
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve(localFile);
        });
        fileStream.on("error", () => {
          resolve(null);
        });
      });

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    });
  } catch (err) {
    console.error("Error fetching notification avatar:", err);
    return null;
  }
}

/**
 * Focus and restore the application window safely across Windows, Linux (X11 & Wayland), and macOS
 */
export function restoreAndFocusWindow() {
  if (!mainWindow) return;

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();

  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }

  // Stop flashing taskbar once user focuses the window
  stopFlash();
}

function startFlash() {
  if (!mainWindow) return;
  mainWindow.flashFrame(true);
  if (process.platform === "darwin") {
    app.dock.bounce("critical");
  }
}

function stopFlash() {
  if (!mainWindow) return;
  mainWindow.flashFrame(false);
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
}

export function initNotifications() {
  // Sync Windows AppUserModelId with Squirrel and direct executable names
  if (process.platform === "win32") {
    try {
      app.setAppUserModelId("com.squirrel.LieCord.liecord-desktop");
    } catch (e) {
      console.error("Failed to set appUserModelId:", e);
    }
  }

  // IPC Handler: Standard Message / Mention Notification
  ipcMain.on("showNotification", async (_event, payload: ShowNotificationPayload) => {
    if (!Notification.isSupported()) return;

    const { title, body, iconUrl, channelId, messageId, silent } = payload;
    let iconImage: any = null;

    if (iconUrl) {
      const localAvatarPath = await getOrFetchAvatarLocalPath(iconUrl);
      if (localAvatarPath && fs.existsSync(localAvatarPath)) {
        iconImage = nativeImage.createFromPath(localAvatarPath);
      }
    }

    if (!iconImage) {
      iconImage = nativeImage.createFromDataURL(iconAsset);
    }

    const notification = new Notification({
      title: title || "LieCord",
      body: body || "",
      icon: iconImage,
      silent: silent ?? true,
      urgency: "normal",
    });

    const notifKey = channelId || `notif_${Date.now()}`;
    const prevNotif = activeNotifications.get(notifKey);
    if (prevNotif) {
      prevNotif.close();
    }
    activeNotifications.set(notifKey, notification);

    notification.on("click", () => {
      restoreAndFocusWindow();
      if (channelId && mainWindow?.webContents) {
        mainWindow.webContents.send("notificationClicked", { channelId, messageId });
      }
    });

    notification.on("close", () => {
      activeNotifications.delete(notifKey);
    });

    notification.show();

    // Trigger visual hint if window is not focused
    if (mainWindow && !mainWindow.isFocused()) {
      startFlash();
    }
  });

  // IPC Handler: Incoming Call Notification with Actions
  ipcMain.on("showIncomingCall", async (_event, payload: IncomingCallPayload) => {
    if (!Notification.isSupported()) return;

    const { channelId, callerName, avatarUrl } = payload;
    currentCallChannelId = channelId;

    let iconImage: any = null;
    if (avatarUrl) {
      const localAvatarPath = await getOrFetchAvatarLocalPath(avatarUrl);
      if (localAvatarPath && fs.existsSync(localAvatarPath)) {
        iconImage = nativeImage.createFromPath(localAvatarPath);
      }
    }
    if (!iconImage) {
      iconImage = nativeImage.createFromDataURL(iconAsset);
    }

    // Dismiss existing incoming call notification if any
    if (currentIncomingCallNotification) {
      currentIncomingCallNotification.close();
      currentIncomingCallNotification = null;
    }

    const notification = new Notification({
      title: "Входящий вызов LieCord",
      body: `${callerName} вызывает вас...`,
      icon: iconImage,
      silent: true, // Ringtone is already played by Web Audio
      urgency: "critical",
      actions: [
        { type: "button", text: "Ответить" },
        { type: "button", text: "Отклонить" },
      ],
    });

    currentIncomingCallNotification = notification;

    notification.on("click", () => {
      restoreAndFocusWindow();
      if (mainWindow?.webContents) {
        mainWindow.webContents.send("incomingCallClicked", { channelId, action: "open" });
      }
    });

    notification.on("action", (_event, actionIndex) => {
      restoreAndFocusWindow();
      if (mainWindow?.webContents) {
        if (actionIndex === 0) {
          mainWindow.webContents.send("incomingCallClicked", { channelId, action: "accept" });
        } else {
          mainWindow.webContents.send("incomingCallClicked", { channelId, action: "decline" });
        }
      }
      notification.close();
    });

    notification.on("close", () => {
      if (currentIncomingCallNotification === notification) {
        currentIncomingCallNotification = null;
      }
    });

    notification.show();

    // Flash window continuously for incoming call until answered or dismissed
    startFlash();
  });

  // IPC Handler: Dismiss Incoming Call Notification
  ipcMain.on("dismissIncomingCall", (_event, channelId?: string | null) => {
    if (!channelId || currentCallChannelId === channelId) {
      if (currentIncomingCallNotification) {
        currentIncomingCallNotification.close();
        currentIncomingCallNotification = null;
      }
      currentCallChannelId = null;
      stopFlash();
    }
  });

  // IPC Handler: Focus App
  ipcMain.on("focusApp", () => {
    restoreAndFocusWindow();
  });
}
