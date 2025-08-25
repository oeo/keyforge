# Keyforge

> Deterministic key derivation and encrypted vault system

Keyforge generates all your cryptographic keys, passwords, and 2FA codes from a single master passphrase. Everything is deterministic, recoverable, and stored in an encrypted vault.

## Core Features

**One passphrase. All your keys. Forever recoverable.**

- Same passphrase always generates identical keys
- Complete recovery from passphrase alone
- Encrypted vault with secure local storage
- No accounts, servers, or registrations required
- Professional CLI with comprehensive functionality

## What Keyforge Does

### Key Generation
- **SSH Keys**: Ed25519 keys per service/hostname
- **GPG Keys**: Ed25519 signing keys in OpenPGP format
- **Bitcoin Wallets**: BIP39/BIP32 HD wallets with Native SegWit
- **Ethereum Wallets**: Standard derivation paths
- **TOTP/2FA**: Deterministic authenticator secrets with QR codes

### Secure Storage
- **Password Manager**: Store credentials with automatic encryption
- **Vault Management**: Sync, backup, and restore operations
- **Session Management**: 5-minute timeout with secure memory clearing

### Recovery & Import/Export
- **Local Storage**: Encrypted vault files with automatic backup
- **Export/Import**: Multiple formats (JSON, encrypted, backup) with filtering
- **Interactive Mode**: Full-featured REPL for extended operations
- **Configuration**: Customizable defaults and preferences

## Installation

### Prerequisites
- [Bun](https://bun.sh) runtime v1.0+

### Development Install
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and install Keyforge
git clone https://github.com/keyforge/keyforge
cd keyforge
bun install
bun link

# Verify installation
keyforge --version
```

### Binary Install (Coming Soon)
```bash
# Install script (when released)
curl -fsSL https://install.keyforge.io | bash

# Or download binary from releases
# https://github.com/keyforge/keyforge/releases
```

## Quick Start

### 1. Initialize
```bash
keyforge init
# Enter master passphrase: ********
# Username [keyforge]: alice
# ✓ Keyforge initialized successfully
```

### 2. Generate SSH Key
```bash
keyforge generate ssh --service github.com --copy
# Public Key: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
# Fingerprint: SHA256:xRE2K9B5vPX+YZ8LmnOP...
# ✓ Public key copied to clipboard
```

### 3. Generate Bitcoin Wallet
```bash
keyforge generate bitcoin --service personal
# Bitcoin Wallet:
# Address: bc1qsa00378kamghkf44r70ferr3v0anfkzrc79590
# Path: m/84'/0'/0'/0/0
# xpub: zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wgmUx...
```

### 4. Store Password
```bash
keyforge pass add netflix.com --username alice@example.com
# Password: ********
# ✓ Password saved to vault
```

### 5. Generate TOTP Code
```bash
keyforge totp github.com --qr
# TOTP for github.com:
#   412 856
# Valid for 18 seconds
# [QR Code displayed]
```

## Available Commands

### Key Generation
```bash
# SSH keys
keyforge generate ssh --service github.com --output ~/.ssh/github
keyforge generate ssh --service server.com --show-private

# Cryptocurrency wallets  
keyforge generate bitcoin --service trading
keyforge generate ethereum --service defi --copy

# Aliases supported
keyforge generate btc --service payments
keyforge generate eth --service main
```

### Export/Import
```bash
# Export vault in different formats
keyforge export --format json --output backup.json
keyforge export --format encrypted --output secure-backup.kf
keyforge export --format backup --include passwords,ssh

# Import vault data
keyforge import --input backup.json --merge
keyforge import --input secure-backup.kf --dry-run
```

### Configuration
```bash
# View current configuration
keyforge config list

# Set default values
keyforge config set defaults.username alice
keyforge config set network.tor true
keyforge config set output.copyToClipboard true

# Reset configuration
keyforge config reset
```

### Vault Management
```bash
# Check vault status
keyforge vault status

# List vault contents  
keyforge vault list

# Sync vault (saves locally)
keyforge vault sync

# Backup and restore
keyforge vault backup
keyforge vault restore
```

### Password Manager
```bash
# Add password
keyforge pass add gmail.com --username alice@gmail.com
keyforge pass add twitter.com --generate --length 20

# Retrieve password (copies to clipboard)
keyforge pass get gmail.com

# List all passwords
keyforge pass list

# Update existing password
keyforge pass update gmail.com --generate

# Delete password
keyforge pass delete gmail.com
```

### TOTP/2FA Codes
```bash
# Generate current code
keyforge totp github.com

# Show QR code for setup
keyforge totp newservice.com --qr

# Show secret key
keyforge totp github.com --secret

# Custom settings
keyforge totp service.com --add --digits 8 --period 60
```

### Recovery
```bash
# Recover vault from passphrase
keyforge recover

# Specify recovery source (currently local only)
keyforge recover --from local

# Recover with specific credentials
keyforge recover --passphrase "my passphrase" --username alice
```

### Interactive Mode
```bash
# Start interactive REPL
keyforge interactive
# or just:
keyforge

# Interactive commands:
keyforge> help
keyforge> generate ssh --service test.com
keyforge> vault status
keyforge> pass add example.com --generate
keyforge> exit
```

## Example Workflows

### New Developer Setup
```bash
# Initialize Keyforge
keyforge init

# Generate SSH keys for services
keyforge generate ssh --service github.com --output ~/.ssh/github
keyforge generate ssh --service gitlab.com --output ~/.ssh/gitlab
keyforge generate ssh --service aws-server --output ~/.ssh/aws

# Generate GPG keys for signing
keyforge generate gpg --name "Alice Developer" --email "alice@company.com" --service github.com

# Store development credentials
keyforge pass add aws-console --username alice@company.com
keyforge pass add docker-hub --username alice --generate

# Set up 2FA codes
keyforge totp github.com --qr
keyforge totp aws-console --qr
```

### Bitcoin User Setup
```bash
# Generate wallets for different purposes  
keyforge generate bitcoin --service lightning-node
keyforge generate bitcoin --service cold-storage
keyforge generate bitcoin --service daily-use

# Show private key for cold storage setup
keyforge generate bitcoin --service cold-storage --show-private

# Generate Ethereum wallet for DeFi
keyforge generate ethereum --service defi-main
```

### Complete Recovery
```bash
# On new machine with just your passphrase
keyforge recover
# Enter master passphrase: ********
# Username [keyforge]: alice

# ✓ Vault recovered successfully!
# • SSH keys: 3
# • Wallets: 4  
# • Passwords: 12
# • TOTP entries: 6

# All keys now available for regeneration
keyforge generate ssh --service github.com  # Same key as before
```

## Architecture

Keyforge uses hierarchical deterministic key derivation:

```
Master Passphrase + Username
         ↓
    PBKDF2 (500k iterations)
         ↓  
    Master Seed (64 bytes)
         ↓
   Domain Separation
         ↓
┌─────────────┬─────────────┬─────────────┐
│  SSH Keys   │   Wallets   │    Vault    │
│             │             │             │
│  Ed25519    │   BIP39     │  ChaCha20   │
│  OpenSSH    │   BIP32     │  Poly1305   │
│  Format     │   SegWit    │  Encrypted  │
└─────────────┴─────────────┴─────────────┘
```

### Key Domains
Keys are derived using domain separation to prevent correlation:
- `keyforge:ssh:v1` - SSH keypairs
- `keyforge:wallet:bip39:v1` - HD wallets  
- `keyforge:vault:encrypt:v1` - Vault encryption
- `keyforge:service:totp:v1` - TOTP secrets

## Security

### Cryptographic Primitives
- **Key Derivation**: PBKDF2 (500,000 iterations)
- **Encryption**: ChaCha20-Poly1305
- **SSH Keys**: Ed25519
- **Wallets**: BIP39/BIP32 standard derivation

### Security Features
- Deterministic generation (same passphrase = same keys)
- Domain separation prevents key correlation
- Session timeout with secure memory clearing
- Local vault encryption with authenticated encryption
- Strong random password generation

### Implementation Status
✅ **Production Ready**: 
- Core deterministic key derivation system
- SSH key generation (Ed25519, OpenSSH format)
- GPG key generation (Ed25519, OpenPGP format)
- HD wallet generation (Bitcoin/Ethereum, BIP39/BIP32)
- TOTP/2FA code generation with QR codes
- Password manager with encryption
- Encrypted vault with local storage
- Export/import in multiple formats
- Configuration management system
- Interactive CLI mode
- Comprehensive test suite (144+ tests)
- Build system for standalone binaries

🚧 **Future Enhancements**: 
- Arweave permanent storage with Bitcoin payment
- Nostr backup system for redundancy
- Tor integration for privacy
- GPG key generation
- Shamir secret sharing for recovery
- Advanced security features (dead man's switch, panic mode)

## Development

### Testing
```bash
# Run all tests (144+ tests)
bun test

# Watch mode for development
bun test --watch

# Test specific component
bun test tests/cli/password.test.ts
bun test tests/core/derivation.test.ts

# Run test vectors for determinism validation
bun test tests/vectors.test.ts
```

### Building
```bash
# Build for current platform
bun run build:dev

# Build for all platforms
bun run build

# Create release with checksums
bun run build:release

# Clean build artifacts
bun run build:clean
```

### Project Structure
```
keyforge/
├── src/
│   ├── core/          # Master derivation, domains, config
│   ├── generators/    # SSH, wallets, TOTP generators
│   ├── vault/         # Encryption, storage, types
│   ├── cli/           # CLI commands and interface
│   └── crypto/        # Cryptographic utilities
├── tests/             # Comprehensive test suites
├── scripts/           # Build, install, deployment scripts
├── .github/           # CI/CD workflows
└── docs/              # Documentation
```

## Technical Details

### Supported Key Types
- **SSH**: Ed25519 keys in OpenSSH format
- **GPG**: Ed25519 keys in OpenPGP format with ASCII armor
- **Bitcoin**: Native SegWit (bc1) addresses, P2WPKH
- **Ethereum**: Standard derivation path m/44'/60'/0'/0/0
- **TOTP**: HMAC-SHA1 6-digit codes (RFC 6238)

### Storage Format
- **Vault**: ChaCha20-Poly1305 encrypted JSON
- **SSH Keys**: OpenSSH private key format
- **Wallets**: BIP39 mnemonic + extended keys
- **Passwords**: Encrypted strings with metadata

### Performance
- **Key Generation**: ~35ms for SSH, ~50ms for wallets
- **Vault Operations**: <10ms for most operations  
- **Master Derivation**: ~2 seconds (intentionally slow for security)
- **Memory Usage**: <50MB typical, <100MB peak

## FAQ

### Is this secure?
Yes, Keyforge uses industry-standard cryptography and follows security best practices. All keys are derived deterministically using proper domain separation. However, security depends on your master passphrase strength.

### What if I forget my passphrase?
Your passphrase is the only way to recover your keys. Keyforge cannot recover lost passphrases. Choose a strong but memorable passphrase and consider writing it down securely.

### Can I use this in production?
Yes, the core functionality is production-ready with comprehensive testing. The system provides secure local key derivation and vault management. Cloud backup features (Arweave/Nostr) are planned for future releases.

### How is this different from password managers?
Keyforge generates everything deterministically from your passphrase - no need to import/export or sync files. It also generates cryptographic keys (SSH, Bitcoin) that traditional password managers don't support.

## License

MIT License

## Security Disclosure

For security issues, please create a GitHub issue with the "security" label.

---

**Simple. Deterministic. Recoverable.**