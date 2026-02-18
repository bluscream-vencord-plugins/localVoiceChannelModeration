
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    pluginEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enables or disables the automatic voice channel moderation.",
        default: true,
        restartNeeded: false,
    },
    ephemeralMessagesEnabled: {
        type: OptionType.BOOLEAN,
        description: "Send clientside ephemeral messages for actions the plugin takes.",
        default: false,
        restartNeeded: false,
    },
    targetVolume: {
        type: OptionType.SLIDER,
        description: "Volume level to set for new users (0-200%).",
        default: 50,
        markers: [0, 10, 20, 25, 30, 40, 50, 75, 100, 150, 200],
        stickToMarkers: true,
        restartNeeded: false,
    },
    duration: {
        type: OptionType.NUMBER,
        description: "How long to keep the volume lowered (seconds). 0 for infinite/manual restore.",
        default: 30,
        restartNeeded: false,
    },
    localUserWhitelist: {
        type: OptionType.STRING,
        description: "User IDs that should never be moderated (new line separated).",
        default: "",
        multiline: true,
        restartNeeded: false,
    },
    skipFriends: {
        type: OptionType.BOOLEAN,
        description: "Skip moderating your friends.",
        default: true,
        restartNeeded: false,
    },
    skipCustomVolume: {
        type: OptionType.BOOLEAN,
        description: "Skip people who already have a custom volume set.",
        default: true,
        restartNeeded: false,
    },

    msgModerate: {
        type: OptionType.STRING,
        description: "Message when user is moderated. Variables: {user_id}, {old_volume}, {new_volume}, {duration}",
        default: "🛡️ Moderating <@{user_id}>: {old_volume}% -> {new_volume}% ({duration}s)",
        restartNeeded: false,
    },
    msgModerateSkip: {
        type: OptionType.STRING,
        description: "Message when user is skipped. Variables: {user_id}, {reason}",
        default: "🎙️ Skipping <@{user_id}>: {reason}",
        restartNeeded: false,
    },
    msgModerateEnd: {
        type: OptionType.STRING,
        description: "Message when moderation ends. Variables: {user_id}, {reason}",
        default: "🔄 Moderation ended for <@{user_id}>: {reason}",
        restartNeeded: false,
    },
});
