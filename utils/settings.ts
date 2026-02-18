import { settings } from "../settings";

export function getNewLineList(setting: string): string[] {
    return (settings.store[setting] || "").split(/\r?\n/).map((s: string) => s.trim());
}
export function getUserIdList(setting: string): string[] {
    return getNewLineList(setting).filter(id => /^\d{17,19}$/.test(id));
}

export function setNewLineList(setting: string, newList: string[]) {
    settings.store[setting] = [...new Set(newList.map(s => s.trim()).filter(s => s.length > 0))].join("\n");
}
