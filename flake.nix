{
  description = "NetScope - Network Manager and Data Usage Analytics App";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages = rec {
          backend = pkgs.buildGoModule {
            pname = "netscope-backend";
            version = "0.1.0";
            src = ./.;
            subPackages = [ "cmd/netscope-backend" ];
            vendorHash = "sha256-2Uxoa+QTexlG+0sRbE+Gt/7NtWjVP/TSrhc4Nu0gfNo=";
            buildInputs = with pkgs; [ networkmanager dbus glib ];
            nativeBuildInputs = with pkgs; [ pkg-config ];
          };

          frontend = pkgs.buildNpmPackage {
            pname = "netscope-frontend";
            version = "0.1.0";
            src = ./frontend;
            npmDepsHash = "sha256-GqVDwNZ4YPslZ5ft1Uo29fmsBn4TxKjBuvn3A9h8Bv0=";
            
            ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
            
            postInstall = ''
              cp -r dist main.cjs preload.cjs netscope.png $out/lib/node_modules/netscope/
              
              mkdir -p $out/bin
              cat > $out/bin/netscope-frontend <<EOF
#!/bin/sh
exec ${pkgs.electron}/bin/electron $out/lib/node_modules/netscope/main.cjs "\$@"
EOF
              chmod +x $out/bin/netscope-frontend
            '';
          };

          default = pkgs.stdenv.mkDerivation {
            pname = "netscope";
            version = "0.1.0";
            src = ./.;
            
            nativeBuildInputs = [ pkgs.copyDesktopItems ];
            
            desktopItems = [
              (pkgs.makeDesktopItem {
                name = "netscope";
                exec = "netscope";
                icon = "netscope";
                desktopName = "NetScope";
                genericName = "Network Monitor";
                categories = [ "System" "Network" ];
              })
            ];

            installPhase = ''
              mkdir -p $out/bin
              mkdir -p $out/share/pixmaps
              
              cp ./netscope.png $out/share/pixmaps/netscope.png
              
              ln -s ${backend}/bin/netscope-backend $out/bin/netscope-backend
              ln -s ${frontend}/bin/netscope-frontend $out/bin/netscope-frontend

              cat > $out/bin/netscope <<EOF
#!/bin/sh
  # Start backend
  $out/bin/netscope-backend &
  BACKEND_PID=\$!

  # Cleanup on exit
  trap "kill \$BACKEND_PID" EXIT

  # Start frontend
$out/bin/netscope-frontend
EOF
              chmod +x $out/bin/netscope
            '';
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Go and related tools
            go
            gotools
            gopls
            golangci-lint

            # Node.js and Electron
            nodejs
            yarn
            electron

            # C/C++ build tools (for CGO or native Node modules)
            gcc
            pkg-config

            # NetworkManager and DBus libraries (for the Go service)
            networkmanager
            dbus
            glib

            # UI libraries that might be required
            gtk3
          ];

          shellHook = ''
            # Make sure npm doesn't download Electron binaries that aren't patched for NixOS
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            export ELECTRON_OVERRIDE_DIST_PATH="${pkgs.electron}/bin/"
            export NIX_DEV_SHELL="netscope"

            echo "==========================================="
            echo "NetScope Development Environment Loaded"
            echo "Go version: $(go version)"
            echo "Node version: $(node --version)"
            echo "==========================================="
          '';
        };
      }
    ) // {
      nixosModules.default = { config, lib, pkgs, ... }: {
        options.services.netscope = {
          enable = lib.mkEnableOption "NetScope Network Manager Backend";
          port = lib.mkOption {
            type = lib.types.port;
            default = 8080;
            description = "Port for the NetScope backend API server.";
          };
        };

        config = lib.mkIf config.services.netscope.enable {
          systemd.user.services.netscope-backend = {
            description = "NetScope Network Manager Backend";
            wantedBy = [ "default.target" ];
            after = [ "network.target" "NetworkManager.service" ];
            serviceConfig = {
              ExecStart = "${self.packages.${pkgs.system}.backend}/bin/netscope-backend";
              Restart = "on-failure";
              # Store state in ~/.local/share/netscope natively
              Environment = [
                "PATH=${lib.makeBinPath [ pkgs.networkmanager ]}"
              ];
            };
          };
        };
      };
    };
}
