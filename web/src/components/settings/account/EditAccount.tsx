import styled from "styled-components/macro";
import { At } from "@styled-icons/boxicons-regular";
import { Envelope, Key, Pencil } from "@styled-icons/boxicons-solid";
import { observer } from "mobx-react-lite";

import { Text } from "preact-i18n";
import { useEffect, useState } from "preact/hooks";

import {
    CategoryButton,
    Column,
    HiddenValue,
    Avatar,
    Button,
    Tooltip,
} from "@revoltchat/ui";
import { Link } from "react-router-dom";
import { HelpCircle } from "@styled-icons/boxicons-solid";

const CustomAccountContainer = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: 12px;

    .top-info {
        display: flex;
        align-items: center;
        gap: 16px;
        width: 100%;
        min-width: 0;

        .user-meta {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1;

            h1 {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                color: var(--foreground);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }
    }

    .edit-profile-btn-wrap {
        width: 100%;

        a {
            display: block;
            width: 100%;
            text-decoration: none;
        }

        button {
            width: 100% !important;
            justify-content: center !important;
        }
    }

    @media (min-width: 601px) {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;

        .edit-profile-btn-wrap {
            width: auto;

            a {
                width: auto;
            }

            button {
                width: auto !important;
            }
        }
    }
`;

const CustomUserId = styled.div`
    gap: 4px;
    display: flex;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--tertiary-foreground);
    margin-top: 4px;

    a {
        color: var(--tertiary-foreground);
        cursor: pointer;
    }
`;

import { useSession } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";

export default observer(() => {
    const session = useSession()!;
    const client = session.client!;

    const [email, setEmail] = useState("...");

    useEffect(() => {
        if (email === "..." && session.state === "Online") {
            client.api
                .get("/auth/account/")
                .then((account) => setEmail(account.email));
        }
    }, [client, email, session.state]);

    return (
        <>
            <Column group style={{ maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
                <CustomAccountContainer>
                    <div className="top-info">
                        <Link to="/settings/profile" replace>
                            <Avatar
                                src={client.user!.generateAvatarURL({ max_side: 256 })}
                                size={64}
                                interactive
                            />
                        </Link>
                        <div className="user-meta">
                            <h1>
                                {client.user!.username}#{client.user!.discriminator}
                            </h1>
                            <CustomUserId>
                                <Tooltip content={<Text id="app.settings.pages.account.unique_id" />}>
                                    <HelpCircle size={16} />
                                </Tooltip>
                                <Tooltip content={<Text id="app.special.copy" />}>
                                    <a
                                        onClick={() => {
                                            navigator.clipboard?.writeText(client.user!._id);
                                        }}>
                                        {client.user!._id}
                                    </a>
                                </Tooltip>
                            </CustomUserId>
                        </div>
                    </div>
                    <div className="edit-profile-btn-wrap">
                        <Link to="/settings/profile" replace>
                            <Button palette="secondary">
                                <Text id="app.settings.pages.profile.edit_profile" />
                            </Button>
                        </Link>
                    </div>
                </CustomAccountContainer>
            </Column>

            {(
                [
                    [
                        "username",
                        client.user!.username +
                            "#" +
                            client.user!.discriminator,
                        At,
                    ],
                    ["email", email, Envelope],
                    ["password", "•••••••••", Key],
                ] as const
            ).map(([field, value, Icon]) => (
                <CategoryButton
                    key={field}
                    icon={<Icon size={24} />}
                    description={
                        field === "email" ? (
                            <HiddenValue
                                value={value}
                                placeholder={"•••••••••••@••••••.•••"}
                            />
                        ) : (
                            value
                        )
                    }
                    account
                    action={<Pencil size={20} />}
                    onClick={() =>
                        modalController.push({
                            type: "modify_account",
                            client,
                            field,
                        })
                    }>
                    <Text id={`login.${field}`} />
                </CategoryButton>
            ))}
        </>
    );
});
