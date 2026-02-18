import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { UserStore, VoiceStateStore, MediaEngineStore, FluxDispatcher, RelationshipStore, SelectedChannelStore, Menu, showToast } from "@webpack/common";
import { settings } from "./settings";
import { pluginInfo } from "./info";

const logger = new Logger(pluginInfo.id, pluginInfo.color);
const activeModerations = new Map<string, { originalVolume: number; timeoutId?: any; targetVolume: number; }>();
const usersInMyChannel = new Set<string>();

const scaleVolume = (v: number) => Math.pow(v / 100, 3) * 100;
const unscaleVolume = (v: number) => Math.pow(v / 100, 1 / 3) * 100;

const setVolume = (userId: string, volume: number) => {
    const { VoiceActions } = require("@webpack/common");
    if (VoiceActions?.setLocalVolume) {
        VoiceActions.setLocalVolume(userId, volume, "default");
    } else {
        FluxDispatcher.dispatch({ type: "AUDIO_SET_LOCAL_VOLUME", userId, volume, context: "default" });
    }
};

const sendEphemeral = (type: keyof typeof settings.store, vars: Record<string, string | number>) => {
    if (!settings.store.ephemeralMessagesEnabled) return;
    const { sendBotMessage } = require("@api/Commands");
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    let msg = settings.store[type] as string;
    if (!msg?.trim()) return;

    for (const [key, val] of Object.entries(vars)) {
        msg = msg.replace(new RegExp(`{${key}}`, "g"), String(val));
    }
    sendBotMessage(channelId, { content: msg });
};

const moderateUser = (userId: string) => {
    if (!settings.store.pluginEnabled || activeModerations.has(userId) || userId === UserStore.getCurrentUser()?.id) return;

    const whitelist = (settings.store.localUserWhitelist || "").split(/\r?\n/).map(s => s.trim());
    if (whitelist.includes(userId)) {
        sendEphemeral("msgModerateSkip", { user_id: userId, reason: "Whitelisted" });
        return;
    }

    if (settings.store.skipFriends && RelationshipStore.isFriend(userId)) {
        sendEphemeral("msgModerateSkip", { user_id: userId, reason: "Friend" });
        return;
    }

    const currentVolume = MediaEngineStore.getLocalVolume(userId, "default") ?? 100;
    const currentDisplayVolume = unscaleVolume(currentVolume);

    if (settings.store.skipCustomVolume && Math.round(currentDisplayVolume) !== 100) {
        sendEphemeral("msgModerateSkip", { user_id: userId, reason: `Custom Volume (${Math.round(currentDisplayVolume)}%)` });
        return;
    }

    const { targetVolume: targetDisplayVolume, duration } = settings.store;
    const targetVolume = scaleVolume(targetDisplayVolume);

    logger.info(`Moderating ${userId}: ${Math.round(currentDisplayVolume)}% -> ${targetDisplayVolume}% (${duration}s)`);
    sendEphemeral("msgModerate", {
        user_id: userId,
        old_volume: Math.round(currentDisplayVolume),
        new_volume: targetDisplayVolume,
        duration
    });

    setVolume(userId, targetVolume);

    const state = { originalVolume: currentVolume, targetVolume, timeoutId: undefined as any };
    if (duration > 0) {
        state.timeoutId = setTimeout(() => endModeration(userId, "restore"), duration * 1000);
    }
    activeModerations.set(userId, state);
};

export type EndReason = "restore" | "manual" | "left" | "stop";

const endModeration = (userId: string, reason: EndReason) => {
    const state = activeModerations.get(userId);
    if (!state) return;

    if (state.timeoutId) clearTimeout(state.timeoutId);
    activeModerations.delete(userId);

    if (reason === "restore") {
        const vol = Math.round(unscaleVolume(state.originalVolume));
        sendEphemeral("msgModerateEnd", { user_id: userId, reason: `Volume restored to ${vol}%` });
        setVolume(userId, state.originalVolume);
    } else if (reason !== "stop") {
        sendEphemeral("msgModerateEnd", { user_id: userId, reason: reason === "manual" ? "Manual change" : "User left" });
    }
};

const restoreAll = (reason: EndReason = "left") => {
    for (const userId of activeModerations.keys()) endModeration(userId, reason);
};

export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,
    toolboxActions: () => [
        <Menu.MenuCheckboxItem
            id="vc-local-voice-mod-enabled"
            label="Enable Moderation"
            checked={settings.store.pluginEnabled}
            action={() => {
                settings.store.pluginEnabled = !settings.store.pluginEnabled;
                if (!settings.store.pluginEnabled) restoreAll("stop");
            }}
        />,
        <Menu.MenuCheckboxItem
            id="vc-local-voice-mod-ephemerals"
            label="Enable Messages"
            checked={settings.store.ephemeralMessagesEnabled}
            action={() => settings.store.ephemeralMessagesEnabled = !settings.store.ephemeralMessagesEnabled}
        />,
        <Menu.MenuCheckboxItem
            id="vc-local-voice-mod-mod-on-join"
            label="Moderate on Join"
            checked={settings.store.modOnChannelJoin}
            action={() => settings.store.modOnChannelJoin = !settings.store.modOnChannelJoin}
        />
    ],
    userContextActions: (user) => {
        const whitelist = (settings.store.localUserWhitelist || "").split(/\r?\n/).map(s => s.trim()).filter(id => id);
        const isWhitelisted = whitelist.includes(user.id);
        return (
            <Menu.MenuItem
                id="vc-local-voice-mod-whitelist"
                label={isWhitelisted ? "Unwhitelist (Voice Mod)" : "Whitelist (Voice Mod)"}
                action={() => {
                    const newList = isWhitelisted ? whitelist.filter(id => id !== user.id) : [...whitelist, user.id];
                    settings.store.localUserWhitelist = newList.join("\n");
                    showToast(isWhitelisted ? `Removed ${user.username} from whitelist.` : `Added ${user.username} to whitelist.`);
                }}
            />
        );
    },
    commands: [
        {
            name: "volume",
            description: "Voice moderation volume commands",
            options: [
                {
                    name: "list",
                    description: "List all users you have set a custom volume for",
                    type: 1, // ApplicationCommandOptionType.SUB_COMMAND
                },
                {
                    name: "reset",
                    description: "Reset all custom volumes to 100%",
                    type: 1, // ApplicationCommandOptionType.SUB_COMMAND
                }
            ],
            execute: (args, ctx) => {
                const { findOption, sendBotMessage } = require("@api/Commands");
                const subCommand = args[0].name;
                const users = UserStore.getUsers();

                if (subCommand === "list") {
                    const custom: string[] = [];
                    for (const id in users) {
                        const vol = MediaEngineStore.getLocalVolume(id, "default");
                        if (Math.round(unscaleVolume(vol)) !== 100) {
                            custom.push(`• <@${id}>: ${Math.round(unscaleVolume(vol))}%`);
                        }
                    }
                    sendBotMessage(ctx.channel.id, { content: custom.length ? `**Custom Volumes:**\n${custom.join("\n")}` : "No custom volumes." });
                } else if (subCommand === "reset") {
                    let count = 0;
                    for (const id in users) {
                        if (Math.round(unscaleVolume(MediaEngineStore.getLocalVolume(id, "default"))) !== 100) {
                            setVolume(id, 100);
                            count++;
                        }
                    }
                    sendBotMessage(ctx.channel.id, { content: count ? `✅ Reset ${count} volumes.` : "ℹ️ No volumes to reset." });
                }
            }
        }
    ],
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }) {
            const me = UserStore.getCurrentUser();
            if (!me) return;

            const myState = voiceStates.find((s: any) => s.userId === me.id);
            if (myState) {
                if (!myState.channelId) {
                    usersInMyChannel.clear();
                    restoreAll("left");
                } else if (myState.channelId !== myState.oldChannelId) {
                    restoreAll("left");
                    usersInMyChannel.clear();
                    const players = VoiceStateStore.getVoiceStatesForChannel(myState.channelId);
                    if (players) {
                        for (const id of Object.keys(players)) {
                            if (id !== me.id) {
                                usersInMyChannel.add(id);
                                if (settings.store.modOnChannelJoin) moderateUser(id);
                            }
                        }
                    }
                }
            }

            const myChannelId = VoiceStateStore.getVoiceStateForUser(me.id)?.channelId;
            if (!myChannelId) return;

            for (const s of voiceStates) {
                if (s.userId === me.id) continue;
                if (s.channelId === myChannelId) {
                    if (!usersInMyChannel.has(s.userId)) {
                        moderateUser(s.userId);
                        usersInMyChannel.add(s.userId);
                    }
                } else if (usersInMyChannel.has(s.userId)) {
                    usersInMyChannel.delete(s.userId);
                    endModeration(s.userId, "left");
                }
            }
        },
        AUDIO_SET_LOCAL_VOLUME({ userId, volume }) {
            const mod = activeModerations.get(userId);
            if (mod && volume !== mod.targetVolume) endModeration(userId, "manual");
        }
    },
    start() {
        const mid = UserStore.getCurrentUser()?.id;
        if (!mid) return;
        const cid = VoiceStateStore.getVoiceStateForUser(mid)?.channelId;
        if (!cid) return;
        const players = VoiceStateStore.getVoiceStatesForChannel(cid);
        if (players) {
            for (const id of Object.keys(players)) {
                if (id !== mid) {
                    usersInMyChannel.add(id);
                    if (settings.store.modOnChannelJoin) moderateUser(id);
                }
            }
        }
    },
    stop() {
        restoreAll("stop");
        usersInMyChannel.clear();
    }
});
