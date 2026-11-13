// Test-only guard: never allow external calls or opening a server.
const deny=()=>{throw Error('OFFLINE_NETWORK_FORBIDDEN');};
require('node:net').Socket.prototype.connect=deny;
require('node:net').Server.prototype.listen=deny;
for(const name of ['node:http','node:https']){require(name).request=deny;require(name).get=deny;}
global.fetch=deny;
