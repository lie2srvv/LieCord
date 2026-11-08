import { exec, execSync } from "node:child_process";
import { join } from "node:path";

import {
  BrowserWindow,
  Menu,
  MenuItem,
  app,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  session,
  systemPreferences,
  clipboard,
  screen,
} from "electron";

import windowIconAsset from "../../assets/desktop/icon.png?asset";

import { config } from "./config";
import { updateTrayMenu } from "./tray";

// global reference to main window
export let mainWindow: BrowserWindow;

// currently in-use build
export const BUILD_URL = new URL(
  app.commandLine.hasSwitch("force-server")
    ? app.commandLine.getSwitchValue("force-server")
    : process.env.VITE_DEV_SERVER_URL ?? "https://cord.lie2srvv.com",
);

// internal window state
let shouldQuit = false;

// pending screen selection from custom UI
let pendingScreenSource: any = null;
let pendingScreenAudio: boolean = false;

// load the window icon
const windowIcon = nativeImage.createFromDataURL(windowIconAsset);

/**
 * Validate that an origin matches our trusted application host
 */
function isAllowedOrigin(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.origin === BUILD_URL.origin;
  } catch {
    return false;
  }
}

/**
 * Safely unload a PulseAudio module by ensuring its ID is strictly numeric
 */
function safeUnloadAudioModule(id: string | null) {
  if (id && /^\d+$/.test(id)) {
    try {
      execSync(`pactl unload-module ${id}`);
    } catch (_) {}
  }
}

/**
 * Create the main application window
 */
/**
 * Ensure a window is placed within visible screen bounds and not off-screen
 */
export function ensureWindowVisible(win: BrowserWindow) {
  if (!win || win.isDestroyed()) return;
  try {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();

    // Check if coordinates or sizes are corrupted (e.g. Windows -32000 minimized coordinates)
    if (x <= -10000 || y <= -10000 || width < 200 || height < 200) {
      console.warn("[Window] Corrupted or minimized coordinates detected, centering window");
      win.setSize(Math.max(width, 1280), Math.max(height, 720));
      win.center();
      return;
    }

    const displays = screen.getAllDisplays();
    const isVisible = displays.some((d) => {
      const { x: dx, y: dy, width: dw, height: dh } = d.bounds;
      return x < dx + dw && x + width > dx && y < dy + dh && y + height > dy;
    });

    if (!isVisible) {
      console.warn("[Window] Position off-screen, centering window on primary display");
      win.center();
    }
  } catch (err) {
    console.error("[Window] Failed to check window bounds:", err);
  }
}

export function createMainWindow() {
  // Only start hidden if explicitly launched via system autostart with --hidden or --autostart
  const isAutoStart =
    app.commandLine.hasSwitch("hidden") ||
    app.commandLine.hasSwitch("autostart");
  const startHidden = isAutoStart && config.startMinimisedToTray;
  const isMacOS = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    minWidth: 300,
    minHeight: 300,
    width: 1280,
    height: 720,
    backgroundColor: "#151313",
    frame: isMacOS ? true : !config.customFrame,
    titleBarStyle: isMacOS ? "hidden" : "default",
    trafficLightPosition: isMacOS ? { x: 8, y: 8 } : undefined,
    icon: windowIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      devTools: true,
    },
  });

  // remove default menu
  mainWindow.setMenu(null);

  // Lock zoom levels and prevent wheel/pinch zooming
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  mainWindow.webContents.setZoomLevel(0);
  mainWindow.webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    mainWindow.webContents.setZoomLevel(0);
  });

  // restore window state if valid
  if (
    typeof config.windowState.x === "number" &&
    typeof config.windowState.y === "number" &&
    config.windowState.x > -10000 &&
    config.windowState.y > -10000 &&
    (config.windowState.x !== 0 || config.windowState.y !== 0)
  ) {
    mainWindow.setPosition(
      config.windowState.x,
      config.windowState.y,
    );
  }

  if (
    typeof config.windowState.width === "number" &&
    typeof config.windowState.height === "number" &&
    config.windowState.width >= 300 &&
    config.windowState.height >= 300
  ) {
    mainWindow.setSize(
      config.windowState.width,
      config.windowState.height,
    );
  }

  ensureWindowVisible(mainWindow);

  if (config.windowState.isMaximised && !startHidden) {
    mainWindow.maximize();
  }

  // Show window smoothly when content is ready to prevent blank/black frame flash
  let windowShown = false;
  const revealWindow = () => {
    if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
      if (startHidden) {
        console.log("[Window] Starting hidden in tray (autostart requested)");
        return;
      }
      windowShown = true;
      console.log("[Window] Revealing main window now");
      ensureWindowVisible(mainWindow);
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  };

  mainWindow.once("ready-to-show", () => {
    console.log("[Window] ready-to-show event fired");
    revealWindow();
  });
  // Fallback safety timer: reveal after 3 seconds max even if ready-to-show delays
  setTimeout(revealWindow, 3000);

  // Forward console messages to terminal for easy debugging
  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      console.log(`[Renderer L${level}]: ${message} (${sourceId}:${line})`);
    },
  );

  mainWindow.webContents.on("did-start-loading", () => {
    console.log("[Window] did-start-loading");
  });
  mainWindow.webContents.on("did-stop-loading", () => {
    console.log("[Window] did-stop-loading");
  });
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[Window] did-finish-load");
  });
  mainWindow.webContents.on("dom-ready", () => {
    console.log("[Window] dom-ready");
  });

  let retryTimer: NodeJS.Timeout | null = null;
  const loadWithRetry = (attempt = 1) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log(`[Window] Initiating loadURL (attempt ${attempt}) to:`, BUILD_URL.toString());
    mainWindow
      .loadURL(BUILD_URL.toString())
      .then(() => {
        console.log("[Window] loadURL promise resolved successfully");
      })
      .catch((err) => {
        console.error(`[Renderer Load URL Error attempt ${attempt}]:`, err);
        if (attempt < 5) {
          retryTimer = setTimeout(() => loadWithRetry(attempt + 1), 2000);
        } else {
          revealWindow();
        }
      });
  };

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Renderer Load Failed]: ${errorCode} ${errorDescription} (${validatedURL})`,
      );
      // Auto retry after 2 seconds if network was momentarily unreachable or returned 502/503
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          loadWithRetry(2);
        }, 2000);
      }
    },
  );

  loadWithRetry(1);

  // hide window when closed (if minimise to tray is enabled)
  mainWindow.on("close", (event) => {
    if (!shouldQuit && config.minimiseToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("show", () => {
    cancelMemoryCleanup();
    updateTrayMenu();
  });
  mainWindow.on("hide", () => {
    updateTrayMenu();
    triggerMemoryCleanup();
  });
  mainWindow.on("minimize", () => {
    triggerMemoryCleanup();
  });
  mainWindow.on("restore", () => {
    cancelMemoryCleanup();
  });

  function saveWindowState() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    try {
      const pos = mainWindow.getPosition();
      const size = mainWindow.getSize();
      if (pos[0] <= -10000 || pos[1] <= -10000 || size[0] < 200 || size[1] < 200) return;
      config.windowState = {
        x: pos[0],
        y: pos[1],
        width: size[0],
        height: size[1],
        isMaximised: mainWindow.isMaximized(),
      };
    } catch (_) {}
  }

  mainWindow.on("maximize", saveWindowState);
  mainWindow.on("unmaximize", saveWindowState);
  mainWindow.on("moved", saveWindowState);
  mainWindow.on("resized", saveWindowState);

  // handle shortcuts
  mainWindow.webContents.on("before-input-event", (event, input) => {
    // DevTools: F12 or Ctrl+Shift+I
    if (
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i")
    ) {
      if (input.type === "keyDown") {
        mainWindow.webContents.toggleDevTools();
      }
      return;
    }

    // Disable zoom shortcuts completely
    if (
      (input.control || input.meta) &&
      (input.key === "=" ||
        input.key === "+" ||
        input.key === "-" ||
        input.key === "_" ||
        input.code === "NumpadAdd" ||
        input.code === "NumpadSubtract")
    ) {
      event.preventDefault();
      return;
    } else if ((input.control || input.meta) && input.key === "0") {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
      return;
    } else if (
      (input.control || input.meta) &&
      input.shift &&
      input.key.toLowerCase() === "r"
    ) {
      event.preventDefault();
      mainWindow.webContents.reloadIgnoringCache();
    } else if (
      input.key === "F5" ||
      ((input.control || input.meta) && input.key.toLowerCase() === "r")
    ) {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
  });

  // synchronize configuration on client load
  mainWindow.webContents.on("did-finish-load", () => {
    config.sync();
  });

  // context menu for spellcheck (only shown when right-clicking a misspelled word in an editable field)
  mainWindow.webContents.on("context-menu", (_, params) => {
    if (
      !params.isEditable ||
      (!params.misspelledWord && params.dictionarySuggestions.length === 0)
    ) {
      return;
    }

    const menu = new Menu();

    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion),
        }),
      );
    }

    if (params.misspelledWord) {
      menu.append(
        new MenuItem({
          label: "Add to dictionary",
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord,
            ),
        }),
      );
    }

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  // IPC handlers for custom screen share picker
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
        safeUnloadAudioModule(linuxAudioModuleId);
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
            console.info(
              "[Linux Audio] Loaded stream audio module:",
              linuxAudioModuleId,
            );
            resolve(true);
          }
        },
      );
    });
  });

  ipcMain.handle("stopLinuxScreenAudio", async () => {
    if (linuxAudioModuleId) {
      safeUnloadAudioModule(linuxAudioModuleId);
      linuxAudioModuleId = null;
    }
    return true;
  });

  app.on("before-quit", () => {
    if (linuxAudioModuleId) {
      safeUnloadAudioModule(linuxAudioModuleId);
      linuxAudioModuleId = null;
    }
  });

  ipcMain.on("writeClipboard", (_, text: string) => {
    try {
      clipboard.writeText(text || "");
    } catch (e) {
      console.error("[Clipboard] Failed to write text:", e);
    }
  });

  ipcMain.handle("requestMicrophoneAccess", async () => {
    if (process.platform === "darwin") {
      try {
        const status = systemPreferences.getMediaAccessStatus("microphone");
        console.log(
          "[macOS] requestMicrophoneAccess IPC - current status:",
          status,
        );
        if (status === "not-determined" || status === "denied") {
          const granted = await systemPreferences.askForMediaAccess("microphone");
          console.log(
            "[macOS] requestMicrophoneAccess IPC - askForMediaAccess result:",
            granted,
          );
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

  // Automatically grant media & notification permissions without repeated prompts,
  // strictly enforcing that requests originate only from our trusted BUILD_URL host.
  session.defaultSession.setPermissionRequestHandler(
    async (webContents, permission, callback, details: any) => {
      let url =
        webContents && typeof webContents.getURL === "function"
          ? webContents.getURL()
          : details?.requestingUrl || "";
      if (!url && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        url = mainWindow.webContents.getURL();
      }
      if (!isAllowedOrigin(url)) {
        console.warn(`[Security] Blocked permission ${permission} for untrusted origin: ${url}`);
        return callback(false);
      }

      const allowed = [
        "media",
        "audio-capture",
        "video-capture",
        "display-capture",
        "notifications",
        "clipboard-read",
        "clipboard-write",
        "clipboard-sanitized-write",
      ];
      if (!allowed.includes(permission)) {
        return callback(false);
      }

      if (process.platform === "darwin") {
        if (permission === "media" || permission === "audio-capture") {
          try {
            const status = systemPreferences.getMediaAccessStatus("microphone");
            if (status === "not-determined") {
              const granted =
                await systemPreferences.askForMediaAccess("microphone");
              return callback(granted);
            } else if (status === "denied" || status === "restricted") {
              return callback(false);
            }
            return callback(true);
          } catch (e) {
            console.error("[macOS Permission Error - microphone]:", e);
          }
        }
        if (permission === "video-capture") {
          try {
            const status = systemPreferences.getMediaAccessStatus("camera");
            if (status === "not-determined") {
              const granted =
                await systemPreferences.askForMediaAccess("camera");
              return callback(granted);
            } else if (status === "denied" || status === "restricted") {
              return callback(false);
            }
            return callback(true);
          } catch (e) {
            console.error("[macOS Permission Error - camera]:", e);
          }
        }
      }

      callback(true);
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      let url =
        webContents && typeof webContents.getURL === "function"
          ? webContents.getURL()
          : requestingOrigin || "";
      if (!url && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        url = mainWindow.webContents.getURL();
      }
      if (!isAllowedOrigin(url)) {
        return false;
      }

      const allowed = [
        "media",
        "audio-capture",
        "video-capture",
        "display-capture",
        "notifications",
        "clipboard-read",
        "clipboard-write",
        "clipboard-sanitized-write",
      ];
      if (!allowed.includes(permission)) return false;
      if (process.platform === "darwin") {
        if (permission === "media" || permission === "audio-capture") {
          const status = systemPreferences.getMediaAccessStatus("microphone");
          if (status === "denied" || status === "restricted") return false;
          return true;
        }
      }
      return true;
    },
  );

  // Create display media request handler with screen/window picker
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const isWin = process.platform === "win32";

        // Check if pre-selected via custom UI
        if (pendingScreenSource) {
          const src = pendingScreenSource;
          const includeAudio = Boolean(
            isWin && request.audioRequested && pendingScreenAudio,
          );
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

        const includeAudio = Boolean(isWin && request.audioRequested);

        if (sources.length === 1) {
          includeAudio
            ? callback({ video: sources[0], audio: "loopback" })
            : callback({ video: sources[0] });
          return;
        }

        let responded = false;
        const respond = (source?: (typeof sources)[0]) => {
          if (responded) return;
          responded = true;
          if (!source) {
            callback({});
          } else {
            includeAudio
              ? callback({ video: source, audio: "loopback" })
              : callback({ video: source });
          }
        };

        // Fallback screen selection menu
        const menu = new Menu();
        const screens = sources.filter((s) => s.id.startsWith("screen"));
        const windows = sources.filter((s) => s.id.startsWith("window"));

        if (screens.length > 0) {
          menu.append(
            new MenuItem({ label: "── Экраны ──", enabled: false }),
          );
          for (const s of screens) {
            menu.append(
              new MenuItem({
                label: `🖥️  ${s.name}`,
                click: () => respond(s),
              }),
            );
          }
        }

        if (windows.length > 0) {
          if (screens.length > 0)
            menu.append(new MenuItem({ type: "separator" }));
          menu.append(
            new MenuItem({ label: "── Окна ──", enabled: false }),
          );
          for (const s of windows) {
            const title =
              s.name.length > 45 ? s.name.substring(0, 42) + "..." : s.name;
            menu.append(
              new MenuItem({
                label: `🪟  ${title}`,
                icon: s.appIcon
                  ? s.appIcon.resize({ width: 16, height: 16 })
                  : undefined,
                click: () => respond(s),
              }),
            );
          }
        }

        menu.append(new MenuItem({ type: "separator" }));
        menu.append(
          new MenuItem({
            label: "Отмена",
            click: () => respond(),
          }),
        );

        menu.on("menu-will-close", () => {
          setTimeout(() => {
            if (!responded) {
              respond();
            }
          }, 200);
        });

        menu.popup({ window: mainWindow });
      } catch (err) {
        console.error("setDisplayMediaRequestHandler error:", err);
        callback({});
      }
    },
  );

  // Push world events to the window (support both conventions: minimise/window-minimize, etc.)
  const handleMinimize = () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  };

  const handleMaximize = () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  };

  const handleClose = () => {
    if (mainWindow) {
      mainWindow.close();
    }
  };

  ipcMain.on("minimise", handleMinimize);
  ipcMain.on("window-minimize", handleMinimize);

  ipcMain.on("maximise", handleMaximize);
  ipcMain.on("window-maximize", handleMaximize);

  ipcMain.on("close", handleClose);
  ipcMain.on("window-close", handleClose);

  ipcMain.on("relaunch", () => {
    app.relaunch();
    quitApp();
  });

  // Global Push-To-Talk IPC registration (works across games & minimized window)
  let registeredPttShortcut: string | null = null;
  let pttReleaseTimer: NodeJS.Timeout | null = null;
  let pttIsPressed = false;

  ipcMain.handle("registerGlobalPtt", (_, shortcut: string) => {
    if (!shortcut || typeof shortcut !== "string") return false;
    try {
      if (registeredPttShortcut) {
        try {
          globalShortcut.unregister(registeredPttShortcut);
        } catch (_) {}
        registeredPttShortcut = null;
      }
      const success = globalShortcut.register(shortcut, () => {
        if (!pttIsPressed) {
          pttIsPressed = true;
          mainWindow?.webContents.send("globalPtt", true);
        }
        if (pttReleaseTimer) {
          clearTimeout(pttReleaseTimer);
        }
        pttReleaseTimer = setTimeout(() => {
          pttIsPressed = false;
          mainWindow?.webContents.send("globalPtt", false);
          pttReleaseTimer = null;
        }, 320);
      });

      if (success) {
        registeredPttShortcut = shortcut;
        console.log("[Global PTT] Registered: " + shortcut);
      } else {
        console.warn("[Global PTT] Could not register: " + shortcut);
      }
      return success;
    } catch (err) {
      console.error("[Global PTT] Error: ", err);
      return false;
    }
  });

  ipcMain.handle("unregisterGlobalPtt", () => {
    if (registeredPttShortcut) {
      try {
        globalShortcut.unregister(registeredPttShortcut);
      } catch (_) {}
      registeredPttShortcut = null;
    }
    if (pttReleaseTimer) {
      clearTimeout(pttReleaseTimer);
      pttReleaseTimer = null;
    }
    if (pttIsPressed) {
      pttIsPressed = false;
      mainWindow?.webContents.send("globalPtt", false);
    }
    return true;
  });
}

/**
 * Quit the entire app
 */
export function quitApp() {
  shouldQuit = true;
  mainWindow.close();
}

// Ensure global app quit works properly
app.on("before-quit", () => {
  shouldQuit = true;
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
});


let memoryCleanupTimer: NodeJS.Timeout | null = null;

export function cancelMemoryCleanup() {
  if (memoryCleanupTimer) {
    clearTimeout(memoryCleanupTimer);
    memoryCleanupTimer = null;
  }
}

export function triggerMemoryCleanup() {
  cancelMemoryCleanup();
  memoryCleanupTimer = setTimeout(() => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("[Memory] Releasing unused renderer cache and triggering GC...");
        mainWindow.webContents.session.clearCache().catch(() => {});
        mainWindow.webContents
          .executeJavaScript(
            "if (typeof window !== 'undefined' && typeof (window as any).gc === 'function') { (window as any).gc(); }",
          )
          .catch(() => {});
      }
    } catch (_) {}

    try {
      if (typeof global.gc === "function") {
        global.gc();
      }
    } catch (_) {}

    try {
      if (typeof (process as any).trimWorkingSet === "function") {
        (process as any).trimWorkingSet();
      }
    } catch (_) {}
  }, 1000);
}
