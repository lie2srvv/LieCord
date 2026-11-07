import { useEffect, useState } from "preact/hooks";
import { internalEmit, internalSubscribe } from "./eventEmitter";

const STORAGE_PREFIX = "liecord_pins_";

export function getPinnedMessageIds(channelId: string): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + channelId);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function isMessagePinned(channelId: string, messageId: string): boolean {
    const list = getPinnedMessageIds(channelId);
    return list.includes(messageId);
}

export function pinMessage(channelId: string, messageId: string) {
    const list = getPinnedMessageIds(channelId);
    if (!list.includes(messageId)) {
        const next = [messageId, ...list];
        localStorage.setItem(STORAGE_PREFIX + channelId, JSON.stringify(next));
        internalEmit("PinnedMessages", "update", channelId);
    }
}

export function unpinMessage(channelId: string, messageId: string) {
    const list = getPinnedMessageIds(channelId);
    if (list.includes(messageId)) {
        const next = list.filter((id) => id !== messageId);
        localStorage.setItem(STORAGE_PREFIX + channelId, JSON.stringify(next));
        internalEmit("PinnedMessages", "update", channelId);
    }
}

export function togglePinMessage(channelId: string, messageId: string): boolean {
    if (isMessagePinned(channelId, messageId)) {
        unpinMessage(channelId, messageId);
        return false;
    } else {
        pinMessage(channelId, messageId);
        return true;
    }
}

export function usePinnedMessageIds(channelId?: string): string[] {
    const [ids, setIds] = useState<string[]>(() =>
        channelId ? getPinnedMessageIds(channelId) : []
    );

    useEffect(() => {
        if (!channelId) return;
        setIds(getPinnedMessageIds(channelId));

        return internalSubscribe("PinnedMessages", "update", (updatedChannelId) => {
            if (updatedChannelId === channelId) {
                setIds(getPinnedMessageIds(channelId));
            }
        });
    }, [channelId]);

    return ids;
}
