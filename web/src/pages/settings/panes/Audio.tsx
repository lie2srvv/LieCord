import { observer } from "mobx-react-lite";
import styles from "./Panes.module.scss";
import { Text } from "preact-i18n";
import { useEffect, useState, useRef } from "preact/hooks";

import { Button, Category, ComboBox, Tip } from "@revoltchat/ui";

import { stopPropagation } from "../../../lib/stopPropagation";
import { voiceState } from "../../../lib/vortex/VoiceState";

import { I18nError } from "../../../context/Locale";

import opusSVG from "../assets/opus_logo.svg";

const constraints = { audio: true };

export const Audio = observer(() => {
    const [mediaStream, setMediaStream] = useState<MediaStream | undefined>(
        undefined,
    );
    const [mediaDevices, setMediaDevices] = useState<
        MediaDeviceInfo[] | undefined
    >(undefined);
    const [permission, setPermission] = useState<string | undefined>(() => {
        if (
            typeof window !== "undefined" &&
            window.localStorage.getItem("audioPermissionGranted") === "true"
        ) {
            return "granted";
        }
        return undefined;
    });
    const [error, setError] = useState<DOMException | undefined>(undefined);
    const [isRecordingPtt, setIsRecordingPtt] = useState(false);
    const [isTestingMic, setIsTestingMic] = useState(false);
    const testAudioCtxRef = useRef<AudioContext | null>(null);
    const testStreamRef = useRef<MediaStream | null>(null);
    const testAnimRef = useRef<number | null>(null);
    const meterFillRef = useRef<HTMLDivElement | null>(null);
    const statusTextRef = useRef<HTMLSpanElement | null>(null);

    const stopMicTest = () => {
        if (testAnimRef.current) {
            cancelAnimationFrame(testAnimRef.current);
            testAnimRef.current = null;
        }
        if (testStreamRef.current) {
            testStreamRef.current.getTracks().forEach((t) => t.stop());
            testStreamRef.current = null;
        }
        if (testAudioCtxRef.current) {
            testAudioCtxRef.current.close().catch(() => {});
            testAudioCtxRef.current = null;
        }
        if (meterFillRef.current) {
            meterFillRef.current.style.width = "0%";
        }
        if (statusTextRef.current) {
            statusTextRef.current.textContent = "Не активно";
            statusTextRef.current.style.color = "var(--tertiary-foreground)";
        }
        setIsTestingMic(false);
    };

    const startMicTest = async () => {
        stopMicTest();
        try {
            const inputId = window.localStorage.getItem("audioInputDevice");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: inputId ? { deviceId: { exact: inputId } } : true,
            });
            testStreamRef.current = stream;

            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioCtx();
            if (ctx.state === "suspended") {
                await ctx.resume().catch(() => {});
            }
            testAudioCtxRef.current = ctx;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;

            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            setIsTestingMic(true);

            const updateMeter = () => {
                if (!analyser || !testStreamRef.current) return;
                analyser.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                // Scale 0..255 average to 0..100%
                const percent = Math.min(100, Math.round((avg / 120) * 100));

                if (meterFillRef.current) {
                    meterFillRef.current.style.width = percent + "%";
                }

                const threshold = voiceState.vadThreshold;
                const isVoice = percent >= threshold && percent > 2;
                if (statusTextRef.current) {
                    if (isVoice) {
                        statusTextRef.current.textContent = "Голос обнаружен";
                        statusTextRef.current.style.color = "#23a55a";
                    } else {
                        statusTextRef.current.textContent = percent > 1 ? "Тишина (гейт закрыт)" : "Тишина";
                        statusTextRef.current.style.color = "var(--tertiary-foreground)";
                    }
                }

                testAnimRef.current = requestAnimationFrame(updateMeter);
            };

            testAnimRef.current = requestAnimationFrame(updateMeter);
        } catch (err) {
            console.error("Failed to start mic test:", err);
            stopMicTest();
        }
    };

    useEffect(() => {
        return () => {
            stopMicTest();
        };
    }, []);

    const askOrGetPermission = async () => {
        try {
            if (
                typeof window !== "undefined" &&
                (window as any).native?.requestMicrophoneAccess
            ) {
                await (window as any).native.requestMicrophoneAccess();
            }
            const result = await navigator.mediaDevices.getUserMedia(
                constraints,
            );

            setMediaStream(result);
            setPermission("granted");
            setError(undefined);

            if (typeof window !== "undefined") {
                window.localStorage.setItem("audioPermissionGranted", "true");
            }

            if (navigator.mediaDevices?.enumerateDevices) {
                const devs = await navigator.mediaDevices.enumerateDevices();
                setMediaDevices(devs);
            }
        } catch (err) {
            setError(err as DOMException);
            setPermission("denied");
        }

        try {
            const { state } = await navigator.permissions.query({
                name: "microphone" as PermissionName,
            });
            setPermission(state);
            if (state === "granted" && typeof window !== "undefined") {
                window.localStorage.setItem("audioPermissionGranted", "true");
            }
        } catch {
            // Permissions query might not be supported
        }
    };

    useEffect(() => {
        let isMounted = true;

        const checkPermissionAndDevices = async () => {
            let isGranted =
                typeof window !== "undefined" &&
                window.localStorage.getItem("audioPermissionGranted") ===
                    "true";

            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const queryRes = await navigator.permissions.query({
                        name: "microphone" as PermissionName,
                    });
                    if (isMounted) {
                        setPermission(queryRes.state);
                        if (queryRes.state === "granted") {
                            isGranted = true;
                            window.localStorage.setItem(
                                "audioPermissionGranted",
                                "true",
                            );
                        }
                    }
                    queryRes.onchange = () => {
                        if (isMounted) {
                            setPermission(queryRes.state);
                            if (queryRes.state === "granted") {
                                window.localStorage.setItem(
                                    "audioPermissionGranted",
                                    "true",
                                );
                            }
                        }
                    };
                } catch {
                    // Ignore query unsupported
                }
            }

            if (
                navigator.mediaDevices &&
                navigator.mediaDevices.enumerateDevices
            ) {
                try {
                    const devs =
                        await navigator.mediaDevices.enumerateDevices();
                    if (isMounted) {
                        setMediaDevices(devs);
                        if (
                            devs.some(
                                (d) =>
                                    d.kind === "audioinput" &&
                                    d.label.length > 0,
                            )
                        ) {
                            isGranted = true;
                            setPermission("granted");
                            window.localStorage.setItem(
                                "audioPermissionGranted",
                                "true",
                            );
                        }
                    }
                } catch (err) {
                    if (isMounted) {
                        setError(err as DOMException);
                    }
                }
            }

            if (isGranted && isMounted) {
                setPermission("granted");
            }
        };

        checkPermissionAndDevices();

        const handleDeviceChange = () => {
            if (navigator.mediaDevices?.enumerateDevices) {
                navigator.mediaDevices.enumerateDevices().then((devs) => {
                    if (isMounted) {
                        setMediaDevices(devs);
                        if (
                            devs.some(
                                (d) =>
                                    d.kind === "audioinput" &&
                                    d.label.length > 0,
                            )
                        ) {
                            setPermission("granted");
                            window.localStorage.setItem(
                                "audioPermissionGranted",
                                "true",
                            );
                        }
                    }
                });
            }
        };

        navigator.mediaDevices?.addEventListener(
            "devicechange",
            handleDeviceChange,
        );

        return () => {
            isMounted = false;
            navigator.mediaDevices?.removeEventListener(
                "devicechange",
                handleDeviceChange,
            );
        };
    }, []);

    useEffect(() => {
        return () => {
            if (mediaStream) {
                // close microphone access on unmount
                mediaStream.getTracks().forEach((track) => {
                    track.stop();
                });
            }
        };
    }, [mediaStream]);

    const handleAskForPermission = (
        ev: JSX.TargetedMouseEvent<HTMLElement>,
    ) => {
        stopPropagation(ev);
        setError(undefined);
        askOrGetPermission();
    };

    const isGranted = permission === "granted";

    return (
        <>
            <div className={styles.audio}>
                {!isGranted && (
                    <Tip palette="error">
                        <Text id="app.settings.pages.audio.tip_grant_permission" />
                    </Tip>
                )}

                {error && permission === "prompt" && (
                    <Tip palette="error">
                        <Text id="app.settings.pages.audio.tip_retry" />
                        <a onClick={handleAskForPermission}>
                            <Text id="app.settings.pages.audio.button_retry" />
                        </a>
                        .
                    </Tip>
                )}

                <div className={styles.audioRow}>
                    <div className={styles.select}>
                        <h3>
                            <Text id="app.settings.pages.audio.input_device" />
                        </h3>
                        <div className={styles.audioBox}>
                            <ComboBox
                                value={
                                    window.localStorage.getItem(
                                        "audioInputDevice",
                                    ) ?? 0
                                }
                                onChange={(e) =>
                                    changeAudioDevice(
                                        e.currentTarget.value,
                                        "input",
                                    )
                                }>
                                {mediaDevices
                                    ?.filter(
                                        (device) =>
                                            device.kind === "audioinput",
                                    )
                                    .map((device) => {
                                        return (
                                            <option
                                                value={device.deviceId}
                                                key={device.deviceId}>
                                                {device.label || (
                                                    <Text id="app.settings.pages.audio.device_label_NA" />
                                                )}
                                            </option>
                                        );
                                    })}
                            </ComboBox>
                            {!isGranted && (
                                <Button
                                    compact
                                    onClick={(e: any) =>
                                        handleAskForPermission(e)
                                    }
                                    palette="error">
                                    <Text id="app.settings.pages.audio.button_grant" />
                                </Button>
                            )}
                            {error && error.name === "NotAllowedError" && (
                                <Category>
                                    <I18nError error="AudioPermissionBlock" />
                                </Category>
                            )}
                        </div>
                    </div>
                    <div className={styles.select}>
                        <h3>
                            <Text id="app.settings.pages.audio.output_device" />
                        </h3>
                        <ComboBox
                            value={
                                window.localStorage.getItem(
                                    "audioOutputDevice",
                                ) ?? 0
                            }
                            onChange={(e) =>
                                changeAudioDevice(
                                    e.currentTarget.value,
                                    "output",
                                )
                            }>
                            {mediaDevices
                                ?.filter(
                                    (device) => device.kind === "audiooutput",
                                )
                                .map((device) => {
                                    return (
                                        <option
                                            value={device.deviceId}
                                            key={device.deviceId}>
                                            {device.label || (
                                                <Text id="app.settings.pages.audio.device_label_NA" />
                                            )}
                                        </option>
                                    );
                                })}
                        </ComboBox>
                    </div>
                </div>

                {/* Microphone Level & VAD Live Test */}
                <div style={{
                    marginTop: 24,
                    padding: "16px 18px",
                    borderRadius: "8px",
                    backgroundColor: "var(--secondary-background)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Проверка микрофона и чувствительность</h3>
                            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tertiary-foreground)" }}>
                                Проверьте громкость входящего сигнала и настройте порог срабатывания шумоподавления
                            </p>
                        </div>
                        <Button
                            compact
                            palette={isTestingMic ? "error" : "accent"}
                            onClick={() => {
                                if (isTestingMic) stopMicTest();
                                else startMicTest();
                            }}>
                            {isTestingMic ? "Остановить проверку" : "Проверить микрофон"}
                        </Button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                            <span style={{ color: "var(--foreground)", fontWeight: 500 }}>Уровень входного сигнала:</span>
                            <span ref={statusTextRef} style={{ fontWeight: 600, color: "var(--tertiary-foreground)" }}>
                                {isTestingMic ? "Слушаем микрофон..." : 'Нажмите "Проверить микрофон"'}
                            </span>
                        </div>

                        {/* Audio Meter Bar with VAD Threshold Marker */}
                        <div style={{
                            position: "relative",
                            width: "100%",
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: "var(--primary-background)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            overflow: "hidden"
                        }}>
                            <div
                                ref={meterFillRef}
                                style={{
                                    height: "100%",
                                    width: "0%",
                                    borderRadius: 9,
                                    background: "linear-gradient(90deg, #23a55a 0%, #2ecc71 85%, #f1c40f 100%)",
                                    transition: "width 0.05s ease-out",
                                    boxShadow: "0 0 8px rgba(35, 165, 90, 0.4)"
                                }}
                            />
                            {/* VAD Threshold Line Marker */}
                            {voiceState.inputMode === "voice_activity" && (
                                <div
                                    title={"Порог активации: " + voiceState.vadThreshold + "%"}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        bottom: 0,
                                        left: (voiceState.vadThreshold + "%"),
                                        width: 3,
                                        backgroundColor: "#ffffff",
                                        boxShadow: "0 0 6px rgba(0,0,0,0.8), 0 0 4px #5865f2",
                                        pointerEvents: "none",
                                        zIndex: 2,
                                        transform: "translateX(-50%)"
                                    }}
                                />
                            )}
                        </div>

                        {/* VAD Threshold Slider */}
                        {voiceState.inputMode === "voice_activity" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                                    <span style={{ color: "var(--tertiary-foreground)" }}>
                                        Порог срабатывания голоса: <strong>{voiceState.vadThreshold}%</strong>
                                    </span>
                                    <span style={{ color: "var(--tertiary-foreground)" }}>
                                        {voiceState.vadThreshold < 30 ? "Высокая чувствительность" : voiceState.vadThreshold > 70 ? "Низкая чувствительность" : "Оптимально"}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={voiceState.vadThreshold}
                                    onInput={(e: any) => voiceState.setVadThreshold(Number(e.currentTarget.value))}
                                    style={{
                                        width: "100%",
                                        accentColor: "#5865f2",
                                        cursor: "pointer"
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.audioRow} style={{ marginTop: 20 }}>
                    <div className={styles.select} style={{ width: "100%" }}>
                        <h3>Режим активации микрофона</h3>
                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                            <Button
                                compact
                                palette={voiceState.inputMode === "voice_activity" ? "accent" : "secondary"}
                                onClick={() => voiceState.setInputMode("voice_activity")}>
                                По голосу (Voice Activity)
                            </Button>
                            <Button
                                compact
                                palette={voiceState.inputMode === "ptt" ? "accent" : "secondary"}
                                onClick={() => voiceState.setInputMode("ptt")}>
                                Режим рации (Push-to-Talk)
                            </Button>
                        </div>

                        {voiceState.inputMode === "ptt" && (
                            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 13, color: "var(--foreground)" }}>
                                    Клавиша активации:
                                </span>
                                <Button
                                    compact
                                    palette={isRecordingPtt ? "error" : "primary"}
                                    onClick={() => setIsRecordingPtt(true)}
                                    onKeyDown={(e: any) => {
                                        if (isRecordingPtt) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const code = e.code;
                                            const key = e.key.toUpperCase();
                                            voiceState.setPttKey(code, key === " " ? "SPACE" : key);
                                            setIsRecordingPtt(false);
                                        }
                                    }}>
                                    {isRecordingPtt ? "Нажмите любую клавишу..." : voiceState.pttKeyLabel || "Настроить"}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <hr />
            <div className={styles.opus}>
                <img height="20" src={opusSVG} draggable={false} />
                Audio codec powered by Opus
            </div>
        </>
    );
});

function changeAudioDevice(deviceId: string, deviceType: string) {
    const kind = deviceType === "input" ? "audioinput" : "audiooutput";
    voiceState.changeAudioDevice(deviceId, kind);
}
