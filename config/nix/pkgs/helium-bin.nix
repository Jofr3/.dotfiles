{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  makeWrapper,
  wrapGAppsHook3,
  alsa-lib,
  at-spi2-core,
  cairo,
  cups,
  dbus,
  expat,
  glib,
  gsettings-desktop-schemas,
  gtk3,
  libdrm,
  libglvnd,
  libxkbcommon,
  libX11,
  libxcb,
  libXcomposite,
  libXdamage,
  libXext,
  libXfixes,
  libXrandr,
  mesa,
  nspr,
  nss,
  pango,
  qt5,
  qt6,
  systemd,
  vulkan-loader,
}:

let
  qtPluginPath = lib.concatStringsSep ":" [
    "${qt6.qtbase}/${qt6.qtbase.qtPluginPrefix}"
    "${qt6.qtwayland}/${qt6.qtbase.qtPluginPrefix}"
    "${qt5.qtbase}/${qt5.qtbase.qtPluginPrefix}"
    "${qt5.qtwayland.bin}/${qt5.qtbase.qtPluginPrefix}"
  ];

  runtimeLibraryPath = lib.makeLibraryPath [
    libglvnd
    vulkan-loader
  ];

  sources = {
    x86_64-linux = {
      arch = "x86_64";
      hash = "sha256-MXV5LVknmxhYPq5+W6O2QYz3bemw1nxLs4kI+pS3Mgs=";
    };
    aarch64-linux = {
      arch = "arm64";
      hash = "sha256-Sq7Iae93/t98uyLyDgRtEX+7n+Hc4MssZqg9n5bzNC8=";
    };
  };

  source =
    sources.${stdenv.hostPlatform.system}
      or (throw "helium-bin is not supported on ${stdenv.hostPlatform.system}");
in
stdenv.mkDerivation rec {
  pname = "helium-bin";
  version = "0.13.1.1";

  src = fetchurl {
    url = "https://github.com/imputnet/helium-linux/releases/download/${version}/helium-${version}-${source.arch}_linux.tar.xz";
    inherit (source) hash;
  };

  nativeBuildInputs = [
    autoPatchelfHook
    makeWrapper
    wrapGAppsHook3
  ];

  buildInputs = [
    alsa-lib
    at-spi2-core
    cairo
    cups
    dbus
    expat
    glib
    gsettings-desktop-schemas
    gtk3
    libdrm
    libglvnd
    libxkbcommon
    mesa
    nspr
    nss
    pango
    (lib.getLib qt5.qtbase)
    (lib.getLib qt6.qtbase)
    systemd
    libX11
    libXcomposite
    libXdamage
    libXext
    libXfixes
    libXrandr
    libxcb
  ];

  dontConfigure = true;
  dontBuild = true;
  dontWrapGApps = true;

  installPhase = ''
    runHook preInstall

    install -dm755 "$out/opt/helium" "$out/bin" "$out/share/applications" "$out/share/icons/hicolor/256x256/apps"
    cp -R . "$out/opt/helium/"
    chmod -R u+w "$out/opt/helium"

    substituteInPlace "$out/opt/helium/helium-wrapper" \
      --replace 'CHROME_VERSION_EXTRA="custom"' 'CHROME_VERSION_EXTRA="NixOS binary tarball"'

    ln -s "$out/opt/helium/chromedriver" "$out/bin/helium-chromedriver"

    install -Dm644 "$out/opt/helium/helium.desktop" "$out/share/applications/helium.desktop"
    substituteInPlace "$out/share/applications/helium.desktop" \
      --replace 'Exec=helium %U' "Exec=$out/bin/helium %U" \
      --replace 'Exec=helium' "Exec=$out/bin/helium"

    install -Dm644 "$out/opt/helium/product_logo_256.png" "$out/share/icons/hicolor/256x256/apps/helium.png"

    runHook postInstall
  '';

  postFixup = ''
    makeWrapper "$out/opt/helium/helium-wrapper" "$out/bin/helium" \
      "''${gappsWrapperArgs[@]}" \
      --prefix LD_LIBRARY_PATH : "${runtimeLibraryPath}:/run/opengl-driver/lib" \
      --prefix QT_PLUGIN_PATH : "${qtPluginPath}"
  '';

  meta = {
    description = "Chromium-based privacy browser made by Imput, packaged from the official Linux binary tarball";
    homepage = "https://helium.computer/";
    changelog = "https://github.com/imputnet/helium-linux/releases/tag/${version}";
    license = lib.licenses.gpl3Only;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    maintainers = [ ];
    platforms = builtins.attrNames sources;
    mainProgram = "helium";
  };
}
