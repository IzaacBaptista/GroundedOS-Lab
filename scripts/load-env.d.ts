type LoadEnvOptions = {
    appDir?: string;
    cwd?: string;
};
/**
 * Minimal local `.env` loader for Node-side commands. Shell-provided variables
 * keep priority; files only fill missing keys.
 */
export declare function loadLocalEnv(options?: LoadEnvOptions): void;
export {};
