# GOTrade+

This repository is the full source code for https://gotrade.plus with an MIT license. 😎

- [MySQL DB structure](https://gist.github.com/Voyager451/246d7ad4d2edf28daf5ad06e29dec6be)

- [Full database data dump (gzipped)](https://drive.google.com/file/d/11BrHzp1BoQ_jqSpudmO8ZO2wrtqphAFu/view?usp=sharing) (April 23rd, 2020), containing **~800k trades**.

- Search engine is powered by  [Sphinx](http://sphinxsearch.com).
- [DigitalOcean Sphinx Installation Guide for Ubuntu](https://www.digitalocean.com/community/tutorials/how-to-install-and-configure-sphinx-on-ubuntu-16-04)

- Edit config file: `sudo nano /etc/sphinxsearch/sphinx.conf` :

```
source gotrade_plus
{
  type          = mysql

  sql_host      = localhost
  sql_user      = 
  sql_pass      = 
  sql_db        = 
  sql_port      = 3306

  sql_query     = \
  SELECT id,username,steamid,type,closed,link,have,want,time \
  FROM trades

  sql_attr_uint = type
  sql_attr_uint = closed
  sql_attr_string = username
  sql_attr_bigint = steamid
  sql_attr_string = link
  sql_field_string = have
  sql_field_string = want
  sql_attr_uint = time
}

index gotrade
{
  source            = gotrade_plus
  path              = /var/lib/sphinxsearch/data/gotrade
  docinfo           = extern
}

searchd
{
  listen            = 127.0.0.1:9306:mysql41
  log               = /var/log/sphinxsearch/searchd.log
  query_log         = /var/log/sphinxsearch/query.log
  read_timeout      = 5
  max_children      = 30
  pid_file          = /var/run/sphinxsearch/searchd.pid
  seamless_rotate   = 1
  preopen_indexes   = 1
  unlink_old        = 1
  binlog_path       = /var/lib/sphinxsearch/data
}
```

```
sudo service sphinxsearch start
sudo service sphinxsearch stop
sudo service sphinxsearch restart
```

- A cron-job indexes the searches from MySQL every 15 seconds (`sudo crontab -e`):
```
* * * * * /usr/bin/indexer --rotate --config /etc/sphinxsearch/sphinx.conf --all
* * * * * sleep 15; /usr/bin/indexer --rotate --config /etc/sphinxsearch/sphinx.conf --all
* * * * * sleep 30; /usr/bin/indexer --rotate --config /etc/sphinxsearch/sphinx.conf --all
* * * * * sleep 45; /usr/bin/indexer --rotate --config /etc/sphinxsearch/sphinx.conf --all
```