#!/bin/bash
set -e

# Keyforge Installation Script
# Automatically detects platform and installs the latest release

REPO="keyforge/keyforge"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="keyforge"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect platform and architecture
detect_platform() {
    local os arch
    
    case "$(uname -s)" in
        Linux)
            os="linux"
            ;;
        Darwin)
            os="darwin"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            os="win32"
            ;;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
    
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x64"
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac
    
    echo "${os}-${arch}"
}

# Get latest release version
get_latest_version() {
    local version
    version=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
    
    if [ -z "$version" ]; then
        log_error "Failed to get latest version"
        exit 1
    fi
    
    echo "$version"
}

# Download and install binary
install_keyforge() {
    local platform version binary_url temp_file extension
    
    platform=$(detect_platform)
    version=$(get_latest_version)
    
    log_info "Detected platform: $platform"
    log_info "Latest version: $version"
    
    # Determine file extension
    extension=""
    if [[ "$platform" == "win32"* ]]; then
        extension=".exe"
    fi
    
    binary_url="https://github.com/${REPO}/releases/download/${version}/keyforge-${platform}${extension}"
    temp_file="/tmp/keyforge${extension}"
    
    log_info "Downloading from: $binary_url"
    
    # Download binary
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$temp_file" "$binary_url"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$temp_file" "$binary_url"
    else
        log_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi
    
    # Verify download
    if [ ! -f "$temp_file" ]; then
        log_error "Download failed"
        exit 1
    fi
    
    # Check if we have write permissions to install directory
    if [ ! -w "$INSTALL_DIR" ]; then
        log_warn "No write permissions to $INSTALL_DIR, trying with sudo..."
        sudo_cmd="sudo"
    else
        sudo_cmd=""
    fi
    
    # Install binary
    log_info "Installing to $INSTALL_DIR/$BINARY_NAME"
    $sudo_cmd mv "$temp_file" "$INSTALL_DIR/$BINARY_NAME"
    $sudo_cmd chmod +x "$INSTALL_DIR/$BINARY_NAME"
    
    log_success "Keyforge installed successfully!"
    
    # Verify installation
    if command -v keyforge >/dev/null 2>&1; then
        log_info "Version: $(keyforge --version)"
    else
        log_warn "Binary installed but not in PATH. You may need to restart your shell or add $INSTALL_DIR to your PATH."
    fi
    
    echo
    echo -e "${GREEN}🎉 Installation complete!${NC}"
    echo
    echo "Quick start:"
    echo "  keyforge init          # Initialize with your master passphrase"
    echo "  keyforge generate ssh  # Generate SSH key"
    echo "  keyforge --help        # Show all commands"
    echo
    echo "Documentation: https://github.com/${REPO}#readme"
}

# Uninstall function
uninstall_keyforge() {
    local binary_path="$INSTALL_DIR/$BINARY_NAME"
    
    if [ -f "$binary_path" ]; then
        log_info "Removing $binary_path"
        
        if [ -w "$INSTALL_DIR" ]; then
            rm "$binary_path"
        else
            sudo rm "$binary_path"
        fi
        
        log_success "Keyforge uninstalled successfully!"
    else
        log_warn "Keyforge not found at $binary_path"
    fi
    
    # Clean up config directory (optional)
    local config_dir="$HOME/.keyforge"
    if [ -d "$config_dir" ]; then
        read -p "Remove configuration directory $config_dir? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$config_dir"
            log_info "Configuration directory removed"
        fi
    fi
}

# Show usage
show_usage() {
    echo "Keyforge Installation Script"
    echo
    echo "Usage: $0 [install|uninstall]"
    echo
    echo "Commands:"
    echo "  install     Install Keyforge (default)"
    echo "  uninstall   Remove Keyforge"
    echo
    echo "Examples:"
    echo "  curl -fsSL https://install.keyforge.io | bash"
    echo "  bash install.sh uninstall"
}

# Main function
main() {
    local command="${1:-install}"
    
    case "$command" in
        install)
            install_keyforge
            ;;
        uninstall)
            uninstall_keyforge
            ;;
        --help|-h|help)
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Check dependencies
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    log_error "This script requires curl or wget to download files"
    exit 1
fi

# Run main function
main "$@"