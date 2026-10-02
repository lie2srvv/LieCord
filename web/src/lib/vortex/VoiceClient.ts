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
    public participants: Map<string, VoiceUser> = new Map();
    public consumers: Map<string, any> = new Map();
    public audioProducer?: any;
    public screenProducer?: any;
    public activeSpeakers: Set<string> = new Set();
    public videoTracks: Map<string, Track> = new Map();

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

    async connect(url: string, roomId: string, token: string) {
        if (this.room) {
            this.disconnect();
        }

        this.roomId = roomId;
        this.participants.clear();
        this.activeSpeakers.clear();
        this.videoTracks.clear();

        const room = new Room({
            audioCaptureDefaults: DEFAULT_AUDIO_CAPTURE_OPTIONS as any,
        });

        this.room = room;

        room.on(RoomEvent.Connected, () => {
            this.emit("ready");
            if (!this.isDeaf) {
                room.localParticipant
                    .setMicrophoneEnabled(
                        true,
                        DEFAULT_AUDIO_CAPTURE_OPTIONS as any,
                    )
                    .then(async (pub) => {
                        if (pub) {
                            this.audioProducer = pub;
                            await this.applyAudioEnhancements(pub);
                            this.emit("startProduce", "audio");
                        }
                    })
                    .catch((err) => {
                        console.warn("Could not auto-enable microphone:", err);
                    });
            }
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
            RoomEvent.TrackSubscribed,
            (
                track: RemoteTrack,
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                const uid = participant.identity;
                const u = this.participants.get(uid) || {};

                if (track.kind === Track.Kind.Audio) {
                    const el = track.attach();
                    el.id = `audio-${uid}-${track.sid}`;
                    if (this.isDeaf) {
                        el.muted = true;
                    }
                    document.body.appendChild(el);

                    u.audio = true;
                    this.participants.set(uid, u);
                    this.emit("userStartProduce", uid, "audio");
                } else if (track.kind === Track.Kind.Video) {
                    u.screen = true;
                    this.participants.set(uid, u);
                    this.videoTracks.set(uid, track);
                    this.emit("userStartProduce", uid, "screen");
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
                    if (u) {
                        u.audio = false;
                    }
                    this.emit("userStopProduce", uid, "audio");
                } else if (track.kind === Track.Kind.Video) {
                    track.detach().forEach((el) => el.remove());
                    this.videoTracks.delete(uid);
                    if (u) {
                        u.screen = false;
                    }
                    this.emit("userStopProduce", uid, "screen");
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
            }
        });

        await room.connect(url, token);
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
        this.audioProducer = undefined;
        this.screenProducer = undefined;
        this.isDeaf = false;
        this.emit("close");
    }

    setDeaf(deaf: boolean) {
        this.isDeaf = deaf;
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
                    width: 2560,
                    height: 1440,
                    frameRate: 60,
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
