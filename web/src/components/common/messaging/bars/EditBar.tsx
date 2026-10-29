import { Pencil, XCircle } from "@styled-icons/boxicons-solid";
import { Message } from "revolt.js";
import styled from "styled-components/macro";
import { Text } from "preact-i18n";

import { IconButton } from "@revoltchat/ui";
import Tooltip from "../../../common/Tooltip";

interface Props {
    message: Message;
    onCancel: () => void;
}

const Base = styled.div`
    @keyframes bottomBounce {
        0% {
            transform: translateY(33px);
        }
        100% {
            transform: translateY(0px);
        }
    }

    display: flex;
    height: 38px;
    padding: 0 16px;
    user-select: none;
    align-items: center;
    background: var(--secondary-background);
    border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    animation: bottomBounce 250ms cubic-bezier(0.2, 0.9, 0.5, 1.16) forwards;
    gap: 12px;
    z-index: 5;

    .edit-icon {
        display: flex;
        align-items: center;
        color: var(--accent);
        flex-shrink: 0;
    }

    .edit-details {
        display: flex;
        flex-direction: column;
        justify-content: center;
        flex-grow: 1;
        min-width: 0;
        overflow: hidden;

        .title {
            font-size: 11px;
            font-weight: 700;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1.2;
        }

        .preview {
            font-size: 13px;
            color: var(--secondary-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }
    }

    .actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
`;

export default function EditBar({ message, onCancel }: Props) {
    const previewText = message.content ? message.content.replace(/\n/g, " ") : "";

    return (
        <Base>
            <div className="edit-icon">
                <Pencil size={18} />
            </div>
            <div className="edit-details">
                <div className="title">
                    <Text id="context_menu.edit_message">Редактирование</Text>
                </div>
                <div className="preview">{previewText || "..."}</div>
            </div>
            <div className="actions">
                <IconButton onClick={onCancel}>
                    <Tooltip content="Отмена">
                        <XCircle size={18} />
                    </Tooltip>
                </IconButton>
            </div>
        </Base>
    );
}
