import { observer } from "mobx-react-lite";
import styled, { css, keyframes } from "styled-components/macro";
import { Check, Plus } from "@styled-icons/boxicons-regular";
import { useApplicationState } from "../../mobx/State";
import { clientController } from "../../controllers/client/ClientController";
import UserIcon from "../common/user/UserIcon";

const slideIn = keyframes`
    from {
        opacity: 0;
        transform: translateY(14px) scale(0.96);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
`;

const Container = styled.div`
    position: fixed;
    bottom: calc(var(--bottom-navigation-height) + max(env(safe-area-inset-bottom, 0px), var(--android-bottom-inset, 0px)) + 10px);
    right: 12px;
    z-index: 9999;
    width: calc(100vw - 24px);
    max-width: 310px;
    background: #1c1a1a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: ${slideIn} 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
`;

const Title = styled.div`
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--foreground-muted, rgba(255, 255, 255, 0.5));
    padding: 4px 8px 2px 8px;
`;

const AccountItem = styled.div<{ active?: boolean; hovered?: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.12s ease, transform 0.12s ease;
    background: transparent;

    ${(props) =>
        props.hovered &&
        css`
            background: rgba(255, 255, 255, 0.14) !important;
            transform: scale(1.02);
        `}

    ${(props) =>
        !props.hovered &&
        props.active &&
        css`
            background: rgba(255, 255, 255, 0.06);
        `}

    &:active {
        background: rgba(255, 255, 255, 0.12);
    }
`;

const AccountInfo = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
`;

const AccountName = styled.div`
    font-size: 14px;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const AccountTag = styled.div`
    font-size: 12px;
    color: var(--foreground-muted, rgba(255, 255, 255, 0.5));
`;

const ActiveIndicator = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent, #5865f2);
`;

const Divider = styled.div`
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 2px 4px;
`;

const AddButton = styled.div<{ hovered?: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 10px;
    border-radius: 12px;
    cursor: pointer;
    color: var(--accent, #5865f2);
    font-weight: 600;
    font-size: 14px;
    transition: background 0.12s ease, transform 0.12s ease;

    ${(props) =>
        props.hovered &&
        css`
            background: rgba(255, 255, 255, 0.14) !important;
            transform: scale(1.02);
        `}

    &:active {
        background: rgba(255, 255, 255, 0.08);
    }
`;

const AddIconWrapper = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px dashed rgba(255, 255, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent, #5865f2);
`;

interface Props {
    isOpen: boolean;
    hoveredTargetId: string | null;
    onClose: () => void;
    onSelectAccount: (userId: string) => void;
    onAddAccount: () => void;
}

export const AccountSwitcherSheet = observer(
    ({
        isOpen,
        hoveredTargetId,
        onClose,
        onSelectAccount,
        onAddAccount,
    }: Props) => {
        if (!isOpen) return null;

        const state = useApplicationState();
        const accounts = state.auth.getAccounts();
        const currentUserId = clientController.current;

        return (
            <>
                <Backdrop onClick={onClose} />
                <Container
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}>
                    <Title>Аккаунты</Title>
                    {accounts.map((acc) => {
                        const userId = acc.session.user_id;
                        const session = clientController.sessions.get(userId);
                        const user =
                            session?.client?.user ||
                            session?.client?.users.get(userId);
                        const isCurrent = userId === currentUserId;
                        const isHovered = hoveredTargetId === userId;
                        const username =
                            user?.username || acc.session.name || "Аккаунт";
                        const tag =
                            user?.discriminator !== undefined
                                ? `#${user.discriminator}`
                                : "";

                        return (
                            <AccountItem
                                key={userId}
                                data-account-id={userId}
                                active={isCurrent}
                                hovered={isHovered}
                                onClick={() => onSelectAccount(userId)}>
                                <UserIcon
                                    target={user}
                                    size={36}
                                    status={true}
                                />
                                <AccountInfo>
                                    <AccountName>{username}</AccountName>
                                    <AccountTag>
                                        {tag}
                                        {isCurrent ? " • Активен" : ""}
                                    </AccountTag>
                                </AccountInfo>
                                {isCurrent && (
                                    <ActiveIndicator>
                                        <Check size={20} />
                                    </ActiveIndicator>
                                )}
                            </AccountItem>
                        );
                    })}

                    <Divider />

                    <AddButton
                        data-action="add-account"
                        hovered={hoveredTargetId === "add-account"}
                        onClick={onAddAccount}>
                        <AddIconWrapper>
                            <Plus size={22} />
                        </AddIconWrapper>
                        <span>Добавить аккаунт</span>
                    </AddButton>
                </Container>
            </>
        );
    },
);
