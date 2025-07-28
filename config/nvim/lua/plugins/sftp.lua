return {
	"sftp.nvim",
	dev = true,
	enabled = true,
	lazy = false,
	opts = {
		projects = {
			{
				local_path = "/home/jofre/lsw/myclientum",
				host = "myclientum",
				remote_path = "/dev.myclientum.com",
			},
		},
	},
}
