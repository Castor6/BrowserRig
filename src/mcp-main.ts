#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { runMcpServer } from "./mcp.ts"

runMcpServer.pipe(NodeRuntime.runMain)
