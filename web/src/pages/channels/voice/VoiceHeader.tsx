import {
    BarChartAlt2,
    Microphone,
    MicrophoneOff,
    PhoneOff,
    VolumeFull,
    VolumeMute,
} from "@styled-icons/boxicons-solid";
import { Desktop } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import styled, { css } from "styled-components/macro";

import { Text } from "preact-i18n";
import { useMemo, useRef, useEffect } from "preact/hooks";

import { Button } from "@revoltchat/ui";

import { voiceState, VoiceStatus } from "../../../lib/vortex/VoiceState";

import Tooltip from "../../../components/common/Tooltip";
import UserIcon from "../../../components/common/user/UserIcon";
import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";

interface Props {
    id: string;
}

const VoiceBase = styled.div`
    margin-top: 48px;
    padding: 20px;
    background: var(--secondary-background);
    flex-grow: 1;

    .status {
        flex: 1 0;
        display: flex;
        position: absolute;
        align-items: center;

        padding: 10px;
        font-size: 13px;
        font-weight: 500;
        user-select: none;
        gap: 6px;

        color: var(--success);
        border-radius: var(--border-radius);
        background: var(--primary-background);

        svg {
            cursor: help;
        }
    }

    display: flex;
    flex-direction: column;

    .participants {
        margin: 20px 20px;
        justify-content: center;
        user-select: none;
        display: flex;
        flex-flow: row wrap;
        gap: 20px;

        div:hover img {
            opacity: 0.8;
        }

        .disconnected {
            opacity: 0.5;
        }
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 10px;
    }
`;

const ScreenShareArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-bottom: 20px;
    gap: 16px;
`;

const VideoBox = styled.div`
    position: relative;
    max-width: 900px;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #0d0e11;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--primary-background);

    video {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .video-label {
        position: absolute;
        bottom: 12px;
        left: 12px;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        color: #fff;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        pointer-events: none;
    }
`;

function VideoTrackView({ track, label }: { track: any; label: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !track) return;
        track.attach(el);
        return () => {
            if (el) {
                track.detach(el);
            }
        };
    }, [track]);

    return (
        <VideoBox>
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="video-label">{label}</div>
        </VideoBox>
    );
}

const ParticipantWrapper = styled.div<{ speaking?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    border-radius: 50%;
    transition: box-shadow 0.15s ease, transform 0.15s ease;

    ${(props) =>
        props.speaking &&
        css`
            box-shadow: 0 0 0 3px #57f287, 0 0 12px rgba(87, 242, 135, 0.6);
            transform: scale(1.03);
        `}
`;

export default observer(({ id }: Props) => {
    if (voiceState.roomId !== id) return null;

    const client = useClient();
    const selfId = client.user?._id;
    const self = selfId ? client.users.get(selfId) : undefined;

    // Collect all participant IDs in the call, ensuring local user (self) is always included
    const allParticipantIds = useMemo(() => {
        const idSet = new Set<string>();
        if (selfId) {
            idSet.add(selfId);
        }
        for (const k of voiceState.participants.keys()) {
            idSet.add(k);
        }
        return Array.from(idSet);
    }, [selfId, voiceState.participants.size]);

    const users = useMemo(() => {
        return allParticipantIds.map((key) => client.users.get(key));
    }, [allParticipantIds, client.users]);

    const activeVideoEntries = useMemo(() => {
        const entries: { userId: string; track: any; label: string }[] = [];
        voiceState.videoTracks.forEach((track, userId) => {
            const u = client.users.get(userId);
            const name =
                userId === selfId
                    ? "Ваш экран"
                    : u?.username
                      ? `${u.username}`
                      : "Экран участника";
            entries.push({ userId, track, label: name });
        });
        return entries;
    }, [voiceState.videoTracks.size, client.users, selfId]);

    return (
        <VoiceBase>
            {activeVideoEntries.length > 0 && (
                <ScreenShareArea>
                    {activeVideoEntries.map((v) => (
                        <VideoTrackView
                            key={v.userId}
                            track={v.track}
                            label={v.label}
                        />
                    ))}
                </ScreenShareArea>
            )}
            <div className="participants">
                {users && users.length !== 0
                    ? users.map((user, index) => {
                          const user_id = allParticipantIds[index];
                          const isSelf = user_id === selfId;
                          const isSpeaking = voiceState.isSpeaking(user_id);

                          let voiceStatus: "muted" | "deaf" | undefined;
                          if (isSelf) {
                              if (voiceState.isDeaf()) {
                                  voiceStatus = "deaf";
                              } else if (!voiceState.isProducing("audio")) {
                                  voiceStatus = "muted";
                              }
                          } else {
                              const pInfo = voiceState.participants.get(user_id);
                              voiceStatus = pInfo?.audio ? undefined : "muted";
                          }

                          return (
                              <ParticipantWrapper
                                  key={user_id}
                                  speaking={isSpeaking}>
                                  <UserIcon
                                      size={80}
                                      target={user ?? (isSelf ? self : undefined)}
                                      status={false}
                                      voice={voiceStatus}
                                      onClick={() =>
                                          modalController.push({
                                              type: "user_profile",
                                              user_id,
                                          })
                                      }
                                  />
                              </ParticipantWrapper>
                          );
                      })
                    : self !== undefined && (
                          <div key={self._id} className="disconnected">
                              <UserIcon
                                  size={80}
                                  target={self}
                                  status={false}
                              />
                          </div>
                      )}
            </div>
            <div className="status">
                <BarChartAlt2 size={16} />
                {voiceState.status === VoiceStatus.CONNECTED && (
                    <Text id="app.main.channel.voice.connected" />
                )}
            </div>
            <div className="actions">
                <Tooltip content={"Leave call"} placement={"top"}>
                    <Button palette="error" onClick={voiceState.disconnect}>
                        <PhoneOff width={20} />
                    </Button>
                </Tooltip>
                {voiceState.isProducing("audio") ? (
                    <Tooltip content={"Mute microphone"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.stopProducing("audio")}>
                            <Microphone width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Unmute microphone"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.startProducing("audio")}>
                            <MicrophoneOff width={20} />
                        </Button>
                    </Tooltip>
                )}
                {voiceState.isDeaf() ? (
                    <Tooltip content={"Undeafen"} placement={"top"}>
                        <Button onClick={() => voiceState.stopDeafen()}>
                            <VolumeMute width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Deafen"} placement={"top"}>
                        <Button onClick={() => voiceState.startDeafen()}>
                            <VolumeFull width={20} />
                        </Button>
                    </Tooltip>
                )}
                {voiceState.isProducing("screen") ? (
                    <Tooltip content={"Stop screen share"} placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopProducing("screen")}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Share screen"} placement={"top"}>
                        <Button
                            onClick={() => {
                                if (
                                    typeof window !== "undefined" &&
                                    window.native &&
                                    typeof window.native.getScreenSources === "function"
                                ) {
                                    modalController.push({ type: "screen_share" });
                                } else {
                                    voiceState.startProducing("screen");
                                }
                            }}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                )}
            </div>
        </VoiceBase>
    );
});
