const SECRET_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.test",
  ".env.production",
  "alloy.river",
  "mcp.json",
  "id_rsa",
  "id_ed25519",
]);

const SECRET_SUFFIXES = [".pem", ".key", ".p12", ".pfx"];

function getBaseName(filePath) {
  const parts = String(filePath).split(/[\\/]/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function isSensitivePath(filePath) {
  const base = getBaseName(filePath);
  if (base === ".env.example" || base === ".env.sample") return false;
  if (SECRET_BASENAMES.has(base)) return true;
  return SECRET_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

export const EnvProtectionPlugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "read") return;

      const allowSecrets =
        String(process.env.OPENCODE_ALLOW_SECRET_READ || "").toLowerCase() ===
        "true";
      if (allowSecrets) return;

      const filePath = output.args?.filePath;
      if (!filePath) return;

      if (isSensitivePath(filePath)) {
        throw new Error(
          "Reading sensitive files is blocked by EnvProtectionPlugin. Set OPENCODE_ALLOW_SECRET_READ=true only when necessary."
        );
      }
    },
  };
};
