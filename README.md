# Hello World on Solana

An educational starter project for **Solana beginners**. It walks through the core workflow of building and deploying an on-chain program: writing Rust code, compiling it to a Solana binary, managing a deployer wallet, and publishing to devnet or mainnet.

This repo intentionally keeps things small. There is no Anchor framework, no custom instructions, and no client app—just enough to understand how the pieces fit together before moving on to more advanced tooling.

## What you'll learn

- How a minimal Solana program is structured in Rust
- How programs are compiled with `cargo build-sbf`
- How deployer keypairs work and why you must keep them secret
- How to deploy a program with the Solana CLI
- The difference between devnet (free test SOL) and mainnet (real SOL)

## Project structure

```
solana-test/
├── packages/program/          # On-chain program (Rust)
│   ├── src/lib.rs             # Program logic
│   └── Cargo.toml
├── scripts/
│   ├── generate-key.js        # Create / rotate deployer wallet
│   └── deploy.js              # Build output → Solana cluster
├── .env                       # Wallet + RPC config (gitignored)
├── deployer-keypair.json      # Keypair file (gitignored)
└── package.json               # npm scripts for the monorepo
```

### The on-chain program

The program lives in `packages/program/src/lib.rs`. It uses Solana's `entrypoint!` macro to register a single handler. When any transaction invokes this program, it logs `"Hello, world!"` to the program log and returns success:

```rust
entrypoint!(process_instruction);

pub fn process_instruction(...) -> ProgramResult {
    msg!("Hello, world!");
    Ok(())
}
```

That is the entire program. Real programs add account validation, instruction parsing, and state changes—but every Solana program starts with this same entrypoint pattern.

### Key generation script

`scripts/generate-key.js` creates the **deployer wallet** used to pay for deployment. It:

1. Generates a new Ed25519 keypair (or loads an existing one)
2. Writes the public key and secret key to `.env`
3. Saves the keypair JSON to `deployer-keypair.json`
4. Ensures sensitive files are listed in `.gitignore`

**Flags:**

| Command | What it does |
|---------|--------------|
| `npm run key:generate` | Create a keypair if none exists |
| `npm run key:force` | Overwrite the existing keypair (no fund transfer) |
| `npm run key:rotate` | Generate a new key and move remaining SOL from the old key on devnet + mainnet |

Never commit `.env` or `*-keypair.json`. They contain your private key.

### Deploy script

`scripts/deploy.js` uses the Solana CLI to upload the compiled `.so` binary:

1. Points the CLI at your RPC URL and keypair (from `.env`)
2. Runs `solana program deploy` against `packages/program/target/deploy/hello_world.so`
3. Writes the returned **Program ID** back into `.env` as `PROGRAM_ID`

The Program ID is the program's permanent address on that cluster. You need it whenever a client or another program wants to call yours.

## Prerequisites

Install these before getting started:

| Tool | Purpose |
|------|---------|
| [Rust](https://rustup.rs/) | Compiles the on-chain program |
| [Solana CLI](https://solana.com/docs/intro/installation) | Builds SBF binaries and deploys programs |
| [Node.js](https://nodejs.org/) (v18+) | Runs the helper scripts |

After installing the Solana CLI, verify everything is available:

```bash
rustc --version
solana --version
node --version
```

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Generate a deployer wallet

```bash
npm run key:generate
```

This prints your new public address. Copy it—you'll need it to receive SOL.

### 3. Fund the wallet on devnet

Devnet SOL is free and meant for testing. Request an airdrop:

```bash
solana config set --url devnet
solana airdrop 2 <YOUR_PUBLIC_KEY>
```

Or use the [Solana faucet](https://faucet.solana.com/).

Deploying a program typically costs a few SOL in rent (refundable if you close the program later). Two devnet SOL is plenty for this tutorial.

### 4. Build the program

```bash
npm run build
```

This runs `cargo build-sbf` inside `packages/program/`, producing `hello_world.so` in the `target/deploy/` folder.

### 5. Deploy to devnet

```bash
npm run deploy:devnet
```

On success you'll see a Program ID and `.env` will be updated automatically.

### 6. (Optional) Deploy to mainnet

```bash
npm run deploy:mainnet
```

Mainnet uses real SOL. Only do this once you understand the costs and have funded your deployer wallet on mainnet.

## Environment variables

Copy `.env.example` to `.env` (or let `key:generate` create it):

| Variable | Description |
|----------|-------------|
| `DEPLOYER_PUBLIC_KEY` | Your wallet's public address |
| `DEPLOYER_SECRET_KEY` | Secret key as a JSON byte array (keep private) |
| `KEYPAIR_PATH` | Path to the keypair JSON file |
| `SOLANA_RPC_URL` | Devnet RPC endpoint |
| `MAINNET_RPC_URL` | Mainnet RPC endpoint |
| `PROGRAM_ID` | Set automatically after deploy |

For production workloads, use a dedicated RPC provider (Helius, QuickNode, etc.) instead of the public endpoints.

## How deployment works (under the hood)

```
┌─────────────┐     cargo build-sbf      ┌──────────────┐
│   lib.rs    │ ───────────────────────► │hello_world.so│
│   (Rust)    │                          │ (BPF binary) │
└─────────────┘                          └──────┬───────┘
                                                │
                     solana program deploy      │
                     (signed by deployer)       ▼
                                        ┌───────────────┐
                                        │ Solana cluster│
                                        │ (devnet/main) │
                                        └───────────────┘
```

1. **Compile** — Rust source is compiled to Solana Bytecode Format (SBF), a restricted environment that runs inside the Solana runtime.
2. **Upload** — The CLI sends the binary in chunks. Your deployer wallet pays rent to store the program account.
3. **Program ID** — Solana assigns (or you can specify) a public key that becomes the program's address. Clients reference this ID to invoke your program.

## npm scripts reference

| Script | Description |
|--------|-------------|
| `npm run key:generate` | Create deployer keypair + `.env` |
| `npm run key:force` | Regenerate keypair without rotating funds |
| `npm run key:rotate` | New keypair + transfer SOL from old wallet |
| `npm run build` | Compile the Rust program |
| `npm run deploy:devnet` | Deploy to Solana devnet |
| `npm run deploy:mainnet` | Deploy to Solana mainnet |

## Next steps for beginners

Once this project makes sense, try:

1. **Read the program logs** — Invoke your deployed program and inspect logs with `solana logs` or an explorer ([Solana Explorer](https://explorer.solana.com/?cluster=devnet)).
2. **Add an instruction** — Parse `instruction_data` in `process_instruction` to handle different commands.
3. **Learn Anchor** — [Anchor](https://www.anchor-lang.com/) is the standard framework for Solana programs; it handles boilerplate you'd otherwise write by hand.
4. **Build a client** — Use `@solana/web3.js` to send transactions that call your program from JavaScript or TypeScript.

## Security reminders

- Treat devnet keys as practice, but still avoid sharing them publicly.
- Never commit `.env`, `deployer-keypair.json`, or any file containing a secret key.
- Mainnet keys control real funds. Use a hardware wallet or secure key management for anything beyond throwaway tutorials.

## License

Educational use. Adapt and experiment freely while learning Solana.
