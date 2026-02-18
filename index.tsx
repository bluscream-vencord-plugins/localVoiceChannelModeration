
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { UserStore, VoiceStateStore, MediaEngineStore, FluxDispatcher } from "@webpack/common";
import { settings } from "./settings";
import { pluginInfo } from "./info";

const logger = new Logger(pluginInfo.id, pluginInfo.color);

// Lazy load VoiceActions to avoid early initialization issues
let VoiceActions: any;
function getVoiceActions() {
    if (!VoiceActions) {
        VoiceActions = require("@webpack/common").VoiceActions;
    }
    return VoiceActions;
}

interface VolumeState {
    originalVolume: number;
    timeoutId?: any;
    targetVolume: number;
}

const activeModerations = new Map<string, VolumeState>();
const usersInMyChannel = new Set<string>();

const setVolume = (userId: string, volume: number) => {
    const actions = getVoiceActions();
    if (actions?.setLocalVolume) {
        actions.setLocalVolume(userId, volume, "default");
    } else {
        FluxDispatcher.dispatch({
            type: "AUDIO_SET_LOCAL_VOLUME",
            userId,
            volume,
            context: "default"
        });
    }
};

const sendEphemeral = (type: keyof typeof settings.store, vars: Record<string, string | number>) => {
    if (!settings.store.ephemeralMessagesEnabled) return;
    const { SelectedChannelStore } = require("@webpack/common");
    const { sendBotMessage } = require("@api/Commands");
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    let msg = settings.store[type] as string;
    if (!msg || !msg.trim()) return;

    for (const [key, val] of Object.entries(vars)) {
        msg = msg.replace(new RegExp(`{${key}}`, "g"), String(val));
    }

    sendBotMessage(channelId, { content: msg });
};

const moderateUser = (userId: string) => {
    if (!settings.store.pluginEnabled || activeModerations.has(userId)) return;

    const me = UserStore.getCurrentUser();
    if (userId === me?.id) return;

    const { RelationshipStore } = require("@webpack/common");
    const { getWhitelist } = require("./logic/whitelist");

    // Check Whitelist
    const whitelist = getWhitelist();
    if (whitelist.includes(userId)) {
        logger.info(`Skipping ${userId}: User is in localUserWhitelist.`);
        sendEphemeral("msgModerateSkip", { user_id: userId, reason: "User is in localUserWhitelist." });
        return;
    }

    // Check Friends
    if (settings.store.skipFriends && RelationshipStore?.isFriend?.(userId)) {
        logger.info(`Skipping ${userId}: User is a friend.`);
        sendEphemeral("msgModerateSkip", { user_id: userId, reason: "User is a friend." });
        return;
    }

    const currentVolume = MediaEngineStore.getLocalVolume(userId, "default") ?? 100;

    // Check Custom Volume (assuming 100 is default)
    if (settings.store.skipCustomVolume && currentVolume !== 100) {
        logger.info(`Skipping ${userId}: User already has a custom volume (${currentVolume}%).`);
        sendEphemeral("msgModerateSkip", { user_id: userId, reason: `User already has a custom volume (${Math.round(currentVolume)}%).` });
        return;
    }

    const targetVolume = settings.store.targetVolume;
    const duration = Number(settings.store.duration ?? 0);

    logger.info(`Moderating ${userId}: ${currentVolume}% -> ${targetVolume}% (${duration}s)`);

    sendEphemeral("msgModerate", {
        user_id: userId,
        old_volume: Math.round(currentVolume),
        new_volume: targetVolume,
        duration
    });

    setVolume(userId, targetVolume);

    const state: VolumeState = {
        originalVolume: currentVolume,
        targetVolume,
        timeoutId: undefined
    };

    if (duration > 0) {
        state.timeoutId = setTimeout(() => {
            endModeration(userId, "restore");
        }, duration * 1000);
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
        const volume = Math.round(state.originalVolume);
        logger.log(`Restoring volume for ${userId} to ${volume}%`);
        sendEphemeral("msgModerateEnd", { user_id: userId, reason: `Volume restored to ${volume}%` });
        setVolume(userId, state.originalVolume);
    } else if (reason === "manual") {
        logger.log(`Manual volume change detected for ${userId}. Cancelling moderation.`);
        sendEphemeral("msgModerateEnd", { user_id: userId, reason: "Manual volume change" });
    } else if (reason === "left") {
        logger.log(`Ending moderation for ${userId} because they left.`);
        sendEphemeral("msgModerateEnd", { user_id: userId, reason: "User left" });
    } else {
        logger.log(`Ending moderation for ${userId} due to plugin stop.`);
    }
};

const restoreAll = (reason: EndReason = "left") => {
    if (activeModerations.size === 0) return;
    logger.log(`Restoring ${activeModerations.size} users for reason: ${reason}`);
    for (const userId of activeModerations.keys()) {
        endModeration(userId, reason);
    }
    activeModerations.clear();
};

export default definePlugin({
    name: "Local Voice Channel Moderation",
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,
    toolboxActions: () => {
        const { Menu } = require("@webpack/common");
        return [
            <Menu.MenuCheckboxItem
                id="vc-local-voice-mod-pluginEnabled"
                label="Enable"
                checked={settings.store.pluginEnabled}
                action={() => {
                    settings.store.pluginEnabled = !settings.store.pluginEnabled;
                    if (!settings.store.pluginEnabled) {
                        restoreAll("stop");
                    }
                }}
            />,
            <Menu.MenuCheckboxItem
                id="vc-local-voice-mod-ephemerals-enabled"
                label="Enable Messages"
                checked={settings.store.ephemeralMessagesEnabled}
                action={() => {
                    settings.store.ephemeralMessagesEnabled = !settings.store.ephemeralMessagesEnabled;
                }}
            />
        ];
    },
    userContextActions: (user) => {
        const { WhitelistMenuItems } = require("./logic/whitelist");
        return [WhitelistMenuItems.getWhitelistUserItem(user)];
    },
    commands: [
        {
            name: "vd-whitelist-add",
            description: "Add a user to voice moderation whitelist",
            type: 1, // ApplicationCommandOptionType.SUB_COMMAND
            options: [{ name: "user", description: "User to whitelist", type: 6, required: true }], // ApplicationCommandOptionType.USER
            execute: (args: any, ctx: any) => {
                const { findOption, sendBotMessage } = require("@api/Commands");
                const { getWhitelist, setWhitelist } = require("./logic/whitelist");
                const userId = findOption(args, "user", "") as string;
                const whitelist = getWhitelist();
                if (whitelist.includes(userId)) {
                    sendBotMessage(ctx.channel.id, { content: "❌ User already whitelisted." });
                    return;
                }
                setWhitelist([...whitelist, userId]);
                sendBotMessage(ctx.channel.id, { content: `✅ Added <@${userId}> to voice mod whitelist.` });
            }
        },
        {
            name: "vd-whitelist-remove",
            description: "Remove a user from voice moderation whitelist",
            type: 1,
            options: [{ name: "user", description: "User to unwhitelist", type: 6, required: true }],
            execute: (args: any, ctx: any) => {
                const { findOption, sendBotMessage } = require("@api/Commands");
                const { getWhitelist, setWhitelist } = require("./logic/whitelist");
                const userId = findOption(args, "user", "") as string;
                const whitelist = getWhitelist();
                setWhitelist(whitelist.filter((id: string) => id !== userId));
                sendBotMessage(ctx.channel.id, { content: `✅ Removed <@${userId}> from voice mod whitelist.` });
            }
        },
        {
            name: "vd-whitelist-list",
            description: "List voice moderation whitelist",
            type: 1,
            execute: (args: any, ctx: any) => {
                const { getWhitelist } = require("./logic/whitelist");
                const { sendMessage } = require("@utils/discord");
                const whitelist = getWhitelist();
                sendMessage(ctx.channel.id, { content: `**Voice Mod Whitelist:**\n${whitelist.map((id: string) => `<@${id}>`).join(", ") || "None"}` });
            }
        },
        {
            name: "vd-volume-list",
            description: "List all users you have set a custom volume for",
            type: 1,
            execute: (args: any, ctx: any) => {
                const { UserStore, MediaEngineStore } = require("@webpack/common");
                const { sendBotMessage } = require("@api/Commands");

                const users = UserStore.getUsers();
                const customVolumes: { id: string; username: string; volume: number; }[] = [];

                for (const userId in users) {
                    const volume = MediaEngineStore.getLocalVolume(userId, "default");
                    if (volume !== 100) {
                        customVolumes.push({
                            id: userId,
                            username: users[userId].username,
                            volume: Math.round(volume)
                        });
                    }
                }

                if (customVolumes.length === 0) {
                    sendBotMessage(ctx.channel.id, { content: "You haven't set custom volumes for any users in the current session's cache." });
                    return;
                }

                const list = customVolumes
                    .map(u => `• **${u.username}** (${u.id}): ${u.volume}%`)
                    .join("\n");

                sendBotMessage(ctx.channel.id, {
                    content: `**Custom User Volumes:**\n${list}`
                });
            }
        },
        {
            name: "vd-volume-reset-all",
            description: "Reset all custom user volumes back to 100%",
            type: 1, // ApplicationCommandOptionType.SUB_COMMAND
            execute: (args: any, ctx: any) => {
                const { UserStore, MediaEngineStore } = require("@webpack/common");
                const { sendBotMessage } = require("@api/Commands");

                const users = UserStore.getUsers();
                let count = 0;

                for (const userId in users) {
                    const volume = MediaEngineStore.getLocalVolume(userId, "default");
                    if (volume !== 100) {
                        setVolume(userId, 100);
                        count++;
                    }
                }

                sendBotMessage(ctx.channel.id, {
                    content: count > 0
                        ? `✅ Reset volumes for **${count}** users back to 100%.`
                        : "ℹ️ No custom volumes found to reset."
                });
            }
        }
    ],
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }) {
            const me = UserStore.getCurrentUser();
            if (!me) return;

            const myState = voiceStates.find((s: any) => s.userId === me.id);
            if (myState) {
                const myChannelId = myState.channelId;
                if (!myChannelId) {
                    // I left voice
                    logger.info("I left voice channel. Restoring all.");
                    usersInMyChannel.clear();
                    restoreAll("left");
                } else if (myChannelId !== myState.oldChannelId) {
                    // I joined or moved channel
                    logger.info(`I moved to channel ${myChannelId}. Moderating new neighbors.`);
                    restoreAll("left");
                    usersInMyChannel.clear();

                    const channelUsers = VoiceStateStore.getVoiceStatesForChannel(myChannelId);
                    if (channelUsers) {
                        for (const userId of Object.keys(channelUsers)) {
                            if (userId === me.id) continue;
                            usersInMyChannel.add(userId);
                            moderateUser(userId);
                        }
                    }
                }
            }

            // Handle others' changes regardless of whether I moved or not
            const currentMyChannelId = VoiceStateStore.getVoiceStateForUser(me.id)?.channelId;
            if (!currentMyChannelId) return;

            for (const state of voiceStates) {
                if (state.userId === me.id) continue;

                if (state.channelId === currentMyChannelId) {
                    // They are in my channel now
                    if (!usersInMyChannel.has(state.userId)) {
                        logger.info(`User ${state.userId} joined my channel.`);
                        moderateUser(state.userId);
                        usersInMyChannel.add(state.userId);
                    }
                } else if (usersInMyChannel.has(state.userId)) {
                    // They were in my channel but now they are not
                    logger.info(`User ${state.userId} left my channel.`);
                    usersInMyChannel.delete(state.userId);
                    endModeration(state.userId, "left");
                }
            }
        },

        AUDIO_SET_LOCAL_VOLUME({ userId, volume }) {
            const mod = activeModerations.get(userId);
            if (mod && volume !== mod.targetVolume) {
                // If the volume is being restored by us, it will match originalVolume usually
                // but AUDIO_SET_LOCAL_VOLUME fires for our own restoration too.
                // However, we delete the moderation state BEFORE dispatching restore.
                // So if 'mod' still exists, it means someone else changed it.
                endModeration(userId, "manual");
            }
        }
    },

    start() {
        const me = UserStore.getCurrentUser();
        if (me) {
            const channelId = VoiceStateStore.getVoiceStateForUser(me.id)?.channelId;
            if (channelId) {
                logger.info(`Plugin started while in channel ${channelId}. Moderating existing members.`);
                const channelUsers = VoiceStateStore.getVoiceStatesForChannel(channelId);
                if (channelUsers) {
                    for (const userId of Object.keys(channelUsers)) {
                        if (userId === me.id) continue;
                        usersInMyChannel.add(userId);
                        moderateUser(userId);
                    }
                }
            }
        }
    },

    stop() {
        restoreAll("stop");
        usersInMyChannel.clear();
    }
});
