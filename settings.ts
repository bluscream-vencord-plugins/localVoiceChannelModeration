import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    targetVolume: {
        type: OptionType.SLIDER,
        description: "Volume level for joining users (0-200%).",
        default: 50,
        markers: [0, 10, 20, 25, 30, 40, 50, 75, 100, 150, 200],
        stickToMarkers: false,
        restartNeeded: false,
        onChange: (v) => {
            if (typeof v === "number") settings.store.duration = Math.round(v);
        },
    },
    duration: {
        type: OptionType.SLIDER,
        description: "Seconds to keep volume lowered (0 for infinite).",
        default: 30,
        markers: [0, 5, 15, 30, 60, 120, 300, 600],
        stickToMarkers: false,
        restartNeeded: false,
        onChange: (v) => {
            if (typeof v === "number") settings.store.duration = Math.round(v);
        },
    },
    localUserWhitelist: {
        type: OptionType.STRING,
        description: "User IDs to never moderate (one per line).",
        default: "",
        multiline: true,
        restartNeeded: false,
    },
    modOnChannelJoin: {
        type: OptionType.BOOLEAN,
        description: "Wether to moderate all users when joining a channel",
        default: false,
        restartNeeded: false,
    },
    skipFriends: {
        type: OptionType.BOOLEAN,
        description: "Skip moderating friends.",
        default: true,
        restartNeeded: false,
    },
    skipCustomVolume: {
        type: OptionType.BOOLEAN,
        description: "Skip users with pre-existing custom volumes.",
        default: true,
        restartNeeded: false,
    },
    msgModerate: {
        type: OptionType.STRING,
        description: "Moderation template. Vars: {user_id}, {old_volume}, {new_volume}, {duration}",
        default: "🛡️ Moderating <@{user_id}>: {old_volume}% -> {new_volume}% ({duration}s)",
        restartNeeded: false,
    },
    msgModerateSkip: {
        type: OptionType.STRING,
        description: "Skip template. Vars: {user_id}, {reason}",
        default: "🎙️ Skipping <@{user_id}>: {reason}",
        restartNeeded: false,
    },
    msgModerateEnd: {
        type: OptionType.STRING,
        description: "Ending template. Vars: {user_id}, {reason}",
        default: "🔄 Moderation ended for <@{user_id}>: {reason}",
        restartNeeded: false,
    },
    ephemeralMessagesEnabled: {
        type: OptionType.BOOLEAN,
        description: "Send private notifications for plugin actions.",
        default: true,
        restartNeeded: false,
    },
    pluginEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enables or disables automatic voice moderation.",
        default: true,
        restartNeeded: false,
    },
});
