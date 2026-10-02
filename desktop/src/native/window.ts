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

// windowIcon.setTemplateImage(true);

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
    show: !startHidden,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      devTools: true,
    },
  });

  // remove default menu
  mainWindow.setMenu(null);

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

  // Forward console messages to terminal for easy debugging
  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      console.log(`[Renderer L${level}]: ${message} (${sourceId}:${line})`);
    },
  );

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Renderer Load Failed]: ${errorCode} ${errorDescription} (${validatedURL})`,
      );
    },
  );

  // Clear any stale Service Workers or cache to guarantee fresh bundles
  mainWindow.webContents.session.clearStorageData({
    storages: ['serviceworkers', 'cachestorage']
  }).catch(() => {});

  // load the remote client
  mainWindow.loadURL(BUILD_URL.toString());

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

    if (input.control && (input.key === "=" || input.key === "+")) {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(
        mainWindow.webContents.getZoomLevel() + 1,
      );
    } else if (input.control && input.key === "-") {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(
        mainWindow.webContents.getZoomLevel() - 1,
      );
    } else if (input.control && input.key === "0") {
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
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
    if (!params.isEditable || (!params.misspelledWord && params.dictionarySuggestions.length === 0)) {
      return;
    }

    const menu = new Menu();

    // Add each spelling suggestion
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion),
        }),
      );
    }

    // Allow users to add the misspelled word to the dictionary
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

  // Automatically grant media & notification permissions without repeated prompts
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = [
        "media",
        "audio-capture",
        "video-capture",
        "display-capture",
        "notifications",
      ];
      callback(allowed.includes(permission));
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
      return allowed.includes(permission);
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
          if (screens.length > 0) menu.append(new MenuItem({ type: "separator" }));
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

  // push world events to the window
  ipcMain.on("minimise", () => mainWindow.minimize());
  ipcMain.on("maximise", () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(),
  );
  ipcMain.on("close", () => mainWindow.close());
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
