import { exec, execSync } from "child_process";
import {
  app,
  BrowserWindow,
  dialog,
  shell,
  nativeTheme,
  nativeImage,
  ipcMain,
  session,
  desktopCapturer,
  systemPreferences,
} from "electron";
import { autoUpdater } from "electron-updater";
import { release } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { inspect } from "util";
import log from "electron-log";

import { ConfigurationStore } from "./store";
import { getAssetPath } from "./util";

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let pendingScreenSource: any = null;
let pendingScreenAudio: boolean = false;

export async function createWindow(store: ConfigurationStore) {
  let win: BrowserWindow | null = null;
  const isDev = process.env.NODE_ENV === "development";

  // Register push notifications
  // registerPushNotifications();

  // Create native browser window
  const minWidth = 400;
  const minHeight = 400;

  let bounds = store.get("bounds");
  if (
    bounds &&
    (bounds.width < minWidth ||
      bounds.height < minHeight ||
      typeof bounds.x !== "number" ||
      typeof bounds.y !== "number")
  ) {
    bounds = undefined;
  }

  const defaultTheme = store.get("theme");

  const appIcon = nativeImage.createFromPath(getAssetPath("icon.png"));

  win = new BrowserWindow({
    title: "LieCord",
    ...(bounds ? bounds : { width: 1280, height: 720 }),
    minWidth,
    minHeight,
    show: false,
    frame: false,
    icon: appIcon,
    backgroundColor: defaultTheme === "light" ? "#f6f6f6" : "#191919",
    webPreferences: {
      webSecurity: false,
      preload: join(__dirname, "../preload/preload.js"),
    },
  });

  if (process.platform === "darwin") {
    app.dock.setIcon(appIcon);
  }

  // Handle updates
  log.transports.file.level = "debug";
  autoUpdater.logger = log;

  autoUpdater.on("update-available", () => {
    win?.webContents.send("updater", "available");
  });

  autoUpdater.on("update-downloaded", () => {
    win?.webContents.send("updater", "downloaded");
  });

  autoUpdater.on("error", (err) => {
    win?.webContents.send("updater", "error", err);
  });

  ipcMain.on("check-updates", () => {
    if (!isDev) {
      autoUpdater.checkForUpdates();
    }
  });

  ipcMain.on("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  // Track window bounds
  function saveBounds() {
    if (!win) return;
    store.set("bounds", win.getNormalBounds());
  }

  win.on("resized", saveBounds);
  win.on("moved", saveBounds);

  // Set window listeners
  win.on("maximize", () => win?.webContents.send("maximize", true));
  win.on("unmaximize", () => win?.webContents.send("maximize", false));

  win.on("enter-full-screen", () => win?.webContents.send("enter-html-full-screen"));
  win.on("leave-full-screen", () => win?.webContents.send("leave-html-full-screen"));

  nativeTheme.on("updated", () => {
    win?.webContents.send(
      "native-theme",
      nativeTheme.shouldUseDarkColors ? "dark" : "light"
    );
  });

  // Open external links in browser
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // Allow webContents to show dialogs
  ipcMain.handle(
    "dialog",
    (
      _,
      type: "open" | "save" | "message",
      options: any
    ) => {
      if (!win) return;
      switch (type) {
        case "open":
          return dialog.showOpenDialog(win, options);
        case "save":
          return dialog.showSaveDialog(win, options);
        case "message":
          return dialog.showMessageBox(win, options);
      }
    }
  );

  ipcMain.on("badge", (_, count) => {
    app.setBadgeCount(count);
  });

  ipcMain.on("fullscreen", (_, state) => {
    win?.setFullScreen(state);
  });

  ipcMain.on("devtools", () => {
    win?.webContents.openDevTools();
  });

  ipcMain.on("theme", (_, theme) => {
    win?.setBackgroundColor(theme === "light" ? "#f6f6f6" : "#191919");
  });

  ipcMain.on("open-external", (_, url) => {
    shell.openExternal(url);
  });

  ipcMain.on("window-close", () => {
    win?.close();
  });

  ipcMain.on("window-minimize", () => {
    win?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle("get-window-state", () => {
    return {
      isMaximized: win?.isMaximized() ?? false,
      isFullscreen: win?.isFullScreen() ?? false,
    };
  });

  ipcMain.handle("get-zoom-factor", () => {
    return win?.webContents.getZoomFactor() ?? 1;
  });

  ipcMain.on("set-zoom-factor", (_, factor) => {
    win?.webContents.setZoomFactor(factor);
  });

  ipcMain.handle("get-autostart-status", () => {
    if (process.platform === "win32" || process.platform === "darwin") {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    }
    return false;
  });

  ipcMain.handle("set-autostart", (_, enable: boolean) => {
    if (process.platform === "win32" || process.platform === "darwin") {
      app.setLoginItemSettings({
        openAtLogin: enable,
        openAsHidden: false,
      });
      return true;
    }
    return false;
  });

  ipcMain.handle("getScreenSources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 360, height: 200 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith("screen"),
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : undefined,
    }));
  });

  ipcMain.handle(
    "selectScreenSource",
    async (_, sourceId: string, audio?: boolean) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });
      pendingScreenSource = sources.find((s) => s.id === sourceId) || null;
      pendingScreenAudio = Boolean(audio);
      return !!pendingScreenSource;
    },
  );

  let linuxAudioModuleId: string | null = null;

  ipcMain.handle("startLinuxScreenAudio", async () => {
    if (process.platform !== "linux") return false;
    return new Promise((resolve) => {
      if (linuxAudioModuleId) {
        try {
          execSync(`pactl unload-module ${linuxAudioModuleId}`);
        } catch (_) {}
        linuxAudioModuleId = null;
      }
      exec(
        "pactl load-module module-remap-source master=@DEFAULT_SINK@.monitor source_name=liecord_stream_audio source_properties=device.description=LieCord_Stream_Audio",
        (err, stdout) => {
          if (err || !stdout.trim()) {
            console.warn("[Linux Audio] pactl load-module failed:", err);
            resolve(false);
          } else {
            linuxAudioModuleId = stdout.trim();
            console.info("[Linux Audio] Loaded stream audio module:", linuxAudioModuleId);
            resolve(true);
          }
        }
      );
    });
  });

  ipcMain.handle("stopLinuxScreenAudio", async () => {
    if (linuxAudioModuleId) {
      try {
        execSync(`pactl unload-module ${linuxAudioModuleId}`);
      } catch (_) {}
      linuxAudioModuleId = null;
    }
    return true;
  });

  app.on("before-quit", () => {
    if (linuxAudioModuleId) {
      try {
        execSync(`pactl unload-module ${linuxAudioModuleId}`);
      } catch (_) {}
      linuxAudioModuleId = null;
    }
  });

  ipcMain.handle("requestMicrophoneAccess", async () => {
    if (process.platform === "darwin") {
      try {
        const status = systemPreferences.getMediaAccessStatus("microphone");
        console.log("[macOS] requestMicrophoneAccess IPC - current status:", status);
        if (status === "not-determined" || status === "denied") {
          // Always attempt to ask - macOS will show the dialog if not-determined
          // If denied, this returns false but logs a warning
          const granted = await systemPreferences.askForMediaAccess("microphone");
          console.log("[macOS] requestMicrophoneAccess IPC - askForMediaAccess result:", granted);
          return granted;
        }
        return status === "granted";
      } catch (err) {
        console.error("Failed to ask for microphone access:", err);
        return false;
      }
    }
    return true;
  });

  // Automatically grant media & notification permissions without repeated prompts
  session.defaultSession.setPermissionRequestHandler(
    async (webContents, permission, callback) => {
      const allowed = [
        "media",
        "mediaKeySystem",
        "notifications",
        "display-capture",
      ];
      if (allowed.includes(permission)) {
        callback(true);
        return;
      }
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      const allowed = [
        "media",
        "mediaKeySystem",
        "notifications",
        "display-capture",
      ];
      return allowed.includes(permission);
    }
  );

  // Set audio device handler to allow automatic device enumeration
  session.defaultSession.setDevicePermissionHandler(
    (details) => {
      if (details.deviceType === "audioInput" || details.deviceType === "videoInput") {
        return true;
      }
      return false;
    }
  );

  // Create display media request handler with screen/window picker
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const isWindows = process.platform === "win32";

        // Check if pre-selected via custom UI
        if (pendingScreenSource) {
          const src = pendingScreenSource;
          const includeAudio = Boolean(pendingScreenAudio) && isWindows;
          pendingScreenSource = null;
          pendingScreenAudio = false;

          includeAudio
            ? callback({ video: src, audio: "loopback" })
            : callback({ video: src });
          return;
        }

        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          fetchWindowIcons: true,
          thumbnailSize: { width: 150, height: 150 },
        });

        if (!sources || sources.length === 0) {
          callback({});
          return;
        }

        const includeAudio = Boolean(request.audioRequested) && isWindows;

        if (sources.length === 1) {
          includeAudio
            ? callback({ video: sources[0], audio: "loopback" })
            : callback({ video: sources[0] });
          return;
        }

        // Default to first screen if multiple available
        const primarySource = sources.find((s) => s.id.startsWith("screen:0")) || sources[0];
        includeAudio
          ? callback({ video: primarySource, audio: "loopback" })
          : callback({ video: primarySource });
      } catch (err) {
        console.error("Error in displayMediaRequestHandler:", err);
        callback({});
      }
    }
  );

  // Wait until app is ready before showing
  win.once("ready-to-show", () => {
    win?.show();
    win?.focus();
  });

  // Load the web app
  if (app.isPackaged) {
    win.loadURL("https://cord.lie2srvv.com");
  } else {
    win.loadURL("https://cord.lie2srvv.com");
  }

  return win;
}
