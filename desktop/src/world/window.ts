import { contextBridge, ipcRenderer } from "electron";

import { version } from "../../package.json";

let config: DesktopConfig = {} as DesktopConfig;

ipcRenderer.on("config", (_, data) => (config = data));

contextBridge.exposeInMainWorld("isNative", true);
contextBridge.exposeInMainWorld("nativeVersion", version);

contextBridge.exposeInMainWorld("native", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    desktop: () => version,
  },

  minimise: () => ipcRenderer.send("minimise"),
  maximise: () => ipcRenderer.send("maximise"),
  close: () => ipcRenderer.send("close"),
  min: () => ipcRenderer.send("minimise"),
  max: () => ipcRenderer.send("maximise"),
  reload: () => location.reload(),
  relaunch: () => ipcRenderer.send("relaunch"),

  getConfig: () => config,
  set: (key: string, value: unknown) => {
    (config as Record<string, unknown>)[key] = value;
    ipcRenderer.send("config", { [key]: value });
  },

  getAutoStart: () => ipcRenderer.invoke("getAutostart") as Promise<boolean>,
  enableAutoStart: () => ipcRenderer.invoke("setAutostart", true) as Promise<void>,
  disableAutoStart: () => ipcRenderer.invoke("setAutostart", false) as Promise<void>,

  setBadgeCount: (count: number) => ipcRenderer.send("setBadgeCount", count),

  // Screen share picker APIs
  getScreenSources: () => ipcRenderer.invoke("getScreenSources"),
  selectScreenSource: (sourceId: string, audio?: boolean) =>
    ipcRenderer.invoke("selectScreenSource", sourceId, audio),

  onceScreenPicker: (
    onScreenPick: (
      sources: {
        idx: number;
        name: string;
        isFullScreen: boolean;
        image?: string;
      }[],
    ) => void,
  ) => {
    const eventName = "screenPicker";
    ipcRenderer.removeAllListeners(eventName);
    ipcRenderer.once(eventName, (_, sources) => onScreenPick(sources));
  },
  screenPickerCallback: (idx: number, audio: boolean) =>
    ipcRenderer.send("screenPickerCallback", idx, audio),

  isWayland: () => ipcRenderer.invoke("getIsWayland"),
});
