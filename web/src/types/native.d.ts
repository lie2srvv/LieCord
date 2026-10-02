type Build = "stable" | "nightly" | "dev";

type NativeConfig = {
    frame: boolean;
    build: Build;
    discordRPC: boolean;
    minimiseToTray: boolean;
    hardwareAcceleration: boolean;
};

export interface ScreenSource {
    id: string;
    name: string;
    isScreen: boolean;
    thumbnail: string;
    appIcon?: string;
}

declare interface Window {
    isNative?: boolean;
    nativeVersion: string;
    native: {
        min();
        max();
        close();
        reload();
        relaunch();

        getConfig(): NativeConfig;
        set(key: keyof NativeConfig, value: unknown);

        getAutoStart(): Promise<boolean>;
        enableAutoStart(): Promise<void>;
        disableAutoStart(): Promise<void>;

        getScreenSources?(): Promise<ScreenSource[]>;
        selectScreenSource?(id: string, audio?: boolean): Promise<boolean>;
    };
}

declare const Fragment = preact.Fragment;
