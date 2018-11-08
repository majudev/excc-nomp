var fs = require('fs');
var path = require('path');
var os = require('os');
var cluster = require('cluster');

var async = require('async');
var extend = require('extend');

var PoolLogger = require('./libs/logUtil.js');
var CliListener = require('./libs/cliListener.js');
var PoolWorker = require('./libs/poolWorker.js');
var PaymentProcessor = require('./libs/paymentProcessor.js');
var Website = require('./libs/website.js');
var ProfitSwitch = require('./libs/profitSwitch.js');

var algos = require('stratum-pool/lib/algoProperties.js');

JSON.minify = JSON.minify || require("node-json-minify");

if (!fs.existsSync('config.json')){
    console.log('config.json file does not exist. Read the installation/setup instructions.');
    return;
}

var portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));
var poolConfig = portalConfig.pool;


var logger = new PoolLogger({
    logLevel: portalConfig.logLevel,
    logColors: portalConfig.logColors
});




try {
    require('newrelic');
    if (cluster.isMaster)
        logger.debug('NewRelic', 'Monitor', 'New Relic initiated');
} catch(e) {}


//Try to give process ability to handle 100k concurrent connections
try{
    var posix = require('posix');
    try {
        posix.setrlimit('nofile', { soft: 100000, hard: 100000 });
    }
    catch(e){
        if (cluster.isMaster)
            logger.warning('POSIX', 'Connection Limit', '(Safe to ignore) Must be ran as root to increase resource limits');
    }
    finally {
        // Find out which user used sudo through the environment variable
        var uid = parseInt(process.env.SUDO_UID);
        // Set our server's uid to that user
        if (uid) {
            process.setuid(uid);
            logger.debug('POSIX', 'Connection Limit', 'Raised to 100K concurrent connections, now running as non-root user: ' + process.getuid());
        }
    }
}
catch(e){
    if (cluster.isMaster)
        logger.debug('POSIX', 'Connection Limit', '(Safe to ignore) POSIX module not installed and resource (connection) limit was not raised');
}


if (cluster.isWorker){

    switch(process.env.workerType){
        case 'pool':
            new PoolWorker(logger);
            break;
        case 'paymentProcessor':
            new PaymentProcessor(logger);
            break;
        case 'website':
            new Website(logger);
            break;
    }

    return;
} 


var spawnPoolWorkers = function(){

    if (!Array.isArray(poolConfig.daemons) || poolConfig.daemons.length < 1){
        logger.error('Master', poolConfig.coin.name, 'No daemons configured so a pool cannot be started for this coin.');
        return;
    }

    var numForks = (function(){
        if (!portalConfig.clustering || !portalConfig.clustering.enabled)
            return 1;
        if (portalConfig.clustering.forks === 'auto')
            return os.cpus().length;
        if (!portalConfig.clustering.forks || isNaN(portalConfig.clustering.forks))
            return 1;
        return portalConfig.clustering.forks;
    })();

    var poolWorkers = {};

    var createPoolWorker = function(forkId){
        var worker = cluster.fork({
            workerType: 'pool',
            forkId: forkId,
            portalConfig: JSON.stringify(portalConfig)
        });
        worker.forkId = forkId;
        worker.type = 'pool';
        poolWorkers[forkId] = worker;
        worker.on('exit', function(code, signal){
            logger.error('Master', 'PoolSpawner', 'Fork ' + forkId + ' died, spawning replacement worker...');
            setTimeout(function(){
                createPoolWorker(forkId);
            }, 2000);
        }).on('message', function(msg){
            switch(msg.type){
                case 'banIP':
                    Object.keys(cluster.workers).forEach(function(id) {
                        if (cluster.workers[id].type === 'pool'){
                            cluster.workers[id].send({type: 'banIP', ip: msg.ip});
                        }
                    });
                    break;
            }
        });
    };

    var i = 0;
    var spawnInterval = setInterval(function(){
        createPoolWorker(i);
        i++;
        if (i === numForks){
            clearInterval(spawnInterval);
            logger.debug('Master', 'PoolSpawner', 'Spawned 1 pool on ' + numForks + ' thread(s)');
        }
    }, 250);

};


var startCliListener = function(){

    var cliPort = portalConfig.cliPort;

    var listener = new CliListener(cliPort);
    listener.on('log', function(text){
        logger.debug('Master', 'CLI', text);
    }).on('command', function(command, params, options, reply){

        switch(command){
            case 'blocknotify':
                Object.keys(cluster.workers).forEach(function(id) {
                    cluster.workers[id].send({type: 'blocknotify', coin: params[0], hash: params[1]});
                });
                reply('Pool workers notified');
                break;
            case 'coinswitch':
                processCoinSwitchCommand(params, options, reply);
                break;
            case 'reloadpool':
                Object.keys(cluster.workers).forEach(function(id) {
                    cluster.workers[id].send({type: 'reloadpool', coin: params[0] });
                });
                reply('reloaded pool ' + params[0]);
                break;
            default:
                reply('unrecognized command "' + command + '"');
                break;
        }
    }).start();
};


var startPaymentProcessor = function(){

    if (!(poolConfig.paymentProcessing && poolConfig.paymentProcessing.enabled))
        return;

    var worker = cluster.fork({
        workerType: 'paymentProcessor',
        portalConfig: JSON.stringify(portalConfig)
    });
    worker.on('exit', function(code, signal){
        logger.error('Master', 'Payment Processor', 'Payment processor died, spawning replacement...');
        setTimeout(function(){
            startPaymentProcessor(portalConfig);
        }, 2000);
    });
};


var startWebsite = function(){

    if (!portalConfig.website.enabled) return;

    var worker = cluster.fork({
        workerType: 'website',
        portalConfig: JSON.stringify(portalConfig)
    });
    worker.on('exit', function(code, signal){
        logger.error('Master', 'Website', 'Website process died, spawning replacement...');
        setTimeout(function(){
            startWebsite(portalConfig);
        }, 2000);
    });
};



(function init(){

    spawnPoolWorkers();

    startPaymentProcessor();

    startWebsite();

    startCliListener();

})();
