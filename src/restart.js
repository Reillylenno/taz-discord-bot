import { spawn } from "node:child_process";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { controlPath } from "./instance-paths.js";

async function requestRunningBotRestart() {
  let lastError;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect(controlPath);
        socket.setTimeout(1000, () => {
          const error = new Error("Timed out contacting the running bot.");
          error.code = "ETIMEDOUT";
          socket.destroy(error);
        });
        socket.once("connect", () => socket.write("restart\n"));
        socket.once("data", (data) => {
          socket.end();
          if (data.toString().trim() === "restarting") {
            resolve();
          } else {
            reject(new Error(`The running bot did not restart: ${data.toString().trim()}`));
          }
        });
        socket.once("error", reject);
      });

      return true;
    } catch (error) {
      lastError = error;
      if (! ["ENOENT", "ECONNREFUSED", "ETIMEDOUT"].includes(error.code)) {
        throw error;
      }
      await delay(100);
    }
  }

  if (["ENOENT", "ECONNREFUSED", "ETIMEDOUT"].includes(lastError?.code)) {
    return false;
  }
  throw lastError;
}

const replacedRunningBot = await requestRunningBotRestart();
console.log(replacedRunningBot ? "Starting replacement bot." : "No running bot found; starting it.");

const bot = spawn(process.execPath, [fileURLToPath(new URL("./index.js", import.meta.url))], {
  env: { ...process.env, BOT_RESTART: "1" },
  stdio: "inherit",
});

bot.once("error", (error) => {
  console.error("Could not start the bot:", error);
  process.exitCode = 1;
});

bot.once("exit", (code) => {
  process.exitCode = code ?? 1;
});