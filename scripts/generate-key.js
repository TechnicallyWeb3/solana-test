const fs = require("fs");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const GITIGNORE_PATH = path.join(ROOT, ".gitignore");
const KEYPAIR_FILENAME = "deployer-keypair.json";
const KEYPAIR_PATH = path.join(ROOT, KEYPAIR_FILENAME);
const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const DEFAULT_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const TRANSFER_FEE_LAMPORTS = 5000;

const force = process.argv.includes("--force");
const rotate = process.argv.includes("--rotate");

if (force && rotate) {
  console.error("Use only one of --force or --rotate.");
  process.exit(1);
}

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

function writeEnv(values) {
  const lines = [
    "# Solana deployer wallet (devnet + mainnet)",
    `DEPLOYER_PUBLIC_KEY=${values.DEPLOYER_PUBLIC_KEY}`,
    `DEPLOYER_SECRET_KEY=${values.DEPLOYER_SECRET_KEY}`,
    `KEYPAIR_PATH=${values.KEYPAIR_PATH}`,
    `SOLANA_RPC_URL=${values.SOLANA_RPC_URL}`,
    `MAINNET_RPC_URL=${values.MAINNET_RPC_URL}`,
    `PROGRAM_ID=${values.PROGRAM_ID || ""}`,
    "",
  ];
  fs.writeFileSync(ENV_PATH, lines.join("\n"));
}

function gitignorePatterns() {
  if (!fs.existsSync(GITIGNORE_PATH)) return [];
  return fs
    .readFileSync(GITIGNORE_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function matchesGitignorePattern(filename, pattern) {
  if (pattern === filename) return true;
  if (!pattern.includes("*") && !pattern.includes("?")) return false;
  const regex = new RegExp(
    `^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".")}$`
  );
  return regex.test(filename);
}

function isGitignored(filename) {
  return gitignorePatterns().some((pattern) =>
    matchesGitignorePattern(filename, pattern)
  );
}

function ensureGitignored(filename) {
  if (isGitignored(filename)) return;
  const existing = fs.existsSync(GITIGNORE_PATH)
    ? fs.readFileSync(GITIGNORE_PATH, "utf8")
    : "";
  const needsNewline = existing.length > 0 && !existing.endsWith("\n");
  fs.appendFileSync(
    GITIGNORE_PATH,
    `${needsNewline ? "\n" : ""}${filename}\n`
  );
}

function keypairFromSecret(secretKeyJson) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyJson)));
}

function loadExistingKeypair(env) {
  if (env.DEPLOYER_SECRET_KEY) {
    return keypairFromSecret(env.DEPLOYER_SECRET_KEY);
  }

  const keypairPath = path.join(ROOT, env.KEYPAIR_PATH || KEYPAIR_FILENAME);
  if (fs.existsSync(keypairPath)) {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  return null;
}

async function transferAllSol(fromKeypair, toPublicKey, rpcUrl, networkLabel) {
  const connection = new Connection(rpcUrl, "confirmed");
  const balance = await connection.getBalance(fromKeypair.publicKey);

  if (balance === 0) {
    console.log(`${networkLabel}: no SOL to transfer.`);
    return null;
  }

  const lamports = balance - TRANSFER_FEE_LAMPORTS;
  if (lamports <= 0) {
    console.log(
      `${networkLabel}: balance too low to cover transfer fees (${(balance / 1e9).toFixed(9)} SOL).`
    );
    return null;
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: fromKeypair.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: new PublicKey(toPublicKey),
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    fromKeypair,
  ]);

  console.log(
    `${networkLabel}: transferred ${(lamports / 1e9).toFixed(9)} SOL to ${toPublicKey}`
  );
  console.log(`${networkLabel}: signature ${signature}`);
  return signature;
}

async function rotateFunds(oldKeypair, newPublicKey, env) {
  const mainnetRpc = env.MAINNET_RPC_URL || DEFAULT_MAINNET_RPC;
  const devnetRpc = env.SOLANA_RPC_URL || DEFAULT_DEVNET_RPC;

  console.log(`Rotating funds from ${oldKeypair.publicKey.toBase58()}...`);

  await transferAllSol(oldKeypair, newPublicKey, mainnetRpc, "Mainnet");
  await transferAllSol(oldKeypair, newPublicKey, devnetRpc, "Devnet");
}

function persistKeypair(keypair, env, { clearProgramId = false } = {}) {
  const secretKeyJson = JSON.stringify(Array.from(keypair.secretKey));

  ensureGitignored(KEYPAIR_FILENAME);
  fs.writeFileSync(KEYPAIR_PATH, secretKeyJson);
  writeEnv({
    DEPLOYER_PUBLIC_KEY: keypair.publicKey.toBase58(),
    DEPLOYER_SECRET_KEY: secretKeyJson,
    KEYPAIR_PATH: KEYPAIR_FILENAME,
    SOLANA_RPC_URL: env.SOLANA_RPC_URL || DEFAULT_DEVNET_RPC,
    MAINNET_RPC_URL: env.MAINNET_RPC_URL || DEFAULT_MAINNET_RPC,
    PROGRAM_ID: clearProgramId ? "" : env.PROGRAM_ID || "",
  });
}

async function main() {
  const existing = loadEnv();
  const hasExistingKey = Boolean(
    existing.DEPLOYER_PUBLIC_KEY || loadExistingKeypair(existing)
  );

  if (hasExistingKey && !force && !rotate) {
    console.log("Deployer key already exists.");
    console.log(`Address: ${existing.DEPLOYER_PUBLIC_KEY}`);
    console.log("Use --force to overwrite without transferring funds.");
    console.log("Use --rotate to generate a new key and move funds.");
    process.exit(0);
  }

  if (rotate) {
    const oldKeypair = loadExistingKeypair(existing);
    if (!oldKeypair) {
      console.error("No existing key found to rotate from.");
      process.exit(1);
    }

    const newKeypair = Keypair.generate();
    const newPublicKey = newKeypair.publicKey.toBase58();

    console.log(`New address: ${newPublicKey}`);
    await rotateFunds(oldKeypair, newPublicKey, existing);
    persistKeypair(newKeypair, existing, { clearProgramId: true });

    console.log("Rotated deployer keypair.");
    console.log(`Saved to: ${ENV_PATH}`);
    console.log(`Keypair file: ${KEYPAIR_PATH}`);
    return;
  }

  const newKeypair = Keypair.generate();
  persistKeypair(newKeypair, existing, { clearProgramId: force });

  console.log(force ? "Overwrote deployer keypair." : "Generated deployer keypair.");
  console.log(`Address: ${newKeypair.publicKey.toBase58()}`);
  console.log(`Saved to: ${ENV_PATH}`);
  console.log(`Keypair file: ${KEYPAIR_PATH}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
