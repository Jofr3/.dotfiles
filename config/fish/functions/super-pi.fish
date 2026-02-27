function super-pi
    set -l selected_dir (
        begin
            fd --type d --max-depth 1 --min-depth 1 . ~/lsw/ ~/projects/ ~/.dotfiles/config/
            printf "%s\n" \
                "~/.config" \
                "~/.dotfiles" \
                "~/.dotfiles/scripts" \
                "~/notes/"

        end | string replace -- "$HOME" "~" | fzf
    )
    
    test -n "$selected_dir" && cd (string replace '~' "$HOME" "$selected_dir") && commandline -f repaint && bpi
end
