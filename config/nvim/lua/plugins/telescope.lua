return {
    'nvim-telescope/telescope.nvim', tag = '0.1.8',	
    dependencies = { 'nvim-lua/plenary.nvim', 'nvim-tree/nvim-web-devicons', "debugloop/telescope-undo.nvim" },
    config = function()
    	require("telescope").load_extension("undo")
    end,
    opts = {
	defaults = {
        	file_ignore_patterns = { "public_html", "node_modules", "assets", "android", "ios" },
	    },
    },
    keys = {
        { "<C-f>", "<cmd>lua require('telescope.builtin').find_files()<cr>", remap = true, desc = "Search files" },
        { "<C-v>", "<cmd>lua require('telescope.builtin').live_grep()<cr>", remap = true, desc = "Grep" },
        { "<Leader><Leader>", "<cmd>lua require('telescope.builtin').resume()<cr>", remap = true, desc = "Resume" },
        { "<Leader>u", "<cmd>Telescope undo<cr>", remap = true, desc = "Undo tree" },

    },
}
