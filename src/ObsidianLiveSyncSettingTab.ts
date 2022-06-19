import { App, PluginSettingTab, Setting, sanitizeHTMLToDom, RequestUrlParam, requestUrl } from "obsidian";
import { EntryDoc, LOG_LEVEL, RemoteDBSettings } from "./lib/src/types";
import { path2id, id2path } from "./utils";
import { NewNotice, runWithLock } from "./lib/src/utils";
import { Logger } from "./lib/src/logger";
import { checkSyncInfo, connectRemoteCouchDBWithSetting } from "./utils_couchdb";
import { testCrypt } from "./lib/src/e2ee";
import ObsidianLiveSyncPlugin from "./main";

export class ObsidianLiveSyncSettingTab extends PluginSettingTab {
    plugin: ObsidianLiveSyncPlugin;

    constructor(app: App, plugin: ObsidianLiveSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    async testConnection(): Promise<void> {
        // const db = await connectRemoteCouchDB(
        //     this.plugin.settings.couchDB_URI + (this.plugin.settings.couchDB_DBNAME == "" ? "" : "/" + this.plugin.settings.couchDB_DBNAME),
        //     {
        //         username: this.plugin.settings.couchDB_USER,
        //         password: this.plugin.settings.couchDB_PASSWORD,
        //     },
        //     this.plugin.settings.disableRequestURI,
        //     this.plugin.settings.encrypt ? this.plugin.settings.passphrase : this.plugin.settings.encrypt
        // );
        const db = await connectRemoteCouchDBWithSetting(this.plugin.settings, this.plugin.localDatabase.isMobile);
        if (typeof db === "string") {
            this.plugin.addLog(`could not connect to ${this.plugin.settings.couchDB_URI} : ${this.plugin.settings.couchDB_DBNAME} \n(${db})`, LOG_LEVEL.NOTICE);
            return;
        }
        this.plugin.addLog(`Connected to ${db.info.db_name}`, LOG_LEVEL.NOTICE);
    }
    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "Settings for Self-hosted LiveSync." });

        const w = containerEl.createDiv("");
        const screenElements: { [key: string]: HTMLElement[] } = {};
        const addScreenElement = (key: string, element: HTMLElement) => {
            if (!(key in screenElements)) {
                screenElements[key] = [];
            }
            screenElements[key].push(element);
        };
        w.addClass("sls-setting-menu");
        w.innerHTML = `
<label class='sls-setting-label selected'><input type='radio' name='disp' value='0' class='sls-setting-tab' checked><div class='sls-setting-menu-btn'>🛰️</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='10' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>📦</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='20' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>⚙️</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='30' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>🔁</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='40' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>🔧</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='50' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>🧰</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='60' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>🔌</div></label>
<label class='sls-setting-label'><input type='radio' name='disp' value='70' class='sls-setting-tab' ><div class='sls-setting-menu-btn'>🚑</div></label>
        `;
        const menutabs = w.querySelectorAll(".sls-setting-label");
        const changeDisplay = (screen: string) => {
            for (const k in screenElements) {
                if (k == screen) {
                    screenElements[k].forEach((element) => element.removeClass("setting-collapsed"));
                } else {
                    screenElements[k].forEach((element) => element.addClass("setting-collapsed"));
                }
            }
        };
        menutabs.forEach((element) => {
            const e = element.querySelector(".sls-setting-tab");
            if (!e) return;
            e.addEventListener("change", (event) => {
                menutabs.forEach((element) => element.removeClass("selected"));
                changeDisplay((event.currentTarget as HTMLInputElement).value);
                element.addClass("selected");
            });
        });

        const containerRemoteDatabaseEl = containerEl.createDiv();
        containerRemoteDatabaseEl.createEl("h3", { text: "Remote Database configuration" });
        const syncWarn = containerRemoteDatabaseEl.createEl("div", { text: `These settings are kept locked while automatic synchronization options are enabled. Disable these options in the "Sync Settings" tab to unlock.` });
        syncWarn.addClass("op-warn-info");
        syncWarn.addClass("sls-hidden");

        const isAnySyncEnabled = (): boolean => {
            if (this.plugin.settings.liveSync) return true;
            if (this.plugin.settings.periodicReplication) return true;
            if (this.plugin.settings.syncOnFileOpen) return true;
            if (this.plugin.settings.syncOnSave) return true;
            if (this.plugin.settings.syncOnStart) return true;
            if (this.plugin.localDatabase.syncStatus == "CONNECTED") return true;
            if (this.plugin.localDatabase.syncStatus == "PAUSED") return true;
            return false;
        };
        const applyDisplayEnabled = () => {
            if (isAnySyncEnabled()) {
                dbsettings.forEach((e) => {
                    e.setDisabled(true).setTooltip("When any sync is enabled, It cound't be changed.");
                });
                syncWarn.removeClass("sls-hidden");
            } else {
                dbsettings.forEach((e) => {
                    e.setDisabled(false).setTooltip("");
                });
                syncWarn.addClass("sls-hidden");
            }
            if (this.plugin.settings.liveSync) {
                syncNonLive.forEach((e) => {
                    e.setDisabled(true).setTooltip("");
                });
                syncLive.forEach((e) => {
                    e.setDisabled(false).setTooltip("");
                });
            } else if (this.plugin.settings.syncOnFileOpen || this.plugin.settings.syncOnSave || this.plugin.settings.syncOnStart || this.plugin.settings.periodicReplication) {
                syncNonLive.forEach((e) => {
                    e.setDisabled(false).setTooltip("");
                });
                syncLive.forEach((e) => {
                    e.setDisabled(true).setTooltip("");
                });
            } else {
                syncNonLive.forEach((e) => {
                    e.setDisabled(false).setTooltip("");
                });
                syncLive.forEach((e) => {
                    e.setDisabled(false).setTooltip("");
                });
            }
        };

        const dbsettings: Setting[] = [];
        dbsettings.push(
            new Setting(containerRemoteDatabaseEl).setName("URI").addText((text) =>
                text
                    .setPlaceholder("https://........")
                    .setValue(this.plugin.settings.couchDB_URI)
                    .onChange(async (value) => {
                        this.plugin.settings.couchDB_URI = value;
                        await this.plugin.saveSettings();
                    })
            ),
            new Setting(containerRemoteDatabaseEl)
                .setName("Username")
                .setDesc("username")
                .addText((text) =>
                    text
                        .setPlaceholder("")
                        .setValue(this.plugin.settings.couchDB_USER)
                        .onChange(async (value) => {
                            this.plugin.settings.couchDB_USER = value;
                            await this.plugin.saveSettings();
                        })
                ),
            new Setting(containerRemoteDatabaseEl)
                .setName("Password")
                .setDesc("password")
                .addText((text) => {
                    text.setPlaceholder("")
                        .setValue(this.plugin.settings.couchDB_PASSWORD)
                        .onChange(async (value) => {
                            this.plugin.settings.couchDB_PASSWORD = value;
                            await this.plugin.saveSettings();
                        });
                    text.inputEl.setAttribute("type", "password");
                }),
            new Setting(containerRemoteDatabaseEl).setName("Database name").addText((text) =>
                text
                    .setPlaceholder("")
                    .setValue(this.plugin.settings.couchDB_DBNAME)
                    .onChange(async (value) => {
                        this.plugin.settings.couchDB_DBNAME = value;
                        await this.plugin.saveSettings();
                    })
            )

            // new Setting(containerRemoteDatabaseEl)
            //     .setDesc("This feature is locked in mobile")
            //     .setName("Use the old connecting method")
            //     .addToggle((toggle) => {
            //         toggle.setValue(this.plugin.settings.disableRequestURI).onChange(async (value) => {
            //             this.plugin.settings.disableRequestURI = value;
            //             await this.plugin.saveSettings();
            //         });
            //         toggle.setDisabled(this.plugin.isMobile);
            //         return toggle;
            //     })
        );
        new Setting(containerRemoteDatabaseEl)
            .setName("End to End Encryption")
            .setDesc("Encrypt contents on the remote database. If you use the plugins synchronizing feature, enabling this is recommend.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.workingEncrypt).onChange(async (value) => {
                    this.plugin.settings.workingEncrypt = value;
                    phasspharase.setDisabled(!value);
                    await this.plugin.saveSettings();
                })
            );
        const phasspharase = new Setting(containerRemoteDatabaseEl)
            .setName("Passphrase")
            .setDesc("Encrypting passphrase")
            .addText((text) => {
                text.setPlaceholder("")
                    .setValue(this.plugin.settings.workingPassphrase)
                    .onChange(async (value) => {
                        this.plugin.settings.workingPassphrase = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.setAttribute("type", "password");
            });
        phasspharase.setDisabled(!this.plugin.settings.workingEncrypt);
        containerRemoteDatabaseEl.createEl("div", {
            text: "If you change the passphrase, rebuilding the remote database is required. Please press 'Apply and send'. Or, If you have configured it to connect to an existing database, click 'Just apply'.",
        });
        const checkWorkingPassphrase = async (): Promise<boolean> => {
            const settingForCheck: RemoteDBSettings = {
                ...this.plugin.settings,
                encrypt: this.plugin.settings.workingEncrypt,
                passphrase: this.plugin.settings.workingPassphrase,
            };
            console.dir(settingForCheck);
            const db = await connectRemoteCouchDBWithSetting(settingForCheck, this.plugin.localDatabase.isMobile);
            if (typeof db === "string") {
                Logger("Could not connect to the database.", LOG_LEVEL.NOTICE);
                return false;
            } else {
                if (await checkSyncInfo(db.db)) {
                    // Logger("Database connected", LOG_LEVEL.NOTICE);
                    return true;
                } else {
                    Logger("Failed to read remote database", LOG_LEVEL.NOTICE);
                    return false;
                }
            }
        };
        const applyEncryption = async (sendToServer: boolean) => {
            if (this.plugin.settings.workingEncrypt && this.plugin.settings.workingPassphrase == "") {
                Logger("If you enable encryption, you have to set the passphrase", LOG_LEVEL.NOTICE);
                return;
            }
            if (this.plugin.settings.workingEncrypt && !(await testCrypt())) {
                Logger("WARNING! Your device would not support encryption.", LOG_LEVEL.NOTICE);
                return;
            }
            if (!(await checkWorkingPassphrase())) {
                return;
            }
            if (!this.plugin.settings.workingEncrypt) {
                this.plugin.settings.workingPassphrase = "";
            }
            this.plugin.settings.liveSync = false;
            this.plugin.settings.periodicReplication = false;
            this.plugin.settings.syncOnSave = false;
            this.plugin.settings.syncOnStart = false;
            this.plugin.settings.syncOnFileOpen = false;
            this.plugin.settings.encrypt = this.plugin.settings.workingEncrypt;
            this.plugin.settings.passphrase = this.plugin.settings.workingPassphrase;

            await this.plugin.saveSettings();
            // await this.plugin.resetLocalDatabase();
            if (sendToServer) {
                await this.plugin.initializeDatabase(true);
                await this.plugin.markRemoteLocked();
                await this.plugin.tryResetRemoteDatabase();
                await this.plugin.markRemoteLocked();
                await this.plugin.replicateAllToServer(true);
            } else {
                await this.plugin.markRemoteResolved();
                await this.plugin.replicate(true);
            }
        };
        new Setting(containerRemoteDatabaseEl)
            .setName("Apply")
            .setDesc("apply encryption settinngs, and re-initialize remote database")
            .addButton((button) =>
                button
                    .setButtonText("Apply and send")
                    .setWarning()
                    .setDisabled(false)
                    .setClass("sls-btn-left")
                    .onClick(async () => {
                        await applyEncryption(true);
                    })
            )
            .addButton((button) =>
                button
                    .setButtonText("Just apply")
                    .setWarning()
                    .setDisabled(false)
                    .setClass("sls-btn-right")
                    .onClick(async () => {
                        await applyEncryption(false);
                    })
            );

        new Setting(containerRemoteDatabaseEl)
            .setName("Test Database Connection")
            .setDesc("Open database connection. If the remote database is not found and you have the privilege to create a database, the database will be created.")
            .addButton((button) =>
                button
                    .setButtonText("Test")
                    .setDisabled(false)
                    .onClick(async () => {
                        await this.testConnection();
                    })
            );

        new Setting(containerRemoteDatabaseEl)
            .setName("Check database configuration")
            // .setDesc("Open database connection. If the remote database is not found and you have the privilege to create a database, the database will be created.")
            .addButton((button) =>
                button
                    .setButtonText("Check")
                    .setDisabled(false)
                    .onClick(async () => {
                        const checkConfig = async () => {
                            try {
                                const requestToCouchDB = async (baseUri: string, username: string, password: string, origin: string, key?: string, body?: string) => {
                                    const utf8str = String.fromCharCode.apply(null, new TextEncoder().encode(`${username}:${password}`));
                                    const encoded = window.btoa(utf8str);
                                    const authHeader = "Basic " + encoded;
                                    // const origin = "capacitor://localhost";
                                    const transformedHeaders: Record<string, string> = { authorization: authHeader, origin: origin };
                                    const uri = `${baseUri}/_node/_local/_config${key ? "/" + key : ""}`;

                                    const requestParam: RequestUrlParam = {
                                        url: uri,
                                        method: body ? "PUT" : "GET",
                                        headers: transformedHeaders,
                                        contentType: "application/json",
                                        body: body ? JSON.stringify(body) : undefined,
                                    };
                                    return await requestUrl(requestParam);
                                };

                                const r = await requestToCouchDB(this.plugin.settings.couchDB_URI, this.plugin.settings.couchDB_USER, this.plugin.settings.couchDB_PASSWORD, window.origin);

                                Logger(JSON.stringify(r.json, null, 2));

                                const responseConfig = r.json;

                                const emptyDiv = createDiv();
                                emptyDiv.innerHTML = "<span></span>";
                                checkResultDiv.replaceChildren(...[emptyDiv]);
                                const addResult = (msg: string, classes?: string[]) => {
                                    const tmpDiv = createDiv();
                                    tmpDiv.addClass("ob-btn-config-fix");
                                    if (classes) {
                                        tmpDiv.addClasses(classes);
                                    }
                                    tmpDiv.innerHTML = `${msg}`;
                                    checkResultDiv.appendChild(tmpDiv);
                                };
                                const addConfigFixButton = (title: string, key: string, value: string) => {
                                    const tmpDiv = createDiv();
                                    tmpDiv.addClass("ob-btn-config-fix");
                                    tmpDiv.innerHTML = `<label>${title}</label><button>Fix</button>`;
                                    const x = checkResultDiv.appendChild(tmpDiv);
                                    x.querySelector("button").addEventListener("click", async () => {
                                        console.dir({ key, value });
                                        const res = await requestToCouchDB(this.plugin.settings.couchDB_URI, this.plugin.settings.couchDB_USER, this.plugin.settings.couchDB_PASSWORD, undefined, key, value);
                                        console.dir(res);
                                        if (res.status == 200) {
                                            Logger(`${title} successfly updated`, LOG_LEVEL.NOTICE);
                                            checkResultDiv.removeChild(x);
                                            checkConfig();
                                        } else {
                                            Logger(`${title} failed`, LOG_LEVEL.NOTICE);
                                            Logger(res.text);
                                        }
                                    });
                                };
                                addResult("---Notice---", ["ob-btn-config-head"]);
                                addResult(
                                    "If the server configuration is not persistent (e.g., running on docker), the values set from here will also be volatile. Once you are able to connect, please reflect the settings in the server's local.ini.",
                                    ["ob-btn-config-info"]
                                );

                                addResult("Your configuration is dumped to Log", ["ob-btn-config-info"]);
                                addResult("--Config check--", ["ob-btn-config-head"]);

                                // Admin check
                                //  for database creation and deletion
                                if (!(this.plugin.settings.couchDB_USER in responseConfig.admins)) {
                                    addResult(`⚠ You do not have administrative privileges.`);
                                } else {
                                    addResult("✔ You have administrative privileges.");
                                }
                                // HTTP user-authorization check
                                if (responseConfig?.chttpd?.require_valid_user != "true") {
                                    addResult("❗ chttpd.require_valid_user looks like wrong.");
                                    addConfigFixButton("Set chttpd.require_valid_user = true", "chttpd/require_valid_user", "true");
                                } else {
                                    addResult("✔ chttpd.require_valid_user is ok.");
                                }
                                if (responseConfig?.chttpd_auth?.require_valid_user != "true") {
                                    addResult("❗ chttpd_auth.require_valid_user looks like wrong.");
                                    addConfigFixButton("Set chttpd_auth.require_valid_user = true", "chttpd_auth/require_valid_user", "true");
                                } else {
                                    addResult("✔ chttpd_auth.require_valid_user is ok.");
                                }
                                // HTTPD check
                                //  Check Authentication header
                                if (!responseConfig?.httpd["WWW-Authenticate"]) {
                                    addResult("❗ httpd.WWW-Authenticate is missing");
                                    addConfigFixButton("Set httpd.WWW-Authenticate", "httpd/WWW-Authenticate", 'Basic realm="couchdb"');
                                } else {
                                    addResult("✔ httpd.WWW-Authenticate is ok.");
                                }
                                if (responseConfig?.httpd?.enable_cors != "true") {
                                    addResult("❗ httpd.enable_cors is wrong");
                                    addConfigFixButton("Set httpd.enable_cors", "httpd/enable_cors", "true");
                                } else {
                                    addResult("✔ httpd.enable_cors is ok.");
                                }
                                // CORS check
                                //  checking connectivity for mobile
                                if (responseConfig?.cors?.credentials != "true") {
                                    addResult("❗ cors.credentials is wrong");
                                    addConfigFixButton("Set cors.credentials", "cors/credentials", "true");
                                } else {
                                    addResult("✔ cors.credentials is ok.");
                                }
                                const ConfiguredOrigins = ((responseConfig?.cors?.origins ?? "") + "").split(",");
                                if (
                                    responseConfig?.cors?.origins == "*" ||
                                    (ConfiguredOrigins.indexOf("app://obsidian.md") !== -1 && ConfiguredOrigins.indexOf("capacitor://localhost") !== -1 && ConfiguredOrigins.indexOf("http://localhost") !== -1)
                                ) {
                                    addResult("✔ cors.origins is ok.");
                                } else {
                                    addResult("❗ cors.origins is wrong");
                                    addConfigFixButton("Set cors.origins", "cors/origins", "app://obsidian.md,capacitor://localhost,http://localhost");
                                }
                                addResult("--Connection check--", ["ob-btn-config-head"]);
                                addResult(`Current origin:${window.location.origin}`);

                                // Request header check
                                const origins = ["app://obsidian.md", "capacitor://localhost", "http://localhost"];
                                for (const org of origins) {
                                    const rr = await requestToCouchDB(this.plugin.settings.couchDB_URI, this.plugin.settings.couchDB_USER, this.plugin.settings.couchDB_PASSWORD, org);
                                    const responseHeaders = Object.entries(rr.headers)
                                        .map((e) => {
                                            e[0] = (e[0] + "").toLowerCase();
                                            return e;
                                        })
                                        .reduce((obj, [key, val]) => {
                                            obj[key] = val;
                                            return obj;
                                        }, {});
                                    addResult(`Origin check:${org}`);
                                    if (responseHeaders["access-control-allow-credentials"] != "true") {
                                        addResult("❗ CORS is not allowing credential");
                                    } else {
                                        addResult("✔ CORS credential OK");
                                    }
                                    if (responseHeaders["access-control-allow-origin"] != org) {
                                        addResult(`❗ CORS Origin is unmatched:${origin}->${responseHeaders["access-control-allow-origin"]}`);
                                    } else {
                                        addResult("✔ CORS origin OK");
                                    }
                                }
                                addResult("--Done--", ["ob-btn-config-haed"]);
                                addResult("If you have some trouble with Connection-check even though all Config-check has been passed, Please check your reverse proxy's configuration.", ["ob-btn-config-info"]);
                            } catch (ex) {
                                Logger(`Checking configration failed`);
                                Logger(ex);
                            }
                        };
                        await checkConfig();
                    })
            );
        const checkResultDiv = containerRemoteDatabaseEl.createEl("div", {
            text: "",
        });

        addScreenElement("0", containerRemoteDatabaseEl);
        const containerLocalDatabaseEl = containerEl.createDiv();
        containerLocalDatabaseEl.createEl("h3", { text: "Local Database configuration" });

        new Setting(containerLocalDatabaseEl)
            .setName("Batch database update")
            .setDesc("Delay all changes, save once before replication or opening another file.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.batchSave).onChange(async (value) => {
                    if (value && this.plugin.settings.liveSync) {
                        Logger("LiveSync and Batch database update cannot be used at the same time.", LOG_LEVEL.NOTICE);
                        toggle.setValue(false);
                        return;
                    }
                    this.plugin.settings.batchSave = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerLocalDatabaseEl)
            .setName("Auto Garbage Collection delay")
            .setDesc("(seconds), if you set zero, you have to run manually.")
            .addText((text) => {
                text.setPlaceholder("")
                    .setValue(this.plugin.settings.gcDelay + "")
                    .onChange(async (value) => {
                        let v = Number(value);
                        if (isNaN(v) || v > 5000) {
                            v = 0;
                        }
                        this.plugin.settings.gcDelay = v;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.setAttribute("type", "number");
            });
        new Setting(containerLocalDatabaseEl).setName("Manual Garbage Collect").addButton((button) =>
            button
                .setButtonText("Collect now")
                .setDisabled(false)
                .onClick(async () => {
                    await this.plugin.garbageCollect();
                })
        );

        containerLocalDatabaseEl.createEl("div", {
            text: sanitizeHTMLToDom(`Advanced settings<br>
                Configuration of how LiveSync makes chunks from the file.`),
        });
        new Setting(containerLocalDatabaseEl)
            .setName("Minimum chunk size")
            .setDesc("(letters), minimum chunk size.")
            .addText((text) => {
                text.setPlaceholder("")
                    .setValue(this.plugin.settings.minimumChunkSize + "")
                    .onChange(async (value) => {
                        let v = Number(value);
                        if (isNaN(v) || v < 10 || v > 1000) {
                            v = 10;
                        }
                        this.plugin.settings.minimumChunkSize = v;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.setAttribute("type", "number");
            });

        new Setting(containerLocalDatabaseEl)
            .setName("LongLine Threshold")
            .setDesc("(letters), If the line is longer than this, make the line to chunk")
            .addText((text) => {
                text.setPlaceholder("")
                    .setValue(this.plugin.settings.longLineThreshold + "")
                    .onChange(async (value) => {
                        let v = Number(value);
                        if (isNaN(v) || v < 10 || v > 1000) {
                            v = 10;
                        }
                        this.plugin.settings.longLineThreshold = v;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.setAttribute("type", "number");
            });

        addScreenElement("10", containerLocalDatabaseEl);
        const containerGeneralSettingsEl = containerEl.createDiv();
        containerGeneralSettingsEl.createEl("h3", { text: "General Settings" });

        new Setting(containerGeneralSettingsEl)
            .setName("Do not show low-priority Log")
            .setDesc("Reduce log infomations")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.lessInformationInLog).onChange(async (value) => {
                    this.plugin.settings.lessInformationInLog = value;
                    await this.plugin.saveSettings();
                })
            );
        new Setting(containerGeneralSettingsEl)
            .setName("Verbose Log")
            .setDesc("Show verbose log ")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showVerboseLog).onChange(async (value) => {
                    this.plugin.settings.showVerboseLog = value;
                    await this.plugin.saveSettings();
                })
            );

        addScreenElement("20", containerGeneralSettingsEl);
        const containerSyncSettingEl = containerEl.createDiv();
        containerSyncSettingEl.createEl("h3", { text: "Sync setting" });

        if (this.plugin.settings.versionUpFlash != "") {
            const c = containerSyncSettingEl.createEl("div", { text: this.plugin.settings.versionUpFlash });
            c.createEl("button", { text: "I got it and updated." }, (e) => {
                e.addClass("mod-cta");
                e.addEventListener("click", async () => {
                    this.plugin.settings.versionUpFlash = "";
                    await this.plugin.saveSettings();
                    applyDisplayEnabled();
                    c.remove();
                });
            });
            c.addClass("op-warn");
        }

        const syncLive: Setting[] = [];
        const syncNonLive: Setting[] = [];
        syncLive.push(
            new Setting(containerSyncSettingEl)
                .setName("LiveSync")
                .setDesc("Sync realtime")
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.liveSync).onChange(async (value) => {
                        if (value && this.plugin.settings.batchSave) {
                            Logger("LiveSync and Batch database update cannot be used at the same time.", LOG_LEVEL.NOTICE);
                            toggle.setValue(false);
                            return;
                        }

                        this.plugin.settings.liveSync = value;
                        // ps.setDisabled(value);
                        await this.plugin.saveSettings();
                        applyDisplayEnabled();
                        await this.plugin.realizeSettingSyncMode();
                    })
                )
        );

        syncNonLive.push(
            new Setting(containerSyncSettingEl)
                .setName("Periodic Sync")
                .setDesc("Sync periodically")
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.periodicReplication).onChange(async (value) => {
                        this.plugin.settings.periodicReplication = value;
                        await this.plugin.saveSettings();
                        applyDisplayEnabled();
                    })
                ),
            new Setting(containerSyncSettingEl)
                .setName("Periodic sync intreval")
                .setDesc("Interval (sec)")
                .addText((text) => {
                    text.setPlaceholder("")
                        .setValue(this.plugin.settings.periodicReplicationInterval + "")
                        .onChange(async (value) => {
                            let v = Number(value);
                            if (isNaN(v) || v > 5000) {
                                v = 0;
                            }
                            this.plugin.settings.periodicReplicationInterval = v;
                            await this.plugin.saveSettings();
                            applyDisplayEnabled();
                        });
                    text.inputEl.setAttribute("type", "number");
                }),

            new Setting(containerSyncSettingEl)
                .setName("Sync on Save")
                .setDesc("When you save file, sync automatically")
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.syncOnSave).onChange(async (value) => {
                        this.plugin.settings.syncOnSave = value;
                        await this.plugin.saveSettings();
                        applyDisplayEnabled();
                    })
                ),
            new Setting(containerSyncSettingEl)
                .setName("Sync on File Open")
                .setDesc("When you open file, sync automatically")
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.syncOnFileOpen).onChange(async (value) => {
                        this.plugin.settings.syncOnFileOpen = value;
                        await this.plugin.saveSettings();
                        applyDisplayEnabled();
                    })
                ),
            new Setting(containerSyncSettingEl)
                .setName("Sync on Start")
                .setDesc("Start synchronization on Obsidian started.")
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.syncOnStart).onChange(async (value) => {
                        this.plugin.settings.syncOnStart = value;
                        await this.plugin.saveSettings();
                        applyDisplayEnabled();
                    })
                )
        );

        new Setting(containerSyncSettingEl)
            .setName("Use Trash for deleted files")
            .setDesc("Do not delete files that deleted in remote, just move to trash.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.trashInsteadDelete).onChange(async (value) => {
                    this.plugin.settings.trashInsteadDelete = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerSyncSettingEl)
            .setName("Do not delete empty folder")
            .setDesc("Normally, folder is deleted When the folder became empty by replication. enable this, leave it as is")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.doNotDeleteFolder).onChange(async (value) => {
                    this.plugin.settings.doNotDeleteFolder = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerSyncSettingEl)
            .setName("Use newer file if conflicted (beta)")
            .setDesc("Resolve conflicts by newer files automatically.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.resolveConflictsByNewerFile).onChange(async (value) => {
                    this.plugin.settings.resolveConflictsByNewerFile = value;
                    await this.plugin.saveSettings();
                })
            );

        // new Setting(containerSyncSettingEl)
        //     .setName("Skip old files on sync")
        //     .setDesc("Skip old incoming if incoming changes older than storage.")
        //     .addToggle((toggle) =>
        //         toggle.setValue(this.plugin.settings.skipOlderFilesOnSync).onChange(async (value) => {
        //             this.plugin.settings.skipOlderFilesOnSync = value;
        //             await this.plugin.saveSettings();
        //         })
        //     );
        new Setting(containerSyncSettingEl)
            .setName("Check conflict only on opening file.")
            .setDesc("Do not check conflict while replication")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.checkConflictOnlyOnOpen).onChange(async (value) => {
                    this.plugin.settings.checkConflictOnlyOnOpen = value;
                    await this.plugin.saveSettings();
                })
            );
        containerSyncSettingEl.createEl("div", {
            text: sanitizeHTMLToDom(`Advanced settings<br>
            If you reached the payload size limit when using IBM Cloudant, please set batch size and batch limit to a lower value.`),
        });
        new Setting(containerSyncSettingEl)
            .setName("Batch size")
            .setDesc("Number of change feed items to process at a time. Defaults to 250.")
            .addText((text) => {
                text.setPlaceholder("")
                    .setValue(this.plugin.settings.batch_size + "")
                    .onChange(async (value) => {
                        let v = Number(value);
                        if (isNaN(v) || v < 10) {
                            v = 10;
                        }
                        this.plugin.settings.batch_size = v;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.setAttribute("type", "number");
            });

        new Setting(containerSyncSettingEl)
            .setName("Batch limit")
            .setDesc("Number of batches to process at a time. Defaults to 40. This along with batch size controls how many docs are kept in memory at a time.")
            .addText((text) => {
                text.setPlaceholder("")
                    .setValue(this.plugin.settings.batches_limit + "")
                    .onChange(async (value) => {
                        let v = Number(value);
                        if (isNaN(v) || v < 10) {
                            v = 10;
                        }
                        this.plugin.settings.batches_limit = v;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.setAttribute("type", "number");
            });

        addScreenElement("30", containerSyncSettingEl);
        const containerMiscellaneousEl = containerEl.createDiv();
        containerMiscellaneousEl.createEl("h3", { text: "Miscellaneous" });
        new Setting(containerMiscellaneousEl)
            .setName("Show status inside editor")
            .setDesc("")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showStatusOnEditor).onChange(async (value) => {
                    this.plugin.settings.showStatusOnEditor = value;
                    await this.plugin.saveSettings();
                })
            );
        new Setting(containerMiscellaneousEl)
            .setName("Check integrity on saving")
            .setDesc("Check database integrity on saving to database")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.checkIntegrityOnSave).onChange(async (value) => {
                    this.plugin.settings.checkIntegrityOnSave = value;
                    await this.plugin.saveSettings();
                })
            );
        let currentPrest = "NONE";
        new Setting(containerMiscellaneousEl)
            .setName("Presets")
            .setDesc("Apply preset configuration")
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({ NONE: "", LIVESYNC: "LiveSync", PERIODIC: "Periodic w/ batch", DISABLE: "Disable all sync" })
                    .setValue(currentPrest)
                    .onChange((value) => (currentPrest = value))
            )
            .addButton((button) =>
                button
                    .setButtonText("Apply")
                    .setDisabled(false)
                    .setCta()
                    .onClick(async () => {
                        if (currentPrest == "") {
                            Logger("Select any preset.", LOG_LEVEL.NOTICE);
                            return;
                        }
                        this.plugin.settings.batchSave = false;
                        this.plugin.settings.liveSync = false;
                        this.plugin.settings.periodicReplication = false;
                        this.plugin.settings.syncOnSave = false;
                        this.plugin.settings.syncOnStart = false;
                        this.plugin.settings.syncOnFileOpen = false;
                        if (currentPrest == "LIVESYNC") {
                            this.plugin.settings.liveSync = true;
                            Logger("Synchronization setting configured as LiveSync.", LOG_LEVEL.NOTICE);
                        } else if (currentPrest == "PERIODIC") {
                            this.plugin.settings.batchSave = true;
                            this.plugin.settings.periodicReplication = true;
                            this.plugin.settings.syncOnSave = false;
                            this.plugin.settings.syncOnStart = true;
                            this.plugin.settings.syncOnFileOpen = true;
                            Logger("Synchronization setting configured as Periodic sync with batch database update.", LOG_LEVEL.NOTICE);
                        } else {
                            Logger("All synchronization disabled.", LOG_LEVEL.NOTICE);
                        }
                        this.plugin.saveSettings();
                        await this.plugin.realizeSettingSyncMode();
                    })
            );

        new Setting(containerMiscellaneousEl)
            .setName("Use history")
            .setDesc("Use history dialog (Restart required, auto compaction would be disabled, and more storage will be consumed)")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.useHistory).onChange(async (value) => {
                    this.plugin.settings.useHistory = value;
                    await this.plugin.saveSettings();
                })
            );
        addScreenElement("40", containerMiscellaneousEl);

        const containerHatchEl = containerEl.createDiv();

        containerHatchEl.createEl("h3", { text: "Hatch" });

        if (this.plugin.localDatabase.remoteLockedAndDeviceNotAccepted) {
            const c = containerHatchEl.createEl("div", {
                text: "To prevent unwanted vault corruption, the remote database has been locked for synchronization, and this device was not marked as 'resolved'. it caused by some operations like this. re-initialized. Local database initialization should be required. please back your vault up, reset local database, and press 'Mark this device as resolved'. ",
            });
            c.createEl("button", { text: "I'm ready, mark this device 'resolved'" }, (e) => {
                e.addClass("mod-warning");
                e.addEventListener("click", async () => {
                    await this.plugin.markRemoteResolved();
                    c.remove();
                });
            });
            c.addClass("op-warn");
        } else {
            if (this.plugin.localDatabase.remoteLocked) {
                const c = containerHatchEl.createEl("div", {
                    text: "To prevent unwanted vault corruption, the remote database has been locked for synchronization. (This device is marked 'resolved') When all your devices are marked 'resolved', unlock the database.",
                });
                c.createEl("button", { text: "I'm ready, unlock the database" }, (e) => {
                    e.addClass("mod-warning");
                    e.addEventListener("click", async () => {
                        await this.plugin.markRemoteUnlocked();
                        c.remove();
                    });
                });
                c.addClass("op-warn");
            }
        }
        const hatchWarn = containerHatchEl.createEl("div", { text: `To stop the bootup sequence for fixing problems on databases, you can put redflag.md on top of your vault (Rebooting obsidian is required).` });
        hatchWarn.addClass("op-warn-info");
        const dropHistory = async (sendToServer: boolean) => {
            this.plugin.settings.liveSync = false;
            this.plugin.settings.periodicReplication = false;
            this.plugin.settings.syncOnSave = false;
            this.plugin.settings.syncOnStart = false;
            this.plugin.settings.syncOnFileOpen = false;

            await this.plugin.saveSettings();
            applyDisplayEnabled();
            await this.plugin.resetLocalDatabase();
            if (sendToServer) {
                await this.plugin.initializeDatabase(true);
                await this.plugin.markRemoteLocked();
                await this.plugin.tryResetRemoteDatabase();
                await this.plugin.markRemoteLocked();
                await this.plugin.replicateAllToServer(true);
            } else {
                await this.plugin.markRemoteResolved();
                await this.plugin.replicate(true);
            }
        };
        new Setting(containerHatchEl)
            .setName("Verify and repair all files")
            .setDesc("Verify and repair all files and update database without dropping history")
            .addButton((button) =>
                button
                    .setButtonText("Verify and repair")
                    .setDisabled(false)
                    .setWarning()
                    .onClick(async () => {
                        const files = this.app.vault.getFiles();
                        Logger("Verify and repair all files started", LOG_LEVEL.NOTICE);
                        const notice = NewNotice("", 0);
                        let i = 0;
                        for (const file of files) {
                            i++;
                            Logger(`Update into ${file.path}`);
                            notice.setMessage(`${i}/${files.length}\n${file.path}`);
                            try {
                                await this.plugin.updateIntoDB(file);
                            } catch (ex) {
                                Logger("could not update:");
                                Logger(ex);
                            }
                        }
                        notice.hide();
                        Logger("done", LOG_LEVEL.NOTICE);
                    })
            );
        new Setting(containerHatchEl)
            .setName("Sanity check")
            .setDesc("Verify")
            .addButton((button) =>
                button
                    .setButtonText("Sanity check")
                    .setDisabled(false)
                    .setWarning()
                    .onClick(async () => {
                        const notice = NewNotice("", 0);
                        Logger(`Begin sanity check`, LOG_LEVEL.INFO);
                        notice.setMessage(`Begin sanity check`);
                        await runWithLock("sancheck", true, async () => {
                            const db = this.plugin.localDatabase.localDatabase;
                            const wf = await db.allDocs();
                            const filesDatabase = wf.rows.filter((e) => !e.id.startsWith("h:") && !e.id.startsWith("ps:") && e.id != "obsydian_livesync_version").map((e) => e.id);
                            let count = 0;
                            for (const id of filesDatabase) {
                                count++;
                                notice.setMessage(`${count}/${filesDatabase.length}\n${id2path(id)}`);
                                const w = await db.get<EntryDoc>(id);
                                if (!(await this.plugin.localDatabase.sanCheck(w))) {
                                    Logger(`The file ${id2path(id)} missing child(ren)`, LOG_LEVEL.NOTICE);
                                }
                            }
                        });
                        notice.hide();
                        Logger(`Done`, LOG_LEVEL.NOTICE);
                        // Logger("done", LOG_LEVEL.NOTICE);
                    })
            );

        new Setting(containerHatchEl)
            .setName("Drop History")
            .setDesc("Initialize local and remote database, and send all or retrieve all again.")
            .addButton((button) =>
                button
                    .setButtonText("Drop and send")
                    .setWarning()
                    .setDisabled(false)
                    .setClass("sls-btn-left")
                    .onClick(async () => {
                        await dropHistory(true);
                    })
            )
            .addButton((button) =>
                button
                    .setButtonText("Drop and receive")
                    .setWarning()
                    .setDisabled(false)
                    .setClass("sls-btn-right")
                    .onClick(async () => {
                        await dropHistory(false);
                    })
            );

        new Setting(containerHatchEl)
            .setName("Lock remote database")
            .setDesc("Lock remote database for synchronize")
            .addButton((button) =>
                button
                    .setButtonText("Lock")
                    .setDisabled(false)
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.markRemoteLocked();
                    })
            );

        new Setting(containerHatchEl)
            .setName("Suspend file watching")
            .setDesc("if enables it, all file operations are ignored.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.suspendFileWatching).onChange(async (value) => {
                    this.plugin.settings.suspendFileWatching = value;
                    await this.plugin.saveSettings();
                })
            );

        containerHatchEl.createEl("div", {
            text: sanitizeHTMLToDom(`Advanced buttons<br>
                These buttons could break your database easily.`),
        });
        new Setting(containerHatchEl)
            .setName("Reset remote database")
            .setDesc("Reset remote database, this affects only database. If you replicate again, remote database will restored by local database.")
            .addButton((button) =>
                button
                    .setButtonText("Reset")
                    .setDisabled(false)
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.tryResetRemoteDatabase();
                    })
            );
        new Setting(containerHatchEl)
            .setName("Reset local database")
            .setDesc("Reset local database, this affects only database. If you replicate again, local database will restored by remote database.")
            .addButton((button) =>
                button
                    .setButtonText("Reset")
                    .setDisabled(false)
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.resetLocalDatabase();
                    })
            );
        new Setting(containerHatchEl)
            .setName("Initialize local database again")
            .setDesc("WARNING: Reset local database and reconstruct by storage data. It affects local database, but if you replicate remote as is, remote data will be merged or corrupted.")
            .addButton((button) =>
                button
                    .setButtonText("INITIALIZE")
                    .setWarning()
                    .setDisabled(false)
                    .onClick(async () => {
                        await this.plugin.resetLocalDatabase();
                        await this.plugin.initializeDatabase();
                    })
            );

        new Setting(containerHatchEl)
            .setName("Drop old encrypted database")
            .setDesc("WARNING: Please use this button only when you have failed on converting old-style localdatabase at v0.10.0.")
            .addButton((button) =>
                button
                    .setButtonText("Drop")
                    .setWarning()
                    .setDisabled(false)
                    .onClick(async () => {
                        await this.plugin.resetLocalOldDatabase();
                        await this.plugin.initializeDatabase();
                    })
            );

        addScreenElement("50", containerHatchEl);
        // With great respect, thank you TfTHacker!
        // refered: https://github.com/TfTHacker/obsidian42-brat/blob/main/src/features/BetaPlugins.ts
        const containerPluginSettings = containerEl.createDiv();
        containerPluginSettings.createEl("h3", { text: "Plugins and settings (beta)" });

        const updateDisabledOfDeviceAndVaultName = () => {
            vaultName.setDisabled(this.plugin.settings.autoSweepPlugins || this.plugin.settings.autoSweepPluginsPeriodic);
            vaultName.setTooltip(this.plugin.settings.autoSweepPlugins || this.plugin.settings.autoSweepPluginsPeriodic ? "You could not change when you enabling auto scan." : "");
        };
        new Setting(containerPluginSettings).setName("Enable plugin synchronization").addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.usePluginSync).onChange(async (value) => {
                this.plugin.settings.usePluginSync = value;
                await this.plugin.saveSettings();
            })
        );

        new Setting(containerPluginSettings)
            .setName("Scan plugins automatically")
            .setDesc("Scan plugins before replicating.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoSweepPlugins).onChange(async (value) => {
                    this.plugin.settings.autoSweepPlugins = value;
                    updateDisabledOfDeviceAndVaultName();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerPluginSettings)
            .setName("Scan plugins periodically")
            .setDesc("Scan plugins each 1 minutes.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoSweepPluginsPeriodic).onChange(async (value) => {
                    this.plugin.settings.autoSweepPluginsPeriodic = value;
                    updateDisabledOfDeviceAndVaultName();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerPluginSettings)
            .setName("Notify updates")
            .setDesc("Notify when any device has a newer plugin or its setting.")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.notifyPluginOrSettingUpdated).onChange(async (value) => {
                    this.plugin.settings.notifyPluginOrSettingUpdated = value;
                    await this.plugin.saveSettings();
                })
            );
        const vaultName = new Setting(containerPluginSettings)
            .setName("Device and Vault name")
            .setDesc("")
            .addText((text) => {
                text.setPlaceholder("desktop-main")
                    .setValue(this.plugin.deviceAndVaultName)
                    .onChange(async (value) => {
                        this.plugin.deviceAndVaultName = value;
                        await this.plugin.saveSettings();
                    });
                // text.inputEl.setAttribute("type", "password");
            });
        new Setting(containerPluginSettings)
            .setName("Open")
            .setDesc("Open the plugin dialog")
            .addButton((button) => {
                button
                    .setButtonText("Open")
                    .setDisabled(false)
                    .onClick(() => {
                        this.plugin.showPluginSyncModal();
                    });
            });

        updateDisabledOfDeviceAndVaultName();

        addScreenElement("60", containerPluginSettings);

        const containerCorruptedDataEl = containerEl.createDiv();

        containerCorruptedDataEl.createEl("h3", { text: "Corrupted or missing data" });
        containerCorruptedDataEl.createEl("h4", { text: "Corrupted" });
        if (Object.keys(this.plugin.localDatabase.corruptedEntries).length > 0) {
            const cx = containerCorruptedDataEl.createEl("div", { text: "If you have copy of these items on any device, simply edit once or twice. Or not, delete this. sorry.." });
            for (const k in this.plugin.localDatabase.corruptedEntries) {
                const xx = cx.createEl("div", { text: `${k}` });

                const ba = xx.createEl("button", { text: `Delete this` }, (e) => {
                    e.addEventListener("click", async () => {
                        await this.plugin.localDatabase.deleteDBEntry(k);
                        xx.remove();
                    });
                });
                ba.addClass("mod-warning");
                xx.createEl("button", { text: `Restore from file` }, (e) => {
                    e.addEventListener("click", async () => {
                        const f = await this.app.vault.getFiles().filter((e) => path2id(e.path) == k);
                        if (f.length == 0) {
                            Logger("Not found in vault", LOG_LEVEL.NOTICE);
                            return;
                        }
                        await this.plugin.updateIntoDB(f[0]);
                        xx.remove();
                    });
                });
                xx.addClass("mod-warning");
            }
        } else {
            containerCorruptedDataEl.createEl("div", { text: "There is no corrupted data." });
        }
        containerCorruptedDataEl.createEl("h4", { text: "Missing or waiting" });
        if (Object.keys(this.plugin.queuedFiles).length > 0) {
            const cx = containerCorruptedDataEl.createEl("div", {
                text: "These files have missing or waiting chunks. Perhaps almost chunks will be found in a while after replication. But if there're no chunk, you have to restore database entry from existed file by hitting the button below.",
            });
            const files = [...new Set([...this.plugin.queuedFiles.map((e) => e.entry._id)])];
            for (const k of files) {
                const xx = cx.createEl("div", { text: `${id2path(k)}` });

                const ba = xx.createEl("button", { text: `Delete this` }, (e) => {
                    e.addEventListener("click", async () => {
                        await this.plugin.localDatabase.deleteDBEntry(k);
                        xx.remove();
                    });
                });
                ba.addClass("mod-warning");
                xx.createEl("button", { text: `Restore from file` }, (e) => {
                    e.addEventListener("click", async () => {
                        const f = await this.app.vault.getFiles().filter((e) => path2id(e.path) == k);
                        if (f.length == 0) {
                            Logger("Not found in vault", LOG_LEVEL.NOTICE);
                            return;
                        }
                        await this.plugin.updateIntoDB(f[0]);
                        xx.remove();
                    });
                });
                xx.addClass("mod-warning");
            }
        } else {
            containerCorruptedDataEl.createEl("div", { text: "There is no missing or waiting chunk." });
        }
        applyDisplayEnabled();
        addScreenElement("70", containerCorruptedDataEl);
        changeDisplay("0");
    }
}
