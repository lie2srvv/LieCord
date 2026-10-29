import { exec, execSync } from "node:child_process";
import { join } from "node:path";

import {
  BrowserWindow,
  Menu,
  MenuItem,
  app,
  desktopCapturer,
  ipcMain,
  nativeImage,
  session,
  systemPreferences,
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
 * Create the main application window
 */
export function createMainWindow() {
  // (CLI arg --hidden or config)
  const startHidden =
    app.commandLine.hasSwitch("hidden") || config.startMinimisedToTray;
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
      sandbox: true,
      spellcheck: true,
      devTools: !app.isPackaged,
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

  // restore window state if available
  if (config.windowState.x > 0 || config.windowState.y > 0) {
    mainWindow.setPosition(
      config.windowState.x ?? 0,
      config.windowState.y ?? 0,
    );
  }

  if (config.windowState.width > 0 && config.windowState.height > 0) {
    mainWindow.setSize(
      config.windowState.width ?? 1280,
      config.windowState.height ?? 720,
    );
  }

  if (config.windowState.isMaximised && !startHidden) {
    mainWindow.maximize();
  }

  // Show window smoothly when content is ready to prevent blank/black frame flash
  let windowShown = false;
  const revealWindow = () => {
    if (!windowShown && !startHidden && mainWindow && !mainWindow.isDestroyed()) {
      windowShown = true;
      console.log("[Window] Revealing main window now");
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

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Renderer Load Failed]: ${errorCode} ${errorDescription} (${validatedURL})`,
      );
      revealWindow();
    },
  );

  // Load the remote client
  console.log("[Window] Initiating loadURL to:", BUILD_URL.toString());
  mainWindow
    .loadURL(BUILD_URL.toString())
    .then(() => {
      console.log("[Window] loadURL promise resolved successfully");
    })
    .catch((err) => {
      console.error("[Renderer Load URL Error]:", err);
      revealWindow();
    });

  // hide window when closed (if minimise to tray is enabled)
  mainWindow.on("close", (event) => {
    if (!shouldQuit && config.minimiseToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);

  function saveWindowState() {
    config.windowState = {
      x: mainWindow.getPosition()[0],
      y: mainWindow.getPosition()[1],
      width: mainWindow.getSize()[0],
      height: mainWindow.getSize()[1],
      isMaximised: mainWindow.isMaximized(),
    };
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

  let originalDefaultSink: string | null = null;
  let shareSinkModuleId: string | null = null;
  let loopbackModuleId: string | null = null;
  let remapSourceModuleId: string | null = null;
  let isolationInterval: NodeJS.Timeout | null = null;

  function isolateLieCordFromStream(targetSink: string) {
    try {
      const output = execSync("pactl list sink-inputs", { stdio: ["pipe", "pipe", "ignore"] }).toString();
      const blocks = output.split(/Sink Input #/);
      for (const block of blocks) {
        if (!block.trim()) continue;
        const idMatch = block.match(/^(\d+)/);
        if (!idMatch) continue;
        const inputId = idMatch[1];
        if (
          /application\.name\s*=\s*"LieCord"|application\.process\.binary\s*=\s*"liecord-desktop"/i.test(
            block,
          )
        ) {
          try {
            execFileSync("pactl", ["move-sink-input", inputId, targetSink], {
              stdio: ["ignore", "ignore", "ignore"],
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function cleanupLinuxScreenAudio() {
    if (isolationInterval) {
      clearInterval(isolationInterval);
      isolationInterval = null;
    }
    if (originalDefaultSink) {
      try {
        execFileSync("pactl", ["set-default-sink", originalDefaultSink], {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (_) {}
    }
    if (remapSourceModuleId) {
      try {
        execSync(`pactl unload-module ${remapSourceModuleId}`, {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (_) {}
      remapSourceModuleId = null;
    }
    if (loopbackModuleId) {
      try {
        execSync(`pactl unload-module ${loopbackModuleId}`, {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (_) {}
      loopbackModuleId = null;
    }
    if (shareSinkModuleId) {
      try {
        execSync(`pactl unload-module ${shareSinkModuleId}`, {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (_) {}
      shareSinkModuleId = null;
    }
    originalDefaultSink = null;
  }

  ipcMain.handle("startLinuxScreenAudio", async () => {
    if (process.platform !== "linux") return false;
    cleanupLinuxScreenAudio();

    try {
      // 1. Get physical default sink (user's headphones/speakers)
      const currentSink = execSync("pactl get-default-sink", {
        stdio: ["pipe", "pipe", "ignore"],
      })
        .toString()
        .trim();
      originalDefaultSink = currentSink;

      // 2. Create isolated virtual sink for shared desktop audio
      const shareSinkOut = execSync(
        "pactl load-module module-null-sink sink_name=liecord_share_sink sink_properties=device.description=LieCord_Share_Sink",
        { stdio: ["pipe", "pipe", "ignore"] },
      )
        .toString()
        .trim();
      shareSinkModuleId = shareSinkOut;

      // 3. Loopback shared audio to physical sink so the presenter still hears their games/apps
      const loopbackOut = execFileSync(
        "pactl",
        ["load-module", "module-loopback", "source=liecord_share_sink.monitor", `sink=${originalDefaultSink}`, "latency_msec=20"],
        { stdio: ["pipe", "pipe", "ignore"] },
      )
        .toString()
        .trim();
      loopbackModuleId = loopbackOut;

      // 4. Remap source for WebRTC capture
      const remapOut = execSync(
        "pactl load-module module-remap-source master=liecord_share_sink.monitor source_name=liecord_stream_audio source_properties=device.description=LieCord_Stream_Audio",
        { stdio: ["pipe", "pipe", "ignore"] },
      )
        .toString()
        .trim();
      remapSourceModuleId = remapOut;

      // 5. Direct system apps to liecord_share_sink
      execSync("pactl set-default-sink liecord_share_sink", {
        stdio: ["ignore", "ignore", "ignore"],
      });

      // 6. Keep LieCord voice outputs on physical sink (no echo!)
      isolateLieCordFromStream(originalDefaultSink);
      isolationInterval = setInterval(() => {
        if (originalDefaultSink) {
          isolateLieCordFromStream(originalDefaultSink);
        }
      }, 1500);

      console.info("[Linux Audio] Stream audio initialized with echo isolation");
      return true;
    } catch (err) {
      console.warn("[Linux Audio] startLinuxScreenAudio failed:", err);
      cleanupLinuxScreenAudio();
      return false;
    }
  });

  ipcMain.handle("stopLinuxScreenAudio", async () => {
    cleanupLinuxScreenAudio();
    return true;
  });

  app.on("before-quit", () => {
    cleanupLinuxScreenAudio();
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

  // Automatically grant media & notification permissions without repeated prompts
  session.defaultSession.setPermissionRequestHandler(
    async (webContents, permission, callback) => {
      const allowed = [
        "media",
        "audio-capture",
        "video-capture",
        "display-capture",
        "notifications",
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
    (webContents, permission) => {
      const allowed = [
        "media",
        "audio-capture",
        "video-capture",
        "display-capture",
        "notifications",
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
});
