import { action, makeAutoObservable, runInAction } from "mobx";
import { Channel, Nullable, toNullable } from "revolt.js";

import type { ProduceType, VoiceUser } from "./Types";
import type VoiceClient from "./VoiceClient";

export enum VoiceStatus {
    LOADING = 0,
    UNAVAILABLE,
    ERRORED,
    READY = 3,
    CONNECTING = 4,
    UNLOADED = 5,
    AUTHENTICATING,
    RTC_CONNECTING,
    CONNECTED,
    // RECONNECTING
}

// MobX state wrapper around VoiceClient
class VoiceStateReference {
    client?: VoiceClient;
    connecting?: boolean;

    status: VoiceStatus = VoiceStatus.UNLOADED;
    roomId: Nullable<string> = null;
    participants: Map<string, VoiceUser> = new Map();
    activeSpeakers: Set<string> = new Set();
    videoTracks: Map<string, any> = new Map();

    // Observable states tracked by MobX
    isMuted: boolean = false;
    isDeafened: boolean = false;
    audioProducing: boolean = false;
    screenProducing: boolean = false;
    wasMutedBeforeDeafen: boolean = false;

    constructor() {
        this.roomId = null;
        this.status = VoiceStatus.UNLOADED;
        this.participants = new Map();
        this.activeSpeakers = new Set();
        this.videoTracks = new Map();

        this.syncState = this.syncState.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.toggleMic = this.toggleMic.bind(this);
        this.toggleDeafen = this.toggleDeafen.bind(this);

        makeAutoObservable(this, {
            client: false,
            connecting: false,
        });
    }

    // This takes information from the voice
    // client and applies it to the state here.
    @action syncState() {
        if (!this.client) return;
        this.roomId = toNullable(this.client.roomId);
        this.participants.clear();
        this.client.participants.forEach((v, k) => this.participants.set(k, { ...v }));
        this.activeSpeakers = new Set(this.client.activeSpeakers);
        this.videoTracks.clear();
        this.client.videoTracks.forEach((v, k) => this.videoTracks.set(k, v));

        this.audioProducing = this.client.audioProducer !== undefined;
        this.screenProducing = this.client.screenProducer !== undefined;
        this.isDeafened = this.client.isDeaf;

        if (this.roomId) {
            this.isMuted = !this.audioProducing;
        }
    }

    // This imports and constructs the voice client.
    @action async loadVoice() {
        if (this.status !== VoiceStatus.UNLOADED) return;
        this.status = VoiceStatus.LOADING;

        try {
            const { default: VoiceClient } = await import("./VoiceClient");
            const client = new VoiceClient();

            client.on("startProduce", this.syncState);
            client.on("stopProduce", this.syncState);
            client.on("userJoined", this.syncState);
            client.on("userLeft", this.syncState);
            client.on("userStartProduce", this.syncState);
            client.on("userStopProduce", this.syncState);
            client.on("activeSpeakersChanged", this.syncState);

            runInAction(() => {
                if (!client.supported()) {
                    this.status = VoiceStatus.UNAVAILABLE;
                } else {
                    this.status = VoiceStatus.READY;
                    this.client = client;
                }
            });
        } catch (err) {
            console.error("Failed to load voice library!", err);
            runInAction(() => {
                this.status = VoiceStatus.UNAVAILABLE;
            });
        }
    }

    // Connect to a voice channel.
    @action async connect(channel: Channel) {
        if (!this.client?.supported()) throw new Error("RTC is unavailable");

        this.connecting = true;
        this.status = VoiceStatus.CONNECTING;

        try {
            const call = await channel.joinCall();

            if (this.status !== VoiceStatus.CONNECTING) return;

            // Pass deafen state before connect so it doesn't auto-produce mic
            this.client.isDeaf = this.isDeafened;

            await this.client.connect(call.url, channel._id, call.token);

            runInAction(() => {
                this.status = VoiceStatus.CONNECTED;
                this.connecting = false;
                this.roomId = channel._id;
                this.audioProducing = this.client?.audioProducer !== undefined;
                this.screenProducing = this.client?.screenProducer !== undefined;
            });
            this.syncState();

            if (this.isDeafened) {
                this.client.setDeaf(true);
                await this.client.stopProduce("audio");
            } else if (this.isMuted) {
                await this.client.stopProduce("audio");
            }
        } catch (err) {
            console.error("Failed to join voice call:", err);

            runInAction(() => {
                this.status = VoiceStatus.READY;
                this.connecting = false;
            });

            return channel;
        }

        return channel;
    }

    // Disconnect from current channel.
    @action disconnect() {
        this.connecting = false;
        this.status = VoiceStatus.READY;
        this.roomId = null;
        this.audioProducing = false;
        this.screenProducing = false;
        this.isDeafened = false;
        this.isMuted = false;
        this.wasMutedBeforeDeafen = false;

        this.client?.disconnect();
        this.syncState();
    }

    isProducing(type: ProduceType): boolean {
        switch (type) {
            case "audio":
                return this.roomId ? this.audioProducing : !this.isMuted;
            case "screen":
                return this.screenProducing;
        }
    }

    isSpeaking(userId: string): boolean {
        return this.activeSpeakers.has(userId);
    }

    isDeaf(): boolean {
        return this.isDeafened;
    }

    @action async toggleDeafen() {
        if (this.isDeafened) {
            await this.stopDeafen();
        } else {
            await this.startDeafen();
        }
    }

    @action async startDeafen() {
        this.isDeafened = true;
        this.wasMutedBeforeDeafen = this.isMuted;
        this.isMuted = true;

        if (this.client) {
            this.client.setDeaf(true);
            if (this.roomId) {
                await this.client.stopProduce("audio");
            }
        }
        this.syncState();
    }

    @action async stopDeafen() {
        this.isDeafened = false;

        if (this.client) {
            this.client.setDeaf(false);
        }

        // Only unmute mic if user wasn't muted before deafening
        if (!this.wasMutedBeforeDeafen) {
            this.isMuted = false;
            if (this.client && this.roomId) {
                await this.client.startProduce({} as any, "audio");
            }
        }
        this.syncState();
    }

    @action async toggleMic() {
        if (this.isMuted) {
            // Unmuting mic
            this.isMuted = false;
            if (this.isDeafened) {
                this.isDeafened = false;
                if (this.client) {
                    this.client.setDeaf(false);
                }
            }
            if (this.client && this.roomId) {
                await this.client.startProduce({} as any, "audio");
            }
        } else {
            // Muting mic
            this.isMuted = true;
            if (this.client && this.roomId) {
                await this.client.stopProduce("audio");
            }
        }
        this.syncState();
    }

    @action async startProducing(type: ProduceType) {
        if (type === "audio") {
            this.isMuted = false;
            if (this.isDeafened) {
                this.isDeafened = false;
                if (this.client) {
                    this.client.setDeaf(false);
                }
            }
            if (this.client && this.roomId) {
                if (this.client.audioProducer === undefined) {
                    await this.client.startProduce({} as any, "audio");
                }
            }
        } else if (type === "screen") {
            if (this.client?.screenProducer !== undefined) return;
            await this.client?.startProduce({} as any, "screen");
        }
        this.syncState();
    }

    @action async stopProducing(type: ProduceType) {
        if (type === "audio") {
            this.isMuted = true;
            if (this.client && this.roomId) {
                await this.client.stopProduce("audio");
            }
        } else {
            await this.client?.stopProduce(type);
        }
        this.syncState();
    }
}

export const voiceState = new VoiceStateReference();
