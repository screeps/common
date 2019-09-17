const q = require('q');
const net = require('net');
const path = require('path');
const _ = require('lodash');

exports.configManager = require('./lib/config-manager');
exports.storage = require('./lib/storage');
exports.rpc = require('./lib/rpc');

exports.findPort = function findPort(port) {
    var defer = q.defer();
    var server = net.createServer(socket => socket.end());
    server.listen(port, function (err) {
        server.once('close', function () {
            defer.resolve(port);
        });
        server.close();
    });
    server.on('error', function (err) {
        defer.resolve(findPort(port+1));
    });
    return defer.promise;
};

exports.encodeTerrain = function(terrain) {
    var result = '';
    for(var y=0; y<50; y++) {
        for(var x=0; x<50; x++) {
            var objects = _.filter(terrain, {x,y}),
            code = 0;
            if(_.any(objects, {type: 'wall'})) {
                code = code | 1;
            }
            if(_.any(objects, {type: 'swamp'})) {
                code = code | 2;
            }
            result = result + code;
        }
    }
    return result;
};

exports.decodeTerrain = function(str, room) {
    var result = [];

    for(var y=0; y<50; y++) {
        for(var x=0; x<50; x++) {
            var code = str.charAt(y*50+x);
            if(code & 1) {
                result.push({room, x, y, type: 'wall'});
            }
            if(code & 2) {
                result.push({room, x, y, type: 'swamp'});
            }
        }
    }

    return result;
};

exports.checkTerrain = function(terrain, x, y, mask) {
    return (parseInt(terrain.charAt(y*50 + x)) & mask) > 0;
};

exports.getGametime = function() {
    return exports.storage.env.get(exports.storage.env.keys.GAMETIME).then(data => parseInt(data));
};

exports.getDiff = function(oldData, newData) {

    function getIndex(data) {
        var index = {};
        _.forEach(data, (obj) => index[obj._id] = obj);
        return index;
    }


    var result = {},
    oldIndex = getIndex(oldData),
    newIndex = getIndex(newData);

    _.forEach(oldData, (obj) => {
        if(newIndex[obj._id]) {
            var newObj = newIndex[obj._id];
            var objDiff = result[obj._id] = {};
            for(var key in obj) {
                if(_.isUndefined(newObj[key])) {
                    objDiff[key] = null;
                }
                else if((typeof obj[key]) != (typeof newObj[key]) || obj[key] && !newObj[key]) {
                    objDiff[key] = newObj[key];
                }
                else if(_.isObject(obj[key])) {

                    objDiff[key] = {};

                    for (var subkey in obj[key]) {
                        if (!_.isEqual(obj[key][subkey], newObj[key][subkey])) {
                            objDiff[key][subkey] = newObj[key][subkey];
                        }
                    }
                    for (var subkey in newObj[key]) {
                        if (_.isUndefined(obj[key][subkey])) {
                            objDiff[key][subkey] = newObj[key][subkey];
                        }
                    }
                    if (!_.size(objDiff[key])) {
                        delete result[obj._id][key];
                    }
                }
                else if(!_.isEqual(obj[key], newObj[key])) {
                    objDiff[key] = newObj[key];
                }
            }
            for(var key in newObj) {
                if(_.isUndefined(obj[key])) {
                    objDiff[key] = newObj[key];
                }
            }
            if(!_.size(objDiff)) {
                delete result[obj._id];
            }
        }
        else {
            result[obj._id] = null;
        }
    });

    _.forEach(newData, (obj) => {
        if(!oldIndex[obj._id]) {
            result[obj._id] = obj;
        }
    });

    return result;
};

exports.qSequence = function(collection, fn) {
    return _.reduce(collection, (promise, element, key) => promise.then(() => fn(element,key)), q.when());
};

exports.roomNameToXY = function(name) {

    name = name.toUpperCase();

    var match = name.match(/^(\w)(\d+)(\w)(\d+)$/);
    if(!match) {
        return [undefined, undefined];
    }
    var [,hor,x,ver,y] = match;

    if(hor == 'W') {
        x = -x-1;
    }
    else {
        x = +x;
    }
    if(ver == 'N') {
        y = -y-1;
    }
    else {
        y = +y;
    }
    return [x,y];
};

exports.getRoomNameFromXY = function(x,y) {
    if(x < 0) {
        x = 'W'+(-x-1);
    }
    else {
        x = 'E'+(x);
    }
    if(y < 0) {
        y = 'N'+(-y-1);
    }
    else {
        y = 'S'+(y);
    }
    return ""+x+y;
}

exports.calcWorldSize = function(rooms) {
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    rooms.forEach(room => {
        var [x,y] = exports.roomNameToXY(room._id);
        if(x < minX) minX = x;
        if(y < minY) minY = y;
        if(x > maxX) maxX = x;
        if(y > maxY) maxY = y;
    });
    return Math.max(maxX - minX + 1, maxY - minY + 1);
};