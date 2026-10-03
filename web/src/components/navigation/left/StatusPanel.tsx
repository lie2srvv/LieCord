import {
    Microphone,
    MicrophoneOff,
    VolumeFull,
    VolumeMute,
    Cog,
    PhoneOff,
    PhoneCall,
} from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import styled from "styled-components/macro";

import { voiceState } from "../../../lib/vortex/VoiceState";

import { useClient } from "../../../controllers/client/ClientController";
import UserIcon from "../../common/user/UserIcon";

const PanelContainer = styled.div`
    display: flex;
    flex-direction: column;
    background: var(--primary-background);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    user-select: none;
    flex-shrink: 0;
`;

const VoiceConnectedBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(46, 204, 113, 0.12);
    border-bottom: 1px solid rgba(46, 204, 113, 0.25);
    font-size: 12px;

    .voice-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        margin-right: 6px;

        .status-title {
            color: #2ecc71;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .channel-name {
            color: var(--secondary-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 11px;
        }
    }

    .disconnect-btn {
        background: transparent;
        border: none;
        color: var(--error, #e74c3c);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;

        &:hover {
            background: rgba(231, 76, 60, 0.2);\n        }
    }
`;

const UserBar = styled.div`
    display: flex;
    align-items: center;
    padding: 6px 8px;
    gap: 8px;
    height: 52px;

    .user-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex: 1;
        cursor: pointer;
        min-width: 0;

        .username {
            color: var(--foreground);
            font-weight: 600;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .tag {
            color: var(--secondary-foreground);
            font-size: 11px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    .action-buttons {
        display: flex;
        align-items: center;
        gap: 2px;
    }
`;

const ActionButton = styled.button<{ active?: boolean; danger?: boolean }>`
    background: transparent;
    border: none;
    border-radius: 4px;
    padding: 6px;
    color: ${(props) =>
        props.danger
            ? "var(--error, #e74c3c)"
            : props.active
            ? "var(--foreground)"
            : "var(--secondary-foreground)"};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: ${(props) =>
            props.danger ? "var(--error, #e74c3c)" : "var(--foreground)"};
    }
`;

export const StatusPanel = observer(() => {
    const client = useClient();
    const user = client.user;

    const isConnected = !!voiceState.roomId;
    const isMicMuted = voiceState.isMuted;
    const isDeafened = voiceState.isDeafened;

    const activeChannel = voiceState.roomId
        ? client.channels.get(voiceState.roomId)
        : null;

    let channelDisplayName = "Голосовой канал";
    if (activeChannel) {
        if (activeChannel.channel_type === "DirectMessage") {
            const recipient = activeChannel.recipient;
            channelDisplayName = recipient
                ? recipient.display_name ?? recipient.username
                : "Личный звонок";
        } else if (activeChannel.channel_type === "Group") {
            channelDisplayName = activeChannel.name || "Групповой звонок";
        } else if (activeChannel.server) {
            channelDisplayName = `${activeChannel.server.name} / #${activeChannel.name}`;
        } else if (activeChannel.name) {
            channelDisplayName = activeChannel.name;
        }
    }

    const toggleMic = async () => {
        await voiceState.toggleMic();
    };

    const toggleDeafen = async () => {
        await voiceState.toggleDeafen();
    };

    if (!user) return null;

    return (
        <PanelContainer>
            {isConnected && (
                <VoiceConnectedBar>
                    <div className="voice-info">
                        <div className="status-title">
                            <PhoneCall size={14} /> Подключено к голосу
                        </div>
                        <div
                            className="channel-name"
                            title={channelDisplayName}>
                            {channelDisplayName}
                        </div>
                    </div>
                    <button
                        className="disconnect-btn"
                        title="Отключиться от звонка"
                        onClick={() => voiceState.disconnect()}>
                        <PhoneOff size={18} />
                    </button>
                </VoiceConnectedBar>
            )}

            <UserBar>
                <UserIcon size={36} target={user} status animate />
                <div className="user-info">
                    <span className="username">
                        {user.display_name ?? user.username}
                    </span>
                    <span className="tag">#{user.discriminator}</span>
                </div>
                <div className="action-buttons">
                    <ActionButton
                        title={
                            isMicMuted
                                ? "Включить микрофон"
                                : "Отключить микрофон"
                        }
                        danger={isMicMuted}
                        onClick={toggleMic}>
                        {isMicMuted ? (
                            <MicrophoneOff size={18} />
                        ) : (
                            <Microphone size={18} />
                        )}
                    </ActionButton>
                    <ActionButton
                        title={isDeafened ? "Включить звук" : "Заглушить звук"}
                        danger={isDeafened}
                        onClick={toggleDeafen}>
                        {isDeafened ? (
                            <VolumeMute size={18} />
                        ) : (
                            <VolumeFull size={18} />
                        )}
                    </ActionButton>
                    <Link to="/settings" style={{ display: "flex" }}>
                        <ActionButton title="Настройки пользователя">
                            <Cog size={18} />
                        </ActionButton>
                    </Link>
                </div>
            </UserBar>
        </PanelContainer>
    );
});
