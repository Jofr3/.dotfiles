c.url.default_page = "https://google.com";
c.url.start_pages = [ "https://google.com" ];
c.auto_save.session = True;
c.completion.use_best_match = True;
c.url.searchengines = { "DEFAULT":  "https://google.com/search?q={}" };
c.downloads.location.directory = "~/Downloads";
c.downloads.location.prompt = False;
c.downloads.remove_finished = 3000;
c.tabs.max_width = 400;
c.statusbar.widgets = [ "keypress", "search_match", "url", "progress" ];
c.tabs.indicator.width = 0;
c.tabs.position = "top";
c.statusbar.position = "top";
c.completion.height = "30%";

config.load_autoconfig();
