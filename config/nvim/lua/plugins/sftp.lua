return {
	"sftp-nvim",
  dev = true,
  enabled = true,
	lazy = false,
	config = function()
		require("sftp").setup()
	end,
	keys = { }
}
