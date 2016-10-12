var yaml = require("yamljs")
var url = require('url');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');

var config = load_config(process.env.ETCD_BROWSER_CONFIG || "./config.yaml");
var serverPort = process.env.SERVER_PORT || 8000;
var publicDir = 'frontend';
var authUser = process.env.AUTH_USER;
var authPass = process.env.AUTH_PASS;



var mimeTypes = {
  "html": "text/html",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "png": "image/png",
  "js": "text/javascript",
  "css": "text/css"
};


http.createServer(function serverFile(req, res) {
  // authenticaton
  if(!auth(req, res)) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="MyRealmName"');
    res.end('Unauthorized');
    return;
  }
  console.log(req.url);
  if(req.url === '/'){
    req.url = '/index.html';
  } else if(req.url == "/nodes") {
      return response_etcd_nodes(config, res);
  } else if(req.url.split("/")[2] === 'v2') {
    // avoid fileExists for /v2 routes
    return proxy(req, res);
  }
  var uri = url.parse(req.url).pathname;
  var filename = path.join(process.cwd(), publicDir, uri);

  fs.exists(filename, function(exists) {
    // proxy if file does not exist
    if(!exists) return proxy(req, res);

    // serve static file if exists
    res.writeHead(200, mimeTypes[path.extname(filename).split(".")[1]]);
    fs.createReadStream(filename).pipe(res);
  });
}).listen(config['listen'], function() {
  console.log('etc-browser listening on port ' + config['listen']);
});

function proxy(client_req, client_res) {
  var opts = getServerInfo(client_req, config);
  if(!opts) {
      client_res.writeHead(404, {'Content-Type': 'text/plain'})
      return client_res.end("Can not find this etcd host\n");
  }
  

  console.log("proxy to: " + opts.hostname + ":"  + opts.port + opts.path);
  client_req.pipe(opts.requestor(opts, function(res) {
    // if etcd returns that the requested  page  has been moved
    // to a different location, indicates that the node we are
    // querying is not the leader. This will redo the request
    // on the leader which is reported by the Location header
    if (res.statusCode === 307) {
        opts.hostname = url.parse(res.headers['location']).hostname;
        client_req.pipe(requester(opts, function(res) {
            console.log('Got response: ' + res.statusCode);
            res.pipe(client_res, {end: true});
        }, {end: true}));
    } else {
        res.pipe(client_res, {end: true});
    }
  }, {end: true}));
}


function auth(req, res) {
  if(!authUser) return true;

  var auth = req.headers.authorization;
  if(!auth) return false;

  // malformed
  var parts = auth.split(' ');
  if('basic' != parts[0].toLowerCase()) return false;
  if(!parts[1]) return false;
  auth = parts[1];

  // credentials
  auth = new Buffer(auth, 'base64').toString();
  auth = auth.match(/^([^:]*):(.*)$/);
  if(!auth) return false;
  return (auth[1] === authUser && auth[2] === authPass)
}

function getServerInfo(client_req, config){
    var path = client_req.url;
    var et = path.split("/")[1];
    if (!(et in config['instances'])) {
        console.log("can not find etcd host: " + et);
        return null;
    }
    config.instances[et].opts.path = path.replace("/" + et, "");
    config.instances[et].opts.method = client_req.method;
    return config.instances[et].opts;
}

function load_config(config) {
    var conf = yaml.load(config);
    for(var key in conf['instances']){
        var item = conf['instances'][key];
        item.opts = {}
        var uri = url.parse(item['base']);
        if(uri['protocol'] === "https:"){
            item.opts.requestor = https.request;
            if(!item.ca){
                if(item.verify_ssl == true){
                    throw("ssl ca is not set for etcd node: " + key);
                }else{
                    item.verify_ssl == false;
                }
            }else{
                if(item.verify_ssl == true){
                    item.opts.ca = fs.readFileSync(item.ca);
                }
            }

            if(item.cert ^ item.key){
                throw("cert or key missing for etcd node: " + key);
            }
            if(item.cert){
                item.opts.key =fs.readFileSync(item.key);
                item.opts.cert =fs.readFileSync(item.cert);
            }
            item.opts.rejectUnauthorized = item.verify_ssl || false;

        }else if(uri['protocol'] == "http:"){
            item.opts.requestor = http.request;
        }else{
            throw("Unknow protocol: " + uri.protocol);
        }
        item.opts.hostname = uri.hostname;
        item.opts.port = uri.port;
    }
    return conf;
}


function response_etcd_nodes(config, res){
    // return configured etcd nodes
    nodes = etcd_nodes(config);
    res.writeHead(200, {'Content-Type': 'application/json'})
    return res.end(JSON.stringify({"nodes": nodes}));
}

function etcd_nodes(config){
    nodes = []
    for (var key in config.instances) {
        nodes.push({"name": key, "base": config.instances[key].base})
    }
    return nodes
}
