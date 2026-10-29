import { useRef, useState } from "preact/hooks";
import { Message, Group } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { useHistory, useLocation } from "react-router";
import styled, { css } from "styled-components/macro";

import { Centred, IconButton } from "@revoltchat/ui";

import { useApplicationState } from "../../mobx/State";

import {
    clientController,
    useClient,
} from "../../controllers/client/ClientController";
import { modalController } from "../../controllers/modals/ModalController";
import UserIcon from "../common/user/UserIcon";
import { AccountSwitcherSheet } from "./AccountSwitcherSheet";

const Base = styled.div`
    background: var(--secondary-background);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
    padding-bottom: max(
        env(safe-area-inset-bottom, 0px),
        var(--android-bottom-inset, 0px)
    );
`;

const Navbar = styled.div`
    z-index: 500;
    display: flex;
    margin: 0 auto;
    max-width: 500px;
    height: var(--bottom-navigation-height);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
`;

const Button = styled.div<{ active: boolean }>`
    flex: 1;
    color: var(--foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;

    * {
        color: var(--foreground) !important;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
    }

    > div {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 20px;
    }

    ${(props) =>
        props.active &&
        css`
            background: var(--hover);
        `}
`;

function triggerHaptic(ms = 35) {
    try {
        if ((window as any).LieCordNative?.vibrate) {
            (window as any).LieCordNative.vibrate(ms);
            return;
        }
    } catch (_) {}
    try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(ms);
        }
    } catch (_) {}
}

export default observer(() => {
    const client = useClient();
    const layout = useApplicationState().layout;
    const user = client.users.get(client.user!._id);

    const history = useHistory();
    const path = useLocation().pathname;

    const friendsActive = path.startsWith("/friends");
    const settingsActive = path.startsWith("/settings");
    const homeActive = !(friendsActive || settingsActive);

    const isAndroidApp =
        (typeof window !== "undefined" &&
            ((window as any).isLieCordApp ||
                (window as any).LieCordNative)) ||
        (typeof navigator !== "undefined" &&
            navigator.userAgent.includes("LieCordMobile"));

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

    const longPressTimerRef = useRef<any>(null);
    const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggingRef = useRef(false);
    const sheetOpenedViaTouchRef = useRef(false);
    const lastHoveredIdRef = useRef<string | null>(null);

    const handleAvatarTouchStart = (e: React.TouchEvent) => {
        if (!isAndroidApp) return;

        const touch = e.touches[0];
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        isDraggingRef.current = false;
        sheetOpenedViaTouchRef.current = false;
        setHoveredTargetId(null);
        lastHoveredIdRef.current = null;

        longPressTimerRef.current = setTimeout(() => {
            triggerHaptic(35);
            setIsSheetOpen(true);
            isDraggingRef.current = true;
            sheetOpenedViaTouchRef.current = true;
        }, 220);
    };

    const handleAvatarTouchMove = (e: React.TouchEvent) => {
        if (!isAndroidApp || !touchStartPosRef.current) return;

        const touch = e.touches[0];
        const dist = Math.hypot(
            touch.clientX - touchStartPosRef.current.x,
            touch.clientY - touchStartPosRef.current.y,
        );

        if (!sheetOpenedViaTouchRef.current) {
            // Cancel if finger moved before hold threshold
            if (dist > 10) {
                if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
            }
            return;
        }

        // Long press was fired! User is holding & dragging
        if (e.cancelable) e.preventDefault();

        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el) {
            setHoveredTargetId(null);
            lastHoveredIdRef.current = null;
            return;
        }

        let newTargetId: string | null = null;
        const accountEl = el.closest("[data-account-id]") as HTMLElement | null;
        if (accountEl && accountEl.dataset.accountId) {
            newTargetId = accountEl.dataset.accountId;
        } else {
            const addEl = el.closest(
                '[data-action="add-account"]',
            ) as HTMLElement | null;
            if (addEl) {
                newTargetId = "add-account";
            }
        }

        setHoveredTargetId(newTargetId);
        if (newTargetId && newTargetId !== lastHoveredIdRef.current) {
            lastHoveredIdRef.current = newTargetId;
            triggerHaptic(15);
        } else if (!newTargetId) {
            lastHoveredIdRef.current = null;
        }
    };

    const handleAvatarTouchEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        lastHoveredIdRef.current = null;

        if (!sheetOpenedViaTouchRef.current) {
            // Normal short tap
            touchStartPosRef.current = null;
            history.push("/settings");
            return;
        }

        // Hold & drag release
        touchStartPosRef.current = null;
        const targetId = hoveredTargetId;
        setHoveredTargetId(null);

        if (targetId) {
            if (targetId === "add-account") {
                setIsSheetOpen(false);
                modalController.push({ type: "add_account" });
            } else if (targetId === clientController.current) {
                // Released on current active account -> do nothing
                setIsSheetOpen(false);
            } else {
                // Released on a different account -> switch!
                clientController.switchAccount(targetId);
                history.push("/");
                setIsSheetOpen(false);
            }
        } else {
            // User released without dragging onto a card -> keep sheet open for tapping
            isDraggingRef.current = false;
        }
    };

    return (
        <Base>
            <Navbar>
                <Button
                    active={homeActive}
                    onClick={() => {
                        if (settingsActive) {
                            if (history.length > 0) {
                                history.replace(layout.getLastPath());
                                return;
                            }
                        }

                        const path = layout.getLastHomePath();
                        if (path.startsWith("/friends")) {
                            history.push("/");
                        } else {
                            history.push(path);
                        }
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}>
                    <Centred>
                        <Message size={24} />
                    </Centred>
                </Button>
                <Button
                    active={friendsActive}
                    onClick={() => history.push("/friends")}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}>
                    <IconButton>
                        <Group size={25} />
                    </IconButton>
                </Button>

                <Button
                    active={settingsActive}
                    onClick={() => {
                        if (!isAndroidApp) {
                            history.push("/settings");
                        }
                    }}
                    onTouchStart={handleAvatarTouchStart}
                    onTouchMove={handleAvatarTouchMove}
                    onTouchEnd={handleAvatarTouchEnd}
                    onTouchCancel={() => {
                        if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                        }
                        lastHoveredIdRef.current = null;
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}>
                    <IconButton>
                        <UserIcon target={user} size={26} status={true} />
                    </IconButton>
                </Button>
            </Navbar>

            <AccountSwitcherSheet
                isOpen={isSheetOpen}
                hoveredTargetId={hoveredTargetId}
                onClose={() => setIsSheetOpen(false)}
                onSelectAccount={(targetId) => {
                    if (targetId !== clientController.current) {
                        clientController.switchAccount(targetId);
                        history.push("/");
                    }
                    setIsSheetOpen(false);
                }}
                onAddAccount={() => {
                    setIsSheetOpen(false);
                    modalController.push({ type: "add_account" });
                }}
            />
        </Base>
    );
});
