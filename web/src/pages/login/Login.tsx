import { observer } from "mobx-react-lite";
import { Helmet } from "react-helmet";
import { Route, Switch, Redirect } from "react-router-dom";

import styles from "./Login.module.scss";

import { useApplicationState } from "../../mobx/State";

import LocaleSelector from "../../components/common/LocaleSelector";
import { Titlebar } from "../../components/native/Titlebar";
import { useSystemAlert } from "../../updateWorker";
import { StatusBar } from "../RevoltApp";
import { FormCreate } from "./forms/FormCreate";
import { FormLogin } from "./forms/FormLogin";
import { FormReset, FormSendReset } from "./forms/FormReset";
import { FormResend, FormVerify } from "./forms/FormVerify";

export default observer(() => {
    const state = useApplicationState();
    const theme = state.settings.theme;

    const alert = useSystemAlert();

    return (
        <>
            {window.isNative && !window.native.getConfig().frame && (
                <Titlebar overlay />
            )}
            {alert && (
                <StatusBar>
                    <div className="title">{alert.text}</div>
                    <div className="actions">
                        {alert.actions?.map((action) =>
                            action.type === "internal" ? null : action.type ===
                              "external" ? (
                                <a
                                    href={action.href}
                                    target="_blank"
                                    rel="noreferrer">
                                    <div className="button">{action.text}</div>{" "}
                                </a>
                            ) : null,
                        )}
                    </div>
                </StatusBar>
            )}
            <div className={styles.login}>
                <Helmet>
                    <meta
                        name="theme-color"
                        content={theme.getVariable("background")}
                    />
                </Helmet>
                <div className={styles.topBar}>
                    <div />
                    <LocaleSelector />
                </div>
                <div className={styles.centerContainer}>
                    <div className={styles.brandHeader}>
                        <img
                            src="/assets/logo_round.png"
                            alt="LieCord"
                            className={styles.brandLogo}
                            onError={(e) => {
                                (
                                    e.target as HTMLImageElement
                                ).style.display = "none";
                            }}
                        />
                        <span className={styles.brandTitle}>LieCord</span>
                    </div>
                    <div className={styles.form}>
                        <Switch>
                            <Route path="/login/create">
                                <Redirect to="/login" />
                            </Route>
                            <Route path="/login/resend">
                                <FormResend />
                            </Route>
                            <Route path="/login/verify/:token">
                                <FormVerify />
                            </Route>
                            <Route path="/login/reset/:token">
                                <FormReset />
                            </Route>
                            <Route path="/login/reset">
                                <FormSendReset />
                            </Route>
                            <Route path="/">
                                <FormLogin />
                            </Route>
                        </Switch>
                    </div>
                </div>
            </div>
        </>
    );
});
