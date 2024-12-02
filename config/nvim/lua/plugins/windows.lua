return { 
    "anuvyklack/windows.nvim",
    dependencies = { "anuvyklack/middleclass" },
    lazy = false,
   config = function()
      require('windows').setup()
   end,
	keys = {
		{ "<Leader>m", "<cmd>:WindowsMaximize<cr>", remap = true, desc = "Maximize window" },
	},
}
