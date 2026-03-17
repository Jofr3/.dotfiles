# Load secrets decrypted by sops-nix into environment variables
# Secrets are placed in $XDG_RUNTIME_DIR/secrets/<name> by sops-nix home-manager module
set -l secrets_dir "$HOME/.config/sops-nix/secrets"
if test -d "$secrets_dir"
    for secret_file in $secrets_dir/*
        if test -f "$secret_file"
            set -gx (basename "$secret_file") (cat "$secret_file")
        end
    end
end
