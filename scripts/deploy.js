const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const cluster = process.argv[2];
if (!cluster) {
  console.error("Usage: node deploy.js <devnet|mainnet-beta>");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const KEYPAIR_PATH = path.join(ROOT, process.env.KEYPAIR_PATH || "deployer-keypair.json");
const PROGRAM_SO = path.join(ROOT, "packages", "program", "target", "deploy", "hello_world.so");

if (!fs.existsSync(KEYPAIR_PATH)) {
  console.error("Missing deployer keypair. Run: npm run generate-key");
  process.exit(1);
}

if (!fs.existsSync(PROGRAM_SO)) {
  console.error("Missing program binary. Run: npm run build");
  process.exit(1);
}

const rpcUrl =
  cluster === "devnet"
    ? process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com"
    : process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";

console.log(`Deploying to ${cluster}...`);
console.log(`RPC: ${rpcUrl}`);
console.log(`Payer: ${process.env.DEPLOYER_PUBLIC_KEY}`);

execSync(`solana config set --url ${rpcUrl}`, { stdio: "inherit" });
execSync(`solana config set --keypair "${KEYPAIR_PATH}"`, { stdio: "inherit" });

const output = execSync(
  `solana program deploy "${PROGRAM_SO}" --output json`,
  { encoding: "utf8" }
);

const result = JSON.parse(output);
const programId = result.programId;

console.log(`Program deployed: ${programId}`);

const envPath = path.join(ROOT, ".env");
let envContent = fs.readFileSync(envPath, "utf8");
if (/^PROGRAM_ID=.*$/m.test(envContent)) {
  envContent = envContent.replace(/^PROGRAM_ID=.*$/m, `PROGRAM_ID=${programId}`);
} else {
  envContent += `\nPROGRAM_ID=${programId}\n`;
}
fs.writeFileSync(envPath, envContent);

console.log(`Updated .env with PROGRAM_ID=${programId}`);
