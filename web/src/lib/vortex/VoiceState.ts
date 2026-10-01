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

    status: VoiceStatus;
    roomId: Nullable<string>;
    participants: Map<string, VoiceUser>;
    activeSpeakers: Set<string>;
    videoTracks: Map<string, any>;

    constructor() {
        this.roomId = null;
        this.status = VoiceStatus.UNLOADED;
        this.participants = new Map();
        this.activeSpeakers = new Set();
        this.videoTracks = new Map();

        this.syncState = this.syncState.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);

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
            const call = await (channel as any).client.api.post(
                `/channels/${channel._id}/join_call`,
                { node: "worldwide" },
            );

            runInAction(() => {
                this.status = VoiceStatus.RTC_CONNECTING;
            });

            await this.client.connect(call.url, channel._id, call.token);

            runInAction(() => {
                this.status = VoiceStatus.CONNECTED;
                this.connecting = false;
                this.roomId = channel._id;
            });
            this.syncState();
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

        this.client?.disconnect();
        this.syncState();
    }

    isProducing(type: ProduceType) {
        switch (type) {
            case "audio":
                return this.client?.audioProducer !== undefined;
            case "screen":
                return this.client?.screenProducer !== undefined;
        }
    }

    isSpeaking(userId: string): boolean {
        return this.activeSpeakers.has(userId);
    }

    isDeaf() {
        if (!this.client) return false;
        return this.client.isDeaf;
    }

    async startDeafen() {
        if (!this.client) return;
        this.client.isDeaf = true;
        document.querySelectorAll("audio[id^='audio-']").forEach((el) => {
            (el as HTMLAudioElement).muted = true;
        });
        this.syncState();
    }

    async stopDeafen() {
        if (!this.client) return;
        this.client.isDeaf = false;
        document.querySelectorAll("audio[id^='audio-']").forEach((el) => {
            (el as HTMLAudioElement).muted = false;
        });
        this.syncState();
    }

    async startProducing(type: ProduceType) {
        switch (type) {
            case "audio": {
                if (this.client?.audioProducer !== undefined) return;
                await this.client?.startProduce({} as any, "audio");
                break;
            }
            case "screen": {
                if (this.client?.screenProducer !== undefined) return;
                await this.client?.startProduce({} as any, "screen");
                break;
            }
        }
        this.syncState();
    }

    async stopProducing(type: ProduceType) {
        await this.client?.stopProduce(type);
        this.syncState();
    }
}

export const voiceState = new VoiceStateReference();
