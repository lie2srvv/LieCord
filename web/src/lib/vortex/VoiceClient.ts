import EventEmitter from "eventemitter3";
import {
    Room,
    RoomEvent,
    Track,
    RemoteParticipant,
    RemoteTrackPublication,
    RemoteTrack,
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
}

export default class VoiceClient extends EventEmitter<VoiceEvents> {
    private room?: Room;
    public roomId?: string;
    public isDeaf: boolean = false;
    public participants: Map<string, VoiceUser> = new Map();
    public consumers: Map<string, any> = new Map();
    public audioProducer?: any;

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
        });

        room.on(RoomEvent.Disconnected, () => {
            this.emit("close");
        });

        room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
            const uid = p.identity;
            this.participants.set(uid, { audio: false });
            this.emit("userJoined", uid);
        });

        room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
            const uid = p.identity;
            this.participants.delete(uid);
            this.emit("userLeft", uid);
        });

        room.on(
            RoomEvent.TrackSubscribed,
            (
                track: RemoteTrack,
                publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                if (track.kind === Track.Kind.Audio) {
                    const el = track.attach();
                    el.id = `audio-${participant.identity}`;
                    if (this.isDeaf) {
                        el.muted = true;
                    }
                    document.body.appendChild(el);

                    const u = this.participants.get(participant.identity) || {};
                    u.audio = true;
                    this.participants.set(participant.identity, u);
                    this.emit(
                        "userStartProduce",
                        participant.identity,
                        "audio",
                    );
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
                if (track.kind === Track.Kind.Audio) {
                    track.detach().forEach((el) => el.remove());
                    const u = this.participants.get(participant.identity);
                    if (u) {
                        u.audio = false;
                    }
                    this.emit(
                        "userStopProduce",
                        participant.identity,
                        "audio",
                    );
                }
            },
        );

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
        this.roomId = undefined;
        this.participants.clear();
        this.audioProducer = undefined;
        this.emit("close");
    }

    async startProduce(track: MediaStreamTrack, type: ProduceType) {
        if (this.room && type === "audio") {
            const pub = await this.room.localParticipant.setMicrophoneEnabled(
                true,
            );
            this.audioProducer = pub;
            this.emit("startProduce", "audio");
        }
    }

    async stopProduce(type: ProduceType) {
        if (this.room && type === "audio") {
            await this.room.localParticipant.setMicrophoneEnabled(false);
            this.audioProducer = undefined;
            this.emit("stopProduce", "audio");
        }
    }
}
