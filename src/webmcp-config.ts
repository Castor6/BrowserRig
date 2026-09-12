import { Config } from "effect"

/** Read in the calling CLI/MCP process, never from the shared relay's environment. */
export const experimentalWebMcpConfig = Config.boolean("BROWSERRIG_EXPERIMENTAL_WEBMCP").pipe(Config.withDefault(false))
