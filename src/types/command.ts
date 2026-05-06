import { Style } from "./style";

export interface Command {
    cmd: string;
    hymn?: string;
    style?: Partial<Style>;
    name?: string;
    position?: number; // For queue reordering
}

export interface CommandResult {
    success: boolean;
    error?: string;
    payload?: unknown;
}
