"use client"
import { useState } from "react"
import ArcLayout from "@/components/ArcLayout"

/* ═══════════════════════════════════════════════════════════
   All code strings — verified against the official arc-node
   repo (github.com/circlefin/arc-node) README, Makefile,
   docs/installation.md, and docs/running-an-arc-node.md
═══════════════════════════════════════════════════════════ */

// ── Rust ─────────────────────────────────────────────────
const CHECK_RUST         = `rustc --version`
const INSTALL_RUST_UNIX  = `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# When prompted, press Enter to accept defaults
source ~/.cargo/env`
// Windows: download rustup-init.exe (no curl needed)

// ── Docker ───────────────────────────────────────────────
const CHECK_DOCKER = `docker --version && docker compose version`

// Ubuntu: Official Docker apt repo — avoids the containerd conflict
const INSTALL_DOCKER_UBUNTU = `# Remove any conflicting packages first
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y $pkg 2>/dev/null || true
done

# Add Docker's official GPG key and apt repo
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \\
  https://download.docker.com/linux/ubuntu \\
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \\
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow running docker without sudo
sudo usermod -aG docker $USER
newgrp docker`

// ── Node.js ───────────────────────────────────────────────
const CHECK_NODE = `node --version
# Must be an EVEN number: v18, v20, or v22
# Odd versions (v17, v19, v21, v23, v25) will break the build`

const INSTALL_NVM_UNIX = `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
# Close your terminal and open a new one, then:
nvm install 20
nvm use 20`

// ── Foundry ───────────────────────────────────────────────
const CHECK_FOUNDRY   = `forge --version`
const INSTALL_FOUNDRY = `curl -L https://foundry.paradigm.xyz | bash
# Close your terminal and open a new one, then:
foundryup`

// ── Protobuf ──────────────────────────────────────────────
const CHECK_PROTO         = `protoc --version`
const INSTALL_PROTO_MAC   = `brew install protobuf`
const INSTALL_PROTO_LINUX = `sudo apt-get install -y protobuf-compiler`

// ── Buf ───────────────────────────────────────────────────
const CHECK_BUF        = `buf --version`
const INSTALL_BUF_MAC  = `brew install bufbuild/buf/buf`
const INSTALL_BUF_LINUX= `sudo curl -sSL https://github.com/bufbuild/buf/releases/latest/download/buf-Linux-x86_64 \
  -o /usr/local/bin/buf
sudo chmod +x /usr/local/bin/buf`

// ── Yarn ──────────────────────────────────────────────────
const CHECK_YARN   = `yarn --version`
const INSTALL_YARN = `npm install -g yarn`

// After clone, install Hardhat + TypeScript (they are project dependencies)
const YARN_INSTALL = `yarn install`

// ── Local testnet commands ────────────────────────────────
const LOCAL_CLONE  = `git clone https://github.com/circlefin/arc-node.git
cd arc-node`
const LOCAL_BUILD  = `make build`
const LOCAL_START  = `make testnet`
const LOCAL_DOWN   = `make testnet-down`
const LOCAL_CLEAN  = `make testnet-clean`

// ── Full node — installation ──────────────────────────────
const FULL_CLONE   = `git clone https://github.com/circlefin/arc-node.git
cd arc-node
git checkout v0.6.0`   // pin to latest released version

const FULL_DEPS_UBUNTU = `sudo apt-get install -y libclang-dev pkg-config build-essential`
const FULL_DEPS_MAC    = `brew install llvm pkg-config`

const FULL_BUILD = `cargo install --path crates/node
cargo install --path crates/malachite-app
cargo install --path crates/snapshots`

const FULL_VERIFY_BINS = `arc-node-execution --version
arc-node-consensus --version
arc-snapshots --version`

// ── Full node — setup ─────────────────────────────────────
const FULL_DIRS = `ARC_HOME="$HOME/.arc"
mkdir -p $ARC_HOME/execution $ARC_HOME/consensus

# Linux only — create runtime socket directory
sudo install -d -o $USER /run/arc`

const FULL_DIRS_MAC = `ARC_HOME="$HOME/.arc"
mkdir -p $ARC_HOME/execution $ARC_HOME/consensus $ARC_HOME/run`

const FULL_SNAPSHOT = `arc-snapshots download \\
  --chain=arc-testnet \\
  --execution-path "$HOME/.arc/execution" \\
  --consensus-path "$HOME/.arc/consensus"`

const FULL_INIT_CL = `arc-node-consensus init --home "$HOME/.arc/consensus"`

// ── Full node — run commands ──────────────────────────────
const FULL_RUN_EL_LINUX = `arc-node-execution node \\
  --chain arc-testnet \\
  --datadir $HOME/.arc/execution \\
  --full \\
  --ipcpath /run/arc/reth.ipc \\
  --auth-ipc --auth-ipc.path /run/arc/auth.ipc \\
  --http --http.addr 127.0.0.1 --http.port 8545 \\
  --http.api eth,net,web3,txpool,trace,debug \\
  --rpc.forwarder https://rpc.quicknode.testnet.arc.network/ \\
  --metrics 127.0.0.1:9001 \\
  --disable-discovery \\
  --enable-arc-rpc`

const FULL_RUN_EL_MAC = `arc-node-execution node \\
  --chain arc-testnet \\
  --datadir $HOME/.arc/execution \\
  --full \\
  --ipcpath $HOME/.arc/run/reth.ipc \\
  --auth-ipc --auth-ipc.path $HOME/.arc/run/auth.ipc \\
  --http --http.addr 127.0.0.1 --http.port 8545 \\
  --http.api eth,net,web3,txpool,trace,debug \\
  --rpc.forwarder https://rpc.quicknode.testnet.arc.network/ \\
  --metrics 127.0.0.1:9001 \\
  --disable-discovery \\
  --enable-arc-rpc`

const FULL_RUN_CL_LINUX = `arc-node-consensus start \\
  --home $HOME/.arc/consensus \\
  --full \\
  --eth-socket /run/arc/reth.ipc \\
  --execution-socket /run/arc/auth.ipc \\
  --rpc.addr 127.0.0.1:31000 \\
  --follow \\
  --follow.endpoint https://rpc.drpc.testnet.arc.network,wss=rpc.drpc.testnet.arc.network \\
  --follow.endpoint https://rpc.quicknode.testnet.arc.network,wss=rpc.quicknode.testnet.arc.network \\
  --follow.endpoint https://rpc.blockdaemon.testnet.arc.network,wss=rpc.blockdaemon.testnet.arc.network \\
  --metrics 127.0.0.1:29000`

const FULL_RUN_CL_MAC = `arc-node-consensus start \\
  --home $HOME/.arc/consensus \\
  --full \\
  --eth-socket $HOME/.arc/run/reth.ipc \\
  --execution-socket $HOME/.arc/run/auth.ipc \\
  --rpc.addr 127.0.0.1:31000 \\
  --follow \\
  --follow.endpoint https://rpc.drpc.testnet.arc.network,wss=rpc.drpc.testnet.arc.network \\
  --follow.endpoint https://rpc.quicknode.testnet.arc.network,wss=rpc.quicknode.testnet.arc.network \\
  --follow.endpoint https://rpc.blockdaemon.testnet.arc.network,wss=rpc.blockdaemon.testnet.arc.network \\
  --metrics 127.0.0.1:29000`

const FULL_VERIFY = `curl -s -X POST http://localhost:8545 \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
# Returns the current block number your node has reached`

const FULL_LOGS = `# Check execution layer logs (Linux systemd)
sudo journalctl -u arc-execution -f

# Check consensus layer logs (Linux systemd)
sudo journalctl -u arc-consensus -f

# Check sync status (cast is part of Foundry)
cast block-number --rpc-url http://localhost:8545`

/* ═══════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════ */
export default function NodeGuidePage() {
  const c = useColors()
  return (
    <ArcLayout active="start">
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "44px 20px 100px", fontFamily: "'Geist',system-ui,sans-serif" }}>
        <NodeGuideSection c={c} />
      </div>
    </ArcLayout>
  )
}

export function NodeGuideSection({ c }: { c: Colors }) {
  const [openLocal, setOpenLocal] = useState(false)
  const [openFull,  setOpenFull]  = useState(false)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "36px" }}>
        <div style={{ fontSize: "10px", fontFamily: c.mono, color: c.t3, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "10px" }}>Arc Node Guide</div>
        <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, letterSpacing: "-0.04em", color: c.t1, margin: "0 0 14px", lineHeight: 1.1 }}>
          Run an Arc Node
        </h2>
        <p style={{ fontSize: "13px", color: c.t2, lineHeight: 1.9, fontWeight: 300, maxWidth: "600px", margin: "0 0 10px" }}>
          Arc runs two processes simultaneously: an <strong style={{ color: c.t1 }}>Execution Layer</strong> (handles transactions
          and smart contracts) and a <strong style={{ color: c.t1 }}>Consensus Layer</strong> (handles block ordering and finality).
          Pick the path that fits your goal.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
          {[
            { label: "Open source — Apache 2.0", col: c.usdc, bg: "rgba(0,184,122,0.06)", bdr: "rgba(0,184,122,0.15)" },
            { label: "EVM-compatible",            col: c.link, bg: "rgba(26,86,255,0.06)", bdr: "rgba(26,86,255,0.15)" },
            { label: "circlefin/arc-node",        col: c.link, bg: "rgba(26,86,255,0.06)", bdr: "rgba(26,86,255,0.15)" },
          ].map(b => (
            <span key={b.label} style={{ padding: "7px 12px", background: b.bg, border: "1px solid " + b.bdr, borderRadius: "8px", fontSize: "11px", fontFamily: c.mono, color: b.col }}>{b.label}</span>
          ))}
        </div>
      </div>

      <PathCard open={openLocal} onToggle={() => setOpenLocal(v => !v)}
        title="Local Testnet" badge="Best for developers" badgeCol={c.usdc}
        sub="Run a complete Arc network on your machine — no cloud, no hardware requirements"
        c={c}>
        <LocalTestnetGuide c={c} />
      </PathCard>

      <PathCard open={openFull} onToggle={() => setOpenFull(v => !v)}
        title="Full Node" badge="64 GB RAM · 1 TB NVMe required" badgeCol={c.red}
        sub="Sync the live Arc Testnet and participate in consensus"
        c={c}>
        <FullNodeGuide c={c} />
      </PathCard>

      <div style={{ marginTop: "24px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {[
          ["https://github.com/circlefin/arc-node", "arc-node on GitHub →"],
          ["https://hackerone.com/circlefin",        "Bug Bounty (HackerOne) →"],
          ["https://discord.gg/buildonarc",          "Need help? Arc Discord →"],
        ].map(([href, label]) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", height: "34px", padding: "0 16px", color: c.t2, fontSize: "12px", fontFamily: c.mono, border: "1px solid " + c.bdr, borderRadius: "8px", textDecoration: "none" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(26,86,255,0.4)"; e.currentTarget.style.color = c.link }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = c.bdr; e.currentTarget.style.color = c.t2 }}>
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   LOCAL TESTNET GUIDE
═══════════════════════════════════════════════════════════ */
function LocalTestnetGuide({ c }: { c: Colors }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>

      <InfoBox c={c}>
        <strong style={{ color: c.t1 }}>What you get:</strong> five Execution nodes + five Consensus nodes running entirely on your machine,
        a Blockscout block explorer, and a Grafana metrics dashboard — all launched with one command.
        No real tokens needed. Ideal for building and testing contracts before deploying to the live testnet.
      </InfoBox>

      {/* Step 1 — Open terminal */}
      <Step n="1" title="Open a terminal" c={c}>
        <P c={c}>A terminal is the window where you type commands. Pick your OS:</P>
        <TabBlock c={c} tabs={[
          {
            label: "macOS",
            content: <>
              <P c={c}>Press <Key c={c}>Cmd + Space</Key>, type <Key c={c}>Terminal</Key>, press <Key c={c}>Enter</Key>.</P>
              <P c={c}>If you do not have Homebrew (a package manager for macOS), install it first — most install commands below use it:</P>
              <Copy id="brew" code={`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`} c={c} />
            </>
          },
          {
            label: "Linux (Ubuntu)",
            content: <>
              <P c={c}>Press <Key c={c}>Ctrl + Alt + T</Key>, or right-click the desktop and choose Open Terminal.</P>
              <P c={c}>Install base packages first:</P>
              <Copy id="linux-base" code={`sudo apt-get update && sudo apt-get install -y git curl build-essential`} c={c} />
            </>
          },
          {
            label: "Windows",
            content: <>
              <P c={c}>Arc node build scripts require a Linux environment. On Windows you need <strong style={{ color: c.t1 }}>WSL 2</strong> (Windows Subsystem for Linux).</P>
              <P c={c}>Open PowerShell as Administrator (<Key c={c}>Windows key</Key> → type <Key c={c}>PowerShell</Key> → right-click → Run as Administrator) and run:</P>
              <Copy id="wsl" code={`wsl --install`} c={c} />
              <Warn c={c}>Restart your PC when prompted. Then open <strong style={{ color: c.t1 }}>Ubuntu</strong> from the Start menu. All remaining commands in this guide run inside the Ubuntu terminal, not PowerShell.</Warn>
            </>
          },
        ]} />
      </Step>

      {/* Step 2 — Prerequisites */}
      <Step n="2" title="Install prerequisites" c={c}>
        <P c={c}>You need these seven tools. Use the "check" command to see if you already have each one — if you get a version number back, skip to the next tool.</P>

        <PrereqBlock c={c} title="Rust" what="Compiles the Arc node binary. A programming language runtime — you do not need to write Rust."
          checkCode={CHECK_RUST} checkNote="Any version works. If you see a version number, Rust is already installed."
          installTabs={[{ label: "macOS / Linux / WSL (Ubuntu)", code: INSTALL_RUST_UNIX, note: 'When the installer asks "Proceed with installation?", press Enter to accept defaults. The second line activates Rust in your current terminal session.' }]}
          verifyCode={`rustc --version\n# Should print something like: rustc 1.78.0 (...)`}
        />

        <PrereqBlock c={c} title="Docker" what="Runs the five-node network in isolated containers on your machine. Must be open and running in the background."
          checkCode={CHECK_DOCKER} checkNote="If both lines return a version number, Docker is installed and ready."
          installTabs={[
            { label: "macOS", code: `# Download Docker Desktop from:\n# https://www.docker.com/products/docker-desktop/\n#\n# Open the .dmg file, drag Docker to Applications, then open it.\n# You will see a whale icon in the menu bar when it is running.`, note: "Docker Desktop must be running before you start the testnet." },
            { label: "Ubuntu / Linux", code: INSTALL_DOCKER_UBUNTU, note: "This uses Docker's official apt repository, which avoids package conflicts with Ubuntu's built-in containerd." },
            { label: "Windows (WSL)", code: `# Download Docker Desktop for Windows from:\n# https://www.docker.com/products/docker-desktop/\n#\n# During install, make sure "Use WSL 2 based engine" is checked.\n# After installing, open Docker Desktop settings:\n# Resources → WSL Integration → enable your Ubuntu distro.`, note: "Docker Desktop on Windows handles the WSL integration automatically. You do not need to install Docker separately inside WSL." },
          ]}
          verifyCode={`docker compose version\n# Should print: Docker Compose version v2.x.x`}
        />

        <PrereqBlock c={c} title="Node.js (even version — v18, v20, or v22)" what="Runs the contract deployment scripts. Odd version numbers (v17, v19, v21, v23, v25) silently break the build."
          checkCode={CHECK_NODE} checkNote="Even version? You are good. Odd version or not installed? Use nvm below to install a correct version."
          installTabs={[{ label: "macOS / Linux / WSL (Ubuntu)", code: INSTALL_NVM_UNIX, note: "nvm is a Node version manager — it lets you switch Node versions safely. After running the curl command, close your terminal completely and open a new one before running nvm install." }]}
          verifyCode={`node --version\n# Must show v18.x.x, v20.x.x, or v22.x.x`}
        />

        <PrereqBlock c={c} title="Foundry" what="A Solidity toolkit. The testnet uses it to compile and deploy the initial system contracts on startup. Does not work on Windows without WSL."
          checkCode={CHECK_FOUNDRY} checkNote="If you see a version, Foundry is installed."
          installTabs={[{ label: "macOS / Linux / WSL (Ubuntu)", code: INSTALL_FOUNDRY, note: "The first command installs foundryup (a version manager). You must close your terminal completely and open a new one before running foundryup — otherwise it will say command not found." }]}
          verifyCode={`forge --version\n# Should print something like: forge 0.2.0 (...)`}
        />

        <PrereqBlock c={c} title="Protobuf compiler" what="Generates the communication interface code between the Execution and Consensus layers. You do not write Protobuf yourself."
          checkCode={CHECK_PROTO} checkNote="If you see a version number, you are good."
          installTabs={[
            { label: "macOS", code: INSTALL_PROTO_MAC, note: "" },
            { label: "Ubuntu / Linux / WSL", code: INSTALL_PROTO_LINUX, note: "" },
          ]}
          verifyCode={`protoc --version\n# Should print: libprotoc 3.x.x or higher`}
        />

        <PrereqBlock c={c} title="Buf" what="A Protobuf toolchain. The Consensus Layer uses it to auto-generate its interface code."
          checkCode={CHECK_BUF} checkNote="If you see a version number, you are good."
          installTabs={[
            { label: "macOS", code: INSTALL_BUF_MAC, note: "" },
            { label: "Ubuntu / Linux / WSL", code: INSTALL_BUF_LINUX, note: "The sudo is required to write to /usr/local/bin." },
          ]}
          verifyCode={`buf --version`}
        />

        <PrereqBlock c={c} title="Yarn" what="A JavaScript package manager used to install Hardhat and TypeScript — both required by the testnet scripts."
          checkCode={CHECK_YARN} checkNote="If you see a version number, you are good."
          installTabs={[{ label: "macOS / Linux / WSL (Ubuntu)", code: INSTALL_YARN, note: "Node.js must be installed first." }]}
          verifyCode={`yarn --version`}
        />

        <Tip c={c}>All seven tools must be installed before moving to Step 3. Missing even one will cause the build to fail with a confusing error that does not always tell you what is missing.</Tip>
      </Step>

      {/* Step 3 — Clone */}
      <Step n="3" title="Download the Arc node code" c={c}>
        <P c={c}>
          This downloads the Arc node source code from GitHub into a folder called <Code c={c}>arc-node</Code>,
          then moves you inside it. Run this in whatever folder you want the project to live.
        </P>
        <Copy id="l-clone" code={LOCAL_CLONE} c={c} />
      </Step>

      {/* Step 4 — Install project dependencies */}
      <Step n="4" title="Install project dependencies" c={c}>
        <P c={c}>
          This installs Hardhat, TypeScript, and other JavaScript dependencies the testnet scripts need.
          Run it once from inside the <Code c={c}>arc-node</Code> folder.
        </P>
        <Copy id="l-yarn" code={YARN_INSTALL} c={c} />
      </Step>

      {/* Step 5 — Build */}
      <Step n="5" title="Build the node" c={c}>
        <P c={c}>
          This compiles the Arc node binary from source. Rust has to compile hundreds of packages on the first run —
          <strong style={{ color: c.t1 }}> expect 15–25 minutes</strong>. Your fans will spin. This is normal. Do not close the terminal.
        </P>
        <Copy id="l-build" code={LOCAL_BUILD} c={c} />
        <Tip c={c}>When it finishes you will see <Code c={c}>Finished release [optimized] target(s)</Code>. That means success.</Tip>
        <Warn c={c}>If the build fails with a "command not found" or "not installed" error, go back to Step 2 and check every prerequisite again.</Warn>
      </Step>

      {/* Step 6 — Start testnet */}
      <Step n="6" title="Start the local testnet" c={c}>
        <P c={c}>
          One command launches everything. The first run pulls Docker images (~2–5 minutes depending on your internet).
          After that, the network starts in seconds.
        </P>
        <Copy id="l-start" code={LOCAL_START} c={c} />
        <Tip c={c}>Wait about 30 seconds after startup before sending transactions. The consensus layer needs time to elect a block proposer and produce the first block.</Tip>

        <div style={{ marginTop: "20px" }}>
          <Label c={c}>Services now running on your machine</Label>
          <Table c={c} cols={["Service", "URL", "What it does"]} rows={[
            ["Blockscout Explorer",   "http://localhost:4000", "Browse blocks, transactions, and contracts"],
            ["Grafana Dashboard",     "http://localhost:3000", "Node metrics — login: admin / admin"],
            ["Prometheus",            "http://localhost:9090", "Raw metrics data"],
            ["EL RPC (node 1)",       "http://localhost:8545", "JSON-RPC — point your wallet or tools here"],
            ["EL WebSocket (node 1)", "ws://localhost:8546",   "WebSocket endpoint for subscriptions"],
          ]} />
        </div>

        <div style={{ marginTop: "20px" }}>
          <Label c={c}>Connect your wallet to the local network</Label>
          <P c={c}>In Rabby or MetaMask, go to Settings → Networks → Add Network and enter:</P>
          <Table c={c} cols={["Field", "Value"]} rows={[
            ["Network name", "Arc Local"],
            ["RPC URL",      "http://localhost:8545"],
            ["Chain ID",     "5042002"],
            ["Symbol",       "USDC"],
          ]} />
          <Tip c={c}>Pre-funded test wallets are in <Code c={c}>config/testnet/funded_accounts.json</Code>. Import one of those private keys to get test tokens immediately — no faucet needed.</Tip>
        </div>
      </Step>

      {/* Step 7 — Stop / reset */}
      <Step n="7" title="Stop and reset" c={c}>
        <P c={c}>Stop the network when you are done. Your chain data is preserved and will be there next time you run <Code c={c}>make testnet</Code>.</P>
        <Copy id="l-down" code={LOCAL_DOWN} c={c} />
        <P c={c} extra="16px 0 8px">To wipe all data and start from block zero:</P>
        <Copy id="l-clean" code={LOCAL_CLEAN} c={c} />
        <Warn c={c}><Code c={c}>make testnet-clean</Code> deletes all chain history and deployed contracts. Use it only when you want a completely fresh environment.</Warn>
      </Step>

    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   FULL NODE GUIDE
═══════════════════════════════════════════════════════════ */
function FullNodeGuide({ c }: { c: Colors }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>

      <InfoBox c={c}>
        <strong style={{ color: c.t1 }}>What this means:</strong> you sync the live Arc Testnet from a snapshot and run both
        node processes continuously. This is infrastructure work — not for development. You need a dedicated machine or server.
        The two binaries (<Code c={c}>arc-node-execution</Code> and <Code c={c}>arc-node-consensus</Code>) must both stay running at all times.
      </InfoBox>

      {/* Step 1 — Hardware */}
      <Step n="1" title="Check your hardware" c={c}>
        <P c={c}>Both node processes run at the same time and share your machine's resources. These are the verified minimum specs from the official documentation:</P>
        <Table c={c} cols={["Spec", "Minimum", "Why"]} rows={[
          ["CPU",     "Higher clock speed over core count", "Block validation is single-threaded per block"],
          ["RAM",     "64 GB",                              "EL + CL run in parallel — less causes OOM crashes"],
          ["Storage", "1 TB NVMe SSD (TLC recommended)",   "Must be NVMe — HDD or SATA SSD cannot keep up with I/O"],
          ["Network", "24 Mbps stable",                    "Needs consistent throughput for block propagation"],
          ["OS",      "Ubuntu 22.04 or macOS 14+",         "Windows not officially supported"],
        ]} />
        <Warn c={c}>Running below spec — especially under 64 GB RAM — will cause your node to crash under load. Do not run this on a shared VPS without confirming the memory allocation.</Warn>
      </Step>

      {/* Step 2 — Open terminal */}
      <Step n="2" title="Open a terminal" c={c}>
        <TabBlock c={c} tabs={[
          { label: "macOS", content: <P c={c}>Press <Key c={c}>Cmd + Space</Key>, type <Key c={c}>Terminal</Key>, press <Key c={c}>Enter</Key>.</P> },
          { label: "Ubuntu", content: <><P c={c}>Press <Key c={c}>Ctrl + Alt + T</Key>. Then install required system packages:</P><Copy id="fn-base" code={`sudo apt-get update && sudo apt-get install -y git curl`} c={c} /></> },
          { label: "Remote server (SSH)", content: <><P c={c}>Connect to your server from your local machine:</P><Copy id="fn-ssh" code={`ssh your-username@your-server-ip`} c={c} /><P c={c} extra="10px 0 0">All remaining commands run on the server over SSH.</P></> },
        ]} />
      </Step>

      {/* Step 3 — Prerequisites */}
      <Step n="3" title="Install prerequisites" c={c}>
        <P c={c}>The full node only needs Rust — everything is compiled with Cargo. No Go, no Node.js, no Docker.</P>

        <div style={{ marginBottom: "12px" }}>
          <Label c={c}>OS build dependencies</Label>
          <TabBlock c={c} tabs={[
            { label: "Ubuntu / Linux", content: <Copy id="fn-deps-linux" code={FULL_DEPS_UBUNTU} c={c} /> },
            { label: "macOS", content: <Copy id="fn-deps-mac" code={FULL_DEPS_MAC} c={c} /> },
          ]} />
        </div>

        <PrereqBlock c={c} title="Rust" what="The only language runtime needed. Builds all three node binaries."
          checkCode={CHECK_RUST} checkNote="Any recent version works. If you see a version, skip to Step 4."
          installTabs={[{ label: "macOS / Linux / Ubuntu", code: INSTALL_RUST_UNIX, note: "Accept defaults when prompted. Then run the source command to activate Rust in your current terminal session." }]}
          verifyCode={`rustc --version\n# Should print something like: rustc 1.78.0 (...)`}
        />
      </Step>

      {/* Step 4 — Clone and build */}
      <Step n="4" title="Clone the repo and build the binaries" c={c}>
        <P c={c}>
          Clone the repository and check out the current testnet version (<Code c={c}>v0.6.0</Code>).
          Then build all three node binaries with Cargo. This installs them to <Code c={c}>~/.cargo/bin</Code> so they are available anywhere in your terminal.
          <strong style={{ color: c.t1 }}> Expect 20–40 minutes on first build.</strong>
        </P>
        <Copy id="fn-clone" code={FULL_CLONE} c={c} />
        <P c={c} extra="14px 0 8px">Build and install the three binaries:</P>
        <Copy id="fn-build" code={FULL_BUILD} c={c} />
        <P c={c} extra="14px 0 8px">Verify all three installed correctly:</P>
        <Copy id="fn-verify-bins" code={FULL_VERIFY_BINS} c={c} />
        <Tip c={c}>Each command should print a version number. If any prints "command not found", the build step for that binary failed — check the cargo output for errors.</Tip>
      </Step>

      {/* Step 5 — Create directories */}
      <Step n="5" title="Create data directories" c={c}>
        <P c={c}>
          The node stores its data in <Code c={c}>~/.arc</Code>. Create the folders and the runtime socket directory.
        </P>
        <TabBlock c={c} tabs={[
          { label: "Linux", content: <Copy id="fn-dirs-linux" code={FULL_DIRS} c={c} /> },
          { label: "macOS", content: <Copy id="fn-dirs-mac" code={FULL_DIRS_MAC} c={c} /> },
        ]} />
      </Step>

      {/* Step 6 — Download snapshots */}
      <Step n="6" title="Download chain snapshots" c={c}>
        <P c={c}>
          Syncing from block zero takes days. The <Code c={c}>arc-snapshots</Code> binary downloads both snapshots in one command
          and puts them in the right directories automatically.
        </P>
        <Copy id="fn-snap" code={FULL_SNAPSHOT} c={c} />
        <Table c={c} cols={["Layer", "Compressed", "Extracted"]} rows={[
          ["Execution Layer (EL)", "~68 GB",  "~103 GB"],
          ["Consensus Layer (CL)", "~16 GB",  "~36 GB"],
        ]} />
        <Warn c={c}>Total download is ~84 GB compressed. On a 100 Mbps connection this takes about 2 hours. On a remote server, run this inside <Code c={c}>screen</Code> or <Code c={c}>tmux</Code> so it keeps running if your SSH session drops.</Warn>
      </Step>

      {/* Step 7 — Init consensus */}
      <Step n="7" title="Initialise the Consensus Layer" c={c}>
        <P c={c}>Run this once before starting the consensus node for the first time. It writes configuration files into <Code c={c}>~/.arc/consensus</Code>.</P>
        <Copy id="fn-init" code={FULL_INIT_CL} c={c} />
      </Step>

      {/* Step 8 — Run */}
      <Step n="8" title="Start the node" c={c}>
        <P c={c}>
          Open <strong style={{ color: c.t1 }}>two separate terminal windows</strong> (or two SSH sessions on a remote server).
          Run the Execution Layer in one and the Consensus Layer in the other.
          Both must stay running at the same time — they communicate over a local socket.
        </P>

        <TabBlock c={c} tabs={[
          {
            label: "Linux",
            content: <>
              <div style={{ fontSize: "10px", fontFamily: c.mono, color: c.t3, marginBottom: "6px", letterSpacing: "0.08em" }}>TERMINAL 1 — Execution Layer</div>
              <Copy id="fn-el-linux" code={FULL_RUN_EL_LINUX} c={c} />
              <div style={{ fontSize: "10px", fontFamily: c.mono, color: c.t3, margin: "14px 0 6px", letterSpacing: "0.08em" }}>TERMINAL 2 — Consensus Layer</div>
              <Copy id="fn-cl-linux" code={FULL_RUN_CL_LINUX} c={c} />
            </>
          },
          {
            label: "macOS",
            content: <>
              <div style={{ fontSize: "10px", fontFamily: c.mono, color: c.t3, marginBottom: "6px", letterSpacing: "0.08em" }}>TERMINAL 1 — Execution Layer</div>
              <Copy id="fn-el-mac" code={FULL_RUN_EL_MAC} c={c} />
              <div style={{ fontSize: "10px", fontFamily: c.mono, color: c.t3, margin: "14px 0 6px", letterSpacing: "0.08em" }}>TERMINAL 2 — Consensus Layer</div>
              <Copy id="fn-cl-mac" code={FULL_RUN_CL_MAC} c={c} />
            </>
          },
        ]} />

        <Tip c={c}>On a server, use <Code c={c}>screen</Code> or <Code c={c}>tmux</Code> so both processes keep running after you disconnect. Or set up systemd services — the arc-node docs include ready-to-use service files.</Tip>
        <Warn c={c}>Initial sync from snapshot takes 30–90 minutes. The node is catching up to the chain tip. Watch the Execution Layer logs — you will see block numbers climbing.</Warn>
      </Step>

      {/* Step 9 — Verify */}
      <Step n="9" title="Verify the node is running" c={c}>
        <P c={c}>Open a third terminal and check the current block your node has reached:</P>
        <Copy id="fn-verify" code={FULL_VERIFY} c={c} />
        <P c={c} extra="12px 0 8px">Compare that block number to <a href="https://arclens.xyz" target="_blank" rel="noopener noreferrer" style={{ color: c.link }}>arclens.xyz</a> — the gap shrinks as your node catches up. You can also watch logs live:</P>
        <Copy id="fn-logs" code={FULL_LOGS} c={c} />
      </Step>

      {/* Bug bounty */}
      <Step n="10" title="Found a vulnerability? Report it." c={c}>
        <P c={c}>Arc has an active security bug bounty on HackerOne. If you find an issue while running your node, report it responsibly.</P>
        <a href="https://hackerone.com/circlefin" target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", gap: "16px", padding: "18px 20px", background: "rgba(26,86,255,0.05)", border: "1px solid rgba(26,86,255,0.2)", borderRadius: "12px", textDecoration: "none", alignItems: "flex-start" }}>
          <div style={{ fontSize: "20px", lineHeight: 1, flexShrink: 0, marginTop: "2px" }}>◈</div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: c.t1, marginBottom: "5px" }}>HackerOne — circlefin / arc-node</div>
            <div style={{ fontSize: "12px", color: c.t2, lineHeight: 1.7, fontWeight: 300 }}>Report security vulnerabilities in the arc-node repository. Include reproduction steps and your node version.</div>
            <div style={{ fontSize: "11px", fontFamily: c.mono, color: c.link, marginTop: "8px" }}>hackerone.com/circlefin →</div>
          </div>
        </a>
      </Step>

    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Color system
═══════════════════════════════════════════════════════════ */
type Colors = {
  mono: string; t1: string; t2: string; t3: string; bdr: string
  surf: string; surf2: string; arc: string; usdc: string; link: string; red: string
}
export function useColors(): Colors {
  return {
    mono:  "'DM Mono', monospace",
    t1:    "var(--t1, #e8ecff)",
    t2:    "var(--t2, #6b7da8)",
    t3:    "var(--t3, #2e3a5c)",
    bdr:   "var(--bdr, rgba(255,255,255,0.06))",
    surf:  "var(--surf, #0a0e1a)",
    surf2: "var(--surf2, #0e1224)",
    arc:   "#1a56ff",
    usdc:  "#00b87a",
    link:  "#8aaeff",
    red:   "#e03348",
  }
}

/* ═══════════════════════════════════════════════════════════
   UI primitives
═══════════════════════════════════════════════════════════ */
function PathCard({ open, onToggle, title, sub, badge, badgeCol, children, c }: {
  open: boolean; onToggle: () => void; title: string; sub: string
  badge: string; badgeCol: string; children: React.ReactNode; c: Colors
}) {
  return (
    <div style={{ marginBottom: "14px", border: "1px solid " + (open ? "rgba(26,86,255,0.3)" : c.bdr), borderRadius: "14px", overflow: "hidden", transition: "border-color .2s" }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: open ? "rgba(26,86,255,0.05)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background .2s", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "9px", background: open ? "rgba(26,86,255,0.14)" : "rgba(26,86,255,0.06)", border: "1px solid rgba(26,86,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "16px", color: c.link, fontFamily: c.mono, transition: "all .2s" }}>
            {open ? "▾" : "▸"}
          </div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: c.t1, marginBottom: "4px", letterSpacing: "-0.02em" }}>{title}</div>
            <div style={{ fontSize: "11px", fontFamily: c.mono, color: c.t3, lineHeight: 1.5 }}>{sub}</div>
          </div>
        </div>
        <div style={{ padding: "5px 11px", background: badgeCol + "12", border: "1px solid " + badgeCol + "28", borderRadius: "6px", fontSize: "10px", fontFamily: c.mono, color: badgeCol, flexShrink: 0, whiteSpace: "nowrap" }}>{badge}</div>
      </button>
      {open && <div style={{ padding: "28px 28px 32px", borderTop: "1px solid " + c.bdr }}>{children}</div>}
    </div>
  )
}

function Step({ n, title, children, c }: { n: string; title: string; children: React.ReactNode; c: Colors }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(26,86,255,0.1)", border: "1px solid rgba(26,86,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "11px", fontFamily: c.mono, color: c.link, fontWeight: 800 }}>{n}</div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: c.t1, letterSpacing: "-0.02em" }}>{title}</div>
      </div>
      <div style={{ paddingLeft: "40px" }}>{children}</div>
    </div>
  )
}

function P({ children, c, extra }: { children: React.ReactNode; c: Colors; extra?: string }) {
  return <p style={{ fontSize: "13px", color: c.t2, lineHeight: 1.85, fontWeight: 300, margin: extra || "0 0 12px" }}>{children}</p>
}

function Code({ children, c }: { children: React.ReactNode; c: Colors }) {
  return <code style={{ color: c.link, fontFamily: c.mono, fontSize: "12px" }}>{children}</code>
}

function Label({ children, c }: { children: React.ReactNode; c: Colors }) {
  return <div style={{ fontSize: "10px", fontFamily: c.mono, color: c.t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>{children}</div>
}

function InfoBox({ children, c }: { children: React.ReactNode; c: Colors }) {
  return <div style={{ padding: "14px 18px", background: "rgba(26,86,255,0.05)", border: "1px solid rgba(26,86,255,0.15)", borderRadius: "10px", fontSize: "12px", color: c.t2, lineHeight: 1.9, fontFamily: c.mono }}>{children}</div>
}

function Tip({ children, c }: { children: React.ReactNode; c: Colors }) {
  return <div style={{ margin: "12px 0 4px", padding: "10px 14px", background: c.usdc + "08", border: "1px solid " + c.usdc + "20", borderRadius: "8px", fontSize: "11px", fontFamily: c.mono, color: c.usdc, lineHeight: 1.8 }}><strong>Tip: </strong>{children}</div>
}

function Warn({ children, c }: { children: React.ReactNode; c: Colors }) {
  return <div style={{ margin: "12px 0 4px", padding: "10px 14px", background: c.red + "08", border: "1px solid " + c.red + "20", borderRadius: "8px", fontSize: "11px", fontFamily: c.mono, color: c.red, lineHeight: 1.8 }}><strong>Note: </strong>{children}</div>
}

function Key({ children, c }: { children: React.ReactNode; c: Colors }) {
  return <span style={{ display: "inline-block", padding: "1px 7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px", fontSize: "11px", fontFamily: c.mono, color: c.t1 }}>{children}</span>
}

function Copy({ id, code, c }: { id: string; code: string; c: Colors }) {
  const [ok, setOk] = useState(false)
  return (
    <div style={{ background: "#04060f", border: "1px solid rgba(26,86,255,0.14)", borderRadius: "10px", overflow: "hidden", marginBottom: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <button onClick={() => { navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 2200) }}
          style={{ fontSize: "11px", fontFamily: c.mono, color: ok ? c.usdc : c.t3, background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: "4px", transition: "color .15s", fontWeight: ok ? 700 : 400 }}>
          {ok ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre style={{ padding: "14px 18px", fontSize: "12px", fontFamily: c.mono, color: c.link, lineHeight: 1.75, margin: 0, overflowX: "auto", whiteSpace: "pre" }}>{code}</pre>
    </div>
  )
}

function Table({ rows, cols, c }: { rows: string[][]; cols: string[]; c: Colors }) {
  const w = cols.length === 2 ? ["160px", "1fr"] : cols.length === 3 ? ["160px", "200px", "1fr"] : ["1fr"]
  return (
    <div style={{ background: "#04060f", border: "1px solid rgba(26,86,255,0.13)", borderRadius: "10px", overflow: "hidden", marginBottom: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: w.join(" "), padding: "7px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", gap: "8px" }}>
        {cols.map(col => <span key={col} style={{ fontSize: "9px", fontFamily: c.mono, color: c.t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{col}</span>)}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: w.join(" "), padding: "9px 16px", borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none", fontSize: "11px", fontFamily: c.mono, alignItems: "start", gap: "8px" }}>
          {row.map((cell, j) => <span key={j} style={{ color: j === 0 ? c.t2 : j === 1 ? c.link : c.t3, lineHeight: 1.6 }}>{cell}</span>)}
        </div>
      ))}
    </div>
  )
}

function TabBlock({ tabs, c }: { tabs: { label: string; content: React.ReactNode }[]; c: Colors }) {
  const [active, setActive] = useState(0)
  return (
    <div style={{ border: "1px solid " + c.bdr, borderRadius: "10px", overflow: "hidden", marginBottom: "12px" }}>
      <div style={{ display: "flex", borderBottom: "1px solid " + c.bdr }}>
        {tabs.map((tab, i) => (
          <button key={tab.label} onClick={() => setActive(i)}
            style={{ flex: 1, padding: "9px 14px", fontSize: "11px", fontFamily: c.mono, color: active === i ? c.link : c.t3, background: active === i ? "rgba(26,86,255,0.07)" : "transparent", border: "none", cursor: "pointer", borderRight: i < tabs.length - 1 ? "1px solid " + c.bdr : "none", transition: "all .15s" }}>
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "18px 20px" }}>{tabs[active].content}</div>
    </div>
  )
}

function PrereqBlock({ title, what, checkCode, checkNote, installTabs, afterCode, verifyCode, c }: {
  title: string; what: string; checkCode: string; checkNote: string
  installTabs: { label: string; code: string; note: string }[]
  afterCode?: string; verifyCode?: string; c: Colors
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: "1px solid " + c.bdr, borderRadius: "10px", overflow: "hidden", marginBottom: "8px" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: "100%", padding: "13px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: open ? "rgba(26,86,255,0.04)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", gap: "12px", transition: "background .15s" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: c.t1, fontFamily: c.mono, marginBottom: "3px" }}>{title}</div>
          <div style={{ fontSize: "11px", color: c.t3, fontFamily: c.mono, lineHeight: 1.5 }}>{what}</div>
        </div>
        <span style={{ fontSize: "11px", fontFamily: c.mono, color: c.t3, flexShrink: 0, marginTop: "2px" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "18px 18px 16px", borderTop: "1px solid " + c.bdr, display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <Label c={c}>Check if already installed</Label>
            <Copy id={`chk-${title}`} code={checkCode} c={c} />
            <div style={{ fontSize: "11px", fontFamily: c.mono, color: c.t3, marginTop: "6px" }}>{checkNote}</div>
          </div>
          <div>
            <Label c={c}>Install</Label>
            {installTabs.length === 1 ? (
              <>
                <Copy id={`inst-${title}`} code={installTabs[0].code} c={c} />
                {installTabs[0].note && <div style={{ fontSize: "11px", fontFamily: c.mono, color: c.t3, marginTop: "6px" }}>{installTabs[0].note}</div>}
                {afterCode && <><div style={{ height: "8px" }} /><Copy id={`after-${title}`} code={afterCode} c={c} /></>}
              </>
            ) : (
              <TabBlock c={c} tabs={installTabs.map(t => ({
                label: t.label,
                content: <><Copy id={`inst-${title}-${t.label}`} code={t.code} c={c} />{t.note && <div style={{ fontSize: "11px", fontFamily: c.mono, color: c.t3, marginTop: "6px" }}>{t.note}</div>}</>,
              }))} />
            )}
          </div>
          {verifyCode && (
            <div>
              <Label c={c}>Verify the install worked</Label>
              <Copy id={`ver-${title}`} code={verifyCode} c={c} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
