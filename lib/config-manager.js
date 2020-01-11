const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const config = {common: {
    constants: require('./constants'),
    strongholds: require('./strongholds'),
    system: require('./system'),
    bots: {}
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

        if(modsJson.bots) {
            config.common.bots = _.mapValues(modsJson.bots, i => path.resolve(path.dirname(modsJsonFilename), i));
        }
    }
    catch(e) {
        console.error(`Cannot open "${modsJsonFilename}": ${e}`);
    }
};

exports.config = config;
