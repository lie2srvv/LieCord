import { PhoneCall } from "@styled-icons/boxicons-solid";
import { VolumeFull } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import styled, { keyframes } from "styled-components/macro";
import { Button } from "@revoltchat/ui";
import { Channel } from "revolt.js";
import { useClient } from "../../../controllers/client/ClientController";
import { voiceState } from "../../../lib/vortex/VoiceState";
import UserIcon from "../user/UserIcon";

const pulseGreen = keyframes`
    0% {
        transform: scale(1);
        opacity: 0.9;
    }
    50% {
        transform: scale(1.12);
        opacity: 1;
        filter: drop-shadow(0 0 6px rgba(87, 242, 135, 0.8));
    }
    100% {
        transform: scale(1);
        opacity: 0.9;
    }
`;

const BannerBase = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 18px;
    margin: calc(var(--header-height) + 12px) 16px 12px 16px;
    border-radius: 8px;
    background: linear-gradient(
        90deg,
        rgba(35, 165, 90, 0.18) 0%,
        rgba(26, 29, 35, 0.9) 100%
    );
    border: 1px solid rgba(87, 242, 135, 0.35);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 10;

    .left-section {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
    }

    .pulse-phone {
        color: #57f287;
        animation: ${pulseGreen} 1.8s infinite ease-in-out;
        flex-shrink: 0;
    }

    .text-block {
        display: flex;
        flex-direction: column;
        min-width: 0;

        .headline {
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .details {
            font-size: 12px;
            color: var(--secondary-foreground);
            margin-top: 2px;
        }
    }

    .avatars-row {
        display: flex;
        align-items: center;
        margin-left: 6px;

        > div {
            margin-left: -8px;
            border: 2px solid var(--secondary-background);
            border-radius: 50%;

            &:first-child {
                margin-left: 0;
            }
        }
    }

    .join-button {
        flex-shrink: 0;
        background: #23a55a !important;
        color: #ffffff !important;
        font-weight: 600;
        padding: 8px 18px;
        border-radius: 6px;
        cursor: pointer;
        transition: transform 0.12s ease, filter 0.12s ease;

        &:hover {
            transform: scale(1.03);
            filter: brightness(1.1);
        }
    }
`;

export const VoiceCallBanner = observer(({ channel }: { channel: Channel }) => {
    const client = useClient();
    const participants = voiceState.getChannelParticipants(channel._id);

    // Only render if call is active and local user is not connected to this call
    if (participants.length === 0 || voiceState.roomId === channel._id) {
        return null;
    }

    const firstUser = client.users.get(participants[0].id);
    const firstName =
        firstUser?.display_name ?? firstUser?.username ?? "Пользователь";

    let detailsText = `с ${firstName}`;
    if (participants.length > 1) {
        detailsText = `с ${firstName} и еще ${participants.length - 1}`;
    }

    const handleJoin = async () => {
        await voiceState.loadVoice();
        voiceState.disconnect();
        voiceState.connect(channel);
    };

    return (
        <BannerBase>
            <div className="left-section">
                <PhoneCall size={26} className="pulse-phone" />
                <div className="text-block">
                    <div className="headline">Идёт голосовой звонок</div>
                    <div className="details">{detailsText}</div>
                </div>
                <div className="avatars-row">
                    {participants.slice(0, 4).map((p) => (
                        <UserIcon
                            key={p.id}
                            target={client.users.get(p.id)}
                            size={28}
                        />
                    ))}
                </div>
            </div>
            <Button className="join-button" onClick={handleJoin}>
                Присоединиться к звонку
            </Button>
        </BannerBase>
    );
});

const LobbyBase = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-grow: 1;
    padding: 32px;
    text-align: center;
    background: var(--secondary-background);

    .icon-wrap {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: var(--primary-background);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--accent);
        margin-bottom: 16px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .channel-name {
        font-size: 22px;
        font-weight: 700;
        color: var(--foreground);
        margin-bottom: 8px;
    }

    .participants-status {
        font-size: 14px;
        color: var(--secondary-foreground);
        margin-bottom: 24px;
    }

    .participants-grid {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 16px;
        max-width: 500px;
        margin-bottom: 32px;
    }

    .participant-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--primary-background);
        border-radius: 8px;
        min-width: 90px;

        span {
            font-size: 12px;
            font-weight: 500;
            color: var(--foreground);
            max-width: 80px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    .connect-action-btn {
        background: #23a55a !important;
        color: #ffffff !important;
        font-size: 15px;
        font-weight: 600;
        padding: 12px 28px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: transform 0.15s ease, filter 0.15s ease;

        &:hover {
            transform: scale(1.04);
            filter: brightness(1.1);
        }
    }
`;

export const VoiceChannelLobby = observer(
    ({ channel }: { channel: Channel }) => {
        const client = useClient();
        const participants = voiceState.getChannelParticipants(channel._id);

        const handleConnect = async () => {
            await voiceState.loadVoice();
            voiceState.disconnect();
            voiceState.connect(channel);
        };

        return (
            <LobbyBase>
                <div className="icon-wrap">
                    <VolumeFull size={38} />
                </div>
                <div className="channel-name">{channel.name}</div>
                <div className="participants-status">
                    {participants.length === 0
                        ? "В этом голосовом канале пока никого нет"
                        : `В канале сейчас (${participants.length} чел.):`}
                </div>

                {participants.length > 0 && (
                    <div className="participants-grid">
                        {participants.map((p) => {
                            const user = client.users.get(p.id);
                            const name =
                                user?.display_name ??
                                user?.username ??
                                "Пользователь";
                            return (
                                <div key={p.id} className="participant-card">
                                    <UserIcon target={user} size={42} />
                                    <span>{name}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <Button className="connect-action-btn" onClick={handleConnect}>
                    <VolumeFull size={20} /> Подключиться к голосовому каналу
                </Button>
            </LobbyBase>
        );
    }
);
