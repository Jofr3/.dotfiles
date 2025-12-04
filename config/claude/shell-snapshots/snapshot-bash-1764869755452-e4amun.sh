# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
# Functions
# Shell Options
shopt -u array_expand_once
shopt -u assoc_expand_once
shopt -u autocd
shopt -u bash_source_fullpath
shopt -u cdable_vars
shopt -u cdspell
shopt -u checkhash
shopt -u checkjobs
shopt -s checkwinsize
shopt -s cmdhist
shopt -u compat31
shopt -u compat32
shopt -u compat40
shopt -u compat41
shopt -u compat42
shopt -u compat43
shopt -u compat44
shopt -s complete_fullquote
shopt -u direxpand
shopt -u dirspell
shopt -u dotglob
shopt -u execfail
shopt -u expand_aliases
shopt -u extdebug
shopt -u extglob
shopt -s extquote
shopt -u failglob
shopt -s force_fignore
shopt -s globasciiranges
shopt -s globskipdots
shopt -u globstar
shopt -u gnu_errfmt
shopt -u histappend
shopt -u histreedit
shopt -u histverify
shopt -s hostcomplete
shopt -u huponexit
shopt -u inherit_errexit
shopt -s interactive_comments
shopt -u lastpipe
shopt -u lithist
shopt -u localvar_inherit
shopt -u localvar_unset
shopt -s login_shell
shopt -u mailwarn
shopt -u no_empty_cmd_completion
shopt -u nocaseglob
shopt -u nocasematch
shopt -u noexpand_translation
shopt -u nullglob
shopt -s patsub_replacement
shopt -s progcomp
shopt -u progcomp_alias
shopt -s promptvars
shopt -u restricted_shell
shopt -u shift_verbose
shopt -s sourcepath
shopt -u varredir_close
shopt -u xpg_echo
set -o braceexpand
set -o hashall
set -o interactive-comments
set -o monitor
set -o onecmd
shopt -s expand_aliases
# Aliases
# Check for rg availability
if ! command -v rg >/dev/null 2>&1; then
  alias rg='/nix/store/fmr69jrc2va9d83wg4hs9bnp1gj7flab-claude-code-2.0.35/lib/node_modules/\@anthropic-ai/claude-code/vendor/ripgrep/x64-linux/rg'
fi
export PATH=/run/wrappers/bin\:/home/jofre/.nix-profile/bin\:/nix/profile/bin\:/home/jofre/.local/state/nix/profile/bin\:/etc/profiles/per-user/jofre/bin\:/nix/var/nix/profiles/default/bin\:/run/current-system/sw/bin\:/home/jofre/.dotfiles/config/tofi/scripts/\:/nix/store/918ldr9axgh5kdmpp5fnj2n37pyghwbx-binutils-wrapper-2.44/bin\:/nix/store/p9c2yirm5fywr33qy8262b2j3bli0yl3-hyprland-qtutils-0.1.5/bin\:/nix/store/kc5qpmifdfdwvfys37zggnbnsq3nvrzk-pciutils-3.14.0/bin\:/nix/store/skz92bkx4r4bp9ddczzsi02yrywmr1nc-pkgconf-wrapper-2.4.3/bin\:/home/jofre/.dotfiles/config/tofi/scripts/
