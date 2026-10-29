import { ulid } from "ulid";

/**
 * Invisible unique system prefix for legitimate call started messages.
 * Contains Zero-Width Space (\u200B) and Word Joiner (\u2060) followed by a unique session tag.
 */
export const CALL_STARTED_PREFIX = "\u200B\u2060[call:started:";

/**
 * Creates a unique system call message payload.
 */
export function createCallStartedMessage(callId?: string): string {
    const id = callId || ulid();
    return `${CALL_STARTED_PREFIX}${id}] Звонок начат`;
}

/**
 * Determines whether a message is an authenticated system call started message.
 * Strict check prevents users from spoofing it with plain text.
 */
export function isCallStartedMessage(content?: string | null): boolean {
    if (typeof content !== "string") return false;
    return content.startsWith(CALL_STARTED_PREFIX) || content === "📞 Звонок начат";
}
