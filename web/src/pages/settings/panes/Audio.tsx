import styles from "./Panes.module.scss";
import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { Button, Category, ComboBox, Tip } from "@revoltchat/ui";

import { stopPropagation } from "../../../lib/stopPropagation";
import { voiceState } from "../../../lib/vortex/VoiceState";

import { I18nError } from "../../../context/Locale";

import opusSVG from "../assets/opus_logo.svg";

const constraints = { audio: true };

export function Audio() {
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
            </div>
            <hr />
            <div className={styles.opus}>
                <img height="20" src={opusSVG} draggable={false} />
                Audio codec powered by Opus
            </div>
        </>
    );
}

function changeAudioDevice(deviceId: string, deviceType: string) {
    if (deviceType === "input") {
        window.localStorage.setItem("audioInputDevice", deviceId);
        if (voiceState.isProducing("audio")) {
            voiceState.stopProducing("audio");
            voiceState.startProducing("audio");
        }
    } else if (deviceType === "output") {
        window.localStorage.setItem("audioOutputDevice", deviceId);
    }
}
