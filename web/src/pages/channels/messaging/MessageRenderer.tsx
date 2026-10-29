import { isCallStartedMessage } from "../../../lib/callMessage";
/* eslint-disable react-hooks/rules-of-hooks */
import { X } from "@styled-icons/boxicons-regular";
import dayjs from "dayjs";
import isEqual from "lodash.isequal";
import { observer } from "mobx-react-lite";
import { API, Message as MessageI, Nullable } from "revolt.js";
import styled from "styled-components/macro";
import { decodeTime } from "ulid";

import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import { MessageDivider, Preloader } from "@revoltchat/ui";

import { internalSubscribe, internalEmit } from "../../../lib/eventEmitter";
import { ChannelRenderer } from "../../../lib/renderer/Singleton";

import { useApplicationState } from "../../../mobx/State";

import Message from "../../../components/common/messaging/Message";
import { SystemMessage } from "../../../components/common/messaging/SystemMessage";
import { useClient } from "../../../controllers/client/ClientController";
import RequiresOnline from "../../../controllers/client/jsx/RequiresOnline";
import ConversationStart from "./ConversationStart";

interface Props {
    last_id?: string;
    highlight?: string;
    renderer: ChannelRenderer;
}

const BlockedMessage = styled.div`
    font-size: 0.8em;
    margin-top: 6px;
    padding: 4px 64px;
    color: var(--tertiary-foreground);

    &:hover {
        background: var(--hover);
    }
`;

export default observer(({ last_id, renderer, highlight }: Props) => {
    const client = useClient();
    const userId = client.user!._id;
    const queue = useApplicationState().queue;

    // Inline message editing is moved to MessageBox (Telegram-style EditBar)

    const render: Children[] = [];
    let previous: MessageI | undefined;

    if (renderer.atTop) {
        render.push(<ConversationStart channel={renderer.channel} />);
    } else {
        render.push(
            <RequiresOnline>
                <Preloader type="ring" />
            </RequiresOnline>,
        );
    }

    let head = true;
    let divided = false;
    function compare(
        current: string,
        curAuthor: string,
        currentMasq: Nullable<API.Masquerade>,
        previous: string,
        prevAuthor: string,
        previousMasq: Nullable<API.Masquerade>,
    ) {
        head = false;
        const atime = decodeTime(current),
            adate = new Date(atime),
            btime = decodeTime(previous),
            bdate = new Date(btime);

        let unread = false;
        if (!divided && last_id && previous >= last_id) {
            unread = true;
            divided = true;
        }

        let date;
        if (
            adate.getFullYear() !== bdate.getFullYear() ||
            adate.getMonth() !== bdate.getMonth() ||
            adate.getDate() !== bdate.getDate()
        ) {
            date = adate;
        }

        if (unread || date) {
            render.push(
                <MessageDivider
                    date={date ? dayjs(date).format("LL") : undefined}
                    unread={unread}
                />,
            );
            head = true;
        }

        head =
            head ||
            curAuthor !== prevAuthor ||
            Math.abs(btime - atime) >= 420000 ||
            !isEqual(currentMasq, previousMasq);
    }

    let blocked = 0;
    function pushBlocked() {
        render.push(
            <BlockedMessage>
                <X size={16} />{" "}
                <Text
                    id="app.main.channel.misc.blocked_messages"
                    fields={{ count: blocked }}
                />
            </BlockedMessage>,
        );
        blocked = 0;
    }

    for (const message of renderer.messages) {
        if (previous) {
            compare(
                message._id,
                message.author_id,
                message.masquerade,
                previous._id,
                previous.author_id,
                previous.masquerade,
            );
        }

        if (message.author_id === "00000000000000000000000000" || isCallStartedMessage(message.content)) {
            render.push(
                <SystemMessage
                    key={message._id}
                    message={message}
                    attachContext
                    highlight={highlight === message._id}
                />,
            );
        } else if (message.author?.relationship === "Blocked") {
            blocked++;
        } else {
            if (blocked > 0) pushBlocked();

            render.push(
                <Message
                    message={message}
                    key={message._id}
                    head={head}
                    attachContext
                    highlight={highlight === message._id}
                />,
            );
        }

        previous = message;
    }

    if (blocked > 0) pushBlocked();

    const nonces = renderer.messages.map((x) => x.nonce);
    if (renderer.atBottom) {
        for (const msg of queue.get(renderer.channel._id)) {
            if (nonces.includes(msg.id)) continue;

            if (previous) {
                compare(
                    msg.id,
                    userId!,
                    null,
                    previous._id,
                    previous.author_id,
                    previous.masquerade,
                );

                previous = {
                    _id: msg.id,
                    author_id: userId!,
                } as MessageI;
            }

            render.push(
                <Message
                    message={
                        new MessageI(client, {
                            ...msg.data,
                            replies: msg.data.replies.map((x) => x.id),
                        })
                    }
                    key={msg.id}
                    queued={msg}
                    head={head}
                    attachContext
                />,
            );
        }
    } else {
        render.push(
            <RequiresOnline>
                <Preloader type="ring" />
            </RequiresOnline>,
        );
    }

    return <>{render}</>;
});
