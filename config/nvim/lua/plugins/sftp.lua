return {
	"sftp-nvim",
	dev = true,
	enabled = true,
	lazy = false,
	opts = {
		projects = {
			{
				local_path = "/home/jofre/lsw/myclientum-new",
				host = "myclientum_dev",
				remote_path = "/dev.myclientum.com",
			},
		},
	},
	keys = {},
}
