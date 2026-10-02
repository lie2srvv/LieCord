import { PhoneCall, PhoneOff } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import styled, { keyframes } from "styled-components/macro";
import { useClient } from "../../../controllers/client/ClientController";
import { voiceState } from "../../../lib/vortex/VoiceState";
import UserIcon from "../user/UserIcon";

const pulseAnimation = keyframes`
    0% {
        box-shadow: 0 0 0 0 rgba(87, 242, 135, 0.7);
    }
    70% {
        box-shadow: 0 0 0 12px rgba(87, 242, 135, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(87, 242, 135, 0);
    }
`;

const RingWrapper = styled.div`
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    background: rgba(22, 24, 29, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(87, 242, 135, 0.35);
    border-radius: 12px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(87, 242, 135, 0.2);
    min-width: 320px;
    animation: fadeIn 0.25s ease-out;

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-16px) scale(0.96);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
`;

const AvatarContainer = styled.div`
    position: relative;
    border-radius: 50%;
    animation: ${pulseAnimation} 1.5s infinite;
`;

const InfoCol = styled.div`
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;

    .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #57f287;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .caller-name {
        font-size: 15px;
        font-weight: 600;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
    }
`;

const ActionButtons = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;

    button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        transition: transform 0.15s ease, filter 0.15s ease;

        &:hover {
            transform: scale(1.08);
            filter: brightness(1.15);
        }

        &:active {
            transform: scale(0.95);
        }
    }

    .accept-btn {
        background: #23a55a;
        color: #ffffff;
    }

    .decline-btn {
        background: #ed4245;
        color: #ffffff;
    }
`;

export const IncomingCallModal = observer(() => {
    const call = voiceState.incomingCall;
    const client = useClient();

    if (!call) return null;

    const caller = client.users.get(call.callerId);

    const handleAccept = async () => {
        const channel = client.channels.get(call.channelId);
        voiceState.stopIncomingCall();
        if (channel) {
            await voiceState.loadVoice();
            voiceState.disconnect();
            voiceState.connect(channel);
        }
    };

    const handleDecline = () => {
        voiceState.stopIncomingCall();
    };

    return (
        <RingWrapper>
            <AvatarContainer>
                <UserIcon target={caller} size={46} />
            </AvatarContainer>
            <InfoCol>
                <div className="label">
                    <PhoneCall size={14} /> Входящий звонок
                </div>
                <div className="caller-name">{call.callerName}</div>
            </InfoCol>
            <ActionButtons>
                <button
                    className="accept-btn"
                    title="Принять"
                    onClick={handleAccept}>
                    <PhoneCall size={20} />
                </button>
                <button
                    className="decline-btn"
                    title="Отклонить"
                    onClick={handleDecline}>
                    <PhoneOff size={20} />
                </button>
            </ActionButtons>
        </RingWrapper>
    );
});
