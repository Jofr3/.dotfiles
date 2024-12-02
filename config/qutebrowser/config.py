c.url.default_page = "https://google.com";
c.url.start_pages = [ "https://google.com" ];
c.auto_save.session = True;
c.completion.use_best_match = True;
c.url.searchengines = { 'DEFAULT':  'https://google.com/search?q={}' }

config.load_autoconfig();
