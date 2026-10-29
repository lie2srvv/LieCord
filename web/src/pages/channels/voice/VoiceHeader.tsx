import {
    Crop,
    RotateRight,
    Refresh,
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
    Camera,
    CameraOff,
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
import { isTouchscreenDevice } from "../../../lib/isTouchscreenDevice";
import {
    CameraDevice,
    getAvailableCameras,
    isMobileOrTouchDevice,
} from "../../../lib/vortex/cameraUtils";

interface Props {
    id: string;
}

const VoiceBase = styled.div<{ expanded?: boolean }>`
    margin-top: var(--header-height, 48px);
    padding: ${(props) => (props.expanded ? "10px 14px 14px" : "16px 20px")};
    background: var(--secondary-background);
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    flex-shrink: 0;
    max-height: ${(props) => (props.expanded ? "60vh" : "none")};
    height: ${(props) => (props.expanded ? "55vh" : "auto")};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;

    @media (max-width: 768px) {
        max-height: ${(props) => (props.expanded ? "65vh" : "none")};
        height: ${(props) => (props.expanded ? "58vh" : "auto")};
        min-height: ${(props) => (props.expanded ? "320px" : "auto")};
        padding: ${(props) => (props.expanded ? "8px 8px 14px" : "10px 12px")};
        overflow: ${(props) => (props.expanded ? "hidden" : "visible")};
    }

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
        align-items: center;
        gap: 8px;
        margin-top: auto;
        padding-top: 6px;
        padding-bottom: 2px;
        flex-shrink: 0;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        z-index: 10;

        @media (max-width: 480px) {
            gap: 4px;
            padding-bottom: 2px;
        }

        > div {
            flex: 0 1 auto;
            display: inline-flex;
        }

        button {
            min-width: unset !important;
            width: auto !important;
            padding: 8px 14px !important;
            border-radius: 12px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 1 !important;

            @media (max-width: 480px) {
                padding: 7px 8px !important;
            }

            @media (max-width: 360px) {
                padding: 6px 6px !important;
            }
        }
    }
`;

const ScreenShareArea = styled.div<{ isFullscreen?: boolean; expanded?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    flex: ${(props) => (props.expanded ? "1 1 0" : "0 0 auto")};
    min-height: ${(props) =>
        props.isFullscreen ? "260px" : props.expanded ? "0" : "auto"};
    height: ${(props) => (props.isFullscreen ? "100%" : "auto")};
    margin-bottom: ${(props) => (props.isFullscreen ? "0" : "6px")};
    overflow: hidden;
    position: relative;

    @media (max-width: 768px) {
        width: 100%;
        flex: ${(props) => (props.expanded ? "1 1 0" : "0 0 auto")};
        min-height: ${(props) =>
            props.isFullscreen ? "100%" : props.expanded ? "0" : "180px"};
        height: ${(props) => (props.isFullscreen ? "100%" : "auto")};
        margin-bottom: ${(props) => (props.expanded ? "6px" : "4px")};
    }
`;

const VideoBox = styled.div<{
    expanded?: boolean;
    isFullscreen?: boolean;
    isCropped?: boolean;
    rotation?: number;
    controlsVisible?: boolean;
}>`
    position: ${(props) =>
        props.isFullscreen ? "fixed !important" : "relative"};
    top: ${(props) => (props.isFullscreen ? "0 !important" : "auto")};
    left: ${(props) => (props.isFullscreen ? "0 !important" : "auto")};
    right: ${(props) => (props.isFullscreen ? "0 !important" : "auto")};
    bottom: ${(props) => (props.isFullscreen ? "0 !important" : "auto")};
    width: ${(props) => (props.isFullscreen ? "100% !important" : "100%")};
    height: ${(props) =>
        props.isFullscreen
            ? "100% !important"
            : props.expanded
            ? "100%"
            : "260px"};
    max-width: ${(props) =>
        props.isFullscreen
            ? "100% !important"
            : props.expanded
            ? "100%"
            : "520px"};
    max-height: ${(props) =>
        props.isFullscreen
            ? "100% !important"
            : props.expanded
            ? "100%"
            : "280px"};
    aspect-ratio: ${(props) =>
        props.isFullscreen || props.expanded ? "unset" : "16 / 9"};
    background: #000;
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
    z-index: ${(props) => (props.isFullscreen ? "100000 !important" : "5")};
    user-select: none;
    transition: max-width 0.2s ease, height 0.2s ease;
    cursor: pointer;

    @media (max-width: 768px) {
        width: 100%;
        max-width: 100%;
        height: ${(props) =>
            props.isFullscreen
                ? "100% !important"
                : props.expanded
                ? "100%"
                : "200px"};
        min-height: ${(props) =>
            props.isFullscreen
                ? "100% !important"
                : props.expanded
                ? "0"
                : "180px"};
        max-height: ${(props) =>
            props.isFullscreen
                ? "100% !important"
                : props.expanded
                ? "100%"
                : "240px"};
    }

    &:fullscreen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        border-radius: 0 !important;
        border: none !important;
        z-index: 100000 !important;
    }

    video {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: ${(props) => (props.isCropped ? "cover" : "contain")};
        transform: ${(props) =>
            props.rotation ? `rotate(${props.rotation}deg)` : "none"};
        transition: transform 0.2s ease, object-fit 0.2s ease;
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
        opacity: ${(props) => (props.controlsVisible ? "1" : "0")};
        transition: opacity 0.2s ease;
        z-index: 10;

        &.visible {
            opacity: 1;
        }
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

        &.active {
            background: var(--accent, #5865f2);
            border-color: #5865f2;
            color: #ffffff;
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
    transition:
        transform 0.15s ease,
        border-color 0.15s ease,
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

const CameraPickerPopup = styled.div<{ x: number; y: number }>`
    position: fixed;
    top: ${(props) => props.y}px;
    left: ${(props) => props.x}px;
    background: #111214;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1000001;
    min-width: 220px;
    max-width: 320px;

    .picker-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #949ba4;
        padding: 4px 8px 6px;
    }

    button.camera-item {
        background: transparent;
        border: none;
        color: #dbdee1;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, color 0.1s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        &:hover {
            background: var(--accent, #5865f2);
            color: #ffffff;
        }
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
        transition:
            background 0.1s,
            color 0.1s;

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

function safeAttachTrack(track: any, el: HTMLVideoElement | null) {
    if (!el || !track) return () => {};
    try {
        if (typeof track.attach === "function") {
            track.attach(el);
            return () => {
                try {
                    if (typeof track.detach === "function") {
                        track.detach(el);
                    }
                } catch (_) {}
            };
        } else if (track.mediaStreamTrack) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            el.srcObject = stream;
            el.play().catch(() => {});
            return () => {
                if (el.srcObject === stream) {
                    el.srcObject = null;
                }
            };
        } else if (track instanceof MediaStream) {
            el.srcObject = track;
            el.play().catch(() => {});
            return () => {
                if (el.srcObject === track) {
                    el.srcObject = null;
                }
            };
        } else if (
            track instanceof MediaStreamTrack ||
            (track && typeof track.stop === "function" && track.kind === "video")
        ) {
            const stream = new MediaStream([track]);
            el.srcObject = stream;
            el.play().catch(() => {});
            return () => {
                if (el.srcObject === stream) {
                    el.srcObject = null;
                }
            };
        }
    } catch (e) {
        console.warn("[VoiceHeader] Failed to attach media track:", e);
    }
    return () => {};
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
        return safeAttachTrack(track, el);
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
    onFullscreenChange,
    isCamera,
    onSwitchCamera,
    canSwitchCamera,
    isMobileDevice,
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
    onFullscreenChange?: (isFullscreen: boolean) => void;
    isCamera?: boolean;
    onSwitchCamera?: () => void;
    canSwitchCamera?: boolean;
    isMobileDevice?: boolean;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCropped, setIsCropped] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [controlsVisible, setControlsVisible] = useState(true);
    const controlsTimerRef = useRef<any>(null);

    const showControlsBriefly = () => {
        setControlsVisible(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            setControlsVisible(false);
        }, 3500);
    };

    useEffect(() => {
        showControlsBriefly();
        return () => {
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        };
    }, [isFullscreen]);

    useEffect(() => {
        onFullscreenChange?.(isFullscreen);
        if (isFullscreen) {
            (window as any).__liecordExitFullscreen = () => {
                toggleFullscreen();
                return true;
            };
        } else {
            if ((window as any).__liecordExitFullscreen) {
                (window as any).__liecordExitFullscreen = null;
            }
        }
        return () => {
            (window as any).__liecordExitFullscreen = null;
        };
    }, [isFullscreen]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !track) return;
        return safeAttachTrack(track, el);
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
            showControlsBriefly();
            if (!isTouchscreenDevice && !(window as any).isLieCordApp) {
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
            }
        } else {
            setIsFullscreen(false);
            try {
                if (
                    document.fullscreenElement ||
                    (document as any).webkitFullscreenElement
                ) {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(() => {});
                    } else if ((document as any).webkitExitFullscreen) {
                        (document as any).webkitExitFullscreen();
                    }
                }
            } catch (_) {}
            const contentEl = document.querySelector("[data-component=\"content\"]");
            if (contentEl && contentEl.scrollTop > 0) {
                contentEl.scrollTop = 0;
            }
        }
    };

    return (
        <VideoBox
            ref={boxRef}
            expanded={isExpanded}
            isFullscreen={isFullscreen}
            isCropped={isCropped}
            rotation={rotation}
            controlsVisible={controlsVisible}
            onClick={showControlsBriefly}
            onMouseMove={showControlsBriefly}
            onTouchStart={showControlsBriefly}
            onDblClick={toggleFullscreen}
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
                        objectFit: isCropped ? "cover" : "contain",
                        transform: rotation
                            ? `rotate(${rotation}deg)`
                            : "none",
                        transition:
                            "transform 0.2s ease, object-fit 0.2s ease",
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
            <div className={`video-controls ${controlsVisible ? "visible" : ""}`}>
                <button
                    className={`control-btn ${isCropped ? "active" : ""}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsCropped((prev) => !prev);
                    }}
                    title={
                        isCropped
                            ? "Вписать полностью"
                            : "Обрезать чёрные полосы (заполнить экран)"
                    }>
                    <Crop size={18} />
                </button>
                <button
                    className="control-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        setRotation((prev) => (prev + 90) % 360);
                    }}
                    title="Повернуть на 90°">
                    <RotateRight size={18} />
                </button>
                {isSelf && isCamera && canSwitchCamera && (
                    <button
                        className="control-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSwitchCamera?.();
                        }}
                        title={
                            isMobileDevice
                                ? "Перевернуть камеру (передняя / задняя)"
                                : "Сменить веб-камеру"
                        }>
                        <Refresh size={18} />
                    </button>
                )}
                <button
                    className="control-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpanded();
                    }}
                    title={isExpanded ? "Свернуть" : "Во весь чат"}>
                    {isExpanded ? <Collapse size={18} /> : <Expand size={18} />}
                </button>
                <button
                    className="control-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                    }}
                    title={
                        isFullscreen
                            ? "Выйти из полноэкранного режима"
                            : "Полноэкранный режим (двойной клик)"
                    }>
                    {isFullscreen ? (
                        <ExitFullscreen size={18} />
                    ) : (
                        <Fullscreen size={18} />
                    )}
                </button>
                <button
                    className="control-btn danger"
                    onClick={(e) => {
                        e.stopPropagation();
                        onLeaveStream();
                    }}
                    title={
                        isSelf
                            ? "Остановить трансляцию"
                            : "Покинуть трансляцию"
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
    transition:
        box-shadow 0.15s ease,
        transform 0.15s ease;

    ${(props) =>
        props.speaking &&
        css`
            box-shadow:
                0 0 0 3px #57f287,
                0 0 12px rgba(87, 242, 135, 0.6);
            transform: scale(1.03);
        `}
`;

export default observer(({ id }: Props) => {
    if (voiceState.roomId !== id) return null;

    const client = useClient();
    const selfId = client.user?._id;
    const self = selfId ? client.users.get(selfId) : undefined;

    const [isExpanded, setIsExpanded] = useState(false);
    const [isFullscreenStream, setIsFullscreenStream] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        userId: string;
    } | null>(null);

    // Camera detection & selection state
    const [videoDevices, setVideoDevices] = useState<CameraDevice[]>([]);
    const [cameraPickerPos, setCameraPickerPos] = useState<{ x: number; y: number } | null>(null);

    const isMobileDevice = isMobileOrTouchDevice() || isTouchscreenDevice;

    useEffect(() => {
        let isMounted = true;
        const updateVideoDevices = async () => {
            try {
                const devs = await getAvailableCameras();
                if (isMounted) {
                    setVideoDevices(devs);
                }
            } catch (err) {
                console.warn("[VoiceHeader] Failed to enumerate video devices:", err);
            }
        };

        updateVideoDevices();
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener("devicechange", updateVideoDevices);
            return () => {
                isMounted = false;
                navigator.mediaDevices.removeEventListener("devicechange", updateVideoDevices);
            };
        }
        return () => {
            isMounted = false;
        };
    }, []);

    const hasCameras = isMobileDevice || videoDevices.length > 0;

    const handleCameraClick = (e: MouseEvent) => {
        if (voiceState.isProducing("camera")) {
            voiceState.stopProducing("camera");
            return;
        }

        // If 2 or more cameras/modes available (front/back on mobile, or 2+ webcams on PC), show picker
        if (videoDevices.length > 1) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setCameraPickerPos({
                x: Math.min(Math.max(10, rect.left), window.innerWidth - 240),
                y: Math.max(10, rect.top - (videoDevices.length * 42 + 50)),
            });
            return;
        }

        // Single camera directly
        const first = videoDevices[0];
        voiceState.startProducing(
            "camera",
            first
                ? { deviceId: first.deviceId || undefined, facingMode: first.facingMode }
                : undefined
        );
    };

    const handleFlipCamera = () => {
        if (!voiceState.isProducing("camera")) return;
        if (isMobileDevice) {
            const currentFacing = voiceState.activeCameraFacingMode || "user";
            const nextFacing: "user" | "environment" =
                currentFacing === "user" ? "environment" : "user";
            voiceState.switchCamera({
                facingMode: nextFacing,
            });
        } else if (videoDevices.length > 1) {
            const currentId = voiceState.activeCameraDeviceId;
            const currentIdx = videoDevices.findIndex((d) => d.deviceId === currentId);
            const nextIdx = (currentIdx + 1) % videoDevices.length;
            const nextDev = videoDevices[nextIdx];
            if (nextDev) {
                voiceState.switchCamera({
                    deviceId: nextDev.deviceId,
                    facingMode: nextDev.facingMode,
                });
            }
        }
    };

    const handleQuickSwitchCamera = (e: MouseEvent) => {
        if (isMobileDevice) {
            handleFlipCamera();
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setCameraPickerPos({
            x: Math.min(Math.max(10, rect.left), window.innerWidth - 240),
            y: Math.max(10, rect.top - (videoDevices.length * 42 + 50)),
        });
    };

    const handleSelectCamera = (dev: CameraDevice) => {
        setCameraPickerPos(null);
        if (voiceState.isProducing("camera")) {
            voiceState.switchCamera({
                deviceId: dev.deviceId || undefined,
                facingMode: dev.facingMode,
            });
        } else {
            voiceState.startProducing("camera", {
                deviceId: dev.deviceId || undefined,
                facingMode: dev.facingMode,
            });
        }
    };

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
    }, [selfId, voiceState.participants.size, voiceState.streamVersion]);

    useEffect(() => {
        allParticipantIds.forEach((id) => {
            if (!client.users.has(id)) {
                client.users.fetch(id).catch(() => {});
            }
        });
    }, [allParticipantIds, client.users]);

    const users = useMemo(() => {
        return allParticipantIds.map((key) => client.users.get(key));
    }, [allParticipantIds, client.users, voiceState.streamVersion]);

    // Active streams: combines local presenter and remote participants who are currently screen sharing
    const activeStreamEntries = useMemo(() => {
        const entries: {
            userId: string;
            track: any;
            thumbnail?: string;
            label: string;
            isSelf: boolean;
        }[] = [];

        if (selfId && voiceState.isProducing("camera")) {
            entries.push({
                userId: selfId,
                track: voiceState.videoTracks.get(selfId),
                thumbnail: voiceState.screenThumbnails.get(selfId),
                label: "Ваша камера",
                isSelf: true,
                isCamera: true,
            });
        }

        if (selfId && voiceState.isProducing("screen")) {
            entries.push({
                userId: selfId,
                track: voiceState.videoTracks.get(selfId),
                thumbnail: voiceState.screenThumbnails.get(selfId),
                label: "Ваш экран",
                isSelf: true,
                isCamera: false,
            });
        }

        voiceState.participants.forEach((p, uid) => {
            if (uid === selfId) return;
            if (p.camera) {
                const u = client.users.get(uid);
                const name = u?.username ? `Камера: ${u.username}` : "Камера участника";
                entries.push({
                    userId: uid,
                    track: voiceState.videoTracks.get(uid),
                    thumbnail: voiceState.screenThumbnails.get(uid),
                    label: name,
                    isSelf: false,
                    isCamera: true,
                });
            } else if (p.screen) {
                const u = client.users.get(uid);
                const name = u?.username ? `${u.username}` : "Экран участника";
                entries.push({
                    userId: uid,
                    track: voiceState.videoTracks.get(uid),
                    thumbnail: voiceState.screenThumbnails.get(uid),
                    label: name,
                    isSelf: false,
                    isCamera: false,
                });
            }
        });

        return entries;
    }, [
        voiceState.cameraProducing,
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
            if (voiceState.isProducing("camera")) {
                voiceState.stopProducing("camera");
            } else if (voiceState.isProducing("screen")) {
                voiceState.stopProducing("screen");
            }
        }
        voiceState.setWatchingScreenUserId(null);
    };

    const handleWatchStream = (targetUserId: string) => {
        if (watchedStreamUserId && watchedStreamUserId !== targetUserId) {
            const videoEl = document.querySelector(
                "#main-stream-video",
            ) as HTMLVideoElement | null;
            if (videoEl) {
                captureLastFrame(videoEl, watchedStreamUserId);
            }
        }
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
                <ScreenShareArea isFullscreen={isFullscreenStream} expanded={isExpanded}>
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
                        onFullscreenChange={setIsFullscreenStream}
                        isCamera={(currentlyWatchedStream as any).isCamera}
                        onSwitchCamera={handleFlipCamera}
                        canSwitchCamera={videoDevices.length > 1}
                        isMobileDevice={isMobileDevice}
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
                                              user ?? (isSelf ? self : undefined)
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
                {hasCameras && (
                    voiceState.isProducing("camera") ? (
                        <>
                            <Tooltip content={"Выключить камеру"} placement={"top"}>
                                <Button
                                    palette="accent"
                                    onClick={(e) => handleCameraClick(e as any)}>
                                    <Camera width={20} />
                                </Button>
                            </Tooltip>
                            {videoDevices.length > 1 && (
                                <Tooltip
                                    content={
                                        isMobileDevice
                                            ? "Перевернуть камеру (передняя / задняя)"
                                            : "Сменить веб-камеру"
                                    }
                                    placement={"top"}>
                                    <Button
                                        onClick={(e) => handleQuickSwitchCamera(e as any)}>
                                        <Refresh width={20} />
                                    </Button>
                                </Tooltip>
                            )}
                        </>
                    ) : (
                        <Tooltip
                            content={
                                !isMobileDevice && videoDevices.length > 1
                                    ? "Выбрать и включить камеру"
                                    : "Включить камеру"
                            }
                            placement={"top"}>
                            <Button
                                onClick={(e) => handleCameraClick(e as any)}>
                                <CameraOff width={20} />
                            </Button>
                        </Tooltip>
                    )
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

            {/* Multi-camera selector popup for PC */}
            {cameraPickerPos && (
                <>
                    <ContextMenuOverlay
                        onClick={() => setCameraPickerPos(null)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setCameraPickerPos(null);
                        }}
                    />
                    <CameraPickerPopup x={cameraPickerPos.x} y={cameraPickerPos.y}>
                        <div className="picker-title">
                            {isMobileDevice ? "Выберите камеру" : "Выберите веб-камеру"}
                        </div>
                        {videoDevices.map((dev, idx) => (
                            <button
                                key={dev.deviceId || dev.facingMode || idx}
                                className="camera-item"
                                onClick={() => handleSelectCamera(dev)}>
                                <Camera size={16} />
                                {dev.label || `Камера ${idx + 1}`}
                            </button>
                        ))}
                    </CameraPickerPopup>
                </>
            )}

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
