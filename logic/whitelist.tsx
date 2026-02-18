import { Menu, showToast } from "@webpack/common";
import { type User } from "@vencord/discord-types";
import { getUserIdList, setNewLineList } from "../utils/settings";

export function getWhitelist(): string[] {
    return getUserIdList("localUserWhitelist");
}

export function setWhitelist(newList: string[]) {
    setNewLineList("localUserWhitelist", newList);
}

export const WhitelistMenuItems = {
    getWhitelistUserItem: (user: User) => {
        const whitelist = getWhitelist();
        const isWhitelisted = whitelist.includes(user.id);

        return (
            <Menu.MenuItem
                id="vc-local-voice-mod-user-whitelist"
                label={isWhitelisted ? "Unwhitelist (Voice Mod)" : "Whitelist (Voice Mod)"}
                action={() => {
                    const currentWhitelist = getWhitelist();
                    if (isWhitelisted) {
                        setWhitelist(currentWhitelist.filter(id => id !== user.id));
                    } else {
                        setWhitelist([...currentWhitelist, user.id]);
                    }
                    showToast(isWhitelisted ? `Removed ${user.username} from voice mod whitelist.` : `Added ${user.username} to voice mod whitelist.`);
                }}
            />
        );
    }
};
