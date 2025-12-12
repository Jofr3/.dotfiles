{
  description = "flake";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [ ];

          shellHook = ''
            VARS_TO_LOAD=(
                "DB_CONNECTION"
                "DB_HOST"
                "DB_PORT"
                "DB_DATABASE"
                "DB_USERNAME"
                "DB_PASSWORD"
            )
            ENV_FILE=".env"

            if [ -f "$ENV_FILE" ]; then
                for var_name in "''${VARS_TO_LOAD[@]}"; do
                    match=$(grep "^$var_name=" "$ENV_FILE")
                    if [ -n "$match" ]; then
                        val="''${match#*=}"
                        val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
                        export "$var_name"="$val"
                    fi
                done
            fi
          '';
        };
      });
}
