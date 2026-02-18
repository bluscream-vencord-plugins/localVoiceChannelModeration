# Local Voice Channel Moderation

Automatically lowers the volume of users joining your voice channel to ensure a pleasant listening experience.

## ✨ Features

- **🚀 Proactive Moderation**: Scans and moderates users already in the channel when you join or when the plugin starts.
- **🎙️ Automatic Volume Control**: Lowers the volume of joining users to a customizable target level.
- **⏳ Auto-Restore**: Optionally restores a user's original volume after a set duration.
- **🛑 Smart Skips**: Automatically skips friends, users with existing custom volumes, or whitelisted individuals.
- **🛡️ Whitelist System**: Easy-to-use whitelist accessible via user context menus or chat commands.
- **💬 Ephemeral Feedback**: Provides private, client-side notifications for plugin actions, skips, and volume restorations.
- **🛠️ Toolbox Integration**: Quick-access toggles in the Vencord Toolbox to enable/disable the plugin and its notifications.

## ⚙️ Settings

- **Enable**: Master toggle for the plugin logic.
- **Target Volume**: The volume level (0-200%) to set for moderated users.
- **Duration**: How many seconds to keep the volume lowered (0 for infinite/manual).
- **Skip Friends**: If enabled, friends will not have their volume automatically lowered.
- **Skip Custom Volume**: Skips users for whom you've already manually set a non-default volume.
- **Enable Messages**: Toggle ephemeral notifications in the channel chat.
- **Whitelist**: A list of User IDs to be ignored by the moderation logic.
- **Custom Messages**: Fully customizable templates for moderation, skip, and end messages with variable support (`{user_id}`, `{reason}`, etc.).

## ⌨️ Commands

| Command | Description |
| :--- | :--- |
| `/vd-whitelist-add <user>` | Adds a specific user to the moderation whitelist. |
| `/vd-whitelist-remove <user>` | Removes a user from the whitelist. |
| `/vd-whitelist-list` | Displays the current whitelist in the channel. |
| `/vd-volume-list` | Lists all users for whom you currently have a custom volume set. |
| `/vd-volume-reset-all` | Resets all custom user volumes back to 100%. |

## 🖱️ Context Menu

You can quickly whitelist or unwhitelist any user by right-clicking them and selecting the **Whitelist (Voice Mod)** or **Unwhitelist (Voice Mod)** option.

---
*Created with ❤️ by Bluscream*
