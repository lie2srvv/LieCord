import styled from "styled-components/macro";

import { useState, useEffect } from "preact/hooks";

import { voiceState } from "../../../lib/vortex/VoiceState";

import { ScreenSource } from "../../../types/native";
import { ModalProps } from "../types";

const Backdrop = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
    padding: max(env(safe-area-inset-top, 0px), 16px) 16px max(env(safe-area-inset-bottom, 0px), 16px);
    box-sizing: border-box;
    overflow-y: auto;
`;

const Container = styled.div`
    width: 600px;
    max-width: min(calc(100% - 24px), 600px);
    max-height: min(calc(100% - 32px), 620px);
    margin: auto;
    background: var(--primary-background, #1e1f22);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--foreground, #dbdee1);
    font-family: inherit;
    animation: fadeIn 0.15s ease-out;
    box-sizing: border-box;

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: scale(0.96);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
`;

const Header = styled.div`
    padding: 16px 20px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--secondary-background, #2b2d31);

    h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: #ffffff;
    }

    button.close-btn {
        background: transparent;
        border: none;
        color: var(--secondary-foreground, #949ba4);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        font-size: 18px;
        line-height: 1;

        &:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
        }
    }
`;

const Tabs = styled.div`
    display: flex;
    gap: 8px;
    padding: 12px 20px 0;
    border-bottom: 1px solid var(--secondary-background, #2b2d31);
`;

const TabButton = styled.button<{ active: boolean }>`
    background: transparent;
    border: none;
    border-bottom: 2px solid
        ${(props) => (props.active ? "var(--accent, #5865f2)" : "transparent")};
    color: ${(props) =>
        props.active ? "#ffffff" : "var(--secondary-foreground, #949ba4)"};
    font-size: 15px;
    font-weight: 600;
    padding: 8px 12px 10px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;

    &:hover {
        color: #ffffff;
    }
`;

const SourcesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    padding: 16px 20px;
    max-height: 260px;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
    }
`;

const SourceCard = styled.div<{ selected: boolean }>`
    display: flex;
    flex-direction: column;
    background: var(--secondary-background, #2b2d31);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid
        ${(props) =>
            props.selected ? "var(--accent, #5865f2)" : "transparent"};
    box-shadow: ${(props) =>
        props.selected ? "0 0 0 1px var(--accent, #5865f2)" : "none"}
    transition: transform 0.1s, border-color 0.15s, background-color 0.15s;

    &:hover {
        background: var(--tertiary-background, #313338);
        ${(props) =>
            !props.selected && "border-color: rgba(255, 255, 255, 0.2);"}
    }

    .thumb-wrapper {
        width: 100%;
        height: 120px;
        background: #111214;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;

        img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
    }

    .info {
        padding: 8px 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        img.app-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            border-radius: 3px;
        }

        span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }
`;

const SettingsSection = styled.div`
    padding: 12px 20px;
    background: var(--secondary-background, #2b2d31);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SettingsRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;

    .label {
        font-weight: 600;
        color: #b5bac1;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.5px;
    }

    .options {
        display: flex;
        background: #1e1f22;
        padding: 2px;
        border-radius: 6px;
        gap: 2px;
        flex-wrap: wrap;
    }

    @media (max-width: 520px) {\
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;

        .options {
            width: 100%;
            display: flex;
            justify-content: space-between;
        }

        button {
            flex: 1;
            text-align: center;
            padding: 6px 4px !important;
            font-size: 11px !important;
        }
    }
`;

const OptionButton = styled.button<{ active: boolean }>`
    background: ${(props) =>
        props.active ? "var(--accent, #5865f2)" : "transparent"};
    color: ${(props) => (props.active ? "#ffffff" : "#949ba4")};
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
        color: #ffffff;
        ${(props) => !props.active && "background: rgba(255, 255, 255, 0.05);"}
    }
`;

const Footer = styled.div`
    padding: 14px 20px;
    background: #1e1f22;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;

    button.cancel-btn {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        padding: 8px 16px;
        border-radius: 4px;

        &:hover {
            text-decoration: underline;
        }
    }

    button.submit-btn {
        background: #23a55a;
        color: #ffffff;
        border: none;
        font-size: 14px;
        font-weight: 600;
        padding: 9px 22px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.15s;

        &:hover {
            background: #1d8d4c;
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }
`;

const EmptyNotice = styled.div`
    grid-column: 1 / -1;
    padding: 30px;
    text-align: center;
    color: #949ba4;
    font-size: 14px;
`;

export type ResolutionOption = "480" | "720" | "1080" | "1440" | "2160";
export type FpsOption = "15" | "30" | "60";

const RESOLUTION_SPECS: Record<
    ResolutionOption,
    { width: number; height: number }
> = {
    "480": { width: 854, height: 480 },
    "720": { width: 1280, height: 720 },
    "1080": { width: 1920, height: 1080 },
    "1440": { width: 2560, height: 1440 },
    "2160": { width: 3840, height: 2160 },
};

export default function ScreenShareModal(props: ModalProps<"screen_share">) {
    const [tab, setTab] = useState<"screens" | "windows">("screens");
    const [sources, setSources] = useState<ScreenSource[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
        null,
    );
    const [loading, setLoading] = useState(false);
    const [resolution, setResolution] = useState<ResolutionOption>("720");
    const [fps, setFps] = useState<FpsOption>("30");
    const [shareAudio, setShareAudio] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const hasNativePicker = Boolean(
        typeof window !== "undefined" &&
            window.native &&
            typeof window.native.getScreenSources === "function",
    );

    const isMobileApp = Boolean(
        typeof window !== "undefined" &&
            ((window as any).LieCordNative ||
                (window as any).isLieCordApp ||
                /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)),
    );

    useEffect(() => {
        if (hasNativePicker && window.native.getScreenSources) {
            setLoading(true);
            window.native
                .getScreenSources()
                .then((srcs) => {
                    setSources(srcs);
                    if (srcs.length > 0) {
                        const firstScreen = srcs.find((s) => s.isScreen);
                        setSelectedSourceId(
                            firstScreen ? firstScreen.id : srcs[0].id,
                        );
                        if (!firstScreen && srcs.some((s) => !s.isScreen)) {
                            setTab("windows");
                        }
                    }
                })
                .catch((err) => {
                    console.error("Failed to get native screen sources:", err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [hasNativePicker]);

    const filteredSources = sources.filter((s) =>
        tab === "screens" ? s.isScreen : !s.isScreen,
    );

    const handleShare = async () => {
        setIsSubmitting(true);
        try {
            const spec =
                RESOLUTION_SPECS[resolution] || RESOLUTION_SPECS["720"];
            const resObj = {
                width: spec.width,
                height: spec.height,
                frameRate: Number(fps),
            };

            if (
                hasNativePicker &&
                selectedSourceId &&
                window.native.selectScreenSource
            ) {
                await window.native.selectScreenSource(
                    selectedSourceId,
                    shareAudio,
                );
            }

            await voiceState.startProducing("screen", {
                resolution: resObj,
                audio: shareAudio,
            });

            props.onClose();
        } catch (err) {
            console.error("Failed to start screen share:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Backdrop onClick={props.onClose}>
            <Container onClick={(e) => e.stopPropagation()}>
                <Header>
                    <h2>Поделиться экраном</h2>
                    <button className="close-btn" onClick={props.onClose}>
                        ✕
                    </button>
                </Header>

                {hasNativePicker ? (
                    <>
                        <Tabs>
                            <TabButton
                                active={tab === "screens"}
                                onClick={() => {
                                    setTab("screens");
                                    const first = sources.find(
                                        (s) => s.isScreen,
                                    );
                                    if (first) setSelectedSourceId(first.id);
                                }}>
                                Экраны
                            </TabButton>
                            <TabButton
                                active={tab === "windows"}
                                onClick={() => {
                                    setTab("windows");
                                    const first = sources.find(
                                        (s) => !s.isScreen,
                                    );
                                    if (first) setSelectedSourceId(first.id);
                                }}>
                                Окна приложений
                            </TabButton>
                        </Tabs>

                        <SourcesGrid>
                            {loading ? (
                                <EmptyNotice>
                                    Загрузка источников...
                                </EmptyNotice>
                            ) : filteredSources.length === 0 ? (
                                <EmptyNotice>
                                    {tab === "screens"
                                        ? "Экраны не найдены"
                                        : "Окна приложений не найдены"}
                                </EmptyNotice>
                            ) : (
                                filteredSources.map((source) => (
                                    <SourceCard
                                        key={source.id}
                                        selected={
                                            selectedSourceId === source.id
                                        }
                                        onClick={() =>
                                            setSelectedSourceId(source.id)
                                        }>
                                        <div className="thumb-wrapper">
                                            <img
                                                src={source.thumbnail}
                                                alt={source.name}
                                                draggable={false}
                                            />
                                        </div>
                                        <div className="info">
                                            {source.appIcon && (
                                                <img
                                                    className="app-icon"
                                                    src={source.appIcon}
                                                    alt=""
                                                />
                                            )}
                                            <span title={source.name}>
                                                {source.name}
                                            </span>
                                        </div>
                                    </SourceCard>
                                ))
                            )}
                        </SourcesGrid>
                    </>
                ) : (
                    <div
                        style={{
                            padding: "20px 24px",
                            fontSize: "14px",
                            color: "#dbdee1",
                            lineHeight: "1.5",
                        }}>
                        <div
                            style={{
                                fontWeight: 600,
                                marginBottom: "6px",
                                color: "#ffffff",
                                fontSize: "15px",
                            }}>
                            {isMobileApp
                                ? "Трансляция экрана устройства"
                                : "Демонстрация экрана"}
                        </div>
                        <div style={{ color: "#949ba4", fontSize: "13px" }}>
                            {isMobileApp
                                ? "После нажатия «В эфир» появится системный запрос Android на запись экрана. Вы сможете показывать приложения, рабочий стол и медиа."
                                : "Окно выбора экрана или приложения откроется после нажатия кнопки «В эфир»."}
                        </div>
                    </div>
                )}

                <SettingsSection>
                    <SettingsRow>
                        <div className="label">Разрешение</div>
                        <div className="options">
                            <OptionButton
                                active={resolution === "480"}
                                onClick={() => setResolution("480")}>
                                480p
                            </OptionButton>
                            <OptionButton
                                active={resolution === "720"}
                                onClick={() => setResolution("720")}>
                                720p
                            </OptionButton>
                            <OptionButton
                                active={resolution === "1080"}
                                onClick={() => setResolution("1080")}>
                                FHD (1080p)
                            </OptionButton>
                            {!isMobileApp && (
                                <>
                                    <OptionButton
                                        active={resolution === "1440"}
                                        onClick={() => setResolution("1440")}>
                                        2K (1440p)
                                    </OptionButton>
                                    <OptionButton
                                        active={resolution === "2160"}
                                        onClick={() => setResolution("2160")}>
                                        UHD (4K)
                                    </OptionButton>
                                </>
                            )}
                        </div>
                    </SettingsRow>

                    <SettingsRow>
                        <div className="label">Частота кадров</div>
                        <div className="options">
                            <OptionButton
                                active={fps === "15"}
                                onClick={() => setFps("15")}>
                                15 FPS
                            </OptionButton>
                            <OptionButton
                                active={fps === "30"}
                                onClick={() => setFps("30")}>
                                30 FPS
                            </OptionButton>
                            <OptionButton
                                active={fps === "60"}
                                onClick={() => setFps("60")}>
                                60 FPS
                            </OptionButton>
                        </div>
                    </SettingsRow>

                    <SettingsRow>
                        <div className="label">Звук трансляции</div>
                        <div className="options">
                            <OptionButton
                                active={shareAudio}
                                onClick={() => setShareAudio(true)}>
                                Со звуком
                            </OptionButton>
                            <OptionButton
                                active={!shareAudio}
                                onClick={() => setShareAudio(false)}>
                                Без звука
                            </OptionButton>
                        </div>
                    </SettingsRow>
                </SettingsSection>

                <Footer>
                    <button className="cancel-btn" onClick={props.onClose}>
                        Отмена
                    </button>
                    <button
                        className="submit-btn"
                        disabled={
                            isSubmitting ||
                            (hasNativePicker && !selectedSourceId)
                        }
                        onClick={handleShare}>
                        {isSubmitting ? "Подключение..." : "В эфир"}
                    </button>
                </Footer>
            </Container>
        </Backdrop>
    );
}
