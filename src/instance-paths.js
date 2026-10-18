import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectPath = fileURLToPath(new URL("../", import.meta.url)).toLowerCase();
const projectKey = createHash("sha256").update(projectPath).digest("hex").slice(0, 16);

export const lockTarget = path.join(os.tmpdir(), `taz-bot-${projectKey}`);
export const controlPath = process.platform === "win32"
  ? `\\\\.\\pipe\\taz-bot-${projectKey}`
  : path.join(os.tmpdir(), `taz-bot-${projectKey}.sock`);