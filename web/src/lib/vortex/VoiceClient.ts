import EventEmitter from "eventemitter3";
import {
    Room,
    RoomEvent,
    Track,
    RemoteParticipant,
    RemoteTrackPublication,
    RemoteTrack,
    Participant,
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

    async connect(url: string, roomId: string, token: string) {
        if (this.room) {
            this.disconnect();
        }

        this.roomId = roomId;
        this.participants.clear();
        this.activeSpeakers.clear();
        this.videoTracks.clear();

        const room = new Room({
            audioCaptureDefaults: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        this.room = room;

        room.on(RoomEvent.Connected, () => {
            this.emit("ready");
            if (!this.isDeaf) {
                room.localParticipant
                    .setMicrophoneEnabled(true)
                    .then((pub) => {
                        if (pub) {
                            this.audioProducer = pub;
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

    async startProduce(track: MediaStreamTrack, type: ProduceType) {
        if (!this.room) return;
        if (type === "audio") {
            try {
                const pub = await this.room.localParticipant.setMicrophoneEnabled(
                    true,
                );
                this.audioProducer = pub;
                this.emit("startProduce", "audio");
            } catch (err) {
                console.error("Failed to enable microphone:", err);
            }
        } else if (type === "screen") {
            try {
                let pub;
                try {
                    // Try with audio first (supported on Windows / some setups)
                    pub = await this.room.localParticipant.setScreenShareEnabled(
                        true,
                        { audio: true },
                    );
                } catch (audioErr) {
                    console.warn(
                        "Screen share with audio not supported on this platform, falling back to video only:",
                        audioErr,
                    );
                    pub = await this.room.localParticipant.setScreenShareEnabled(
                        true,
                        { audio: false },
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
