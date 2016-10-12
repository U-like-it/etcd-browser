
# etcd browser

## Demo
[http://henszey.github.io/etcd-browser/](http://henszey.github.io/etcd-browser/)

## Screen Shot
![etcd-browser Screen Shot](http://henszey.github.io/etcd-browser/images/etcdbrowser.png)

## TODO
* Implement missing features (TTL)

## To build/run as a Docker container:

(adjust options as necessary - to run it as a daemon, remove "--rm", "-t", "-i" and add "-D")

    cd <repository>
    sudo docker build -t etcd-browser .
    sudo docker run --rm --name etcd-browser -p 0.0.0.0:8000:8000 --env ETCD_HOST=10.10.0.1 --env AUTH_PASS=doe -t -i etcd-browser

### Configuration

Server side configuration reading from a yaml file, here is a sample

```yaml
listen: 8080
instances:
    etcd01:
        base: http://localhost:2379/v2/keys/
    etcd02:
        verify_ssl: false
        base: https://ssl_host:443/v2/keys/
```

by default, configuration file is loaded from ./config.yaml, it can be override
by environment variable `ETCD_BROWSER_CONFIG`
