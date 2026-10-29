import { Docked, OverlappingPanels, ShowIf } from "react-overlapping-panels";
import { Switch, Route, useLocation, Link, useHistory } from "react-router-dom";
import { modalController } from "../controllers/modals/ModalController";
import styled, { css } from "styled-components/macro";

import { useEffect, useState } from "preact/hooks";

import ContextMenus from "../lib/ContextMenus";
import { isTouchscreenDevice } from "../lib/isTouchscreenDevice";
import { shouldShowTitlebar } from "../lib/nativePlatform";

import { IncomingCallModal } from "../components/common/voice/IncomingCallModal";
import { VoiceConnectingToast } from "../components/common/voice/VoiceConnectingToast";
import { Titlebar } from "../components/native/Titlebar";
import BottomNavigation from "../components/navigation/BottomNavigation";
import LeftSidebar from "../components/navigation/LeftSidebar";
import RightSidebar from "../components/navigation/RightSidebar";
import { useClient } from "../controllers/client/ClientController";
import { useSystemAlert } from "../updateWorker";
import Open from "./Open";
import Channel from "./channels/Channel";
import Developer from "./developer/Developer";
import Discover from "./discover/Discover";
import Friends from "./friends/Friends";
import Home from "./home/Home";
import InviteBot from "./invite/InviteBot";
import ChannelSettings from "./settings/ChannelSettings";
import ServerSettings from "./settings/ServerSettings";
import Settings from "./settings/Settings";

const AppContainer = styled.div`
    background-size: cover !important;
    background-position: center center !important;
`;

export const StatusBar = styled.div`
    height: 40px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    //gap: 14px;
    gap: 8px;

    user-select: none;

    .button {
        padding: 5px;
        border: 1px solid white;
        border-radius: var(--border-radius);
    }

    a {
        cursor: pointer;
        color: var(--foreground);
    }

    .title {
        flex-grow: 1;
        text-align: center;
    }

    .actions {
        gap: 12px;
        display: flex;
        padding-right: 4px;
    }
`;

const Routes = styled.div.attrs({ "data-component": "routes" })<{
    borders: boolean;
    hasLeftPanel?: boolean;
}>`
    min-width: 0;
    display: flex;
    position: relative;
    flex-direction: column;

    background: var(--primary-background);

    ${(props) =>
        props.hasLeftPanel &&
        css`
            border-left: 1px solid rgba(255, 255, 255, 0.08);
        `}

    ${() =>
        isTouchscreenDevice &&
        css`
            overflow: hidden;
        `}
`;

export default function App() {
    const history = useHistory();
    const path = useLocation().pathname;
    const fixedBottomNav =
        path === "/" ||
        path === "/settings" ||
        path.startsWith("/friends") ||
        path.startsWith("/discover");
    const client = useClient();
    const inChannel = path.includes("/channel");
    const inServer = path.includes("/server");

    const inSpecial =
        (path.startsWith("/friends") && isTouchscreenDevice) ||
        path.startsWith("/invite") ||
        path.includes("/settings");

    // Extract channel ID from path: /channel/:id or /server/:server/channel/:id
    const channelMatch = path.match(/\/channel\/([0-9A-Za-z]+)/);
    const channelId = channelMatch ? channelMatch[1] : null;
    const currentChannel = channelId ? client?.channels?.get(channelId) : null;
    // Right panel (members list) only exists for Group and TextChannel on servers, NOT in Direct Messages
    const hasRightPanel =
        !inSpecial &&
        inChannel &&
        (inServer || currentChannel?.channel_type === "Group" || currentChannel?.channel_type === "TextChannel");

    const alert = useSystemAlert();
    const [statusBar, setStatusBar] = useState(false);
    useEffect(() => setStatusBar(true), [alert]);

    const showTitlebar = shouldShowTitlebar();

    // Handle Android system back gesture / back button
    useEffect(() => {
        let openedLeftFromBack = false;
        let openedLeftTime = 0;

        const onTouch = () => {
            openedLeftFromBack = false;
        };
        window.addEventListener("touchstart", onTouch, { passive: true });

        (window as any).handleAndroidBack = () => {
            // 0. If fullscreen video or screen stream is active, exit fullscreen
            if (typeof (window as any).__liecordExitFullscreen === "function") {
                const handled = (window as any).__liecordExitFullscreen();
                if (handled) return true;
            }
            // 1. If a modal is open, close/cancel it
            if (modalController.stack.length > 0) {
                modalController.pop("close");
                return true;
            }

            // 2. If a popup context menu is open, dismiss it
            const ctxMenu = document.querySelector('[class*="ContextMenuOverlay"]') as HTMLElement | null;
            if (ctxMenu) {
                ctxMenu.click();
                return true;
            }

            // 3. If in Settings or other subpages, navigate back inside settings first
            const curPath = window.location.pathname;
            if (curPath.includes("/settings")) {
                // If inside a settings subpage like /settings/sessions, go back to main /settings list
                if (curPath.startsWith("/settings/") && curPath !== "/settings") {
                    history.replace("/settings");
                    return true;
                }
                // If at the root of /settings, exit settings to the previous screen or home
                if (window.history.length > 1) {
                    history.goBack();
                } else {
                    history.push("/");
                }
                return true;
            }

            // 4. Check mobile sliding panels (OverlappingPanels)
            const snapEl = (document.querySelector("._2PvlZ") ||
                document.querySelector('[class*="snap"]') ||
                document.querySelector("._3IMWP > div") ||
                Array.from(document.querySelectorAll("div")).find(
                    (d) =>
                        d.style.gridTemplateColumns &&
                        (d.scrollWidth > d.clientWidth || d.style.overflowX === "scroll")
                )) as HTMLDivElement | null;

            if (snapEl) {
                const scrollLeft = snapEl.scrollLeft;
                const leftWidth = 290;

                // Right panel (members) is visible -> smoothly return to center chat
                if (scrollLeft > leftWidth + 40) {
                    snapEl.scrollTo({ left: leftWidth, behavior: "smooth" });
                    return true;
                }

                // Left panel (channels / conversations list) is visible
                if (scrollLeft < 40) {
                    if (openedLeftFromBack && Date.now() - openedLeftTime < 3500) {
                        openedLeftFromBack = false;
                        return false;
                    }
                    if (inChannel) {
                        snapEl.scrollTo({ left: leftWidth, behavior: "smooth" });
                        return true;
                    }
                    return false;
                }

                // In center chat -> smoothly open left panel (conversations / server channels)
                if (Math.abs(scrollLeft - leftWidth) <= 40 || !inChannel) {
                    openedLeftFromBack = true;
                    openedLeftTime = Date.now();
                    snapEl.scrollTo({ left: 0, behavior: "smooth" });
                    return true;
                }
            }

            if (curPath.startsWith("/friends") || curPath.startsWith("/discover") || curPath.startsWith("/dev")) {
                if (curPath !== "/") {
                    if (window.history.length > 1) {
                        history.goBack();
                    } else {
                        history.push("/");
                    }
                    return true;
                }
            }

            if (window.history.length > 1 && !inChannel) {
                history.goBack();
                return true;
            }

            return false;
        };

        return () => {
            window.removeEventListener("touchstart", onTouch);
            delete (window as any).handleAndroidBack;
        };
    }, [history, inChannel]);

    return (
        <>
            <VoiceConnectingToast />
            <IncomingCallModal />
            {alert && statusBar && (
                <StatusBar>
                    <div className="title">{alert.text}</div>
                    <div className="actions">
                        {alert.actions?.map((action) =>
                            action.type === "internal" ? (
                                <Link to={action.href}>
                                    <div className="button">{action.text}</div>
                                </Link>
                            ) : action.type === "external" ? (
                                <a
                                    href={action.href}
                                    target="_blank"
                                    rel="noreferrer">
                                    <div className="button">{action.text}</div>{" "}
                                </a>
                            ) : null,
                        )}
                        {alert.dismissable !== false && (
                            <a onClick={() => setStatusBar(false)}>
                                <div className="button">{"Dismiss"}</div>
                            </a>
                        )}
                    </div>
                </StatusBar>
            )}
            <AppContainer>
                {showTitlebar && <Titlebar />}
                <OverlappingPanels
                    width="100vw"
                    height={
                        (alert && statusBar ? "calc(" : "") +
                        (showTitlebar
                            ? "calc(var(--app-height) - var(--titlebar-height))"
                            : "var(--app-height)") +
                        (alert && statusBar ? " - 40px)" : "")
                    }
                    leftPanel={
                        inSpecial
                            ? undefined
                            : { width: 290, component: <LeftSidebar /> }
                    }
                    rightPanel={
                        hasRightPanel
                            ? { width: 236, component: <RightSidebar /> }
                            : undefined
                    }
                    bottomNav={{
                        component: <BottomNavigation />,
                        showIf: fixedBottomNav ? ShowIf.Always : ShowIf.Left,
                        height: 150,
                    }}
                    docked={isTouchscreenDevice ? Docked.None : Docked.Left}>
                    <Routes hasLeftPanel={!inSpecial} borders={inServer}>
                        <Switch>
                            <Route
                                path="/server/:server/channel/:channel/settings/:page"
                                component={ChannelSettings}
                            />
                            <Route
                                path="/server/:server/channel/:channel/settings"
                                component={ChannelSettings}
                            />
                            <Route
                                path="/server/:server/settings/:page"
                                component={ServerSettings}
                            />
                            <Route
                                path="/server/:server/settings"
                                component={ServerSettings}
                            />
                            <Route
                                path="/channel/:channel/settings/:page"
                                component={ChannelSettings}
                            />
                            <Route
                                path="/channel/:channel/settings"
                                component={ChannelSettings}
                            />

                            <Route
                                path="/channel/:channel/:message"
                                component={Channel}
                            />
                            <Route
                                path="/server/:server/channel/:channel/:message"
                                component={Channel}
                            />

                            <Route
                                path="/server/:server/channel/:channel"
                                component={Channel}
                            />
                            <Route path="/server/:server" component={Channel} />
                            <Route
                                path="/channel/:channel"
                                component={Channel}
                            />

                            <Route
                                path="/settings/:page"
                                component={Settings}
                            />
                            <Route path="/settings" component={Settings} />

                            <Route path="/discover" component={Discover} />

                            <Route path="/dev" component={Developer} />
                            <Route path="/friends" component={Friends} />
                            <Route path="/open/:id" component={Open} />
                            <Route path="/bot/:id" component={InviteBot} />
                            <Route path="/" component={Home} />
                        </Switch>
                    </Routes>
                    <ContextMenus />
                </OverlappingPanels>
            </AppContainer>
        </>
    );
}
