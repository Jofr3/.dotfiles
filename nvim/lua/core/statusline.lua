vim.api.nvim_exec(
	[[
set laststatus=2
set statusline=
set statusline+=\ 
set statusline+=%f
set statusline+=\ 
set statusline+=%m
]],
	false
)
