#!/usr/bin/env npx tsx

import { program } from "commander";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TASK_MASTER_BIN = join(
  __dirname,
  "node_modules",
  ".bin",
  "task-master"
);

const DEFAULT_CONFIG = {
  models: {
    main: { provider: "anthropic", modelId: "claude-sonnet-4-20250514" },
    research: { provider: "anthropic", modelId: "claude-sonnet-4-20250514" },
    fallback: { provider: "anthropic", modelId: "claude-3-haiku-20240307" },
  },
  global: { logLevel: "info" },
};

function run(
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<void> {
  return new Promise((resolveP, reject) => {
    const child = spawn(TASK_MASTER_BIN, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", "pipe", "inherit"],
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`task-master ${args[0]} exited with code ${code}`));
      } else {
        resolveP();
      }
    });
  });
}

async function main() {
  program
    .requiredOption("--input <path>", "Path to the PRD file")
    .requiredOption("--anthropic-key <key>", "Anthropic API key")
    .parse();

  const opts = program.opts<{ input: string; anthropicKey: string }>();
  const prdPath = resolve(opts.input);

  try {
    await access(prdPath);
  } catch {
    console.error(`Error: PRD file not found: ${prdPath}`);
    process.exit(1);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "prd-to-tasks-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANTHROPIC_API_KEY: opts.anthropicKey,
  };

  try {
    await mkdir(join(tempDir, ".taskmaster", "tasks"), { recursive: true });
    await mkdir(join(tempDir, ".taskmaster", "reports"), { recursive: true });
    await writeFile(
      join(tempDir, ".taskmaster", "config.json"),
      JSON.stringify(DEFAULT_CONFIG, null, 2)
    );

    console.error("[1/3] Parsing PRD...");
    await run(["parse-prd", `--input=${prdPath}`, "--num-tasks=0"], {
      cwd: tempDir,
      env,
    });

    console.error("[2/3] Analyzing complexity...");
    await run(["analyze-complexity"], { cwd: tempDir, env });

    console.error("[3/3] Expanding tasks...");
    await run(["expand", "--all"], { cwd: tempDir, env });

    const tasksJson = await readFile(
      join(tempDir, ".taskmaster", "tasks", "tasks.json"),
      "utf-8"
    );
    process.stdout.write(tasksJson);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
