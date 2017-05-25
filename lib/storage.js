const dnode = require('dnode');
const q = require('q');
const net = require('net');
const config = require('./config-manager').config;

config.common.dbCollections = [
    'leaderboard.power',
    'leaderboard.seasons',
    'leaderboard.world',
    'market.intents',
    'market.orders',
    'market.stats',
    'rooms',
    'rooms.objects',
    'rooms.flags',
    'rooms.intents',
    'rooms.terrain',
    'transactions',
    'users',
    'users.code',
    'users.console',
    'users.messages',
    'users.money',
    'users.notifications',
    'users.resources'
];

config.common.storage = exports;

exports.db = {};
exports.queue = {};
exports.env = {
    keys: {
        ACCESSIBLE_ROOMS: 'accessibleRooms',
        MEMORY: 'memory:',
        GAMETIME: 'gameTime',
        MAP_VIEW: 'mapView:',
        TERRAIN_DATA: 'terrainData',
        SCRIPT_CACHED_DATA: 'scriptCachedData:',
        USER_ONLINE: 'userOnline:',
        MAIN_LOOP_PAUSED: 'mainLoopPaused',
        ROOM_HISTORY: 'roomHistory:',
        ROOM_VISUAL: 'roomVisual:',
        MEMORY_SEGMENTS: 'memorySegments:',
        PUBLIC_MEMORY_SEGMENTS: 'publicMemorySegments:'
    }
};
exports.pubsub = {
    keys: {
        QUEUE_DONE: 'queueDone:',
        RUNTIME_RESTART: 'runtimeRestart',
        TICK_STARTED: "tickStarted",
        ROOMS_DONE: "roomsDone"
    }
};

exports._connect = function storageConnect() {

    if(exports._connected) {
        return q.when();
    }

    if(!process.env.STORAGE_PORT) {
        throw new Error('STORAGE_PORT environment variable is not set!');
    }

    console.log('Connecting to storage');

    var socket = net.connect(process.env.STORAGE_PORT, process.env.STORAGE_HOST);
    var d = dnode();
    socket.pipe(d).pipe(socket);

    var defer = q.defer();
    var resetDefer = q.defer();

    function resetInterceptor(fn) {
        /*return function() {
            var promise = fn.apply(null, Array.prototype.slice.call(arguments));
            return q.any([promise, resetDefer.promise])
            .then(result => result === 'reset' ? q.reject('Storage connection lost') : result);
        }*/
        // TODO
        return fn;
    }

    d.on('remote', remote => {

        function wrapCollection(collectionName) {
            var wrap = {};
            ['find', 'findOne','by','clear','count','ensureIndex','removeWhere','insert'].forEach(method => {
                wrap[method] = function() {
                    return q.ninvoke(remote, 'dbRequest', collectionName, method, Array.prototype.slice.call(arguments));
                }
            });
            wrap.update = resetInterceptor(function(query, update, params) {
                return q.ninvoke(remote, 'dbUpdate', collectionName, query, update, params);
            });
            wrap.bulk = resetInterceptor(function(bulk) {
                return q.ninvoke(remote, 'dbBulk', collectionName, bulk);
            });
            wrap.findEx = resetInterceptor(function(query, opts) {
                return q.ninvoke(remote, 'dbFindEx', collectionName, query, opts);
            });
            return wrap;
        }

        config.common.dbCollections.forEach(i => exports.db[i] = wrapCollection(i));

        exports.resetAllData = () => q.ninvoke(remote, 'dbResetAllData');

        Object.assign(exports.queue, {
            fetch: resetInterceptor(q.nbind(remote.queueFetch, remote)),
            add: resetInterceptor(q.nbind(remote.queueAdd, remote)),
            addMulti: resetInterceptor(q.nbind(remote.queueAddMulti, remote)),
            markDone: resetInterceptor(q.nbind(remote.queueMarkDone, remote)),
            whenAllDone: resetInterceptor(q.nbind(remote.queueWhenAllDone, remote)),
            reset: resetInterceptor(q.nbind(remote.queueReset, remote))
        });

        Object.assign(exports.env, {
            get: resetInterceptor(q.nbind(remote.dbEnvGet, remote)),
            mget: resetInterceptor(q.nbind(remote.dbEnvMget, remote)),
            set: resetInterceptor(q.nbind(remote.dbEnvSet, remote)),
            setex: resetInterceptor(q.nbind(remote.dbEnvSetex, remote)),
            expire: resetInterceptor(q.nbind(remote.dbEnvExpire, remote)),
            ttl: resetInterceptor(q.nbind(remote.dbEnvTtl, remote)),
            del: resetInterceptor(q.nbind(remote.dbEnvDel, remote)),
            hmget: resetInterceptor(q.nbind(remote.dbEnvHmget, remote)),
            hmset: resetInterceptor(q.nbind(remote.dbEnvHmset, remote)),
            hget: resetInterceptor(q.nbind(remote.dbEnvHget, remote)),
            hset: resetInterceptor(q.nbind(remote.dbEnvHset, remote))
        });

        Object.assign(exports.pubsub, {
            publish: resetInterceptor(q.nbind(remote.publish, remote)),
            subscribe: (channel, cb) => remote.subscribe(channel, cb)
        });

        exports._connected = true;

        defer.resolve();
    });

    socket.on('error', err => {
        console.error('Storage connection lost', err);
        resetDefer.resolve('reset');
        exports._connected = false;
        setTimeout(exports._connect, 1000);
    });
    socket.on('end', () => {
        console.error('Storage connection lost');
        resetDefer.resolve('reset');
        exports._connected = false;
        setTimeout(exports._connect, 1000)
    });

    return defer.promise;
};