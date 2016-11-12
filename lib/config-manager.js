const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const events = require('events')
const EventEmitter = events.EventEmitter
const config = {common: {
    constants: require('./constants')
}};

exports.load = function() {
    if(!process.env.MODFILE) {
        throw new Error('MODFILE environment variable is not set!');
    }
    var modsJsonFilename = path.resolve(process.cwd(), process.env.MODFILE);
    try {
        fs.statSync(modsJsonFilename);
    }
    catch(e) {
        console.log(`File "${modsJsonFilename}" not found`);
        return;
    }

    for(let moduleName in config) // Wrap all modules with an EventEmitter
        config[moduleName] = getEventEmitter(config[moduleName])

    try {
        var modsJson = require(modsJsonFilename);
        console.log(`Loading mods from "${modsJsonFilename}"`);
        if(!modsJson.mods) {
            return;
        }

        modsJson.mods.forEach(file => {
            file = path.resolve(path.dirname(modsJsonFilename), file);
            try {
                var mod = require(file);
                if(!_.isFunction(mod)) {
                    console.error(`Cannot load "${file}": module.exports is not a function!`);
                }
                else {
                    mod(config);
                    console.log(' - '+file);
                }
            }
            catch(e) {
                console.error(`Error loading "${file}": ${e.stack || e}`);
            }
        });
    }
    catch(e) {
        console.error(`Cannot open "${modsJsonFilename}": ${e}`);
    }
};

exports.config = config;

function getEventEmitter(base){
    let ee = new EventEmitter()
    let hooked = {}
    ee.on('newListener',(eventName,listener)=>{
        // This allows us to hook the event on first listener only
        if(hooked[eventName]) return
        hooked[eventName] = true
        let name = `on${eventName.slice(0,1).toUpperCase}${eventName.slice(1)}`
        let orig = base[name]
        base[name] = function(...args) {
            let def = true
            let event = { returnValue: null, preventDefault: ()=>def=false }
            ee.emit(event,eventName, ...args)
            if(def && orig) orig(...args)
            return event.returnValue
        }
    })
    return new Proxy(base,{
      get: (target,name)=>ee[name] || target[name]
    })
}