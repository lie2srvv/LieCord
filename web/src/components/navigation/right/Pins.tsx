import { Link, useParams } from "react-router-dom";
import { Message as MessageI } from "revolt.js";
import styled from "styled-components/macro";
import { useEffect, useState } from "preact/hooks";

import { Category, Error, Preloader } from "@revoltchat/ui";
import { Pin } from "@styled-icons/boxicons-solid";
import { X } from "@styled-icons/boxicons-regular";

import { useClient } from "../../../controllers/client/ClientController";
import Message from "../../common/messaging/Message";
import { GenericSidebarBase, GenericSidebarList } from "../SidebarBase";
import { usePinnedMessageIds, unpinMessage } from "../../../lib/pins";

const PinsBase = styled.div`
    padding: 6px;

    .header-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        font-size: 14px;
        color: var(--foreground);
        margin: 6px 0;
    }

    .list {
        gap: 8px;
        margin: 8px 0;
        display: flex;
        flex-direction: column;
    }

    .message-card {
        margin: 2px 0;
        padding: 6px 8px;
        overflow: hidden;
        border-radius: var(--border-radius);
        color: var(--foreground);
        background: var(--primary-background);
        position: relative;
        transition: background 0.15s ease;

        &:hover {
            background: var(--hover);
        }

        .unpin-button {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.4);
            color: var(--secondary-foreground);
            cursor: pointer;
            z-index: 2;
            transition: color 0.15s ease, background 0.15s ease;

            &:hover {
                color: var(--error);
                background: rgba(0, 0, 0, 0.7);
            }
        }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 16px;
        text-align: center;
        color: var(--secondary-foreground);
        gap: 8px;

        svg {
            opacity: 0.35;
        }

        .title {
            font-weight: 600;
            color: var(--foreground);
        }

        .desc {
            font-size: 12px;
            line-height: 1.4;
        }
    }
`;

interface Props {
    close: () => void;
}

export function PinsSidebar({ close }: Props) {
    const client = useClient();
    const { channel: channelId } = useParams<{ channel: string }>();
    const channel = client.channels.get(channelId);
    const pinnedIds = usePinnedMessageIds(channelId);

    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<MessageI[]>([]);

    useEffect(() => {
        let mounted = true;
        if (!channel || pinnedIds.length === 0) {
            setMessages([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        Promise.all(
            pinnedIds.map(async (id) => {
                const cached = channel.messages.get(id);
                if (cached) return cached;
                try {
                    return await channel.fetchMessage(id);
                } catch {
                    return null;
                }
            })
        ).then((res) => {
            if (mounted) {
                setMessages(res.filter(Boolean) as MessageI[]);
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
        };
    }, [channel, pinnedIds]);

    return (
        <GenericSidebarBase borderSide="left" data-scroll-offset="with-padding">
            <GenericSidebarList>
                <PinsBase>
                    <Category>
                        <Error
                            error={<a onClick={close}>« Назад к участникам</a>}
                        />
                    </Category>
                    <div className="header-title">
                        <Pin size={18} color="var(--accent)" />
                        <span>Закрепленные сообщения ({pinnedIds.length})</span>
                    </div>

                    {loading && <Preloader type="ring" />}

                    {!loading && messages.length === 0 && (
                        <div className="empty-state">
                            <Pin size={48} />
                            <div className="title">Нет закрепленных сообщений</div>
                            <div className="desc">
                                Нажмите на значок булавки у любого сообщения, чтобы закрепить его в этом канале.
                            </div>
                        </div>
                    )}

                    {!loading && messages.length > 0 && (
                        <div className="list">
                            {messages.map((message) => {
                                let href = "";
                                if (channel?.channel_type === "TextChannel") {
                                    href += `/server/${channel.server_id}`;
                                }
                                href += `/channel/${message.channel_id}/${message._id}`;

                                return (
                                    <div className="message-card" key={message._id}>
                                        <div
                                            className="unpin-button"
                                            title="Открепить сообщение"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                unpinMessage(message.channel_id, message._id);
                                            }}>
                                            <X size={16} />
                                        </div>
                                        <Link to={href} style={{ textDecoration: "none" }}>
                                            <div style={{ pointerEvents: "none" }}>
                                                <Message
                                                    message={message}
                                                    head
                                                    hideReply
                                                />
                                            </div>
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </PinsBase>
            </GenericSidebarList>
        </GenericSidebarBase>
    );
}
