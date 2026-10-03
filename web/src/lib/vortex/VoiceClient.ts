import EventEmitter from "eventemitter3";
import {
    Room,
    RoomEvent,
    Track,
    RemoteParticipant,
    RemoteTrackPublication,
    RemoteTrack,
    Participant,
    ScreenShareCaptureOptions,
    TrackProcessor,
    AudioProcessorOptions,
    TrackPublishOptions,
} from "livekit-client";
import { ProduceType, VoiceUser } from "./Types";

interface VoiceEvents {
    ready: () => void;
    error: (error: Error) => void;
    close: (error?: any) => void;

    startProduce: (type: ProduceType) => void;
    stopProduce: (type: ProduceType) => void;

    userJoined: (userId: string) => void;
    userLeft: (userId: string) => void;

    userStartProduce: (userId: string, type: ProduceType) => void;
    userStopProduce: (userId: string, type: ProduceType) => void;

    activeSpeakersChanged: (speakers: string[]) => void;
    screenThumbnailUpdated: (userId: string, dataUrl: string) => void;
    screenSubscriptionChanged: (userId: string, subscribed: boolean) => void;
}

export interface ScreenShareOptions {
    resolution?: { width: number; height: number; frameRate: number };
    audio?: boolean;
}

export const DEFAULT_AUDIO_CAPTURE_OPTIONS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceIsolation: true,
    googEchoCancellation: true,
    googAutoGainControl: true,
    googNoiseSuppression: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    googAudioMirroring: false,
};

/**
 * Lightweight noise gate and acoustic filter for voice chat.
 * - Filters low-frequency vibrations, keyboard thumps, and desk rumble (<85Hz).
 * - Measures pre-gain RMS signal volume in real-time.
 * - When volume is below threshold (-43dB), smoothly mutes audio to eliminate distant keystrokes,
 *   mouse clicks, breathing, and background music when the user isn't talking.
 * - When speech is detected, opens instantly (10-15ms attack) and holds for 350ms to keep word endings natural.
 */
class NoiseGateProcessor
    implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
    name = "liecord-noise-gate";
    processedTrack?: MediaStreamTrack;
    private audioContext?: AudioContext;
    private sourceNode?: MediaStreamAudioSourceNode;
    private filterNode?: BiquadFilterNode;
    private gainNode?: GainNode;
    private scriptProcessor?: ScriptProcessorNode;
    private dummyGain?: GainNode;
    private destNode?: MediaStreamAudioDestinationNode;
    private lastSpokeTime: number = 0;
    private isOpen: boolean = false;

    async init(opts: AudioProcessorOptions): Promise<void> {
        this.audioContext = opts.audioContext;
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume().catch(() => {});
        }

        const stream = new MediaStream([opts.track]);
        this.sourceNode = this.audioContext.createMediaStreamSource(stream);

        // Highpass filter: eliminates low rumble, keyboard bottoming-out thumps & distant bass
        this.filterNode = this.audioContext.createBiquadFilter();
        this.filterNode.type = "highpass";
        this.filterNode.frequency.value = 85;
        this.filterNode.Q.value = 0.7;

        // Smooth gain node for gating
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;

        this.destNode = this.audioContext.createMediaStreamDestination();

        // Main audio chain: source -> filter -> gain -> destination
        this.sourceNode.connect(this.filterNode);
        this.filterNode.connect(this.gainNode);
        this.gainNode.connect(this.destNode);

        // Continuous RMS level detection without background tab throttling
        this.scriptProcessor = this.audioContext.createScriptProcessor(
            1024,
            1,
            1,
        );
        this.dummyGain = this.audioContext.createGain();
        this.dummyGain.gain.value = 0;

        this.filterNode.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.dummyGain);
        this.dummyGain.connect(this.audioContext.destination);

        const thresholdDb = -43; // Sensitive enough for normal/quiet speech, silences keys and music
        const holdMs = 350; // Hold time between words

        this.scriptProcessor.onaudioprocess = (e: any) => {
            if (!this.gainNode || !this.audioContext) return;
            const input = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < input.length; i++) {
                sum += input[i] * input[i];
            }
            const rms = Math.sqrt(sum / input.length);
            const db = 20 * Math.log10(Math.max(rms, 1e-5));

            const now = performance.now();
            if (db > thresholdDb) {
                this.lastSpokeTime = now;
                if (!this.isOpen) {
                    this.isOpen = true;
                    this.gainNode.gain.cancelScheduledValues(
                        this.audioContext.currentTime,
                    );
                    this.gainNode.gain.setTargetAtTime(
                        1.0,
                        this.audioContext.currentTime,
                        0.012,
                    );
                }
            } else if (this.isOpen && now - this.lastSpokeTime > holdMs) {
                this.isOpen = false;
                this.gainNode.gain.cancelScheduledValues(
                    this.audioContext.currentTime,
                );
                this.gainNode.gain.setTargetAtTime(
                    0.0,
                    this.audioContext.currentTime,
                    0.06,
                );
            }
        };

        this.processedTrack = this.destNode.stream.getAudioTracks()[0];
    }

    async restart(opts: AudioProcessorOptions): Promise<void> {
        await this.destroy();
        await this.init(opts);
    }

    async destroy(): Promise<void> {
        if (this.scriptProcessor) {
            this.scriptProcessor.onaudioprocess = null;
        }
        try {
            this.sourceNode?.disconnect();
            this.filterNode?.disconnect();
            this.gainNode?.disconnect();
            this.scriptProcessor?.disconnect();
            this.dummyGain?.disconnect();
        } catch (_) {}
        this.processedTrack = undefined;
    }
}

export default class VoiceClient extends EventEmitter<VoiceEvents> {
    public room?: Room;
    public roomId?: string;
    public isDeaf: boolean = false;
    public isMuted: boolean = false;
    public participants: Map<string, VoiceUser> = new Map();
    public consumers: Map<string, any> = new Map();
    public audioProducer?: any;
    public screenProducer?: any;
    public activeSpeakers: Set<string> = new Set();
    public videoTracks: Map<string, Track> = new Map();

    // Screen share subscriptions and snapshots for 0 KB/s inactive preview
    public videoPublications: Map<string, RemoteTrackPublication> = new Map();
    public screenAudioPublications: Map<string, RemoteTrackPublication> = new Map();
    public screenThumbnails: Map<string, string> = new Map();
    public watchingUserId: string | null = null;

    supported(): boolean {
        return (
            typeof window !== "undefined" &&
            typeof RTCPeerConnection !== "undefined"
        );
    }

    private async applyAudioEnhancements(pub: any) {
        if (!pub || !pub.track) return;
        try {
            const track = pub.track;
            if (track.processor) return;
            if (
                typeof window !== "undefined" &&
                (window.AudioContext || (window as any).webkitAudioContext)
            ) {
                if (!track.audioContext) {
                    const ctx = new (window.AudioContext ||
                        (window as any).webkitAudioContext)();
                    if (ctx.state === "suspended") {
                        await ctx.resume().catch(() => {});
                    }
                    track.setAudioContext(ctx);
                }
                const processor = new NoiseGateProcessor();
                await track.setProcessor(processor);
                console.log(
                    "[VoiceClient] LieCord smart noise suppression & gate activated",
                );
            }
        } catch (err) {
            console.warn(
                "[VoiceClient] Could not apply audio processor, fallback to native constraints:",
                err,
            );
        }
    }

    /**
     * Grabs a single initial preview frame from a newly published remote screen share
     * and immediately unsubscribes (setSubscribed(false)) so the SFU stops transmitting
     * video packets, keeping bandwidth consumption at 0 KB/s until the user clicks "Watch".
     */
    private captureSingleFrame(
        uid: string,
        track: RemoteTrack,
        publication: RemoteTrackPublication,
    ) {
        try {
            const video = document.createElement("video");
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.style.position = "fixed";
            video.style.left = "-9999px";
            video.style.top = "-9999px";
            video.style.width = "480px";
            video.style.height = "270px";
            video.style.opacity = "0";
            video.style.pointerEvents = "none";
            document.body.appendChild(video);

            let unsubscribed = false;
            const done = () => {
                if (unsubscribed) return;
                unsubscribed = true;
                try {
                    track.detach(video);
                    video.remove();
                } catch (_) {}
                if (this.watchingUserId !== uid) {
                    try {
                        publication.setSubscribed(false);
                    } catch (err) {
                        console.warn(
                            "[VoiceClient] Failed to unsubscribe initial preview:",
                            err,
                        );
                    }
                }
            };

            const takeSnapshot = () => {
                try {
                    if (video.videoWidth > 0 && video.videoHeight > 0) {
                        const canvas = document.createElement("canvas");
                        const targetWidth = Math.min(video.videoWidth, 480);
                        const targetHeight = Math.round(
                            (targetWidth / video.videoWidth) * video.videoHeight,
                        );
                        canvas.width = targetWidth;
                        canvas.height = targetHeight;
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                            this.screenThumbnails.set(uid, dataUrl);
                            this.emit("screenThumbnailUpdated", uid, dataUrl);
                        }
                    }
                } catch (e) {
                    console.warn("[VoiceClient] Snapshot capture error:", e);
                } finally {
                    done();
                }
            };

            video.onloadeddata = () => {
                setTimeout(takeSnapshot, 80);
            };

            track.attach(video);
            video.play().catch(() => {});

            // Safety fallback: unsubscribe within 1.5 seconds if video never fires onloadeddata
            setTimeout(done, 1500);
        } catch (e) {
            console.warn("[VoiceClient] captureSingleFrame error:", e);
            if (this.watchingUserId !== uid) {
                try {
                    publication.setSubscribed(false);
                } catch (_) {}
            }
        }
    }

    setWatchingUserId(userId: string | null) {
        const prevWatching = this.watchingUserId;
        this.watchingUserId = userId;

        // Unsubscribe from previously watched stream
        if (prevWatching && prevWatching !== userId && this.room) {
            const pub = this.videoPublications.get(prevWatching);
            if (pub && pub.isSubscribed) {
                try {
                    pub.setSubscribed(false);
                } catch (_) {}
            }
            const audioPub = this.screenAudioPublications.get(prevWatching);
            if (audioPub && audioPub.isSubscribed) {
                try {
                    audioPub.setSubscribed(false);
                } catch (_) {}
            }
            document
                .querySelectorAll(`audio[id^='audio-screen-${prevWatching}-']`)
                .forEach((el) => {
                    el.remove();
                });
        }

        // Subscribe to newly watched stream
        if (userId && this.room) {
            const pub = this.videoPublications.get(userId);
            if (pub) {
                if (!pub.isSubscribed) {
                    try {
                        pub.setSubscribed(true);
                    } catch (_) {}
                }
                if (pub.track) {
                    this.videoTracks.set(userId, pub.track as any);
                    this.emit("userStartProduce", userId, "screen");
                }
            }
            const audioPub = this.screenAudioPublications.get(userId);
            if (audioPub) {
                if (!audioPub.isSubscribed) {
                    try {
                        audioPub.setSubscribed(true);
                    } catch (_) {}
                }
                if (audioPub.track) {
                    const el = audioPub.track.attach();
                    el.id = `audio-screen-${userId}-${audioPub.track.sid}`;
                    el.muted = this.isDeaf;
                    document.body.appendChild(el);
                }
            }
        }
    }

    setScreenThumbnail(userId: string, dataUrl: string) {
        this.screenThumbnails.set(userId, dataUrl);
        this.emit("screenThumbnailUpdated", userId, dataUrl);
    }

    async connect(
        url: string,
        roomId: string,
        token: string,
        initialOptions?: { isMuted?: boolean; isDeaf?: boolean },
    ) {
        if (this.room) {
            this.disconnect();
        }

        if (initialOptions) {
            if (typeof initialOptions.isMuted === "boolean") {
                this.isMuted = initialOptions.isMuted;
            }
            if (typeof initialOptions.isDeaf === "boolean") {
                this.isDeaf = initialOptions.isDeaf;
            }
        }

        this.roomId = roomId;
        this.participants.clear();
        this.activeSpeakers.clear();
        this.videoTracks.clear();
        this.videoPublications.clear();
        this.screenAudioPublications.clear();
        this.screenThumbnails.clear();
        this.watchingUserId = null;

        const room = new Room({
            audioCaptureDefaults: DEFAULT_AUDIO_CAPTURE_OPTIONS as any,
        });

        this.room = room;

        room.on(RoomEvent.Connected, () => {
            this.emit("ready");
        });

        room.on(RoomEvent.Disconnected, () => {
            this.emit("close");
        });

        room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
            const uid = p.identity;
            this.participants.set(uid, {
                audio: p.isMicrophoneEnabled,
                screen: p.isScreenShareEnabled,
                speaking: false,
            });
            this.emit("userJoined", uid);
        });

        room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
            const uid = p.identity;
            this.participants.delete(uid);
            this.activeSpeakers.delete(uid);
            this.videoTracks.delete(uid);
            this.videoPublications.delete(uid);
            this.screenAudioPublications.delete(uid);
            this.screenThumbnails.delete(uid);
            if (this.watchingUserId === uid) {
                this.watchingUserId = null;
            }
            document
                .querySelectorAll(`audio[id^='audio-screen-${uid}-']`)
                .forEach((el) => el.remove());
            this.emit("userLeft", uid);
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
            this.activeSpeakers.clear();
            for (const s of speakers) {
                if (s.identity) {
                    this.activeSpeakers.add(s.identity);
                }
            }
            this.emit(
                "activeSpeakersChanged",
                Array.from(this.activeSpeakers),
            );
        });

        room.on(
            RoomEvent.TrackPublished,
            (
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                const uid = participant.identity;
                if (publication.source === Track.Source.ScreenShare) {
                    this.videoPublications.set(uid, publication);
                    const u = this.participants.get(uid) || {};
                    u.screen = true;
                    this.participants.set(uid, u);
                    this.emit("userStartProduce", uid, "screen");
                } else if (publication.source === Track.Source.ScreenShareAudio) {
                    this.screenAudioPublications.set(uid, publication);
                }
            },
        );

        room.on(
            RoomEvent.TrackUnpublished,
            (
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                const uid = participant.identity;
                if (publication.source === Track.Source.ScreenShare) {
                    this.videoPublications.delete(uid);
                    this.screenThumbnails.delete(uid);
                    this.videoTracks.delete(uid);
                    const u = this.participants.get(uid);
                    if (u) {
                        u.screen = false;
                    }
                    if (this.watchingUserId === uid) {
                        this.watchingUserId = null;
                    }
                    this.emit("userStopProduce", uid, "screen");
                } else if (publication.source === Track.Source.ScreenShareAudio) {
                    this.screenAudioPublications.delete(uid);
                    document
                        .querySelectorAll(`audio[id^='audio-screen-${uid}-']`)
                        .forEach((el) => {
                            el.remove();
                        });
                }
            },
        );

        room.on(
            RoomEvent.TrackSubscribed,
            (
                track: RemoteTrack,
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                const uid = participant.identity;
                const u = this.participants.get(uid) || {};

                if (track.kind === Track.Kind.Audio) {
                    if (publication.source === Track.Source.ScreenShareAudio) {
                        this.screenAudioPublications.set(uid, publication);
                        if (this.watchingUserId !== uid) {
                            try {
                                publication.setSubscribed(false);
                            } catch (_) {}
                        } else {
                            const el = track.attach();
                            el.id = `audio-screen-${uid}-${track.sid}`;
                            el.muted = this.isDeaf;
                            document.body.appendChild(el);
                        }
                    } else {
                        const el = track.attach();
                        el.id = `audio-${uid}-${track.sid}`;
                        if (this.isDeaf) {
                            el.muted = true;
                        }
                        document.body.appendChild(el);

                        u.audio = true;
                        this.participants.set(uid, u);
                        this.emit("userStartProduce", uid, "audio");
                    }
                } else if (track.kind === Track.Kind.Video) {
                    this.videoPublications.set(uid, publication);
                    u.screen = true;
                    this.participants.set(uid, u);

                    if (this.watchingUserId === uid) {
                        this.videoTracks.set(uid, track);
                        this.emit("userStartProduce", uid, "screen");
                    } else {
                        this.captureSingleFrame(uid, track, publication);
                    }
                }
            },
        );

        room.on(
            RoomEvent.TrackUnsubscribed,
            (
                track: RemoteTrack,
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                const uid = participant.identity;
                const u = this.participants.get(uid);

                if (track.kind === Track.Kind.Audio) {
                    track.detach().forEach((el) => el.remove());
                    if (publication.source !== Track.Source.ScreenShareAudio) {
                        if (u) {
                            u.audio = false;
                        }
                        this.emit("userStopProduce", uid, "audio");
                    }
                } else if (track.kind === Track.Kind.Video) {
                    track.detach().forEach((el) => el.remove());
                    this.videoTracks.delete(uid);
                    this.emit("screenSubscriptionChanged", uid, false);
                }
            },
        );

        room.on(RoomEvent.TrackMuted, (publication, participant) => {
            const uid = participant.identity;
            const u = this.participants.get(uid);
            if (publication.kind === Track.Kind.Audio) {
                if (u) u.audio = false;
                this.emit("userStopProduce", uid, "audio");
            } else if (publication.kind === Track.Kind.Video) {
                if (u) u.screen = false;
                this.emit("userStopProduce", uid, "screen");
            }
        });

        room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
            const uid = participant.identity;
            const u = this.participants.get(uid);
            if (publication.kind === Track.Kind.Audio) {
                if (u) u.audio = true;
                this.emit("userStartProduce", uid, "audio");
            } else if (publication.kind === Track.Kind.Video) {
                if (u) u.screen = true;
                this.emit("userStartProduce", uid, "screen");
            }
        });

        room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
            if (publication.source === Track.Source.ScreenShare) {
                this.screenProducer = undefined;
                if (this.room) {
                    this.videoTracks.delete(this.room.localParticipant.identity);
                }
                this.emit("stopProduce", "screen");
            } else if (publication.source === Track.Source.Microphone) {
                this.audioProducer = undefined;
                this.emit("stopProduce", "audio");
            }
        });

        await room.connect(url, token);

        // Auto-enable microphone if user is not deafened and not muted
        if (!this.isDeaf && !this.isMuted) {
            try {
                if (typeof window !== "undefined" && (window as any).native?.requestMicrophoneAccess) {
                    await (window as any).native.requestMicrophoneAccess();
                }
                const pub = await room.localParticipant.setMicrophoneEnabled(
                    true,
                    DEFAULT_AUDIO_CAPTURE_OPTIONS as any,
                );
                if (pub) {
                    this.audioProducer = pub;
                    await this.applyAudioEnhancements(pub);
                    this.emit("startProduce", "audio");
                }
            } catch (err) {
                console.warn("Could not auto-enable microphone:", err);
                this.isMuted = true;
            }
        }
    }

    disconnect() {
        if (this.room) {
            this.room.disconnect();
            this.room.removeAllListeners();
            this.room = undefined;
        }
        document.querySelectorAll("audio[id^='audio-']").forEach((el) => {
            el.remove();
        });
        document.querySelectorAll("video[id^='video-screen-']").forEach((el) => {
            el.remove();
        });
        this.roomId = undefined;
        this.participants.clear();
        this.activeSpeakers.clear();
        this.videoTracks.clear();
        this.videoPublications.clear();
        this.screenAudioPublications.clear();
        this.screenThumbnails.clear();
        this.watchingUserId = null;
        this.audioProducer = undefined;
        this.screenProducer = undefined;
        // Keep isDeaf and isMuted intact across calls
        this.emit("close");
    }

    setDeaf(deaf: boolean) {
        this.isDeaf = deaf;
        if (deaf) {
            this.isMuted = true;
        }
        document.querySelectorAll("audio[id^='audio-']").forEach((el) => {
            const audioEl = el as HTMLAudioElement;
            audioEl.muted = deaf;
            if (!deaf) {
                audioEl.play().catch(() => {});
            }
        });
    }

    async startProduce(
        track: MediaStreamTrack,
        type: ProduceType,
        screenOpts?: ScreenShareOptions,
    ) {
        if (!this.room) return;
        if (type === "audio") {
            try {
                if (typeof window !== "undefined" && (window as any).native?.requestMicrophoneAccess) {
                    await (window as any).native.requestMicrophoneAccess();
                }
                this.isMuted = false;
                const pub = await this.room.localParticipant.setMicrophoneEnabled(
                    true,
                    DEFAULT_AUDIO_CAPTURE_OPTIONS as any,
                );
                this.audioProducer = pub;
                await this.applyAudioEnhancements(pub);
                this.emit("startProduce", "audio");
                if (typeof window !== "undefined") {
                    window.localStorage.setItem("audioPermissionGranted", "true");
                }
            } catch (err) {
                console.error("Failed to enable microphone:", err);
            }
        } else if (type === "screen") {
            try {
                const captureResolution = screenOpts?.resolution ?? {
                    width: 1280,
                    height: 720,
                    frameRate: 30,
                };
                const captureOpts: ScreenShareCaptureOptions = {
                    audio: screenOpts?.audio !== false,
                    resolution: captureResolution,
                };

                // Compute optimal encoding bitrate based on target resolution and framerate
                const maxDim = Math.max(captureResolution.width, captureResolution.height);
                const fps = captureResolution.frameRate || 30;
                let maxBitrate = 4_000_000;
                if (maxDim <= 854) {
                    maxBitrate = fps > 30 ? 1_200_000 : 800_000;
                } else if (maxDim <= 1280) {
                    maxBitrate = fps > 30 ? 3_000_000 : 2_000_000;
                } else if (maxDim <= 1920) {
                    maxBitrate = fps > 30 ? 5_500_000 : 3_800_000;
                } else if (maxDim <= 2560) {
                    // 2K (1440p)
                    maxBitrate = fps > 30 ? 7_500_000 : 5_200_000;
                } else {
                    // UHD 4K
                    maxBitrate = fps > 30 ? 9_000_000 : 6_500_000;
                }

                const publishOpts: TrackPublishOptions = {
                    screenShareEncoding: {
                        maxBitrate,
                        maxFramerate: fps,
                    },
                    degradationPreference: 'maintain-resolution',
                    simulcast: false, // Ensure full original stream is transmitted directly
                };

                let pub;
                try {
                    // Try with audio first if requested
                    pub = await this.room.localParticipant.setScreenShareEnabled(
                        true,
                        captureOpts,
                        publishOpts,
                    );
                } catch (audioErr) {
                    console.warn(
                        "Screen share with audio failed, falling back to video only:",
                        audioErr,
                    );
                    pub = await this.room.localParticipant.setScreenShareEnabled(
                        true,
                        {
                            audio: false,
                            resolution: captureResolution,
                        },
                        publishOpts,
                    );
                }

                if (pub) {
                    this.screenProducer = pub;
                    if (pub.track && this.room) {
                        this.videoTracks.set(
                            this.room.localParticipant.identity,
                            pub.track as any,
                        );
                    }
                    // Apply sender encoding parameters directly to guarantee bitrate & fps
                    const sender = (pub as any).track?.sender || (pub as any).sender;
                    if (sender && typeof sender.getParameters === "function") {
                        try {
                            const params = sender.getParameters();
                            if (params.encodings && params.encodings.length > 0) {
                                params.encodings[0].maxBitrate = maxBitrate;
                                params.encodings[0].maxFramerate = fps;
                                await sender.setParameters(params);
                            }
                        } catch (e) {
                            console.warn("Could not set sender parameters:", e);
                        }
                    }
                    this.emit("startProduce", "screen");
                }
            } catch (err) {
                console.error("Failed to start screen share or cancelled by user:", err);
                this.screenProducer = undefined;
            }
        }
    }

    async stopProduce(type: ProduceType) {
        if (!this.room) return;
        if (type === "audio") {
            this.isMuted = true;
            try {
                await this.room.localParticipant.setMicrophoneEnabled(false);
            } catch (err) {
                console.warn("Failed to stop microphone:", err);
            }
            this.audioProducer = undefined;
            this.emit("stopProduce", "audio");
        } else if (type === "screen") {
            try {
                await this.room.localParticipant.setScreenShareEnabled(false);
            } catch (err) {
                console.warn("Failed to stop screen share:", err);
            }
            if (this.room) {
                this.videoTracks.delete(this.room.localParticipant.identity);
            }
            this.screenProducer = undefined;
            this.emit("stopProduce", "screen");
        }
    }
}
