import { useState } from "preact/hooks";
import { Category, Error as ErrorText, InputBox, Modal, Preloader } from "@revoltchat/ui";
import { API } from "revolt.js";
import { useHistory } from "react-router-dom";
import { clientController } from "../../client/ClientController";
import { takeError } from "../../client/jsx/error";
import { ModalProps } from "../types";

export default function AddAccountModal({
    onClose,
    ...props
}: ModalProps<"add_account">) {
    const history = useHistory();
    const [step, setStep] = useState<"credentials" | "mfa">("credentials");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    // MFA state
    const [mfaTicket, setMfaTicket] = useState<string | undefined>(undefined);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaMethod, setMfaMethod] = useState<"Totp" | "Recovery">("Totp");

    const formatError = (err: unknown) => {
        const raw = takeError(err);
        switch (raw) {
            case "InvalidCredentials":
                return "Неверный email/логин или пароль";
            case "InvalidToken":
            case "InvalidSession":
                return "Сессия недействительна";
            case "TooManyRequests":
                return "Слишком много попыток, подождите минуту";
            case "NetworkError":
                return "Ошибка сети, проверьте соединение";
            case "FailedValidation":
                return "Неверный код двухфакторной аутентификации";
            case "unknown_user":
                return "Пользователь не найден";
            default:
                return raw || "Произошла ошибка при входе";
        }
    };

    const handleLogin = async () => {
        if (!email.trim() || !password) return;
        setLoading(true);
        setError(undefined);

        try {
            const api = clientController.getAnonymousClient().api;
            const res = (await api.post("/auth/session/login", {
                email: email.trim(),
                password,
                friendly_name: "LieCord app",
            })) as any;

            if (res.result === "MFA") {
                // Account has 2FA enabled!
                setMfaTicket(res.ticket);
                setMfaMethod(
                    res.allowed_methods?.includes("Totp") ? "Totp" : "Recovery",
                );
                setStep("mfa");
                setLoading(false);
                return;
            }

            // No 2FA -> Successful login!
            clientController.addSession(
                {
                    session: res,
                },
                "new",
            );
            if (res.user_id) {
                clientController.switchAccount(res.user_id);
            }
            history.push("/");
            onClose();
        } catch (err) {
            setLoading(false);
            setError(formatError(err));
        }
    };

    const handleMfaSubmit = async () => {
        if (!mfaCode.trim() || !mfaTicket) return;
        setLoading(true);
        setError(undefined);

        try {
            const api = clientController.getAnonymousClient().api;
            const mfa_response =
                mfaMethod === "Recovery"
                    ? { recovery_code: mfaCode.trim() }
                    : { totp_code: mfaCode.trim() };

            const res = (await api.post("/auth/session/login", {
                mfa_ticket: mfaTicket,
                mfa_response,
                friendly_name: "LieCord app",
            })) as any;

            // Login successful with 2FA!
            clientController.addSession(
                {
                    session: res,
                },
                "new",
            );
            if (res.user_id) {
                clientController.switchAccount(res.user_id);
            }
            history.push("/");
            onClose();
        } catch (err) {
            setLoading(false);
            setError(formatError(err));
        }
    };

    return (
        <Modal
            {...props}
            onClose={onClose}
            title={
                step === "credentials"
                    ? "Добавить аккаунт"
                    : "Двухфакторная аутентификация"
            }
            actions={
                step === "credentials"
                    ? [
                          {
                              confirmation: true,
                              onClick: handleLogin,
                              children: "Войти",
                              disabled: loading || !email.trim() || !password,
                          },
                          {
                              onClick: () => {
                                  onClose();
                                  return true;
                              },
                              children: "Отмена",
                              palette: "plain",
                              disabled: loading,
                          },
                      ]
                    : [
                          {
                              confirmation: true,
                              onClick: handleMfaSubmit,
                              children: "Подтвердить",
                              disabled: loading || !mfaCode.trim(),
                          },
                          {
                              onClick: () => {
                                  setStep("credentials");
                                  setError(undefined);
                                  return false;
                              },
                              children: "Назад",
                              palette: "plain",
                              disabled: loading,
                          },
                      ]
            }>
            {loading ? (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "24px 0",
                    }}>
                    <Preloader type="spinner" />
                </div>
            ) : step === "credentials" ? (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        minWidth: "280px",
                    }}>
                    <Category compact>Электронная почта или логин</Category>
                    <InputBox
                        value={email}
                        onChange={(e) => setEmail(e.currentTarget.value)}
                        placeholder="user@example.com"
                        autoFocus
                    />

                    <Category compact>Пароль</Category>
                    <InputBox
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleLogin();
                        }}
                        placeholder="••••••••"
                    />

                    {error && <ErrorText>{error}</ErrorText>}
                </div>
            ) : (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        minWidth: "280px",
                    }}>
                    <div
                        style={{
                            color: "var(--foreground-muted)",
                            fontSize: "14px",
                            lineHeight: "1.4",
                        }}>
                        {mfaMethod === "Totp"
                            ? "Введите 6-значный код из приложения аутентификатора (Google Authenticator, Aegis и т.д.):"
                            : "Введите один из ваших кодов восстановления:"}
                    </div>

                    <Category compact>
                        {mfaMethod === "Totp"
                            ? "Код аутентификатора"
                            : "Резервный код"}
                    </Category>
                    <InputBox
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.currentTarget.value)}
                        placeholder={
                            mfaMethod === "Totp" ? "000 000" : "XXXX-XXXX"
                        }
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleMfaSubmit();
                        }}
                    />

                    <div
                        onClick={() => {
                            setMfaMethod(
                                mfaMethod === "Totp" ? "Recovery" : "Totp",
                            );
                            setMfaCode("");
                            setError(undefined);
                        }}
                        style={{
                            color: "var(--accent)",
                            fontSize: "13px",
                            cursor: "pointer",
                            textAlign: "right",
                            marginTop: "4px",
                        }}>
                        {mfaMethod === "Totp"
                            ? "Использовать резервный код"
                            : "Использовать код аутентификатора"}
                    </div>

                    {error && <ErrorText>{error}</ErrorText>}
                </div>
            )}
        </Modal>
    );
}
