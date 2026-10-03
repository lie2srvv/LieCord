import {
    Desktop,
    Fullscreen,
    ExitFullscreen,
    Expand,
    Collapse,
    Show,
    LogOut,
} from "@styled-icons/boxicons-regular";
import {
    BarChartAlt2,
    Microphone,
    MicrophoneOff,
    PhoneOff,
    VolumeFull,
    VolumeMute,
} from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import styled, { css } from "styled-components/macro";

import { Text } from "preact-i18n";
import { useMemo, useRef, useEffect, useState } from "preact/hooks";

import { Button } from "@revoltchat/ui";

import { voiceState, VoiceStatus } from "../../../lib/vortex/VoiceState";

import Tooltip from "../../../components/common/Tooltip";
import UserIcon from "../../../components/common/user/UserIcon";
import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";

interface Props {
    id: string;
}

const VoiceBase = styled.div<{ expanded?: boolean }>`
    margin-top: 48px;
    padding: 16px 20px;
    background: var(--secondary-background);
    flex-shrink: 0;
    max-height: ${(props) => (props.expanded ? "52vh" : "none")};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;

    .status {
        display: flex;
        position: absolute;
        top: 16px;
        left: 20px;
        align-items: center;

        padding: 6px 10px;
        font-size: 12px;
        font-weight: 500;
        user-select: none;
        gap: 6px;

        color: var(--success);
        border-radius: var(--border-radius);
        background: var(--primary-background);
        z-index: 10;

        svg {
            cursor: help;
        }
    }

    .participants {
        margin: 16px 0 8px;
        justify-content: center;
        align-items: center;
        user-select: none;
        display: flex;
        flex-flow: row wrap;
        gap: 16px;

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
        margin-top: 8px;
        flex-shrink: 0;
    }
`;

const ScreenShareArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-bottom: 12px;
`;

const VideoBox = styled.div<{ expanded?: boolean; isFullscreen?: boolean }>`
    position: ${(props) =>
        props.isFullscreen ? "fixed !important" : "relative"};
    top: ${(props) => (props.isFullscreen ? "0 !important" : "auto")};
    left: ${(props) => (props.isFullscreen ? "0 !important" : "auto")};
    width: ${(props) => (props.isFullscreen ? "100vw !important" : "100%")};
    height: ${(props) =>
        props.isFullscreen
            ? "100vh !important"
            : props.expanded
            ? "calc(52vh - 64px)"
            : "260px"};
    max-width: ${(props) =>
        props.isFullscreen
            ? "100vw !important"
            : props.expanded
            ? "100%"
            : "520px"};
    max-height: ${(props) =>
        props.isFullscreen
            ? "100vh !important"
            : props.expanded
            ? "calc(52vh - 64px)"
            : "280px"};
    aspect-ratio: ${(props) =>
        props.isFullscreen || props.expanded ? "unset" : "16 / 9"};
    background: #0d0e11;
    border-radius: ${(props) => (props.isFullscreen ? "0 !important" : "10px")};
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    border: ${(props) =>
        props.isFullscreen
            ? "none !important"
            : "1px solid rgba(255, 255, 255, 0.1)"};
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: ${(props) => (props.isFullscreen ? "999999 !important" : "5")};
    user-select: none;
    transition: max-width 0.2s ease, height 0.2s ease;

    &:fullscreen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        max-width: 100vw !important;
        width: 100vw !important;
        height: 100vh !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        border: none !important;
        z-index: 999999 !important;
    }

    video {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
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
        z-index: 5;
    }

    .video-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        gap: 8px;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10;
    }

    &:hover .video-controls {
        opacity: 1;
    }

    .control-btn {
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ffffff;
        border-radius: 6px;
        padding: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease, transform 0.1s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(1.05);
        }

        &:active {
            transform: scale(0.95);
        }

        &.danger:hover {
            background: rgba(231, 76, 60, 0.8);
            border-color: #e74c3c;
        }
    }
`;

const StreamTile = styled.div<{ active?: boolean }>`
    width: 160px;
    height: 90px;
    background: #111214;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid
        ${(props) =>
            props.active
                ? "var(--accent, #5865f2)"
                : "rgba(255, 255, 255, 0.12)"};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease, border-color 0.15s ease,
        box-shadow 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &:hover {
        transform: scale(1.03);
        border-color: ${(props) =>
            props.active
                ? "var(--accent, #5865f2)"
                : "rgba(255, 255, 255, 0.3)"};
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: ${(props) => (props.active ? 0.35 : 0.75)};
        pointer-events: none;
    }

    img.stream-preview-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: ${(props) => (props.active ? 0.35 : 0.75)};
        pointer-events: none;
    }

    .stream-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.4);
        background: #18191c;
    }

    .badge-live {
        position: absolute;
        top: 6px;
        left: 6px;
        background: #e74c3c;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
        text-transform: uppercase;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
        z-index: 2;

        .live-dot {
            width: 6px;
            height: 6px;
            background: #ffffff;
            border-radius: 50%;
            display: inline-block;
        }
    }

    .badge-watching {
        position: absolute;
        top: 6px;
        right: 6px;
        background: var(--accent, #5865f2);
        color: #ffffff;
        font-size: 9px;
        font-weight: 700;
        padding: 2px 5px;
        border-radius: 4px;
        z-index: 2;
        text-transform: uppercase;
    }

    .stream-info {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 4px 6px;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
        font-size: 11px;
        font-weight: 600;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        z-index: 2;
    }

    .watch-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.15s ease;
        z-index: 3;

        button.watch-btn {
            background: var(--accent, #5865f2);
            color: #ffffff;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
            transition: background 0.15s;

            &:hover {
                background: #4752c4;
            }
        }
    }

    &:hover .watch-overlay {
        opacity: 1;
    }
`;

const ContextMenuOverlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1000000;
`;

const ContextMenuPopup = styled.div<{ x: number; y: number }>`
    position: fixed;
    top: ${(props) => props.y}px;
    left: ${(props) => props.x}px;
    background: #111214;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 1000001;
    min-width: 180px;

    button.menu-item {
        background: transparent;
        border: none;
        color: #dbdee1;
        padding: 8px 10px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, color 0.1s;

        &:hover {
            background: var(--accent, #5865f2);
            color: #ffffff;
        }

        &.danger {
            color: #e74c3c;
            &:hover {
                background: #e74c3c;
                color: #ffffff;
            }
        }
    }

    .divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
        margin: 4px 0;
    }
`;

function captureLastFrame(videoEl: HTMLVideoElement | null, userId: string) {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
    try {
        const canvas = document.createElement("canvas");
        const targetWidth = Math.min(videoEl.videoWidth, 480);
        const targetHeight = Math.round(
            (targetWidth / videoEl.videoWidth) * videoEl.videoHeight,
        );
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            voiceState.setScreenThumbnail(userId, dataUrl);
        }
    } catch (e) {
        console.warn("[VoiceHeader] Failed to capture last stream frame:", e);
    }
}

function CompactStreamTile({
    track,
    thumbnail,
    label,
    userId,
    isSelf,
    isWatched,
    onWatch,
    onContextMenu,
}: {
    track?: any;
    thumbnail?: string;
    label: string;
    userId: string;
    isSelf: boolean;
    isWatched: boolean;
    onWatch: () => void;
    onContextMenu: (e: any) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        // Live video is only rendered in the compact tile for local user preview.
        // Remotes use the static 0 KB/s snapshot frame to eliminate background bandwidth.
        if (!isSelf) return;
        const el = videoRef.current;
        if (!el || !track) return;
        track.attach(el);
        return () => {
            if (el) {
                track.detach(el);
            }
        };
    }, [track, isSelf]);

    return (
        <StreamTile
            active={isWatched}
            onClick={onWatch}
            onContextMenu={onContextMenu}>
            {isSelf ? (
                <video ref={videoRef} autoPlay playsInline muted />
            ) : thumbnail ? (
                <img
                    src={thumbnail}
                    alt={label}
                    className="stream-preview-img"
                />
            ) : (
                <div className="stream-placeholder">
                    <Desktop size={32} />
                </div>
            )}
            <div className="badge-live">
                <span className="live-dot" />В эфире
            </div>
            {isWatched && <div className="badge-watching">Просмотр</div>}
            <div className="stream-info">{label}</div>
            <div className="watch-overlay">
                <button
                    className="watch-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onWatch();
                    }}>
                    <Show size={14} />
                    {isWatched ? "Развернуть" : "Смотреть"}
                </button>
            </div>
        </StreamTile>
    );
}

function VideoTrackView({
    track,
    thumbnail,
    label,
    userId,
    isSelf,
    isExpanded,
    onToggleExpanded,
    onLeaveStream,
    onContextMenu,
}: {
    track?: any;
    thumbnail?: string;
    label: string;
    userId: string;
    isSelf: boolean;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    onLeaveStream: () => void;
    onContextMenu: (e: any) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

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

    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(
                Boolean(
                    document.fullscreenElement ||
                        (document as any).webkitFullscreenElement,
                ),
            );
        };
        document.addEventListener("fullscreenchange", handleFsChange);
        document.addEventListener("webkitfullscreenchange", handleFsChange);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isFullscreen) {
                toggleFullscreen();
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("fullscreenchange", handleFsChange);
            document.removeEventListener(
                "webkitfullscreenchange",
                handleFsChange,
            );
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isFullscreen]);

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            setIsFullscreen(true);
            const el = boxRef.current;
            if (el) {
                try {
                    if (el.requestFullscreen) {
                        el.requestFullscreen().catch(() => {});
                    } else if ((el as any).webkitRequestFullscreen) {
                        (el as any).webkitRequestFullscreen();
                    }
                } catch (_) {}
            }
        } else {
            setIsFullscreen(false);
            try {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if ((document as any).webkitExitFullscreen) {
                    (document as any).webkitExitFullscreen();
                }
            } catch (_) {}
        }
    };

    return (
        <VideoBox
            ref={boxRef}
            expanded={isExpanded}
            isFullscreen={isFullscreen}
            onContextMenu={onContextMenu}>
            {track ? (
                <video
                    id="main-stream-video"
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isSelf}
                />
            ) : thumbnail ? (
                <img
                    src={thumbnail}
                    alt={label}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                    }}
                />
            ) : (
                <div
                    style={{
                        color: "#ffffff",
                        fontSize: "14px",
                        fontWeight: 500,
                    }}>
                    Загрузка трансляции...
                </div>
            )}
            <div className="video-label">{label}</div>
            <div className="video-controls">
                <button
                    className="control-btn"
                    onClick={onToggleExpanded}
                    title={isExpanded ? "Свернуть" : "Во весь чат"}>
                    {isExpanded ? <Collapse size={18} /> : <Expand size={18} />}
                </button>
                <button
                    className="control-btn"
                    onClick={toggleFullscreen}
                    title={
                        isFullscreen
                            ? "Выйти из полноэкранного режима"
                            : "Полноэкранный режим"
                    }>
                    {isFullscreen ? (
                        <ExitFullscreen size={18} />
                    ) : (
                        <Fullscreen size={18} />
                    )}
                </button>
                <button
                    className="control-btn danger"
                    onClick={onLeaveStream}
                    title={
                        isSelf ? "Остановить трансляцию" : "Покинуть трансляцию"
                    }>
                    {isSelf ? <PhoneOff size={18} /> : <LogOut size={18} />}
                </button>
            </div>
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

    const [isExpanded, setIsExpanded] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        userId: string;
    } | null>(null);

    const watchedStreamUserId = voiceState.watchingScreenUserId;

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

    // Active streams: combines local presenter and remote participants who are currently screen sharing
    const activeStreamEntries = useMemo(() => {
        const entries: {
            userId: string;
            track: any;
            thumbnail?: string;
            label: string;
            isSelf: boolean;
        }[] = [];

        if (selfId && voiceState.isProducing("screen")) {
            entries.push({
                userId: selfId,
                track: voiceState.videoTracks.get(selfId),
                thumbnail: voiceState.screenThumbnails.get(selfId),
                label: "Ваш экран",
                isSelf: true,
            });
        }

        voiceState.participants.forEach((p, uid) => {
            if (uid === selfId) return;
            if (p.screen) {
                const u = client.users.get(uid);
                const name = u?.username ? `${u.username}` : "Экран участника";
                entries.push({
                    userId: uid,
                    track: voiceState.videoTracks.get(uid),
                    thumbnail: voiceState.screenThumbnails.get(uid),
                    label: name,
                    isSelf: false,
                });
            }
        });

        return entries;
    }, [
        voiceState.screenProducing,
        voiceState.participants.size,
        voiceState.videoTracks.size,
        voiceState.screenThumbnails.size,
        voiceState.streamVersion,
        client.users,
        selfId,
    ]);

    // If currently watched stream stopped sharing, reset watched state
    useEffect(() => {
        if (
            watchedStreamUserId &&
            !activeStreamEntries.some((v) => v.userId === watchedStreamUserId)
        ) {
            voiceState.setWatchingScreenUserId(null);
        }
    }, [watchedStreamUserId, activeStreamEntries]);

    const currentlyWatchedStream = useMemo(() => {
        if (!watchedStreamUserId) return null;
        return (
            activeStreamEntries.find((v) => v.userId === watchedStreamUserId) ||
            null
        );
    }, [watchedStreamUserId, activeStreamEntries]);

    const handleLeaveStream = (targetUserId: string) => {
        const videoEl = document.querySelector(
            "#main-stream-video",
        ) as HTMLVideoElement | null;
        if (videoEl) {
            captureLastFrame(videoEl, targetUserId);
        }
        if (targetUserId === selfId) {
            voiceState.stopProducing("screen");
        }
        voiceState.setWatchingScreenUserId(null);
    };

    const handleWatchStream = (targetUserId: string) => {
        voiceState.setWatchingScreenUserId(targetUserId);
    };

    const handleContextMenu = (e: MouseEvent, userId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: Math.min(e.clientX, window.innerWidth - 200),
            y: Math.min(e.clientY, window.innerHeight - 150),
            userId,
        });
    };

    return (
        <VoiceBase expanded={isExpanded && !!currentlyWatchedStream}>
            {/* If user is watching a stream, render the main player above */}
            {currentlyWatchedStream && (
                <ScreenShareArea>
                    <VideoTrackView
                        key={currentlyWatchedStream.userId}
                        track={currentlyWatchedStream.track}
                        thumbnail={currentlyWatchedStream.thumbnail}
                        label={currentlyWatchedStream.label}
                        userId={currentlyWatchedStream.userId}
                        isSelf={currentlyWatchedStream.isSelf}
                        isExpanded={isExpanded}
                        onToggleExpanded={() => setIsExpanded((prev) => !prev)}
                        onLeaveStream={() =>
                            handleLeaveStream(currentlyWatchedStream.userId)
                        }
                        onContextMenu={(e) =>
                            handleContextMenu(e, currentlyWatchedStream.userId)
                        }
                    />
                </ScreenShareArea>
            )}

            {/* Participants & stream preview cards (hidden when expanded for clean focus) */}
            {(!isExpanded || !currentlyWatchedStream) && (
                <div className="participants">
                    {/* Compact stream tiles appearing in line with avatars */}
                    {activeStreamEntries.map((v) => (
                        <CompactStreamTile
                            key={`tile-${v.userId}`}
                            track={v.track}
                            thumbnail={v.thumbnail}
                            label={v.label}
                            userId={v.userId}
                            isSelf={v.isSelf}
                            isWatched={watchedStreamUserId === v.userId}
                            onWatch={() => handleWatchStream(v.userId)}
                            onContextMenu={(e) =>
                                handleContextMenu(e, v.userId)
                            }
                        />
                    ))}

                    {/* Member Avatars */}
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
                                  const pInfo =
                                      voiceState.participants.get(user_id);
                                  voiceStatus = pInfo?.audio
                                      ? undefined
                                      : "muted";
                              }

                              return (
                                  <ParticipantWrapper
                                      key={user_id}
                                      speaking={isSpeaking}>
                                      <UserIcon
                                          size={80}
                                          target={
                                              user ??
                                              (isSelf ? self : undefined)
                                          }
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
            )}

            <div className="status">
                <BarChartAlt2 size={16} />
                {voiceState.status === VoiceStatus.CONNECTED && (
                    <Text id="app.main.channel.voice.connected" />
                )}
            </div>

            <div className="actions">
                <Tooltip content={"Отключиться"} placement={"top"}>
                    <Button palette="error" onClick={voiceState.disconnect}>
                        <PhoneOff width={20} />
                    </Button>
                </Tooltip>
                {voiceState.isProducing("audio") ? (
                    <Tooltip content={"Отключить микрофон"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.stopProducing("audio")}>
                            <Microphone width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Включить микрофон"} placement={"top"}>
                        <Button
                            palette="error"
                            onClick={() => voiceState.startProducing("audio")}>
                            <MicrophoneOff width={20} />
                        </Button>
                    </Tooltip>
                )}
                {voiceState.isDeaf() ? (
                    <Tooltip content={"Включить звук"} placement={"top"}>
                        <Button
                            palette="error"
                            onClick={() => voiceState.stopDeafen()}>
                            <VolumeMute width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Заглушить звук"} placement={"top"}>
                        <Button onClick={() => voiceState.startDeafen()}>
                            <VolumeFull width={20} />
                        </Button>
                    </Tooltip>
                )}
                {voiceState.isProducing("screen") ? (
                    <Tooltip
                        content={"Остановить демонстрацию экрана"}
                        placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopProducing("screen")}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Демонстрация экрана"} placement={"top"}>
                        <Button
                            onClick={() => {
                                modalController.push({ type: "screen_share" });
                            }}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                )}
            </div>

            {/* Discord-style Context Menu on right click */}
            {contextMenu && (
                <>
                    <ContextMenuOverlay
                        onClick={() => setContextMenu(null)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu(null);
                        }}
                    />
                    <ContextMenuPopup x={contextMenu.x} y={contextMenu.y}>
                        {watchedStreamUserId === contextMenu.userId ? (
                            <button
                                className="menu-item danger"
                                onClick={() => {
                                    handleLeaveStream(contextMenu.userId);
                                    setContextMenu(null);
                                }}>
                                <LogOut size={16} /> Покинуть трансляцию
                            </button>
                        ) : (
                            <button
                                className="menu-item"
                                onClick={() => {
                                    handleWatchStream(contextMenu.userId);
                                    setContextMenu(null);
                                }}>
                                <Show size={16} /> Смотреть трансляцию
                            </button>
                        )}

                        {contextMenu.userId === selfId && (
                            <button
                                className="menu-item danger"
                                onClick={() => {
                                    voiceState.stopProducing("screen");
                                    setContextMenu(null);
                                }}>
                                <Desktop size={16} /> Остановить трансляцию
                            </button>
                        )}

                        {watchedStreamUserId === contextMenu.userId && (
                            <>
                                <div className="divider" />
                                <button
                                    className="menu-item"
                                    onClick={() => {
                                        setIsExpanded((prev) => !prev);
                                        setContextMenu(null);
                                    }}>
                                    {" "}
                                    {isExpanded ? (
                                        <Collapse size={16} />
                                    ) : (
                                        <Expand size={16} />
                                    )}
                                    {isExpanded ? "Свернуть" : "Во весь чат"}
                                </button>
                            </>
                        )}
                    </ContextMenuPopup>
                </>
            )}
        </VoiceBase>
    );
});
