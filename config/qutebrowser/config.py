c.url.default_page = "https://google.com";
c.url.start_pages = [ "https://google.com" ];
c.auto_save.session = True;
c.completion.use_best_match = True;
c.url.searchengines = { "DEFAULT":  "https://google.com/search?q={}" };
c.downloads.location.directory = "~/Downloads";
c.downloads.location.prompt = False;
c.downloads.remove_finished = 5000;
c.tabs.max_width = 400;

config.load_autoconfig();
