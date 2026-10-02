import { Wrench } from "@styled-icons/boxicons-solid";
import styled, { css } from "styled-components/macro";

import UpdateIndicator from "../common/UpdateIndicator";

interface Props {
    overlay?: boolean;
}

const TitlebarBase = styled.div<Props>`
    height: var(--titlebar-height);
    display: flex;
    user-select: none;
    align-items: center;

    ${(props) =>
        props.overlay &&
        css`
            position: fixed;
            width: 100%;
        `}

    .drag {
        flex-grow: 1;
        -webkit-app-region: drag;
        height: 100%;
    }

    .quick {
        color: var(--secondary-foreground);

        > div,
        > div > div {
            width: var(--titlebar-height) !important;
        }

        &.disabled {
            color: var(--error);
        }

        &.unavailable {
            background: var(--error);
        }
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
        z-index: 90000;
        color: var(--titlebar-logo-color);
        user-select: none;
        height: 100%;

        .brand {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: var(--titlebar-logo-color);
            line-height: 1;
        }

        svg {
            display: inline-block;
        }
    }

    .actions {
        z-index: 100;
        display: flex;
        align-items: center;
        margin-inline-start: 6px;

        div {
            width: calc(
                var(--titlebar-height) + var(--titlebar-action-padding)
            );
            height: var(--titlebar-height);

            display: grid;
            place-items: center;
            transition: 0.2s ease color;
            transition: 0.2s ease background-color;

            &:hover {
                background: var(--primary-background);
            }

            &.error:hover {
                background: var(--error);
            }
        }
    }
`;

export function Titlebar(props: Props) {
    return (
        <TitlebarBase {...props}>
            <div className="title">
                <span className="brand">LieCord</span>
                {window.native.getConfig().build === "dev" && (
                    <Wrench size="12.5" />
                )}
            </div>
            {/*<div className="actions quick">
                <Tooltip
                    content="Mute"
                    placement="bottom">
                    <div onClick={window.native.min}>
                        <Microphone size={15}/>
                    </div>
                </Tooltip>
                <Tooltip
                    content="Deafen"
                    placement="bottom">
                    <div onClick={window.native.min}>
                        <VolumeFull size={15}/>
                    </div>
                </Tooltip>
            </div>*/}
            <div className="drag" />
            <UpdateIndicator style="titlebar" />
            <div className="actions">
                <div onClick={window.native.min}>
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
                <div onClick={window.native.max}>
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
                        />
                    </svg>
                </div>
                <div onClick={window.native.close} className="error">
                    <svg
                        aria-hidden="false"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12">
                        <polygon
                            fill="currentColor"
                            stroke-width="1"
                            fill-rule="evenodd"
                            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                            style="stroke:currentColor;stroke-width:0.4"
                        />
                    </svg>
                </div>
            </div>
        </TitlebarBase>
    );
}
