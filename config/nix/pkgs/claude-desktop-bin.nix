{
  lib,
  stdenv,
  requireFile,
  dpkg,
  autoPatchelfHook,
  makeWrapper,
  wrapGAppsHook3,
  alsa-lib,
  at-spi2-atk,
  at-spi2-core,
  cairo,
  cups,
  dbus,
  expat,
  glib,
  gtk3,
  libappindicator-gtk3,
  libcap_ng,
  libdrm,
  libglvnd,
  libnotify,
  libseccomp,
  libsecret,
  libuuid,
  libxkbcommon,
  mesa,
  nspr,
  nss,
  pango,
  systemd,
  vulkan-loader,
  xdg-utils,
  libX11,
  libXcomposite,
  libXdamage,
  libXext,
  libXfixes,
  libXi,
  libXrandr,
  libXrender,
  libXScrnSaver,
  libXtst,
  libxcb,
  libxshmfence,
}:

let
  runtimeLibraryPath = lib.makeLibraryPath [
    libglvnd
    vulkan-loader
  ];
in
stdenv.mkDerivation rec {
  pname = "claude-desktop";
  version = "1.17377.2";

  # The official Anthropic Claude Desktop .deb is not published at a stable URL,
  # so it is referenced from the Nix store by content hash. Add it once with:
  #   nix-store --add-fixed sha256 claude-desktop_amd64.deb
  src = requireFile {
    name = "claude-desktop_amd64.deb";
    sha256 = "sha256-7AjUGqeYjS06P19P/fONIHtBLmYmOfQNeiZbivriEqs=";
    message = ''
      Download the Claude Desktop .deb from https://claude.ai/download, then run:
        nix-store --add-fixed sha256 claude-desktop_amd64.deb
    '';
  };

  nativeBuildInputs = [
    dpkg
    autoPatchelfHook
    makeWrapper
    wrapGAppsHook3
  ];

  buildInputs = [
    alsa-lib
    at-spi2-atk
    at-spi2-core
    cairo
    cups
    dbus
    expat
    glib
    gtk3
    libappindicator-gtk3
    libcap_ng
    libdrm
    libglvnd
    libnotify
    libseccomp
    libsecret
    libuuid
    libxkbcommon
    mesa
    nspr
    nss
    pango
    systemd
    vulkan-loader
    libX11
    libXcomposite
    libXdamage
    libXext
    libXfixes
    libXi
    libXrandr
    libXrender
    libXScrnSaver
    libXtst
    libxcb
    libxshmfence
  ];

  dontConfigure = true;
  dontBuild = true;
  dontWrapGApps = true;

  unpackPhase = ''
    runHook preUnpack
    # Pipe through tar with --no-same-permissions so the setuid bit on
    # chrome-sandbox isn't restored (it can't be, and would abort the build).
    dpkg-deb --fsys-tarfile "$src" | tar -x --no-same-permissions --no-same-owner
    runHook postUnpack
  '';

  installPhase = ''
    runHook preInstall

    # App payload (Electron bundle + native .node modules).
    install -dm755 "$out/lib" "$out/bin" "$out/share"
    cp -R usr/lib/claude-desktop "$out/lib/claude-desktop"
    chmod -R u+w "$out/lib/claude-desktop"

    # Desktop entry + hicolor icons, relocated to $out/share for XDG discovery.
    cp -R usr/share/applications "$out/share/applications"
    cp -R usr/share/icons "$out/share/icons"

    substituteInPlace "$out/share/applications/claude-desktop.desktop" \
      --replace 'Exec=claude-desktop' "Exec=$out/bin/claude-desktop"

    runHook postInstall
  '';

  postFixup = ''
    makeWrapper "$out/lib/claude-desktop/claude-desktop" "$out/bin/claude-desktop" \
      "''${gappsWrapperArgs[@]}" \
      --prefix LD_LIBRARY_PATH : "${runtimeLibraryPath}:/run/opengl-driver/lib" \
      --prefix PATH : "${lib.makeBinPath [ xdg-utils ]}"
    # If Claude fails to launch complaining about the SUID sandbox, either add
    #   --add-flags "--no-sandbox"
    # above, or set security.chromiumSuidSandbox.enable = true; in your NixOS config.
  '';

  meta = {
    description = "Desktop application for Claude.ai, packaged from the official Linux .deb";
    homepage = "https://claude.ai/download";
    license = lib.licenses.unfree;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    maintainers = [ ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "claude-desktop";
  };
}
