return {
	"ibhagwan/fzf-lua",
	enabled = true,
	lazy = false,
	opts = {
		fzf_bin = "sk",
		winopts = {
			backdrop = 100,
			preview = {
				title = false,
			},
		},
		files = {
			-- find_opts = [[-type f \! -path '*/.git/*' \! -path '*/public_html/*']],
			find_opts = [[ -type f \
        \! -path '*/.git/*' \
        \! -path '*/public_html/*' \
        \! -path '*/dist/*' \
        \! -path '*/build/*' \ ]],
		},
	},
}
