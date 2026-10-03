import { Desktop } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import styled, { css } from "styled-components/macro";

import { voiceState } from "../../../lib/vortex/VoiceState";

import { useClient } from "../../../controllers/client/ClientController";
import UserIcon from "../../common/user/UserIcon";

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 28px;
    padding-right: 8px;
    margin-top: 1px;
    margin-bottom: 4px;
`;

const ParticipantRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 13px;
    color: var(--secondary-foreground);
    user-select: none;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;

    &:hover {
        background: var(--hover);
        color: var(--foreground);
    }

    .name {
        flex-grow: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
    }

    .badge-icon {
        color: var(--accent);
        flex-shrink: 0;
    }
`;

const AvatarRing = styled.div<{ speaking?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: box-shadow 0.15s ease;

    ${(props) =>
        props.speaking &&
        css`
            box-shadow: 0 0 0 2px #57f287;
        `}
`;

interface Props {
    channelId: string;
    serverId: string;
}

export const VoiceChannelParticipants = observer(
    ({ channelId, serverId }: Props) => {
        const client = useClient();
        const participants = voiceState.getChannelParticipants(channelId);

        if (!participants || participants.length === 0) return null;

        const server = client.servers.get(serverId);

        return (
            <List>
                {participants.map((p) => {
                    const user = client.users.get(p.id);
                    const member = server?.getMember(p.id);
                    const name =
                        member?.nickname ??
                        user?.display_name ??
                        user?.username ??
                        "Пользователь";
                    const speaking = voiceState.isSpeaking(p.id);

                    return (
                        <ParticipantRow
                            key={p.id}
                            onClick={async () => {
                                const ch = client.channels.get(channelId);
                                if (ch && voiceState.roomId !== channelId) {
                                    await voiceState.loadVoice();
                                    voiceState.disconnect();
                                    voiceState.connect(ch);
                                }
                            }}>
                            <AvatarRing speaking={speaking}>
                                <UserIcon target={user} size={20} />
                            </AvatarRing>
                            <span className="name">{name}</span>
                            {p.screensharing && (
                                <Desktop size={14} className="badge-icon" />
                            )}
                        </ParticipantRow>
                    );
                })}
            </List>
        );
    },
);
