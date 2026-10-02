import { Client } from "discord-rpc";

import { config } from "./config";

// internal state
let rpc: Client | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

export async function initDiscordRpc() {
  if (!config.discordRpc) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // clean up existing client if one exists
  if (rpc) {
    try {
      rpc.removeAllListeners();
      await rpc.destroy().catch(() => {});
    } catch (_) {}
    rpc = null;
  }

  try {
    const client = new Client({ transport: "ipc" });
    rpc = client;

    client.on("ready", () => {
      client.setActivity({
        state: "cord.lie2srvv.com",
        details: "Общается в LieCord",
        largeImageKey: "qr",
        largeImageText: "LieCord",
        buttons: [
          {
            label: "Присоединиться к LieCord",
            url: "https://cord.lie2srvv.com/",
          },
        ],
      }).catch(() => {});
    });

    client.on("error", () => {
      // suppress unhandled ipc socket error
    });

    client.on("disconnected", () => {
      scheduleReconnect();
    });

    client.login({ clientId: "872068124005007420" }).catch(() => {
      scheduleReconnect();
    });
  } catch (err) {
    scheduleReconnect();
  }
}

const scheduleReconnect = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initDiscordRpc();
  }, 3e4);
};

export async function destroyDiscordRpc() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (rpc) {
    try {
      await rpc.destroy().catch(() => {});
    } catch (_) {}
    rpc = null;
  }
}
