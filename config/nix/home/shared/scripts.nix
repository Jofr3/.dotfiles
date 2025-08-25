{ pkgs, ... }:

let
  bookmark-opener = pkgs.writeShellScriptBin "bookmark-opener" ''
    #!/bin/bash

    echo lol
    # exec /home/jofre/.dotfiles/scripts/bookmarks1.sh
  '';
in {
  home.packages = [
    bookmark-opener 
  ];
}

