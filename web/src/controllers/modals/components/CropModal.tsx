import { ZoomIn, ZoomOut, Reset } from "@styled-icons/boxicons-regular";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { Text } from "preact-i18n";
import { Button, Modal, Row } from "@revoltchat/ui";

import styles from "./CropModal.module.scss";
import { ModalProps } from "../types";

export interface CropModalConfig {
    file: File;
    aspectRatio?: number; // width / height, e.g. 1 for avatar, 2.5 for banner
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
    const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
    const [loading, setLoading] = useState(false);

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

    // Load original image
    useEffect(() => {
        let active = true;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            if (!active) return;
            setImageEl(img);
        };
        img.src = url;

        return () => {
            active = false;
            URL.revokeObjectURL(url);
        };
    }, [file]);

    // Calculate cropBox size and initial scale to cover the crop area
    useEffect(() => {
        if (!containerRef.current || !imageEl) return;

        const containerW = containerRef.current.clientWidth || 460;
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

        // Min scale so image completely covers the crop box
        const scaleX = boxW / imageEl.naturalWidth;
        const scaleY = boxH / imageEl.naturalHeight;
        const initialMinScale = Math.max(scaleX, scaleY);

        setMinScale(initialMinScale);
        setScale(initialMinScale);
        setPosition({ x: 0, y: 0 });
    }, [imageEl, aspectRatio]);

    // Clamp position within crop box
    const clampPosition = useCallback(
        (newPos: { x: number; y: number }, currentScale: number) => {
            if (!imageEl) return newPos;

            const currentW = imageEl.naturalWidth * currentScale;
            const currentH = imageEl.naturalHeight * currentScale;

            const maxOffsetX = Math.max(0, (currentW - cropBox.width) / 2);
            const maxOffsetY = Math.max(0, (currentH - cropBox.height) / 2);

            return {
                x: Math.max(-maxOffsetX, Math.min(maxOffsetX, newPos.x)),
                y: Math.max(-maxOffsetY, Math.min(maxOffsetY, newPos.y)),
            };
        },
        [imageEl, cropBox],
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
        if (!imageEl) return;
        setLoading(true);

        try {
            // Target output dimensions
            const targetWidth = isCircle ? 512 : Math.round(Math.min(1920, Math.max(cropBox.width * 2, 800)));
            const targetHeight = Math.round(targetWidth / aspectRatio);

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                throw new Error("Unable to create canvas context");
            }

            // Image display dimensions
            const displayW = imageEl.naturalWidth * scale;
            const displayH = imageEl.naturalHeight * scale;

            // Center of cropbox in container coords
            const cropCenterX = cropBox.x + cropBox.width / 2;
            const cropCenterY = cropBox.y + cropBox.height / 2;

            // Image top-left in container coords
            const imgLeft = cropCenterX + position.x - displayW / 2;
            const imgTop = cropCenterY + position.y - displayH / 2;

            // Crop area relative to image in display pixels
            const cropXInDisplay = cropBox.x - imgLeft;
            const cropYInDisplay = cropBox.y - imgTop;

            // Convert to natural image pixel coords
            const naturalRatio = imageEl.naturalWidth / displayW;
            const srcX = cropXInDisplay * naturalRatio;
            const srcY = cropYInDisplay * naturalRatio;
            const srcW = cropBox.width * naturalRatio;
            const srcH = cropBox.height * naturalRatio;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            ctx.drawImage(
                imageEl,
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
            console.error("Failed to crop image:", err);
        }
    };

    // Calculate background image transform
    const containerW = containerRef.current?.clientWidth || 460;
    const containerH = containerRef.current?.clientHeight || 320;
    const displayW = imageEl ? imageEl.naturalWidth * scale : 0;
    const displayH = imageEl ? imageEl.naturalHeight * scale : 0;
    const imgX = (containerW - displayW) / 2 + position.x;
    const imgY = (containerH - displayH) / 2 + position.y;

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
                    disabled: loading || !imageEl,
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
                <div
                    ref={containerRef}
                    className={styles.viewportContainer}
                    onMouseDown={handlePointerDown}
                    onTouchStart={handlePointerDown}
                    onWheel={handleWheel}>
                    {imageEl && (
                        <img
                            src={imageEl.src}
                            alt="Crop Preview"
                            className={styles.imageCanvas}
                            style={{
                                width: `${displayW}px`,
                                height: `${displayH}px`,
                                transform: `translate3d(${imgX}px, ${imgY}px, 0)`,
                            }}
                        />
                    )}

                    {/* SVG Mask: darkens the area outside crop box */}
                    <svg className={styles.overlaySvg}>
                        <defs>
                            <mask id="cropMask">
                                {/* Fill entire viewport with white */}
                                <rect width="100%" height="100%" fill="white" />
                                {/* Cut out the hole with black */}
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
