import {
    BarChartAlt2,
    Microphone,
    MicrophoneOff,
    PhoneOff,
    VolumeFull,
    VolumeMute,
} from "@styled-icons/boxicons-solid";
import { Desktop } from "@styled-icons/boxicons-regular";
import { observer } from "mobx-react-lite";
import styled, { css } from "styled-components/macro";

import { Text } from "preact-i18n";
import { useMemo } from "preact/hooks";

import { Button } from "@revoltchat/ui";

import { voiceState, VoiceStatus } from "../../../lib/vortex/VoiceState";

import Tooltip from "../../../components/common/Tooltip";
import UserIcon from "../../../components/common/user/UserIcon";
import { useClient } from "../../../controllers/client/ClientController";
import { modalController } from "../../../controllers/modals/ModalController";

interface Props {
    id: string;
}

const VoiceBase = styled.div`
    margin-top: 48px;
    padding: 20px;
    background: var(--secondary-background);
    flex-grow: 1;

    .status {
        flex: 1 0;
        display: flex;
        position: absolute;
        align-items: center;

        padding: 10px;
        font-size: 13px;
        font-weight: 500;
        user-select: none;
        gap: 6px;

        color: var(--success);
        border-radius: var(--border-radius);
        background: var(--primary-background);

        svg {
            cursor: help;
        }
    }

    display: flex;
    flex-direction: column;

    .participants {
        margin: 40px 20px;
        justify-content: center;
        user-select: none;
        display: flex;
        flex-flow: row wrap;
        gap: 20px;

        div:hover img {
            opacity: 0.8;
        }

        .disconnected {
            opacity: 0.5;
        }
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: 10px;
    }
`;

const ParticipantWrapper = styled.div<{ speaking?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    border-radius: 50%;
    transition: box-shadow 0.15s ease, transform 0.15s ease;

    ${(props) =>
        props.speaking &&
        css`
            box-shadow: 0 0 0 3px #57f287, 0 0 12px rgba(87, 242, 135, 0.6);
            transform: scale(1.03);
        `}
`;

export default observer(({ id }: Props) => {
    if (voiceState.roomId !== id) return null;

    const client = useClient();
    const selfId = client.user?._id;
    const self = selfId ? client.users.get(selfId) : undefined;

    // Collect all participant IDs in the call, ensuring local user (self) is always included
    const allParticipantIds = useMemo(() => {
        const idSet = new Set<string>();
        if (selfId) {
            idSet.add(selfId);
        }
        for (const k of voiceState.participants.keys()) {
            idSet.add(k);
        }
        return Array.from(idSet);
    }, [selfId, voiceState.participants.size]);

    const users = useMemo(() => {
        return allParticipantIds.map((key) => client.users.get(key));
    }, [allParticipantIds, client.users]);

    return (
        <VoiceBase>
            <div className="participants">
                {users && users.length !== 0
                    ? users.map((user, index) => {
                          const user_id = allParticipantIds[index];
                          const isSelf = user_id === selfId;
                          const isSpeaking = voiceState.isSpeaking(user_id);

                          let voiceStatus: "muted" | "deaf" | undefined;
                          if (isSelf) {
                              if (voiceState.isDeaf()) {
                                  voiceStatus = "deaf";
                              } else if (!voiceState.isProducing("audio")) {
                                  voiceStatus = "muted";
                              }
                          } else {
                              const pInfo = voiceState.participants.get(user_id);
                              voiceStatus = pInfo?.audio ? undefined : "muted";
                          }

                          return (
                              <ParticipantWrapper
                                  key={user_id}
                                  speaking={isSpeaking}>
                                  <UserIcon
                                      size={80}
                                      target={user ?? (isSelf ? self : undefined)}
                                      status={false}
                                      voice={voiceStatus}
                                      onClick={() =>
                                          modalController.push({
                                              type: "user_profile",
                                              user_id,
                                          })
                                      }
                                  />
                              </ParticipantWrapper>
                          );
                      })
                    : self !== undefined && (
                          <div key={self._id} className="disconnected">
                              <UserIcon
                                  size={80}
                                  target={self}
                                  status={false}
                              />
                          </div>
                      )}
            </div>
            <div className="status">
                <BarChartAlt2 size={16} />
                {voiceState.status === VoiceStatus.CONNECTED && (
                    <Text id="app.main.channel.voice.connected" />
                )}
            </div>
            <div className="actions">
                <Tooltip content={"Leave call"} placement={"top"}>
                    <Button palette="error" onClick={voiceState.disconnect}>
                        <PhoneOff width={20} />
                    </Button>
                </Tooltip>
                {voiceState.isProducing("audio") ? (
                    <Tooltip content={"Mute microphone"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.stopProducing("audio")}>
                            <Microphone width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Unmute microphone"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.startProducing("audio")}>
                            <MicrophoneOff width={20} />
                        </Button>
                    </Tooltip>
                )}
                {voiceState.isDeaf() ? (
                    <Tooltip content={"Undeafen"} placement={"top"}>
                        <Button onClick={() => voiceState.stopDeafen()}>
                            <VolumeMute width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Deafen"} placement={"top"}>
                        <Button onClick={() => voiceState.startDeafen()}>
                            <VolumeFull width={20} />
                        </Button>
                    </Tooltip>
                )}
                {voiceState.isProducing("screen") ? (
                    <Tooltip content={"Stop screen share"} placement={"top"}>
                        <Button
                            palette="accent"
                            onClick={() => voiceState.stopProducing("screen")}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                ) : (
                    <Tooltip content={"Share screen"} placement={"top"}>
                        <Button
                            onClick={() => voiceState.startProducing("screen")}>
                            <Desktop width={20} />
                        </Button>
                    </Tooltip>
                )}
            </div>
        </VoiceBase>
    );
});
