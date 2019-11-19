const q = require('q');
const net = require('net');
const config = require('./config-manager').config;
const { RpcClient } = require('./rpc');

config.common.dbCollections = [
    'leaderboard.power',
    'leaderboard.seasons',
    'leaderboard.world',
    'users.intents',
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
    'users.resources',
    'users.power_creeps'
];

config.common.storage = exports;

exports.db = {};
exports.queue = {};
exports.env = {
    keys: {
        ACCESSIBLE_ROOMS: 'accessibleRooms',
        ROOM_STATUS_DATA: 'roomStatusData',
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
        PUBLIC_MEMORY_SEGMENTS: 'publicMemorySegments:',
        ROOM_EVENT_LOG: 'roomEventLog:',
        ACTIVE_ROOMS: 'activeRooms',
        MAIN_LOOP_MIN_DURATION: 'tickRate'
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
    var rpcClient = new RpcClient(socket);

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


    function wrapCollection(collectionName) {
        var wrap = {};
        ['find', 'findOne','by','clear','count','ensureIndex','removeWhere','insert'].forEach(method => {
            wrap[method] = function() {
                return rpcClient.request('dbRequest', collectionName, method, Array.prototype.slice.call(arguments));
            }
        });
        wrap.update = resetInterceptor(function(query, update, params) {
            return rpcClient.request('dbUpdate', collectionName, query, update, params);
        });
        wrap.bulk = resetInterceptor(function(bulk) {
            return rpcClient.request('dbBulk', collectionName, bulk);
        });
        wrap.findEx = resetInterceptor(function(query, opts) {
            return rpcClient.request('dbFindEx', collectionName, query, opts);
        });
        return wrap;
    }

    config.common.dbCollections.forEach(i => exports.db[i] = wrapCollection(i));

    exports.resetAllData = () => rpcClient.request('dbResetAllData');

    Object.assign(exports.queue, {
        fetch: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueFetch')),
        add: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueAdd')),
        addMulti: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueAddMulti')),
        markDone: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueMarkDone')),
        whenAllDone: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueWhenAllDone')),
        reset: resetInterceptor(rpcClient.request.bind(rpcClient, 'queueReset'))
    });

    Object.assign(exports.env, {
        get: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvGet')),
        mget: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvMget')),
        set: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSet')),
        setex: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSetex')),
        expire: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvExpire')),
        ttl: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvTtl')),
        del: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvDel')),
        hmget: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHmget')),
        hmset: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHmset')),
        hget: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHget')),
        hset: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvHset')),
        sadd: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSadd')),
        smembers: resetInterceptor(rpcClient.request.bind(rpcClient, 'dbEnvSmembers')),
    });

    Object.assign(exports.pubsub, {
        publish: resetInterceptor(rpcClient.request.bind(rpcClient, 'publish')),
        subscribe(channel, cb) {
            rpcClient.subscribe(channel, cb);
        }
    });

    exports._connected = true;

    defer.resolve();

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
