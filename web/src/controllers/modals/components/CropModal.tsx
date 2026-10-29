import { ZoomIn, ZoomOut, Reset } from "@styled-icons/boxicons-regular";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { Text } from "preact-i18n";
import { Button, Modal } from "@revoltchat/ui";

import styles from "./CropModal.module.scss";
import { ModalProps } from "../types";

export interface CropModalConfig {
    file: File;
    aspectRatio?: number; // width / height, e.g. 1 for avatar, 4 for user banner, 2 for server banner
    isCircle?: boolean;
    title?: string;
    onCrop: (croppedFile: File) => Promise<void> | void;
}

export default function CropModal({
    file,
    aspectRatio = 1,
    isCircle = false,
    title,
    onCrop,
    onClose,
    ...props
}: ModalProps<"crop_image">) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [loading, setLoading] = useState(false);

    const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
    const isVideo = (file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name)) && !isGif;
    const isAnimated = isVideo || isGif;

    // Zoom and position offsets (in CSS display pixels relative to center)
    const [scale, setScale] = useState<number>(1);
    const [minScale, setMinScale] = useState<number>(1);
    const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const isDragging = useRef<boolean>(false);
    const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const posStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Crop box dimensions in viewport
    const [cropBox, setCropBox] = useState<{ width: number; height: number; x: number; y: number }>({
        width: 220,
        height: 220,
        x: 0,
        y: 0,
    });

    const [mediaSrc, setMediaSrc] = useState<string>("");

    // Load original image or video URL
    useEffect(() => {
        const url = URL.createObjectURL(file);
        setMediaSrc(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [file]);

    const handleMediaLoaded = (naturalW: number, naturalH: number) => {
        setNaturalDimensions({ width: naturalW, height: naturalH });
        setMediaLoaded(true);
    };

    // Calculate cropBox size and initial scale to cover the crop area
    useEffect(() => {
        if (!containerRef.current || !mediaLoaded || naturalDimensions.width === 0) return;

        const containerW = containerRef.current.clientWidth || 500;
        const containerH = containerRef.current.clientHeight || 320;

        let boxW: number;
        let boxH: number;

        const maxBoxW = containerW - 40;
        const maxBoxH = containerH - 40;

        if (aspectRatio >= 1) {
            boxW = Math.min(maxBoxW, maxBoxH * aspectRatio);
            boxH = boxW / aspectRatio;
            if (boxH > maxBoxH) {
                boxH = maxBoxH;
                boxW = boxH * aspectRatio;
            }
        } else {
            boxH = Math.min(maxBoxH, maxBoxW / aspectRatio);
            boxW = boxH * aspectRatio;
        }

        const boxX = (containerW - boxW) / 2;
        const boxY = (containerH - boxH) / 2;

        setCropBox({ width: boxW, height: boxH, x: boxX, y: boxY });

        // Min scale so media completely covers the crop box
        const scaleX = boxW / naturalDimensions.width;
        const scaleY = boxH / naturalDimensions.height;
        const initialMinScale = Math.max(scaleX, scaleY);

        setMinScale(initialMinScale);
        setScale(initialMinScale);
        setPosition({ x: 0, y: 0 });
    }, [mediaLoaded, naturalDimensions, aspectRatio]);

    // Clamp position within crop box
    const clampPosition = useCallback(
        (newPos: { x: number; y: number }, currentScale: number) => {
            if (naturalDimensions.width === 0) return newPos;

            const currentW = naturalDimensions.width * currentScale;
            const currentH = naturalDimensions.height * currentScale;

            const maxOffsetX = Math.max(0, (currentW - cropBox.width) / 2);
            const maxOffsetY = Math.max(0, (currentH - cropBox.height) / 2);

            return {
                x: Math.max(-maxOffsetX, Math.min(maxOffsetX, newPos.x)),
                y: Math.max(-maxOffsetY, Math.min(maxOffsetY, newPos.y)),
            };
        },
        [naturalDimensions, cropBox],
    );

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
        isDragging.current = true;
        const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
        dragStart.current = { x: clientX, y: clientY };
        posStart.current = { ...position };
    };

    useEffect(() => {
        const handlePointerMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging.current) return;
            const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

            const dx = clientX - dragStart.current.x;
            const dy = clientY - dragStart.current.y;

            setPosition(
                clampPosition(
                    {
                        x: posStart.current.x + dx,
                        y: posStart.current.y + dy,
                    },
                    scale,
                ),
            );
        };

        const handlePointerUp = () => {
            isDragging.current = false;
        };

        window.addEventListener("mousemove", handlePointerMove);
        window.addEventListener("mouseup", handlePointerUp);
        window.addEventListener("touchmove", handlePointerMove);
        window.addEventListener("touchend", handlePointerUp);

        return () => {
            window.removeEventListener("mousemove", handlePointerMove);
            window.removeEventListener("mouseup", handlePointerUp);
            window.removeEventListener("touchmove", handlePointerMove);
            window.removeEventListener("touchend", handlePointerUp);
        };
    }, [scale, clampPosition]);

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.0015;
        const newScale = Math.min(minScale * 3.5, Math.max(minScale, scale + delta * scale));
        setScale(newScale);
        setPosition((prev) => clampPosition(prev, newScale));
    };

    const handleSliderChange = (e: any) => {
        const val = parseFloat(e.currentTarget.value);
        setScale(val);
        setPosition((prev) => clampPosition(prev, val));
    };

    const handleReset = () => {
        setScale(minScale);
        setPosition({ x: 0, y: 0 });
    };

    const handleSave = async () => {
        if (!mediaLoaded) return;
        setLoading(true);

        try {
            // Calculate crop area in original natural coordinates
            const displayW = naturalDimensions.width * scale;
            const displayH = naturalDimensions.height * scale;

            // Center of cropbox in container coords
            const cropCenterX = cropBox.x + cropBox.width / 2;
            const cropCenterY = cropBox.y + cropBox.height / 2;

            // Image top-left in container coords
            const imgLeft = cropCenterX + position.x - displayW / 2;
            const imgTop = cropCenterY + position.y - displayH / 2;

            // Crop area relative to image in display pixels
            const cropXInDisplay = cropBox.x - imgLeft;
            const cropYInDisplay = cropBox.y - imgTop;

            // Convert to natural media pixel coords
            const naturalRatio = naturalDimensions.width / displayW;
            const rawSrcX = Math.round(cropXInDisplay * naturalRatio);
            const rawSrcY = Math.round(cropYInDisplay * naturalRatio);
            const rawSrcW = Math.round(cropBox.width * naturalRatio);
            const rawSrcH = Math.round(cropBox.height * naturalRatio);

            // Clamp crop box within natural dimensions
            const srcX = Math.max(0, Math.min(naturalDimensions.width - 2, rawSrcX));
            const srcY = Math.max(0, Math.min(naturalDimensions.height - 2, rawSrcY));
            const srcW = Math.max(2, Math.min(naturalDimensions.width - srcX, rawSrcW));
            const srcH = Math.max(2, Math.min(naturalDimensions.height - srcY, rawSrcH));

            // For animated media (video or gif): preserve full animation and frames!
            // We pass calculated crop coordinates in filename so server-side FFmpeg crops and transcodes to infinite-loop WebP.
            if (isAnimated) {
                const ext = file.name.split(".").pop() || (isGif ? "gif" : "mp4");
                const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || "animated";
                const croppedVideoFile = new File([file], `${baseName}_crop_${srcX}_${srcY}_${srcW}_${srcH}.${ext}`, {
                    type: file.type || (isGif ? "image/gif" : "video/mp4"),
                });
                try {
                    await onCrop(croppedVideoFile);
                    onClose();
                } finally {
                    setLoading(false);
                }
                return;
            }

            const imgEl = mediaRef.current as HTMLImageElement;
            if (!imgEl) return;

            // Target output dimensions
            const targetWidth = isCircle
                ? 512
                : Math.round(Math.min(1920, Math.max(cropBox.width * 2, 960)));
            const targetHeight = Math.round(targetWidth / aspectRatio);

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                throw new Error("Unable to create canvas context");
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            ctx.drawImage(
                imgEl,
                srcX,
                srcY,
                srcW,
                srcH,
                0,
                0,
                targetWidth,
                targetHeight,
            );

            const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
            const quality = 0.92;

            canvas.toBlob(
                async (blob) => {
                    if (!blob) {
                        setLoading(false);
                        return;
                    }
                    const ext = mimeType === "image/png" ? "png" : "jpg";
                    const originalName = file.name.substring(0, file.name.lastIndexOf(".")) || "image";
                    const croppedFile = new File([blob], `${originalName}-cropped.${ext}`, {
                        type: mimeType,
                    });

                    try {
                        await onCrop(croppedFile);
                        onClose();
                    } finally {
                        setLoading(false);
                    }
                },
                mimeType,
                quality,
            );
        } catch (err) {
            setLoading(false);
            console.error("Failed to crop media:", err);
        }
    };

    // Calculate background media transform
    const containerW = containerRef.current?.clientWidth || 500;
    const containerH = containerRef.current?.clientHeight || 320;
    const displayW = naturalDimensions.width * scale;
    const displayH = naturalDimensions.height * scale;
    const mediaX = (containerW - displayW) / 2 + position.x;
    const mediaY = (containerH - displayH) / 2 + position.y;

    const modalTitle =
        title ||
        (isCircle ? (
            <Text id="app.special.modals.crop.crop_avatar" />
        ) : (
            <Text id="app.special.modals.crop.crop_banner" />
        ));

    return (
        <Modal
            {...props}
            onClose={onClose}
            title={modalTitle}
            actions={[
                {
                    confirmation: true,
                    onClick: handleSave,
                    children: <Text id="app.special.modals.actions.save" />,
                    disabled: loading || !mediaLoaded,
                },
                {
                    onClick: () => {
                        onClose();
                        return true;
                    },
                    children: <Text id="app.special.modals.actions.cancel" />,
                    palette: "plain",
                    disabled: loading,
                },
            ]}>
            <div className={styles.container}>
                {loading && (
                    <div className={styles.loadingOverlay}>
                        <div className={styles.spinner} />
                        <span>{isAnimated ? "Оптимизация видео..." : "Обработка изображения..."}</span>
                    </div>
                )}

                <div
                    ref={containerRef}
                    className={styles.viewportContainer}
                    onMouseDown={handlePointerDown}
                    onTouchStart={handlePointerDown}
                    onWheel={handleWheel}>
                    {mediaSrc && (
                        isVideo ? (
                            <video
                                ref={(el) => (mediaRef.current = el)}
                                src={mediaSrc}
                                autoPlay
                                loop
                                muted
                                playsInline
                                onLoadedMetadata={(e) => {
                                    const v = e.currentTarget;
                                    handleMediaLoaded(v.videoWidth, v.videoHeight);
                                }}
                                className={styles.imageCanvas}
                                style={{
                                    width: `${displayW}px`,
                                    height: `${displayH}px`,
                                    transform: `translate3d(${mediaX}px, ${mediaY}px, 0)`,
                                }}
                            />
                        ) : (
                            <img
                                ref={(el) => (mediaRef.current = el)}
                                src={mediaSrc}
                                alt="Crop Preview"
                                onLoad={(e) => {
                                    const img = e.currentTarget;
                                    handleMediaLoaded(img.naturalWidth, img.naturalHeight);
                                }}
                                className={styles.imageCanvas}
                                style={{
                                    width: `${displayW}px`,
                                    height: `${displayH}px`,
                                    transform: `translate3d(${mediaX}px, ${mediaY}px, 0)`,
                                }}
                            />
                        )
                    )}

                    {/* SVG Mask: darkens the area outside crop box */}
                    <svg className={styles.overlaySvg}>
                        <defs>
                            <mask id="cropMask">
                                <rect width="100%" height="100%" fill="white" />
                                {isCircle ? (
                                    <circle
                                        cx={cropBox.x + cropBox.width / 2}
                                        cy={cropBox.y + cropBox.height / 2}
                                        r={cropBox.width / 2}
                                        fill="black"
                                    />
                                ) : (
                                    <rect
                                        x={cropBox.x}
                                        y={cropBox.y}
                                        width={cropBox.width}
                                        height={cropBox.height}
                                        rx={8}
                                        ry={8}
                                        fill="black"
                                    />
                                )}
                            </mask>
                        </defs>

                        {/* Dark dimmed overlay */}
                        <rect
                            width="100%"
                            height="100%"
                            fill="rgba(0, 0, 0, 0.72)"
                            mask="url(#cropMask)"
                        />

                        {/* Border around visible active area */}
                        {isCircle ? (
                            <circle
                                cx={cropBox.x + cropBox.width / 2}
                                cy={cropBox.y + cropBox.height / 2}
                                r={cropBox.width / 2}
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.85)"
                                strokeWidth="2"
                                strokeDasharray="4 4"
                            />
                        ) : (
                            <rect
                                x={cropBox.x}
                                y={cropBox.y}
                                width={cropBox.width}
                                height={cropBox.height}
                                rx={8}
                                ry={8}
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.85)"
                                strokeWidth="2"
                                strokeDasharray="4 4"
                            />
                        )}
                    </svg>
                </div>

                <div className={styles.controlsRow}>
                    <div className={styles.sliderContainer}>
                        <ZoomOut size={20} />
                        <input
                            type="range"
                            min={minScale}
                            max={minScale * 3.5}
                            step={(minScale * 2.5) / 100}
                            value={scale}
                            onInput={handleSliderChange}
                            className={styles.zoomSlider}
                        />
                        <ZoomIn size={20} />
                    </div>

                    <Button compact palette="plain" onClick={handleReset} title="Reset">
                        <Reset size={18} />
                    </Button>
                </div>

                <div className={styles.instructions}>
                    <Text id="app.special.modals.crop.drag_instructions" />
                </div>
            </div>
        </Modal>
    );
}
