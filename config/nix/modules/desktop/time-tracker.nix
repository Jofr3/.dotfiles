{
  flake.modules.homeManager.desktop =
    { pkgs, ... }:
    let
      projects = [
        " MyClientum - Inergy - DEV's"
        "Admin LSW"
        "AICO (PROCESSOS) - DTK"
        "AICO (WEB) - DTK"
        "Areté - Analytics DTK"
        "Aset Consultoria"
        "ATEINSA"
        "ATEINSA - Myproductium"
        "ATEINSA NEW"
        "Autoescola RACC-Connect VIC - APP RESERVA PRACTIQUES (DTK)"
        "CCOSONA - Ensenyament "
        "Compartium"
        "DAKIROL GESTIÓ DE L'ESPORT SL - DTK (MYPROD + INSCRITUM)"
        "Electromed (e-commerce) - DTK"
        "Empresa Jofre"
        "ExportBDNS"
        "FESCINT - Processos MyProd (DTK)"
        "Galliner Viver Bell-lloc"
        "Garden Conillas (DTK)"
        "Gestió interna LSW"
        "Implantació MyProd PRO - Garden Tona"
        "Implantació Senditum "
        "Inscritum"
        "IPediatria"
        "MECANITZATS GURRI - COMANDES"
        "Memòria Anual - Mancomunitat la Plana"
        "MyClientum"
        "MyClientum - Arete DTK"
        "MyClientum - Implantació"
        "MyClientum - STARPIG (DTK)"
        "MyClientum - Xemeneies Pou"
        "MyDocumentium"
        "MyDocumentium - Implantació"
        "MyProductium"
        "MyProductium - Implantació"
        "Petit Món Ecològic  - Albert Trabal (DTK)"
        "Pintura Barata"
        "Recollida deixalles - Mancomunitat La Plana"
        "SendiTum"
        "Tacprod"
        "TACPROD - CET TRAMUNTANA"
        "Tacprod - LaFact (Fupar)"
        "TACPROD - TEB"
        "TACPROD (Suport)"
        "TARGECOPY - PACKS"
        "TARGECOPY - TARGEPLUS - APP Clients"
        "TARGECOPY - VIRTUAL"
        "Vicfires"
        "VISAT"
      ];
      projectList = pkgs.writeText "tasques-projectes" (builtins.concatStringsSep "\n" projects + "\n");

      # One JSON object per started task: {timestamp, data, inici, projecte, tasca}.
      log = ''"''${XDG_DATA_HOME:-$HOME/.local/share}/tasques/tasques.jsonl"'';

      # Interactive part, runs inside the floating launcher terminal.
      tascaNew = pkgs.writeShellApplication {
        name = "tasca-new";
        runtimeInputs = with pkgs; [
          coreutils
          fzf
          gnused
          jq
        ];
        text = ''
          log=${log}

          project=$(fzf --reverse --padding=1,1,0,2 --prompt="projecte> " < ${projectList}) || exit 0
          [ -n "$project" ] || exit 0

          # Free-text input: no candidates, fzf prints the query and exits 1 on Enter, 130 on Esc.
          status=0
          task=$(fzf --reverse --padding=1,1,0,2 --print-query --info=hidden --no-separator \
            --prompt="tasca> " < /dev/null) || status=$?
          [ "$status" -le 1 ] || exit 0
          task=$(head -n 1 <<< "$task" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
          [ -n "$task" ] || exit 0

          mkdir -p "$(dirname "$log")"
          now=$(date +%s)
          jq -nc \
            --argjson timestamp "$now" \
            --arg data "$(date -d "@$now" +%F)" \
            --arg inici "$(date -d "@$now" +%H:%M)" \
            --arg projecte "$project" \
            --arg tasca "$task" \
            '{$timestamp, $data, $inici, $projecte, $tasca}' >> "$log"
        '';
      };

      tasca = pkgs.writeShellApplication {
        name = "tasca";
        runtimeInputs = [ pkgs.foot ];
        text = ''
          exec foot --app-id="launcher" ${tascaNew}/bin/tasca-new
        '';
      };

      # tasques-export [YYYY-MM-DD]  (default: today)
      # "fi" is the next task's "inici"; the last task ends now (today) or stays empty (past days).
      tasquesExport = pkgs.writeShellApplication {
        name = "tasques-export";
        runtimeInputs = with pkgs; [
          coreutils
          jq
        ];
        text = ''
          log=${log}
          day=''${1:-$(date +%F)}
          last=""
          [ "$day" != "$(date +%F)" ] || last=$(date +%H:%M)

          if [ ! -s "$log" ]; then
            echo "[]"
            exit 0
          fi

          jq -s --arg day "$day" --arg last "$last" '
            map(select(.data == $day)) | sort_by(.timestamp) as $t
            | [range(0; $t | length) as $i | $t[$i] | {
                projecte,
                llista: "",
                tasca,
                inici,
                fi: (if $i + 1 < ($t | length) then $t[$i + 1].inici else $last end),
                treballador: "Jofre",
                facturable: true,
                extra: false
              }]
          ' "$log"
        '';
      };
    in
    {
      home.packages = [
        tasca
        tasquesExport
      ];

      wayland.windowManager.niri.settings.binds."Super+N".spawn = [ "${tasca}/bin/tasca" ];
    };
}
