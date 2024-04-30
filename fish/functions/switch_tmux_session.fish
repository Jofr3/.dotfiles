function switch_tmux_session
    set index $argv[1]
    set sessions (tmux list-sessions | string match -r '^[^:]+')

    if test -z $sessions[$index]
    else
        tmux switch -t $sessions[$index]
    end
end
