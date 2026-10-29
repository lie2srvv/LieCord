import { createCallStartedMessage } from "../callMessage";
import { action, makeAutoObservable, ObservableMap, runInAction } from "mobx";
import { Channel, Nullable, toNullable } from "revolt.js";

import messageSound from "../../assets/sounds/message.mp3";
import type { ProduceType, VoiceUser } from "./Types";
import type VoiceClient from "./VoiceClient";
import type { ScreenShareOptions } from "./VoiceClient";

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

export interface ChannelVoiceParticipant {
    id: string;
    joined_at?: string;
    camera?: boolean;
    screensharing?: boolean;
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
    screenThumbnails: Map<string, string> = new Map();
    watchingScreenUserId: Nullable<string> = null;
    streamVersion: number = 0;

    // Observable states tracked by MobX
    isMuted: boolean = false;
    isDeafened: boolean = false;
    audioProducing: boolean = false;
    screenProducing: boolean = false;
    wasMutedBeforeDeafen: boolean = false;

    // Global channel voice states across server voice channels and DMs
    channelVoiceStates: ObservableMap<string, ChannelVoiceParticipant[]> =
        new ObservableMap();

    // Incoming call state
    incomingCall: {
        channelId: string;
        callerId: string;
        callerName: string;
    } | null = null;
    private ringtoneAudio?: HTMLAudioElement;
    private incomingCallTimer?: any;
    private ringtoneInterval?: any;

    constructor() {
        this.roomId = null;
        this.status = VoiceStatus.UNLOADED;
        this.participants = new Map();
        this.activeSpeakers = new Set();
        this.videoTracks = new Map();
        this.screenThumbnails = new Map();
        this.watchingScreenUserId = null;
        this.streamVersion = 0;

        if (typeof window !== "undefined") {
            try {
                const savedMuted = localStorage.getItem("liecord_mic_muted");
                if (savedMuted !== null) {
                    this.isMuted = savedMuted === "true";
                }
                const savedDeafened = localStorage.getItem("liecord_deafened");
                if (savedDeafened !== null) {
                    this.isDeafened = savedDeafened === "true";
                    if (this.isDeafened) {
                        this.isMuted = true;
                    }
                }
            } catch (_) {}
        }

        this.syncState = this.syncState.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.toggleMic = this.toggleMic.bind(this);
        this.toggleDeafen = this.toggleDeafen.bind(this);
        this.startDeafen = this.startDeafen.bind(this);
        this.stopDeafen = this.stopDeafen.bind(this);

        // Listen for native desktop incoming call actions
        try {
            if ((window as any).native?.onIncomingCallClicked) {
                (window as any).native.onIncomingCallClicked(({ channelId, action }: { channelId: string; action: string }) => {
                    if (action === "accept") {
                        this.acceptIncomingCall(channelId);
                    } else if (action === "decline") {
                        this.stopIncomingCall();
                    } else {
                        window.focus();
                    }
                });
            }
        } catch (e) {
            console.error("Failed to register desktop onIncomingCallClicked:", e);
        }

        makeAutoObservable(this, {
            client: false,
            connecting: false,
            ringtoneAudio: false,
            incomingCallTimer: false,
            ringtoneInterval: false,
        });
    }

    private persistVoiceSettings() {
        if (typeof window !== "undefined") {
            try {
                localStorage.setItem("liecord_mic_muted", String(this.isMuted));
                localStorage.setItem(
                    "liecord_deafened",
                    String(this.isDeafened),
                );
            } catch (_) {}
        }
    }

    getChannelParticipants(channelId: string): ChannelVoiceParticipant[] {
        return this.channelVoiceStates.get(channelId) || [];
    }

    isChannelActive(channelId: string): boolean {
        const parts = this.channelVoiceStates.get(channelId);
        return !!(parts && parts.length > 0);
    }

    @action setWatchingScreenUserId(userId: Nullable<string>) {
        this.watchingScreenUserId = userId;
        if (this.client) {
            this.client.setWatchingUserId(userId);
        }
        this.syncState();
    }

    @action setScreenThumbnail(userId: string, dataUrl: string) {
        this.screenThumbnails.set(userId, dataUrl);
        if (this.client) {
            this.client.setScreenThumbnail(userId, dataUrl);
        }
        this.streamVersion++;
    }

    @action triggerIncomingCall(
        channelId: string,
        callerId: string,
        callerName: string,
    ) {
        if (this.incomingCall?.channelId === channelId) return;
        this.incomingCall = { channelId, callerId, callerName };

        try {
            if ((window as any).native?.showIncomingCall) {
                const callerUser = (this.client as any)?.users?.get(callerId);
                const avatarUrl = callerUser?.generateAvatarURL ? callerUser.generateAvatarURL({ max_side: 256 }) : null;
                (window as any).native.showIncomingCall({
                    channelId,
                    callerId,
                    callerName,
                    avatarUrl
                });
            }
        } catch (e) {
            console.error("Failed to notify desktop native of incoming call:", e);
        }

        if (!this.ringtoneAudio) {
            this.ringtoneAudio = new Audio(messageSound);
            this.ringtoneAudio.volume = 0.8;
        }

        const playPing = () => {
            if (!this.incomingCall || !this.ringtoneAudio) return;
            try {
                this.ringtoneAudio.currentTime = 0;
                this.ringtoneAudio
                    .play()
                    .catch((e) =>
                        console.log(
                            "Incoming call ringtone autoplay prevented:",
                            e,
                        ),
                    );
            } catch (e) {
                console.error("Failed to play ping:", e);
            }
        };

        // Play initial chime immediately
        playPing();

        // Repeat pleasant notification chime periodically with nice cooldown (~2.5s)
        if (this.ringtoneInterval) clearInterval(this.ringtoneInterval);
        this.ringtoneInterval = setInterval(playPing, 2500);

        if (this.incomingCallTimer) clearTimeout(this.incomingCallTimer);
        this.incomingCallTimer = setTimeout(() => {
            this.stopIncomingCall();
        }, 30000);
    }

    @action stopIncomingCall() {
        if (this.incomingCallTimer) {
            clearTimeout(this.incomingCallTimer);
            this.incomingCallTimer = undefined;
        }
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = undefined;
        }
        const targetChannelId = this.incomingCall?.channelId;
        this.incomingCall = null;
        if (this.ringtoneAudio) {
            this.ringtoneAudio.pause();
            this.ringtoneAudio.currentTime = 0;
        }
        try {
            if ((window as any).native?.dismissIncomingCall) {
                (window as any).native.dismissIncomingCall(targetChannelId || null);
            }
        } catch (e) {}
    }

    @action handlePacket(packet: any, client: any) {
        if (!packet || typeof packet !== "object") return;

        switch (packet.type) {
            case "Ready": {
                this.channelVoiceStates.clear();
                if (Array.isArray(packet.voice_states)) {
                    for (const vs of packet.voice_states) {
                        if (!vs || !vs.id) continue;
                        const participants: ChannelVoiceParticipant[] = (
                            vs.participants || []
                        )
                            .map((p: any) => ({
                                id: typeof p === "string" ? p : p.id || p.user,
                                camera: !!p.camera,
                                screensharing: !!p.screensharing,
                                joined_at: p.joined_at,
                            }))
                            .filter((p: any) => !!p.id);
                        this.channelVoiceStates.set(vs.id, participants);
                    }
                }
                break;
            }
            case "VoiceChannelJoin": {
                const cid = packet.id;
                const uid = packet.state?.id || packet.user || packet.state;
                if (!cid || !uid) return;

                const prev = (this.channelVoiceStates.get(cid) || []).filter(
                    (p) => p.id !== uid,
                );
                const newParticipant: ChannelVoiceParticipant = {
                    id: uid,
                    camera: !!packet.state?.camera,
                    screensharing: !!packet.state?.screensharing,
                    joined_at: packet.state?.joined_at,
                };
                this.channelVoiceStates.set(cid, [...prev, newParticipant]);

                // Incoming call check for DM / Group
                const selfId = client?.user?._id;
                // Check if this user is already participating in this channel from another session/device
                const userAlreadyInChannel = prev.some((p) => p.id === selfId);

                if (selfId && uid !== selfId && this.roomId !== cid && !userAlreadyInChannel) {
                    const channel = client?.channels?.get(cid);
                    if (
                        channel &&
                        (channel.channel_type === "DirectMessage" ||
                            channel.channel_type === "Group")
                    ) {
                        const caller = client?.users?.get(uid);
                        const callerName =
                            caller?.display_name ??
                            caller?.username ??
                            "Пользователь";
                        this.triggerIncomingCall(cid, uid, callerName);
                    }
                }
                break;
            }
            case "VoiceChannelLeave": {
                const cid = packet.id;
                const uid = packet.user || packet.state?.id || packet.state;
                if (!cid || !uid) return;

                const prev = (this.channelVoiceStates.get(cid) || []).filter(
                    (p) => p.id !== uid,
                );
                this.channelVoiceStates.set(cid, prev);

                if (this.incomingCall?.channelId === cid && prev.length === 0) {
                    this.stopIncomingCall();
                }
                break;
            }
            case "VoiceChannelMove": {
                const fromId = packet.from;
                const toId = packet.to;
                const uid = packet.state?.id || packet.user || packet.state;
                if (fromId && uid) {
                    const prevFrom = (
                        this.channelVoiceStates.get(fromId) || []
                    ).filter((p) => p.id !== uid);
                    this.channelVoiceStates.set(fromId, prevFrom);
                }
                if (toId && uid) {
                    const prevTo = (
                        this.channelVoiceStates.get(toId) || []
                    ).filter((p) => p.id !== uid);
                    this.channelVoiceStates.set(toId, [
                        ...prevTo,
                        {
                            id: uid,
                            camera: !!packet.state?.camera,
                            screensharing: !!packet.state?.screensharing,
                            joined_at: packet.state?.joined_at,
                        },
                    ]);
                }
                break;
            }
            case "UserVoiceStateUpdate": {
                const cid = packet.id;
                const uid = packet.user;
                if (!cid || !uid) return;
                const parts = this.channelVoiceStates.get(cid);
                if (parts) {
                    this.channelVoiceStates.set(
                        cid,
                        parts.map((p) =>
                            p.id === uid ? { ...p, ...packet.data } : p,
                        ),
                    );
                }
                break;
            }
        }
    }

    // This takes information from the voice
    // client and applies it to the state here.
    @action syncState() {
        if (!this.client) return;
        this.roomId = toNullable(this.client.roomId);
        this.participants.clear();
        this.client.participants.forEach((v, k) =>
            this.participants.set(k, { ...v }),
        );
        this.activeSpeakers = new Set(this.client.activeSpeakers);
        this.videoTracks.clear();
        this.client.videoTracks.forEach((v, k) => this.videoTracks.set(k, v));
        this.screenThumbnails.clear();
        this.client.screenThumbnails.forEach((v, k) =>
            this.screenThumbnails.set(k, v),
        );
        this.watchingScreenUserId = toNullable(this.client.watchingUserId);
        this.streamVersion++;

        this.audioProducing = this.client.audioProducer !== undefined;
        this.screenProducing = this.client.screenProducer !== undefined;
        this.isDeafened = this.client.isDeaf;

        if (this.roomId && !this.connecting) {
            this.isMuted = !this.audioProducing;
            this.persistVoiceSettings();
        }
    }

    // This imports and constructs the voice client.
    @action async loadVoice() {
        if (this.status !== VoiceStatus.UNLOADED) return;
        this.status = VoiceStatus.LOADING;

        try {
            const { default: VoiceClient } = await import("./VoiceClient");
            const client = new VoiceClient();
            client.isDeaf = this.isDeafened;
            client.isMuted = this.isMuted || this.isDeafened;

            client.on("startProduce", this.syncState);
            client.on("stopProduce", this.syncState);
            client.on("userJoined", this.syncState);
            client.on("userLeft", this.syncState);
            client.on("userStartProduce", this.syncState);
            client.on("userStopProduce", this.syncState);
            client.on("activeSpeakersChanged", this.syncState);
            client.on("screenThumbnailUpdated", this.syncState);
            client.on("screenSubscriptionChanged", this.syncState);

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

        this.stopIncomingCall();
        this.connecting = true;
        this.status = VoiceStatus.CONNECTING;

        // If initiating a call in DM or Group and room is empty, notify chat with call started message
        const currentParticipants = this.getChannelParticipants(channel._id);
        if (
            currentParticipants.length === 0 &&
            (channel.channel_type === "DirectMessage" || channel.channel_type === "Group")
        ) {
            channel.sendMessage({ content: createCallStartedMessage() }).catch((err) => {
                console.warn("Failed to send call started message:", err);
            });
        }

        try {
            const call = await channel.joinCall();

            if (this.status !== VoiceStatus.CONNECTING) return;

            // Pass deafen & mute preferences to voice client
            const shouldBeMuted = this.isMuted || this.isDeafened;
            this.client.isDeaf = this.isDeafened;
            this.client.isMuted = shouldBeMuted;

            await this.client.connect(call.url, channel._id, call.token, {
                isDeaf: this.isDeafened,
                isMuted: shouldBeMuted,
            });

            runInAction(() => {
                this.status = VoiceStatus.CONNECTED;
                this.connecting = false;
                this.roomId = channel._id;
                this.audioProducing = this.client?.audioProducer !== undefined;
                this.screenProducing =
                    this.client?.screenProducer !== undefined;
            });
            this.syncState();

            if (this.isDeafened) {
                this.client.setDeaf(true);
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
        this.stopIncomingCall();
        this.connecting = false;
        this.status = VoiceStatus.READY;
        this.roomId = null;
        this.audioProducing = false;
        this.screenProducing = false;
        this.watchingScreenUserId = null;
        this.screenThumbnails.clear();
        this.streamVersion++;
        // User's chosen isMuted and isDeafened settings are preserved!

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
        this.persistVoiceSettings();

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
        this.persistVoiceSettings();
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
        this.persistVoiceSettings();
        this.syncState();
    }

    @action async startProducing(
        type: ProduceType,
        screenOpts?: ScreenShareOptions,
    ) {
        if (type === "audio") {
            this.isMuted = false;
            if (this.isDeafened) {
                this.isDeafened = false;
                if (this.client) {
                    this.client.setDeaf(false);
                }
            }
            this.persistVoiceSettings();
            if (this.client && this.roomId) {
                if (this.client.audioProducer === undefined) {
                    await this.client.startProduce({} as any, "audio");
                }
            }
        } else if (type === "screen") {
            if (this.client?.screenProducer !== undefined) return;
            await this.client?.startProduce({} as any, "screen", screenOpts);
        }
        this.syncState();
    }

    @action async stopProducing(type: ProduceType) {
        if (type === "audio") {
            this.isMuted = true;
            this.persistVoiceSettings();
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
