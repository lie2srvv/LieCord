import { Wrench } from "@styled-icons/boxicons-solid";
import styled, { css } from "styled-components/macro";

import UpdateIndicator from "../common/UpdateIndicator";
import { isMac, shouldShowTitlebar } from "../../lib/nativePlatform";

interface Props {
    overlay?: boolean;
}

const TitlebarBase = styled.div<Props>`
    height: var(--titlebar-height, 29px);
    min-height: var(--titlebar-height, 29px);
    display: flex;
    user-select: none;
    align-items: center;
    background-color: var(--primary-header, #151313);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    box-sizing: border-box;
    width: 100%;
    z-index: 9999;
    -webkit-app-region: drag;

    ${(props) =>
        props.overlay &&
        css`
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background-color: transparent;
            border-bottom: none;
        `}

    &.is-mac {
        padding-left: 78px;
    }

    .drag {
        flex-grow: 1;
        -webkit-app-region: drag;
        height: 100%;
    }

    .title {
        -webkit-app-region: drag;
        font-size: 13px;
        font-weight: 700;
        margin-inline-start: 12px;
        gap: 6px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        z-index: 10000;
        color: var(--titlebar-logo-color, var(--secondary-foreground));
        user-select: none;
        height: 100%;

        .brand {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: var(--titlebar-logo-color, var(--secondary-foreground));
            line-height: 1;
        }

        svg {
            display: inline-block;
        }
    }

    .actions {
        z-index: 10001;
        display: flex;
        align-items: center;
        height: 100%;
        margin-inline-start: 6px;
        -webkit-app-region: no-drag !important;

        .action-btn {
            width: 44px;
            height: 100%;
            display: grid;
            place-items: center;
            cursor: pointer;
            -webkit-app-region: no-drag !important;
            color: var(--secondary-foreground, #aaa);
            transition: 0.15s ease color, 0.15s ease background-color;

            &:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }

            &.error:hover {
                background: #e81123 !important;
                color: #ffffff !important;
            }
        }
    }
`;

export function Titlebar(props: Props) {
    if (!shouldShowTitlebar()) return null;

    const handleMin = () => {
        try {
            if (window.native?.min) window.native.min();
            else if (window.native?.minimise) window.native.minimise();
        } catch (e) {
            console.error("Failed to minimise:", e);
        }
    };

    const handleMax = () => {
        try {
            if (window.native?.max) window.native.max();
            else if (window.native?.maximise) window.native.maximise();
        } catch (e) {
            console.error("Failed to maximise:", e);
        }
    };

    const handleClose = () => {
        try {
            if (window.native?.close) window.native.close();
        } catch (e) {
            console.error("Failed to close:", e);
        }
    };

    const isDev = window.native?.getConfig?.()?.build === "dev";

    return (
        <TitlebarBase
            {...props}
            className={`${props.overlay ? "overlay" : ""} ${isMac ? "is-mac" : ""}`}>
            <div className="title">
                <span className="brand">LieCord</span>
                {isDev && <Wrench size="12.5" />}
            </div>
            <div className="drag" />
            <UpdateIndicator style="titlebar" />

            {/* Custom controls on Windows/Linux; on macOS native traffic lights are kept without custom buttons */}
            {!isMac && (
                <div className="actions">
                    <div
                        className="action-btn"
                        onClick={handleMin}
                        title="Свернуть">
                        <svg
                            aria-hidden="false"
                            width="12"
                            height="12"
                            viewBox="0 0 12 12">
                            <rect
                                fill="currentColor"
                                width="10"
                                height="1"
                                x="1"
                                y="6"
                            />
                        </svg>
                    </div>
                    <div
                        className="action-btn"
                        onClick={handleMax}
                        title="Развернуть">
                        <svg
                            aria-hidden="false"
                            width="12"
                            height="12"
                            viewBox="0 0 12 12">
                            <rect
                                width="9"
                                height="9"
                                x="1.5"
                                y="1.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                            />
                        </svg>
                    </div>
                    <div
                        className="action-btn error"
                        onClick={handleClose}
                        title="Закрыть в трей">
                        <svg
                            aria-hidden="false"
                            width="12"
                            height="12"
                            viewBox="0 0 12 12">
                            <polygon
                                fill="currentColor"
                                strokeWidth="1"
                                fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                style={{ stroke: "currentColor", strokeWidth: 0.4 }}
                            />
                        </svg>
                    </div>
                </div>
            )}
        </TitlebarBase>
    );
}
