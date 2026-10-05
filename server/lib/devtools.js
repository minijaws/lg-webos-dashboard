/*
 * Keeps WebAppMgr's remote debugger (DevTools, port 9998) on the TV itself.
 *
 * Developer Mode opens it to the whole network with no login, and the root
 * keeps Developer Mode on: its boot script is what starts the Homebrew
 * Channel's startup.sh, so switching it off is not the fix. Every app under
 * /media/developer is inspectable, so anyone on the network can run code
 * inside one that is on screen - the Homebrew Channel, whose service runs as
 * root, or the dashboard app, which the server trusts without a token.
 *
 * A firewall rule drops the port on every interface but loopback. It lives in
 * memory only, so a reboot clears it and the server adds it again on start; a
 * TV that loses root reverts to stock behaviour. ssh -L 9998:localhost:9998
 * still reaches the debugger.
 *
 * Strict ES5 for Node 0.12.2 on webOS 4.
 */
var fs = require('fs');
var execFile = require('child_process').execFile;

var DEVMODE_FLAG = '/var/luna/preferences/devmode_enabled';
var RULE = ['INPUT', '-p', 'tcp', '--dport', '9998', '!', '-i', 'lo', '-j', 'DROP'];
var DIRS = ['/usr/sbin/', '/sbin/'];

function findTool(name) {
  for (var i = 0; i < DIRS.length; i++) {
    if (fs.existsSync(DIRS[i] + name)) return DIRS[i] + name;
  }
  return null;
}

// Checked first so a restart does not stack a second copy of the rule.
// A C1 (webOS 6) has ip6tables but no ip6_tables in its kernel, so both calls
// fail there and that family is skipped.
function blockWith(tool, cb) {
  execFile(tool, ['-C'].concat(RULE), { timeout: 5000 }, function (err) {
    if (!err) return cb(true);
    execFile(tool, ['-I'].concat(RULE), { timeout: 5000 }, function (err2) { cb(!err2); });
  });
}

// Calls back with the tools that now hold the rule.
function blockFromNetwork(cb) {
  cb = cb || function () {};
  if (!fs.existsSync(DEVMODE_FLAG)) return cb([]);
  var tools = ['iptables', 'ip6tables'].map(findTool).filter(Boolean);
  var held = [];
  (function next(i) {
    if (i >= tools.length) {
      if (!held.length) console.error('devtools: could not close port 9998 to the network');
      else console.log('devtools: port 9998 answers on the TV only');
      return cb(held);
    }
    blockWith(tools[i], function (ok) {
      if (ok) held.push(tools[i]);
      next(i + 1);
    });
  })(0);
}

module.exports = { blockFromNetwork: blockFromNetwork, RULE: RULE };
