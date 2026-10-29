import { Refresh } from "@styled-icons/boxicons-regular";

import { useEffect, useState } from "preact/hooks";

import { Button, CategoryButton, Checkbox, Tip } from "@revoltchat/ui";

const LieCordLogo = "/assets/logo.png";

export function Native() {
    if (typeof window.native === "undefined") return null;
    /* eslint-disable react-hooks/rules-of-hooks */

    const [config, setConfig] = useState(window.native.getConfig());
    const [autoStart, setAutoStart] = useState<boolean | undefined>();
    const fetchValue = () => window.native.getAutoStart().then(setAutoStart);

    const [hintReload, setHintReload] = useState(false);
    const [hintRelaunch, setHintRelaunch] = useState(false);
    const [confirmDev, setConfirmDev] = useState(false);

    useEffect(() => {
        fetchValue();
    }, []);

    return (
        <div style={{ marginTop: "10px" }}>
            <Tip>Some options might require a restart.</Tip>
            <h3>App Behavior</h3>
            <Checkbox
                value={autoStart ?? false}
                disabled={typeof autoStart === "undefined"}
                onChange={async (v) => {
                    if (v) {
                        await window.native.enableAutoStart();
                    } else {
                        await window.native.disableAutoStart();
                    }

                    setAutoStart(v);
                }}
                title="Start with computer"
                description="Launch LieCord when you log into your computer."
            />

            <Checkbox
                value={config.minimiseToTray}
                onChange={(minimiseToTray) => {
                    window.native.set("minimiseToTray", minimiseToTray);
                    setConfig({
                        ...config,
                        minimiseToTray,
                    });
                }}
                title="Minimise to Tray"
                description="Instead of closing, LieCord will hide in your tray."
            />
            <Checkbox
                value={config.discordRPC}
                onChange={(discordRPC) => {
                    window.native.set("discordRPC", discordRPC);
                    setConfig({
                        ...config,
                        discordRPC,
                    });
                }}
                title="Enable Discord status"
                description="Show LieCord on your Discord status."
            />
            {/* <Checkbox
                value={config.build === "nightly"}
                onChange={(nightly) => {
                    const build = nightly ? "nightly" : "stable";
                    window.native.set("build", build);
                    setHintReload(true);
                    setConfig({
                        ...config,
                        build,
                    });
                }}
                title="Revolt Nightly"
                description="Use the beta branch of Revolt."
            /> */}

            <h3>Titlebar</h3>
            <Checkbox
                value={config.customFrame ?? !config.frame ?? true}
                onChange={(customFrame) => {
                    window.native.set("customFrame", customFrame);
                    window.native.set("frame", !customFrame);
                    setHintRelaunch(true);
                    setConfig({
                        ...config,
                        customFrame,
                        frame: !customFrame,
                    });
                }}
                title="Custom window frame"
                description="Let LieCord use its own window frame."
            />
            <h3>Advanced</h3>
            <Checkbox
                value={config.hardwareAcceleration}
                onChange={async (hardwareAcceleration) => {
                    window.native.set(
                        "hardwareAcceleration",
                        hardwareAcceleration,
                    );
                    setHintRelaunch(true);
                    setConfig({
                        ...config,
                        hardwareAcceleration,
                    });
                }}
                title="Hardware Acceleration"
                description="Uses your GPU to render the app, disable if you run into visual issues."
            />

            <p style={{ display: "flex", gap: "8px" }}>
                <Button
                    palette="secondary"
                    compact
                    disabled={!hintReload}
                    onClick={window.native.reload}>
                    Reload Page
                </Button>
                <Button
                    palette="secondary"
                    compact
                    disabled={!hintRelaunch}
                    onClick={window.native.relaunch}>
                    Reload App
                </Button>
            </p>
            <hr />
            <CategoryButton
                icon={<img src={LieCordLogo} draggable={false} style={{ width: 24, height: 24, borderRadius: 6 }} />}
                description={<span>version {window.nativeVersion}</span>}
                action={<Refresh size={24} />}>
                LieCord Desktop
            </CategoryButton>
        </div>
    );
}
