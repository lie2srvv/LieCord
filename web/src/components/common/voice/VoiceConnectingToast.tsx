import { observer } from "mobx-react-lite";
import styled, { keyframes } from "styled-components/macro";
import { PhoneCall } from "@styled-icons/boxicons-regular/PhoneCall";
import { voiceState } from "../../../lib/vortex/VoiceState";

const slideDown = keyframes`
    0% {
        opacity: 0;
        transform: translate(-50%, -24px) scale(0.95);
    }
    100% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
    }
`;

const pulse = keyframes`
    0%, 100% {
        transform: scale(1);
        opacity: 0.9;
    }
    50% {
        transform: scale(1.15);
        opacity: 1;
    }
`;

const ToastContainer = styled.div`
    position: fixed;
    top: max(env(safe-area-inset-top, 0px) + 16px, 16px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    background: rgba(24, 25, 28, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    pointer-events: none;
    user-select: none;
    animation: ${slideDown} 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;

    .icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--accent, #5865f2);
        animation: ${pulse} 1.4s infinite ease-in-out;
    }

    .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-top-color: var(--accent, #5865f2);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
`;

export const VoiceConnectingToast = observer(() => {
    if (!voiceState.connecting) return null;

    return (
        <ToastContainer role="status" aria-live="polite">
            <div className="icon-wrap">
                <PhoneCall size={18} />
            </div>
            <span>Соединение...</span>
            <div className="spinner" />
        </ToastContainer>
    );
});
