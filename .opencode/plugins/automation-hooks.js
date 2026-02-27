import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PRETTIER_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
]);

const ESLINT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
]);

function runCommand(command, args, cwd, timeoutMs = 120000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: timeoutMs,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  };
}

async function log(client, level, message, extra = {}) {
  await client.app.log({
    body: {
      service: "automation-hooks",
      level,
      message,
      extra,
    },
  });
}

function hasNpmTestScript(cwd) {
  const filePath = path.join(cwd, "package.json");
  if (!existsSync(filePath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(filePath, "utf-8"));
    return Boolean(pkg?.scripts?.test);
  } catch {
    return false;
  }
}

function collectSessionContext(cwd) {
  const branch = runCommand("git", ["branch", "--show-current"], cwd, 30000);
  const status = runCommand("git", ["status", "--short"], cwd, 30000);
  const todos = runCommand("git", ["grep", "-n", "TODO:"], cwd, 30000);

  const branchName = branch.stdout.trim() || "(unknown)";
  const dirty = status.stdout.trim() || "Working tree clean";
  const todoLines = todos.ok
    ? todos.stdout.split("\n").filter(Boolean).slice(0, 5).join("\n")
    : "No TODO lines found";

  return `## Current repo context (auto)\nBranch: ${branchName}\n\nDirty files:\n\n\`\`\`text\n${dirty}\n\`\`\`\n\nActive TODOs (top 5):\n\n\`\`\`text\n${todoLines}\n\`\`\``;
}

function buildRoutingHints(promptText) {
  const text = String(promptText || "").toLowerCase();
  const hints = [];

  if (/(plan|approach|design|roadmap|sequence)/.test(text)) {
    hints.push("Use the planner agent first for staged implementation.");
  }

  if (/(review|regression|bug|refactor|quality|test gap)/.test(text)) {
    hints.push(
      "Use the code-reviewer agent before finalising major code changes."
    );
  }

  if (/(security|auth|permission|secret|token|jwt|credential)/.test(text)) {
    hints.push(
      "Use the security-auditor agent for auth, secrets, and permission-sensitive work."
    );
  }

  if (!hints.length) return "";
  return `## Agent routing hints (auto)\n${hints.map((hint) => `- ${hint}`).join("\n")}`;
}

export const AutomationHooksPlugin = async ({ directory, client }) => {
  let sessionContextInjected = false;
  let lastTestSignature = "";

  return {
    "tool.execute.after": async (input) => {
      if (!["write", "edit", "multiedit"].includes(input.tool)) return;

      const filePath = input.args?.filePath;
      if (!filePath) return;

      const ext = path.extname(String(filePath)).toLowerCase();

      if (PRETTIER_EXTENSIONS.has(ext)) {
        const pretty = runCommand(
          "npx",
          ["prettier", "--write", filePath],
          directory
        );
        if (!pretty.ok) {
          await log(client, "warn", "Prettier auto-format failed", {
            filePath,
            stderr: pretty.stderr.trim().slice(0, 800),
          });
        }
      }

      if (ESLINT_EXTENSIONS.has(ext)) {
        const eslint = runCommand(
          "npx",
          ["eslint", "--fix", filePath],
          directory
        );
        if (!eslint.ok) {
          await log(client, "warn", "ESLint auto-fix failed", {
            filePath,
            stderr: eslint.stderr.trim().slice(0, 800),
          });
        }
      }

      if (ext === ".go") {
        const gofmt = runCommand("gofmt", ["-w", filePath], directory);
        if (!gofmt.ok) {
          await log(client, "warn", "gofmt failed", {
            filePath,
            stderr: gofmt.stderr.trim().slice(0, 800),
          });
        }
      }
    },

    "tui.prompt.append": async (input, output) => {
      const basePrompt =
        typeof output.prompt === "string"
          ? output.prompt
          : String(input.prompt || "");
      const sections = [];

      if (!sessionContextInjected) {
        sections.push(collectSessionContext(directory));
        sessionContextInjected = true;
      }

      const routingHints = buildRoutingHints(basePrompt);
      if (routingHints) sections.push(routingHints);

      if (!sections.length) return;
      output.prompt = `${basePrompt}\n\n${sections.join("\n\n")}`;
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return;
      if (
        String(
          process.env.OPENCODE_AUTO_TEST_ON_IDLE || "true"
        ).toLowerCase() === "false"
      )
        return;

      const changed = runCommand(
        "git",
        ["diff", "--name-only"],
        directory,
        30000
      );
      const staged = runCommand(
        "git",
        ["diff", "--cached", "--name-only"],
        directory,
        30000
      );
      const signature = `${changed.stdout}\n${staged.stdout}`.trim();

      if (!signature || signature === lastTestSignature) return;
      lastTestSignature = signature;

      const changedFiles = signature
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const hasGoChanges = changedFiles.some((file) => file.endsWith(".go"));
      const hasNodeTestScript = hasNpmTestScript(directory);

      if (hasGoChanges) {
        const test = runCommand("go", ["test", "./..."], directory, 240000);
        await log(
          client,
          test.ok ? "info" : "warn",
          "Auto test on session idle: go test ./...",
          {
            status: test.status,
            stderr: test.stderr.trim().slice(0, 1000),
            stdout: test.stdout.trim().slice(0, 1000),
          }
        );
      }

      if (hasNodeTestScript) {
        const test = runCommand(
          "npm",
          ["test", "--", "--passWithNoTests"],
          directory,
          240000
        );
        await log(
          client,
          test.ok ? "info" : "warn",
          "Auto test on session idle: npm test",
          {
            status: test.status,
            stderr: test.stderr.trim().slice(0, 1000),
            stdout: test.stdout.trim().slice(0, 1000),
          }
        );
      }
    },
  };
};
