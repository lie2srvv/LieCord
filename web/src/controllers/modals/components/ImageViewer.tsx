import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { createPortal } from "preact/compat";
import styled, { keyframes } from "styled-components";
import {
    X,
    LinkExternal,
    Download,
    ZoomIn,
    ZoomOut,
    Reset,
} from "@styled-icons/boxicons-regular";

import { useClient } from "../../client/ClientController";
import { ModalProps } from "../types";
import { determineFileSize } from "../../../lib/fileSize";

const fadeIn = keyframes`
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
`;

const spin = keyframes`
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
`;

const Backdrop = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.92);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    user-select: none;
    animation: ${fadeIn} 0.15s ease-out;
    padding: max(16px, env(safe-area-inset-top, 16px)) 16px
        max(16px, env(safe-area-inset-bottom, 16px));
    box-sizing: border-box;
    overflow: hidden;
`;

const CloseButton = styled.button`
    position: absolute;
    top: max(16px, env(safe-area-inset-top, 16px));
    right: 16px;
    background: rgba(24, 24, 27, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #ffffff;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10002;
    transition: all 0.15s ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);

    &:hover {
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.06);
    }

    &:active {
        transform: scale(0.95);
    }
`;

const MediaContainer = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
`;

const MediaWrapper = styled.div<{ $isDragging: boolean }>`
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform;
    transform-origin: center center;
    transition: ${(props) =>
        props.$isDragging
            ? "none"
            : "transform 0.18s cubic-bezier(0.2, 0.9, 0.4, 1)"};
`;

const StyledImage = styled.img<{ $isLoaded: boolean; $isZoomed: boolean }>`
    max-width: 92%;
    max-height: calc(100% - 130px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7);
    opacity: ${(props) => (props.$isLoaded ? 1 : 0.8)};
    transition: opacity 0.2s ease;
    cursor: ${(props) => (props.$isZoomed ? "grab" : "zoom-in")};
    user-select: none;
    -webkit-user-drag: none;

    &:active {
        cursor: ${(props) => (props.$isZoomed ? "grabbing" : "zoom-in")};
    }

    @media (min-width: 768px) {
        max-width: min(92%, 1200px);
        max-height: calc(100% - 140px);
        min-width: 320px;
        min-height: 320px;
    }

    @media (max-width: 767px) {
        max-width: 94%;
        max-height: calc(100% - 110px);
        min-width: 260px;
        min-height: 260px;
    }
`;

const StyledVideo = styled.video`
    max-width: 92%;
    max-height: calc(100% - 130px);
    border-radius: 8px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7);
    outline: none;

    @media (min-width: 768px) {
        max-width: min(92%, 1200px);
        max-height: calc(100% - 140px);
    }
`;

const ActionBar = styled.div`
    position: absolute;
    bottom: max(16px, env(safe-area-inset-bottom, 16px));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: rgba(24, 24, 27, 0.92);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 24px;
    padding: 8px 16px;
    max-width: min(94vw, 620px);
    width: 100%;
    z-index: 10001;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
    box-sizing: border-box;

    @media (max-width: 500px) {
        padding: 6px 12px;
        gap: 8px;
    }
`;

const Info = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
`;

const Filename = styled.span`
    font-size: 0.8125rem;
    font-weight: 600;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Details = styled.span`
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ZoomControls = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 2px 6px;
`;

const ZoomButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.08);
    }

    &:active {
        transform: scale(0.92);
    }
`;

const ZoomLabel = styled.span`
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    min-width: 42px;
    text-align: center;
    cursor: pointer;
    user-select: none;

    &:hover {
        color: #ffffff;
    }
`;

const ActionButtons = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
`;

const ActionLink = styled.a`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    transition: all 0.15s ease;
    cursor: pointer;
    text-decoration: none;

    &:hover {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
        transform: scale(1.08);
    }

    &:active {
        transform: scale(0.95);
    }
`;

const Spinner = styled.div`
    position: absolute;
    width: 44px;
    height: 44px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
    pointer-events: none;
`;

const ErrorState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.9375rem;
`;

export default function ImageViewer(props: ModalProps<"image_viewer">) {
    const { embed, attachment, url: explicitUrl, filename: explicitFilename, onClose, signal } = props;
    const client = useClient();
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Zoom & Pan state
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Interaction refs
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
    const lastTapRef = useRef<number>(0);

    // Resolve media attributes
    let mediaUrl: string | undefined = explicitUrl;
    let downloadUrl: string | undefined = explicitUrl;
    let filename = explicitFilename || "media";
    let details = "";
    let isVideo = false;

    if (attachment) {
        filename = attachment.filename || explicitFilename || "file";
        isVideo =
            attachment.metadata?.type === "Video" ||
            attachment.content_type?.startsWith("video/") ||
            false;

        const generated = client.generateFileURL(attachment, undefined, true);
        const autumnBase =
            client.configuration?.features.autumn?.url || "/autumn";
        mediaUrl =
            explicitUrl ||
            generated ||
            `${autumnBase}/${attachment.tag}/${attachment._id}`;
        const baseForDownload = (mediaUrl || "").split("?")[0];
        downloadUrl = `${baseForDownload}/${encodeURIComponent(filename)}`;

        const filesize =
            typeof attachment.size === "number"
                ? determineFileSize(attachment.size)
                : "";

        if (
            attachment.metadata &&
            "width" in attachment.metadata &&
            (attachment.metadata as any).width
        ) {
            details = `${(attachment.metadata as any).width}×${
                (attachment.metadata as any).height
            }${filesize ? ` (${filesize})` : ""}`;
        } else {
            details = filesize;
        }
    } else if (embed) {
        filename = embed.url.split("/").pop() || explicitFilename || "image";
        mediaUrl = client.proxyFile(embed.url) || embed.url;
        downloadUrl = mediaUrl;
        if (embed.width && embed.height) {
            details = `${embed.width}×${embed.height}`;
        }
    }

    // Reset zoom & pan helper
    const resetZoom = useCallback(() => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    }, []);

    const zoomBy = useCallback((factor: number) => {
        setScale((prev) => {
            const next = Math.min(8, Math.max(0.6, prev * factor));
            if (next <= 1.05 && next >= 0.95) {
                setOffset({ x: 0, y: 0 });
                return 1;
            }
            return next;
        });
    }, []);

    // Sync image loaded state for already cached images
    useEffect(() => {
        if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
            setIsLoaded(true);
        }
    }, [mediaUrl]);

    // Handle close signal
    useEffect(() => {
        if (signal === "close") {
            onClose();
        }
    }, [signal, onClose]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Mouse wheel zoom (PC)
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY < 0 ? 1.18 : 0.85;
        setScale((prev) => {
            const next = Math.min(8, Math.max(0.6, prev * delta));
            if (next <= 1.05 && next >= 0.95) {
                setOffset({ x: 0, y: 0 });
                return 1;
            }
            return next;
        });
    }, []);

    // Mouse Drag to Pan (PC)
    const handleMouseDown = useCallback((e: MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX - offset.x,
            y: e.clientY - offset.y,
        };
    }, [offset]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragStartRef.current) return;
        e.preventDefault();
        setOffset({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y,
        });
    }, []);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        dragStartRef.current = null;
    }, []);

    // Touch events for Mobile: Pinch-to-zoom (2 fingers) & Pan & Double tap
    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (e.touches.length === 2) {
            // Pinch start
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            pinchStartRef.current = { dist, scale };
            setIsDragging(true);
        } else if (e.touches.length === 1) {
            // Double tap check
            const now = Date.now();
            if (now - lastTapRef.current < 300) {
                // Double tap detected
                setScale((prev) => (prev > 1.2 ? 1 : 2.5));
                setOffset({ x: 0, y: 0 });
                lastTapRef.current = 0;
                return;
            }
            lastTapRef.current = now;

            if (scale > 1) {
                setIsDragging(true);
                dragStartRef.current = {
                    x: e.touches[0].clientX - offset.x,
                    y: e.touches[0].clientY - offset.y,
                };
            }
        }
    }, [scale, offset]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (e.touches.length === 2 && pinchStartRef.current) {
            e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const ratio = dist / pinchStartRef.current.dist;
            const newScale = Math.min(8, Math.max(0.6, pinchStartRef.current.scale * ratio));
            setScale(newScale);
        } else if (e.touches.length === 1 && dragStartRef.current && scale > 1) {
            e.preventDefault();
            setOffset({
                x: e.touches[0].clientX - dragStartRef.current.x,
                y: e.touches[0].clientY - dragStartRef.current.y,
            });
        }
    }, [scale]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (e.touches.length < 2) {
            pinchStartRef.current = null;
        }
        if (e.touches.length === 0) {
            setIsDragging(false);
            dragStartRef.current = null;
            if (scale < 1) {
                setScale(1);
                setOffset({ x: 0, y: 0 });
            }
        }
    }, [scale]);

    const isZoomed = scale > 1.05;
    const zoomPercent = `${Math.round(scale * 100)}%`;

    return createPortal(
        <Backdrop onClick={onClose}>
            <CloseButton
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                title="Закрыть (Esc)"
                aria-label="Закрыть">
                <X size={26} />
            </CloseButton>

            <MediaContainer
                ref={containerRef}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={isZoomed ? handleMouseDown : undefined}
                onMouseMove={isDragging ? handleMouseMove : undefined}
                onMouseUp={handleMouseUp}
                onClick={(e) => {
                    // Close only if click was directly on the background
                    if (e.target === containerRef.current) {
                        onClose();
                    }
                }}>
                {!isLoaded && !hasError && !isVideo && <Spinner />}

                {hasError && (
                    <ErrorState onClick={(e) => e.stopPropagation()}>
                        <span>Не удалось загрузить медиафайл</span>
                        {mediaUrl && (
                            <ActionLink
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Открыть в браузере">
                                <LinkExternal size={20} />
                            </ActionLink>
                        )}
                    </ErrorState>
                )}

                <MediaWrapper
                    $isDragging={isDragging}
                    style={{
                        transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                    }}>
                    {isVideo && mediaUrl && (
                        <StyledVideo
                            src={mediaUrl}
                            controls
                            autoPlay
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}

                    {!isVideo && mediaUrl && (
                        <StyledImage
                            ref={imgRef}
                            src={mediaUrl}
                            alt={filename}
                            $isLoaded={isLoaded}
                            $isZoomed={isZoomed}
                            onLoad={() => setIsLoaded(true)}
                            onError={() => setHasError(true)}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isZoomed) {
                                    setScale(2);
                                }
                            }}
                        />
                    )}
                </MediaWrapper>
            </MediaContainer>

            <ActionBar onClick={(e) => e.stopPropagation()}>
                <Info>
                    <Filename title={filename}>{filename}</Filename>
                    {details && <Details>{details}</Details>}
                </Info>

                {!isVideo && (
                    <ZoomControls>
                        <ZoomButton
                            onClick={() => zoomBy(0.8)}
                            title="Уменьшить"
                            aria-label="Уменьшить">
                            <ZoomOut size={18} />
                        </ZoomButton>
                        <ZoomLabel onClick={resetZoom} title="Сбросить масштаб">
                            {zoomPercent}
                        </ZoomLabel>
                        <ZoomButton
                            onClick={() => zoomBy(1.25)}
                            title="Увеличить"
                            aria-label="Увеличить">
                            <ZoomIn size={18} />
                        </ZoomButton>
                    </ZoomControls>
                )}

                <ActionButtons>
                    {isZoomed && (
                        <ActionLink
                            onClick={resetZoom}
                            title="Сбросить масштаб"
                            as="button">
                            <Reset size={18} />
                        </ActionLink>
                    )}
                    {mediaUrl && (
                        <ActionLink
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Открыть оригинал">
                            <LinkExternal size={18} />
                        </ActionLink>
                    )}
                    {downloadUrl && (
                        <ActionLink
                            href={downloadUrl}
                            download={filename}
                            title="Скачать">
                            <Download size={18} />
                        </ActionLink>
                    )}
                </ActionButtons>
            </ActionBar>
        </Backdrop>,
        document.body,
    );
}
