import { Route, Switch } from "react-router";
import styled from "styled-components/macro";

import { useEffect, useState } from "preact/hooks";

import { internalSubscribe } from "../../lib/eventEmitter";

import SidebarBase from "./SidebarBase";
import MemberSidebar from "./right/MemberSidebar";
import { SearchSidebar } from "./right/Search";
import { PinsSidebar } from "./right/Pins";

export default function RightSidebar() {
    const [sidebar, setSidebar] = useState<"search" | "pins" | undefined>();
    const close = () => setSidebar(undefined);

    useEffect(
        () =>
            internalSubscribe(
                "RightSidebar",
                "open",
                setSidebar as (...args: unknown[]) => void,
            ),
        [setSidebar],
    );

    useEffect(() => {
        if (!sidebar) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" || e.code === "Escape") {
                close();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [sidebar]);

    const content =
        sidebar === "search" ? (
            <SearchSidebar close={close} />
        ) : sidebar === "pins" ? (
            <PinsSidebar close={close} />
        ) : (
            <MemberSidebar />
        );

    return (
        <RightSidebarBase>
            <Switch>
                <Route path="/server/:server/channel/:channel">{content}</Route>
                <Route path="/channel/:channel">{content}</Route>
            </Switch>
        </RightSidebarBase>
    );
}

const RightSidebarBase = styled(SidebarBase)`
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
`;
