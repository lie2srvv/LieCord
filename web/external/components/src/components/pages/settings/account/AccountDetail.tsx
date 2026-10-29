import { HelpCircle } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";
import React from "react";
import { User } from "revolt.js";
import styled from "styled-components";

import { useUI } from "../../../../lib";

import { Button, Avatar, Column, H1, Row, Tooltip } from "../../../design";

const AccountContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;

    @media (max-width: 600px) {
        flex-wrap: wrap;
        gap: 12px;

        .edit-profile-link {
            width: 100%;
            margin-top: 6px;

            button {
                width: 100%;
                justify-content: center;
            }
        }
    }
`;

const UserId = styled.div`
    gap: 4px;
    display: flex;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--tertiary-foreground);

    a {
        color: var(--tertiary-foreground);
    }
`;

export interface Props {
    /**
     * User object
     */
    user: User;
}

/**
 * Account information header component
 */
export const AccountDetail = observer(({ user }: Props) => {
    const { Link, Text, emitAction } = useUI();

    return (
        <AccountContainer>
            <Link to="/settings/profile" replace>
                <Avatar
                    src={user.generateAvatarURL({
                        max_side: 256,
                    })}
                    size={72}
                    interactive
                />
            </Link>
            <Row grow>
                <Column>
                    <H1>
                        {user.username}
                        {"#"}
                        {
                            (user as never as { discriminator: string })
                                .discriminator
                        }
                    </H1>
                    <UserId>
                        <Tooltip
                            content={
                                <Text id="app.settings.pages.account.unique_id" />
                            }>
                            <HelpCircle size={16} />
                        </Tooltip>
                        <Tooltip content={<Text id="app.special.copy" />}>
                            <a
                                onClick={() =>
                                    emitAction({
                                        type: "WriteClipboard",
                                        text: user._id,
                                    })
                                }>
                                {user._id}
                            </a>
                        </Tooltip>
                    </UserId>
                </Column>
            </Row>
            <div className="edit-profile-link">
                <Link to="/settings/profile" replace>
                    <Button palette="secondary">
                        <Text id="app.settings.pages.profile.edit_profile" />
                    </Button>
                </Link>
            </div>
        </AccountContainer>
    );
});
