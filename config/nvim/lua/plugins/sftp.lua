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
			{
				local_path = "/home/jofre/lsw/tacprod",
				host = "tacprod",
				remote_path = "/dev.tacprod.cat",
			},
			{
				local_path = "/home/jofre/lsw/gestio_mancoplana",
				host = "gestio_mancoplana",
				remote_path = "/gestio.mancoplana.cat",
			},
			{
				local_path = "/home/jofre/lsw/memoria_mancoplana",
				host = "memoria_mancoplana",
				remote_path = "/pam.mancoplana.cat",
			},
		},
	},
}
