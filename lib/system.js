const _ = require('lodash'),
    C = require('./constants');

const transforms = {
    'string': value => "" + value,
    'number': parseInt,
    'boolean': value => !!value,
    'price': value => parseInt((1000 * value).toFixed(0)),
    'string[]': value => _.isArray(value) ? _.map(value, i => "" + i) : undefined,
    'number[]': value => _.isArray(value) ? _.map(value, i => parseInt(i)) : undefined,
    'bodypart[]': value => _.filter(value, i => _.contains(C.BODYPARTS_ALL, i)),
    'userString': value => ("" + (value||"")).substring(0, 100),
    'userText': value => ("" + (value||"")).substring(0, 1000)
};

const intentTypes = {
    notify: { message: 'userText', groupInterval: 'number' },
    createConstructionSite: { roomName: 'string', x: 'number', y: 'number', structureType: 'string', name: 'userString' },
    createFlag: { roomName: 'string', x: 'number', y: 'number', name: 'userString', color: 'number', secondaryColor: 'number' },
    destroyStructure: { roomName: 'string', id: 'string' },
    removeConstructionSite: { roomName: 'string', id: 'string' },
    removeFlag: { roomName: 'string', name: 'userString' },
    cancelOrder: { orderId: 'string' },
    changeOrderPrice: { orderId: 'string', newPrice: 'price' },
    createOrder: { type: 'string', resourceType: 'string', price: 'price', totalAmount: 'number', roomName: 'string' },
    createPowerCreep: { name: 'userString', className: 'string' },
    deal: { orderId: 'string', amount: 'number', targetRoomName: 'string' },
    deletePowerCreep: { id: 'string', cancel: 'boolean' },
    extendOrder: { orderId: 'string', addAmount: 'number' },
    renamePowerCreep: { id: 'string', name: 'userString' },
    spawnPowerCreep: { id: 'string', name: 'userString' },
    suicidePowerCreep: { id: 'string' },
    upgradePowerCreep: { id: 'string', power: 'number' },
    activateSafeMode: {},
    attack: { id: 'string', x: 'number', y: 'number' },
    attackController: { id: 'string' },
    boostCreep: { id: 'string', bodyPartsCount: 'number' },
    build: { id: 'string', x: 'number', y: 'number' },
    cancelSpawning: {},
    claimController: { id: 'string' },
    createCreep: { name: 'userString', body: 'bodypart[]', energyStructures: 'string[]', directions: 'number[]'},
    destroy: {},
    dismantle: { id: 'string' },
    drop: { amount: 'number', resourceType: 'string' },
    enableRoom: { id: 'string' },
    generateSafeMode: { id: 'string' },
    harvest: { id: 'string' },
    heal: { id: 'string', x: 'number', y: 'number' },
    launchNuke: { x: 'number', y: 'number', roomName: 'string' },
    move: { id: 'string', direction: 'number' },
    notifyWhenAttacked: { enabled: 'boolean' },
    observeRoom: { roomName: 'string' },
    pickup: { id: 'string' },
    processPower: {},
    produce: { resourceType: 'string', amount: 'number' },
    pull: { id: 'string' },
    rangedAttack: { id: 'string' },
    rangedHeal: { id: 'string' },
    rangedMassAttack: {},
    recycleCreep: { id: 'string' },
    renew: { id: 'string' },
    renewCreep: { id: 'string' },
    reverseReaction: { lab1: 'string', lab2: 'string' },
    runReaction: { lab1: 'string', lab2: 'string' },
    remove: {},
    repair: { id: 'string', x: 'number', y: 'number' },
    reserveController: { id: 'string' },
    say: { message: 'userString', isPublic: 'boolean' },
    send: { targetRoomName: 'string', resourceType: 'string', amount: 'number', description: 'userString' },
    setColor: { color: 'number', secondaryColor: 'number' },
    setPosition: { x: 'number', y: 'number', roomName: 'string' },
    setPublic: { isPublic: 'boolean' },
    setSpawnDirections: { directions: 'number[]' },
    signController: { id: 'string', sign: 'userString'},
    suicide: {},
    transfer: { id: 'string', amount: 'number', resourceType: 'string' },
    unboostCreep: { id: 'string' },
    unclaim: {},
    upgradeController: { id: 'string' },
    usePower: { power: 'number', id: 'string' },
    withdraw: { id: 'string', amount: 'number', resourceType: 'string' }
};

const sanitizeIntent = function sanitizeIntent(name, intent, customIntentTypes = {}) {
    const result = {};

    const intentType = intentTypes[name] || customIntentTypes[name];
    for(let field in intentType) {
        result[field] = transforms[intentType[field]](intent[field]);
    }

    return result;
};

exports.sanitizeUserIntents = function sanitizeUserIntents(input, customIntentTypes = {}) {
    const intentResult = {};
    for(let name in intentTypes) {
        if(input[name]) {
            intentResult[name] = _.isArray(input[name]) ?
                _.map(input[name], i => sanitizeIntent(name, i)) :
                sanitizeIntent(name, input[name], customIntentTypes);
        }
    }

    for(let name in customIntentTypes) {
        if(input[name]) {
            intentResult[name] = _.isArray(input[name]) ?
                _.map(input[name], i => sanitizeIntent(name, i, customIntentTypes)) :
                sanitizeIntent(name, input[name], customIntentTypes);
        }
    }

    return intentResult;
};

exports.sanitizeUserRoomIntents = function sanitizeUserRoomIntents(input, result, customIntentTypes = {}, groupingField = 'roomName') {
    for(let name in intentTypes) {
        if(input[name]) {
            for(let intent of input[name]) {
                const sanitized = sanitizeIntent(name, intent);
                const groupingValue = sanitized[groupingField];
                const roomNameResult = result[groupingValue] = result[groupingValue] || {};
                const roomResult = roomNameResult.room = roomNameResult.room || {};
                (roomResult[name] = roomResult[name] || []).push(sanitized);
            }
        }
    }

    for(let name in customIntentTypes) {
        if(input[name]) {
            for(let intent of input[name]) {
                const sanitized = sanitizeIntent(name, intent, customIntentTypes);
                const groupingValue = sanitized[groupingField];
                const roomNameResult = result[groupingValue] = result[groupingValue] || {};
                const roomResult = roomNameResult.room = roomNameResult.room || {};
                (roomResult[name] = roomResult[name] || []).push(sanitized);
            }
        }
    }
};
