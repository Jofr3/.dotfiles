return { 
    "anuvyklack/windows.nvim",
    dependencies = { "anuvyklack/middleclass" },
   config = function()
      require('windows').setup()
   end,
	keys = {
		{ "<Leader>m", "<cmd>:WindowsMaximize<cr>", remap = true, desc = "Maximize window" },
	},
}
