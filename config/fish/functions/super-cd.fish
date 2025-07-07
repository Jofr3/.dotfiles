function super-cd
    set -l selected_dir (
        begin
            fd --type d --max-depth 1 --min-depth 1 . ~/lsw/
            printf "%s\n" \
                "~/.config" \
                "~/.dotfiles" \
                "~/.dotfiles/scripts" \
                "~/Dropbox/notes" \
                "~/Downloads" \
                "~/Documents" \
                "~/.ssh" \
                "~/nix"
            fd --type d --max-depth 1 --min-depth 1 . ~/.dotfiles/config/
        end | string replace -- "$HOME" "~" | sk
    )
    
    test -n "$selected_dir" && cd (string replace '~' "$HOME" "$selected_dir") && commandline -f repaint
end
