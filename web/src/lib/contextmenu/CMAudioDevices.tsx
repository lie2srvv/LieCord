import { useState, useEffect } from "preact/hooks";
import { observer } from "mobx-react-lite";
import { ContextMenuWithData, MenuItem } from "preact-context-menu";
import { Check, Cog } from "@styled-icons/boxicons-regular";
import { Microphone, VolumeFull } from "@styled-icons/boxicons-solid";
import { LineDivider } from "@revoltchat/ui";
import { useHistory } from "react-router-dom";
import { voiceState } from "../vortex/VoiceState";

export interface AudioDeviceMenuData {
    kind: "audioinput" | "audiooutput";
}

interface ActionData {
    action: "select_device" | "open_settings";
    kind: "audioinput" | "audiooutput";
    deviceId?: string;
}

/**
 * Context menu for right-clicking microphone and deafen/speaker buttons.
 * Allows quick selection of active input (microphone) and output (speaker/headphones) devices.
 */
export default observer(() => {
    const history = useHistory();
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

    useEffect(() => {
        let isMounted = true;
        const loadDevices = async () => {
            if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
                try {
                    const devs = await navigator.mediaDevices.enumerateDevices();
                    if (isMounted) {
                        setDevices(devs);
                    }
                } catch (_) {}
            }
        };

        loadDevices();
        navigator.mediaDevices?.addEventListener("devicechange", loadDevices);
        return () => {
            isMounted = false;
            navigator.mediaDevices?.removeEventListener("devicechange", loadDevices);
        };
    }, []);

    const contextClick = async (data?: ActionData) => {
        if (!data) return;

        if (data.action === "open_settings") {
            history.push("/settings/audio");
            return;
        }

        if (data.action === "select_device" && data.deviceId !== undefined) {
            await voiceState.changeAudioDevice(data.deviceId, data.kind);
        }
    };

    return (
        <ContextMenuWithData id="AudioDeviceOptions" onClose={contextClick}>
            {({ kind }: AudioDeviceMenuData) => {
                const targetKind = kind || "audioinput";
                const isInput = targetKind === "audioinput";
                const currentDeviceId =
                    (typeof window !== "undefined"
                        ? window.localStorage.getItem(
                              isInput ? "audioInputDevice" : "audioOutputDevice",
                          )
                        : null) || "default";

                const filtered = devices.filter((d) => d.kind === targetKind);

                // Build device entries list
                const deviceEntries: { id: string; label: string }[] = [];
                
                // Add system default option
                deviceEntries.push({
                    id: "default",
                    label: "По умолчанию",
                });

                // Add explicit enumerated devices
                let unnamedIndex = 1;
                filtered.forEach((d) => {
                    if (d.deviceId === "default") return;
                    const label =
                        d.label && d.label.trim().length > 0
                            ? d.label
                            : isInput
                            ? `Микрофон ${unnamedIndex++}`
                            : `Динамик ${unnamedIndex++}`;
                    deviceEntries.push({
                        id: d.deviceId,
                        label,
                    });
                });

                const elements: Children[] = [];

                // Menu Header
                elements.push(
                    <div
                        key="header"
                        style={{
                            padding: "6px 8px 4px 8px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--tertiary-foreground)",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}>
                        {isInput ? <Microphone size={14} /> : <VolumeFull size={14} />}
                        <span>{isInput ? "Устройство ввода" : "Устройство вывода"}</span>
                    </div>,
                );

                // Device Items
                deviceEntries.forEach((entry) => {
                    const isSelected =
                        currentDeviceId === entry.id ||
                        (currentDeviceId === "" && entry.id === "default");

                    elements.push(
                        <MenuItem
                            key={`dev-${entry.id}`}
                            data={{
                                action: "select_device",
                                kind: targetKind,
                                deviceId: entry.id,
                            }}>
                            <span
                                style={{
                                    maxWidth: "240px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                {entry.label}
                            </span>
                            {isSelected && (
                                <div className="tip">
                                    <Check size={18} />
                                </div>
                            )}
                        </MenuItem>,
                    );
                });

                elements.push(<LineDivider key="divider" compact />);

                // Settings link
                elements.push(
                    <MenuItem
                        key="settings"
                        data={{
                            action: "open_settings",
                            kind: targetKind,
                        }}>
                        <Cog size={18} />
                        <span>Настройки звука...</span>
                    </MenuItem>,
                );

                return elements;
            }}
        </ContextMenuWithData>
    );
});
