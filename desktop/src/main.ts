import fs from "node:fs";
import path from "node:path";
import { IUpdateInfo, updateElectronApp } from "update-electron-app";

import { BrowserWindow, Notification, app, shell, systemPreferences } from "electron";
import started from "electron-squirrel-startup";

import { initAutoLaunch } from "./native/autoLaunch";
import { config } from "./native/config";
import { initDiscordRpc } from "./native/discordRpc";
import { initTray } from "./native/tray";
import { initVirtualMic } from "./native/virtualMic";
import { initNotifications } from "./native/notifications";
import { BUILD_URL, createMainWindow, mainWindow } from "./native/window";

// In Flatpak, we have to update the temp dir to a shared directory across host and sandbox;
// otherwise, the icon will not show up in the tray when using app indicators.
if (process.platform === "linux" && process.env.FLATPAK_ID) {
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (runtimeDir) {
    try {
      const sharedTmpDir = path.join(runtimeDir, "app", process.env.FLATPAK_ID);
      fs.mkdirSync(sharedTmpDir, { recursive: true });
      process.env.TMPDIR = sharedTmpDir;
    } catch (error) {
      console.error("Failed to set up host-visible TMPDIR:", error);
    }
  }
}

// Squirrel-specific logic
// create/remove shortcuts on Windows when installing / uninstalling
// we just need to close out of the app immediately
if (started) {
  app.quit();
}

// disable hw-accel if so requested
if (!config.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// ensure only one copy of the application can run
const acquiredLock = app.requestSingleInstanceLock();

const onNotifyUser = (_info: IUpdateInfo) => {
  const notification = new Notification({
    title: "Update Available",
    body: "Restart the app to install the update.",
    silent: true,
  });

  notification.show();
};

if (acquiredLock) {
  // start auto update logic
  // updateElectronApp disabled for self-hosted LieCord
  // updateElectronApp({ onNotifyUser });

  // create and configure the app when electron is ready
  app.on("ready", async () => {
    // On macOS, request microphone access BEFORE creating the window
    // This ensures the TCC permission dialog appears immediately on first launch
    if (process.platform === "darwin") {
      try {
        const micStatus = systemPreferences.getMediaAccessStatus("microphone");
        console.log(`[macOS] Microphone status on startup: ${micStatus}`);
        if (micStatus === "not-determined") {
          const granted = await systemPreferences.askForMediaAccess("microphone");
          console.log(`[macOS] Microphone permission prompt result: ${granted}`);
        } else if (micStatus === "denied") {
          console.warn("[macOS] Microphone access is denied. User must enable it in System Preferences > Privacy & Security > Microphone.");
        }
      } catch (err) {
        console.error("[macOS] Failed to request microphone access on startup:", err);
      }
    }

    // create window and application contexts
    createMainWindow();

    // save first launch state
    if (config.firstLaunch) {
      // Doesn't do anything right now. Used to enable auto start, but that behaviour was removed.
      // Left in case it gets used in the future.
      config.firstLaunch = false;
    }

    initTray();
    initDiscordRpc();
    initVirtualMic();
    initAutoLaunch();
    initNotifications();
  });

  // focus the window if we try to launch again
  app.on("second-instance", () => {
    mainWindow.show();
    mainWindow.restore();
    mainWindow.focus();
  });

  // macOS specific behaviour to keep app active in dock:
  // (irrespective of the minimise-to-tray option)

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ensure URLs launch in external context
  app.on("web-contents-created", (_, contents) => {
    // prevent navigation out of build URL origin
    contents.on("will-navigate", (event, navigationUrl) => {
      console.log(`[main.ts will-navigate]: ${navigationUrl} (expected origin: ${BUILD_URL.origin})`);
      try {
        if (new URL(navigationUrl).origin !== BUILD_URL.origin) {
          console.warn(`[main.ts will-navigate BLOCKED]: ${navigationUrl}`);
          event.preventDefault();
        }
      } catch (e) {
        console.error(`[main.ts will-navigate URL error]:`, e);
      }
    });

    // handle links externally with strict protocol and URL validation
    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
          setImmediate(() => {
            shell.openExternal(parsed.href);
          });
        } else {
          console.warn(`[main.ts setWindowOpenHandler BLOCKED untrusted protocol]: ${parsed.protocol}`);
        }
      } catch (err) {
        console.error(`[main.ts setWindowOpenHandler invalid URL]: ${url}`, err);
      }

      return { action: "deny" };
    });
  });
} else {
  app.quit();
}
